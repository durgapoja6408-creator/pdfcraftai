#!/usr/bin/env node
// Self-contained test harness for Task #25 / Phase D — the admin surfaces
// for plans / promos / compliance / fraud / rate-limits. Mirrors the
// plain-Node pattern used by every other test-*.mjs in this repo:
// assert() with a pass/fail counter, static file greps + one dynamic
// import of the pure constants module, emits the canonical "N passed,
// M failed" summary line that run-all-tests.mjs parses.
//
// Why a fifth admin harness?
//   - admin-margin pins the write/read pair for the margin subsystem.
//   - admin-dashboard pins the 14-page Phase B cluster.
//   - admin-phase-c pins the 4-page Phase C cluster (refunds/chargebacks/fx/tax).
//   - This suite pins the 5-page Phase D cluster (plans/promos/compliance/
//     fraud/rate-limits).
// They pin different code — a Phase D regression shouldn't dark-hole the
// Phase B/C surfaces and vice versa, so they stay in separate suites at
// the cost of a small amount of duplicated plumbing assertions.
//
// What this covers:
//   SECTION A — lib/admin/phase-d-queries.ts module surface: typed
//               envelopes (PhaseDQueryResult<T>, FraudSignalsRow/Snapshot,
//               RateLimitOverrideRow/Snapshot, SubprocessorRow), the two
//               exported async functions (getFraudSignals,
//               getRateLimitOverrides), and the three static-constant
//               exports (SUBPROCESSORS, DPDP_COVERAGE, GDPR_COVERAGE)
//               plus the DEFAULT_DAILY_COST_CAP_MICROS re-export.
//   SECTION B — getFraudSignals query shape: joins webhookEvents →
//               payments (paymentId FK), JSON_UNQUOTE(JSON_EXTRACT(
//               rawPayload, '$.data.action')) filter covers the full
//               dispute lifecycle (chargeback / chargeback_warning /
//               chargeback_reverse / dispute / dispute_opened), unions
//               with user_rate_limits where cap=0, dedups on userId,
//               enriches with email via IN(...), sorts disputeCount desc
//               then isHardBlocked asc, clamps days to [1, 365] and
//               limit to [1, 500].
//   SECTION C — getRateLimitOverrides query shape: reads user_rate_limits
//               ordered by updatedAt desc, enriches with email, resolves
//               globalDefaultMicros via resolveDailyCapMicros(null), and
//               classifies globalDefaultSource as "env" vs "compiled-in"
//               based on USER_DAILY_COST_MICROS_CAP env parse.
//   SECTION D — static constants content: SUBPROCESSORS covers the 7
//               known providers (Razorpay / GA4 / Clarity /
//               Cloudflare / Hostinger / Google OAuth), DPDP_COVERAGE
//               covers all 8 DPDP sections wired into Task #24 (s. 6(3)
//               / 8(10) / 9 / 11 / 12 / 13 / 14 / 16), GDPR_COVERAGE
//               covers the 6 GDPR/ePrivacy/EDPB/ICO references.
//   SECTION E — per-page contracts: each of the five pages exists at
//               the right path, pins force-dynamic + nodejs + has a
//               default export, and does NOT duplicate requireAdmin()
//               (the layout gates).
//   SECTION F — page-to-query / page-to-module wiring: plans imports
//               CREDIT_PACKS + AI_OPERATION_COSTS + USD_TO_INR_RATE +
//               packAmountMinor from @/lib/pricing; compliance imports
//               LEGAL_DOCS from @/lib/legal-docs + SUBPROCESSORS +
//               DPDP_COVERAGE + GDPR_COVERAGE from @/lib/admin/phase-d-
//               queries; fraud imports getFraudSignals + DayPicker +
//               clampDays; rate-limits imports getRateLimitOverrides +
//               DEFAULT_DAILY_COST_CAP_MICROS; promos is placeholder
//               (references Task #27 explicitly).
//   SECTION G — layout NAV wires the five new entries: Pricing section
//               with plans + promos, Ops section gains fraud +
//               rate-limits, Platform section gains compliance.
//   SECTION H — run-all-tests.mjs registers the suite right after
//               admin-phase-c (keeping admin suites clustered).
//
// Run: `node scripts/test-admin-phase-d.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PHASE_D_QUERIES_PATH = resolve(
  ROOT,
  "lib",
  "admin",
  "phase-d-queries.ts"
);
const PRICING_PATH = resolve(ROOT, "lib", "pricing.ts");
const RATE_LIMIT_PATH = resolve(ROOT, "lib", "ai", "rate-limit.ts");
const LAYOUT_PATH = resolve(ROOT, "app", "admin", "layout.tsx");
const AGGREGATOR_PATH = resolve(ROOT, "scripts", "run-all-tests.mjs");

