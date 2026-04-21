// Display names for the Tier-2 country picker in the launch-notify flow.
//
// Why a separate module (and not just a map next to TIER_2_COUNTRIES in
// lib/payments/router.ts):
//   - router.ts is a pure routing policy file consumed by the checkout
//     server path. It intentionally has no UI concerns — ISO codes only.
//   - The display-name map is a presentation concern (marketing pages,
//     the deferred-region signup surface) that could in principle
//     localise into other languages; keeping it separate lets future
//     translation wrapping live here without churning the routing module.
//   - The router comment already flagged "if a second geo-aware surface
//     emerges, extract policy into lib/geo/" — sub-item (4) of Task #3
//     (proactive launch-notify signup on marketing pages) is that second
//     surface, so this file is the lib/geo/ seed.
//
// Coverage contract:
//   - EVERY ISO-2 code in TIER_2_COUNTRIES (lib/payments/router.ts) MUST
//     have a name entry. scripts/test-geo-waitlist.mjs enforces this via
//     the `tier2CountryNames coverage` assertion. If you add or remove
//     a Tier 2 country in router.ts, update this map in the same commit.
//
// Names:
//   - Use the ISO-3166 short "common" English name (UK-style where
//     applicable, e.g. "Czech Republic" — matches most CSVs and pickers
//     users have seen). If legal later asks for the formal long name,
//     change here; consumers read whatever this exports.

import { TIER_2_COUNTRIES } from "@/lib/payments/router";

/**
 * ISO-3166-1 alpha-2 → English display name.
 *
 * Order below mirrors the groupings in router.ts (EU first by code, then
 * EEA non-EU, then the three indefinitely-deferred markets) so a diff
 * stays readable when the policy changes.
 */
export const TIER_2_COUNTRY_NAMES: Readonly<Record<string, string>> = {
  // EU 27
  AT: "Austria",
  BE: "Belgium",
  BG: "Bulgaria",
  HR: "Croatia",
  CY: "Cyprus",
  CZ: "Czech Republic",
  DK: "Denmark",
  EE: "Estonia",
  FI: "Finland",
  FR: "France",
  DE: "Germany",
  GR: "Greece",
  HU: "Hungary",
  IE: "Ireland",
  IT: "Italy",
  LV: "Latvia",
  LT: "Lithuania",
  LU: "Luxembourg",
  MT: "Malta",
  NL: "Netherlands",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  SK: "Slovakia",
  SI: "Slovenia",
  ES: "Spain",
  SE: "Sweden",
  // EEA non-EU + Switzerland
  CH: "Switzerland",
  NO: "Norway",
  IS: "Iceland",
  LI: "Liechtenstein",
  // Indefinitely deferred for non-privacy reasons (Firewall / sanctions
  // overlay / data localization). We still let users opt in — the launch
  // signal is legitimate even if the launch date is "not soon".
  CN: "China",
  RU: "Russia",
  BY: "Belarus",
} as const;

/**
 * Sorted list of `{ code, name }` pairs for dropdown rendering.
 * Sorted by display name (case-insensitive) so the picker reads like a
 * standard country selector, not like the policy doc's grouping.
 *
 * Computed lazily once at module load — TIER_2_COUNTRIES is a frozen Set
 * and the names map is also `as const`, so the array is safe to share.
 */
export const TIER_2_COUNTRY_OPTIONS: ReadonlyArray<{
  code: string;
  name: string;
}> = Array.from(TIER_2_COUNTRIES)
  .map((code) => ({
    code,
    name: TIER_2_COUNTRY_NAMES[code] ?? code,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Lookup helper — returns the display name, or the raw code as a fallback
 * if the code slipped past the Tier-2 set (shouldn't happen; callers
 * validate first).
 */
export function tier2CountryName(code: string): string {
  return TIER_2_COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}
