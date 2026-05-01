// lib/admin/queries.ts — server-side data aggregators for the /admin/*
// pages.
//
// Why one module instead of per-page files
// ----------------------------------------
// Every admin page needs to run 1–3 GROUP BY queries against one or
// two tables. Colocating those queries here gives the reviewer a single
// place to audit "what can the admin surface see?" and makes it
// obvious when two pages are selecting the same underlying data
// differently (which was the #1 source of drift in the prototype's
// admin panel).
//
// Every helper returns POJOs — never a Drizzle row proxy — so the
// React server component can spread them into props without worrying
// about JSON-serialisation of non-enumerable fields.
//
// Every helper wraps its main statement in a try/catch that logs the
// error, returns a safe empty shape, and sets an `error` field. The
// page renderer checks `error` and shows "query failed" instead of
// crashing the whole dashboard — one bad column on one page should
// never dark-hole the whole /admin surface.
//
// Time windows
// ------------
// All "last N days" windows end at "now" — not "yesterday UTC" like
// the margin cron. The cron writes aggregates for complete days only;
// these endpoints display live data up to the moment the page was
// rendered, so an operator investigating a RIGHT NOW issue can see
// it. "30d" therefore means "the past 30 × 24 hours counting back
// from the query time."

import "server-only";

import { and, asc, desc, eq, gte, isNotNull, lt, ne, sql } from "drizzle-orm";

import { db, schema } from "@/db/client";
import {
  BREAKAGE_SYNTHETIC_SLICE,
  INFRA_MONTHLY_USD_MICROS,
  REFERENCE_USD_MICROS_PER_CREDIT,
  REFUND_RESERVE_BPS,
} from "@/lib/ai/margin-rollup";

/**
 * A consistent error-wrapped query result. Every admin helper returns
 * one of these so the page renderer can branch on `.error` once.
 */
export type AdminQueryResult<T> = {
  data: T;
  error: string | null;
};

function ok<T>(data: T): AdminQueryResult<T> {
  return { data, error: null };
}

function fail<T>(fallback: T, err: unknown): AdminQueryResult<T> {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error("[admin-queries] query failed:", message);
  return { data: fallback, error: message };
}

function msPerDay(): number {
  return 24 * 60 * 60 * 1000;
}

// --- /admin overview --------------------------------------------------

export type OverviewSummary = {
  last30dNetRevenueMicros: number;
  last30dGrossChargeMicros: number;
  last30dTaxCollectedMicros: number;
  last30dProcessorFeeMicros: number;
  last30dAiCostMicros: number;
  last30dInfraCostMicros: number;
  last30dRefundReserveMicros: number;
  last30dBreakageMicros: number;
  netMarginBps: number;
  last30dCallCount: number;
  last30dGreenDays: number;
  last30dRedDays: number;
  last30dSignups: number;
  totalUsers: number;
};

export async function getOverviewSummary(): Promise<
  AdminQueryResult<OverviewSummary>