const PAGES = [
  {
    name: "plans",
    href: "/admin/plans",
    path: resolve(ROOT, "app", "admin", "plans", "page.tsx"),
  },
  {
    name: "promos",
    href: "/admin/promos",
    path: resolve(ROOT, "app", "admin", "promos", "page.tsx"),
  },
  {
    name: "compliance",
    href: "/admin/compliance",
    path: resolve(ROOT, "app", "admin", "compliance", "page.tsx"),
  },
  {
    name: "fraud",
    href: "/admin/fraud",
    path: resolve(ROOT, "app", "admin", "fraud", "page.tsx"),
  },
  {
    name: "rate-limits",
    href: "/admin/rate-limits",
    path: resolve(ROOT, "app", "admin", "rate-limits", "page.tsx"),
  },
];

/* ------------------------------------------------------------------ */
/* Harness plumbing                                                    */
/* ------------------------------------------------------------------ */

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.log(`  FAIL: ${msg}`);
  }
}

function read(p) {
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

/* ------------------------------------------------------------------ */
/* SECTION A — lib/admin/phase-d-queries.ts module surface             */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION A] lib/admin/phase-d-queries.ts module surface");

const qSrc = read(PHASE_D_QUERIES_PATH);
assert(qSrc.length > 0, "lib/admin/phase-d-queries.ts exists");

// Server-only guardrail — no client bundle should ever pick this up.
assert(
  /import\s+"server-only"/.test(qSrc),
  'phase-d-queries imports "server-only"'
);

// Envelope matches queries.ts:AdminQueryResult — keeps the ErrorBanner
// consumer uniform across Phase B/C/D pages.
assert(
  /export\s+type\s+PhaseDQueryResult<T>\s*=\s*\|\s*\{\s*ok:\s*true;\s*data:\s*T\s*\}\s*\|\s*\{\s*ok:\s*false;\s*error:\s*string\s*\}/.test(
    qSrc
  ),
  "PhaseDQueryResult<T> is the discriminated union with ok: true/false"
);

