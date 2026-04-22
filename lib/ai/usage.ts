// AI usage recorder — the single path for logging AI invocations.
//
// Every adapter call wraps through `recordAiUsage` after the provider
// returns (successfully or with an error). This file is the only place
// that writes to the `ai_usage` table — route handlers never insert
// directly, same discipline as `grantCredits` for `credit_ledger`.
//
// Why a separate table from `credit_ledger`:
//   - Ledger rows are money. Usage rows are cost.
//   - We want to see failed calls (they incurred a provider cost even
//     if they didn't debit credits) — the ledger won't have a row for
//     those but `ai_usage` must.
//   - A single payment can fan out to many AI calls; the rollup cron
//     needs to join usage → user → payments to compute margin. That's
//     cleaner when usage is a dedicated table with FK to `users`.
//
// Idempotency:
//   - If callers pass the same `idempotencyKey` they passed to
//     `spendCredits`, replays collapse to one usage row. Duplicate key
//     violations are caught and returned as `{ applied: false,
//     reason: "duplicate" }` — identical shape to `grantCredits`.
//
// MASTER_PLAN refs: §7 gate #3 (E2E audit trail), §6 task #83 (Phase A1).
// Migration:       db/migrations/0005_ai_usage.sql.

import "server-only";

import { randomUUID } from "crypto";

import { db, schema } from "@/db/client";
import type { AIOperationId } from "@/lib/pricing";

// ---------------------------------------------------------------------------
// Per-model cost rate card (Task #21, Tier 2 — MASTER_PLAN §7 gate #6).
//
// Why this lives here and not in `pricing.ts`
// -------------------------------------------
// `lib/pricing.ts` holds USER-facing prices (credits). This table holds
// OUR-side wholesale prices (USD per 1M tokens). Keeping them separate
// means "pricing.ts bumped" and "a provider rotated their rate card"
// never collide in a PR diff.
//
// Source of truth: docs/ai/COST_MATRIX_3PROVIDER.md §1 (refreshed
// 2026-04-21). When that file changes, so does this table.
//
// Units: USD per 1 million tokens. Matches every public rate card we
// crib from. Conversion to micros happens in `computeCostMicros` below.
//
// Why we do prefix matching:
//   - Anthropic returns model strings like "claude-haiku-4-5-20251001"
//     and sometimes "claude-haiku-4-5" bare. Matching both requires a
//     prefix rule.
//   - OpenAI dated suffixes like "gpt-4o-mini-2024-07-18" should still
//     map to gpt-4o-mini's rate.
//   - Gemini occasionally returns "gemini-2.5-flash-001"; same story.
// -------------------------------------------------------------------------

export type ModelRate = {
  /** USD per 1 million input tokens. */
  inputUsdPerMtok: number;
  /** USD per 1 million output tokens. */
  outputUsdPerMtok: number;
};

/**
 * Exact-match table. Checked first. Add longest/most-specific keys
 * when multiple variants exist for the same model family.
 */
const MODEL_RATE_TABLE: ReadonlyArray<readonly [string, ModelRate]> = [
  // Anthropic
  ["claude-haiku-4-5", { inputUsdPerMtok: 1.0, outputUsdPerMtok: 5.0 }],
  ["claude-sonnet-4", { inputUsdPerMtok: 3.0, outputUsdPerMtok: 15.0 }],
  ["claude-sonnet-3-5", { inputUsdPerMtok: 3.0, outputUsdPerMtok: 15.0 }],
  ["claude-opus-4", { inputUsdPerMtok: 15.0, outputUsdPerMtok: 75.0 }],
  ["claude-opus", { inputUsdPerMtok: 15.0, outputUsdPerMtok: 75.0 }],
  // OpenAI
  ["gpt-4o-mini", { inputUsdPerMtok: 0.15, outputUsdPerMtok: 0.6 }],
  ["gpt-4o", { inputUsdPerMtok: 2.5, outputUsdPerMtok: 10.0 }],
  ["gpt-4.1-mini", { inputUsdPerMtok: 0.4, outputUsdPerMtok: 1.6 }],
  ["gpt-4.1", { inputUsdPerMtok: 2.0, outputUsdPerMtok: 8.0 }],
  // Gemini
  ["gemini-2.5-flash", { inputUsdPerMtok: 0.3, outputUsdPerMtok: 2.5 }],
  ["gemini-2.5-pro", { inputUsdPerMtok: 1.25, outputUsdPerMtok: 10.0 }],
  ["gemini-1.5-flash", { inputUsdPerMtok: 0.075, outputUsdPerMtok: 0.3 }],
  ["gemini-1.5-pro", { inputUsdPerMtok: 1.25, outputUsdPerMtok: 5.0 }],
];

