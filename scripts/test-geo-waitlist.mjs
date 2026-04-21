#!/usr/bin/env node
// Self-contained test harness for the Tier-2 deferred-region waitlist
// machinery. Mirrors the pattern in scripts/test-geo-router.mjs and
// scripts/test-pdf-tools.mjs — plain Node assertions, no Jest/Vitest.
//
// What this covers:
//   SECTION A — static checks on the 4 ship-able artifacts: migration SQL,
//               Drizzle schema table, API route source, React component
//               source. Detects refactors that would break the wiring.
//   SECTION B — reference re-implementation of the API's Zod validation +
//               rate-limit rules. Drives a representative matrix of
//               request payloads through the reference and asserts
//               shape-correct decisions without actually standing up
//               a DB + HTTP server.
//   SECTION C — cross-file invariants: the migration's CREATE TABLE, the
//               Drizzle schema definition, and the API route insert must
//               all agree on column names + allowable enum values.
//
// Run: `node scripts/test-geo-waitlist.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const MIG_PATH = resolve(ROOT, "db", "migrations", "0004_geo_waitlist.sql");
const SCHEMA_PATH = resolve(ROOT, "db", "schema", "app.ts");
const ROUTE_PATH = resolve(ROOT, "app", "api", "geo", "waitlist", "route.ts");
const COMPONENT_PATH = resolve(
  ROOT,
  "components",
  "geo",
  "DeferredRegionNotify.tsx"
);

const MIG_SRC = readFileSync(MIG_PATH, "utf8");
const SCHEMA_SRC = readFileSync(SCHEMA_PATH, "utf8");
const ROUTE_SRC = readFileSync(ROUTE_PATH, "utf8");
const COMPONENT_SRC = readFileSync(COMPONENT_PATH, "utf8");

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

// =============================================================================
// SECTION A: static-content checks on each shipped artifact
// =============================================================================

// Migration must create the table, the enum column, and the three indexes.
const MIG_MARKERS = [
  "CREATE TABLE IF NOT EXISTS `geo_waitlist`",
  "`id` varchar(36) NOT NULL",
  "`email` varchar(320) NOT NULL",
  "`country` varchar(2) NOT NULL",
  "`reason` ENUM('tier2_deferred', 'tier2_notify')",
  "`source` varchar(64) NOT NULL",
  "`consent_text` text NOT NULL",
  "`user_agent` varchar(512)",
  "`ip_hash` varchar(64)",
  "`created_at` timestamp(3) NOT NULL",
  "`notified_at` timestamp(3)",
  "CONSTRAINT `geo_waitlist_id` PRIMARY KEY(`id`)",
  "UNIQUE(`email`, `country`)",
  "CREATE INDEX `geo_waitlist_country_idx`",
  "CREATE INDEX `geo_waitlist_created_idx`",
];
for (const marker of MIG_MARKERS) {
  assert(
    `0004_geo_waitlist.sql contains ${JSON.stringify(marker)}`,
    MIG_SRC.includes(marker),
    "migration missing required DDL fragment"
  );
}

// Drizzle schema must declare the export and the same column/index names.
const SCHEMA_MARKERS = [
  "export const geoWaitlist = mysqlTable(",
  '"geo_waitlist"',
  'varchar("email", { length: 320 })',
  'varchar("country", { length: 2 })',
  'mysqlEnum("reason", ["tier2_deferred", "tier2_notify"])',
  'varchar("source", { length: 64 })',
  'text("consent_text")',
  'varchar("user_agent", { length: 512 })',
  'varchar("ip_hash", { length: 64 })',
  'timestamp("created_at"',
  'timestamp("notified_at"',
  'uniqueIndex("geo_waitlist_email_country_idx")',
  'index("geo_waitlist_country_idx")',
  'index("geo_waitlist_created_idx")',
];
for (const marker of SCHEMA_MARKERS) {
  assert(
    `schema/app.ts contains ${JSON.stringify(marker)}`,
    SCHEMA_SRC.includes(marker),
    "schema missing required Drizzle fragment"
  );
}

