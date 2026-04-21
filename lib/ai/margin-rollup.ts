// Daily AI margin rollup — Phase A4, MASTER_PLAN §7 gate #7 / task #22.
//
// Purpose
// -------
// Turns the per-call `ai_usage` audit log into a per-day-per-slice
// aggregate (`ai_daily_margin`) so the admin dashboard can answer
// "did every slice hit its margin floor every day this week?" in a
// single indexed range scan. Gate #7 closes when 7 consecutive days
// show zero red slices (is_green = 1 on every row for each day).
//
// How it runs
// -----------
// `/api/cron/ai-margin-rollup` (POST or GET with `x-cron-secret` header)
// calls `runDailyRollup()` once a day, shortly after midnight UTC. The
// endpoint is the same Hostinger-cron shape as `/api/cron/reconcile-payments`.
//
// Revenue methodology — why the proxy and not real per-user revenue
// -----------------------------------------------------------------
// The clean answer would be: join each `ai_usage` row to the credit
// pack the user last purchased, multiply `credits_spent` by that
// pack's per-credit price, and sum. Two problems:
//   1. The join is expensive and the pack-to-user binding is fuzzy
//      (users buy multiple packs, ledger.source may be gift/promo,
//      etc.).
//   2. We don't actually know which pack's price "paid for" a given
//      credit burn — credits are a fungible bucket.
// Instead we use a fleet-wide proxy: 30,000 µUSD per credit. That's
// the midpoint of Creator ($0.036 = 36,000 µUSD/credit) and Pro
// ($0.027 = 27,000 µUSD/credit) — the two highest-traffic tiers by
// revenue share. Using this proxy:
//   - If most traffic is Creator-tier, we under-report margin slightly
//     (real revenue is higher than proxy) — conservative. ✅
//   - If most traffic is Pro-tier, we over-report margin slightly
//     (real revenue is lower) — we compensate with conservative
//     floor_bps values (see OP_MARGIN_FLOOR_BPS below).
//   - Starter ($0.050/credit) and Studio ($0.022/credit) skew in
//     opposite directions and roughly cancel.
// The floor thresholds are set against MARGIN_VERIFICATION.md's
// WORST-CASE column (docs/ai/MARGIN_VERIFICATION.md §1.5), not the
// happy-path column, so a slice that comes up "green" against the
// proxy is green under real per-user revenue math too.
//
// Idempotency
// -----------
// Re-running the rollup for the same day is safe. The INSERT uses
// `ON DUPLICATE KEY UPDATE` against the unique
// (date, provider_id, model, operation) index, so a second run
// overwrites the previous slice rather than inserting a duplicate.
// This matters because the cron can be triggered manually for
// backfills without corrupting history.
//
// Green-streak semantics
// ----------------------
// A day counts as "all green" if every slice written for that date
// has is_green = 1. An absence of data for a day (no ai_usage calls
// the day before → no rollup rows) is treated as NOT-green — we'd
// rather under-count than have a silent streak increment through an
// outage window.

