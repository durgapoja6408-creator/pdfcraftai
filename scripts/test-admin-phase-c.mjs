#!/usr/bin/env node
// Self-contained test harness for Task #21 — the Phase C admin surfaces
// for refunds, chargebacks, FX, and tax. Mirrors the plain-Node pattern
// used by every other test-*.mjs in this repo: assert() with a pass/fail
// counter, static file greps only (no live TS import, no DB, no spawned
// Next server), emits the canonical "N passed, M failed" summary line
// that run-all-tests.mjs parses.
//
// Why a third admin harness? admin-margin pins Task #22's write/read
// pair for the margin subsystem, admin-dashboard pins the 14-page
// Phase B cluster, and this suite pins the 4-page Phase C cluster.
// They pin different code — a Phase C regression shouldn't dark-hole
// the Phase B surface and vice versa, so they stay in separate suites
// at the cost of a small amount of duplicated "nodejs runtime" /
// "force-dynamic" plumbing assertions.
//
// What this covers:
//   SECTION A — query layer: lib/admin/queries.ts exports the four
//               functions (getRefundsSummary, getChargebacksSummary,
//               getFxSnapshot, getTaxSnapshot) with their return-type
//               interfaces and the RefundRow / ChargebackRow row
//               shapes. AdminQueryResult<T> wrapper discipline.
//   SECTION B — refund-rate formula: |Σ refund gross| / Σ captured
//               gross × 10000, with gross as the denominator (not
//               net). Floors at 0 when captured is 0. Uses the
//               refund reason filter + gte(createdAt, since) window.
//   SECTION C — MariaDB JSON path filter: chargebacks query uses
//               JSON_UNQUOTE(JSON_EXTRACT(raw_payload, '$.data.action'))
//               = 'chargeback' (not raw_payload->>'$.data.action' —
//               that syntax is MySQL 5.7+ shorthand that MariaDB
//               doesn't always grok). ingestionGap: true is pinned
//               as literal boolean.
//   SECTION D — MoR + forward invariants: tax treatment labels exist
//               for mor/forward, keptMicros derived as
//               collected - remittable (not hard-zero), rendering
//               an ErrorBanner when MoR's remittable is non-zero or
//               forward's remittable != collected.
//   SECTION E — per-page contracts: each of the four pages exists at
//               the right path, pins force-dynamic + nodejs, has a
//               default export, and does NOT duplicate requireAdmin().
//   SECTION F — page-to-query wiring: each page imports its expected
//               query helper from @/lib/admin/queries, consumes
//               clampDays from @/components/admin/ui, and uses
//               DayPicker with the right base href.
//   SECTION G — chargebacks page surfaces the Task #22 ingestion gap
//               banner with an honest description.
//   SECTION H — layout NAV wires all four new pages in the Money
//               section.
//   SECTION I — run-all-tests.mjs registers the suite right after
//               user-dashboard-v2 (keeping admin suites clustered).
//
// Run: `node scripts/test-admin-phase-c.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const QUERIES_PATH = resolve(ROOT, "lib", "admin", "queries.ts");
const LAYOUT_PATH = resolve(ROOT, "app", "admin", "layout.tsx");
const AGGREGATOR_PATH = resolve(ROOT, "scripts", "run-all-tests.mjs");

const PAGES = [
  {
    href: "/admin/refunds",
    path: resolve(ROOT, "app", "admin", "refunds", "page.tsx"),
    fn: "getRefundsSummary",
    label: "Refunds",
  },
  {
    href: "/admin/chargebacks",
    path: resolve(ROOT, "app", "admin", "chargebacks", "page.tsx"),
    fn: "getChargebacksSummary",
    label: "Chargebacks",
  },
  {
    href: "/admin/fx",
    path: resolve(ROOT, "app", "admin", "fx", "page.tsx"),
    fn: "getFxSnapshot",
    label: "FX",
  },
  {
    href: "/admin/tax",
    path: resolve(ROOT, "app", "admin", "tax", "page.tsx"),
    fn: "getTaxSnapshot",
    label: "Tax",
  },
];

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

// Fail-fast on missing files with clear errors.
const REQUIRED = [QUERIES_PATH, LAYOUT_PATH, AGGREGATOR_PATH, ...PAGES.map((p) => p.path)];
for (const p of REQUIRED) {
  if (!existsSync(p)) {
    console.error(`FATAL: required source file missing: ${p}`);
    process.exit(1);
  }
}

const QUERIES_SRC = readFileSync(QUERIES_PATH, "utf8");
const LAYOUT_SRC = readFileSync(LAYOUT_PATH, "utf8");
const AGG_SRC = readFileSync(AGGREGATOR_PATH, "utf8");
const PAGE_SRCS = new Map(PAGES.map((p) => [p.href, readFileSync(p.path, "utf8")]));

