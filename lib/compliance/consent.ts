// lib/compliance/consent.ts — Cookie / analytics consent helpers.
//
// Task #24 / Phase D.
//
// Purpose:
// --------
// Before Task #24 the Hostinger production site was unconditionally
// loading Google Analytics 4 (G-2Y8PS0S93F) and Microsoft Clarity
// (wcsbv536zv) on every page hit regardless of visitor geography,
// consent posture, or the ePrivacy Directive's consent-first rule.
// That was fine for an anonymous US visitor but violated three
// overlapping regimes the moment we had a single EU/UK or Indian
// visitor:
//
//   1) GDPR Art. 6(1)(a) + ePrivacy Directive Art. 5(3) — "cookies
//      and similar technologies" storing info or reading info from a
//      user's terminal equipment require prior opt-in consent unless
//      strictly necessary. GA4 and Clarity are NOT strictly necessary
//      — they're product analytics. Therefore they must be opt-in for
//      EU/UK visitors, full stop, regardless of IP-anonymization.
//
//   2) UK DPA 2018 + PECR Regulation 6 — functionally identical to
//      GDPR + ePrivacy; ICO guidance (2019) explicitly calls out
//      analytics cookies as requiring consent.
//
//   3) DPDP Act 2023 (India) — s. 6 "Consent" requires free,
//      specific, informed, unconditional, unambiguous consent. s. 6(3)
//      requires the consent to be withdrawable with equal ease as
//      giving it. GA4 + Clarity are both third-country transfers
//      (Google US, Microsoft US) so this is squarely in scope for
//      Indian visitors too.
//
// Design:
// -------
// First-party cookie `pdfcraft_consent` with three levels:
//
//   - "none": visitor has NOT yet interacted with the banner. No
//     analytics scripts. This is the default state for every visitor
//     until they click something. (We could default to "essential"
//     to stop showing the banner on the second visit, but that's
//     ambiguous vs. GDPR's explicit-action requirement — the visitor
//     must actively dismiss or reject, not just navigate away.)
//
//   - "essential": visitor explicitly rejected analytics ("Essential
//     only" button). No analytics scripts. Banner hides.
//
//   - "all": visitor explicitly accepted analytics ("Accept all"
//     button). GA4 + Clarity load. Banner hides.
//
// The cookie is set by the client banner component, read by the
// server-side root layout to decide whether to emit the
// `<Script>` tags. Because the layout reads cookies via
// `next/headers`, any page that transitively uses layout becomes
// dynamic (the layout already was — session cookie reads). Net new
// dynamic cost: zero.
//
// Withdrawal:
// -----------
// DPDP s. 6(3) + GDPR Art. 7(3): withdrawal must be as easy as
// giving. We expose a single "Reset cookie preferences" button on
// /cookies that writes `pdfcraft_consent=none` with Max-Age=0 —
// clearing the value so the banner re-appears on next page load.
//
// Region gating:
// --------------
// `regionRequiresConsent()` returns true for EU/EEA, UK, and India
// by country code. But: we show the banner globally regardless —
// region gating only affects the *required* posture (EU/UK/IN: must
// have consent to load analytics; elsewhere: optional). Showing the
// banner everywhere avoids geo-detection brittleness and is
// visitor-friendly (US visitor can still reject if they want).
//
// Why not Consent Mode v2:
// ------------------------
// Google Consent Mode v2 lets you fire GA4 beacons in "denied" mode
// with parameters stripped — some analytics signal survives without
// consent. We deliberately DON'T use it here because: (a) the ICO's
// 2024 guidance specifically flagged Consent Mode v2 as insufficient
// for EU consent unless "denied" mode also strips the `cid` client
// ID, which Google does NOT do by default; (b) fewer moving parts =
// fewer audit questions during Paddle MoR's privacy review.
//
// Module boundary:
// ----------------
// This file exports pure constants + pure functions — no runtime
// side effects, no `cookies()` call, no env reads. Both the
// server-side layout (which reads the cookie via `next/headers`)
// and the client banner (which writes the cookie via
// `document.cookie`) import from here. That's deliberate: the
// regulated values (cookie name, max-age, allowed levels, required
// countries) must be defined in ONE place or they drift.
//
// The actual cookie read lives in app/layout.tsx (server); the
// actual cookie write lives in components/compliance/CookieConsent
// .tsx (client). Neither of those cares about these helpers
// beyond the exported string constants and the `parseConsent` +
// `analyticsAllowed` pure functions.

