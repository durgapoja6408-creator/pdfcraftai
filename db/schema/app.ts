/**
 * Application-level tables.
 * - files:         metadata-only — raw uploads + tool-produced result entries.
 *                  Actual bytes are not stored server-side in Phase 3; we log
 *                  the metadata so signed-in users see their history.
 * - apiKeys:       scaffolded stub — creation/rotation arrives in a later phase.
 * - credits:       per-user credit balance.
 * - creditLedger:  append-only log of credit deltas. Optionally linked to a
 *                  `payments` row so grants are traceable to their origin.
 * - payments:      provider-neutral record of every checkout we initiate.
 *                  Internal `id` is the portability anchor — `providerRef`
 *                  is metadata, swappable across providers.
 * - subscriptions: provider-neutral record of recurring billing state.
 * - webhookEvents: audit log of every webhook we verify, scrubbed of card data.
 * - chatSessions / chatMessages: Phase 5 Chat-with-PDF conversation storage.
 *                  `providerId` and `model` on messages are informational —
 *                  the app layer never switches providers mid-session.
 * - aiOutputs:     Phase 5.1 per-file AI artifact storage. Keeps generated
 *                  markdown (summary / translation / OCR result) off the
 *                  narrow `files` table. One-to-one with files.id; the file
 *                  row gives you listing + auth, the ai_outputs row gives
 *                  you the rendered content.
 * - userMacros:    Phase 6.1 saved parameter sets for AI tools. Each row is
 *                  one user's named preset for one tool (e.g. "Spanish
 *                  translations" → {targetLang: "es"}). Currently scoped
 *                  to ai-summarize + ai-translate because those are the
 *                  only tools with user-facing parameters today.
 */

import {
  mysqlTable,
  varchar,
  int,
  bigint,
  text,
  mediumtext,
  timestamp,
  date,
  index,
  uniqueIndex,
  mysqlEnum,
  json,
} from "drizzle-orm/mysql-core";
import { users } from "./auth";

export const files = mysqlTable(
  "files",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 512 }).notNull(),
    mime: varchar("mime", { length: 128 }).notNull().default("application/pdf"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    sha256: varchar("sha256", { length: 64 }),
    // Phase 2 stub: no storage key yet. Filled in when real uploads land.
    storageKey: varchar("storage_key", { length: 512 }),
    status: mysqlEnum("status", ["pending", "ready", "error"])
      .notNull()
      .default("pending"),
    // Phase 3: distinguish raw uploads from tool-produced results.
    source: mysqlEnum("source", ["upload", "tool"]).notNull().default("upload"),
    // For source = 'tool', the tool registry id (e.g. "merge", "split", "rotate", "compress").
    toolId: varchar("tool_id", { length: 64 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("files_user_idx").on(t.userId),
    createdIdx: index("files_created_idx").on(t.createdAt),
    sourceIdx: index("files_source_idx").on(t.source),
  })
);

export const apiKeys = mysqlTable(
  "api_keys",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 128 }).notNull(),
    // We only ever store the hash; the raw key is shown once at creation.
    keyHash: varchar("key_hash", { length: 128 }).notNull().unique(),
    prefix: varchar("prefix", { length: 12 }).notNull(),
    lastUsedAt: timestamp("last_used_at", { fsp: 3 }),
    revokedAt: timestamp("revoked_at", { fsp: 3 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("api_keys_user_idx").on(t.userId),
  })
);

export const credits = mysqlTable(
  "credits",
  {
    userId: varchar("user_id", { length: 255 })
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    balance: int("balance").notNull().default(0),
    updatedAt: timestamp("updated_at", { fsp: 3 }).notNull().defaultNow(),
  }
);

export const creditLedger = mysqlTable(
  "credit_ledger",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    delta: int("delta").notNull(),
    reason: varchar("reason", { length: 64 }).notNull(),
    note: text("note"),
    // Phase 4: link credit grants to the payment that funded them. Nullable
    // so non-payment entries (manual grants, usage debits, promo credits)
    // still fit. ON DELETE SET NULL so historical ledger rows survive if
    // a payment row is ever hard-deleted (we don't, but defensive).
    paymentId: varchar("payment_id", { length: 36 }),
    // Idempotency key. For webhook-driven grants we set this to the
    // internal paymentId + event kind so retrying the same webhook is a
    // no-op at the ledger layer. Unique across the table.
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("credit_ledger_user_idx").on(t.userId),
    paymentIdx: index("credit_ledger_payment_idx").on(t.paymentId),
    idempotencyIdx: uniqueIndex("credit_ledger_idempotency_idx").on(t.idempotencyKey),
  })
);

// --- Phase 4: payments + subscriptions ------------------------------------

/**
 * Every checkout we initiate gets a row here — BEFORE we call the
 * provider. The `id` is a UUID we mint ourselves and keep forever;
 * `providerRef` is the provider's order/payment ID and is treated as
 * metadata. This split is what makes provider migration safe: if we
 * ever swap Razorpay for a successor, the primary key stays.
 *
 * `mode` distinguishes one-time credit packs from subscription plans.
 * `packId` is populated for one-time, `planCode` for subscriptions —
 * mutually exclusive. `subscriptionId` is a soft FK to `subscriptions`
 * for the renewal payments of a recurring plan.
 */
