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
      costMicros: input.costMicros ?? null,
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