// =============================================================================
// SECTION A: query-layer exports
// =============================================================================

const EXPECTED_QUERIES = [
  "getRefundsSummary",
  "getChargebacksSummary",
  "getFxSnapshot",
  "getTaxSnapshot",
];

for (const fn of EXPECTED_QUERIES) {
  assert(
    `A1 queries.ts exports async function ${fn}`,
    new RegExp(`export\\s+async\\s+function\\s+${fn}\\s*\\(`).test(QUERIES_SRC),
    `Missing export async function ${fn} — pages can't be wired without it`
  );
}

const EXPECTED_TYPES = [
  // Refunds
  "RefundRow",
  "RefundsByProviderRow",
  "RefundsDailyRow",
  "RefundsSummary",
  // Chargebacks
  "ChargebackRow",
  "ChargebacksSummary",
  // FX
  "FxDailyRow",
  "FxByCurrencyRow",
  "FxSummary",
  // Tax
  "TaxByTreatmentRow",
  "TaxByCurrencyRow",
  "TaxDailyRow",
  "TaxSummary",
];

for (const t of EXPECTED_TYPES) {
  assert(
    `A2 queries.ts exports type ${t}`,
    new RegExp(`export\\s+type\\s+${t}\\b`).test(QUERIES_SRC),
    `Type ${t} must be exported so the page layer can annotate state`
  );
}

// AdminQueryResult wrapper discipline — every new function returns
// Promise<AdminQueryResult<...>>. No bare return types, no thrown
// errors bubbling out to the page.
for (const fn of EXPECTED_QUERIES) {
  assert(
    `A3 ${fn} returns Promise<AdminQueryResult<...>>`,
    new RegExp(
      `export\\s+async\\s+function\\s+${fn}\\s*\\([\\s\\S]{0,400}?\\)\\s*:\\s*Promise<AdminQueryResult<`
    ).test(QUERIES_SRC),
    `${fn} must return Promise<AdminQueryResult<T>> — pages read .data/.error and never await-throw`
  );
}

// =============================================================================
// SECTION B: refund-rate formula
// =============================================================================

assert(
  "B1 refund query filters on reason = 'refund'",
  /eq\(\s*schema\.creditLedger\.reason\s*,\s*"refund"\s*\)/.test(QUERIES_SRC),
  "Refund headline/daily/by-provider/recent slices must all gate on reason='refund'"
);

assert(
  "B1 refund denominator is captured gross (reason='purchase')",
  /eq\(\s*schema\.creditLedger\.reason\s*,\s*"purchase"\s*\)[\s\S]{0,400}isNotNull\(\s*schema\.creditLedger\.grossChargeMicros\s*\)/.test(
    QUERIES_SRC
  ),
  "Denominator for refund-rate must be captured purchase rows with grossChargeMicros populated"
);

assert(
  "B1 refund rate uses |refund gross| / captured gross × 10000 (basis points)",
  /refundRateBps\s*=\s*[\s\S]{0,200}Math\.abs\(\s*refundedGross\s*\)\s*\/\s*capturedGross\s*\)\s*\*\s*10_?000/.test(
    QUERIES_SRC
  ),
  "Rate formula must be |refund gross| / captured gross × 10000 — card-scheme dashboard parity"
);

assert(
  "B1 refund rate floors at 0 when capturedGross = 0 (no divide-by-zero)",
  /capturedGross\s*>\s*0[\s\S]{0,200}:\s*0/.test(QUERIES_SRC),
  "Must return 0 bps (not NaN/Infinity) when the window has no captured revenue"
);

assert(
  "B2 refund page StatCard labels include 'Refund rate' and 'Refund count'",
  /Refund rate/.test(PAGE_SRCS.get("/admin/refunds")) &&
    /Refund count/.test(PAGE_SRCS.get("/admin/refunds")),
  "Operator needs to see refund count + refund rate as headline metrics"
);