/**
 * Name of the first-party consent cookie.
 *
 * Kept as an exported constant so the test harness and the client
 * banner can import the exact name rather than repeating a string
 * literal — a rename would break tsc in one place instead of
 * silently de-syncing.
 */
export const CONSENT_COOKIE_NAME = "pdfcraft_consent";

/**
 * Cookie lifetime: 365 days.
 *
 * GDPR doesn't prescribe a duration but ICO guidance suggests 6–13
 * months is reasonable for consent cookies. 365 days lands in the
 * middle of that range and matches what most CMPs (OneTrust,
 * Cookiebot) default to.
 */
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * The three valid consent levels.
 *
 * Exported as a union type + runtime array so the test harness can
 * exhaustively verify the parser — a fourth value snuck into the
 * union without a parser branch would slip past tsc otherwise.
 */
export type ConsentLevel = "none" | "essential" | "all";

export const CONSENT_LEVELS: readonly ConsentLevel[] = [
  "none",
  "essential",
  "all",
] as const;

/**
 * Parse a raw cookie value into a valid `ConsentLevel`.
 *
 * Never throws. Unknown / absent / malformed values collapse to
 * `"none"` (the safe default — no analytics). This is deliberate:
 * an attacker-controlled cookie claiming `"all"` would be the worst
 * possible failure mode, but claiming `"none"` is harmless.
 */
export function parseConsent(raw: string | null | undefined): ConsentLevel {
  if (!raw) return "none";
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "all") return "all";
  if (trimmed === "essential") return "essential";
  return "none";
}

/**
 * Whether analytics scripts (GA4, Clarity) may be loaded given the
 * current consent level.
 *
 * Only `"all"` allows analytics. `"essential"` (explicit reject) and
 * `"none"` (not yet interacted) both block.
 */
export function analyticsAllowed(level: ConsentLevel): boolean {
  return level === "all";
}

/**
 * ISO 3166-1 alpha-2 country codes for jurisdictions where we
 * treat analytics-cookie consent as LEGALLY REQUIRED (not just
 * best practice).
 *
 * Sources:
 *   - EU/EEA list: 27 EU + Iceland, Liechtenstein, Norway
 *   - UK: post-Brexit but PECR still applies
 *   - India: DPDP Act 2023, in force 2025
 *
 * Kept in ISO alpha-2 because that's what Cloudflare's
 * `cf-ipcountry` header emits. "EU" pseudo-code is NOT emitted by CF
 * — we have to enumerate.
 */
export const CONSENT_REQUIRED_COUNTRIES: readonly string[] = [
  // EU 27
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // EEA (EU + IS/LI/NO)
  "IS", "LI", "NO",
  // UK post-Brexit
  "GB",
  // India — DPDP Act 2023
  "IN",
] as const;

/**
 * Whether the visitor's country requires explicit consent before
 * analytics cookies can be set.
 *
 * Used by the banner to decide whether to show it with the harder
 * "consent or go home" posture vs. the softer "optional" posture.
 * Today both postures render the same UI — we kept the helper so
 * future UX can branch (e.g., non-EU visitors could get a softer
 * "dismiss" cross instead of the reject/accept pair).
 *
 * An unknown / sentinel country code (CF's `"XX"` = can't geolocate,
 * `"T1"` = Tor exit) falls through to `true` — the safer default
 * since an unknown visitor could be EU.
 */
export function regionRequiresConsent(countryCode: string | null | undefined): boolean {
  if (!countryCode) return true;
  const c = countryCode.trim().toUpperCase();
  if (c === "" || c === "XX" || c === "T1") return true;
  return CONSENT_REQUIRED_COUNTRIES.includes(c);
}
