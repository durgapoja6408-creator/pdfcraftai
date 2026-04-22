// lib/admin/phase-e-queries.ts — Phase E admin query helpers.
//
// Task #26.
//
// Why a separate file from lib/admin/phase-d-queries.ts:
// ------------------------------------------------------
// Phase D's query module (~600 lines) is stable and scoped to that
// phase's five admin pages (plans / promos / compliance / fraud /
// rate-limits). Phase E is a genuinely new surface — the prompt
// registry and A/B testing infra — with its own page (/admin/prompts)
// and a different data shape (slicing ai_usage by prompt_version +
// experiment_id). Keeping them separate means a rename of a Phase D
// helper doesn't show up in Phase E git blame, and each phase's
// "state of the art" stays traceable to a single file.
//
// Scope boundary:
//
//   - This module ONLY contains DB-backed helpers that back the
//     /admin/prompts page introduced in Task #26. Pure-static data
//     (the registry itself, list of experiments) already lives in
//     lib/ai/prompts/registry.ts and is re-exported by the page — no
//     query needed.
//   - Same `PhaseEQueryResult<T>` return posture as phase-d-queries.ts
//     so the page can share the ErrorBanner component.
//
// Query-to-page mapping:
//   /admin/prompts  → getPromptVersionRollout (DB)
//                     getPromptExperimentResults (DB, per-experiment)
//
// Rollup filter convention:
//   All queries here apply `WHERE prompt_version IS NOT NULL` so
//   pre-0014 rows (before the registry shipped) don't skew the
//   percentages. Same pattern we use on response_truncated (0008)
//   and cached_input_tokens (0007) — NULL means "unknown / pre-era",
//   not "zero".

import "server-only";

