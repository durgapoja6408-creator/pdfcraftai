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

import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
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

// ---------------------------------------------------------------------
// /admin/promos — code inventory + rollup
// ---------------------------------------------------------------------
//
// The question this answers on the page:
//
//   "Which promo codes exist, how many times have they been used, how
//    much discount have we given away, and which ones are approaching
//    their redemption caps?"
//
// Why one query returning everything instead of a codes-then-stats
// two-roundtrip pattern:
// ------------------------------------------------------------------
// The codes table caps at the low hundreds in practice and each row's
// redemption stats come from a LEFT JOIN + GROUP BY — one round-trip
// lands the whole page in one Drizzle call. Splitting would just add
// latency without giving us query-planner wins.
//
// Why a window on the stats:
// --------------------------
// Lifetime stats are in promo_redemptions too (aggregated by FK) but
// operators mostly care "how did this code perform THIS month" when
// judging a campaign. Giving them the window via ?days= keeps the
// UI aligned with every other Phase D/E page. Lifetime counts are
// also surfaced so they can see "this seasonal code was massive last
// year" without a manual query.

export type PromoCodeInventoryRow = {
  id: string;
  code: string;
  kind: "percent" | "flat" | "bonus_credits";
  value: number;
  currency: string | null;
  packIds: string | null;
  annualOnly: boolean;
  maxRedemptions: number | null;
  perUserLimit: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  campaign: string | null;
  notes: string | null;
  createdAt: Date;
  createdBy: string | null;
  disabledAt: Date | null;
  disabledBy: string | null;
  /** Redemptions within the configured window (for campaign analysis). */
  windowRedemptions: number;
  /** Redemptions since the code was created (the hard cap's denominator). */
  lifetimeRedemptions: number;
  /** Sum of discount_micros given away in the window. */
  windowDiscountMicros: number;
  /** Total bonus_credits granted in the window (always 0 for percent/flat). */
  windowBonusCredits: number;
};

export type PromoInventorySnapshot = {
  windowDays: number;
  totalCodes: number;
  totalActiveCodes: number;
  /** Sum of windowDiscountMicros across all rows — top-of-page headline. */
  totalWindowDiscountMicros: number;
  totalWindowRedemptions: number;
  rows: PromoCodeInventoryRow[];
};

/**
 * Full promo code inventory with windowed + lifetime redemption stats.
 *
 * LEFT JOIN so codes that have never been redeemed (a freshly-minted
 * campaign code the day it ships) still show up with zeros. The
 * windowed aggregation uses a CASE inside COUNT so a single
 * promo_redemptions scan gives us both window and lifetime numbers —
 * cheaper than two separate aggregations.
 *
 * Clamped to [1, 365] days to cap the CASE filter cost. A year is the
 * widest reasonable "campaign analysis window"; anything beyond should
 * pull from a rollup table (none exists yet — revisit when needed).
 */
