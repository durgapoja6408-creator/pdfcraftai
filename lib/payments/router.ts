// Geo-aware checkout routing — pure decision function, no side effects.
//
// Responsibilities:
//   - Given an ISO-3166-1 alpha-2 country code (normally from Cloudflare's
//     `CF-IPCountry` request header), return a single `RouteDecision` that
//     tells the checkout UI what to do:
//       - `action: "route"`  → proceed to the named rail (razorpay only
//                              right now; international rail is empty
//                              until next gateway is approved)
//       - `action: "defer"`  → show the "we're not in your country yet +
//                              notify-me" form (Tier 2, e.g. EU)
//       - `action: "block"`  → refuse with HTTP 451 (Tier 3 sanctioned;
//                              defense-in-depth — the Cloudflare WAF rule
//                              per docs/GEO_LAUNCH_POLICY.md §3.1 catches
//                              these at the edge first, so origin rarely
//                              sees them)
//       - `action: "unknown"` → CF header missing or malformed; conservative
//                               "defer" response with a distinct reason so
//                               the UI can prompt for manual country
//
// This file is the canonical source for the Tier 1 / Tier 2 / Tier 3 country
// sets. Policy source of truth: docs/GEO_LAUNCH_POLICY.md §2 (tier tables)
// and §3.2 (routing example). If you change a country's tier, update both
// files; `scripts/test-geo-router.mjs` enforces that the codes match.
//
// Why this lives in lib/payments and not lib/geo:
//   - The only consumer today is the checkout flow.
//   - Non-checkout pages (marketing, docs) are globally accessible; only
//     the checkout-actions → adapter path is gated.
//   - If a second geo-aware surface emerges (e.g. a feature-flag gate),
//     extract the policy sets into a lib/geo/ module and have both
//     consumers import from there.
//
// NOT responsible for:
//   - Sub-country (subdivision) blocks — UA-43/40/14/09/65/23 are handled
//     by the Cloudflare WAF rule (see scripts/cloudflare/tier3-ofac-geoblock.json
//     + docs/ops/CLOUDFLARE_GEOBLOCK_SETUP.md). Origin never sees those
//     requests, so TIER_3_COUNTRIES is intentionally the 4 country-level
//     sanctioned entries only.
//   - Card-country vs IP-country mismatch — `CF-IPCountry` is IP; the
//     adapter (Razorpay) uses card BIN for currency inference. Policy
//     doc §6.2 documents this is a non-conflict.
//   - Currency selection — that's still the registry's job via
//     `selectProvider({ currency, mode })`. The router only picks a rail.

import type { Currency, ProviderId } from "./types";

// --- Policy sets (mirror docs/GEO_LAUNCH_POLICY.md §2) ---------------------

/**
 * Tier 1 — countries we serve at launch. India resolves to `razorpay`;
 * other Tier 1 countries currently route to "defer" (no international
 * rail configured) until the next gateway is approved.
 *
 * Order matches the policy doc's rows for readability during audit reviews.
 */
export const TIER_1_COUNTRIES: ReadonlySet<string> = new Set([
  // Home market (Razorpay rail)
  "IN",
  // Core English-speaking
  "US", "GB", "CA", "AU", "NZ",
  // Asia tech hubs
  "SG", "AE",
  // Rest of South/Southeast Asia
  "PH", "MY", "TH", "VN", "ID",
  // Middle East + Africa
  "SA", "EG", "NG", "KE", "ZA",
  // Latin America
  "BR", "MX", "CO", "AR", "CL", "PE",
  // Rest of Asia-Pacific
  "JP", "KR", "TW", "HK",
]);

/**
 * EU member states (27 countries). Grouped separately from EEA_PLUS so the
 * UI copy can distinguish "EU launch" from "EEA launch" if policy ever
 * splits. Currently both tiers roll up to "Tier 2 — deferred".
 */
export const EU_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE",
  "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

/**
 * EEA members who inherit most GDPR obligations plus Switzerland (nFADP)
 * and China/Russia/Belarus (indefinitely deferred for separate reasons).
 *
 * Policy doc §2 tier 2 table: EU, CH, NO, IS, LI, CN, RU, BY.
 */
export const TIER_2_COUNTRIES: ReadonlySet<string> = new Set([
  ...EU_COUNTRIES,
  "CH",                      // Switzerland — nFADP
  "NO", "IS", "LI",          // EEA non-EU
  "CN",                      // Great Firewall + ICP licensing
  "RU", "BY",                // Sanctions overlay + data localization
]);

/**
 * OFAC comprehensively-sanctioned countries. Country-level block only —
 * subdivision-level blocks (Crimea / Sevastopol / Donetsk / Luhansk /
 * Kherson / Zaporizhzhia) are handled at the Cloudflare edge per
 * docs/GEO_LAUNCH_POLICY.md §3.1 — they never reach this router because
 * the WAF rule rejects them with HTTP 403 before the origin sees the
 * request. So this set is intentionally the 4 comprehensive-sanctioned
 * countries only.
 */
export const TIER_3_COUNTRIES: ReadonlySet<string> = new Set([
  "IR", "SY", "KP", "CU",
]);