> {
  const since = new Date(Date.now() - 30 * msPerDay());
  try {
    // Credit ledger side — gross / net / fee / tax over the window.
    const [ledgerAgg] = await db
      .select({
        gross: sql<number>`COALESCE(SUM(${schema.creditLedger.grossChargeMicros}), 0)`,
        net: sql<number>`COALESCE(SUM(${schema.creditLedger.netRevenueMicros}), 0)`,
        fee: sql<number>`COALESCE(SUM(${schema.creditLedger.processorFeeMicros}), 0)`,
        tax: sql<number>`COALESCE(SUM(${schema.creditLedger.taxCollectedMicros}), 0)`,
      })
      .from(schema.creditLedger)
      .where(gte(schema.creditLedger.createdAt, since));

    // AI margin rollup side — cost / infra / reserve / breakage / call
    // count / green-day count. Excludes the synthetic breakage slice
    // from cost & call-count totals (infra and reserve are already
    // NULL on that slice; excluding it keeps gross-cost math honest).
    const [marginAgg] = await db
      .select({
        cost: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.costMicrosSum}), 0)`,
        calls: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.callCount}), 0)`,
        infra: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.infraCostPerCallMicros} * ${schema.aiDailyMargin.callCount}), 0)`,
        reserve: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.refundReserveMicros}), 0)`,
      })
      .from(schema.aiDailyMargin)
      .where(
        and(
          gte(schema.aiDailyMargin.date, sliceDate(since)),
          ne(schema.aiDailyMargin.providerId, BREAKAGE_SYNTHETIC_SLICE.providerId)
        )
      );

    const [breakageAgg] = await db
      .select({
        breakage: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.breakageRevenueMicros}), 0)`,
      })
      .from(schema.aiDailyMargin)
      .where(
        and(
          gte(schema.aiDailyMargin.date, sliceDate(since)),
          eq(schema.aiDailyMargin.providerId, BREAKAGE_SYNTHETIC_SLICE.providerId)
        )
      );

    // Per-day green/red tally — a day is "green" iff every slice that
    // day has is_green = 1.
    const greenRows = await db
      .select({
        d: schema.aiDailyMargin.date,
        minGreen: sql<number>`MIN(${schema.aiDailyMargin.isGreen})`,
      })
      .from(schema.aiDailyMargin)
      .where(
        and(
          gte(schema.aiDailyMargin.date, sliceDate(since)),
          ne(schema.aiDailyMargin.providerId, BREAKAGE_SYNTHETIC_SLICE.providerId)
        )
      )
      .groupBy(schema.aiDailyMargin.date);

    const greenDays = greenRows.filter((r) => Number(r.minGreen) === 1).length;
    const redDays = greenRows.length - greenDays;

    // Signups window + fleet total.
    const [signups] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(schema.users)
      .where(gte(schema.users.createdAt, since));
    const [fleet] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(schema.users);

    const net = Number(ledgerAgg?.net ?? 0);
    const cost = Number(marginAgg?.cost ?? 0);
    const infra = Number(marginAgg?.infra ?? 0);
    const reserve = Number(marginAgg?.reserve ?? 0);
    const breakage = Number(breakageAgg?.breakage ?? 0);
    // Net margin = (net revenue + breakage - cost - infra - reserve) / (net revenue + breakage)
    const denom = net + breakage;
    const numer = denom - cost - infra - reserve;
    const netMarginBps =
      denom > 0 ? Math.round((numer / denom) * 10_000) : -10_000;

    return ok({
      last30dNetRevenueMicros: net,
      last30dGrossChargeMicros: Number(ledgerAgg?.gross ?? 0),
      last30dTaxCollectedMicros: Number(ledgerAgg?.tax ?? 0),
      last30dProcessorFeeMicros: Number(ledgerAgg?.fee ?? 0),
      last30dAiCostMicros: cost,
      last30dInfraCostMicros: infra,
      last30dRefundReserveMicros: reserve,
      last30dBreakageMicros: breakage,
      netMarginBps,
      last30dCallCount: Number(marginAgg?.calls ?? 0),
      last30dGreenDays: greenDays,
      last30dRedDays: redDays,
      last30dSignups: Number(signups?.n ?? 0),
      totalUsers: Number(fleet?.n ?? 0),
    });
  } catch (err) {
    return fail(
      {
        last30dNetRevenueMicros: 0,
        last30dGrossChargeMicros: 0,
        last30dTaxCollectedMicros: 0,
        last30dProcessorFeeMicros: 0,
        last30dAiCostMicros: 0,
        last30dInfraCostMicros: 0,
        last30dRefundReserveMicros: 0,
        last30dBreakageMicros: 0,
        netMarginBps: -10_000,
        last30dCallCount: 0,
        last30dGreenDays: 0,
        last30dRedDays: 0,
        last30dSignups: 0,
        totalUsers: 0,
      },
      err
    );
  }
}

// --- /admin/revenue --------------------------------------------------

export type RevenueDailyRow = {
  date: string;
  grossMicros: number;
  netMicros: number;
  taxMicros: number;
  feeMicros: number;
  txCount: number;
};

export type RevenueByProviderRow = {
  provider: string;
  netMicros: number;
  txCount: number;
};

export type RevenueByCurrencyRow = {
  currency: string;
  grossMicros: number;
  netMicros: number;
  txCount: number;
};

export type RevenueBreakdown = {
  daily: RevenueDailyRow[];
  byProvider: RevenueByProviderRow[];
  byCurrency: RevenueByCurrencyRow[];
};

export async function getRevenueBreakdown(opts: {
  days: number;
}): Promise<AdminQueryResult<RevenueBreakdown>> {
  const since = new Date(Date.now() - opts.days * msPerDay());
  try {
    const daily = await db
      .select({
        date: sql<string>`DATE(${schema.creditLedger.createdAt})`,
        gross: sql<number>`COALESCE(SUM(${schema.creditLedger.grossChargeMicros}), 0)`,
        net: sql<number>`COALESCE(SUM(${schema.creditLedger.netRevenueMicros}), 0)`,
        tax: sql<number>`COALESCE(SUM(${schema.creditLedger.taxCollectedMicros}), 0)`,
        fee: sql<number>`COALESCE(SUM(${schema.creditLedger.processorFeeMicros}), 0)`,
        n: sql<number>`COUNT(*)`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          isNotNull(schema.creditLedger.grossChargeMicros)
        )
      )
      .groupBy(sql`DATE(${schema.creditLedger.createdAt})`)
      .orderBy(sql`DATE(${schema.creditLedger.createdAt}) ASC`);

    const byProvider = await db
      .select({
        p: sql<string>`COALESCE(${schema.creditLedger.provider}, 'unknown')`,
        net: sql<number>`COALESCE(SUM(${schema.creditLedger.netRevenueMicros}), 0)`,
        n: sql<number>`COUNT(*)`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          isNotNull(schema.creditLedger.grossChargeMicros)
        )
      )
      .groupBy(sql`COALESCE(${schema.creditLedger.provider}, 'unknown')`);

    const byCurrency = await db
      .select({
        c: sql<string>`COALESCE(${schema.creditLedger.billingCurrency}, 'USD')`,
        gross: sql<number>`COALESCE(SUM(${schema.creditLedger.grossChargeMicros}), 0)`,
        net: sql<number>`COALESCE(SUM(${schema.creditLedger.netRevenueMicros}), 0)`,
        n: sql<number>`COUNT(*)`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          isNotNull(schema.creditLedger.grossChargeMicros)
        )
      )
      .groupBy(sql`COALESCE(${schema.creditLedger.billingCurrency}, 'USD')`);

    return ok({
      daily: daily.map((r) => ({
        date: String(r.date),
        grossMicros: Number(r.gross),
        netMicros: Number(r.net),
        taxMicros: Number(r.tax),
        feeMicros: Number(r.fee),
        txCount: Number(r.n),
      })),
      byProvider: byProvider.map((r) => ({
        provider: String(r.p),
        netMicros: Number(r.net),
        txCount: Number(r.n),
      })),
      byCurrency: byCurrency.map((r) => ({
        currency: String(r.c),
        grossMicros: Number(r.gross),
        netMicros: Number(r.net),
        txCount: Number(r.n),
      })),
    });
  } catch (err) {
    return fail({ daily: [], byProvider: [], byCurrency: [] }, err);
  }
}

// --- /admin/costs ----------------------------------------------------

export type CostsByOpRow = {
  operation: string;
  callCount: number;
  costMicros: number;
  revenueMicros: number;
  marginBps: number;
};

export type CostsByProviderRow = {
  providerId: string;
  callCount: number;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
};

export type CostsWaterfall = {
  grossRevenueMicros: number;
  processorFeeMicros: number;
  taxRemittableMicros: number;
  netRevenueMicros: number;
  aiCostMicros: number;
  infraCostMicros: number;
  refundReserveMicros: number;
  breakageRevenueMicros: number;
  finalNetMicros: number;
};

export type CostsBreakdown = {
  byOp: CostsByOpRow[];
  byProvider: CostsByProviderRow[];
  waterfall: CostsWaterfall;
};

export async function getCostsBreakdown(opts: {
  days: number;
}): Promise<AdminQueryResult<CostsBreakdown>> {
  const since = new Date(Date.now() - opts.days * msPerDay());
  try {
    const byOp = await db
      .select({
        op: schema.aiDailyMargin.operation,
        calls: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.callCount}), 0)`,
        cost: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.costMicrosSum}), 0)`,
        rev: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.revenueMicrosSum}), 0)`,
      })
      .from(schema.aiDailyMargin)
      .where(
        and(
          gte(schema.aiDailyMargin.date, sliceDate(since)),
          ne(schema.aiDailyMargin.providerId, BREAKAGE_SYNTHETIC_SLICE.providerId)
        )
      )
      .groupBy(schema.aiDailyMargin.operation)
      .orderBy(desc(sql`COALESCE(SUM(${schema.aiDailyMargin.costMicrosSum}), 0)`));

    const byProvider = await db
      .select({
        pid: schema.aiDailyMargin.providerId,
        calls: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.callCount}), 0)`,
        cost: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.costMicrosSum}), 0)`,
        inTok: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.inputTokensSum}), 0)`,
        outTok: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.outputTokensSum}), 0)`,
      })
      .from(schema.aiDailyMargin)
      .where(
        and(
          gte(schema.aiDailyMargin.date, sliceDate(since)),
          ne(schema.aiDailyMargin.providerId, BREAKAGE_SYNTHETIC_SLICE.providerId)
        )
      )
      .groupBy(schema.aiDailyMargin.providerId);

    // Waterfall — reuse the same window against credit_ledger for
    // revenue / fee / tax, and ai_daily_margin for cost / infra /
    // reserve / breakage.
    const [ledgerAgg] = await db
      .select({
        gross: sql<number>`COALESCE(SUM(${schema.creditLedger.grossChargeMicros}), 0)`,
        net: sql<number>`COALESCE(SUM(${schema.creditLedger.netRevenueMicros}), 0)`,
        fee: sql<number>`COALESCE(SUM(${schema.creditLedger.processorFeeMicros}), 0)`,
        taxR: sql<number>`COALESCE(SUM(${schema.creditLedger.taxRemittableMicros}), 0)`,
      })
      .from(schema.creditLedger)
      .where(gte(schema.creditLedger.createdAt, since));

    const [marginAgg] = await db
      .select({
        cost: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.costMicrosSum}), 0)`,
        infra: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.infraCostPerCallMicros} * ${schema.aiDailyMargin.callCount}), 0)`,
        reserve: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.refundReserveMicros}), 0)`,
      })
      .from(schema.aiDailyMargin)
      .where(
        and(
          gte(schema.aiDailyMargin.date, sliceDate(since)),
          ne(schema.aiDailyMargin.providerId, BREAKAGE_SYNTHETIC_SLICE.providerId)
        )
      );

    const [breakageAgg] = await db
      .select({
        breakage: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.breakageRevenueMicros}), 0)`,
      })
      .from(schema.aiDailyMargin)
      .where(
        and(
          gte(schema.aiDailyMargin.date, sliceDate(since)),
          eq(schema.aiDailyMargin.providerId, BREAKAGE_SYNTHETIC_SLICE.providerId)
        )
      );

    const gross = Number(ledgerAgg?.gross ?? 0);
    const net = Number(ledgerAgg?.net ?? 0);
    const fee = Number(ledgerAgg?.fee ?? 0);
    const taxR = Number(ledgerAgg?.taxR ?? 0);
    const cost = Number(marginAgg?.cost ?? 0);
    const infra = Number(marginAgg?.infra ?? 0);
    const reserve = Number(marginAgg?.reserve ?? 0);
    const breakage = Number(breakageAgg?.breakage ?? 0);

    return ok({
      byOp: byOp.map((r) => {
        const rev = Number(r.rev);
        const cc = Number(r.cost);
        const bps =
          rev > 0 ? Math.round(((rev - cc) / rev) * 10_000) : -10_000;
        return {
          operation: String(r.op),
          callCount: Number(r.calls),
          costMicros: cc,
          revenueMicros: rev,
          marginBps: bps,
        };
      }),
      byProvider: byProvider.map((r) => ({
        providerId: String(r.pid),
        callCount: Number(r.calls),
        costMicros: Number(r.cost),
        inputTokens: Number(r.inTok),
        outputTokens: Number(r.outTok),
      })),
      waterfall: {
        grossRevenueMicros: gross,
        processorFeeMicros: fee,
        taxRemittableMicros: taxR,
        netRevenueMicros: net,
        aiCostMicros: cost,
        infraCostMicros: infra,
        refundReserveMicros: reserve,
        breakageRevenueMicros: breakage,
        finalNetMicros: net + breakage - cost - infra - reserve,
      },
    });
  } catch (err) {
    return fail(
      {
        byOp: [],
        byProvider: [],
        waterfall: {
          grossRevenueMicros: 0,
          processorFeeMicros: 0,
          taxRemittableMicros: 0,
          netRevenueMicros: 0,
          aiCostMicros: 0,
          infraCostMicros: 0,
          refundReserveMicros: 0,
          breakageRevenueMicros: 0,
          finalNetMicros: 0,
        },
      },
      err
    );
  }
}