export async function getPromoCodeInventory(opts: {
  days: number;
}): Promise<PhaseEQueryResult<PromoInventorySnapshot>> {
  const days = Math.min(Math.max(opts.days, 1), 365);
  const since = new Date(Date.now() - days * msPerDay());

  try {
    const rollupRows = await db
      .select({
        id: schema.promoCodes.id,
        code: schema.promoCodes.code,
        kind: schema.promoCodes.kind,
        value: schema.promoCodes.value,
        currency: schema.promoCodes.currency,
        packIds: schema.promoCodes.packIds,
        annualOnly: schema.promoCodes.annualOnly,
        maxRedemptions: schema.promoCodes.maxRedemptions,
        perUserLimit: schema.promoCodes.perUserLimit,
        startsAt: schema.promoCodes.startsAt,
        expiresAt: schema.promoCodes.expiresAt,
        isActive: schema.promoCodes.isActive,
        campaign: schema.promoCodes.campaign,
        notes: schema.promoCodes.notes,
        createdAt: schema.promoCodes.createdAt,
        createdBy: schema.promoCodes.createdBy,
        disabledAt: schema.promoCodes.disabledAt,
        disabledBy: schema.promoCodes.disabledBy,
        windowRedemptions: sql<number>`SUM(CASE WHEN ${schema.promoRedemptions.createdAt} >= ${since} THEN 1 ELSE 0 END)`.as(
          "window_redemptions"
        ),
        lifetimeRedemptions: sql<number>`COUNT(${schema.promoRedemptions.id})`.as(
          "lifetime_redemptions"
        ),
        windowDiscountMicros: sql<number>`COALESCE(SUM(CASE WHEN ${schema.promoRedemptions.createdAt} >= ${since} THEN ${schema.promoRedemptions.discountMicros} ELSE 0 END), 0)`.as(
          "window_discount_micros"
        ),
        windowBonusCredits: sql<number>`COALESCE(SUM(CASE WHEN ${schema.promoRedemptions.createdAt} >= ${since} THEN ${schema.promoRedemptions.bonusCredits} ELSE 0 END), 0)`.as(
          "window_bonus_credits"
        ),
      })
      .from(schema.promoCodes)
      .leftJoin(
        schema.promoRedemptions,
        eq(schema.promoRedemptions.promoCodeId, schema.promoCodes.id)
      )
      .groupBy(
        schema.promoCodes.id,
        schema.promoCodes.code,
        schema.promoCodes.kind,
        schema.promoCodes.value,
        schema.promoCodes.currency,
        schema.promoCodes.packIds,
        schema.promoCodes.annualOnly,
        schema.promoCodes.maxRedemptions,
        schema.promoCodes.perUserLimit,
        schema.promoCodes.startsAt,
        schema.promoCodes.expiresAt,
        schema.promoCodes.isActive,
        schema.promoCodes.campaign,
        schema.promoCodes.notes,
        schema.promoCodes.createdAt,
        schema.promoCodes.createdBy,
        schema.promoCodes.disabledAt,
        schema.promoCodes.disabledBy
      )
      // Active codes first (operators mostly care about those), then
      // newest-created. Disabled codes sink to the bottom of the
      // table but remain visible for audit-trail purposes.
      .orderBy(desc(schema.promoCodes.isActive), desc(schema.promoCodes.createdAt));

    const rows: PromoCodeInventoryRow[] = rollupRows.map((r) => ({
      id: String(r.id),
      code: String(r.code),
      kind: r.kind as PromoCodeInventoryRow["kind"],
      value: Number(r.value),
      currency: r.currency ? String(r.currency) : null,
      packIds: r.packIds ? String(r.packIds) : null,
      annualOnly: Number(r.annualOnly) === 1,
      maxRedemptions: r.maxRedemptions !== null ? Number(r.maxRedemptions) : null,
      perUserLimit: r.perUserLimit !== null ? Number(r.perUserLimit) : null,
      startsAt: r.startsAt ?? null,
      expiresAt: r.expiresAt ?? null,
      isActive: Number(r.isActive) === 1,
      campaign: r.campaign ? String(r.campaign) : null,
      notes: r.notes ? String(r.notes) : null,
      createdAt: r.createdAt ?? new Date(0),
      createdBy: r.createdBy ? String(r.createdBy) : null,
      disabledAt: r.disabledAt ?? null,
      disabledBy: r.disabledBy ? String(r.disabledBy) : null,
      windowRedemptions: Number(r.windowRedemptions) || 0,
      lifetimeRedemptions: Number(r.lifetimeRedemptions) || 0,
      windowDiscountMicros: Number(r.windowDiscountMicros) || 0,
      windowBonusCredits: Number(r.windowBonusCredits) || 0,
    }));

    const totalActiveCodes = rows.filter((r) => r.isActive).length;
    const totalWindowDiscountMicros = rows.reduce(
      (acc, r) => acc + r.windowDiscountMicros,
      0
    );
    const totalWindowRedemptions = rows.reduce(
      (acc, r) => acc + r.windowRedemptions,
      0
    );

    return {
      ok: true,
      data: {
        windowDays: days,
        totalCodes: rows.length,
        totalActiveCodes,
        totalWindowDiscountMicros,
        totalWindowRedemptions,
        rows,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "promo_inventory_query_failed",
    };
  }
}

// ---------------------------------------------------------------------
// /admin/promos?user=<id> — per-user redemption drill-down
// ---------------------------------------------------------------------
//
// Answers "did this specific customer redeem any promo codes, and
// which ones?". Called from the admin user-detail surface when
// investigating a refund, fraud report, or support ticket. Small
// result set so we don't paginate — just cap at 200 rows and call it.

export type AdminPromoRedemptionRow = {
  id: string;
  promoCodeId: string;
  code: string;
  campaign: string | null;
  kind: "percent" | "flat" | "bonus_credits";
  discountMicros: number;
  bonusCredits: number;
  currency: string;
  packId: string | null;
  annualVariant: boolean;
  paymentId: string;
  redeemedAt: Date;
};

export async function getPromoRedemptionsForUser(opts: {
  userId: string;
}): Promise<PhaseEQueryResult<AdminPromoRedemptionRow[]>> {
  try {
    const rows = await db
      .select({
        id: schema.promoRedemptions.id,
        promoCodeId: schema.promoRedemptions.promoCodeId,
        code: schema.promoCodes.code,
        campaign: schema.promoCodes.campaign,
        kind: schema.promoCodes.kind,
        discountMicros: schema.promoRedemptions.discountMicros,
        bonusCredits: schema.promoRedemptions.bonusCredits,
        currency: schema.promoRedemptions.currency,
        packId: schema.promoRedemptions.packId,
        annualVariant: schema.promoRedemptions.annualVariant,
        paymentId: schema.promoRedemptions.paymentId,
        redeemedAt: schema.promoRedemptions.createdAt,
      })
      .from(schema.promoRedemptions)
      .innerJoin(
        schema.promoCodes,
        eq(schema.promoRedemptions.promoCodeId, schema.promoCodes.id)
      )
      .where(eq(schema.promoRedemptions.userId, opts.userId))
      .orderBy(desc(schema.promoRedemptions.createdAt))
      .limit(200);

    return {
      ok: true,
      data: rows.map((r) => ({
        id: String(r.id),
        promoCodeId: String(r.promoCodeId),
        code: String(r.code),
        campaign: r.campaign ? String(r.campaign) : null,
        kind: r.kind as AdminPromoRedemptionRow["kind"],
        discountMicros: Number(r.discountMicros ?? 0),
        bonusCredits: Number(r.bonusCredits ?? 0),
        currency: String(r.currency),
        packId: r.packId ? String(r.packId) : null,
        annualVariant: Number(r.annualVariant ?? 0) === 1,
        paymentId: String(r.paymentId),
        redeemedAt: r.redeemedAt ?? new Date(0),
      })),
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "promo_user_redemptions_query_failed",
    };
  }
}