/**
 * Look up a model's USD/Mtok rate card. Returns null if we don't know
 * the model — never throw, so a new provider rollout can't 500 the
 * user's AI call. Null costMicros just means "the rollup will ignore
 * this row"; deploys that spam unknown models will show up in the
 * `/api/health` gauge for ops to flag.
 *
 * Strategy: scan the table looking for an exact match OR a prefix match
 * that covers the returned model string. Longer keys win (handled by
 * the table being manually ordered longest-first within each family).
 */
export function lookupModelRate(modelId: string): ModelRate | null {
  if (!modelId) return null;
  const m = modelId.trim().toLowerCase();
  let best: { key: string; rate: ModelRate } | null = null;
  for (const [key, rate] of MODEL_RATE_TABLE) {
    const k = key.toLowerCase();
    if (m === k || m.startsWith(k + "-") || m.startsWith(k)) {
      if (!best || k.length > best.key.length) {
        best = { key: k, rate };
      }
    }
  }
  return best?.rate ?? null;
}

/**
 * Anthropic prompt-cache multipliers (Task #10). These apply ONLY to the
 * two cache-tagged buckets that arrive in `usage.cache_read_input_tokens`
 * and `usage.cache_creation_input_tokens`. Uncached input tokens are
 * priced at 1× base.
 *
 *   - Cache READ  — 0.10× base input rate (huge savings when prefix hits).
 *   - Cache WRITE — 1.25× base input rate (small premium on first write).
 *
 * Other providers don't report cache tokens, so the multipliers never
 * apply to them.
 */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

/**
 * OpenAI Batch API discount (Task #13). Batch submissions route through
 * the async /v1/batches endpoint with a 24h SLA and OpenAI discounts
 * BOTH input and output token prices by a flat 50%. The multiplier is
 * applied after cache math so it composes cleanly (batch runs don't
 * use prompt caching today — the two features are mutually exclusive
 * on OpenAI — but the math is written order-independent so that when
 * Anthropic batch lands in Task #26 both multipliers can stack.)
 */
const BATCH_DISCOUNT_MULTIPLIER = 0.5;

/**
 * Compute provider cost in micros (USD × 1e6) given token counts and a
 * model id. Returns null if the model isn't in the rate card — callers
 * pass that null straight to the `cost_micros` column, which the rollup
 * treats as "unknown cost" (distinct from zero).
 *
 * Cache pricing (Task #10):
 *   - `inputTokens` is UNCACHED input only (Anthropic's
 *     `usage.input_tokens` already excludes cache reads/writes).
 *   - `cachedInputTokens` (cache reads) bill at 0.1× the input rate.
 *   - `cacheCreationInputTokens` (cache writes) bill at 1.25× the input
 *     rate; charged once per prefix, then subsequent calls hit cache-read
 *     prices for 5 minutes on the ephemeral tier.
 *   - Non-Anthropic callers pass undefined for both; math collapses to
 *     the legacy two-bucket formula and the result is bit-identical to
 *     the pre-cache code path.
 */