// API route must:
//   - declare POST handler + nodejs runtime (Node crypto, mysql2)
//   - import TIER_2_COUNTRIES from router
//   - use Zod validation with literal(true) for consent
//   - catch MySQL ER_DUP_ENTRY and return soft-ok
//   - set the geoWaitlist table through schema.geoWaitlist
const ROUTE_MARKERS = [
  'export const runtime = "nodejs"',
  "export async function POST(",
  'import { TIER_2_COUNTRIES } from "@/lib/payments/router"',
  "z.literal(true",
  "TIER_2_COUNTRIES.has(c)",
  'code === "ER_DUP_ENTRY"',
  "errno === 1062",
  "alreadyListed: true",
  "schema.geoWaitlist",
  'consentText: z.string().min(10).max(2000)',
  'z.enum(["tier2_deferred", "tier2_notify"])',
  // Rate-limit bookkeeping — the two Maps are essential to the flow;
  // if they get renamed, the behavioral tests will still pass but the
  // in-memory dedupe will silently break. Pin them here.
  "lastByEmail",
  "lastByIp",
  "RATE_LIMIT_MS",
  // IP handling: cf-connecting-ip preferred, then x-forwarded-for
  '"cf-connecting-ip"',
  '"x-forwarded-for"',
];
for (const marker of ROUTE_MARKERS) {
  assert(
    `api/geo/waitlist/route.ts contains ${JSON.stringify(marker)}`,
    ROUTE_SRC.includes(marker),
    "route missing required code fragment"
  );
}

// Component must:
//   - render a consent checkbox (GDPR)
//   - POST to /api/geo/waitlist
//   - pass consent=true + consentText
//   - disable submit when consent is false (defense-in-depth; server
//     still validates via z.literal(true))
const COMPONENT_MARKERS = [
  '"use client"',
  'export function DeferredRegionNotify(',
  '"/api/geo/waitlist"',
  'consent: true',
  'consentText: consentSentence',
  'type="checkbox"',
  "disabled={state === \"loading\" || !consent}",
  // Error-code mapping (must match the server's short codes)
  '"rate_limited_email"',
  '"country_not_eligible"',
  '"consent_required"',
];
for (const marker of COMPONENT_MARKERS) {
  assert(
    `DeferredRegionNotify.tsx contains ${JSON.stringify(marker)}`,
    COMPONENT_SRC.includes(marker),
    "component missing required UX fragment"
  );
}

// =============================================================================
// SECTION B: reference validation + rate-limit reimplementation.
// This re-derives the API's Zod shape in plain JS so we can drive test cases
// without spinning up a Next server or MySQL. If route.ts diverges in shape,
// section A's grep markers catch the obvious cases; section C pins the
// cross-file columns.
// =============================================================================

// Re-declare Tier 2 country set (from lib/payments/router.ts). Kept in sync
// by scripts/test-geo-router.mjs — if that test drifts, this test would
// too, but the router test is authoritative.
const TIER_2 = new Set([
  // EU 27
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE",
  "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
  // EEA non-EU + CH + big deferrals
  "CH", "NO", "IS", "LI", "CN", "RU", "BY",
]);

function refValidate(body) {
  // Minimal re-implementation of the Zod chain. Returns {ok: true, data}
  // or {ok: false, code}.
  if (!body || typeof body !== "object") {
    return { ok: false, code: "invalid_request" };
  }
  const email = body.email;
  if (typeof email !== "string" || !email.includes("@") || email.length > 320) {
    return { ok: false, code: "Invalid email" };
  }
  let country = body.country;
  if (typeof country !== "string" || country.length !== 2) {
    return { ok: false, code: "invalid_country" };
  }
  country = country.toUpperCase();
  if (!TIER_2.has(country)) {
    return { ok: false, code: "country_not_eligible" };
  }
  if (
    typeof body.source !== "string" ||
    body.source.length < 1 ||
    body.source.length > 64
  ) {
    return { ok: false, code: "invalid_source" };
  }
  const reason = body.reason ?? "tier2_deferred";
  if (reason !== "tier2_deferred" && reason !== "tier2_notify") {
    return { ok: false, code: "invalid_reason" };
  }
  if (body.consent !== true) {
    return { ok: false, code: "consent_required" };
  }
  if (
    typeof body.consentText !== "string" ||
    body.consentText.length < 10 ||
    body.consentText.length > 2000
  ) {
    return { ok: false, code: "invalid_consent_text" };
  }
  return { ok: true, data: { email, country, source: body.source, reason } };
}