import "server-only";
import { and, eq, gte, lt, desc, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/db/client";

// --- Constants --------------------------------------------------------

/**
 * Revenue proxy: µUSD per credit. 30,000 = midpoint of Creator and
 * Pro per-credit prices. See top-of-file rationale. Exported because
 * the test harness + admin dashboard both pin against this value.
 */
export const REFERENCE_USD_MICROS_PER_CREDIT = 30_000;

/**
 * Per-op margin floor in basis points (bps; 10,000 = 100%).
 *
 * Keys match `AIOperationId` from lib/pricing.ts — NOT `AIOp` from
 * lib/ai/router.ts. The distinction matters: `ai_usage.operation`
 * is written with the pricing-side id (`chat_turn`, not `chat`),
 * and `/api/ai/chat` passes `operation: "chat_turn"` to
 * recordAiUsage().
 *
 * Values chosen against MARGIN_VERIFICATION.md's worst-case column:
 *   - OCR / translate / compare / redact — Gemini-primary ops, 70%+
 *     margin in worst case. 70% floor gives headroom for OpenAI
 *     failover without a red slice.
 *   - Summarize / rewrite / table — 65-70% range depending on model
 *     mix. 65% floor.
 *   - Chat / generate / sign — long-form + streaming, tightest
 *     margins because of high output-token counts. 60% floor.
 *
 * If a new op is added to AIOperationId without a floor entry,
 * `floorForOp()` falls back to DEFAULT_FLOOR_BPS (6,000 = 60%) — the
 * conservative default. A TODO-style comment isn't enough; we want
 * the test harness to fail if an AIOperationId entry goes missing.
 */
export const OP_MARGIN_FLOOR_BPS: Record<string, number> = {
  chat_turn: 6000, // 60% — most variable token output
  summarize: 6500, // 65%
  translate: 7000, // 70% — Gemini primary
  ocr: 7000, // 70% — Gemini primary
  compare: 7000, // 70% — flat 15-credit price, tight content budget
  rewrite: 6500, // 65%
  table: 6500, // 65%
  redact: 7000, // 70%
  generate: 6000, // 60% — long-form, high output-token
  sign: 6500, // 65% — detection + short narrative
};

const DEFAULT_FLOOR_BPS = 6000;

/**
 * Clamp range for margin_bps. Matches the int range we use in the
 * DB column (signed int is big enough; we clamp to this narrower
 * range purely for interpretability — a margin > 100% is noise, a
 * margin < -100% is "we lost more than we made", both represented
 * as the saturation value).
 */
const MARGIN_BPS_MIN = -10_000;
const MARGIN_BPS_MAX = 10_000;

// --- Pure compute ------------------------------------------------------

/**
 * Per-op floor lookup. Unknown ops fall through to DEFAULT_FLOOR_BPS.
 *
 * Exported so the test harness can pin the exact floor per op without
 * re-importing the table.
 */
export function floorForOp(operation: string): number {
  return OP_MARGIN_FLOOR_BPS[operation] ?? DEFAULT_FLOOR_BPS;
}

/**
 * Margin in basis points. Pure function — no I/O.
 *
 *   marginBps = (revenueMicros - costMicros) / revenueMicros * 10_000
 *
 * Edge cases:
 *   - revenueMicros = 0 → MARGIN_BPS_MIN (the slice is unambiguously
 *     red; we didn't earn anything). This also covers the error-only
 *     slice case (all calls errored, no credits spent, but cost may
 *     still be non-zero if the upstream billed us for the failed
 *     request).
 *   - revenueMicros > 0, costMicros = 0 → +10_000 (free is infinity
 *     margin, capped at 100%).
 *   - result outside [MIN, MAX] → clamped. Interior results never
 *     hit saturation so normal green/red classification is unaffected.
 */
export function computeMarginBps(input: {
  revenueMicros: number;
  costMicros: number;
}): number {
  const { revenueMicros, costMicros } = input;
  if (revenueMicros <= 0) return MARGIN_BPS_MIN;
  const raw = Math.round(
    ((revenueMicros - costMicros) / revenueMicros) * 10_000
  );
  if (raw < MARGIN_BPS_MIN) return MARGIN_BPS_MIN;
  if (raw > MARGIN_BPS_MAX) return MARGIN_BPS_MAX;
  return raw;
}

/**
 * Revenue proxy given a credit burn. `revenueMicros = creditsSpent *
 * REFERENCE_USD_MICROS_PER_CREDIT`. Pulled out so the test harness
 * can pin the math.
 */
export function revenueMicrosFromCredits(creditsSpent: number): number {
  return Math.max(0, Math.floor(creditsSpent)) * REFERENCE_USD_MICROS_PER_CREDIT;
}

// --- UTC date helpers -------------------------------------------------

/**
 * Format a Date as `YYYY-MM-DD` in UTC. MySQL DATE column accepts
 * this string directly. Pulling this out so the rollup + streak
 * queries all use the same formatting and we don't accidentally
 * mix in local time.
 */
export function utcDateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Start-of-day in UTC (ms since epoch). Used to bound the ai_usage
 * range query on a date. `utcDayStart(d)` is 00:00:00.000 UTC on
 * the same calendar date as `d`.
 */
export function utcDayStart(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  );
}