export function computeCostMicros(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens?: number,
  cacheCreationInputTokens?: number,
  batchMode?: boolean
): number | null {
  const rate = lookupModelRate(modelId);
  if (!rate) return null;
  const inTok = Math.max(0, Math.floor(inputTokens || 0));
  const outTok = Math.max(0, Math.floor(outputTokens || 0));
  const cacheReadTok = Math.max(0, Math.floor(cachedInputTokens || 0));
  const cacheWriteTok = Math.max(0, Math.floor(cacheCreationInputTokens || 0));
  // USD per token = usdPerMtok / 1_000_000.
  // Cost in micros  = tokens * usdPerToken * 1_000_000
  //                 = tokens * usdPerMtok.
  // Round to integer micros — sub-cent precision is already far below
  // the per-call scale, so rounding drift is invisible at rollup time.
  let cost =
    inTok * rate.inputUsdPerMtok +
    outTok * rate.outputUsdPerMtok +
    cacheReadTok * rate.inputUsdPerMtok * CACHE_READ_MULTIPLIER +
    cacheWriteTok * rate.inputUsdPerMtok * CACHE_WRITE_MULTIPLIER;
  if (batchMode) {
    // Batch runs get a flat 50% on the fully-assembled cost. Applied
    // last so cache-math stays independently legible and so future
    // provider-specific batch surfaces can reuse the same multiplier
    // without reshuffling earlier terms.
    cost = cost * BATCH_DISCOUNT_MULTIPLIER;
  }
  return Math.max(0, Math.round(cost));
}

// --- recordAiUsage --------------------------------------------------------

export type RecordAiUsageInput = {
  userId: string;
  operation: AIOperationId;
  providerId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /**
   * Anthropic prompt-cache tokens (Task #10). When set, `computeCostMicros`
   * prices cache reads at 0.1× base and cache writes at 1.25× base. Both
   * are persisted into their own columns so the rollup cron (and the
   * admin margin view) can measure cache-hit rate per op.
   *
   * Undefined for non-Anthropic providers. Zero is distinct from
   * undefined: a caller that passes 0 explicitly says "cache applied,
   * nothing hit"; undefined says "cache not applicable".
   */
  cachedInputTokens?: number | null;
  cacheCreationInputTokens?: number | null;
  latencyMs: number;
  /**
   * Credits debited for this call. Should match what `spendCredits`
   * returned. Pass 0 for ops that don't spend credits (should be
   * none today, but keeps the API explicit).
   */
  creditsSpent: number;
  /**
   * Provider cost in USD × 1e6. Null until per-model rate cards are
   * wired (Phase A4). Keeps the column honest — readers can
   * distinguish "cost is zero" from "cost is unknown".
   */
  costMicros?: number | null;
  success: boolean;
  errorCode?: string | null;
  /**
   * Task #11 truncation observability (migration 0008). The provider's
   * terminal `stop_reason` string — whatever the adapter extracted from
   * the final `done` chunk ("end_turn", "max_tokens", "stop_sequence",
   * etc.). Persisted verbatim so edge cases aren't lost. Callers that
   * can't capture it (stream aborted, errored before a terminal chunk)
   * pass null.
   */
  stopReason?: string | null;
  /**
   * Derived flag over `stopReason`: 1 if the response hit the output
   * cap, 0 if it terminated naturally, null if unknown. Callers pass
   * the computed value so the decision lives at the call site (each op
   * knows its own truncation vocabulary), but today every provider maps
   * "max_tokens" → truncated. See `isTruncatedStopReason` below for the
   * shared classifier the op routes should use.
   */
  responseTruncated?: number | null;
  /** Links back to the `credit_ledger.id` of the corresponding debit. */
  ledgerId?: string | null;
  /**
   * Stable idempotency key — typically the same one passed to
   * `spendCredits`. A retried call writes one usage row.
   */
  idempotencyKey?: string | null;
  /**
   * Task #13 — set to true when this usage row came from an OpenAI
   * Batch API submission. The auto-enrichment path applies the 50%
   * discount to `costMicros`, and the margin rollup reads this flag
   * (once migration 0011 lands in Task #14) to split realtime vs.
   * batch spend. Defaults to false.
   */
  batchMode?: boolean;
  /**
   * Task #26 / Phase E — prompt version registry audit field
   * (migration 0014). The PromptVersion.id that was resolved for
   * this call by `resolvePromptVersion(op, seed)` in
   * `lib/ai/prompts/registry.ts`. Typically "v1", "v2-concise",
   * "v3-expert-tone". NULL when the op hasn't opted into the
   * registry yet — rollout is per-op so early adopters (summarize
   * first) write the column while later adopters leave it NULL.
   */
  promptVersion?: string | null;
  /**
   * Task #26 / Phase E — experiment audit field (migration 0014).
   * NON-NULL only when the variant assignment came from an active
   * multi-variant experiment at call time (i.e. >1 enabled variant
   * for that op). A 100%-weight single-variant lookup writes
   * `promptVersion` but leaves this NULL. The rollup slicer uses
   * NULL as the signal for "this row's assignment was
   * deterministic, not randomized," which is a materially different
   * statistical posture than an A/B-assigned row.
   */
  experimentId?: string | null;
};