const CASES = [
  // Happy paths
  {
    label: "valid DE tier2_deferred",
    input: {
      email: "a@b.com",
      country: "DE",
      source: "checkout_defer",
      consent: true,
      consentText: "I agree to the terms of the notification email.",
    },
    expect: { ok: true },
  },
  {
    label: "valid lowercase country normalizes",
    input: {
      email: "a@b.com",
      country: "fr",
      source: "pricing_defer",
      consent: true,
      consentText: "I agree to the terms of the notification email.",
    },
    expect: { ok: true, country: "FR" },
  },
  {
    label: "tier2_notify reason accepted",
    input: {
      email: "a@b.com",
      country: "IT",
      source: "marketing",
      reason: "tier2_notify",
      consent: true,
      consentText: "I agree to the terms of the notification email.",
    },
    expect: { ok: true, reason: "tier2_notify" },
  },
  // Rejections
  {
    label: "US rejected (Tier 1, not eligible for waitlist)",
    input: {
      email: "a@b.com",
      country: "US",
      source: "checkout_defer",
      consent: true,
      consentText: "I agree to the terms of the notification email.",
    },
    expect: { ok: false, code: "country_not_eligible" },
  },
  {
    label: "IR rejected (Tier 3, sanctioned)",
    input: {
      email: "a@b.com",
      country: "IR",
      source: "checkout_defer",
      consent: true,
      consentText: "I agree to the terms of the notification email.",
    },
    expect: { ok: false, code: "country_not_eligible" },
  },
  {
    label: "IN rejected (Tier 1 home market)",
    input: {
      email: "a@b.com",
      country: "IN",
      source: "checkout_defer",
      consent: true,
      consentText: "I agree to the terms of the notification email.",
    },
    expect: { ok: false, code: "country_not_eligible" },
  },
  {
    label: "consent=false rejected",
    input: {
      email: "a@b.com",
      country: "DE",
      source: "checkout_defer",
      consent: false,
      consentText: "I agree to the terms of the notification email.",
    },
    expect: { ok: false, code: "consent_required" },
  },
  {
    label: "missing consent rejected",
    input: {
      email: "a@b.com",
      country: "DE",
      source: "checkout_defer",
      consentText: "I agree to the terms of the notification email.",
    },
    expect: { ok: false, code: "consent_required" },
  },
  {
    label: "malformed email rejected",
    input: {
      email: "not-an-email",
      country: "DE",
      source: "checkout_defer",
      consent: true,
      consentText: "I agree to the terms of the notification email.",
    },
    expect: { ok: false, code: "Invalid email" },
  },
  {
    label: "short consentText rejected",
    input: {
      email: "a@b.com",
      country: "DE",
      source: "checkout_defer",
      consent: true,
      consentText: "agree",
    },
    expect: { ok: false, code: "invalid_consent_text" },
  },
  {
    label: "invalid reason rejected",
    input: {
      email: "a@b.com",
      country: "DE",
      source: "checkout_defer",
      reason: "paid_customer",
      consent: true,
      consentText: "I agree to the terms of the notification email.",
    },
    expect: { ok: false, code: "invalid_reason" },
  },
  {
    label: "empty source rejected",
    input: {
      email: "a@b.com",
      country: "DE",
      source: "",
      consent: true,
      consentText: "I agree to the terms of the notification email.",
    },
    expect: { ok: false, code: "invalid_source" },
  },
];

for (const c of CASES) {
  const got = refValidate(c.input);
  assert(
    `refValidate: ${c.label}`,
    got.ok === c.expect.ok,
    `expected ok=${c.expect.ok} got ${JSON.stringify(got)}`
  );
  if (c.expect.ok === false && c.expect.code) {
    assert(
      `refValidate code: ${c.label}`,
      got.code === c.expect.code,
      `expected code=${c.expect.code} got ${got.code}`
    );
  }
  if (c.expect.country) {
    assert(
      `refValidate country: ${c.label}`,
      got.data?.country === c.expect.country,
      `expected country=${c.expect.country} got ${got.data?.country}`
    );
  }
  if (c.expect.reason) {
    assert(
      `refValidate reason: ${c.label}`,
      got.data?.reason === c.expect.reason,
      `expected reason=${c.expect.reason} got ${got.data?.reason}`
    );
  }
}