assert(
  "B2 refund page passes refundRateBps through bpsToPercent (no inline math)",
  /bpsToPercent\(\s*data\.refundRateBps/.test(PAGE_SRCS.get("/admin/refunds")),
  "Rate display must go through the shared bpsToPercent helper for consistent formatting"
);

// =============================================================================
// SECTION C: chargebacks — MariaDB JSON path filter + ingestion-gap flag
// =============================================================================

assert(
  "C1 chargebacks query uses JSON_UNQUOTE(JSON_EXTRACT(...)) not ->> shorthand",
  /JSON_UNQUOTE\(JSON_EXTRACT\([\s\S]{0,200}'\$\.data\.action'\)\)\s*=\s*'chargeback'/.test(
    QUERIES_SRC
  ),
  "MariaDB 10.2 doesn't always accept the ->> shorthand; use JSON_UNQUOTE(JSON_EXTRACT(...)) for portability"
);

assert(
  "C1 chargebacks query reads from webhook_events (raw_payload scan)",
  /from\(\s*schema\.webhookEvents\s*\)/.test(QUERIES_SRC),
  "Chargebacks are not yet in credit_ledger — must scan webhook_events raw payload"
);

assert(
  "C1 getChargebacksSummary returns ingestionGap: true as a literal",
  /ingestionGap:\s*true/.test(QUERIES_SRC),
  "Flag must be literal true until Task #22 closes the gap — the page renders a banner based on this"
);

// =============================================================================
// SECTION D: tax invariants — MoR (remittable=0) + forward (remittable=collected)
// =============================================================================

assert(
  "D1 tax query groups by COALESCE(tax_treatment, 'unknown')",
  /COALESCE\(\s*\$\{?\s*schema\.creditLedger\.taxTreatment\s*\}?\s*,\s*'unknown'\s*\)/.test(
    QUERIES_SRC
  ),
  "NULL treatment rows (legacy pre-Task #15) must surface as 'unknown' — not vanish"
);

assert(
  "D1 tax keptMicros derived as collected - remittable (not hard-zero)",
  /keptMicros:\s*c\s*-\s*rm/.test(QUERIES_SRC) ||
    /keptMicros:\s*collected\s*-\s*remittable/.test(QUERIES_SRC),
  "Kept column must be derived from collected - remittable so the invariants flow naturally: MoR keeps full collected, forward keeps 0"
);

assert(
  "D1 tax total kept computed as collected - remittable",
  /totalKeptMicros:\s*collected\s*-\s*remittable/.test(QUERIES_SRC),
  "Headline Kept stat must mirror the per-row derivation"
);

const TAX_PAGE_SRC = PAGE_SRCS.get("/admin/tax");

assert(
  "D2 tax page has labels for both 'mor' and 'forward' treatments",
  /mor:\s*"Merchant-of-Record"/.test(TAX_PAGE_SRC) &&
    /forward:\s*"Forward-to-authority"/.test(TAX_PAGE_SRC),
  "Operators read 'Merchant-of-Record' / 'Forward-to-authority', not raw 'mor'/'forward' codes"
);

assert(
  "D2 tax page renders MoR invariant violation banner",
  /MoR invariant violated/.test(TAX_PAGE_SRC),
  "If tax_treatment='mor' rows land with remittable != 0, the banner must fire so the bug is visible"
);

assert(
  "D2 tax page renders forward invariant violation banner",
  /Forward invariant violated/.test(TAX_PAGE_SRC),
  "If tax_treatment='forward' rows land with remittable != collected, the banner must fire"
);

assert(
  "D2 tax page computes morInvariantViolated from remittableMicros !== 0",
  /morRow[\s\S]{0,80}remittableMicros\s*!==\s*0/.test(TAX_PAGE_SRC),
  "Must detect the MoR invariant violation by checking remittable != 0 (not != collected)"
);

assert(
  "D2 tax page computes forwardInvariantViolated from remittable !== collected",
  /forwardRow[\s\S]{0,150}remittableMicros\s*!==\s*[\s\S]{0,40}collectedMicros/.test(
    TAX_PAGE_SRC
  ),
  "Forward violation check must compare remittable to collected (full pass-through)"
);

// =============================================================================
// SECTION E: per-page contracts
// =============================================================================

for (const page of PAGES) {
  const src = PAGE_SRCS.get(page.href);

  assert(
    `E1 ${page.href} pins force-dynamic`,
    /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(src),
    `Page ${page.href} must be force-dynamic (belt-and-braces alongside layout)`
  );

  assert(
    `E1 ${page.href} pins nodejs runtime`,
    /export\s+const\s+runtime\s*=\s*"nodejs"/.test(src),
    `Page ${page.href} must run on nodejs (mysql2 requirement)`
  );

  assert(
    `E1 ${page.href} has default export`,
    /export\s+default\s+(async\s+)?function/.test(src),
    `Page ${page.href} must export a default page function`
  );

  assert(
    `E1 ${page.href} does NOT duplicate requireAdmin() (layout owns the gate)`,
    !/requireAdmin\(\)/.test(src),
    `Page ${page.href} should not call requireAdmin() directly — that's the layout's job`
  );
}

// =============================================================================
// SECTION F: page-to-query wiring + shared UI imports
// =============================================================================

for (const page of PAGES) {
  const src = PAGE_SRCS.get(page.href);

  assert(
    `F1 ${page.href} imports ${page.fn} from @/lib/admin/queries`,
    new RegExp(
      `import\\s+\\{[^}]*\\b${page.fn}\\b[^}]*\\}\\s+from\\s+"@\\/lib\\/admin\\/queries"`
    ).test(src),
    `Page ${page.href} must import its aggregator ${page.fn}`
  );

  assert(
    `F1 ${page.href} calls ${page.fn}({ days }) and destructures { data, error }`,
    new RegExp(
      `const\\s*\\{\\s*data\\s*,\\s*error\\s*\\}\\s*=\\s*await\\s+${page.fn}\\s*\\(`
    ).test(src),
    `Page ${page.href} must destructure { data, error } from the AdminQueryResult wrapper`
  );

  assert(
    `F1 ${page.href} imports clampDays + DayPicker from @/components/admin/ui`,
    /import\s+\{[\s\S]{0,400}\bclampDays\b[\s\S]{0,400}\}\s+from\s+"@\/components\/admin\/ui"/.test(
      src
    ) && /\bDayPicker\b/.test(src),
    `Page ${page.href} must use the shared clampDays + DayPicker (no bespoke day-window logic)`
  );

  assert(
    `F1 ${page.href} wires DayPicker base to its own href`,
    new RegExp(`base="${page.href}"`).test(src),
    `DayPicker base must match the page href so day toggles preserve the route`
  );

  assert(
    `F1 ${page.href} clamps searchParams?.days via clampDays`,
    /const\s+days\s*=\s*clampDays\(\s*searchParams\?\.\s*days\s*\)/.test(src),
    `Page ${page.href} must clamp the untrusted ?days= param via the shared helper`
  );
}

// =============================================================================
// SECTION G: chargebacks page surfaces the ingestion-gap banner
// =============================================================================

const CHARGEBACKS_PAGE_SRC = PAGE_SRCS.get("/admin/chargebacks");

assert(
  "G1 chargebacks page renders ingestion-gap banner when data.ingestionGap is true",
  /data\.ingestionGap\s*\?/.test(CHARGEBACKS_PAGE_SRC),
  "Page must key the banner off data.ingestionGap (literal, from the query) — no hard-coded boolean"
);

assert(
  "G1 chargebacks banner mentions Task #22 as the resolution scope",
  /Task\s*#22/.test(CHARGEBACKS_PAGE_SRC),
  "Banner must cite Task #22 so an operator knows when the gap closes"
);

assert(
  "G1 chargebacks banner mentions the Paddle adapter action != 'refund' skip",
  /action\s*!=\s*"refund"/.test(CHARGEBACKS_PAGE_SRC) ||
    /skips adjustments with action != "refund"/.test(CHARGEBACKS_PAGE_SRC),
  "Banner must name the precise condition under which the adapter drops the event"
);

// =============================================================================
// SECTION H: layout NAV wires the four new pages into Money
// =============================================================================

for (const page of PAGES) {
  assert(
    `H1 layout NAV includes ${page.href}`,
    new RegExp(
      `\\{\\s*section:\\s*"Money",\\s*href:\\s*"${page.href.replace(
        /\//g,
        "\\/"
      )}",\\s*label:\\s*"[^"]+"\\s*\\}`
    ).test(LAYOUT_SRC),
    `NAV entry for ${page.href} missing or not in the Money section`
  );
}

// =============================================================================
// SECTION I: aggregator wiring
// =============================================================================

assert(
  "I1 aggregator registers admin-phase-c suite",
  /name:\s*"admin-phase-c"/.test(AGG_SRC) &&
    /file:\s*"test-admin-phase-c\.mjs"/.test(AGG_SRC),
  "Must register admin-phase-c in SUITES so `npm test` includes it"
);

assert(
  "I1 admin-phase-c suite follows the other admin suites",
  /"admin-dashboard"[\s\S]{0,8000}"admin-phase-c"/.test(AGG_SRC),
  "admin-phase-c should sit after admin-dashboard — keeps admin-* suites clustered"
);

// =============================================================================
// Report
// =============================================================================

const total = pass + fail;
console.log("");
console.log(`test-admin-phase-c.mjs — ${pass}/${total} assertions passed`);
// Canonical summary line — parsed by scripts/run-all-tests.mjs.
console.log(`Admin-phase-c tests: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("");
  console.error("FAILURES:");
  for (const f of failures) {
    console.error(`  ✗ ${f.label}`);
    console.error(`      ${f.detail}`);
  }
  process.exit(1);
}
process.exit(0);