/**
 * Resolve which calendar day to roll up. Default is yesterday UTC —
 * the most recent fully-complete day. Accepts an explicit override
 * for backfills.
 */
function resolveTargetDate(explicit?: string): {
  dateStr: string;
  windowStart: Date;
  windowEnd: Date;
} {
  let dateStr: string;
  if (explicit) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
      throw new Error(`Invalid targetDate "${explicit}" — expected YYYY-MM-DD`);
    }
    dateStr = explicit;
  } else {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    dateStr = utcDateString(yesterday);
  }
  // Parse back to bounded Date range. Date-only strings are treated as
  // UTC midnight by the Date constructor (`new Date("2026-04-20")` ==
  // 2026-04-20T00:00:00.000Z).
  const windowStart = new Date(`${dateStr}T00:00:00.000Z`);
  const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
  return { dateStr, windowStart, windowEnd };
}

// --- Rollup report types ----------------------------------------------

export type SliceReport = {
  providerId: string;
  model: string;
  operation: string;
  callCount: number;
  successCount: number;
  errorCount: number;
  costMicrosSum: number;
  revenueMicrosSum: number;
  creditsSpentSum: number;
  marginBps: number;
  floorBps: number;
  isGreen: boolean;
};

export type DailyRollupReport = {
  startedAt: string;
  finishedAt: string;
  date: string;
  sliceCount: number;
  greenCount: number;
  redCount: number;
  allGreen: boolean;
  slices: SliceReport[];
  /**
   * After this rollup lands, how many CONSECUTIVE days (including
   * the rolled-up date) are all-green. Computed via computeGreenStreak
   * — so it's authoritative rather than client-derived.
   */
  greenStreakDays: number;
};

// --- Main entry point --------------------------------------------------

/**
 * Roll up a calendar day's ai_usage into ai_daily_margin. Returns a
 * report the cron endpoint can log and (optionally) post to Slack
 * if any slice is red.
 *
 * Caller-provided `targetDate`: YYYY-MM-DD UTC. Defaults to yesterday.
 *
 * Implementation notes:
 *   - We run ONE GROUP BY query over ai_usage, iterate the resulting
 *     slices in Node, compute margin/green per slice, then issue ONE
 *     bulk INSERT with ON DUPLICATE KEY UPDATE. For low slice counts
 *     (< ~200 per day) this is well within a single MySQL round-trip.
 *   - If the day has zero ai_usage rows, we write nothing. The
 *     green-streak computation treats an empty day as not-green so
 *     this doesn't silently extend a streak through an outage.
 */