export const payments = mysqlTable(
  "payments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: varchar("provider_id", { length: 32 }).notNull(),
    // Null until the provider mints their reference in createCheckout.
    providerRef: varchar("provider_ref", { length: 128 }),
    mode: mysqlEnum("mode", ["one_time", "subscription"]).notNull(),
    status: mysqlEnum("status", [
      "pending",
      "captured",
      "failed",
      "refunded",
      "partial_refund",
      "cancelled",
    ])
      .notNull()
      .default("pending"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    // Populated for mode = 'one_time'.
    packId: varchar("pack_id", { length: 32 }),
    // Populated for mode = 'subscription'.
    planCode: varchar("plan_code", { length: 64 }),
    // For subscription renewal payments, ties back to the parent subscription.
    subscriptionId: varchar("subscription_id", { length: 36 }),
    // Free-form metadata echoed back from the provider — JSON blob. Must
    // be scrubbed of any PAN/CVV-looking values before it lands here.
    metadata: json("metadata"),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (t) => ({
    userIdx: index("payments_user_idx").on(t.userId),
    providerIdx: index("payments_provider_idx").on(t.providerId),
    statusIdx: index("payments_status_idx").on(t.status),
    // Unique on (providerId, providerRef) — a given provider never reuses
    // refs. Nullable providerRef rows don't conflict because MySQL treats
    // NULLs as distinct in unique indexes.
    providerRefIdx: uniqueIndex("payments_provider_ref_idx").on(
      t.providerId,
      t.providerRef
    ),
    createdIdx: index("payments_created_idx").on(t.createdAt),
  })
);

/**
 * Recurring billing state. One row per active/past subscription. Renewal
 * payments are recorded in `payments` with `subscriptionId` set back to
 * this row.
 */
export const subscriptions = mysqlTable(
  "subscriptions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: varchar("provider_id", { length: 32 }).notNull(),
    providerRef: varchar("provider_ref", { length: 128 }).notNull(),
    planCode: varchar("plan_code", { length: 64 }).notNull(),
    status: mysqlEnum("status", [
      "pending",
      "active",
      "paused",
      "cancelled",
      "failed",
    ])
      .notNull()
      .default("pending"),
    currentPeriodStart: timestamp("current_period_start", { fsp: 3 }),
    currentPeriodEnd: timestamp("current_period_end", { fsp: 3 }),
    cancelledAt: timestamp("cancelled_at", { fsp: 3 }),
    metadata: json("metadata"),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (t) => ({
    userIdx: index("subscriptions_user_idx").on(t.userId),
    providerRefIdx: uniqueIndex("subscriptions_provider_ref_idx").on(
      t.providerId,
      t.providerRef
    ),
    statusIdx: index("subscriptions_status_idx").on(t.status),
  })
);

/**
 * Audit log of every webhook we verify. Stored per-event so we can
 * replay/debug; the signature check happens BEFORE insert so nothing
 * unverified reaches this table. `rawPayload` is the scrubbed JSON —
 * PAN/CVV regex-stripped at the adapter boundary.
 *
 * Unique on (providerId, providerEventId) so replayed webhooks from the
 * provider become cheap duplicates, not double-grants.
 */
export const webhookEvents = mysqlTable(
  "webhook_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    providerId: varchar("provider_id", { length: 32 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 128 }).notNull(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    // Our normalized kind (payment_captured, refund, ...) or "ignored".
    normalizedKind: varchar("normalized_kind", { length: 64 }).notNull(),
    paymentId: varchar("payment_id", { length: 36 }),
    rawPayload: json("raw_payload"),
    receivedAt: timestamp("received_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (t) => ({
    providerEventIdx: uniqueIndex("webhook_events_provider_event_idx").on(
      t.providerId,
      t.providerEventId
    ),
    paymentIdx: index("webhook_events_payment_idx").on(t.paymentId),
    receivedIdx: index("webhook_events_received_idx").on(t.receivedAt),
  })
);

// --- Phase 5: Chat with PDF ------------------------------------------

/**
 * One row per chat conversation. Scoped to a user and, optionally, a
 * file (every "Chat with PDF" session points at the file it grew out
 * of; freeform chat without a PDF is allowed but not yet exposed in
 * the UI).
 *
 * `providerId` / `model` are captured when the session is first used
 * so the UI can label conversations ("chat with Claude about X.pdf").
 * We never auto-switch providers mid-session — the app layer treats
 * these as immutable after the first message.
 *
 * `archivedAt` is a soft-delete: the session list filters on it so
 * users can restore, but the rows stay for audit.
 */
