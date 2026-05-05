// Reward-trigger orchestration for the referral program (PENDING §3e
// Phase E final, 2026-05-05).
//
// Two trigger points
// ------------------
// 1. Email verification (the referred user proved email ownership)
//    → grant REFERRED_REWARD_CREDITS to them.
// 2. First credit purchase by the referred user
//    → grant REFERRER_REWARD_CREDITS to the referrer.
//
// Why two separate milestones (vs grant-both-on-signup)
// -----------------------------------------------------
// Anti-fraud. If we granted both rewards on signup we'd subsidize
// every spam signup that came in via a referral code. Email
// verification is a meaningful proof-of-ownership barrier; first
// purchase is meaningful proof-of-real-user.
//
// The referred-user's reward is gated on email verification because:
//   - It's a low bar that real users cross within minutes
//   - It's a high bar for spammers (each verified email costs something)
//   - It's the same gate we already use for the signup bonus, so it's
//     semantically consistent ("verified == real user")
//
// The referrer's reward is gated on first-purchase by the referred
// user because:
//   - It rewards REAL referrals (people who actually convert), not
//     vanity referrals
//   - It aligns the referrer's incentive with our revenue
//
// Idempotency
// -----------
// Both trigger functions are safe to call repeatedly:
//   - grantReferredReward / grantReferrerReward (writers.ts) check
//     IS NULL on the rewarded_at column inside the WHERE clause →
//     already-rewarded rows no-op
//   - grantCredits keys on idempotencyKey → duplicate insert returns
//     { applied: false, reason: "duplicate" }
//   - We compose the two: if the credit grant deduplicates, we still
//     try the writer call (which also dedupes). If both succeed, the
//     row is fully rewarded. If either fails, the failure surfaces
//     to the caller — but the SHIP path retries safely on next call.
//
// What this module does NOT do
// ----------------------------
// - Wrap the credit grant + the writer call in a single atomic
//   transaction. They're two independent writes — credit_ledger
//   and referral_signups. In practice this is acceptable because
//   each side is idempotent: a partial failure (credit granted but
//   signup row not updated) is recovered on the next caller retry
//   (the writer fires; the credit grant dedupes via
//   idempotencyKey). The reverse partial (signup row marked but
//   credit not granted) is impossible because we mark the signup
//   AFTER the grant succeeds.
//
// - Notify the user of the reward. Phase E follow-on: a single
//   transactional email "you got 25 credits because Alice signed up
//   using your link". Depends on the SendGrid/Postmark wiring
//   tracked separately under §11 contact-submissions.

import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { grantCredits } from "@/lib/payments/ledger";
import {
  grantReferrerReward,
  grantReferredReward,
} from "./writers";
import { isReferralsEnabled } from "./queries";

/**
 * Tentative reward values — final amounts are a Phase E business
 * decision and may change. The only place these are referenced today
 * is here + the marketing copy in app/app/refer/page.tsx. Keep in
 * sync.
 */
export const REFERRED_REWARD_CREDITS = 25;
export const REFERRER_REWARD_CREDITS = 25;

/**
 * Trigger the REFERRED user's reward at email-verification time.
 *
 * Looks up the signup row by `referredUserId`. If found and the row
 * isn't already rewarded, grants `REFERRED_REWARD_CREDITS` and
 * marks the signup row. No-op if:
 *   - REFERRALS_ENABLED is off (returns null)
 *   - User has no signup row (organic signup, no attribution)
 *   - Reward already granted (idempotent — already-rewarded rows
 *     no-op via the writer's IS NULL check)
 *
 * Errors are NOT swallowed — the caller's try/catch handles them.
 * In the verify-email page, that catch logs but doesn't fail the
 * verify (consistent with grantSignupBonus error handling — failing
 * the verify page over a reward grant would block the user from
 * accessing their account).
 */