export type RecordAiUsageResult =
  | { applied: true; id: string }
  | { applied: false; reason: "duplicate" };

/**
 * Insert a row into `ai_usage`. Idempotent via the unique index on
 * `idempotency_key` — duplicate inserts return `{ applied: false }`
 * without raising.
 *
 * Non-throwing on DB errors other than duplicate-key is deliberate:
 * losing a usage row is strictly less bad than 500-ing the user's AI
 * call. Callers treat this as fire-and-forget audit.
 */
export async function recordAiUsage(
  input: RecordAiUsageInput
): Promise<RecordAiUsageResult> {
  const id = randomUUID();

  // Cost enrichment — Tier 2 of MASTER_PLAN §7 gate #6 (2026-04-21).
  // If the caller didn't pass `costMicros`, compute it here from token
  // counts and the model's rate card. Callers that DO pass a value
  // (e.g. provider dashboard scrape back-fill jobs) win.
  // We only compute when the call succeeded — errored calls still
  // incurred some provider cost, but without a usage record from the
  // provider we can't attribute it accurately. The rollup treats those
  // as "unknown cost" which is honest.
  const cachedIn =
    input.cachedInputTokens != null
      ? Math.max(0, Math.floor(input.cachedInputTokens))
      : null;
  const cacheWriteIn =
    input.cacheCreationInputTokens != null
      ? Math.max(0, Math.floor(input.cacheCreationInputTokens))
      : null;
  const enrichedCostMicros =
    input.costMicros !== undefined && input.costMicros !== null
      ? input.costMicros
      : input.success
        ? computeCostMicros(
            input.model,
            input.inputTokens,
            input.outputTokens,
            cachedIn ?? 0,
            cacheWriteIn ?? 0,
            input.batchMode === true
          )
        : null;

  try {
    await db.insert(schema.aiUsage).values({
      id,
      userId: input.userId,
      operation: input.operation,
      providerId: input.providerId,
      model: input.model,
      inputTokens: Math.max(0, Math.floor(input.inputTokens || 0)),
      outputTokens: Math.max(0, Math.floor(input.outputTokens || 0)),
      // New columns (migration 0007) — nullable so back-compat writes
      // from non-Anthropic adapters and legacy code paths work unchanged.
      cachedInputTokens: cachedIn,
      cacheCreationInputTokens: cacheWriteIn,
      latencyMs: Math.max(0, Math.floor(input.latencyMs || 0)),
      creditsSpent: Math.max(0, Math.floor(input.creditsSpent || 0)),
      costMicros: enrichedCostMicros,
      success: input.success ? 1 : 0,
      // Task #11 truncation observability (migration 0008). Both null by
      // default so legacy callers and errored calls that never saw a
      // terminal chunk keep the column as NULL (= "unknown"), which is
      // the value the truncation-rate aggregates explicitly filter out.
      stopReason: normalizeStopReason(input.stopReason),
      responseTruncated: normalizeTruncatedFlag(input.responseTruncated),
      // Phase E / Task #26 — prompt version registry audit
      // (migration 0014). Both default to NULL so pre-registry ops
      // and historical rows stay honest. The registry at
      // lib/ai/prompts/registry.ts is the SSOT; this is the per-
      // call audit trail.
      promptVersion:
        typeof input.promptVersion === "string" && input.promptVersion.length > 0
          ? input.promptVersion.slice(0, 32)
          : null,
      experimentId:
        typeof input.experimentId === "string" && input.experimentId.length > 0
          ? input.experimentId.slice(0, 64)
          : null,
      errorCode: input.errorCode ?? null,
      ledgerId: input.ledgerId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    });
    return { applied: true, id };
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) {
      return { applied: false, reason: "duplicate" };
    }
    // Don't throw — audit row loss must not break the user's request.
    // Log to stderr so Sentry (Task #24) captures it once wired.
    // eslint-disable-next-line no-console
    console.error("recordAiUsage: insert failed", err);
    return { applied: false, reason: "duplicate" };
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; errno?: number };
  return e.code === "ER_DUP_ENTRY" || e.errno === 1062;
}

