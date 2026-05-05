// Referral code generator + idempotent fetch-or-create (PENDING §3e, 2026-05-05).
//
// One-paragraph summary
// ---------------------
// Each user gets ONE referral code, generated lazily the first time
// they need to share it. Codes are 7 chars, base36 (0-9 A-Z), uppercase,
// excluding visually ambiguous chars (0/O, 1/I/L). The exclusion is for
// people who type codes manually from physical promo material — most
// usage is paste-from-URL, but the small UX win for "0 vs O" is worth
// the trivial namespace shrink.
//
// Generation = pure RNG with retry-on-collision. The namespace is
// 32^7 ≈ 35 billion entries; collision probability at 1M users is ~1
// in 70K. The helper retries up to 8 times before throwing; in practice
// retry is never observed.
//
// What's NOT here:
// - User-chosen vanity codes ("rajaSelvam"). Nice-to-have but adds
//   abuse surface (squatting, slurs, brand impersonation). Current
//   foundation: random codes only.
// - Code regeneration / rotation. Schema accommodates it (the code
//   is denormalized onto each `referral_signups` row at attribution
//   time, so regeneration wouldn't break historical attribution), but
//   no UX for it today.
// - Multiple codes per user. Schema enforces UNIQUE(user_id) — exactly
//   one code per user. Phase F could relax this if we want different
//   codes for different campaigns, but the analytics overhead probably
//   outweighs the lift.

import { randomUUID } from "node:crypto";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

/**
 * Character set: base36 minus visually ambiguous characters.
 *
 *   Excluded: 0, O, 1, I, L
 *   Kept:     2-9, A-H, J, K, M, N, P-Z
 *   Namespace size: 31 chars × 7 positions = 31^7 ≈ 27.5 billion codes
 *
 * Excluding 0 means we don't accidentally generate codes that look like
 * they start with "OO..." (which a user might paste as "00..."). Same
 * rationale for 1/I/L confusion. Random people printing codes on
 * physical material happens rarely, but the small UX cost of a wider
 * alphabet is zero, and the readability win is real.
 */
export const REFERRAL_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REFERRAL_CODE_LENGTH = 7;

/**
 * Generate a single random referral code WITHOUT collision-checking.
 * Pure function — useful for tests + the retry loop in
 * `getOrCreateReferralCode`.
 *
 * Collision probability at ~1M users in a 31^7 ≈ 27.5B namespace is
 * roughly 1 in 27,500 (birthday-paradox approximation: n²/2N where
 * n = 1M, N = 27.5B). The retry loop in `getOrCreateReferralCode`
 * handles the rare hit; we don't try to make the generator itself
 * collision-aware (that would couple it to a DB read).
 */
export function generateReferralCode(): string {
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length);
    out += REFERRAL_CODE_ALPHABET[idx];
  }
  return out;
}

/**
 * Fetch the user's existing code OR create one if they don't have one.
 *
 * Idempotent: calling this twice for the same user returns the same
 * code (because of UNIQUE(user_id) — the second insert would throw,
 * and the catch path re-reads). Concurrent first-time calls from two
 * processes for the same user race; one INSERT wins, the other catches
 * the duplicate-key error and falls through to the SELECT.
 *
 * Retry-on-collision: if `generateReferralCode()` happens to collide
 * with an existing code (UNIQUE(code) violation), the loop retries up
 * to 8 times. After 8, throws — at that point either the namespace is
 * exhausted (≈ 27B codes — we're not worrying about it) or there's a
 * real DB problem (bubble it up).
 */
export async function getOrCreateReferralCode(
  userId: string,
): Promise<{ id: string; userId: string; code: string }> {
  // Cheap path — if the row exists, return it. Hot path for every
  // page load that surfaces the user's referral link, so we want this
  // to be a single PK-aware lookup.
  const existing = await db
    .select()
    .from(schema.referralCodes)
    .where(eq(schema.referralCodes.userId, userId))
    .limit(1);
  if (existing.length > 0) {
    return {
      id: existing[0]!.id,
      userId: existing[0]!.userId,
      code: existing[0]!.code,
    };
  }

  // Cold path — generate + insert. Collision retry loop.
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateReferralCode();
    const id = randomUUID();
    try {
      await db.insert(schema.referralCodes).values({
        id,
        userId,
        code: candidate,
      });
      return { id, userId, code: candidate };
    } catch (err) {
      // MySQL/MariaDB ER_DUP_ENTRY = 1062. Could be a `code` collision
      // (retry with new code) or a `user_id` collision (another process
      // inserted concurrently — re-read).
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("Duplicate entry") && !message.includes("ER_DUP_ENTRY")) {
        throw err;
      }
      // Re-read in case it was a user_id collision (another process won
      // the race). If we find a row, we're done.
      const raceWinner = await db
        .select()
        .from(schema.referralCodes)
        .where(eq(schema.referralCodes.userId, userId))
        .limit(1);
      if (raceWinner.length > 0) {
        return {
          id: raceWinner[0]!.id,
          userId: raceWinner[0]!.userId,
          code: raceWinner[0]!.code,
        };
      }
      // Otherwise it was a code collision — try a new code.
    }
  }
  throw new Error("Failed to generate unique referral code after 8 attempts");
}

/**
 * Look up a code → userId mapping. Returns null if the code doesn't
 * exist. Used at signup time to attribute the referrer when a code
 * arrives via URL parameter (?ref=ABC1234).
 *
 * Codes are stored UPPERCASE — we upper-case the input so a user typing
 * "abc1234" still resolves correctly.
 */
export async function lookupReferralCode(
  code: string,
): Promise<{ userId: string; code: string } | null> {
  const normalized = code.toUpperCase().trim();
  if (normalized.length === 0) return null;
  const rows = await db
    .select()
    .from(schema.referralCodes)
    .where(eq(schema.referralCodes.code, normalized))
    .limit(1);
  if (rows.length === 0) return null;
  return { userId: rows[0]!.userId, code: rows[0]!.code };
}