// Fraud types.
assert(
  /export\s+type\s+FraudSignalsRow\s*=\s*\{[\s\S]*?userId:\s*string[\s\S]*?email:\s*string\s*\|\s*null[\s\S]*?disputeCount:\s*number[\s\S]*?mostRecentDisputeAt:\s*Date\s*\|\s*null[\s\S]*?isHardBlocked:\s*boolean[\s\S]*?capMicros:\s*number\s*\|\s*null[\s\S]*?notes:\s*string\s*\|\s*null[\s\S]*?\}/.test(
    qSrc
  ),
  "FraudSignalsRow type has expected fields"
);
assert(
  /export\s+type\s+FraudSignalsSnapshot\s*=\s*\{[\s\S]*?windowDays:\s*number[\s\S]*?totalDisputeEvents:\s*number[\s\S]*?totalHardBlocks:\s*number[\s\S]*?rows:\s*FraudSignalsRow\[\]/.test(
    qSrc
  ),
  "FraudSignalsSnapshot type has windowDays + totals + rows"
);

// Rate-limit types.
assert(
  /export\s+type\s+RateLimitOverrideRow\s*=\s*\{[\s\S]*?userId:\s*string[\s\S]*?email:\s*string\s*\|\s*null[\s\S]*?capMicros:\s*number[\s\S]*?notes:\s*string\s*\|\s*null[\s\S]*?createdAt:\s*Date[\s\S]*?updatedAt:\s*Date/.test(
    qSrc
  ),
  "RateLimitOverrideRow type has expected fields"
);
assert(
  /export\s+type\s+RateLimitsSnapshot\s*=\s*\{[\s\S]*?globalDefaultMicros:\s*number[\s\S]*?globalDefaultSource:\s*"env"\s*\|\s*"compiled-in"[\s\S]*?overrideCount:\s*number[\s\S]*?rows:\s*RateLimitOverrideRow\[\]/.test(
    qSrc
  ),
  "RateLimitsSnapshot type has globalDefaultMicros + source union + overrideCount + rows"
);

// Subprocessor type.
assert(
  /export\s+type\s+SubprocessorRow\s*=\s*\{[\s\S]*?name:\s*string[\s\S]*?purpose:\s*string[\s\S]*?category:\s*"payments"\s*\|\s*"analytics"\s*\|\s*"hosting"\s*\|\s*"auth"\s*\|\s*"cdn"[\s\S]*?dataRegion:\s*string[\s\S]*?transferMechanism:\s*string/.test(
    qSrc
  ),
  "SubprocessorRow type has the 5-value category union"
);

// Exported async query functions. Signatures may span multiple lines,
// so use [\s\S] (the JS equivalent of DOTALL) rather than \s — some
// whitespace chunks include newlines between the { and the fields.
assert(
  /export\s+async\s+function\s+getFraudSignals\s*\(\s*opts\s*:\s*\{[\s\S]*?days\s*:\s*number[\s\S]*?limit\?\s*:\s*number[\s\S]*?\}\s*\)\s*:\s*Promise\s*<\s*PhaseDQueryResult\s*<\s*FraudSignalsSnapshot\s*>\s*>/.test(
    qSrc
  ),
  "getFraudSignals is exported with the expected signature"
);
assert(
  /export\s+async\s+function\s+getRateLimitOverrides\s*\(\s*opts\s*:\s*\{[\s\S]*?limit\?\s*:\s*number[\s\S]*?\}\s*\)\s*:\s*Promise\s*<\s*PhaseDQueryResult\s*<\s*RateLimitsSnapshot\s*>\s*>/.test(
    qSrc
  ),
  "getRateLimitOverrides is exported with the expected signature"
);

// Static constant exports.
assert(
  /export\s+const\s+SUBPROCESSORS\s*:\s*readonly\s+SubprocessorRow\[\]/.test(
    qSrc
  ),
  "SUBPROCESSORS is exported as readonly array"
);
assert(
  /export\s+const\s+DPDP_COVERAGE\s*:\s*ReadonlyArray/.test(qSrc),
  "DPDP_COVERAGE is exported as ReadonlyArray"
);
assert(
  /export\s+const\s+GDPR_COVERAGE\s*:\s*ReadonlyArray/.test(qSrc),
  "GDPR_COVERAGE is exported as ReadonlyArray"
);
assert(
  /export\s+\{\s*DEFAULT_DAILY_COST_CAP_MICROS\s*\}/.test(qSrc),
  "DEFAULT_DAILY_COST_CAP_MICROS is re-exported from lib/ai/rate-limit"
);

/* ------------------------------------------------------------------ */
/* SECTION B — getFraudSignals query shape                             */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION B] getFraudSignals query shape");

// Join path: webhookEvents → payments (paymentId FK).
assert(
  /from\(schema\.webhookEvents\)/.test(qSrc),
  "getFraudSignals queries from webhookEvents"
);
assert(
  /innerJoin\(\s*schema\.payments,\s*eq\(schema\.webhookEvents\.paymentId,\s*schema\.payments\.id\)/.test(
    qSrc
  ),
  "getFraudSignals inner-joins payments on paymentId → id"
);

// JSON path filter covers the full dispute lifecycle. Using \\$ because
// the $ in regex is end-of-line, so we need to escape the literal.
const disputeFilter = qSrc.match(
  /JSON_UNQUOTE\(JSON_EXTRACT\([^)]+rawPayload[^)]+\$\.data\.action['"][^)]*\)\)\s*IN\s*\(([^)]+)\)/
);
assert(
  disputeFilter !== null,
  "getFraudSignals uses JSON_UNQUOTE(JSON_EXTRACT(..., '$.data.action')) IN (...) filter"
);
if (disputeFilter) {
  for (const action of [
    "chargeback",
    "chargeback_warning",
    "chargeback_reverse",
    "dispute",
    "dispute_opened",
  ]) {
    assert(
      disputeFilter[1].includes(`'${action}'`),
      `dispute action filter includes '${action}'`
    );
  }
}

// Hard-block query: user_rate_limits where cap = 0.
assert(
  /from\(schema\.userRateLimits\)\s*\n?\s*\.where\(eq\(schema\.userRateLimits\.dailyCostCapMicros,\s*0\)\)/.test(
    qSrc
  ),
  "getFraudSignals reads user_rate_limits where dailyCostCapMicros = 0"
);

// Clamps.
assert(
  /Math\.min\(Math\.max\(opts\.days,\s*1\),\s*365\)/.test(qSrc),
  "getFraudSignals clamps days to [1, 365]"
);
assert(
  /Math\.min\(Math\.max\(opts\.limit\s*\?\?\s*100,\s*1\),\s*500\)/.test(qSrc),
  "getFraudSignals clamps limit to [1, 500] with default 100"
);

// Dedup + sort: disputeCount desc, isHardBlocked asc (blocked below).
assert(
  /new Map<string,\s*FraudSignalsRow>/.test(qSrc),
  "getFraudSignals dedups via Map<string, FraudSignalsRow>"
);
assert(
  /b\.disputeCount\s*-\s*a\.disputeCount/.test(qSrc),
  "getFraudSignals sorts disputeCount desc (b - a)"
);
assert(
  /a\.isHardBlocked\s*\?\s*1\s*:\s*-1/.test(qSrc),
  "getFraudSignals sorts blocked users below non-blocked at equal disputeCount"
);

/* ------------------------------------------------------------------ */
/* SECTION C — getRateLimitOverrides query shape                       */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION C] getRateLimitOverrides query shape");

// orderBy updatedAt desc.
assert(
  /orderBy\(desc\(schema\.userRateLimits\.updatedAt\)\)/.test(qSrc),
  "getRateLimitOverrides orders by updatedAt desc"
);

// Email enrichment via IN(...).
assert(
  /from\(schema\.users\)\s*\n?\s*\.where\(sql`\$\{schema\.users\.id\}\s*IN\s*\$\{userIds\}`\)/.test(
    qSrc
  ),
  "getRateLimitOverrides enriches with email via users IN (userIds)"
);

// Uses resolveDailyCapMicros(null) for the global default and imports
// DEFAULT_DAILY_COST_CAP_MICROS.
assert(
  /from\s+"@\/lib\/ai\/rate-limit"/.test(qSrc),
  "phase-d-queries imports from @/lib/ai/rate-limit"
);
assert(
  /DEFAULT_DAILY_COST_CAP_MICROS/.test(qSrc),
  "phase-d-queries imports DEFAULT_DAILY_COST_CAP_MICROS"
);
assert(
  /resolveDailyCapMicros\(null\)/.test(qSrc),
  "getRateLimitOverrides calls resolveDailyCapMicros(null)"
);

// Env-var classification for globalDefaultSource.
assert(
  /process\.env\.USER_DAILY_COST_MICROS_CAP/.test(qSrc),
  "getRateLimitOverrides reads USER_DAILY_COST_MICROS_CAP env var"
);
assert(
  /globalDefaultSource\s*:\s*"env"\s*\|\s*"compiled-in"/.test(qSrc),
  "globalDefaultSource typed as 'env' | 'compiled-in'"
);

/* ------------------------------------------------------------------ */
/* SECTION D — static constants content                                */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION D] static constants content");

// Subprocessors: 6 known providers (Paddle was retired 2026-05-01;
// add the next international gateway here when wired).
const REQUIRED_SUBPROCESSORS = [
  "Razorpay",
  "Google LLC (Analytics 4)",
  "Microsoft Corporation (Clarity)",
  "Cloudflare",
  "Hostinger",
  "Google LLC (OAuth)",
];
for (const s of REQUIRED_SUBPROCESSORS) {
  assert(qSrc.includes(s), `SUBPROCESSORS includes "${s}"`);
}

// Every SubprocessorRow carries a transferMechanism string — this is
// the DPDP s. 16 / GDPR Chapter V compliance hook.
const subCount = (qSrc.match(/transferMechanism:\s*"/g) || []).length;
assert(
  subCount >= 6,
  `SUBPROCESSORS has at least 6 transferMechanism entries (found ${subCount})`
);

// DPDP Act sections wired into Task #24.
const REQUIRED_DPDP = [
  "s. 6(3)",
  "s. 8(10)",
  "s. 9",
  "s. 11",
  "s. 12",
  "s. 13",
  "s. 14",
  "s. 16",
];
for (const s of REQUIRED_DPDP) {
  assert(qSrc.includes(s), `DPDP_COVERAGE references ${s}`);
}

// GDPR / ePrivacy / EDPB / ICO references.
const REQUIRED_GDPR = [
  "GDPR Art. 6(1)(a)",
  "GDPR Art. 7(3)",
  "GDPR Chapter V",
  "ePrivacy Directive Art. 5(3)",
  "EDPB Guidelines 05/2020",
  "ICO 2023",
];
for (const g of REQUIRED_GDPR) {
  assert(qSrc.includes(g), `GDPR_COVERAGE references ${g}`);
}

/* ------------------------------------------------------------------ */
/* SECTION E — per-page contracts                                      */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION E] per-page contracts");

for (const p of PAGES) {
  const pageSrc = read(p.path);
  assert(pageSrc.length > 0, `${p.href} page file exists`);
  assert(
    /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(pageSrc),
    `${p.href} pins dynamic = "force-dynamic"`
  );
  assert(
    /export\s+const\s+runtime\s*=\s*"nodejs"/.test(pageSrc),
    `${p.href} pins runtime = "nodejs"`
  );
  assert(
    /export\s+default\s+(async\s+)?function/.test(pageSrc),
    `${p.href} has a default export`
  );
  // requireAdmin must NOT be *called* in the page body — layout gates.
  // The mere presence of the word is OK (e.g. a comment explaining that
  // requireAdmin is enforced inside the referenced server actions). We
  // strip // line comments and /* */ block comments before matching to
  // keep documentation-friendly regexes honest.
  const stripped = pageSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert(
    !/\brequireAdmin\s*\(/.test(stripped),
    `${p.href} does not re-gate with requireAdmin() call (layout already gates)`
  );
}

/* ------------------------------------------------------------------ */
/* SECTION F — page-to-module wiring                                   */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION F] page-to-module wiring");

// Plans: pricing module imports.
const plansSrc = read(PAGES[0].path);
assert(
  /from\s+"@\/lib\/pricing"/.test(plansSrc),
  "/admin/plans imports from @/lib/pricing"
);
for (const name of [
  "CREDIT_PACKS",
  "AI_OPERATION_COSTS",
  "USD_TO_INR_RATE",
  "packAmountMinor",
]) {
  assert(
    new RegExp(`\\b${name}\\b`).test(plansSrc),
    `/admin/plans references ${name}`
  );
}

// Promos: Phase E / Task #27 promoted this page from a placeholder to a
// real inventory + create/disable UI. The page must still cite Task #27
// (traceability) and must wire the three Phase-E modules — the server
// actions (create/disable) and the inventory rollup query.
const promosSrc = read(PAGES[1].path);
assert(
  /Task\s*#?27/i.test(promosSrc),
  "/admin/promos cites Task #27"
);
assert(
  /adminCreatePromoCodeAction/.test(promosSrc) &&
    /adminDisablePromoCodeAction/.test(promosSrc) &&
    /getPromoCodeInventory/.test(promosSrc),
  "/admin/promos wires adminCreate/Disable actions + getPromoCodeInventory"
);

// Compliance: pulls from legal-docs + phase-d-queries static constants.
const complianceSrc = read(PAGES[2].path);
assert(
  /from\s+"@\/lib\/legal-docs"/.test(complianceSrc),
  "/admin/compliance imports from @/lib/legal-docs"
);
assert(
  /from\s+"@\/lib\/admin\/phase-d-queries"/.test(complianceSrc),
  "/admin/compliance imports from @/lib/admin/phase-d-queries"
);
for (const name of ["LEGAL_DOCS", "SUBPROCESSORS", "DPDP_COVERAGE", "GDPR_COVERAGE"]) {
  assert(
    new RegExp(`\\b${name}\\b`).test(complianceSrc),
    `/admin/compliance references ${name}`
  );
}
// Grievance Officer card required per DPDP s. 8(10).
assert(
  /Grievance\s+Officer/i.test(complianceSrc),
  "/admin/compliance renders a Grievance Officer card"
);
assert(
  /15\s*days?/.test(complianceSrc),
  "/admin/compliance cites the 15-day DPDP s. 8(10) SLA"
);

// Fraud: phase-d-queries + DayPicker + clampDays.
const fraudSrc = read(PAGES[3].path);
assert(
  /from\s+"@\/lib\/admin\/phase-d-queries"/.test(fraudSrc),
  "/admin/fraud imports from @/lib/admin/phase-d-queries"
);
assert(
  /\bgetFraudSignals\b/.test(fraudSrc),
  "/admin/fraud calls getFraudSignals"
);
assert(
  /DayPicker/.test(fraudSrc) && /clampDays/.test(fraudSrc),
  "/admin/fraud uses DayPicker + clampDays"
);
assert(
  /base=["']\/admin\/fraud["']/.test(fraudSrc),
  "/admin/fraud DayPicker base matches its own href"
);
assert(
  /ErrorBanner/.test(fraudSrc),
  "/admin/fraud renders ErrorBanner on query failure"
);

// Rate-limits: phase-d-queries + DEFAULT_DAILY_COST_CAP_MICROS.
const rlSrc = read(PAGES[4].path);
assert(
  /from\s+"@\/lib\/admin\/phase-d-queries"/.test(rlSrc),
  "/admin/rate-limits imports from @/lib/admin/phase-d-queries"
);
assert(
  /\bgetRateLimitOverrides\b/.test(rlSrc),
  "/admin/rate-limits calls getRateLimitOverrides"
);
assert(
  /DEFAULT_DAILY_COST_CAP_MICROS/.test(rlSrc),
  "/admin/rate-limits references DEFAULT_DAILY_COST_CAP_MICROS"
);
assert(
  /ErrorBanner/.test(rlSrc),
  "/admin/rate-limits renders ErrorBanner on query failure"
);

/* ------------------------------------------------------------------ */
/* SECTION G — layout NAV wires all five new pages                     */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION G] layout NAV registration");

const layoutSrc = read(LAYOUT_PATH);
assert(layoutSrc.length > 0, "admin layout exists");

// Pricing section with two entries.
assert(
  /section:\s*"Pricing",\s*href:\s*"\/admin\/plans",\s*label:\s*"Plans"/.test(
    layoutSrc
  ),
  'NAV includes {section: "Pricing", href: "/admin/plans", label: "Plans"}'
);
assert(
  /section:\s*"Pricing",\s*href:\s*"\/admin\/promos",\s*label:\s*"Promos"/.test(
    layoutSrc
  ),
  'NAV includes {section: "Pricing", href: "/admin/promos", label: "Promos"}'
);

// Ops section gains fraud + rate-limits.
assert(
  /section:\s*"Ops",\s*href:\s*"\/admin\/fraud",\s*label:\s*"Fraud"/.test(
    layoutSrc
  ),
  'NAV includes {section: "Ops", href: "/admin/fraud", label: "Fraud"}'
);
assert(
  /section:\s*"Ops",\s*href:\s*"\/admin\/rate-limits",\s*label:\s*"Rate limits"/.test(
    layoutSrc
  ),
  'NAV includes {section: "Ops", href: "/admin/rate-limits", label: "Rate limits"}'
);

// Platform section gains compliance.
assert(
  /section:\s*"Platform",\s*href:\s*"\/admin\/compliance",\s*label:\s*"Compliance"/.test(
    layoutSrc
  ),
  'NAV includes {section: "Platform", href: "/admin/compliance", label: "Compliance"}'
);

/* ------------------------------------------------------------------ */
/* SECTION H — run-all-tests.mjs registers this suite                  */
/* ------------------------------------------------------------------ */

console.log("\n[SECTION H] run-all-tests.mjs registers this suite");

const aggSrc = read(AGGREGATOR_PATH);
assert(aggSrc.length > 0, "scripts/run-all-tests.mjs exists");
assert(
  /\{\s*name:\s*"admin-phase-d",\s*file:\s*"test-admin-phase-d\.mjs"\s*\}/.test(
    aggSrc
  ),
  'run-all-tests.mjs registers admin-phase-d suite'
);

// Admin suites stay clustered: admin-phase-d should appear AFTER admin-
// phase-c so a refactor of shared admin UI surfaces in the right order.
{
  const idxC = aggSrc.indexOf('name: "admin-phase-c"');
  const idxD = aggSrc.indexOf('name: "admin-phase-d"');
  assert(
    idxC > 0 && idxD > 0 && idxD > idxC,
    "admin-phase-d suite is registered after admin-phase-c"
  );
}

/* ------------------------------------------------------------------ */
/* Summary                                                              */
/* ------------------------------------------------------------------ */

console.log("");
console.log("=".repeat(60));
if (failed === 0) {
  console.log(`  admin-phase-d tests: ${passed} passed, ${failed} failed`);
  process.exit(0);
} else {
  console.log(`  admin-phase-d tests: ${passed} passed, ${failed} failed`);
  console.log("");
  console.log("  Failures:");
  for (const f of failures) console.log(`    - ${f}`);
  process.exit(1);
}
