// Write-side helpers for the referral program (PENDING §3e Phase E,
// 2026-05-05).
//
// Companion to `lib/referrals/queries.ts` (read-side) and
// `lib/referrals/codes.ts` (code lifecycle). All writers are
// idempotent and gated by `isReferralsEnabled()` — when the env
// flag is off, calls are a no-op and return null.
//
// The three writers
// -----------------
// 1. `recordReferralSignup({referrerUserId, referredUserId, code})`
//    Called from the signup flow when a new user is created with a
//    referral code attribution. INSERT into referral_signups. UNIQUE
//    on referred_user_id makes this idempotent — repeat calls for
//    the same referred user no-op via try/catch on the duplicate-key
//    error.
//
// 2. `grantReferrerReward(signupId, creditLedgerId)`
//    Called from the reward-trigger code (typically: when the
//    referred user makes their first credit purchase). UPDATE
//    referral_signups SET referrer_rewarded_at = NOW(),
//    referrer_credit_ledger_id = ?. Idempotent via WHERE
//    referrer_rewarded_at IS NULL — already-rewarded rows no-op.
//
// 3. `grantReferredReward(signupId, creditLedgerId)`
//    Called from the reward-trigger code (typically: when the
//    referred user verifies their email). UPDATE referral_signups
//    SET referred_rewarded_at = NOW(),
//    referred_credit_ledger_id = ?. Same idempotency pattern.
//
// What this module does NOT do
// ----------------------------
// - INSERT into credit_ledger. The reward-trigger code is responsible
//   for granting credits via the existing `grantCredits` helper in
//   `lib/payments/ledger.ts`; this module only marks the SIGNUP row
//   as rewarded and stores the ledger row id for audit. Splitting
//   the responsibilities means the credit grant + the milestone
//   record are two separate writes; they MUST be wrapped in a single
//   transaction by the caller for atomicity.
//
// - Validate the relationship (e.g. that referrer != referred). The
//   foundation guard in queries.ts is read-only; the validation lives
//   here at write time. We do reject self-referrals (same userId on
//   both sides) since the SQL UNIQUE constraint won't catch it.
//
// - Fraud detection (e.g. suspicious patterns of N referrals from
//   one IP). Phase F if the program needs it; today's volume
//   doesn't justify the cost.

import { randomUUID } from "node:crypto";

import { db, schema } from "@/db/client";
import { and, eq, isNull } from "drizzle-orm";

import { isReferralsEnabled } from "./queries";

export class ReferralWriteError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "DISABLED"
      | "SELF_REFERRAL"
      | "ALREADY_REWARDED"
      | "ROW_NOT_FOUND"
      | "DB_ERROR",
  ) {
    super(message);
    this.name = "ReferralWriteError";
  }
}

export interface RecordReferralSignupInput {
  referrerUserId: string;
  referredUserId: string;
  code: string;
}

export interface RecordReferralSignupResult {
  signupId: string;
  /**
   * True if this call inserted a new row, false if a row already
   * existed for this referredUserId (idempotent path). Callers can
   * use this to suppress duplicate "thanks for joining via X's
   * referral" UI on retry.
   */
  inserted: boolean;
}

/**
 * Record a referral attribution. Idempotent — calling twice with
 * the same `referredUserId` returns the existing row without error.
 *
 * Returns `null` when `REFERRALS_ENABLED` is off, so callers can
 * unconditionally invoke this on signup without branching:
 *
 *   const result = await recordReferralSignup({...});
 *   if (result) { ... }
 *
 * Throws ReferralWriteError on:
 *   - SELF_REFERRAL: referrerUserId === referredUserId
 *   - DB_ERROR: any non-duplicate-key DB failure
 */
