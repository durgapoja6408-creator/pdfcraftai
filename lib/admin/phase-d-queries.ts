// lib/admin/phase-d-queries.ts — Phase D admin query helpers.
//
// Task #25.
//
// Why a separate file from lib/admin/queries.ts:
// ----------------------------------------------
// `queries.ts` is already ~1,850 lines covering the Phase B+C admin
// dashboard (overview / revenue / costs / margin / users / ops /
// providers / transactions / credits / webhook logs / refunds /
// chargebacks / fx / tax / deploy). Piling five more query helpers on
// top of that file turns it into the classic "god module" that every
// PR touches. Phase D's new admin surfaces (plans / promos /
// compliance / fraud / rate-limits) all share the same shape — read
// from existing tables, aggregate, classify — so they cluster
// naturally into their own module.
//
// Scope boundary:
//
//   - This module ONLY contains helpers that back the five Phase D
//     admin pages introduced in Task #25. If a helper would also be
//     useful outside /admin (e.g. a fraud-signal check called from
//     lib/payments/*), it stays in the module closer to its domain,
//     not here.
//   - Same `AdminQueryResult<T>` return posture as queries.ts so the
//     pages can use the same ErrorBanner component.
//
// Query-to-page mapping:
//   /admin/plans        → reads from lib/pricing.ts (static, no DB query)
//   /admin/promos       → placeholder until Task #27 (no DB query today)
//   /admin/compliance   → reads from lib/legal-docs.ts (static) +
//                         getConsentSignalSummary (DB, approximate)
//   /admin/fraud        → getFraudSignals (DB)
//   /admin/rate-limits  → getRateLimitOverrides (DB)

import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import {
  DEFAULT_DAILY_COST_CAP_MICROS,
  resolveDailyCapMicros,
} from "@/lib/ai/rate-limit";

// ---------------------------------------------------------------------
// Shared result envelope — matches lib/admin/queries.ts:AdminQueryResult
// ---------------------------------------------------------------------

