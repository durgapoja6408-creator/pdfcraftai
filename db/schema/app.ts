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