export async function recordReferralSignup(
  input: RecordReferralSignupInput,
): Promise<RecordReferralSignupResult | null> {
  if (!isReferralsEnabled()) {
    return null;
  }

  const { referrerUserId, referredUserId, code } = input;

  // Self-referral guard. UNIQUE(referred_user_id) doesn't catch this
  // because the row would still be the only one for that referred
  // user — it's just internally inconsistent (same id on both sides).
  if (referrerUserId === referredUserId) {
    throw new ReferralWriteError(
      "Self-referral rejected",
      "SELF_REFERRAL",
    );
  }

  // Cheap path: check if a row already exists for this referred
  // user. Avoids the duplicate-key error path entirely on retry.
  const existing = await db
    .select({ id: schema.referralSignups.id })
    .from(schema.referralSignups)
    .where(eq(schema.referralSignups.referredUserId, referredUserId))
    .limit(1);
  if (existing.length > 0) {
    return { signupId: existing[0]!.id, inserted: false };
  }

  // Cold path: insert. UUID generated in app code (matches the
  // pattern in lib/referrals/codes.ts and the migration 0024 schema).
  const signupId = randomUUID();
  try {
    await db.insert(schema.referralSignups).values({
      id: signupId,
      referrerUserId,
      referredUserId,
      code,
    });
    return { signupId, inserted: true };
  } catch (err) {
    // Race: another process inserted the row between our SELECT and
    // INSERT (e.g. concurrent signup retries). Re-read and return
    // the winner's id.
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("Duplicate entry") ||
      message.includes("ER_DUP_ENTRY")
    ) {
      const winner = await db
        .select({ id: schema.referralSignups.id })
        .from(schema.referralSignups)
        .where(eq(schema.referralSignups.referredUserId, referredUserId))
        .limit(1);
      if (winner.length > 0) {
        return { signupId: winner[0]!.id, inserted: false };
      }
    }
    throw new ReferralWriteError(
      `Failed to record signup: ${message}`,
      "DB_ERROR",
    );
  }
}

/**
 * Mark the REFERRER's reward as granted. Called by the reward-trigger
 * code (typically: when the referred user makes their first credit
 * purchase). Idempotent — already-rewarded rows return without
 * error.
 *
 * The caller is responsible for the actual credit_ledger insert via
 * `grantCredits()` and MUST wrap both writes in a single transaction.
 * This function only updates the milestone columns on the signups
 * table.
 *
 * Returns `null` when REFERRALS_ENABLED is off.
 *
 * Throws ReferralWriteError on:
 *   - ROW_NOT_FOUND: signupId doesn't match any row
 *   - DB_ERROR: any DB failure other than the success path
 */
export async function grantReferrerReward(
  signupId: string,
  creditLedgerId: string,
): Promise<{ updated: boolean } | null> {
  if (!isReferralsEnabled()) {
    return null;
  }
  return updateRewardSide({
    signupId,
    creditLedgerId,
    side: "referrer",
  });
}

/**
 * Mark the REFERRED user's reward as granted. Called by the reward-
 * trigger code (typically: when the referred user verifies their
 * email — that's the conversion milestone we use). Same shape +
 * idempotency as grantReferrerReward.
 */
export async function grantReferredReward(
  signupId: string,
  creditLedgerId: string,
): Promise<{ updated: boolean } | null> {
  if (!isReferralsEnabled()) {
    return null;
  }
  return updateRewardSide({
    signupId,
    creditLedgerId,
    side: "referred",
  });
}

interface UpdateRewardInput {
  signupId: string;
  creditLedgerId: string;
  side: "referrer" | "referred";
}

/**
 * Shared write path for both reward sides. Idempotent via the
 * `WHERE rewarded_at IS NULL` predicate — already-set rows are
 * left alone and return `{ updated: false }`.
 */
async function updateRewardSide(
  input: UpdateRewardInput,
): Promise<{ updated: boolean }> {
  const { signupId, creditLedgerId, side } = input;

  // Read first to differentiate ROW_NOT_FOUND (id doesn't exist)
  // from already-rewarded (id exists but field is set). Both could
  // be lumped into a single "0 rows affected" result from the
  // UPDATE, but giving callers distinct outcomes is more debuggable.
  const rows = await db
    .select()
    .from(schema.referralSignups)
    .where(eq(schema.referralSignups.id, signupId))
    .limit(1);
  if (rows.length === 0) {
    throw new ReferralWriteError(
      `Signup ${signupId} not found`,
      "ROW_NOT_FOUND",
    );
  }

  const row = rows[0]!;
  const alreadySet =
    side === "referrer"
      ? row.referrerRewardedAt !== null
      : row.referredRewardedAt !== null;
  if (alreadySet) {
    return { updated: false };
  }

  const now = new Date();
  if (side === "referrer") {
    await db
      .update(schema.referralSignups)
      .set({
        referrerRewardedAt: now,
        referrerCreditLedgerId: creditLedgerId,
      })
      .where(
        and(
          eq(schema.referralSignups.id, signupId),
          // Re-check IS NULL inside the UPDATE so a race between
          // our SELECT and our UPDATE doesn't double-set.
          isNull(schema.referralSignups.referrerRewardedAt),
        ),
      );
  } else {
    await db
      .update(schema.referralSignups)
      .set({
        referredRewardedAt: now,
        referredCreditLedgerId: creditLedgerId,
      })
      .where(
        and(
          eq(schema.referralSignups.id, signupId),
          isNull(schema.referralSignups.referredRewardedAt),
        ),
      );
  }

  return { updated: true };
}