export const chatSessions = mysqlTable(
  "chat_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Optional — null means "freeform chat, no attached PDF". When set,
    // this is the file the user opened when starting the session.
    // ON DELETE SET NULL so deleting the file doesn't wipe the chat.
    fileId: varchar("file_id", { length: 36 }),
    title: varchar("title", { length: 256 }).notNull().default("New chat"),
    // First provider/model the session used. Informational, not enforced.
    providerId: varchar("provider_id", { length: 32 }),
    model: varchar("model", { length: 128 }),
    archivedAt: timestamp("archived_at", { fsp: 3 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (t) => ({
    userIdx: index("chat_sessions_user_idx").on(t.userId),
    fileIdx: index("chat_sessions_file_idx").on(t.fileId),
    updatedIdx: index("chat_sessions_updated_idx").on(t.updatedAt),
  })
);

/**
 * One row per turn in a session. `role` follows the shared OpenAI/
 * Anthropic convention: "system" is rare (only used to persist custom
 * prompts per session); "user" and "assistant" alternate.
 *
 * Cost accounting columns are nullable:
 *   - User / system messages have no cost.
 *   - Assistant messages carry tokensIn, tokensOut, stopReason,
 *     creditCost, providerId, model — everything an audit needs to
 *     verify the ledger debit.
 *
 * `idempotencyKey` is the safety net for our chat endpoint. When a
 * client retries a request (network flap, user double-click), we look
 * up the key and return the existing assistant row instead of spending
 * credits twice. Unique index enforces that at the DB level — even a
 * race between two request handlers can only produce one assistant row.
 */
export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    sessionId: varchar("session_id", { length: 36 })
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["system", "user", "assistant"]).notNull(),
    content: text("content").notNull(),
    providerId: varchar("provider_id", { length: 32 }),
    model: varchar("model", { length: 128 }),
    tokensIn: int("tokens_in"),
    tokensOut: int("tokens_out"),
    stopReason: varchar("stop_reason", { length: 32 }),
    creditCost: int("credit_cost"),
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("chat_messages_session_idx").on(t.sessionId),
    sessionCreatedIdx: index("chat_messages_session_created_idx").on(
      t.sessionId,
      t.createdAt
    ),
    // Unique so retries collapse to a single assistant row. Nullable
    // column — MySQL treats NULLs as distinct, so user/system rows
    // without a key don't conflict.
    idempotencyIdx: uniqueIndex("chat_messages_idempotency_idx").on(
      t.idempotencyKey
    ),
  })
);

// --- Phase 5.1: AI-generated file outputs ----------------------------

/**
 * One-to-one companion to `files` for AI operations that produce text
 * (summary, translation, OCR). The `files` row carries listing metadata
 * (name, mime, size, sha256, source='tool', toolId='ai-summarize'…) —
 * this row carries the rendered markdown.
 *
 * Why a separate table instead of a nullable `content` column on files:
 *   - files stays narrow; text columns on a row-heavy table hurt scans.
 *   - Only AI-generated files have content; 99%+ of rows would be NULL.
 *   - Clean extensibility: when translate/OCR land we just add a `kind`
 *     enum variant; no schema change.
 *
 * `kind` is the operation that produced the file. Matches the
 * `AIOperationId` subset that writes artifacts to /app/files.
 * Phase 5.3 adds 'comparison' — note the kind is 'comparison' not
 * 'compare' so the enum value reads like a noun (matching 'summary' /
 * 'translation' / 'ocr') rather than a verb.
 *
 * `meta` is a JSON blob of provenance (provider, model, tokens, depth
 * for summaries, target language for translations, page-level confidence
 * for OCR). Free-form because each op stores different fields; shape
 * documented per-op in docs/ai/architecture.md.
 *
 * PK on fileId enforces the 1:1 relationship and makes every read keyed.
 * ON DELETE CASCADE means a file deletion wipes its content automatically.
 *
 * Phase 5.5 adds `idempotencyKey`. Same pattern as chat_messages: the
 * client generates one UUID per submit and sends it with every retry.
 * The unique index lets /api/ai/{summarize,translate,compare,ocr} short-
 * circuit duplicate submissions to a replay path — return the already-
 * stored markdown instead of re-spending credits and re-calling the
 * provider. Column is nullable because:
 *   1. Pre-5.5 rows have no key and must keep loading.
 *   2. MySQL treats NULLs as distinct under a unique index, so those
 *      legacy rows don't collide with each other or with live ones.
 * Migration: `ALTER TABLE ai_outputs
 *              ADD COLUMN idempotency_key VARCHAR(128) NULL,
 *              ADD UNIQUE INDEX ai_outputs_idempotency_idx (idempotency_key);`
 */