export async function runDailyRollup(
  opts: { targetDate?: string } = {}
): Promise<DailyRollupReport> {
  const startedAt = new Date();
  const { dateStr, windowStart, windowEnd } = resolveTargetDate(opts.targetDate);

  // 1. Aggregate ai_usage slices.
  //
  // We use raw SQL here instead of Drizzle's groupBy builder because
  // the aggregate expressions want MySQL-specific COALESCE + SUM(CASE
  // WHEN ...) and inlining them via sql`` keeps the query explicit.
  // Parameters are bound via sql.placeholder-free template literals
  // (Drizzle's sql`` escapes Date parameters safely).
  type AggRow = {
    provider_id: string;
    model: string;
    operation: string;
    call_count: number;
    success_count: number;
    error_count: number;
    input_tokens_sum: number;
    output_tokens_sum: number;
    latency_ms_sum: number;
    credits_spent_sum: number;
    cost_micros_sum: number;
  };

  const aggRows = (await db
    .select({
      provider_id: schema.aiUsage.providerId,
      model: schema.aiUsage.model,
      operation: schema.aiUsage.operation,
      call_count: sql<number>`COUNT(*)`,
      success_count: sql<number>`COALESCE(SUM(CASE WHEN ${schema.aiUsage.success} = 1 THEN 1 ELSE 0 END), 0)`,
      error_count: sql<number>`COALESCE(SUM(CASE WHEN ${schema.aiUsage.success} = 0 THEN 1 ELSE 0 END), 0)`,
      input_tokens_sum: sql<number>`COALESCE(SUM(${schema.aiUsage.inputTokens}), 0)`,
      output_tokens_sum: sql<number>`COALESCE(SUM(${schema.aiUsage.outputTokens}), 0)`,
      latency_ms_sum: sql<number>`COALESCE(SUM(${schema.aiUsage.latencyMs}), 0)`,
      credits_spent_sum: sql<number>`COALESCE(SUM(${schema.aiUsage.creditsSpent}), 0)`,
      cost_micros_sum: sql<number>`COALESCE(SUM(${schema.aiUsage.costMicros}), 0)`,
    })
    .from(schema.aiUsage)
    .where(
      and(
        gte(schema.aiUsage.createdAt, windowStart),
        lt(schema.aiUsage.createdAt, windowEnd)
      )
    )
    .groupBy(
      schema.aiUsage.providerId,
      schema.aiUsage.model,
      schema.aiUsage.operation
    )) as unknown as AggRow[];

  // 2. Compute margin / floor / green per slice and build the INSERT
  //    values. MySQL accepts numeric strings for DATE columns so we
  //    pass the YYYY-MM-DD string unchanged.
  const slices: SliceReport[] = [];
  const insertValues: Array<{
    id: string;
    date: string;
    providerId: string;
    model: string;
    operation: string;
    callCount: number;
    successCount: number;
    errorCount: number;
    inputTokensSum: number;
    outputTokensSum: number;
    latencyMsSum: number;
    creditsSpentSum: number;
    costMicrosSum: number;
    revenueMicrosSum: number;
    marginBps: number;
    floorBps: number;
    isGreen: number;
  }> = [];

  for (const row of aggRows) {
    const creditsSpentSum = Number(row.credits_spent_sum) || 0;
    const costMicrosSum = Number(row.cost_micros_sum) || 0;
    const revenueMicrosSum = revenueMicrosFromCredits(creditsSpentSum);
    const marginBps = computeMarginBps({
      revenueMicros: revenueMicrosSum,
      costMicros: costMicrosSum,
    });
    const floorBps = floorForOp(row.operation);
    const isGreen = marginBps >= floorBps;

    slices.push({
      providerId: row.provider_id,
      model: row.model,
      operation: row.operation,
      callCount: Number(row.call_count) || 0,
      successCount: Number(row.success_count) || 0,
      errorCount: Number(row.error_count) || 0,
      costMicrosSum,
      revenueMicrosSum,
      creditsSpentSum,
      marginBps,
      floorBps,
      isGreen,
    });

    insertValues.push({
      id: randomUUID(),
      date: dateStr,
      providerId: row.provider_id,
      model: row.model,
      operation: row.operation,
      callCount: Number(row.call_count) || 0,
      successCount: Number(row.success_count) || 0,
      errorCount: Number(row.error_count) || 0,
      inputTokensSum: Number(row.input_tokens_sum) || 0,
      outputTokensSum: Number(row.output_tokens_sum) || 0,
      latencyMsSum: Number(row.latency_ms_sum) || 0,
      creditsSpentSum,
      costMicrosSum,
      revenueMicrosSum,
      marginBps,
      floorBps,
      isGreen: isGreen ? 1 : 0,
    });
  }

  // 3. Upsert. We do the ON DUPLICATE KEY UPDATE via Drizzle's MySQL
  //    `.onDuplicateKeyUpdate()` — updates every non-key column to
  //    the new value so a re-run with corrected data cleanly
  //    overwrites the previous slice.
  if (insertValues.length > 0) {
    await db
      .insert(schema.aiDailyMargin)
      .values(insertValues)
      .onDuplicateKeyUpdate({
        set: {
          callCount: sql`VALUES(call_count)`,
          successCount: sql`VALUES(success_count)`,
          errorCount: sql`VALUES(error_count)`,
          inputTokensSum: sql`VALUES(input_tokens_sum)`,
          outputTokensSum: sql`VALUES(output_tokens_sum)`,
          latencyMsSum: sql`VALUES(latency_ms_sum)`,
          creditsSpentSum: sql`VALUES(credits_spent_sum)`,
          costMicrosSum: sql`VALUES(cost_micros_sum)`,
          revenueMicrosSum: sql`VALUES(revenue_micros_sum)`,
          marginBps: sql`VALUES(margin_bps)`,
          floorBps: sql`VALUES(floor_bps)`,
          isGreen: sql`VALUES(is_green)`,
        },
      });
  }

  const greenCount = slices.filter((s) => s.isGreen).length;
  const redCount = slices.length - greenCount;
  const allGreen = slices.length > 0 && redCount === 0;

  // 4. Recompute the green streak INCLUDING the just-written row so
  //    the Slack/monitoring emitter gets an authoritative value.
  const greenStreakDays = await computeGreenStreak({ throughDate: dateStr });

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    date: dateStr,
    sliceCount: slices.length,
    greenCount,
    redCount,
    allGreen,
    slices,
    greenStreakDays,
  };
}