export async function triggerReferredReward(
  referredUserId: string,
): Promise<{ granted: boolean; credits: number; ledgerId?: string } | null> {
  if (!isReferralsEnabled()) {
    return null;
  }

  // Find the signup row (if any). UNIQUE(referred_user_id) means at
  // most one row.
  const rows = await db
    .select()
    .from(schema.referralSignups)
    .where(eq(schema.referralSignups.referredUserId, referredUserId))
    .limit(1);
  if (rows.length === 0) {
    return { granted: false, credits: 0 };
  }
  const signup = rows[0]!;
  if (signup.referredRewardedAt !== null) {
    // Already rewarded — return granted:false so callers can
    // distinguish from a fresh grant.
    return { granted: false, credits: 0 };
  }

  // Idempotency key is signup-specific so a re-trigger of the same
  // signup gets the same key → grantCredits dedupes.
  const idempotencyKey = `referral_referred:${signup.id}`;

  const grant = await grantCredits({
    userId: referredUserId,
    delta: REFERRED_REWARD_CREDITS,
    reason: "referral_referred",
    note: `Referred by code ${signup.code}`,
    idempotencyKey,
  });

  // Mark the signup row regardless of whether grantCredits applied
  // or deduped — both outcomes mean "the reward exists in the
  // ledger" so the milestone is real. Pass the ledgerId from the
  // applied path; on dedupe we don't have it but the writer's
  // creditLedgerId column accepts the keyless string for audit
  // (the original ledger row's id is recoverable via lookup on
  // idempotencyKey if needed).
  if (grant.applied) {
    await grantReferredReward(signup.id, grant.ledgerId);
    return {
      granted: true,
      credits: REFERRED_REWARD_CREDITS,
      ledgerId: grant.ledgerId,
    };
  }
  // Dedupe path — credit was already granted on a prior trigger.
  // Look up the original ledger row via idempotencyKey so we still
  // store a valid foreign-key value.
  const existingLedger = await db
    .select({ id: schema.creditLedger.id })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existingLedger.length > 0) {
    await grantReferredReward(signup.id, existingLedger[0]!.id);
  }
  return { granted: false, credits: 0 };
}

/**
 * Trigger the REFERRER's reward at the referred user's first credit
 * purchase. Same shape as triggerReferredReward but rewards the
 * REFERRER (signup.referrerUserId).
 *
 * "First purchase" detection is the caller's responsibility — this
 * function is idempotent on the signup row's referrer_rewarded_at
 * field, so even if the caller wires it on every purchase (not just
 * first), only the first call grants credits.
 */
export async function triggerReferrerReward(
  referredUserId: string,
): Promise<{ granted: boolean; credits: number; ledgerId?: string } | null> {
  if (!isReferralsEnabled()) {
    return null;
  }

  const rows = await db
    .select()
    .from(schema.referralSignups)
    .where(eq(schema.referralSignups.referredUserId, referredUserId))
    .limit(1);
  if (rows.length === 0) {
    return { granted: false, credits: 0 };
  }
  const signup = rows[0]!;
  if (signup.referrerRewardedAt !== null) {
    return { granted: false, credits: 0 };
  }

  const idempotencyKey = `referral_referrer:${signup.id}`;

  const grant = await grantCredits({
    userId: signup.referrerUserId,
    delta: REFERRER_REWARD_CREDITS,
    reason: "referral_referrer",
    note: `Friend signed up with your code ${signup.code}`,
    idempotencyKey,
  });

  if (grant.applied) {
    await grantReferrerReward(signup.id, grant.ledgerId);
    return {
      granted: true,
      credits: REFERRER_REWARD_CREDITS,
      ledgerId: grant.ledgerId,
    };
  }
  const existingLedger = await db
    .select({ id: schema.creditLedger.id })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existingLedger.length > 0) {
    await grantReferrerReward(signup.id, existingLedger[0]!.id);
  }
  return { granted: false, credits: 0 };
}