export const aiOutputs = mysqlTable(
  "ai_outputs",
  {
    fileId: varchar("file_id", { length: 36 })
      .primaryKey()
      .references(() => files.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", [
      "summary",
      "translation",
      "ocr",
      "comparison",
      // Phase 5.6 — five new AI tools. Migration: 0003_extend_ai_output_kinds.sql
      "rewrite",
      "table",
      "redaction",
      "generation",
      "signing",
    ]).notNull(),
    // Rendered markdown. `mediumtext` = 16MB, chosen in Phase 5.2 when
    // chunked translation shipped — translated output can be up to 1.5×
    // the source, and a 600k-char source can exceed the 64KB `text`
    // ceiling. Upgrading is forward-compatible: `mediumtext` stores
    // everything `text` could. Migration is a single
    // `ALTER TABLE ai_outputs MODIFY content_md mediumtext NOT NULL;`.
    contentMd: mediumtext("content_md").notNull(),
    meta: json("meta"),
    // Phase 5.5. Scoped globally (not per-user) because the client key is
    // a UUID — collisions across users are vanishingly unlikely, and the
    // lookup helper still filters by userId to prevent cross-tenant
    // replay. Unique index enforces at-most-one ai_outputs row per key
    // even under concurrent retries.
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (t) => ({
    kindIdx: index("ai_outputs_kind_idx").on(t.kind),
    createdIdx: index("ai_outputs_created_idx").on(t.createdAt),
    // Nullable column — MySQL's unique index permits multiple NULLs, so
    // pre-5.5 rows without a key don't conflict with each other.
    idempotencyIdx: uniqueIndex("ai_outputs_idempotency_idx").on(t.idempotencyKey),
  })
);

/**
 * Phase A1 (MASTER_PLAN §6 task #83 + §7 gate #3). Per-AI-call audit log.
 *
 * Where `aiOutputs` stores the *rendered artifact* (markdown summary, OCR
 * result, generated doc) for display back to the user, `aiUsage` stores
 * the *metering* — every AI invocation, whether it returned a user-facing
 * artifact or not (e.g. a chat_turn that errored out still needs a row so
 * the margin rollup sees the cost).
 *
 * Design notes:
 *   - `operation` is a free varchar rather than a MySQL enum. The source
 *     of truth is `AIOperationId` in `lib/pricing.ts`; keeping it flexible
 *     here means adding a new op in the next phase doesn't need a migration.
 *   - `providerId` / `model` capture which adapter + which model served
 *     the call, so the margin rollup can slice cost by provider and
 *     spot a routing regression early.
 *   - `inputTokens` / `outputTokens` are `int` (4GB max row count per
 *     user is not a concern) but capped to ensure non-negative writes.
 *   - `costMicros` = provider cost in USD × 1e6 (bigint, can be null if
 *     we haven't wired per-model rate cards yet — see
 *     docs/ai/MARGIN_VERIFICATION.md v3 table).
 *   - `creditsSpent` mirrors the debit on `creditLedger` so the rollup
 *     doesn't need to join to `credits` tables. Refund path sets a
 *     negative row (not in scope this migration — see Phase A4).
 *   - `ledgerId` nullable FK to `credit_ledger.id` links this usage row
 *     to its debit ledger entry for audit traceability. Null when the
 *     call pre-dates the FK (should never happen going forward) or when
 *     the op didn't spend credits (not expected today).
 *   - `success` + `errorCode` are split so a boolean index can answer
 *     "what's our error rate this hour?" without scanning text values.
 *   - `idempotencyKey` matches the key passed to `spendCredits`, so a
 *     retried request collapses to one usage row too — unique index.
 *
 * Indexes:
 *   - (userId, createdAt) — per-user usage history page.
 *   - (createdAt) — global daily rollup window.
 *   - (providerId, createdAt) — provider-level cost slice.
 *   - (success) — error-rate monitoring.
 *
 * Migration: `db/migrations/0005_ai_usage.sql`.
 */
export const aiUsage = mysqlTable(
  "ai_usage",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    operation: varchar("operation", { length: 32 }).notNull(),
    providerId: varchar("provider_id", { length: 32 }).notNull(),
    model: varchar("model", { length: 128 }).notNull(),
    inputTokens: int("input_tokens").notNull().default(0),
    outputTokens: int("output_tokens").notNull().default(0),
    // Anthropic prompt-cache token buckets (Task #10).
    // Nullable because: (a) non-Anthropic providers never report these,
    // and (b) historical rows pre-migration 0007 have no data. Null ≠ 0:
    // null means "cache not applicable"; 0 means "cache applied, nothing
    // hit". The margin rollup and admin dashboard both depend on that
    // distinction to measure cache-hit rate honestly.
    // Migration: `db/migrations/0007_ai_usage_cache_cols.sql`.
    cachedInputTokens: int("cached_input_tokens"),
    cacheCreationInputTokens: int("cache_creation_input_tokens"),
    latencyMs: int("latency_ms").notNull().default(0),
    creditsSpent: int("credits_spent").notNull().default(0),
    // USD * 1e6. Nullable until per-model rate cards are wired (Phase A4).
    costMicros: bigint("cost_micros", { mode: "number" }),
    success: int("success").notNull().default(1), // 1 = ok, 0 = error (MySQL has no native bool)
    // Task #11 truncation observability (migration 0008). `stopReason` is
    // the raw provider-reported terminal reason ("end_turn",
    // "max_tokens", "stop_sequence", etc. — free-form across providers).
    // `responseTruncated` is a computed flag: 1 when the response hit
    // the output cap, 0 when it terminated naturally, NULL when unknown
    // (errored calls, client-aborted streams, historical rows).
    // Both nullable so pre-migration rows and non-instrumented call
    // sites stay honest (NULL ≠ 0) and are excluded from truncation-rate
    // aggregates via `WHERE response_truncated IS NOT NULL`.
    stopReason: varchar("stop_reason", { length: 32 }),
    responseTruncated: int("response_truncated"),
    errorCode: varchar("error_code", { length: 64 }),
    ledgerId: varchar("ledger_id", { length: 36 }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index("ai_usage_user_created_idx").on(t.userId, t.createdAt),
    createdIdx: index("ai_usage_created_idx").on(t.createdAt),
    providerCreatedIdx: index("ai_usage_provider_created_idx").on(
      t.providerId,
      t.createdAt
    ),
    successIdx: index("ai_usage_success_idx").on(t.success),
    // Covers the per-op truncation-rate rollup query
    // (WHERE response_truncated IS NOT NULL AND created_at BETWEEN ? AND ?
    //  GROUP BY operation) so the dashboard doesn't force a full scan
    // once ai_usage passes ~1M rows.
    truncatedCreatedIdx: index("ai_usage_truncated_created_idx").on(
      t.responseTruncated,
      t.createdAt
    ),
    idempotencyIdx: uniqueIndex("ai_usage_idempotency_idx").on(t.idempotencyKey),
  })
);

