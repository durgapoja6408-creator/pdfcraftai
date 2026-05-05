// lib/referrals/cookie.ts — server-side helpers for the referral
// attribution cookie (PENDING §3e Phase E, 2026-05-05).
//
// Flow
// ----
// 1. User clicks a friend's share link: `pdfcraftai.com/?ref=ABC1234`.
// 2. They navigate to /register (or land there because their session
//    is stale) — Next-link preserves the `?ref=` query string when
//    we forward it to /register, OR they paste the code manually.
// 3. /register page (server component) calls `setReferralCookie()`
//    with the validated code → middleware-side Set-Cookie response.
// 4. User completes sign-up. NextAuth `events.signIn({ isNewUser })`
//    fires post-creation. The handler reads the cookie, looks up the
//    code → resolves referrerUserId → calls
//    `recordReferralSignup(...)` from `lib/referrals/writers.ts`.
// 5. Cookie is cleared so a re-signin doesn't re-attribute.
//
// Cookie shape
// ------------
//   name:     pdfcraft_ref
//   value:    7-char base36 code (validated against
//             REFERRAL_CODE_ALPHABET so we never write garbage into
//             the table)
//   httpOnly: true (prevents XSS exfiltration; the value is shareable
//             but stealing a logged-in attribution attempt isn't
//             interesting)
//   secure:   true in production (https-only); the helper sniffs
//             NODE_ENV so localhost dev still works
//   sameSite: lax (Strict would lose attribution from external
//             traffic — the typical landing path)
//   maxAge:   30 days (long-tail attribution: someone shares a link
//             today, recipient signs up next week)
//   path:     "/"

import { cookies } from "next/headers";
import { REFERRAL_CODE_ALPHABET, REFERRAL_CODE_LENGTH } from "./codes";

export const REFERRAL_COOKIE_NAME = "pdfcraft_ref";

const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Validate a candidate code against the alphabet + length rules from
 * `lib/referrals/codes.ts`. Used both at cookie-write time (so we
 * don't persist garbage) and read time (so a tampered cookie value
 * doesn't get fed into the SELECT query as-is).
 */
export function isValidReferralCode(code: string): boolean {
  if (typeof code !== "string") return false;
  const upper = code.toUpperCase().trim();
  if (upper.length !== REFERRAL_CODE_LENGTH) return false;
  for (const ch of upper) {
    if (!REFERRAL_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

/**
 * Set the referral cookie. Caller is responsible for having
 * already validated the code via `isValidReferralCode` — we
 * re-validate here as belt-and-suspenders. No-op (returns false)
 * on invalid input.
 *
 * Returns true if the cookie was set, false if the input was
 * rejected.
 *
 * Must be called from a Server Component, Route Handler, or Server
 * Action — `cookies().set()` is a write op only available in those
 * contexts.
 */
export function setReferralCookie(code: string): boolean {
  if (!isValidReferralCode(code)) return false;
  const upper = code.toUpperCase().trim();
  cookies().set({
    name: REFERRAL_COOKIE_NAME,
    value: upper,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return true;
}

/**
 * Read the referral cookie, validating the value before returning.
 * Returns null if the cookie is missing OR contains an invalid
 * value (which could happen if the cookie was tampered with, or
 * if a code-format change invalidated old cookies).
 *
 * Server-side only — `cookies()` from `next/headers` doesn't run on
 * the client.
 */
export function readReferralCookie(): string | null {
  const c = cookies().get(REFERRAL_COOKIE_NAME);
  if (!c) return null;
  if (!isValidReferralCode(c.value)) return null;
  return c.value.toUpperCase().trim();
}

/**
 * Clear the referral cookie. Called from the signIn event handler
 * after attribution has been recorded (or skipped) so the cookie
 * doesn't sit around influencing future re-signins of an existing
 * user.
 *
 * `cookies().delete()` is a write op (Server Component / Route
 * Handler / Server Action only).
 */
export function clearReferralCookie(): void {
  cookies().delete(REFERRAL_COOKIE_NAME);
}