import { and, desc, gte, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";

// ---------------------------------------------------------------------
// Shared result envelope — matches lib/admin/queries.ts:AdminQueryResult
// and lib/admin/phase-d-queries.ts:PhaseDQueryResult.
// ---------------------------------------------------------------------

export type PhaseEQueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function msPerDay(): number {
  return 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------
// /admin/prompts — per-op variant rollout rollup
// ---------------------------------------------------------------------
//
// The question this answers on the page:
//
//   "Over the last N days, how did each op's traffic split across
//    prompt variants — and for the variants that came from an
//    experiment, what were the per-call infra metrics (tokens,
//    cost_micros, truncation rate, success rate)?"
//
// Not a full A/B significance test. The admin page today is for
// surfacing "does this variant look obviously worse" before we
// decide to let it ride longer or promote. Once we have a Task that
// needs p-values (bayesian posterior, lift CIs) we add a second
// helper — probably in lib/ai/experiments/ — without touching this
// one.

export type PromptVariantRolloutRow = {
  operation: string; // PromptOp: summarize / translate / ...
  promptVersion: string; // e.g. "v1", "v2-concise"
  experimentId: string | null; // null = deterministic assignment
  callCount: number;
  successCount: number;
  errorCount: number;
  truncatedCount: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgCachedInputTokens: number;
  sumCostMicros: number; // already infra-side, batch-discounted
  avgLatencyMs: number;
};

export type PromptVariantRolloutSnapshot = {
  windowDays: number;
  totalCalls: number;
  totalCallsWithVersion: number; // rows where prompt_version IS NOT NULL
  rows: PromptVariantRolloutRow[];
};

/**
 * Variant rollout rollup across ALL ops.
 *
 * Returns one row per (operation, prompt_version, experiment_id)
 * tuple over the window. The page groups these client-side by
 * operation so the table stays human-readable — doing a pivot in
 * SQL buys us nothing because the cardinality is small (maybe 30
 * tuples total at 10 ops × ~3 active variants).
 *
 * Window defaults to 7d; caller can override. We clamp to [1, 90]
 * because 90d covers a full quarterly experiment and beyond that
 * the scan gets expensive (ai_usage grows ~10k rows/day at current
 * volume; 90d = ~900k row GROUP BY is still fine but anything
 * longer should use a materialized rollup, not this live query).
 */
export async function getPromptVersionRollout(opts: {
  days: number;
}): Promise<PhaseEQueryResult<PromptVariantRolloutSnapshot>> {
  const days = Math.min(Math.max(opts.days, 1), 90);
  const since = new Date(Date.now() - days * msPerDay());

  try {
    // Total calls over the window — used by the page to show
    // "42% of traffic had a recorded prompt version" so operators
    // can tell when the migration/code ships haven't propagated yet.
    const [totals] = await db
      .select({
        totalCalls: sql<number>`COUNT(*)`.as("total_calls"),
        totalCallsWithVersion: sql<number>`SUM(CASE WHEN ${schema.aiUsage.promptVersion} IS NOT NULL THEN 1 ELSE 0 END)`.as(
          "total_with_version"
        ),
      })
      .from(schema.aiUsage)
      .where(gte(schema.aiUsage.createdAt, since));

    const rollupRows = await db
      .select({
        operation: schema.aiUsage.operation,
        promptVersion: schema.aiUsage.promptVersion,
        experimentId: schema.aiUsage.experimentId,
        callCount: sql<number>`COUNT(*)`.as("call_count"),
        // success/error counts — `success` column is a boolean. MySQL
        // returns 0/1; we cast via CASE to avoid driver-specific
        // coercion surprises.
        successCount: sql<number>`SUM(CASE WHEN ${schema.aiUsage.success} = 1 THEN 1 ELSE 0 END)`.as(
          "success_count"
        ),
        errorCount: sql<number>`SUM(CASE WHEN ${schema.aiUsage.success} = 0 THEN 1 ELSE 0 END)`.as(
          "error_count"
        ),
        truncatedCount: sql<number>`SUM(CASE WHEN ${schema.aiUsage.responseTruncated} = 1 THEN 1 ELSE 0 END)`.as(
          "truncated_count"
        ),
        avgInputTokens: sql<number>`AVG(${schema.aiUsage.inputTokens})`.as(
          "avg_input_tokens"
        ),
        avgOutputTokens: sql<number>`AVG(${schema.aiUsage.outputTokens})`.as(
          "avg_output_tokens"
        ),
        avgCachedInputTokens: sql<number>`AVG(${schema.aiUsage.cachedInputTokens})`.as(
          "avg_cached_input_tokens"
        ),
        sumCostMicros: sql<number>`SUM(${schema.aiUsage.costMicros})`.as(
          "sum_cost_micros"
        ),
        avgLatencyMs: sql<number>`AVG(${schema.aiUsage.latencyMs})`.as(
          "avg_latency_ms"
        ),
      })
      .from(schema.aiUsage)
      .where(
        and(
          gte(schema.aiUsage.createdAt, since),
          // Rollup filter — NULL rows are pre-0014 / pre-registry
          // and would skew every percentage on the page.
          isNotNull(schema.aiUsage.promptVersion)
        )
      )
      .groupBy(
        schema.aiUsage.operation,
        schema.aiUsage.promptVersion,
        schema.aiUsage.experimentId
      )
      .orderBy(
        schema.aiUsage.operation,
        desc(sql`COUNT(*)`)
      );

    const rows: PromptVariantRolloutRow[] = rollupRows.map((r) => ({
      operation: String(r.operation),
      promptVersion: String(r.promptVersion ?? ""),
      experimentId: r.experimentId ? String(r.experimentId) : null,
      callCount: Number(r.callCount) || 0,
      successCount: Number(r.successCount) || 0,
      errorCount: Number(r.errorCount) || 0,
      truncatedCount: Number(r.truncatedCount) || 0,
      avgInputTokens: Math.round(Number(r.avgInputTokens) || 0),
      avgOutputTokens: Math.round(Number(r.avgOutputTokens) || 0),
      avgCachedInputTokens: Math.round(Number(r.avgCachedInputTokens) || 0),
      sumCostMicros: Number(r.sumCostMicros) || 0,
      avgLatencyMs: Math.round(Number(r.avgLatencyMs) || 0),
    }));

    return {
      ok: true,
      data: {
        windowDays: days,
        totalCalls: Number(totals?.totalCalls) || 0,
        totalCallsWithVersion: Number(totals?.totalCallsWithVersion) || 0,
        rows,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "rollout_query_failed",
    };
  }
}