/**
 * Phase 6.1. Saved parameter sets ("macros") for AI tools. Each row is one
 * user's named preset for one tool.
 *
 * Design notes:
 *   - `toolId` is stored as a free varchar rather than a MySQL enum. The
 *     tool registry (`lib/tools/registry.ts`) is the source of truth for
 *     which ids are valid; the server actions validate the incoming
 *     toolId against the registry before insert. Avoiding an enum here
 *     means we don't need a schema migration every time a tool is
 *     added or removed — Phase 6.1 supports ai-summarize + ai-translate,
 *     but later phases can extend without an ALTER.
 *   - `paramsJson` shape is per-tool:
 *       ai-summarize → { depth: "concise" | "balanced" | "advanced" }
 *       ai-translate → { targetLang: string }   // ISO code
 *     Validated by a Zod discriminated union in the server actions, not
 *     at the DB layer (JSON columns on MySQL don't support check
 *     constraints in versions we target).
 *   - Unique index on (userId, toolId, name) enforces "can't have two
 *     macros with the same name for the same tool" without blocking
 *     reuse of the same name across different tools. Ordering is
 *     (userId, toolId, name) so the listing query — filtered by
 *     (userId, toolId) — uses it as a range scan.
 *   - `updatedAt` is maintained in the rename action (there is no
 *     "edit params" flow — callers delete + re-save instead, so the
 *     only update path is rename).
 *
 * Migration: `CREATE TABLE user_macros (
 *              id VARCHAR(36) PRIMARY KEY,
 *              user_id VARCHAR(255) NOT NULL,
 *              tool_id VARCHAR(64) NOT NULL,
 *              name VARCHAR(80) NOT NULL,
 *              params_json JSON NOT NULL,
 *              created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 *              updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
 *                                          ON UPDATE CURRENT_TIMESTAMP(3),
 *              UNIQUE INDEX user_macros_user_tool_name_idx (user_id, tool_id, name),
 *              INDEX user_macros_user_tool_idx (user_id, tool_id),
 *              FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
 *            );`
 */
