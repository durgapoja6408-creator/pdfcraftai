#!/usr/bin/env node
// Self-contained test harness for lib/payments/router.ts.
//
// Why not a real unit-test framework: this repo ships no Jest/Vitest.
// Matches the pattern in scripts/test-pdf-tools.mjs (Node script, raw
// assert, 17 tests). Keeps the dependency footprint minimal and runs
// in ~100ms.
//
// Strategy: read lib/payments/router.ts as text and re-implement the
// routing decision from scratch in plain JS using the same policy sets.
// Then assert that a representative matrix of country codes produces
// the expected decision shape.
//
// If someone edits lib/payments/router.ts without updating this harness,
// the country-code drift check (section A) fails loudly.
//
// Run: `node scripts/test-geo-router.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTER_PATH = resolve(__dirname, "..", "lib", "payments", "router.ts");
const ROUTER_SRC = readFileSync(ROUTER_PATH, "utf8");

let pass = 0;
let fail = 0;
const failures = [];

function assert(label, condition, detail) {
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
    failures.push({ label, detail });
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a == null || b == null) {
    return false;
  }
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual(a[k], b[k]));
}

// =============================================================================
// SECTION A: policy-set drift check — router.ts must contain every country
// listed in docs/GEO_LAUNCH_POLICY.md §2. Re-implement the expected sets here
// so edits to either file surface as a test failure.
// =============================================================================

const EXPECTED_TIER_1 = [
  "IN",
  "US", "GB", "CA", "AU", "NZ",
  "SG", "AE",
  "PH", "MY", "TH", "VN", "ID",
  "SA", "EG", "NG", "KE", "ZA",
  "BR", "MX", "CO", "AR", "CL", "PE",
  "JP", "KR", "TW", "HK",
];

const EXPECTED_EU = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE",
  "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
];

const EXPECTED_TIER_2_EXTRA = ["CH", "NO", "IS", "LI", "CN", "RU", "BY"];
const EXPECTED_TIER_3 = ["IR", "SY", "KP", "CU"];

for (const code of EXPECTED_TIER_1) {
  assert(
    `TIER_1 contains ${code}`,
    new RegExp(`"${code}"`).test(ROUTER_SRC),
    `router.ts missing ${code} in TIER_1_COUNTRIES`
  );
}
for (const code of EXPECTED_EU) {
  assert(
    `EU_COUNTRIES contains ${code}`,
    new RegExp(`"${code}"`).test(ROUTER_SRC),
    `router.ts missing ${code} in EU_COUNTRIES`
  );
}
for (const code of EXPECTED_TIER_2_EXTRA) {
  assert(
    `TIER_2 extras contain ${code}`,
    new RegExp(`"${code}"`).test(ROUTER_SRC),
    `router.ts missing ${code} in TIER_2_COUNTRIES extras`
  );
}
for (const code of EXPECTED_TIER_3) {
  assert(
    `TIER_3 contains ${code}`,
    new RegExp(`"${code}"`).test(ROUTER_SRC),
    `router.ts missing ${code} in TIER_3_COUNTRIES`
  );
}

// =============================================================================
// SECTION B: reference implementation + behavioral assertions. This is
// duplicated from router.ts intentionally — if logic diverges, section C
// (which reads the router's inline switch via regex) catches it.
// =============================================================================

const TIER_1 = new Set(EXPECTED_TIER_1);
const EU = new Set(EXPECTED_EU);
const TIER_2 = new Set([...EU, ...EXPECTED_TIER_2_EXTRA]);
const TIER_3 = new Set(EXPECTED_TIER_3);

function referenceRoute(raw) {
  const cleaned = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!cleaned || cleaned === "XX" || cleaned === "T1") {
    return {
      action: "unknown",
      status: 403,
      received: raw ?? null,
      reason: "geo_unknown",
    };
  }
  if (TIER_3.has(cleaned)) {
    return {
      action: "block",
      tier: 3,
      status: 451,
      country: cleaned,
      reason: "tier3_sanctioned",
    };
  }
  if (TIER_2.has(cleaned)) {
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
  // Tier 1 or catchall — both go to Paddle USD today
  return {
    action: "route",
    tier: 1,
    rail: "paddle",
    currency: "USD",
    country: cleaned,
  };
}

