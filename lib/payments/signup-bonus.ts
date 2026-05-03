// Signup bonus grant helper (plan §2 path D + §8 layer 6 + Day 6).
//
// Single entry-point for the post-signup credit grant. Today it's
// gated by `SIGNUP_GRANT_ENABLED` (default OFF) — the helper is
// callable but no-ops until the env var flips. Day 6 is the atomic
// deploy that flips the flag in concert with the marketing copy
// sweep ("25 credits" → "5 credits, valid 7 days").
//
// What this does when enabled
//   - Writes a single credit_ledger row with:
//       delta = SIGNUP_GRANT_CREDITS (5 by default)
//       reason = "signup_bonus"
//       expiresAt = NOW + SIGNUP_GRANT_TTL_DAYS (7 by default)
//       idempotencyKey = `signup_bonus:${userId}`  (one grant per user, ever)
//   - Bumps users' credits.balance by the same delta in the same
//     transaction (handled by grantCredits).
//
// What this does NOT do
//   - It does NOT check abuse signals (disposable email, IP bucket,
//     device fingerprint, Turnstile). Caller must verify those FIRST
//     or the grant is unguarded. registerAction will check abuse-
//     prevention layers BEFORE calling this helper.
//   - It does NOT validate the user exists. Caller must have just
//     inserted the users row.
//   - It does NOT send a notification email. The verification flow
//     (Day 1.5a) sends the email; this helper just funds the credits
//     so the email can say "5 credits added — verify within 7 days
//     to use them".
//
// Idempotency
//   `idempotencyKey: signup_bonus:${userId}` ensures exactly-once
//   semantics across the user's lifetime. Re-calling for the same
//   user is a no-op (returns { granted: false, reason: "duplicate" }).
//   This is critical because the helper is called from BOTH
//   registerAction (credentials path) AND the OAuth callback (Google
//   path) — a user who registers via credentials then later links
//   Google won't double-grant.

import "server-only";

import { grantCredits } from "@/lib/payments/ledger";

/**
 * Default credit count for the signup bonus. Plan §2 path D locks
 * this at 5. Configurable via env var so we can A/B test 5 vs 10
 * later without redeploying.
 */
const DEFAULT_SIGNUP_GRANT_CREDITS = 5;

/**
 * Default expiry window for the signup bonus, in days. Plan §8 layer
 * 6 locks this at 7. Configurable via env var.
 */
const DEFAULT_SIGNUP_GRANT_TTL_DAYS = 7;

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `[signup-bonus] Invalid env ${name}="${raw}" — using fallback ${fallback}`
    );
    return fallback;
  }
  return parsed;
}

/**
 * Whether the signup bonus is currently funded. Day 6 flips this to
 * "true" via Hostinger panel atomically with the marketing copy
 * change. Default OFF means the helper is callable but no-ops until
 * the user-facing flip is ready.
 */
export function isSignupGrantEnabled(): boolean {
  return process.env.SIGNUP_GRANT_ENABLED === "true";
}

export type SignupBonusResult =
  | { granted: true; credits: number; expiresAt: Date }
  | { granted: false; reason: "disabled" | "duplicate" | "zero_delta" };

/**
 * Grant the post-signup credit bonus to a freshly-registered user.
 *
 * Idempotent — calling twice for the same user is a no-op the second
 * time (returns `{ granted: false, reason: "duplicate" }`).
 *
 * Returns `{ granted: false, reason: "disabled" }` if the
 * SIGNUP_GRANT_ENABLED env var is not "true". Code paths that
 * currently call this (registerAction, OAuth callback) will land in
 * follow-up commits; this helper exists today so the wiring is a
 * one-line change at flip time.
 */
export async function grantSignupBonus(
  userId: string
): Promise<SignupBonusResult> {
  if (!isSignupGrantEnabled()) {
    return { granted: false, reason: "disabled" };
  }

  const credits = readIntEnv(
    "SIGNUP_GRANT_CREDITS",
    DEFAULT_SIGNUP_GRANT_CREDITS
  );
  const ttlDays = readIntEnv(
    "SIGNUP_GRANT_TTL_DAYS",
    DEFAULT_SIGNUP_GRANT_TTL_DAYS
  );
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  const result = await grantCredits({
    userId,
    delta: credits,
    reason: "signup_bonus",
    note: `Welcome bonus: ${credits} credits, valid ${ttlDays} days`,
    idempotencyKey: `signup_bonus:${userId}`,
    expiresAt,
  });

  if (result.applied) {
    return { granted: true, credits, expiresAt };
  }
  if (result.reason === "duplicate") {
    return { granted: false, reason: "duplicate" };
  }
  // delta is constant > 0 — zero_delta is unreachable. TS narrowing.
  return { granted: false, reason: "zero_delta" };
}