// --- /admin/margin ---------------------------------------------------
// The existing getAdminMarginSummary in lib/ai/margin-rollup.ts covers
// the gross-margin green/red view. This layer adds the NET margin
// angle that the new Task #17 columns now make possible.

export type MarginDailyRow = {
  date: string;
  revenueMicros: number;
  costMicros: number;
  infraMicros: number;
  reserveMicros: number;
  breakageMicros: number;
  grossMarginBps: number;
  netMarginBps: number;
  isGreen: boolean;
};

export async function getMarginDaily(opts: {
  days: number;
}): Promise<AdminQueryResult<MarginDailyRow[]>> {
  const since = new Date(Date.now() - opts.days * msPerDay());
  try {
    const realRows = await db
      .select({
        d: schema.aiDailyMargin.date,
        rev: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.revenueMicrosSum}), 0)`,
        cost: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.costMicrosSum}), 0)`,
        infra: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.infraCostPerCallMicros} * ${schema.aiDailyMargin.callCount}), 0)`,
        reserve: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.refundReserveMicros}), 0)`,
        minGreen: sql<number>`MIN(${schema.aiDailyMargin.isGreen})`,
      })
      .from(schema.aiDailyMargin)
      .where(
        and(
          gte(schema.aiDailyMargin.date, sliceDate(since)),
          ne(schema.aiDailyMargin.providerId, BREAKAGE_SYNTHETIC_SLICE.providerId)
        )
      )
      .groupBy(schema.aiDailyMargin.date)
      .orderBy(asc(schema.aiDailyMargin.date));

    const breakageRows = await db
      .select({
        d: schema.aiDailyMargin.date,
        b: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.breakageRevenueMicros}), 0)`,
      })
      .from(schema.aiDailyMargin)
      .where(
        and(
          gte(schema.aiDailyMargin.date, sliceDate(since)),
          eq(schema.aiDailyMargin.providerId, BREAKAGE_SYNTHETIC_SLICE.providerId)
        )
      )
      .groupBy(schema.aiDailyMargin.date);

    const breakageByDate = new Map<string, number>(
      breakageRows.map((r) => [String(r.d), Number(r.b)])
    );

    return ok(
      realRows.map((r) => {
        const rev = Number(r.rev);
        const cost = Number(r.cost);
        const infra = Number(r.infra);
        const reserve = Number(r.reserve);
        const breakage = breakageByDate.get(String(r.d)) ?? 0;
        const grossDenom = rev;
        const grossBps =
          grossDenom > 0
            ? Math.round(((rev - cost) / rev) * 10_000)
            : -10_000;
        const netDenom = rev + breakage;
        const netNumer = netDenom - cost - infra - reserve;
        const netBps =
          netDenom > 0 ? Math.round((netNumer / netDenom) * 10_000) : -10_000;
        return {
          date: String(r.d),
          revenueMicros: rev,
          costMicros: cost,
          infraMicros: infra,
          reserveMicros: reserve,
          breakageMicros: breakage,
          grossMarginBps: grossBps,
          netMarginBps: netBps,
          isGreen: Number(r.minGreen) === 1,
        };
      })
    );
  } catch (err) {
    return fail<MarginDailyRow[]>([], err);
  }
}

// --- /admin/users ----------------------------------------------------

export type UserPnlRow = {
  userId: string;
  email: string;
  createdAt: Date;
  last30dNetRevenueMicros: number;
  last30dAiCostMicros: number;
  last30dCallCount: number;
  last30dMarginBps: number;
  balance: number;
};

export async function getUsersPnl(opts: {
  limit: number;
}): Promise<AdminQueryResult<UserPnlRow[]>> {
  const since = new Date(Date.now() - 30 * msPerDay());
  try {
    // Rank by NET revenue descending. One query aggregating both sides
    // via LEFT JOIN keeps this a single round-trip for the page.
    const rows = await db.execute(sql`
      SELECT
        u.id AS user_id,
        u.email AS email,
        u.created_at AS created_at,
        COALESCE(SUM(l.net_revenue_micros), 0) AS net_revenue,
        COALESCE((
          SELECT SUM(ai.cost_micros)
          FROM ai_usage ai
          WHERE ai.user_id = u.id AND ai.created_at >= ${since}
        ), 0) AS ai_cost,
        COALESCE((
          SELECT COUNT(*) FROM ai_usage ai
          WHERE ai.user_id = u.id AND ai.created_at >= ${since}
        ), 0) AS call_count,
        COALESCE(c.balance, 0) AS balance
      FROM users u
      LEFT JOIN credit_ledger l
        ON l.user_id = u.id AND l.created_at >= ${since}
      LEFT JOIN credits c
        ON c.user_id = u.id
      GROUP BY u.id, u.email, u.created_at, c.balance
      ORDER BY COALESCE(SUM(l.net_revenue_micros), 0) DESC
      LIMIT ${opts.limit}
    `);

    const list = (rows as unknown as [Array<Record<string, unknown>>])[0] ?? [];
    return ok(
      list.map((r: Record<string, unknown>) => {
        const net = Number(r.net_revenue ?? 0);
        const cost = Number(r.ai_cost ?? 0);
        const bps =
          net > 0 ? Math.round(((net - cost) / net) * 10_000) : -10_000;
        return {
          userId: String(r.user_id ?? ""),
          email: String(r.email ?? ""),
          createdAt: r.created_at instanceof Date
            ? (r.created_at as Date)
            : new Date(String(r.created_at ?? 0)),
          last30dNetRevenueMicros: net,
          last30dAiCostMicros: cost,
          last30dCallCount: Number(r.call_count ?? 0),
          last30dMarginBps: bps,
          balance: Number(r.balance ?? 0),
        };
      })
    );
  } catch (err) {
    return fail<UserPnlRow[]>([], err);
  }
}

// --- /admin/users/[id] -----------------------------------------------

export type UserDetail = {
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: Date;
    balance: number;
  } | null;
  recentLedger: Array<{
    id: string;
    createdAt: Date;
    delta: number;
    reason: string;
    grossChargeMicros: number | null;
    netRevenueMicros: number | null;
    provider: string | null;
    billingCurrency: string | null;
  }>;
  recentUsage: Array<{
    id: string;
    createdAt: Date;
    operation: string;
    providerId: string;
    creditsSpent: number;
    costMicros: number | null;
    success: number;
  }>;
  lifetime: {
    netRevenueMicros: number;
    aiCostMicros: number;
    callCount: number;
  };
};

export async function getUserDetail(opts: {
  userId: string;
}): Promise<AdminQueryResult<UserDetail>> {
  try {
    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, opts.userId))
      .limit(1);

    if (!user) {
      return ok({
        user: null,
        recentLedger: [],
        recentUsage: [],
        lifetime: { netRevenueMicros: 0, aiCostMicros: 0, callCount: 0 },
      });
    }

    const [bal] = await db
      .select({ b: schema.credits.balance })
      .from(schema.credits)
      .where(eq(schema.credits.userId, opts.userId))
      .limit(1);

    const recentLedger = await db
      .select({
        id: schema.creditLedger.id,
        createdAt: schema.creditLedger.createdAt,
        delta: schema.creditLedger.delta,
        reason: schema.creditLedger.reason,
        grossChargeMicros: schema.creditLedger.grossChargeMicros,
        netRevenueMicros: schema.creditLedger.netRevenueMicros,
        provider: schema.creditLedger.provider,
        billingCurrency: schema.creditLedger.billingCurrency,
      })
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.userId, opts.userId))
      .orderBy(desc(schema.creditLedger.createdAt))
      .limit(50);

    const recentUsage = await db
      .select({
        id: schema.aiUsage.id,
        createdAt: schema.aiUsage.createdAt,
        operation: schema.aiUsage.operation,
        providerId: schema.aiUsage.providerId,
        creditsSpent: schema.aiUsage.creditsSpent,
        costMicros: schema.aiUsage.costMicros,
        success: schema.aiUsage.success,
      })
      .from(schema.aiUsage)
      .where(eq(schema.aiUsage.userId, opts.userId))
      .orderBy(desc(schema.aiUsage.createdAt))
      .limit(50);

    const [lifetime] = await db
      .select({
        netRev: sql<number>`COALESCE(SUM(${schema.creditLedger.netRevenueMicros}), 0)`,
      })
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.userId, opts.userId));

    const [lifetimeCost] = await db
      .select({
        cost: sql<number>`COALESCE(SUM(${schema.aiUsage.costMicros}), 0)`,
        n: sql<number>`COUNT(*)`,
      })
      .from(schema.aiUsage)
      .where(eq(schema.aiUsage.userId, opts.userId));

    return ok({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        balance: bal?.b ?? 0,
      },
      recentLedger: recentLedger.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        delta: r.delta,
        reason: r.reason,
        grossChargeMicros: r.grossChargeMicros ?? null,
        netRevenueMicros: r.netRevenueMicros ?? null,
        provider: r.provider ?? null,
        billingCurrency: r.billingCurrency ?? null,
      })),
      recentUsage: recentUsage.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        operation: r.operation,
        providerId: r.providerId,
        creditsSpent: r.creditsSpent,
        costMicros: r.costMicros ?? null,
        success: r.success,
      })),
      lifetime: {
        netRevenueMicros: Number(lifetime?.netRev ?? 0),
        aiCostMicros: Number(lifetimeCost?.cost ?? 0),
        callCount: Number(lifetimeCost?.n ?? 0),
      },
    });
  } catch (err) {
    return fail(
      {
        user: null,
        recentLedger: [],
        recentUsage: [],
        lifetime: { netRevenueMicros: 0, aiCostMicros: 0, callCount: 0 },
      },
      err
    );
  }
}

// --- /admin/ops ------------------------------------------------------

export type OpsHealthRow = {
  operation: string;
  callCount: number;
  errorCount: number;
  errorRateBps: number;
  costMicros: number;
  revenueMicros: number;
  marginBps: number;
  meanLatencyMs: number;
  truncationRateBps: number | null;
};

export async function getOpsHealth(opts: {
  days: number;
}): Promise<AdminQueryResult<OpsHealthRow[]>> {
  const since = new Date(Date.now() - opts.days * msPerDay());
  try {
    // Margin aggregates (cost, revenue, calls, errors) from ai_daily_margin.
    const margin = await db
      .select({
        op: schema.aiDailyMargin.operation,
        calls: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.callCount}), 0)`,
        errors: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.errorCount}), 0)`,
        cost: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.costMicrosSum}), 0)`,
        rev: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.revenueMicrosSum}), 0)`,
        latSum: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.latencyMsSum}), 0)`,
      })
      .from(schema.aiDailyMargin)
      .where(
        and(
          gte(schema.aiDailyMargin.date, sliceDate(since)),
          ne(schema.aiDailyMargin.providerId, BREAKAGE_SYNTHETIC_SLICE.providerId)
        )
      )
      .groupBy(schema.aiDailyMargin.operation);

    // Truncation rate from ai_usage (the margin rollup doesn't carry
    // it). Only rows where response_truncated IS NOT NULL count toward
    // the denominator — NULL means "unknown".
    const truncation = await db
      .select({
        op: schema.aiUsage.operation,
        truncated: sql<number>`COALESCE(SUM(CASE WHEN ${schema.aiUsage.responseTruncated} = 1 THEN 1 ELSE 0 END), 0)`,
        total: sql<number>`COALESCE(SUM(CASE WHEN ${schema.aiUsage.responseTruncated} IS NOT NULL THEN 1 ELSE 0 END), 0)`,
      })
      .from(schema.aiUsage)
      .where(gte(schema.aiUsage.createdAt, since))
      .groupBy(schema.aiUsage.operation);

    const truncByOp = new Map<string, { t: number; n: number }>();
    for (const r of truncation) {
      truncByOp.set(String(r.op), {
        t: Number(r.truncated),
        n: Number(r.total),
      });
    }

    return ok(
      margin.map((r) => {
        const calls = Number(r.calls);
        const errors = Number(r.errors);
        const cost = Number(r.cost);
        const rev = Number(r.rev);
        const latSum = Number(r.latSum);
        const errBps = calls > 0 ? Math.round((errors / calls) * 10_000) : 0;
        const marginBps =
          rev > 0 ? Math.round(((rev - cost) / rev) * 10_000) : -10_000;
        const meanLatencyMs = calls > 0 ? Math.round(latSum / calls) : 0;
        const t = truncByOp.get(String(r.op));
        const truncationRateBps =
          t && t.n > 0 ? Math.round((t.t / t.n) * 10_000) : null;
        return {
          operation: String(r.op),
          callCount: calls,
          errorCount: errors,
          errorRateBps: errBps,
          costMicros: cost,
          revenueMicros: rev,
          marginBps,
          meanLatencyMs,
          truncationRateBps,
        };
      })
    );
  } catch (err) {
    return fail<OpsHealthRow[]>([], err);
  }
}