// --- Decision shape --------------------------------------------------------

/**
 * What the checkout flow should do for this request. Discriminated on
 * `action` so the switch is exhaustive and the UI + API can pattern-match.
 *
 * Status codes follow the policy doc:
 *   - Tier 3 `block`  → 451 "Unavailable For Legal Reasons" (RFC 7725).
 *     The edge WAF on free plan returns 403 instead; if a request reaches
 *     origin anyway (WAF misconfig / regression), Node returns the
 *     legally-correct 451.
 *   - Tier 2 `defer`  → 403, framed as "not available yet" (policy §3.3
 *     provides the exact copy to render).
 *   - Unknown country → 403 with a distinct `reason` so the UI can prompt
 *     for manual country selection rather than reusing Tier-2 copy.
 */
export type RouteDecision =
  | {
      action: "route";
      tier: 1;
      /** Which rail the registry should prefer. */
      rail: ProviderId;
      /** Preferred presentation currency for this rail. */
      currency: Currency;
      country: string;
    }
  | {
      action: "defer";
      tier: 2;
      status: 403;
      country: string;
      /** Stable ID the UI can key copy + email-capture analytics off. */
      reason: "tier2_deferred";
    }
  | {
      action: "block";
      tier: 3;
      status: 451;
      country: string;
      reason: "tier3_sanctioned";
    }
  | {
      action: "unknown";
      status: 403;
      /** Raw header value, if any, for debug logs. Never echoed to client. */
      received: string | null;
      reason: "geo_unknown";
    };

// --- Routing function ------------------------------------------------------

/**
 * Map a Cloudflare `CF-IPCountry` header value (or any ISO-2 code) to a
 * `RouteDecision`. Case-insensitive; whitespace-tolerant; null/undefined
 * safe.
 *
 * CF reserves a few non-ISO values:
 *   - "XX"  → country unknown (CF couldn't geolocate the IP)
 *   - "T1"  → Tor exit node
 *   - ""    → header stripped (shouldn't happen behind our CF proxy)
 * All three resolve to `action: "unknown"` so the UI can fall back to a
 * country-picker instead of silently defaulting to a specific tier.
 *
 * This function is pure — no DB, no network, no logging side-effects.
 * Callers that want to log a routing decision (e.g. for the 2-year
 * audit trail in GEO_LAUNCH_POLICY §5) should do so at their layer with
 * the returned decision as the payload.
 */
export function routeCheckoutByCountry(
  rawCountry: string | null | undefined
): RouteDecision {
  const cleaned =
    typeof rawCountry === "string" ? rawCountry.trim().toUpperCase() : "";

  if (!cleaned || cleaned === "XX" || cleaned === "T1") {
    return {
      action: "unknown",
      status: 403,
      received: rawCountry ?? null,
      reason: "geo_unknown",
    };
  }

  if (TIER_3_COUNTRIES.has(cleaned)) {
    return {
      action: "block",
      tier: 3,
      status: 451,
      country: cleaned,
      reason: "tier3_sanctioned",
    };
  }

  if (TIER_2_COUNTRIES.has(cleaned)) {
    return {
      action: "defer",
      tier: 2,
      status: 403,
      country: cleaned,
      reason: "tier2_deferred",
    };
  }

  if (cleaned === "IN") {
    return {
      action: "route",
      tier: 1,
      rail: "razorpay",
      currency: "INR",
      country: cleaned,
    };
  }

  // 2026-05-01: international rail temporarily empty. Tier-1 non-IN
  // countries fall through to "defer" (the same UX as Tier-2) until
  // the next international gateway is approved + wired up. The "defer"
  // surface already exists end-to-end (geo-waitlist signup, email
  // capture, "we'll let you know when we ship" copy), so we re-use it
  // rather than introducing a new error state.
  //
  // To re-enable international: add a row to lib/payments/registry.ts
  // for the new gateway, then add a `route` branch here mapping
  // TIER_1_COUNTRIES + the catchall to that rail's ProviderId.
  if (TIER_1_COUNTRIES.has(cleaned)) {
    return {
      action: "defer",
      tier: 2,
      status: 403,
      country: cleaned,
      reason: "tier2_deferred",
    };
  }

  // Catchall: any country not explicitly tiered. Same defer-until-
  // approved policy as Tier-1 above.
  return {
    action: "defer",
    tier: 2,
    status: 403,
    country: cleaned,
    reason: "tier2_deferred",
  };
}

/**
 * Convenience: extract the CF-IPCountry header from a Next.js Request-ish
 * headers object. Accepts either a `Headers` instance or a plain record.
 * Returns the raw header value (uppercase, untrimmed) or null if absent.
 *
 * Exported so route handlers + server actions don't re-invent the header
 * lookup (and so future changes — e.g. respecting `x-forwarded-country`
 * or a synthetic header from a testing harness — happen in one place).
 */
export function readCountryHeader(
  headers: Headers | Record<string, string | string[] | undefined>
): string | null {
  const raw =
    headers instanceof Headers
      ? headers.get("cf-ipcountry")
      : (headers["cf-ipcountry"] ?? headers["CF-IPCountry"]);

  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === "string") return raw;
  return null;
}
