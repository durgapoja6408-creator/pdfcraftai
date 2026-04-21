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
 * Compute provider cost in micros (USD × 1e6) given token counts and a
 * model id. Returns null if the model isn't in the rate card — callers
 * pass that null straight to the `cost_micros` column, which the rollup
 * treats as "unknown cost" (distinct from zero).
 */
export function computeCostMicros(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const rate = lookupModelRate(modelId);
  if (!rate) return null;
  const inTok = Math.max(0, Math.floor(inputTokens || 0));
  const outTok = Math.max(0, Math.floor(outputTokens || 0));
  // USD per token = usdPerMtok / 1_000_000.
  // Cost in micros  = tokens * usdPerToken * 1_000_000
  //                 = tokens * usdPerMtok.
  // Round to integer micros — sub-cent precision is already far below
  // the per-call scale, so rounding drift is invisible at rollup time.
  const cost = inTok * rate.inputUsdPerMtok + outTok * rate.outputUsdPerMtok;
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
  /** Links back to the `credit_ledger.id` of the corresponding debit. */
  ledgerId?: string | null;
  /**
   * Stable idempotency key — typically the same one passed to
   * `spendCredits`. A retried call writes one usage row.
   */
  idempotencyKey?: string | null;
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
  const enrichedCostMicros =
    input.costMicros !== undefined && input.costMicros !== null
      ? input.costMicros
      : input.success
        ? computeCostMicros(input.model, input.inputTokens, input.outputTokens)
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
      latencyMs: Math.max(0, Math.floor(input.latencyMs || 0)),
      creditsSpent: Math.max(0, Math.floor(input.creditsSpent || 0)),
      costMicros: enrichedCostMicros,
      success: input.success ? 1 : 0,
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