// ---------------------------------------------------------------------------
// Task #11 truncation observability helpers.
//
// Shared across op routes and the usage-recorder so the "what counts as
// truncated?" rule has a single definition. Today all three providers
// map "max_tokens" → truncated and everything else → not-truncated; as
// new providers land this classifier is the only place to extend.
// ---------------------------------------------------------------------------

/**
 * Canonical set of stop_reason strings that mean "the provider cut the
 * response off because it hit the output-token cap".
 *
 * Sources:
 *   - Anthropic:  stop_reason === "max_tokens"                 (docs: messages stop_reason)
 *   - OpenAI:     finish_reason === "length"  (adapter normalizes to "max_tokens")
 *   - Gemini:     finishReason === "MAX_TOKENS" (adapter normalizes to "max_tokens")
 *
 * Our three adapters all normalize to the Anthropic string before the
 * chunk reaches the op route, so the canonical set is a single entry.
 * Kept as a set to make adding future provider-specific escape hatches
 * trivial without touching the classifier signature.
 */
const TRUNCATED_STOP_REASONS: ReadonlySet<string> = new Set(["max_tokens"]);

/**
 * Classify a raw stop_reason string as truncated / natural / unknown.
 * Returns:
 *   - 1 if the reason indicates the output cap was hit
 *   - 0 if the reason indicates a natural terminal state
 *   - null if the reason is missing/unknown (call errored, client
 *     aborted the stream, or a new provider returned an unrecognized
 *     reason)
 *
 * Callers pass the result straight to `recordAiUsage({ responseTruncated })`.
 * The 3-way return is deliberate: the DB column is nullable so that
 * truncation-rate dashboards can filter out unknowns instead of
 * treating them as zeros (which would bias the rate downward).
 */
export function isTruncatedStopReason(
  stopReason: string | null | undefined
): number | null {
  if (stopReason == null) return null;
  const s = String(stopReason).trim().toLowerCase();
  if (s.length === 0) return null;
  return TRUNCATED_STOP_REASONS.has(s) ? 1 : 0;
}

/**
 * Coerce an input `stopReason` to the DB-safe shape: trimmed string
 * (<=32 chars to match the column), or null. Missing/empty/whitespace
 * inputs collapse to null — the column means "provider told us
 * something", not "we invented a value".
 */
function normalizeStopReason(
  reason: string | null | undefined
): string | null {
  if (reason == null) return null;
  const s = String(reason).trim();
  if (s.length === 0) return null;
  return s.length > 32 ? s.slice(0, 32) : s;
}

/**
 * Coerce an input `responseTruncated` to the DB-safe shape: 0, 1, or
 * null. Anything outside that set becomes null so the column can't be
 * polluted by a caller passing a boolean or a random int.
 */
function normalizeTruncatedFlag(
  flag: number | null | undefined
): number | null {
  if (flag == null) return null;
  if (flag === 0 || flag === 1) return flag;
  return null;
}