// --- Streak computation ------------------------------------------------

/**
 * How many consecutive all-green days ending on `throughDate` (UTC)?
 *
 * Algorithm:
 *   1. Read the last `maxDays` distinct dates from ai_daily_margin
 *      with is_green counts aggregated per date.
 *   2. Walk backward from `throughDate`. For each day, it's green IFF
 *      a row exists AND every slice has is_green = 1 (i.e. red_count
 *      = 0). First day that's not-green stops the walk.
 *
 * `maxDays` is a safety ceiling — we never walk more than 30 days
 * back because the gate-7 target is 7, and 30 leaves slack for
 * analysis queries without an accidental table scan on long-lived
 * data.
 */
export async function computeGreenStreak(
  opts: { throughDate?: string; maxDays?: number } = {}
): Promise<number> {
  const throughDate = opts.throughDate
    ? opts.throughDate
    : utcDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const maxDays = Math.max(1, Math.min(opts.maxDays ?? 30, 90));

  // Aggregate per-date green counts. Lower-bound the range to
  // throughDate - maxDays for index friendliness.
  const throughStart = new Date(`${throughDate}T00:00:00.000Z`);
  const lowerBound = new Date(
    throughStart.getTime() - (maxDays - 1) * 24 * 60 * 60 * 1000
  );
  const lowerStr = utcDateString(lowerBound);

  type DailyRow = {
    date: string;
    slice_count: number;
    green_count: number;
    red_count: number;
  };

  const dailyRows = (await db
    .select({
      date: schema.aiDailyMargin.date,
      slice_count: sql<number>`COUNT(*)`,
      green_count: sql<number>`COALESCE(SUM(CASE WHEN ${schema.aiDailyMargin.isGreen} = 1 THEN 1 ELSE 0 END), 0)`,
      red_count: sql<number>`COALESCE(SUM(CASE WHEN ${schema.aiDailyMargin.isGreen} = 0 THEN 1 ELSE 0 END), 0)`,
    })
    .from(schema.aiDailyMargin)
    .where(
      and(
        gte(schema.aiDailyMargin.date, lowerStr),
        lt(
          schema.aiDailyMargin.date,
          utcDateString(new Date(throughStart.getTime() + 24 * 60 * 60 * 1000))
        )
      )
    )
    .groupBy(schema.aiDailyMargin.date)
    .orderBy(desc(schema.aiDailyMargin.date))) as unknown as DailyRow[];

  // Build a date → (slice_count, red_count) map.
  const byDate = new Map<string, { slice: number; red: number }>();
  for (const r of dailyRows) {
    byDate.set(r.date, {
      slice: Number(r.slice_count) || 0,
      red: Number(r.red_count) || 0,
    });
  }

  // Walk backward from throughDate. Absent day or any red slice stops
  // the streak.
  let streak = 0;
  for (let i = 0; i < maxDays; i++) {
    const d = utcDateString(
      new Date(throughStart.getTime() - i * 24 * 60 * 60 * 1000)
    );
    const row = byDate.get(d);
    if (!row) break; // no data → not green → stop.
    if (row.slice === 0) break; // shouldn't happen given COUNT(*) > 0 filter, defensive.
    if (row.red > 0) break; // at least one red slice → stop.
    streak += 1;
  }

  return streak;
}