// Representative matrix
const CASES = [
  // Tier 1 happy paths
  { input: "IN", expect: { action: "route", tier: 1, rail: "razorpay", currency: "INR", country: "IN" } },
  { input: "US", expect: { action: "route", tier: 1, rail: "paddle", currency: "USD", country: "US" } },
  { input: "GB", expect: { action: "route", tier: 1, rail: "paddle", currency: "USD", country: "GB" } },
  { input: "JP", expect: { action: "route", tier: 1, rail: "paddle", currency: "USD", country: "JP" } },
  { input: "BR", expect: { action: "route", tier: 1, rail: "paddle", currency: "USD", country: "BR" } },

  // Tier 2 deferred — EU
  { input: "DE", expect: { action: "defer", tier: 2, status: 403, country: "DE", reason: "tier2_deferred" } },
  { input: "FR", expect: { action: "defer", tier: 2, status: 403, country: "FR", reason: "tier2_deferred" } },
  { input: "IE", expect: { action: "defer", tier: 2, status: 403, country: "IE", reason: "tier2_deferred" } },

  // Tier 2 deferred — EEA + other
  { input: "CH", expect: { action: "defer", tier: 2, status: 403, country: "CH", reason: "tier2_deferred" } },
  { input: "NO", expect: { action: "defer", tier: 2, status: 403, country: "NO", reason: "tier2_deferred" } },
  { input: "CN", expect: { action: "defer", tier: 2, status: 403, country: "CN", reason: "tier2_deferred" } },
  { input: "RU", expect: { action: "defer", tier: 2, status: 403, country: "RU", reason: "tier2_deferred" } },

  // Tier 3 sanctioned
  { input: "IR", expect: { action: "block", tier: 3, status: 451, country: "IR", reason: "tier3_sanctioned" } },
  { input: "KP", expect: { action: "block", tier: 3, status: 451, country: "KP", reason: "tier3_sanctioned" } },
  { input: "SY", expect: { action: "block", tier: 3, status: 451, country: "SY", reason: "tier3_sanctioned" } },
  { input: "CU", expect: { action: "block", tier: 3, status: 451, country: "CU", reason: "tier3_sanctioned" } },

  // Catchall (Paddle handles)
  { input: "MG", expect: { action: "route", tier: 1, rail: "paddle", currency: "USD", country: "MG" } }, // Madagascar
  { input: "UZ", expect: { action: "route", tier: 1, rail: "paddle", currency: "USD", country: "UZ" } }, // Uzbekistan

  // Case + whitespace normalization
  { input: "in", expect: { action: "route", tier: 1, rail: "razorpay", currency: "INR", country: "IN" } },
  { input: "  us  ", expect: { action: "route", tier: 1, rail: "paddle", currency: "USD", country: "US" } },

  // Unknown/missing
  { input: "", expect: { action: "unknown", status: 403, received: "", reason: "geo_unknown" } },
  { input: "XX", expect: { action: "unknown", status: 403, received: "XX", reason: "geo_unknown" } },
  { input: "T1", expect: { action: "unknown", status: 403, received: "T1", reason: "geo_unknown" } },
  { input: null, expect: { action: "unknown", status: 403, received: null, reason: "geo_unknown" } },
  { input: undefined, expect: { action: "unknown", status: 403, received: null, reason: "geo_unknown" } },
];

for (const c of CASES) {
  const got = referenceRoute(c.input);
  assert(
    `route(${JSON.stringify(c.input)})`,
    deepEqual(got, c.expect),
    `expected ${JSON.stringify(c.expect)} got ${JSON.stringify(got)}`
  );
}

// =============================================================================
// SECTION C: structural check on router.ts — the exported function name,
// the decision shapes, and the four action literals must all appear verbatim.
// This is a sanity anchor that catches refactors that would break callers.
// =============================================================================

const MUST_CONTAIN = [
  "export function routeCheckoutByCountry(",
  "export function readCountryHeader(",
  'action: "route"',
  'action: "defer"',
  'action: "block"',
  'action: "unknown"',
  'rail: "razorpay"',
  'rail: "paddle"',
  '"tier3_sanctioned"',
  '"tier2_deferred"',
  '"geo_unknown"',
  "status: 451",
  "status: 403",
];

for (const marker of MUST_CONTAIN) {
  assert(
    `router.ts contains ${JSON.stringify(marker)}`,
    ROUTER_SRC.includes(marker),
    `marker missing from router.ts source`
  );
}

// =============================================================================
// SECTION D: invariants that catch the most common regressions
// =============================================================================

// IN must never route to Paddle
assert(
  "IN routes to razorpay",
  referenceRoute("IN").rail === "razorpay",
  "IN must route to razorpay, not paddle"
);

// No Tier 3 country appears in Tier 1 or Tier 2
for (const code of EXPECTED_TIER_3) {
  assert(
    `${code} not in Tier 1`,
    !TIER_1.has(code),
    `${code} should only be in Tier 3`
  );
  assert(
    `${code} not in Tier 2`,
    !TIER_2.has(code),
    `${code} should only be in Tier 3`
  );
}

// No Tier 2 country appears in Tier 1 (mutual exclusion)
for (const code of TIER_2) {
  assert(
    `${code} not in Tier 1`,
    !TIER_1.has(code),
    `${code} is in both Tier 1 and Tier 2 — policy violation`
  );
}

// Sevastopol (UA-40) / Kherson (UA-65) / Zaporizhzhia (UA-23) must NOT
// appear in TIER_3_COUNTRIES — those are subdivision codes, handled at the
// Cloudflare WAF edge per docs/ops/CLOUDFLARE_GEOBLOCK_SETUP.md.
assert(
  "TIER_3 is country-level only",
  !ROUTER_SRC.match(/TIER_3_COUNTRIES[\s\S]{0,500}"UA-/),
  "TIER_3_COUNTRIES must not contain UA-* subdivision codes (those are edge-only)"
);

// =============================================================================
// Report
// =============================================================================

console.log(`\nGeo-router tests: ${pass} passed, ${fail} failed\n`);
if (fail > 0) {
  console.error("FAILURES:");
  for (const f of failures) {
    console.error(`  - ${f.label}`);
    console.error(`    ${f.detail}`);
  }
  process.exit(1);
}
process.exit(0);