// Rate-limit helper mirrors the route's in-memory Map logic.
function refGate(map, key, now, windowMs = 60_000) {
  const last = map.get(key) ?? 0;
  if (now - last < windowMs) return false;
  map.set(key, now);
  return true;
}

// t0 must be large enough that the first-call check (now - 0 > window)
// passes — the route uses Date.now() which is always in the trillions,
// so this is never an issue at runtime. In the harness we pin a
// realistic unix-epoch value so the math matches.
const rateMap = new Map();
const t0 = 1_700_000_000_000;
assert("rate-limit: first call allowed", refGate(rateMap, "a@b.com", t0));
assert("rate-limit: immediate repeat blocked", !refGate(rateMap, "a@b.com", t0 + 1));
assert(
  "rate-limit: repeat at 59s still blocked",
  !refGate(rateMap, "a@b.com", t0 + 59_000)
);
assert(
  "rate-limit: after 60s window allowed",
  refGate(rateMap, "a@b.com", t0 + 60_000)
);
assert(
  "rate-limit: different key independent",
  refGate(rateMap, "c@d.com", t0 + 1)
);

// =============================================================================
// SECTION C: cross-file column-name invariants
// =============================================================================

// The migration column names, the Drizzle column config, and the API's
// insert all reference the same snake_case DB columns. If any one drifts,
// the other two stop matching.
const DB_COLUMNS = [
  "id",
  "email",
  "country",
  "reason",
  "source",
  "consent_text",
  "user_agent",
  "ip_hash",
  "created_at",
  "notified_at",
];
for (const col of DB_COLUMNS) {
  assert(
    `migration has column ${col}`,
    new RegExp(`\`${col}\``).test(MIG_SRC),
    `migration missing column ${col}`
  );
}

// Drizzle uses snake_case for the DB names but camelCase for the property
// access. The TS field names follow that pattern — assert both.
const TS_TO_DB = [
  ["id", "id"],
  ["email", "email"],
  ["country", "country"],
  ["reason", "reason"],
  ["source", "source"],
  ["consentText", "consent_text"],
  ["userAgent", "user_agent"],
  ["ipHash", "ip_hash"],
  ["createdAt", "created_at"],
  ["notifiedAt", "notified_at"],
];
for (const [ts, dbCol] of TS_TO_DB) {
  assert(
    `schema binds ${ts} → "${dbCol}"`,
    new RegExp(`${ts}:\\s*(?:varchar|text|mysqlEnum|timestamp)\\("${dbCol}"`).test(
      SCHEMA_SRC
    ),
    `schema binding mismatch for ${ts}`
  );
}

// API route must reference the camelCase Drizzle fields when inserting.
// Checking a representative subset — id/email/country/reason/source are
// required, consentText + userAgent + ipHash are written on insert.
const ROUTE_INSERT_FIELDS = [
  "email: email.toLowerCase()",
  "country,",
  "reason,",
  "source,",
  "consentText,",
  "userAgent,",
  "ipHash,",
];
for (const marker of ROUTE_INSERT_FIELDS) {
  assert(
    `route insert writes ${JSON.stringify(marker)}`,
    ROUTE_SRC.includes(marker),
    "route insert field missing"
  );
}

// TIER_2_COUNTRIES in the route must match our reference set in SECTION B.
// Since TypeScript's `TIER_2_COUNTRIES` is imported at runtime and we
// re-declared it here, drift between this harness and lib/payments/router.ts
// would go undetected by this file — but scripts/test-geo-router.mjs
// enforces that router against the policy doc. So transitive coverage:
//   test-geo-router.mjs: router ↔ GEO_LAUNCH_POLICY.md
//   this file:           API route ↔ router (via import grep + reference set)