export const userMacros = mysqlTable(
  "user_macros",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toolId: varchar("tool_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    // Free-form per-tool params. Shape validated by the server actions'
    // Zod schemas before write; readers that care about structure cast
    // at the site of use (the tool component's onApply callback).
    paramsJson: json("params_json").notNull(),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (t) => ({
    // Primary lookup for the per-tool listing query in MacroBar.
    userToolIdx: index("user_macros_user_tool_idx").on(t.userId, t.toolId),
    // Prevents duplicate macro names within one (user, tool) pair.
    // Listing naturally sorts by name via this index.
    uniqNameIdx: uniqueIndex("user_macros_user_tool_name_idx").on(
      t.userId,
      t.toolId,
      t.name
    ),
  })
);

// --- Phase 7.1 — Tier-2 deferred-region waitlist ------------------------

/**
 * Phase 7.1 — email-capture for visitors from Tier-2 countries (EU27 + EEA +
 * CH/CN/RU/BY per docs/GEO_LAUNCH_POLICY.md §2). These visitors hit the
 * checkout and receive `routeCheckoutByCountry` → `action: "defer"`, so we
 * show them the "not available in your country yet" surface with an optional
 * "notify me when we launch" form. This table stores those signups.
 *
 * Design:
 *   - `email` is stored as-is (not hashed) so we can actually send the
 *     launch announcement. Treated as PII under GDPR — see privacy/DPA
 *     for processing basis (explicit consent at form-submit time).
 *   - `country` is ISO-3166-1 alpha-2, validated at the API layer against
 *     TIER_2_COUNTRIES before insert. Lets us segment the launch email by
 *     country ("we just went live in DE — here's your discount code").
 *   - `reason` discriminates the signup source: `tier2_deferred` (user hit
 *     checkout and was turned away) vs. `tier2_notify` (user proactively
 *     asked on a marketing page). Both flow through the same table so
 *     launch-announcement queries are a single scan.
 *   - `source` is the free-form UI origin ("checkout_defer",
 *     "pricing_country_picker", "marketing_footer") for funnel analytics —
 *     keeps the enum narrow while letting PMs cut the data any way.
 *   - `consentText` stores the EXACT sentence the user clicked "I agree"
 *     on — required for GDPR defensibility. If we ever change the copy,
 *     new rows capture the new text; old rows stay auditable.
 *   - `ipHash` is SHA-256(ip + server-side salt). Kept for anti-abuse
 *     (spot a single IP carpet-bombing the form) without storing the
 *     actual IP. Nullable because local / test submissions may skip it.
 *   - `notifiedAt` flips to a timestamp when we've actually sent the
 *     launch email for the user's country. Prevents double-notifying on
 *     re-runs of the announcement job.
 *
 * Unique index on (email, country) lets a single email opt in to multiple
 * countries ("I care about DE" + "also please tell me about FR") while
 * blocking the common case of double-submitting the same (email, country)
 * pair. Duplicate insert surfaces as MySQL ER_DUP_ENTRY — the API route
 * catches it and returns a soft 200 (already on the list).
 *
 * Migration: db/migrations/0004_geo_waitlist.sql — hand-authored CREATE
 * TABLE to match the pattern in 0001/0002/0003 (we ship Drizzle-kit
 * migrations when schema churns, hand-authored DDL for one-off additions).
 */
export const geoWaitlist = mysqlTable(
  "geo_waitlist",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    country: varchar("country", { length: 2 }).notNull(),
    reason: mysqlEnum("reason", ["tier2_deferred", "tier2_notify"]).notNull(),
    source: varchar("source", { length: 64 }).notNull(),
    consentText: text("consent_text").notNull(),
    userAgent: varchar("user_agent", { length: 512 }),
    ipHash: varchar("ip_hash", { length: 64 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    notifiedAt: timestamp("notified_at", { fsp: 3 }),
  },
  (t) => ({
    // Same email can opt in to multiple countries; a given (email, country)
    // pair is unique. MySQL ER_DUP_ENTRY on conflict → API returns soft-ok.
    emailCountryIdx: uniqueIndex("geo_waitlist_email_country_idx").on(
      t.email,
      t.country
    ),
    // Launch-announcement job queries by country.
    countryIdx: index("geo_waitlist_country_idx").on(t.country),
    // Admin "signups this week" dashboard.
    createdIdx: index("geo_waitlist_created_idx").on(t.createdAt),
  })
);

// --- Phase 6.3 Agent tables — REMOVED on 2026-04-20 ---------------------
//
// `agent_runs` + `agent_run_steps` powered the authenticated /app/studio
// "Smart mode" runner. That route was deleted (see docs/STATUS.md entry
// "Delete /app/studio + drop agent tables") because it duplicated the new
// public /agent + /studio Claude-design surfaces and added complexity
// without proportional value.
//
// DROP migration: db/migrations/0002_drop_agent_runs.sql
//
// What's preserved:
//   - userMacros (above) — the per-tool MacroBar on /tool/ai-summarize
//     and /tool/ai-translate still saves & loads presets here.
//   - public /agent — pure client-side plan/review demo (no DB).
//   - public /macros — pure client-side library (no DB).
//   - public /studio — pure client-side workflow canvas (no DB).
//
// If a future Smart-mode runner returns, copy the original schema from
// git history (commit before 2026-04-20) rather than reconstructing.
// -----------------------------------------------------------------------

/**
 * Phase A4 (MASTER_PLAN §7 gate #7 / task #22). Daily AI margin rollup.
 *
 * Why it's separate from aiUsage (0005):
 *   - aiUsage is per-call audit — great for "what did user X do on 2026-04-21?"
 *     and for provider-cost reconciliation. Bad for trend analysis: a green-
 *     streak query over millions of rows would scan the full table every
 *     time the admin dashboard refreshed.
 *   - This table is the daily aggregate, keyed by (date, provider_id, model,
 *     operation). The cron at `/api/cron/ai-margin-rollup` reads yesterday's
 *     ai_usage slice, sums cost_micros / credits_spent / call_count per
 *     slice, computes margin_bps vs. OP_MARGIN_FLOOR_BPS, and upserts here.
 *   - Gate #7 closes when this table shows 7 consecutive days where EVERY
 *     slice has is_green = 1. The streak reset logic lives in
 *     lib/ai/margin-rollup.ts → computeGreenStreak().
 *
 * Revenue-micros methodology:
 *   We don't actually know per-call revenue — users buy credit packs at
 *   different per-credit rates (Starter $0.050, Creator $0.036, Pro
 *   $0.027, Studio $0.022). To keep the rollup tractable without joining
 *   each ai_usage row to the pack it was spent from, we use a fleet-wide
 *   proxy price of 30,000 µUSD/credit (midpoint of Creator + Pro, the
 *   two highest-traffic tiers). The floor_bps thresholds are tuned
 *   against this proxy, so a "green" slice still holds up under the
 *   real per-tier margin math. Documented in margin-rollup.ts.
 *
 * Uniqueness: UNIQUE(date, provider_id, model, operation) means the
 * cron can safely re-run the same day — ON DUPLICATE KEY UPDATE
 * overwrites rather than insert-duplicating. The `id` PK exists
 * separately so the table is still UUID-addressable (useful for
 * linking audit comments from the admin dashboard to a specific
 * rollup row).
 *
 * Indexes:
 *   - (date) — daily dashboard range scans.
 *   - (date, is_green) — the green-streak query's exact shape.
 *   - (provider_id, date) — per-provider monthly cost slice.
 *
 * Migration: `db/migrations/0006_ai_daily_margin.sql`.
 */
/**
 * Phase A / Task #12 — per-user daily cost ceiling override.
 *
 * Rows are OPT-IN: only users who need a non-default cap (either raised
 * for an enterprise pilot or lowered/zero'd for fraud review) get a
 * row here. Every other user reads the global default from
 * `process.env.USER_DAILY_COST_MICROS_CAP` (currently $0.50/user/day
 * = 500000 µUSD in production).
 *
 * Semantics:
 *   - `dailyCostCapMicros = 0`  → hard block (all AI ops 429).
 *   - `dailyCostCapMicros > 0`  → soft cap; user is served until
 *                                  SUM(cost_micros) for today >= cap.
 *
 * The cap check lives in `lib/ai/rate-limit.ts → checkUserDailyCost`,
 * which is called from every op route handler BEFORE `spendCredits`.
 *
 * Operator workflow for Phase A (MVP):
 *   - INSERT / UPDATE via raw SQL against the production database.
 *   - Admin UI at `/app/admin/kill-switches` is read-only — it shows
 *     the global env cap + the count of overridden users but never
 *     mutates. Task #25 (Phase D) upgrades this to a full admin CRUD
 *     surface with audit logging.
 *
 * Why `notes` is stored here instead of an audit table:
 *   - Phase A needs a place to record WHY an override exists so the
 *     next operator reading the table understands the context ("temp
 *     zero — suspected credit-card fraud 2026-04-23"). A proper audit
 *     trail lands with Task #25.
 *
 * Migration: `db/migrations/0009_user_rate_limits.sql`.
 */
export const userRateLimits = mysqlTable(
  "user_rate_limits",
  {
    userId: varchar("user_id", { length: 255 })
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    // USD × 1e6. Same unit as ai_usage.cost_micros so the cap check's
    // SUM aggregate compares apples-to-apples without unit conversion.
    // NOT NULL on purpose: an override row with a null cap has no
    // semantics; operators who want to "remove override" should DELETE
    // the row rather than null the value. 0 is a valid cap (= hard block).
    dailyCostCapMicros: bigint("daily_cost_cap_micros", {
      mode: "number",
    }).notNull(),
    // Free-form operator note. Shown in the admin page's overridden-user
    // list so the next operator understands why this row exists.
    notes: varchar("notes", { length: 256 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  }
);

export const aiDailyMargin = mysqlTable(
  "ai_daily_margin",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    // MySQL DATE — the day being summarised (UTC). Storing as DATE (not
    // DATETIME) makes dedup on the uniqueness constraint predictable
    // across re-runs of the same day.
    date: date("date", { mode: "string" }).notNull(),
    providerId: varchar("provider_id", { length: 32 }).notNull(),
    model: varchar("model", { length: 128 }).notNull(),
    operation: varchar("operation", { length: 32 }).notNull(),
    callCount: int("call_count").notNull().default(0),
    successCount: int("success_count").notNull().default(0),
    errorCount: int("error_count").notNull().default(0),
    // bigint sums — a single high-volume day can exceed int32 range in
    // token counts or micro-dollars.
    inputTokensSum: bigint("input_tokens_sum", { mode: "number" })
      .notNull()
      .default(0),
    outputTokensSum: bigint("output_tokens_sum", { mode: "number" })
      .notNull()
      .default(0),
    latencyMsSum: bigint("latency_ms_sum", { mode: "number" })
      .notNull()
      .default(0),
    creditsSpentSum: bigint("credits_spent_sum", { mode: "number" })
      .notNull()
      .default(0),
    costMicrosSum: bigint("cost_micros_sum", { mode: "number" })
      .notNull()
      .default(0),
    revenueMicrosSum: bigint("revenue_micros_sum", { mode: "number" })
      .notNull()
      .default(0),
    // (revenue - cost) / revenue * 10_000 clamped to [-10_000, +10_000].
    // If revenue_micros_sum = 0 the slice is unambiguously red (margin_bps
    // = -10_000 by convention).
    marginBps: int("margin_bps").notNull(),
    floorBps: int("floor_bps").notNull(),
    isGreen: int("is_green").notNull().default(0),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (t) => ({
    sliceIdx: uniqueIndex("ai_daily_margin_slice_idx").on(
      t.date,
      t.providerId,
      t.model,
      t.operation
    ),
    dateIdx: index("ai_daily_margin_date_idx").on(t.date),
    dateGreenIdx: index("ai_daily_margin_date_green_idx").on(t.date, t.isGreen),
    providerDateIdx: index("ai_daily_margin_provider_date_idx").on(
      t.providerId,
      t.date
    ),
  })
);

/**
 * Phase A / Task #13 — OpenAI Batch API tracking.
 *
 * One row per batch submission. Kept separate from `aiOutputs` because a
 * batch has no artifact to show the user until OpenAI finishes processing
 * — typically 10–60 minutes, occasionally up to 24h. While the batch is
 * in flight the user needs status visibility ("your summary is
 * processing, ETA…"), and when it finalises we write the canonical
 * `files` + `aiOutputs` rows just like a realtime op would.
 *
 * Status lifecycle
 * ----------------
 *   "submitted"    — JSONL uploaded + POST /v1/batches returned a batch_id.
 *   "in_progress"  — OpenAI reports validating / in_progress / finalizing.
 *   "completed"    — OpenAI reports completed. Our polling route is about
 *                    to fetch the output JSONL and write ai_outputs.
 *   "finalized"    — OUR terminal success state. ai_outputs + files
 *                    written, ai_usage recorded at the 50%-discounted
 *                    cost, credits NOT refunded.
 *   "failed"       — OpenAI terminal failure. Credits refunded via the
 *                    original idempotency key.
 *   "expired"      — OpenAI didn't finish within 24h. Credits refunded.
 *   "cancelled"    — Operator or user cancelled. Credits refunded.
 *
 * We deliberately mirror OpenAI's status vocabulary where it's
 * unambiguous and add "finalized" because "completed" in OpenAI-land
 * means "results are ready to download", not "we've finished serving
 * the user".
 *
 * Credit accounting
 * -----------------
 * Credits spend at SUBMISSION time (same as realtime). The 50%
 * discount lives on `cost_micros` only. See migration 0010's header
 * comment for the full rationale.
 *
 * Migration: `db/migrations/0010_batch_jobs.sql`.
 */
export const batchJobs = mysqlTable(
  "batch_jobs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // AIOp string — "summarize" | "translate" for Task #13. Other ops
    // (compare, generate, rewrite) can join later without a schema
    // change.
    op: varchar("op", { length: 32 }).notNull(),
    // OpenAI's batch_... id from POST /v1/batches.
    openaiBatchId: varchar("openai_batch_id", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    // Number of JSONL lines we submitted. For summarize that's always 1;
    // for translate it equals the chunk count so finalize knows how many
    // lines to expect back.
    requestCount: int("request_count").notNull(),
    // Everything finalize needs to rebuild the answer without going back
    // to the user's original upload. Shape is op-specific:
    //   summarize → { filename, depth, pageCount, sourceSha256, ocrCandidatePages }
    //   translate → { filename, targetLanguage, chunkCount, totalChars,
    //                  ocrCandidatePages, sourceSha256 }
    opPayload: json("op_payload").notNull(),
    // Populated on finalize: per-line token counts + stop reasons,
    // provider/model echo, aggregate stats. Kept raw-ish for later
    // analytics without re-polling OpenAI.
    resultPayload: json("result_payload"),
    // Client-supplied key. UNIQUE per user prevents double-submit on
    // retry. Same shape as the realtime idempotencyKey field on
    // ai_outputs — a client can use the same key for both modes without
    // collision (the tables are disjoint).
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    resultFileId: varchar("result_file_id", { length: 128 }),
    errorFileId: varchar("error_file_id", { length: 128 }),
    errorMessage: varchar("error_message", { length: 512 }),
    tokensIn: bigint("tokens_in", { mode: "number" }),
    tokensOut: bigint("tokens_out", { mode: "number" }),
    // Post-50%-discount µUSD. Written to ai_usage.cost_micros on
    // finalize, so downstream margin dashboards see the batch win
    // automatically.
    costMicros: bigint("cost_micros", { mode: "number" }),
    // FK to the files row that holds the finalized output. NULL until
    // finalize writes it (or permanently if the batch failed).
    outputFileId: varchar("output_file_id", { length: 36 }),
    submittedAt: timestamp("submitted_at", { fsp: 3 }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { fsp: 3 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (t) => ({
    userIdemUq: uniqueIndex("batch_jobs_user_idem_uq").on(
      t.userId,
      t.idempotencyKey
    ),
    userSubmittedIdx: index("batch_jobs_user_submitted_idx").on(
      t.userId,
      t.submittedAt
    ),
    statusSubmittedIdx: index("batch_jobs_status_submitted_idx").on(
      t.status,
      t.submittedAt
    ),
  })
);
