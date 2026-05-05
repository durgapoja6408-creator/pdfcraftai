// Read-side queries for the referral admin viewer (PENDING §3e, 2026-05-05).
//
// One-paragraph summary
// ---------------------
// `lib/referrals/codes.ts` owns code generation + lookup; this module
// owns aggregations over `referral_signups`. Two callers today:
//   1. /admin/referrals — table of all attributions + reward state
//   2. /app/refer (future Phase E) — per-user "your stats" panel
//
// All queries are pure reads; no writes. Phase E adds writers
// (`recordReferralSignup`, `grantReferrerReward`, `grantReferredReward`)
// in a separate module — those are gated by the `REFERRALS_ENABLED`
// env flag, so this module stays usable for the admin viewer
// regardless of whether attribution is on yet.

import { db, schema } from "@/db/client";
import { eq, and, desc, sql, isNull, isNotNull } from "drizzle-orm";

export interface ReferralSignupRow {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  code: string;
  referrerRewardedAt: Date | null;
  referredRewardedAt: Date | null;
  referrerCreditLedgerId: string | null;
  referredCreditLedgerId: string | null;
  createdAt: Date;
}

export interface ReferralAdminStats {
  totalCodes: number;
  totalSignups: number;
  // Both sides credited.
  fullyRewardedCount: number;
  // At least one side still NULL.
  pendingRewardCount: number;
  // Top 10 referrers by signup count.
  topReferrers: Array<{ referrerUserId: string; signupCount: number }>;
}

/**
 * Pull the most recent N signup rows for the admin chronological view.
 * Default 200 — paginate later when volume justifies it.
 */
export async function listRecentReferralSignups(
  limit = 200,
): Promise<ReferralSignupRow[]> {
  const rows = await db
    .select()
    .from(schema.referralSignups)
    .orderBy(desc(schema.referralSignups.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    referrerUserId: r.referrerUserId,
    referredUserId: r.referredUserId,
    code: r.code,
    referrerRewardedAt: r.referrerRewardedAt ?? null,
    referredRewardedAt: r.referredRewardedAt ?? null,
    referrerCreditLedgerId: r.referrerCreditLedgerId ?? null,
    referredCreditLedgerId: r.referredCreditLedgerId ?? null,
    createdAt: r.createdAt,
  }));
}

/**
 * Per-user stats for the (future Phase E) /app/refer page. Returns
 * how many people the user has referred + how many of those resulted
 * in their reward landing in the ledger.
 *
 * Two counts because Phase E rewards the REFERRER on a milestone the
 * REFERRED user hits (e.g. first credit purchase). So a referrer
 * could have 5 attributed signups but only 2 with `referrer_rewarded_at`
 * set if the other 3 haven't completed the milestone yet.
 */
export async function loadReferrerStats(referrerUserId: string): Promise<{
  totalReferrals: number;
  rewardedReferrals: number;
}> {
  const [totalRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.referralSignups)
    .where(eq(schema.referralSignups.referrerUserId, referrerUserId));

  const [rewardedRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.referralSignups)
    .where(
      and(
        eq(schema.referralSignups.referrerUserId, referrerUserId),
        isNotNull(schema.referralSignups.referrerRewardedAt),
      ),
    );

  return {
    totalReferrals: Number(totalRow?.count ?? 0),
    rewardedReferrals: Number(rewardedRow?.count ?? 0),
  };
}

/**
 * Aggregate stats for /admin/referrals dashboard cards. Single
 * function pulls everything the page needs in 5 round-trips so we
 * don't N+1 the page render. Counts are int-safe (we cast via
 * `Number()` on the returned aggregate).
 */
export async function loadAdminReferralStats(): Promise<ReferralAdminStats> {
  const [codesRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.referralCodes);

  const [signupsRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.referralSignups);

  const [fullyRewardedRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.referralSignups)
    .where(
      and(
        isNotNull(schema.referralSignups.referrerRewardedAt),
        isNotNull(schema.referralSignups.referredRewardedAt),
      ),
    );

  const [pendingRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.referralSignups)
    .where(
      sql`${schema.referralSignups.referrerRewardedAt} IS NULL OR ${schema.referralSignups.referredRewardedAt} IS NULL`,
    );

  const topReferrers = await db
    .select({
      referrerUserId: schema.referralSignups.referrerUserId,
      signupCount: sql<number>`COUNT(*)`,
    })
    .from(schema.referralSignups)
    .groupBy(schema.referralSignups.referrerUserId)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(10);

  return {
    totalCodes: Number(codesRow?.count ?? 0),
    totalSignups: Number(signupsRow?.count ?? 0),
    fullyRewardedCount: Number(fullyRewardedRow?.count ?? 0),
    pendingRewardCount: Number(pendingRow?.count ?? 0),
    topReferrers: topReferrers.map((t) => ({
      referrerUserId: t.referrerUserId,
      signupCount: Number(t.signupCount),
    })),
  };
}

/**
 * Convenience: is the referral program currently active per env flag?
 *
 * Phase E flips `REFERRALS_ENABLED=1` to start writing rows into
 * `referral_signups` from the signup flow. Until then, the foundation
 * exists but no automation runs. This helper centralizes the flag
 * check so a single env var rename doesn't ripple through 4 callers.
 *
 * Returns false if the env var is unset OR set to anything other than
 * "1" / "true" (case-insensitive). Same parse semantics as
 * `lib/flags.ts:parseOverride`.
 */
export function isReferralsEnabled(): boolean {
  const raw = process.env.REFERRALS_ENABLED;
  if (!raw) return false;
  const lower = raw.toLowerCase().trim();
  return lower === "1" || lower === "true" || lower === "on";
}