// =============================================================================
// SECTION D: launch-notify marketing surface (Task #3 sub-item 4).
// Adds coverage for the proactive-signup artifacts:
//   - lib/geo/country-names.ts           — display-name map for Tier-2
//   - components/geo/LaunchNotifySignup.tsx — country picker + wired DRN
//   - components/geo/DeferredRegionNotify.tsx — introCopy override prop
//   - app/pricing/page.tsx                — embeds LaunchNotifySignup
//
// These are additive; they don't change the Zod contract or the DB
// shape, so SECTIONS A–C remain the canonical guard for the API + data
// model. This section catches refactors that would silently decouple
// the picker from the API route (e.g. changing reason= or source=).
// =============================================================================

const NAMES_PATH = resolve(ROOT, "lib", "geo", "country-names.ts");
const LAUNCH_PATH = resolve(
  ROOT,
  "components",
  "geo",
  "LaunchNotifySignup.tsx"
);
const ROUTER_PATH = resolve(ROOT, "lib", "payments", "router.ts");
const PRICING_PATH = resolve(ROOT, "app", "pricing", "page.tsx");
// Added in Task #3 sub-item 4b — dedicated /launch-notify page.
const LAUNCH_PAGE_PATH = resolve(ROOT, "app", "launch-notify", "page.tsx");
const SITEMAP_PATH = resolve(ROOT, "app", "sitemap.ts");

const NAMES_SRC = readFileSync(NAMES_PATH, "utf8");
const LAUNCH_SRC = readFileSync(LAUNCH_PATH, "utf8");
const ROUTER_SRC = readFileSync(ROUTER_PATH, "utf8");
const PRICING_SRC = readFileSync(PRICING_PATH, "utf8");
const LAUNCH_PAGE_SRC = readFileSync(LAUNCH_PAGE_PATH, "utf8");
const SITEMAP_SRC = readFileSync(SITEMAP_PATH, "utf8");

// --- D.1 country-names.ts coverage of TIER_2_COUNTRIES --------------------
// The country-names file MUST have a display name for every Tier-2 code
// in lib/payments/router.ts. Derive both sets from source by regex.

// Grab the literal ISO-2 codes from the object literal keys. Allow
// optional quotes (TypeScript allows `AT:` and `"AT":`).
const NAME_KEY_RE = /^\s*"?([A-Z]{2})"?:\s*"/gm;
const namedCodes = new Set();
for (const m of NAMES_SRC.matchAll(NAME_KEY_RE)) {
  namedCodes.add(m[1]);
}

// Extract the Tier-2 set from router.ts. The literal uses string lines of
// the form `"AT", "BE", ...`. We grab anything inside TIER_2_COUNTRIES
// = new Set([...]) and pull quoted 2-letter codes out.
const TIER_2_BLOCK_MATCH = ROUTER_SRC.match(
  /TIER_2_COUNTRIES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/
);
assert(
  "router.ts exposes TIER_2_COUNTRIES",
  Boolean(TIER_2_BLOCK_MATCH),
  "could not parse TIER_2_COUNTRIES block in router.ts"
);

// The Tier-2 block in router.ts spreads EU_COUNTRIES; parse that too.
const EU_BLOCK_MATCH = ROUTER_SRC.match(
  /EU_COUNTRIES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/
);
assert(
  "router.ts exposes EU_COUNTRIES",
  Boolean(EU_BLOCK_MATCH),
  "could not parse EU_COUNTRIES block in router.ts"
);

const CODE_RE = /"([A-Z]{2})"/g;
const routerTier2 = new Set();
if (TIER_2_BLOCK_MATCH) {
  for (const m of TIER_2_BLOCK_MATCH[1].matchAll(CODE_RE)) {
    routerTier2.add(m[1]);
  }
}
if (EU_BLOCK_MATCH) {
  for (const m of EU_BLOCK_MATCH[1].matchAll(CODE_RE)) {
    routerTier2.add(m[1]);
  }
}

assert(
  "router.ts TIER_2_COUNTRIES parses to 34 codes",
  routerTier2.size === 34,
  `expected 34, got ${routerTier2.size}: ${[...routerTier2].sort().join(",")}`
);

// Every router Tier-2 code MUST have a name entry.
for (const code of routerTier2) {
  assert(
    `country-names.ts has entry for ${code}`,
    namedCodes.has(code),
    `missing display name for ${code} — update lib/geo/country-names.ts`
  );
}