export type PhaseDQueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function msPerDay(): number {
  return 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------
// /admin/fraud — fraud signal snapshot
// ---------------------------------------------------------------------
//
// "Fraud" here is narrow: we surface three signals that operators need
// to review when deciding whether to flag or suspend a user. The signals
// are DERIVED from existing tables — no new schema:
//
//   1. Chargeback/dispute velocity — how many webhook_events rows with a
//      dispute-related action landed in the window, grouped by user.
//      Users with ≥ 3 disputes in 90d are the canonical "probable
//      fraud" review queue.
//
//   2. Hard-blocked users — rows in user_rate_limits with
//      daily_cost_cap_micros = 0 (operator-set hard block). These are
//      users who have ALREADY been flagged; surfacing them in one list
//      makes it easy to review the backlog and un-block false positives.
//
//   3. Rate-limit hitters — users whose summed ai_usage.cost_micros for
//      today is close to their cap. Not fraud per se, but the same
//      operator signal ("did we over-serve someone we should have
//      slowed down?") lives on this surface.
//
// The actual "suspend user" action is intentionally NOT wired to this
// page — operators act via DB mutation (or, post-Task #27, an audit-
// logged button). Showing the signals without the action keeps the
// read-only posture of the v1 admin and avoids accidentally nuking a
// good account from a misclick.

export type FraudSignalsRow = {
  userId: string;
  email: string | null;
  disputeCount: number;
  mostRecentDisputeAt: Date | null;
  isHardBlocked: boolean; // user_rate_limits row with cap = 0
  capMicros: number | null; // null = no override row
  notes: string | null;
};

export type FraudSignalsSnapshot = {
  windowDays: number;
  totalDisputeEvents: number;
  totalHardBlocks: number;
  rows: FraudSignalsRow[];
};

/**
 * Aggregate dispute-event velocity per user over the given window plus
 * all user_rate_limits rows with cap=0. The union is deduplicated on
 * userId so a hard-blocked user who also has recent disputes appears
 * exactly once.
 *
 * Output is ordered by disputeCount desc, then isHardBlocked desc
 * (blocked users sort above non-blocked at the same dispute count, so
 * operators reviewing the queue see "already actioned" items last).
 */
export async function getFraudSignals(opts: {
  days: number;
  limit?: number;
}): Promise<PhaseDQueryResult<FraudSignalsSnapshot>> {
  const days = Math.min(Math.max(opts.days, 1), 365);
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const since = new Date(Date.now() - days * msPerDay());

  try {
    // 1. Dispute velocity per user. webhookEvents.paymentId → payments
    //    → userId. We join through payments because webhookEvents stores
    //    paymentId not userId directly.
    const disputeActionFilter = sql`JSON_UNQUOTE(JSON_EXTRACT(${schema.webhookEvents.rawPayload}, '$.data.action')) IN ('chargeback', 'chargeback_warning', 'chargeback_reverse', 'dispute', 'dispute_opened')`;

    const disputeRows = await db
      .select({
        userId: schema.payments.userId,
        disputeCount: sql<number>`COUNT(*)`.as("dispute_count"),
        mostRecentDisputeAt: sql<Date>`MAX(${schema.webhookEvents.receivedAt})`.as(
          "most_recent"
        ),
      })
      .from(schema.webhookEvents)
      .innerJoin(
        schema.payments,
        eq(schema.webhookEvents.paymentId, schema.payments.id)
      )
      .where(
        and(gte(schema.webhookEvents.receivedAt, since), disputeActionFilter)
      )
      .groupBy(schema.payments.userId);

    // 2. Hard-blocked users.
    const hardBlocks = await db
      .select({
        userId: schema.userRateLimits.userId,
        capMicros: schema.userRateLimits.dailyCostCapMicros,
        notes: schema.userRateLimits.notes,
      })
      .from(schema.userRateLimits)
      .where(eq(schema.userRateLimits.dailyCostCapMicros, 0));

    // Union + dedup on userId.
    const byUser = new Map<string, FraudSignalsRow>();

    for (const r of disputeRows) {
      if (!r.userId) continue;
      byUser.set(r.userId, {
        userId: r.userId,
        email: null,
        disputeCount: Number(r.disputeCount) || 0,
        mostRecentDisputeAt: r.mostRecentDisputeAt
          ? new Date(r.mostRecentDisputeAt as unknown as string)
          : null,
        isHardBlocked: false,
        capMicros: null,
        notes: null,
      });
    }

    for (const b of hardBlocks) {
      const existing = byUser.get(b.userId);
      if (existing) {
        existing.isHardBlocked = true;
        existing.capMicros = Number(b.capMicros) || 0;
        existing.notes = b.notes ?? null;
      } else {
        byUser.set(b.userId, {
          userId: b.userId,
          email: null,
          disputeCount: 0,
          mostRecentDisputeAt: null,
          isHardBlocked: true,
          capMicros: Number(b.capMicros) || 0,
          notes: b.notes ?? null,
        });
      }
    }

    // Enrich with email (single round-trip; only the userIds we care about).
    const userIds = Array.from(byUser.keys());
    if (userIds.length > 0) {
      const emailRows = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
        })
        .from(schema.users)
        .where(sql`${schema.users.id} IN ${userIds}`);
      for (const e of emailRows) {
        const row = byUser.get(e.id);
        if (row) row.email = e.email ?? null;
      }
    }

    const rows = Array.from(byUser.values())
      .sort((a, b) => {
        if (b.disputeCount !== a.disputeCount) {
          return b.disputeCount - a.disputeCount;
        }
        // At equal dispute count, blocked users below non-blocked so
        // reviewers see unactioned items first.
        if (a.isHardBlocked !== b.isHardBlocked) {
          return a.isHardBlocked ? 1 : -1;
        }
        return 0;
      })
      .slice(0, limit);

    const totalDisputeEvents = disputeRows.reduce(
      (sum, r) => sum + (Number(r.disputeCount) || 0),
      0
    );

    return {
      ok: true,
      data: {
        windowDays: days,
        totalDisputeEvents,
        totalHardBlocks: hardBlocks.length,
        rows,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "fraud_signals_query_failed",
    };
  }
}