// --- /admin/providers ------------------------------------------------

export type ProviderHealthRow = {
  providerId: string;
  callCount: number;
  errorCount: number;
  errorRateBps: number;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  meanLatencyMs: number;
  primarySharePct: number;
};

export async function getProvidersHealth(opts: {
  days: number;
}): Promise<AdminQueryResult<ProviderHealthRow[]>> {
  const since = new Date(Date.now() - opts.days * msPerDay());
  try {
    const rows = await db
      .select({
        pid: schema.aiDailyMargin.providerId,
        calls: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.callCount}), 0)`,
        errors: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.errorCount}), 0)`,
        cost: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.costMicrosSum}), 0)`,
        inTok: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.inputTokensSum}), 0)`,
        outTok: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.outputTokensSum}), 0)`,
        latSum: sql<number>`COALESCE(SUM(${schema.aiDailyMargin.latencyMsSum}), 0)`,
      })
      .from(schema.aiDailyMargin)
      .where(
        and(
          gte(schema.aiDailyMargin.date, sliceDate(since)),
          ne(schema.aiDailyMargin.providerId, BREAKAGE_SYNTHETIC_SLICE.providerId)
        )
      )
      .groupBy(schema.aiDailyMargin.providerId);

    const totalCalls = rows.reduce((sum, r) => sum + Number(r.calls), 0);

    return ok(
      rows.map((r) => {
        const calls = Number(r.calls);
        const errors = Number(r.errors);
        const errBps = calls > 0 ? Math.round((errors / calls) * 10_000) : 0;
        const meanLatencyMs =
          calls > 0 ? Math.round(Number(r.latSum) / calls) : 0;
        const primarySharePct =
          totalCalls > 0 ? Math.round((calls / totalCalls) * 100) : 0;
        return {
          providerId: String(r.pid),
          callCount: calls,
          errorCount: errors,
          errorRateBps: errBps,
          costMicros: Number(r.cost),
          inputTokens: Number(r.inTok),
          outputTokens: Number(r.outTok),
          meanLatencyMs,
          primarySharePct,
        };
      })
    );
  } catch (err) {
    return fail<ProviderHealthRow[]>([], err);
  }
}

// --- /admin/transactions ---------------------------------------------

export type TransactionRow = {
  id: string;
  createdAt: Date;
  userId: string;
  userEmail: string | null;
  delta: number;
  reason: string;
  provider: string | null;
  billingCurrency: string | null;
  grossChargeMicros: number | null;
  processorFeeMicros: number | null;
  taxCollectedMicros: number | null;
  netRevenueMicros: number | null;
  dataSource: string | null;
};

export async function getTransactions(opts: {
  limit: number;
}): Promise<AdminQueryResult<TransactionRow[]>> {
  try {
    const rows = await db
      .select({
        id: schema.creditLedger.id,
        createdAt: schema.creditLedger.createdAt,
        userId: schema.creditLedger.userId,
        email: schema.users.email,
        delta: schema.creditLedger.delta,
        reason: schema.creditLedger.reason,
        provider: schema.creditLedger.provider,
        billingCurrency: schema.creditLedger.billingCurrency,
        grossChargeMicros: schema.creditLedger.grossChargeMicros,
        processorFeeMicros: schema.creditLedger.processorFeeMicros,
        taxCollectedMicros: schema.creditLedger.taxCollectedMicros,
        netRevenueMicros: schema.creditLedger.netRevenueMicros,
        dataSource: schema.creditLedger.dataSource,
      })
      .from(schema.creditLedger)
      .leftJoin(schema.users, eq(schema.users.id, schema.creditLedger.userId))
      .orderBy(desc(schema.creditLedger.createdAt))
      .limit(opts.limit);

    return ok(
      rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        userId: r.userId,
        userEmail: r.email ?? null,
        delta: r.delta,
        reason: r.reason,
        provider: r.provider ?? null,
        billingCurrency: r.billingCurrency ?? null,
        grossChargeMicros: r.grossChargeMicros ?? null,
        processorFeeMicros: r.processorFeeMicros ?? null,
        taxCollectedMicros: r.taxCollectedMicros ?? null,
        netRevenueMicros: r.netRevenueMicros ?? null,
        dataSource: r.dataSource ?? null,
      }))
    );
  } catch (err) {
    return fail<TransactionRow[]>([], err);
  }
}

// --- /admin/credits --------------------------------------------------

export type CreditCohortRow = {
  reason: string;
  count: number;
  totalDelta: number;
};

export type CreditAgedRow = {
  bucket: string;
  userCount: number;
  totalBalance: number;
};

export type CreditsSummary = {
  totalOutstanding: number;
  totalUsers: number;
  reasons: CreditCohortRow[];
  aged: CreditAgedRow[];
};

export async function getCreditsSummary(): Promise<
  AdminQueryResult<CreditsSummary>
> {
  try {
    const [outstandingRow] = await db
      .select({
        n: sql<number>`COUNT(*)`,
        total: sql<number>`COALESCE(SUM(${schema.credits.balance}), 0)`,
      })
      .from(schema.credits)
      .where(gte(schema.credits.balance, 1));

    const reasons = await db
      .select({
        r: schema.creditLedger.reason,
        n: sql<number>`COUNT(*)`,
        delta: sql<number>`COALESCE(SUM(${schema.creditLedger.delta}), 0)`,
      })
      .from(schema.creditLedger)
      .groupBy(schema.creditLedger.reason)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(20);

    // Aged credit ledger — bucket last activity vs. balance. This is a
    // rough view (credits table has no "last activity" field; we use
    // the most recent credit_ledger entry per user as a proxy).
    const agedRows = await db.execute(sql`
      SELECT
        CASE
          WHEN TIMESTAMPDIFF(MONTH, last_active, NOW()) < 3 THEN '<3 months'
          WHEN TIMESTAMPDIFF(MONTH, last_active, NOW()) < 6 THEN '3-6 months'
          WHEN TIMESTAMPDIFF(MONTH, last_active, NOW()) < 12 THEN '6-12 months'
          ELSE '12+ months (breakage eligible)'
        END AS bucket,
        COUNT(*) AS user_count,
        SUM(balance) AS total_balance
      FROM (
        SELECT c.user_id, c.balance, MAX(l.created_at) AS last_active
        FROM credits c
        LEFT JOIN credit_ledger l ON l.user_id = c.user_id
        WHERE c.balance > 0
        GROUP BY c.user_id, c.balance
      ) AS derived
      GROUP BY bucket
      ORDER BY
        CASE bucket
          WHEN '<3 months' THEN 1
          WHEN '3-6 months' THEN 2
          WHEN '6-12 months' THEN 3
          WHEN '12+ months (breakage eligible)' THEN 4
          ELSE 5
        END
    `);

    const agedList =
      (agedRows as unknown as [Array<Record<string, unknown>>])[0] ?? [];

    return ok({
      totalOutstanding: Number(outstandingRow?.total ?? 0),
      totalUsers: Number(outstandingRow?.n ?? 0),
      reasons: reasons.map((r) => ({
        reason: String(r.r),
        count: Number(r.n),
        totalDelta: Number(r.delta),
      })),
      aged: agedList.map((r) => ({
        bucket: String(r.bucket ?? ""),
        userCount: Number(r.user_count ?? 0),
        totalBalance: Number(r.total_balance ?? 0),
      })),
    });
  } catch (err) {
    return fail<CreditsSummary>(
      { totalOutstanding: 0, totalUsers: 0, reasons: [], aged: [] },
      err
    );
  }
}

// --- /admin/logs (webhook events + failed writes) --------------------

export type WebhookLogRow = {
  id: string;
  receivedAt: Date;
  providerId: string;
  eventType: string;
  normalizedKind: string;
  providerEventId: string;
  paymentId: string | null;
};

export async function getWebhookLogs(opts: {
  limit: number;
}): Promise<AdminQueryResult<WebhookLogRow[]>> {
  try {
    const rows = await db
      .select({
        id: schema.webhookEvents.id,
        receivedAt: schema.webhookEvents.receivedAt,
        providerId: schema.webhookEvents.providerId,
        eventType: schema.webhookEvents.eventType,
        normalizedKind: schema.webhookEvents.normalizedKind,
        providerEventId: schema.webhookEvents.providerEventId,
        paymentId: schema.webhookEvents.paymentId,
      })
      .from(schema.webhookEvents)
      .orderBy(desc(schema.webhookEvents.receivedAt))
      .limit(opts.limit);

    return ok(
      rows.map((r) => ({
        id: r.id,
        receivedAt: r.receivedAt,
        providerId: r.providerId,
        eventType: r.eventType,
        normalizedKind: r.normalizedKind,
        providerEventId: r.providerEventId,
        paymentId: r.paymentId ?? null,
      }))
    );
  } catch (err) {
    return fail<WebhookLogRow[]>([], err);
  }
}

// --- /admin/refunds --------------------------------------------------
//
// Phase C / Task #21. The ledger is the source of truth — every refund
// the webhook handler processes writes a row with `reason = 'refund'`
// and `provider = 'refund_reversal'` (see lib/payments/ledger.ts §397
// and types.ts LedgerFinancials provider-tag rule). Monetary columns
// on the refund row are negative (adapter `neg()` closure pattern),
// so SUM() yields negative numbers; the page flips sign for display
// because "refunded $42" reads better than "refunded -$42".
//
// Refund rate is defined here as:
//
//   |Σ refund net_revenue_micros| / Σ captured gross_charge_micros
//
// in the same window. Gross charge is the denominator (not net) because
// industry chargeback/refund rate benchmarks are quoted against gross
// volume — the operator wants parity with card-scheme dashboards.

export type RefundRow = {
  id: string;
  createdAt: Date;
  userId: string;
  userEmail: string | null;
  provider: string | null;
  billingCurrency: string | null;
  grossChargeMicros: number | null;
  processorFeeMicros: number | null;
  taxCollectedMicros: number | null;
  netRevenueMicros: number | null;
  note: string | null;
};

export type RefundsByProviderRow = {
  provider: string;
  count: number;
  refundedMicros: number;
};

export type RefundsDailyRow = {
  date: string;
  count: number;
  refundedMicros: number;
};

export type RefundsSummary = {
  refundCount: number;
  refundedGrossMicros: number;
  refundedNetMicros: number;
  refundRateBps: number;
  capturedGrossMicros: number;
  daily: RefundsDailyRow[];
  byProvider: RefundsByProviderRow[];
  recent: RefundRow[];
};

export async function getRefundsSummary(opts: {
  days: number;
  limit?: number;
}): Promise<AdminQueryResult<RefundsSummary>> {
  const since = new Date(Date.now() - opts.days * msPerDay());
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  try {
    // Headline numbers — single row.
    const [headlineRow] = await db
      .select({
        n: sql<number>`COUNT(*)`,
        gross: sql<number>`COALESCE(SUM(${schema.creditLedger.grossChargeMicros}), 0)`,
        net: sql<number>`COALESCE(SUM(${schema.creditLedger.netRevenueMicros}), 0)`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          eq(schema.creditLedger.reason, "refund")
        )
      );

    // Captured gross in same window — denominator for refund rate.
    const [capturedRow] = await db
      .select({
        gross: sql<number>`COALESCE(SUM(${schema.creditLedger.grossChargeMicros}), 0)`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          eq(schema.creditLedger.reason, "purchase"),
          isNotNull(schema.creditLedger.grossChargeMicros)
        )
      );

    const daily = await db
      .select({
        date: sql<string>`DATE(${schema.creditLedger.createdAt})`,
        n: sql<number>`COUNT(*)`,
        refunded: sql<number>`COALESCE(SUM(${schema.creditLedger.netRevenueMicros}), 0)`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          eq(schema.creditLedger.reason, "refund")
        )
      )
      .groupBy(sql`DATE(${schema.creditLedger.createdAt})`)
      .orderBy(sql`DATE(${schema.creditLedger.createdAt}) ASC`);

    const byProvider = await db
      .select({
        p: sql<string>`COALESCE(${schema.creditLedger.provider}, 'unknown')`,
        n: sql<number>`COUNT(*)`,
        refunded: sql<number>`COALESCE(SUM(${schema.creditLedger.netRevenueMicros}), 0)`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          eq(schema.creditLedger.reason, "refund")
        )
      )
      .groupBy(sql`COALESCE(${schema.creditLedger.provider}, 'unknown')`);

    const recent = await db
      .select({
        id: schema.creditLedger.id,
        createdAt: schema.creditLedger.createdAt,
        userId: schema.creditLedger.userId,
        email: schema.users.email,
        provider: schema.creditLedger.provider,
        billingCurrency: schema.creditLedger.billingCurrency,
        gross: schema.creditLedger.grossChargeMicros,
        fee: schema.creditLedger.processorFeeMicros,
        tax: schema.creditLedger.taxCollectedMicros,
        net: schema.creditLedger.netRevenueMicros,
        note: schema.creditLedger.note,
      })
      .from(schema.creditLedger)
      .leftJoin(schema.users, eq(schema.users.id, schema.creditLedger.userId))
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          eq(schema.creditLedger.reason, "refund")
        )
      )
      .orderBy(desc(schema.creditLedger.createdAt))
      .limit(limit);

    const refundedGross = Number(headlineRow?.gross ?? 0);
    const refundedNet = Number(headlineRow?.net ?? 0);
    const capturedGross = Number(capturedRow?.gross ?? 0);
    const refundRateBps =
      capturedGross > 0
        ? Math.round((Math.abs(refundedGross) / capturedGross) * 10_000)
        : 0;

    return ok({
      refundCount: Number(headlineRow?.n ?? 0),
      refundedGrossMicros: refundedGross,
      refundedNetMicros: refundedNet,
      refundRateBps,
      capturedGrossMicros: capturedGross,
      daily: daily.map((r) => ({
        date: String(r.date),
        count: Number(r.n),
        refundedMicros: Number(r.refunded),
      })),
      byProvider: byProvider.map((r) => ({
        provider: String(r.p),
        count: Number(r.n),
        refundedMicros: Number(r.refunded),
      })),
      recent: recent.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        userId: r.userId,
        userEmail: r.email ?? null,
        provider: r.provider ?? null,
        billingCurrency: r.billingCurrency ?? null,
        grossChargeMicros: r.gross ?? null,
        processorFeeMicros: r.fee ?? null,
        taxCollectedMicros: r.tax ?? null,
        netRevenueMicros: r.net ?? null,
        note: r.note ?? null,
      })),
    });
  } catch (err) {
    return fail<RefundsSummary>(
      {
        refundCount: 0,
        refundedGrossMicros: 0,
        refundedNetMicros: 0,
        refundRateBps: 0,
        capturedGrossMicros: 0,
        daily: [],
        byProvider: [],
        recent: [],
      },
      err
    );
  }
}

// --- /admin/chargebacks ----------------------------------------------
//
// Phase D / Task #22 CLOSED the ingestion gap that existed through
// Phase C. Adapters emit kind="chargeback" for relevant adjustment
// actions, and lib/payments/ledger.ts:handleChargeback writes a
// negative-signed debit row tagged `provider = 'chargeback_reversal'`.
//
// This page now does a double-read: `webhook_events` (what the
// processor SENT us, via the JSON path filter) and `credit_ledger`
// (what we ACTED on, via the provider tag). Healthy state: the two
// counts agree. If they drift, we've got an ingestion bug and the
// banner fires.
//
// Why keep the webhook-events JSON path filter even after ingestion
// is wired?
// -----------------------------------------------------------------
// Two reasons:
//   1. Ground truth: webhook_events is the raw audit log, so it's
//      the authoritative "what the processor says happened".
//      credit_ledger is our downstream mirror.
//   2. Drift detection: if the ingestion pipeline silently breaks
//      (bad deploy, schema mismatch, SQL error swallowed), the JSON
//      path count will keep climbing while the ledger count flatlines.
//      The banner catches that without requiring an alarm rule.

export type ChargebackRow = {
  id: string;
  receivedAt: Date;
  providerId: string;
  eventType: string;
  normalizedKind: string;
  providerEventId: string;
  paymentId: string | null;
};

export type ChargebacksSummary = {
  /** Count from webhook_events — what the processor sent us. Ground truth. */
  webhookCount: number;
  /** Count from credit_ledger with provider='chargeback_reversal' — what we booked. */
  ledgerCount: number;
  /**
   * True when ledgerCount < webhookCount — we received chargeback
   * webhooks but the ledger doesn't reflect them. Drives the banner
   * on /admin/chargebacks. Matches when both are 0 (healthy: no
   * chargebacks yet) or when both are equal and positive (healthy:
   * every chargeback has been booked).
   */
  ingestionGap: boolean;
  /** Sum of absolute value of gross reversals in credit_ledger, in USD micros. */
  reversedGrossMicros: number;
  /** Sum of absolute value of net reversals in credit_ledger, in USD micros. */
  reversedNetMicros: number;
  recent: ChargebackRow[];
};

export async function getChargebacksSummary(opts: {
  days: number;
  limit?: number;
}): Promise<AdminQueryResult<ChargebacksSummary>> {
  const since = new Date(Date.now() - opts.days * msPerDay());
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  try {
    // MariaDB JSON path extraction. `raw_payload->>'$.data.action'`
    // returns the unquoted string value of the field — portable across
    // MySQL 5.7+ / MariaDB 10.2+, the versions Hostinger ships.
    // Post-Task-#22 we also accept chargeback_warning and
    // chargeback_reverse so the page shows the full dispute lifecycle
    // rather than only hard chargebacks.
    const chargebackActionFilter = sql`JSON_UNQUOTE(JSON_EXTRACT(${schema.webhookEvents.rawPayload}, '$.data.action')) IN ('chargeback', 'chargeback_warning', 'chargeback_reverse')`;

    const rows = await db
      .select({
        id: schema.webhookEvents.id,
        receivedAt: schema.webhookEvents.receivedAt,
        providerId: schema.webhookEvents.providerId,
        eventType: schema.webhookEvents.eventType,
        normalizedKind: schema.webhookEvents.normalizedKind,
        providerEventId: schema.webhookEvents.providerEventId,
        paymentId: schema.webhookEvents.paymentId,
      })
      .from(schema.webhookEvents)
      .where(and(gte(schema.webhookEvents.receivedAt, since), chargebackActionFilter))
      .orderBy(desc(schema.webhookEvents.receivedAt))
      .limit(limit);

    const [headlineRow] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(schema.webhookEvents)
      .where(and(gte(schema.webhookEvents.receivedAt, since), chargebackActionFilter));

    // Ledger-side count. `provider = 'chargeback_reversal'` is the
    // exact tag handleChargeback stamps. Sum the negative gross/net
    // as absolute values so the admin stat card reads naturally ("$X
    // reversed" rather than "-$X").
    const [ledgerRow] = await db
      .select({
        n: sql<number>`COUNT(*)`,
        grossAbs: sql<number>`COALESCE(-SUM(${schema.creditLedger.grossChargeMicros}), 0)`,
        netAbs: sql<number>`COALESCE(-SUM(${schema.creditLedger.netRevenueMicros}), 0)`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          eq(schema.creditLedger.provider, "chargeback_reversal")
        )
      );

    const webhookCount = Number(headlineRow?.n ?? 0);
    const ledgerCount = Number(ledgerRow?.n ?? 0);
    const reversedGrossMicros = Number(ledgerRow?.grossAbs ?? 0);
    const reversedNetMicros = Number(ledgerRow?.netAbs ?? 0);

    return ok({
      webhookCount,
      ledgerCount,
      // Healthy when ledger has caught up to webhooks. If ledger > webhooks
      // (shouldn't happen, but defensively), don't flag — that's noisy not
      // wrong; just means a webhook was purged but the ledger row survived.
      ingestionGap: ledgerCount < webhookCount,
      reversedGrossMicros,
      reversedNetMicros,
      recent: rows.map((r) => ({
        id: r.id,
        receivedAt: r.receivedAt,
        providerId: r.providerId,
        eventType: r.eventType,
        normalizedKind: r.normalizedKind,
        providerEventId: r.providerEventId,
        paymentId: r.paymentId ?? null,
      })),
    });
  } catch (err) {
    return fail<ChargebacksSummary>(
      {
        webhookCount: 0,
        ledgerCount: 0,
        ingestionGap: false,
        reversedGrossMicros: 0,
        reversedNetMicros: 0,
        recent: [],
      },
      err
    );
  }
}

// --- /admin/fx -------------------------------------------------------
//
// Phase C / Task #21. Surfaces only rows that actually performed a
// cross-currency conversion — i.e. `fx_rate_used IS NOT NULL`. INR
// payments on the Razorpay rail will populate this when an FX
// conversion is performed; same-currency captures leave it NULL,
// and legacy rows from before Task #15's schema landed will also be
// NULL.
//
// `fx_rate_used` is stored as `decimal(18, 8)` — drizzle returns it
// as a string (see schema comment at db/schema/app.ts:147). We keep
// it as a string in the query layer and parse at the render edge;
// this module's `FxDailyRow.rateAvg` carries Number so the page can
// format directly, but be aware AVG(decimal) in MariaDB may return
// a string too — we coerce via Number() at map time.
//
// `fx_slippage_micros` is the difference between the rate we quoted
// and the benchmark mid-market rate at capture time, in USD micros.
// Negative = we took a loss on the conversion; positive = the spread
// went our way. Summing daily lets the operator spot a stale rate
// feed before it accumulates real money.

export type FxDailyRow = {
  date: string;
  txCount: number;
  slippageMicros: number;
  rateAvg: number | null;
};

export type FxByCurrencyRow = {
  currency: string;
  txCount: number;
  slippageMicros: number;
  rateAvg: number | null;
};

export type FxSummary = {
  txCount: number;
  totalSlippageMicros: number;
  daily: FxDailyRow[];
  byCurrency: FxByCurrencyRow[];
};

export async function getFxSnapshot(opts: {
  days: number;
}): Promise<AdminQueryResult<FxSummary>> {
  const since = new Date(Date.now() - opts.days * msPerDay());
  try {
    const [headlineRow] = await db
      .select({
        n: sql<number>`COUNT(*)`,
        slip: sql<number>`COALESCE(SUM(${schema.creditLedger.fxSlippageMicros}), 0)`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          isNotNull(schema.creditLedger.fxRateUsed)
        )
      );

    const daily = await db
      .select({
        date: sql<string>`DATE(${schema.creditLedger.createdAt})`,
        n: sql<number>`COUNT(*)`,
        slip: sql<number>`COALESCE(SUM(${schema.creditLedger.fxSlippageMicros}), 0)`,
        rate: sql<string>`AVG(${schema.creditLedger.fxRateUsed})`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          isNotNull(schema.creditLedger.fxRateUsed)
        )
      )
      .groupBy(sql`DATE(${schema.creditLedger.createdAt})`)
      .orderBy(sql`DATE(${schema.creditLedger.createdAt}) ASC`);

    const byCurrency = await db
      .select({
        c: sql<string>`COALESCE(${schema.creditLedger.billingCurrency}, 'USD')`,
        n: sql<number>`COUNT(*)`,
        slip: sql<number>`COALESCE(SUM(${schema.creditLedger.fxSlippageMicros}), 0)`,
        rate: sql<string>`AVG(${schema.creditLedger.fxRateUsed})`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          isNotNull(schema.creditLedger.fxRateUsed)
        )
      )
      .groupBy(sql`COALESCE(${schema.creditLedger.billingCurrency}, 'USD')`);

    const toRate = (raw: string | number | null | undefined): number | null => {
      if (raw === null || raw === undefined) return null;
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    return ok({
      txCount: Number(headlineRow?.n ?? 0),
      totalSlippageMicros: Number(headlineRow?.slip ?? 0),
      daily: daily.map((r) => ({
        date: String(r.date),
        txCount: Number(r.n),
        slippageMicros: Number(r.slip),
        rateAvg: toRate(r.rate),
      })),
      byCurrency: byCurrency.map((r) => ({
        currency: String(r.c),
        txCount: Number(r.n),
        slippageMicros: Number(r.slip),
        rateAvg: toRate(r.rate),
      })),
    });
  } catch (err) {
    return fail<FxSummary>(
      { txCount: 0, totalSlippageMicros: 0, daily: [], byCurrency: [] },
      err
    );
  }
}

// --- /admin/tax ------------------------------------------------------
//
// Phase C / Task #21. Tax on Razorpay rows lands with
// `tax_treatment = 'forward'` and `tax_remittable_micros = tax_collected_micros`
// (we're the merchant, we forward IGST to the Indian government).
// MoR (Merchant-of-Record) rows would land with `tax_treatment = 'mor'`
// and `tax_remittable_micros = 0` (the MoR provider absorbs
// remittance, we never owe tax authorities on that rail) — kept as a
// supported case in the data model for the future international rail.
// The "our-to-keep" column is `collected - remittable` — under MoR it
// equals the full collected amount, under forward it equals zero
// (every paisa is owed to GST).
//
// This page is the feed for the CA's GSTR-1 / GSTR-3B reconciliation
// workflow — eventually (Task #23) it sprouts a CSV export. For
// Task #21 scope it's read-only aggregation.

export type TaxByTreatmentRow = {
  treatment: string;
  txCount: number;
  collectedMicros: number;
  remittableMicros: number;
  keptMicros: number;
};

export type TaxByCurrencyRow = {
  currency: string;
  txCount: number;
  collectedMicros: number;
  remittableMicros: number;
};

export type TaxDailyRow = {
  date: string;
  txCount: number;
  collectedMicros: number;
  remittableMicros: number;
};

export type TaxSummary = {
  txCount: number;
  totalCollectedMicros: number;
  totalRemittableMicros: number;
  totalKeptMicros: number;
  byTreatment: TaxByTreatmentRow[];
  byCurrency: TaxByCurrencyRow[];
  daily: TaxDailyRow[];
};

export async function getTaxSnapshot(opts: {
  days: number;
}): Promise<AdminQueryResult<TaxSummary>> {
  const since = new Date(Date.now() - opts.days * msPerDay());
  try {
    const [headlineRow] = await db
      .select({
        n: sql<number>`COUNT(*)`,
        collected: sql<number>`COALESCE(SUM(${schema.creditLedger.taxCollectedMicros}), 0)`,
        remittable: sql<number>`COALESCE(SUM(${schema.creditLedger.taxRemittableMicros}), 0)`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          isNotNull(schema.creditLedger.taxCollectedMicros)
        )
      );

    const byTreatment = await db
      .select({
        t: sql<string>`COALESCE(${schema.creditLedger.taxTreatment}, 'unknown')`,
        n: sql<number>`COUNT(*)`,
        collected: sql<number>`COALESCE(SUM(${schema.creditLedger.taxCollectedMicros}), 0)`,
        remittable: sql<number>`COALESCE(SUM(${schema.creditLedger.taxRemittableMicros}), 0)`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          isNotNull(schema.creditLedger.taxCollectedMicros)
        )
      )
      .groupBy(sql`COALESCE(${schema.creditLedger.taxTreatment}, 'unknown')`);

    const byCurrency = await db
      .select({
        c: sql<string>`COALESCE(${schema.creditLedger.billingCurrency}, 'USD')`,
        n: sql<number>`COUNT(*)`,
        collected: sql<number>`COALESCE(SUM(${schema.creditLedger.taxCollectedMicros}), 0)`,
        remittable: sql<number>`COALESCE(SUM(${schema.creditLedger.taxRemittableMicros}), 0)`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          isNotNull(schema.creditLedger.taxCollectedMicros)
        )
      )
      .groupBy(sql`COALESCE(${schema.creditLedger.billingCurrency}, 'USD')`);

    const daily = await db
      .select({
        date: sql<string>`DATE(${schema.creditLedger.createdAt})`,
        n: sql<number>`COUNT(*)`,
        collected: sql<number>`COALESCE(SUM(${schema.creditLedger.taxCollectedMicros}), 0)`,
        remittable: sql<number>`COALESCE(SUM(${schema.creditLedger.taxRemittableMicros}), 0)`,
      })
      .from(schema.creditLedger)
      .where(
        and(
          gte(schema.creditLedger.createdAt, since),
          isNotNull(schema.creditLedger.taxCollectedMicros)
        )
      )
      .groupBy(sql`DATE(${schema.creditLedger.createdAt})`)
      .orderBy(sql`DATE(${schema.creditLedger.createdAt}) ASC`);

    const collected = Number(headlineRow?.collected ?? 0);
    const remittable = Number(headlineRow?.remittable ?? 0);

    return ok({
      txCount: Number(headlineRow?.n ?? 0),
      totalCollectedMicros: collected,
      totalRemittableMicros: remittable,
      totalKeptMicros: collected - remittable,
      byTreatment: byTreatment.map((r) => {
        const c = Number(r.collected);
        const rm = Number(r.remittable);
        return {
          treatment: String(r.t),
          txCount: Number(r.n),
          collectedMicros: c,
          remittableMicros: rm,
          keptMicros: c - rm,
        };
      }),
      byCurrency: byCurrency.map((r) => ({
        currency: String(r.c),
        txCount: Number(r.n),
        collectedMicros: Number(r.collected),
        remittableMicros: Number(r.remittable),
      })),
      daily: daily.map((r) => ({
        date: String(r.date),
        txCount: Number(r.n),
        collectedMicros: Number(r.collected),
        remittableMicros: Number(r.remittable),
      })),
    });
  } catch (err) {
    return fail<TaxSummary>(
      {
        txCount: 0,
        totalCollectedMicros: 0,
        totalRemittableMicros: 0,
        totalKeptMicros: 0,
        byTreatment: [],
        byCurrency: [],
        daily: [],
      },
      err
    );
  }
}

// --- Runtime env snapshot for /admin/deploy --------------------------

export type DeployCommit = {
  sha: string;
  author: string;
  isoDate: string;
  subject: string;
};

export type DeploySnapshot = {
  commitSha: string | null;
  nodeVersion: string;
  nextRuntime: string;
  deployedAt: string | null;
  infraMonthlyUsdMicros: number;
  refundReserveBps: number;
  referenceUsdMicrosPerCredit: number;
  /** Last 25 commits at build time (newest first). Empty if git was
   *  unavailable when the bundle was built. See next.config.mjs §Build-
   *  time recent-commit log. */
  recentCommits: DeployCommit[];
};

export function getDeploySnapshot(): DeploySnapshot {
  // Commit SHA resolution (Task #32). Priority order:
  //   1. BUILD_COMMIT_SHA — baked in at build time by next.config.mjs
  //      via `git rev-parse --short=12 HEAD`. This is the most reliable
  //      source because it doesn't depend on Hostinger env-var wiring.
  //      /api/health uses this SAME path first, so keeping them
  //      aligned means "whatever /api/health reports is what
  //      /admin/deploy shows."
  //   2. COMMIT_SHA / GIT_COMMIT — manually-stamped env vars for
  //      cron jobs and legacy deploys.
  //   3. VERCEL_GIT_COMMIT_SHA — set by Hostinger's GitHub App when
  //      wired through (currently unset — which is why before Task
  //      #32 this page rendered "unknown").
  const sha =
    (process.env.BUILD_COMMIT_SHA && process.env.BUILD_COMMIT_SHA.length > 0
      ? process.env.BUILD_COMMIT_SHA
      : null) ??
    process.env.COMMIT_SHA ??
    process.env.GIT_COMMIT ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    null;
  // Deploy timestamp — BUILD_TIMESTAMP is baked at build time by
  // next.config.mjs (ISO-8601). Fall back to DEPLOY_TIMESTAMP env var
  // for compatibility with older wiring.
  const deployedAt =
    (process.env.BUILD_TIMESTAMP && process.env.BUILD_TIMESTAMP.length > 0
      ? process.env.BUILD_TIMESTAMP
      : null) ??
    process.env.DEPLOY_TIMESTAMP ??
    null;
  // Recent commits — baked into BUILD_RECENT_COMMITS at build time by
  // next.config.mjs. Defaults to "[]" if git was unavailable. We swallow
  // parse errors silently because /admin/deploy renders a graceful
  // "(unavailable)" state on empty arrays — we never want a malformed
  // env var to crash the deploy page.
  let recentCommits: DeployCommit[] = [];
  try {
    const raw = process.env.BUILD_RECENT_COMMITS;
    if (raw && raw.length > 0) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        recentCommits = parsed.filter(
          (c): c is DeployCommit =>
            c &&
            typeof c.sha === "string" &&
            typeof c.author === "string" &&
            typeof c.isoDate === "string" &&
            typeof c.subject === "string",
        );
      }
    }
  } catch {
    // malformed JSON — leave empty.
  }
  return {
    commitSha: sha,
    nodeVersion: process.version,
    nextRuntime: process.env.NEXT_RUNTIME ?? "nodejs",
    deployedAt,
    infraMonthlyUsdMicros: INFRA_MONTHLY_USD_MICROS,
    refundReserveBps: REFUND_RESERVE_BPS,
    referenceUsdMicrosPerCredit: REFERENCE_USD_MICROS_PER_CREDIT,
    recentCommits,
  };
}

// --- Helpers ---------------------------------------------------------

/**
 * Convert a JS Date to the YYYY-MM-DD string the ai_daily_margin table
 * uses for its `date` column. We never compare Date to DATE directly —
 * MySQL will coerce but the join key shape gets ambiguous at the
 * drizzle layer.
 */
function sliceDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