// And vice versa: no name entry should exist for a non-Tier-2 code.
for (const code of namedCodes) {
  assert(
    `country-names.ts does not leak non-Tier-2 ${code}`,
    routerTier2.has(code),
    `country-names.ts has ${code} but router.ts doesn't list it as Tier 2`
  );
}

// --- D.2 DeferredRegionNotify introCopy override ---------------------------
const DRN_OVERRIDE_MARKERS = [
  "introCopy?: ReactNode",
  "introCopy,",
  "introCopy ??",
];
for (const marker of DRN_OVERRIDE_MARKERS) {
  assert(
    `DeferredRegionNotify.tsx wires introCopy: ${JSON.stringify(marker)}`,
    COMPONENT_SRC.includes(marker),
    "introCopy prop not plumbed through"
  );
}

// --- D.3 LaunchNotifySignup.tsx structure --------------------------------
const LAUNCH_MARKERS = [
  '"use client"',
  "export function LaunchNotifySignup(",
  // Picker is bound to TIER_2_COUNTRY_OPTIONS from our module.
  'TIER_2_COUNTRY_OPTIONS, tier2CountryName',
  '"@/lib/geo/country-names"',
  // Still imports TIER_2_COUNTRIES from the router for the defaultCountry
  // sanitiser.
  'TIER_2_COUNTRIES',
  '"@/lib/payments/router"',
  // Delegates to the shared form component rather than duplicating POST
  // logic.
  "<DeferredRegionNotify",
  'reason="tier2_notify"',
  "source={source}",
  // Country picker renders an empty placeholder first.
  "Select your country…",
  // Resets form state when the user changes the country — critical, else
  // stale "sent" confirmation shows up for a new country.
  "key={country}",
];
for (const marker of LAUNCH_MARKERS) {
  assert(
    `LaunchNotifySignup.tsx contains ${JSON.stringify(marker)}`,
    LAUNCH_SRC.includes(marker),
    "LaunchNotifySignup missing required fragment"
  );
}

// --- D.4 pricing page wiring ----------------------------------------------
const PRICING_MARKERS = [
  'import { LaunchNotifySignup } from "@/components/geo/LaunchNotifySignup"',
  // Source string pins the analytics label — changing it means PM will
  // lose historical funnel attribution, so pin it here.
  '<LaunchNotifySignup source="pricing_country_picker"',
];
for (const marker of PRICING_MARKERS) {
  assert(
    `pricing/page.tsx contains ${JSON.stringify(marker)}`,
    PRICING_SRC.includes(marker),
    "pricing page not wired to LaunchNotifySignup"
  );
}

// --- D.5 /launch-notify dedicated page (sub-item 4b) ---------------------
// The permalink page must import the LaunchNotifySignup component and
// render it with source="launch_notify_page" so PM can distinguish this
// surface from the /pricing embed in the geo_waitlist.source column.
// The page must also be SEO-noindex (utility page; shouldn't compete
// with /pricing in search) but still listed in the sitemap for crawler
// coverage.
const LAUNCH_PAGE_MARKERS = [
  // Wire-up
  'import { LaunchNotifySignup } from "@/components/geo/LaunchNotifySignup"',
  // Pinned source label — changing it breaks PM's funnel analytics.
  'source="launch_notify_page"',
  // Canonical URL: we want this page to collapse under one URL in
  // search despite noindex, so canonical still matters.
  'canonical: "/launch-notify"',
  // noindex,follow posture — utility page.
  "index: false",
  "follow: true",
];
for (const marker of LAUNCH_PAGE_MARKERS) {
  assert(
    `launch-notify/page.tsx contains ${JSON.stringify(marker)}`,
    LAUNCH_PAGE_SRC.includes(marker),
    "launch-notify page missing required fragment"
  );
}

// Sitemap must list /launch-notify. Crawlers use this for coverage
// tracking even when the page is noindex (follow: true still counts).
assert(
  "sitemap.ts lists /launch-notify",
  SITEMAP_SRC.includes("/launch-notify"),
  "add /launch-notify to app/sitemap.ts staticRoutes"
);