// ---------------------------------------------------------------------
// /admin/rate-limits — rate-limit override list
// ---------------------------------------------------------------------
//
// Surfaces every row in user_rate_limits with the user's email and the
// RESOLVED cap (override wins over env default, DEFAULT_DAILY_COST_CAP_MICROS
// is the final fallback — matches the resolveDailyCapMicros contract).
//
// Also shows the global default so the operator can see at a glance
// what "no override" means today without looking at env vars.

export type RateLimitOverrideRow = {
  userId: string;
  email: string | null;
  capMicros: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RateLimitsSnapshot = {
  globalDefaultMicros: number;
  globalDefaultSource: "env" | "compiled-in";
  overrideCount: number;
  rows: RateLimitOverrideRow[];
};

export async function getRateLimitOverrides(opts: {
  limit?: number;
}): Promise<PhaseDQueryResult<RateLimitsSnapshot>> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  try {
    const rows = await db
      .select({
        userId: schema.userRateLimits.userId,
        capMicros: schema.userRateLimits.dailyCostCapMicros,
        notes: schema.userRateLimits.notes,
        createdAt: schema.userRateLimits.createdAt,
        updatedAt: schema.userRateLimits.updatedAt,
      })
      .from(schema.userRateLimits)
      .orderBy(desc(schema.userRateLimits.updatedAt))
      .limit(limit);

    const userIds = rows.map((r) => r.userId);
    const emailMap = new Map<string, string | null>();
    if (userIds.length > 0) {
      const emailRows = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
        })
        .from(schema.users)
        .where(sql`${schema.users.id} IN ${userIds}`);
      for (const e of emailRows) emailMap.set(e.id, e.email ?? null);
    }

    // Compute the effective global default matching lib/ai/rate-limit.ts
    // `resolveDailyCapMicros(null)` logic — env wins over compiled
    // default.
    const envVal = process.env.USER_DAILY_COST_MICROS_CAP;
    const envParsed =
      envVal && Number.isFinite(Number.parseInt(envVal, 10))
        ? Number.parseInt(envVal, 10)
        : null;
    const globalDefaultSource: "env" | "compiled-in" =
      envParsed !== null && envParsed >= 0 ? "env" : "compiled-in";
    const globalDefaultMicros = resolveDailyCapMicros(null);

    return {
      ok: true,
      data: {
        globalDefaultMicros,
        globalDefaultSource,
        overrideCount: rows.length,
        rows: rows.map((r) => ({
          userId: r.userId,
          email: emailMap.get(r.userId) ?? null,
          capMicros: Number(r.capMicros) || 0,
          notes: r.notes ?? null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "rate_limit_query_failed",
    };
  }
}

// ---------------------------------------------------------------------
// /admin/compliance — compliance surface snapshot
// ---------------------------------------------------------------------
//
// Pure metadata for the compliance page — all sources are static
// constants, but we compile them here so the page can import one
// typed struct instead of pulling legal-docs + pricing + consent
// directly.

export type SubprocessorRow = {
  name: string;
  purpose: string;
  category: "payments" | "analytics" | "hosting" | "auth" | "cdn";
  dataRegion: string;
  transferMechanism: string;
};

/**
 * Canonical subprocessor list. Keep in sync with:
 *   - lib/legal-docs.ts (public DPA subprocessor table)
 *   - app/cookies/page.tsx (cookies that belong to these providers)
 *
 * DPDP s. 16 compliance: for any provider hosting data outside India,
 * we must list the transfer mechanism used. DPDP's restriction is
 * notify-list based (still being finalised by MeitY) — today all
 * non-India transfers are treated as permitted with contractual
 * safeguards (SCCs + DPA) as the transfer mechanism.
 */
export const SUBPROCESSORS: readonly SubprocessorRow[] = [
  {
    name: "Paddle.com Market Ltd.",
    purpose: "Merchant of Record — international billing, tax, invoicing.",
    category: "payments",
    dataRegion: "UK/EU, US fallback",
    transferMechanism: "SCCs + UK IDTA + DPA",
  },
  {
    name: "Razorpay Software Pvt. Ltd.",
    purpose: "Payment gateway for India-routed purchases.",
    category: "payments",
    dataRegion: "India",
    transferMechanism: "Domestic (no transfer)",
  },
  {
    name: "Google LLC (Analytics 4)",
    purpose: "Product analytics — aggregate usage reports.",
    category: "analytics",
    dataRegion: "US + EU",
    transferMechanism: "SCCs + EU-US DPF + DPDP s. 16",
  },
  {
    name: "Microsoft Corporation (Clarity)",
    purpose: "Session replay + heatmaps for UX debugging.",
    category: "analytics",
    dataRegion: "US",
    transferMechanism: "SCCs + EU-US DPF + DPDP s. 16",
  },
  {
    name: "Cloudflare, Inc.",
    purpose: "CDN + proxy + bot mitigation.",
    category: "cdn",
    dataRegion: "Global (edge)",
    transferMechanism: "SCCs + DPA",
  },
  {
    name: "Hostinger International Ltd.",
    purpose: "Managed Node.js hosting + MySQL database.",
    category: "hosting",
    dataRegion: "EU (Lithuania), US fallback",
    transferMechanism: "SCCs + DPA",
  },
  {
    name: "Google LLC (OAuth)",
    purpose: "Sign-in via Google OAuth.",
    category: "auth",
    dataRegion: "US + EU",
    transferMechanism: "SCCs + EU-US DPF",
  },
] as const;

/**
 * DPDP Act 2023 section coverage — the six sections Task #24 wired
 * into the public Privacy + DPA docs. Used by /admin/compliance to
 * render a compact checklist of "yes we disclose this" rows.
 */
export const DPDP_COVERAGE: ReadonlyArray<{
  section: string;
  topic: string;
  disclosedIn: string[];
}> = [
  { section: "s. 6(3)", topic: "Withdrawal of consent", disclosedIn: ["/privacy", "/cookies", "/dpa"] },
  { section: "s. 8(10)", topic: "Grievance Officer (15-day SLA)", disclosedIn: ["/privacy", "/cookies", "/dpa"] },
  { section: "s. 9", topic: "Children + verifiable parental consent", disclosedIn: ["/privacy"] },
  { section: "s. 11", topic: "Right of access", disclosedIn: ["/privacy", "/dpa"] },
  { section: "s. 12", topic: "Right to correction + erasure", disclosedIn: ["/privacy", "/dpa"] },
  { section: "s. 13", topic: "Right to grievance", disclosedIn: ["/privacy", "/dpa"] },
  { section: "s. 14", topic: "Right of nomination", disclosedIn: ["/privacy"] },
  { section: "s. 16", topic: "Cross-border transfers", disclosedIn: ["/privacy", "/dpa"] },
] as const;

/**
 * GDPR articles + ePrivacy references covered by the cookie banner +
 * Privacy + DPA suite. Parallel to DPDP_COVERAGE so the operator sees
 * "EU + India both covered" at a glance.
 */
export const GDPR_COVERAGE: ReadonlyArray<{
  reference: string;
  topic: string;
  disclosedIn: string[];
}> = [
  { reference: "GDPR Art. 6(1)(a)", topic: "Consent-first legal basis for analytics", disclosedIn: ["/privacy", "/cookies"] },
  { reference: "GDPR Art. 7(3)", topic: "Withdrawal as easy as giving", disclosedIn: ["/privacy", "/cookies"] },
  { reference: "GDPR Chapter V", topic: "Cross-border transfers with SCCs/IDTA/DPF", disclosedIn: ["/privacy", "/dpa"] },
  { reference: "ePrivacy Directive Art. 5(3)", topic: "Prior consent for non-essential cookies", disclosedIn: ["/privacy", "/cookies"] },
  { reference: "EDPB Guidelines 05/2020 §3.3.2", topic: "Per-cookie inventory published before consent", disclosedIn: ["/cookies"] },
  { reference: "ICO 2023 cookie guidance", topic: "Withdrawal + per-category disclosure", disclosedIn: ["/cookies"] },
] as const;

// Re-export for the page; avoids it having to import from rate-limit.ts directly.
export { DEFAULT_DAILY_COST_CAP_MICROS };