// --- Slack emitter (optional) -----------------------------------------

/**
 * Post a margin alert to Slack if `AI_SPEND_ALERT_SLACK_URL` is set.
 *
 * No-ops (returns false) if the webhook isn't configured or the post
 * fails — we NEVER throw from a monitoring hook, because that would
 * fail the cron request and mask the rollup itself succeeding. A
 * failed Slack post is logged to console and swallowed.
 *
 * Called by the cron route when `redCount > 0` OR streak hits 7
 * (both deserve a message — alerts on red, celebrations on gate-close).
 */
export async function postMarginAlertToSlack(
  report: DailyRollupReport
): Promise<boolean> {
  const url = process.env.AI_SPEND_ALERT_SLACK_URL;
  if (!url) return false;

  const redSlices = report.slices.filter((s) => !s.isGreen);
  let text: string;
  if (redSlices.length > 0) {
    text =
      `:warning: *AI margin alert — ${report.date}*\n` +
      `${redSlices.length} red slice(s), ${report.greenCount} green. ` +
      `Streak reset to 0.\n` +
      redSlices
        .slice(0, 10)
        .map(
          (s) =>
            `• \`${s.providerId}/${s.model}/${s.operation}\` ` +
            `margin ${(s.marginBps / 100).toFixed(2)}% ` +
            `vs floor ${(s.floorBps / 100).toFixed(2)}% ` +
            `(${s.callCount} calls, $${(s.costMicrosSum / 1_000_000).toFixed(4)} cost)`
        )
        .join("\n");
  } else {
    text =
      `:white_check_mark: *AI margin — ${report.date} all green*\n` +
      `${report.greenCount} slice(s) green, streak now *${report.greenStreakDays}* day(s).` +
      (report.greenStreakDays >= 7
        ? "  :tada: Gate #7 target reached."
        : "");
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.warn(
        `[margin-rollup] Slack post returned ${res.status} ${res.statusText}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[margin-rollup] Slack post failed:", err);
    return false;
  }
}

// --- Admin dashboard surface ------------------------------------------
//
// Task #22 deliverable — the cron writes ai_daily_margin every night,
// but until there's a read-side endpoint nobody can look at it outside
// of a raw SQL shell. These helpers back `/api/admin/margin`.
//
// Design note: we keep one aggregate query (per-day counts) + one
// detail query (recent red slices, capped) instead of returning the
// full per-slice table. The full table on a 30-day window with ~50
// ops × ~4 providers/models would be 1500+ rows; the dashboard only
// ever shows "how many days red / green this week" + "which slices
// tripped the floor". The detail query is scoped to the visible range
// so a red slice from day 60 doesn't surface when looking at the last
// 7 days.

/**
 * Max window an admin request can ask for. 90 days matches the cron's
 * `maxDays` ceiling in `computeGreenStreak`. Gives a full quarter
 * without risking an unindexed scan.
 */
export const ADMIN_MARGIN_MAX_DAYS = 90;

/**
 * Default admin window when the caller doesn't supply `?days=`.
 * 14 is "two weeks, enough to visually confirm the 7-day streak"
 * and fits on a single dashboard row without scrolling.
 */
export const ADMIN_MARGIN_DEFAULT_DAYS = 14;

/**
 * Per-day summary row returned to the admin dashboard.
 *
 * `minMarginBps` / `maxMarginBps` are the slice extremes for that day;
 * they're what the dashboard uses to draw the bar-chart floor line so
 * the operator can eyeball how close each day is to the red zone
 * without opening the full slice table.
 */
export type AdminMarginDaySummary = {
  date: string; // YYYY-MM-DD UTC
  sliceCount: number;
  greenCount: number;
  redCount: number;
  allGreen: boolean;
  minMarginBps: number; // worst slice of the day
  maxMarginBps: number; // best slice of the day
  totalCostMicros: number;
  totalRevenueMicros: number;
};

/**
 * Flat row for a red slice, returned so the admin dashboard can show
 * "which exact slices tripped the floor". Shape mirrors
 * ai_daily_margin's columns minus the bookkeeping fields (`id`,
 * `createdAt`).
 */
export type AdminMarginRedSlice = {
  date: string;
  providerId: string;
  model: string;
  operation: string;
  callCount: number;
  marginBps: number;
  floorBps: number;
  costMicrosSum: number;
  revenueMicrosSum: number;
};

export type AdminMarginSummary = {
  generatedAt: string;
  range: { from: string; to: string; days: number };
  currentStreakDays: number;
  gate7Reached: boolean;
  days: AdminMarginDaySummary[]; // newest first
  recentRedSlices: AdminMarginRedSlice[]; // newest first, capped
  floorBpsByOp: Record<string, number>;
};

/**
 * Normalise `?days=` query input. Clamps to [1, 90] and falls back to
 * the default on non-integers. Pure — no I/O. Pulled out so the test
 * harness can pin the clamp behaviour without spinning a route.
 */
export function clampAdminDays(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") {
    return ADMIN_MARGIN_DEFAULT_DAYS;
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return ADMIN_MARGIN_DEFAULT_DAYS;
  }
  if (n < 1) return 1;
  if (n > ADMIN_MARGIN_MAX_DAYS) return ADMIN_MARGIN_MAX_DAYS;
  return n;
}

/**
 * Parse `ADMIN_EMAILS` env var into a lowercase-normalised Set. Pure —
 * no side effects, fine to call per-request (the string is short and
 * comma-splitting + trimming is O(bytes) trivial). Defaults to the
 * founder's email so a fresh deploy before the env var lands doesn't
 * lock the admin out.
 *
 * Exported so the test harness can pin the parse semantics without
 * importing the route.
 */
export function parseAdminEmails(raw: string | undefined): Set<string> {
  const FOUNDER_FALLBACK = "rajasekarjavaee@gmail.com";
  if (!raw || !raw.trim()) return new Set([FOUNDER_FALLBACK]);
  const emails = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && s.includes("@"));
  if (emails.length === 0) return new Set([FOUNDER_FALLBACK]);
  return new Set(emails);
}

/**
 * Is `email` allowed to hit admin-only endpoints? Case-insensitive.
 * Returns false on null/undefined.
 */
export function isAdminEmail(
  email: string | null | undefined,
  raw: string | undefined
): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).has(email.toLowerCase());
}

/**
 * Build the admin dashboard summary. One GROUP BY query for the per-
 * day counts + one ordered LIMIT for recent red slices. Streak is
 * computed via the existing `computeGreenStreak()` so the dashboard
 * and the cron agree on what "consecutive" means.
 *
 * Window semantics: `days=14` means "the 14 calendar days ending
 * yesterday UTC" — i.e. the same day range the cron would have
 * written rollups for.
 */
export async function getAdminMarginSummary(
  opts: { days?: number; redSliceLimit?: number } = {}
): Promise<AdminMarginSummary> {
  const days = clampAdminDays(opts.days ?? ADMIN_MARGIN_DEFAULT_DAYS);
  const redSliceLimit = Math.max(
    1,
    Math.min(opts.redSliceLimit ?? 10, 50)
  );

  // Window ends on yesterday UTC (the most recent fully-complete day
  // the cron would have written). Start is (days - 1) days before that,
  // inclusive.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const toStr = utcDateString(yesterday);
  const fromDate = new Date(
    utcDayStart(yesterday).getTime() - (days - 1) * 24 * 60 * 60 * 1000
  );
  const fromStr = utcDateString(fromDate);

  type DailyAggRow = {
    date: string;
    slice_count: number;
    green_count: number;
    red_count: number;
    min_margin_bps: number;
    max_margin_bps: number;
    total_cost: string | number;
    total_revenue: string | number;
  };

  const dailyRows = (await db
    .select({
      date: schema.aiDailyMargin.date,
      slice_count: sql<number>`COUNT(*)`,
      green_count: sql<number>`COALESCE(SUM(CASE WHEN ${schema.aiDailyMargin.isGreen} = 1 THEN 1 ELSE 0 END), 0)`,
      red_count: sql<number>`COALESCE(SUM(CASE WHEN ${schema.aiDailyMargin.isGreen} = 0 THEN 1 ELSE 0 END), 0)`,
      min_margin_bps: sql<number>`MIN(${schema.aiDailyMargin.marginBps})`,
      max_margin_bps: sql<number>`MAX(${schema.aiDailyMargin.marginBps})`,
      total_cost: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.costMicrosSum}), 0)`,
      total_revenue: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.revenueMicrosSum}), 0)`,
    })
    .from(schema.aiDailyMargin)
    .where(
      and(
        gte(schema.aiDailyMargin.date, fromStr),
        // lt() against the day AFTER `toStr` so we include toStr itself.
        lt(
          schema.aiDailyMargin.date,
          utcDateString(new Date(utcDayStart(yesterday).getTime() + 24 * 60 * 60 * 1000))
        )
      )
    )
    .groupBy(schema.aiDailyMargin.date)
    .orderBy(desc(schema.aiDailyMargin.date))) as unknown as DailyAggRow[];

  const dayRows: AdminMarginDaySummary[] = dailyRows.map((r) => {
    const sliceCount = Number(r.slice_count) || 0;
    const greenCount = Number(r.green_count) || 0;
    const redCount = Number(r.red_count) || 0;
    return {
      date: r.date,
      sliceCount,
      greenCount,
      redCount,
      allGreen: sliceCount > 0 && redCount === 0,
      minMarginBps: Number(r.min_margin_bps) || 0,
      maxMarginBps: Number(r.max_margin_bps) || 0,
      totalCostMicros: Number(r.total_cost) || 0,
      totalRevenueMicros: Number(r.total_revenue) || 0,
    };
  });

  // Recent red slices inside the window. Ordered newest-first, capped.
  const redSliceRows = (await db
    .select({
      date: schema.aiDailyMargin.date,
      providerId: schema.aiDailyMargin.providerId,
      model: schema.aiDailyMargin.model,
      operation: schema.aiDailyMargin.operation,
      callCount: schema.aiDailyMargin.callCount,
      marginBps: schema.aiDailyMargin.marginBps,
      floorBps: schema.aiDailyMargin.floorBps,
      costMicrosSum: schema.aiDailyMargin.costMicrosSum,
      revenueMicrosSum: schema.aiDailyMargin.revenueMicrosSum,
    })
    .from(schema.aiDailyMargin)
    .where(
      and(
        gte(schema.aiDailyMargin.date, fromStr),
        lt(
          schema.aiDailyMargin.date,
          utcDateString(new Date(utcDayStart(yesterday).getTime() + 24 * 60 * 60 * 1000))
        ),
        eq(schema.aiDailyMargin.isGreen, 0)
      )
    )
    .orderBy(desc(schema.aiDailyMargin.date))
    .limit(redSliceLimit)) as unknown as AdminMarginRedSlice[];

  const recentRedSlices: AdminMarginRedSlice[] = redSliceRows.map((r) => ({
    date: r.date,
    providerId: r.providerId,
    model: r.model,
    operation: r.operation,
    callCount: Number(r.callCount) || 0,
    marginBps: Number(r.marginBps) || 0,
    floorBps: Number(r.floorBps) || 0,
    costMicrosSum: Number(r.costMicrosSum) || 0,
    revenueMicrosSum: Number(r.revenueMicrosSum) || 0,
  }));

  const currentStreakDays = await computeGreenStreak({ throughDate: toStr });

  return {
    generatedAt: new Date().toISOString(),
    range: { from: fromStr, to: toStr, days },
    currentStreakDays,
    gate7Reached: currentStreakDays >= 7,
    days: dayRows,
    recentRedSlices,
    floorBpsByOp: { ...OP_MARGIN_FLOOR_BPS },
  };
}