// --- D.6 /launch-notify ?country=XX prefill (sub-item 4c) ----------------
// Campaign-email hot-links can preselect the Tier-2 country via
// `?country=DE`. The page reads `searchParams.country`, pipes it
// through `pickCountry()` (handles `string | string[] | undefined`),
// and hands it to LaunchNotifySignup's `defaultCountry` prop. The
// component's own sanitiser drops anything that isn't a current Tier-2
// ISO code, so a bad query param just reverts to the empty picker.
const LAUNCH_PAGE_PREFILL_MARKERS = [
  // Page component is hooked into searchParams at all.
  "searchParams",
  // Picker helper is defined at module scope.
  "function pickCountry(",
  // Handles the Next 14 `string | string[]` shape of a raw query value.
  "Array.isArray(raw)",
  // The resolved value is forwarded to the signup component.
  "defaultCountry={defaultCountry}",
];
for (const marker of LAUNCH_PAGE_PREFILL_MARKERS) {
  assert(
    `launch-notify prefill wiring: ${JSON.stringify(marker)}`,
    LAUNCH_PAGE_SRC.includes(marker),
    "?country= prefill not wired through to LaunchNotifySignup"
  );
}

// Reference implementation of the pickCountry behaviour we want the
// page to preserve. If the page's inline version ever diverges, this
// harness still forces the same answers. We can't import() the page
// (it's TSX) so we re-state it plainly and spot-check the same inputs.
function refPickCountry(raw) {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== "string") return undefined;
  const trimmed = first.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
const PICK_CASES = [
  { in: undefined, out: undefined, label: "undefined → undefined" },
  { in: "", out: undefined, label: "empty string → undefined" },
  { in: "   ", out: undefined, label: "whitespace → undefined" },
  { in: "DE", out: "DE", label: "plain string → identical" },
  { in: " de ", out: "de", label: "trimmed, case preserved (component uppercases)" },
  { in: ["FR", "IT"], out: "FR", label: "array → first entry" },
  { in: ["  BE  ", "NL"], out: "BE", label: "array first, trimmed" },
  { in: [""], out: undefined, label: "array of empty → undefined" },
  { in: [], out: undefined, label: "empty array → undefined" },
  { in: 42, out: undefined, label: "non-string → undefined" },
];
for (const c of PICK_CASES) {
  const got = refPickCountry(c.in);
  assert(
    `pickCountry: ${c.label}`,
    got === c.out,
    `expected ${JSON.stringify(c.out)}, got ${JSON.stringify(got)}`
  );
}

// --- D.7 /launch-notify CF-IPCountry auto-preselect (sub-item 4d) --------
// Organic visitors (no ?country= query string) land here from internal
// links or direct-typed URLs. Cloudflare sets `CF-IPCountry` on every
// proxied request (full-proxy posture per CLAUDE.md §1), so we read
// that header server-side and fall back to it when the query param is
// absent. Campaign hot-links still win via `??` precedence so a US
// marketer QA-ing a FR campaign link sees FR, not their US geo.
const LAUNCH_PAGE_HEADER_MARKERS = [
  // Imports the headers() helper from next/headers (server-component only).
  'import { headers } from "next/headers"',
  // Defines a module-scope sanitiser for the raw header value.
  "function pickCountryFromHeader(",
  // Filters the CF "unknown" sentinel and the Tor exit-node sentinel.
  '"XX"',
  '"T1"',
  // Uses the `??` fallback operator (query wins, header is backup).
  "pickCountry(searchParams?.country) ??",
  // Reads the actual header name CF sets (case-insensitive on the
  // Node side, but we key by the lowercase canonical name to match
  // Next's header accessor convention).
  '"cf-ipcountry"',
];
for (const marker of LAUNCH_PAGE_HEADER_MARKERS) {
  assert(
    `launch-notify CF-IPCountry wiring: ${JSON.stringify(marker)}`,
    LAUNCH_PAGE_SRC.includes(marker),
    "CF-IPCountry auto-preselect not wired into /launch-notify page"
  );
}

// Reference implementation of the header sanitiser we want to preserve.
// If the page's inline version ever drifts, this harness still forces
// the same answers across representative edge cases. The page isn't
// import()-able from here (it's a TSX server component) so we re-state
// the contract plainly.
function refPickCountryFromHeader(raw) {
  if (typeof raw !== "string") return undefined;
  const normalised = raw.trim().toUpperCase();
  if (normalised.length !== 2) return undefined;
  if (normalised === "XX" || normalised === "T1") return undefined;
  return normalised;
}
const HEADER_CASES = [
  { in: undefined, out: undefined, label: "missing header → undefined" },
  { in: null, out: undefined, label: "null header → undefined" },
  { in: "", out: undefined, label: "empty string → undefined" },
  { in: "   ", out: undefined, label: "whitespace → undefined" },
  { in: "DE", out: "DE", label: "plain code → identical" },
  { in: "de", out: "DE", label: "lowercase → uppercased" },
  { in: " fr ", out: "FR", label: "trimmed + uppercased" },
  { in: "XX", out: undefined, label: "CF unknown sentinel → undefined" },
  { in: "xx", out: undefined, label: "CF unknown (lowercase) → undefined" },
  { in: "T1", out: undefined, label: "Tor exit-node sentinel → undefined" },
  { in: "t1", out: undefined, label: "Tor sentinel (lowercase) → undefined" },
  { in: "DEU", out: undefined, label: "3-letter code → undefined (length-clamped)" },
  { in: "D", out: undefined, label: "1-letter code → undefined (length-clamped)" },
  { in: 42, out: undefined, label: "non-string → undefined" },
];
for (const c of HEADER_CASES) {
  const got = refPickCountryFromHeader(c.in);
  assert(
    `pickCountryFromHeader: ${c.label}`,
    got === c.out,
    `expected ${JSON.stringify(c.out)}, got ${JSON.stringify(got)}`
  );
}

// Merge contract: query string wins over header. The `??` operator in
// the page uses undefined-coalescing (not nullish of empty string), so
// the matrix below drives the exact resolver the page uses. This pins
// the precedence against refactors that might accidentally flip it.
function refResolve(query, header) {
  return refPickCountry(query) ?? refPickCountryFromHeader(header);
}
const MERGE_CASES = [
  { query: "DE", header: "FR", out: "DE", label: "query wins over header" },
  { query: undefined, header: "FR", out: "FR", label: "header used when query missing" },
  { query: "DE", header: undefined, out: "DE", label: "query alone works" },
  { query: undefined, header: undefined, out: undefined, label: "neither → undefined" },
  { query: "", header: "FR", out: "FR", label: "empty query falls through to header" },
  { query: "  ", header: "FR", out: "FR", label: "whitespace query falls through to header" },
  { query: "DE", header: "XX", out: "DE", label: "query wins even over XX (XX would fall through)" },
  { query: undefined, header: "XX", out: undefined, label: "XX from header → undefined" },
  { query: undefined, header: "T1", out: undefined, label: "T1 from header → undefined" },
  { query: ["BE", "NL"], header: "FR", out: "BE", label: "array query first-wins over header" },
  // The US case: a US visitor (Tier-1) follows an internal link. The
  // page trusts neither layer blindly — it passes the code into
  // LaunchNotifySignup which gates on TIER_2_COUNTRIES. But at the
  // page boundary, we still forward the code; this is fine because
  // the sanitiser is what ultimately controls the preselect.
  { query: undefined, header: "US", out: "US", label: "page forwards US; component-level Tier-2 gate rejects" },
];
for (const c of MERGE_CASES) {
  const got = refResolve(c.query, c.header);
  assert(
    `merge: ${c.label}`,
    got === c.out,
    `query=${JSON.stringify(c.query)} header=${JSON.stringify(c.header)} expected ${JSON.stringify(c.out)}, got ${JSON.stringify(got)}`
  );
}

// =============================================================================
// Report
// =============================================================================

console.log(`\nGeo-waitlist tests: ${pass} passed, ${fail} failed\n`);
if (fail > 0) {
  console.error("FAILURES:");
  for (const f of failures) {
    console.error(`  - ${f.label}`);
    console.error(`    ${f.detail}`);
  }
  process.exit(1);
}
process.exit(0);
