#!/usr/bin/env node
// scripts/test-user-dashboard-v2.mjs — Pin the /app/app user dashboard v2.
//
// This harness guards the two strict walls Task #19 added to the codebase:
//
//   (A) PII wall — every exported query helper in lib/user/queries.ts takes
//       `userId: string` as its FIRST POSITIONAL PARAMETER. Every page that
//       consumes those helpers derives userId from `auth()` and never from
//       searchParams, route params, or an incoming prop. If a future edit
//       leaks userId through a URL, the page-level grep fails.
//
//   (B) Cost / margin / MoR-split wall — the following column names MUST
//       NOT appear anywhere under lib/user/** or app/app/**/page.tsx:
//         cost_micros, costMicros, net_revenue_micros, netRevenueMicros,
//         processor_fee_micros, processorFeeMicros, tax_remittable_micros,
//         taxRemittableMicros, fx_rate_used, fxRateUsed, fx_slippage_micros,
//         fxSlippageMicros, infra_amortized_micros, infraAmortizedMicros,
//         infra_amortized_credits, infraAmortizedCredits,
//         refund_reserve_credits, refundReserveCredits,
//         gross_charge_micros, grossChargeMicros.
//       These are MoR/admin-only surfaces. If ANY page or user-library
//       file gains a reference, this harness fails loudly.
//
// Sections:
//   A. lib/user/queries.ts — server-only, signatures, forbidden columns
//   B. lib/user/format.ts — helpers present, no admin re-exports
//   C. Per-page contracts (usage, plan, credits, receipts): force-dynamic,
//      runtime nodejs, robots noindex, default export, auth() usage, no
//      userId in searchParams/params
//   D. Forbidden-column wall across app/app/**/page.tsx
//   E. AppShell NAV + dashboard wiring
//   F. run-all-tests.mjs registration
//
// Keep this self-contained: no imports beyond Node built-ins. Style +
// assertion helper mirrors scripts/test-admin-dashboard.mjs.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

let pass = 0;
let fail = 0;

function assert(label, cond, detail = "") {
  if (cond) {
    pass++;
    // console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${detail ? `  — ${detail}` : ""}`);
  }
}

function mustRead(path) {
  const abs = resolve(ROOT, path);
  if (!existsSync(abs)) {
    fail++;
    console.log(`  ✗ missing file: ${path}`);
    return "";
  }
  return readFileSync(abs, "utf8");
}

// ------------------------------------------------------------------
// Forbidden column list — applied to lib/user/** and app/app/**/page.tsx.
// ------------------------------------------------------------------
const FORBIDDEN_COLUMNS = [
  "cost_micros",
  "costMicros",
  "net_revenue_micros",
  "netRevenueMicros",
  "processor_fee_micros",
  "processorFeeMicros",
  "tax_remittable_micros",
  "taxRemittableMicros",
  "tax_collected_micros",
  "taxCollectedMicros",
  "fx_rate_used",
  "fxRateUsed",
  "fx_slippage_micros",
  "fxSlippageMicros",
  "infra_amortized_micros",
  "infraAmortizedMicros",
  "infra_amortized_credits",
  "infraAmortizedCredits",
  "refund_reserve_credits",
  "refundReserveCredits",
  "gross_charge_micros",
  "grossChargeMicros",
];

function assertNoForbidden(label, source, src) {
  const hit = FORBIDDEN_COLUMNS.find((col) => {
    // Allow the name to appear inside block comments (// or /* */) since
    // the harness itself + the module headers reference these names to
    // DOCUMENT that they're forbidden. We strip single-line comments and
    // block comments before the grep.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    return stripped.includes(col);
  });
  assert(
    `${label}: no forbidden cost/margin columns in code`,
    hit === undefined,
    hit ? `found: ${hit}` : ""
  );
}

// ==================================================================
// SECTION A — lib/user/queries.ts
// ==================================================================
console.log("\nA. lib/user/queries.ts");
{
  const src = mustRead("lib/user/queries.ts");
  assert("queries.ts imports 'server-only'", /import\s+"server-only"/.test(src));
  assert(
    "queries.ts exports UserQueryResult type",
    /export\s+type\s+UserQueryResult/.test(src)
  );

  const expected = [
    "getUserBalance",
    "getUsageRollup",
    "getDailySpend",
    "getRecentCreditLedger",
    "getActiveSubscription",
    "getReceipts",
    "getSpendSummary",
  ];
  for (const fn of expected) {
    assert(
      `queries.ts exports ${fn}(userId, ...)`,
      new RegExp(`export\\s+async\\s+function\\s+${fn}\\s*\\(\\s*userId\\s*:\\s*string`).test(src)
    );
  }

  // Every exported async function must take userId as FIRST positional param
  const sigs = [...src.matchAll(/export\s+async\s+function\s+(\w+)\s*\(\s*([^,)]+)/g)];
  for (const m of sigs) {
    const fnName = m[1];
    const firstParam = m[2].trim();
    assert(
      `queries.ts ${fnName}() first param is "userId: string"`,
      /^userId\s*:\s*string/.test(firstParam),
      `first param = "${firstParam}"`
    );
  }

  assertNoForbidden("queries.ts", "queries.ts", src);
}

// ==================================================================
// SECTION B — lib/user/format.ts
// ==================================================================
console.log("\nB. lib/user/format.ts");
{
  const src = mustRead("lib/user/format.ts");
  assert("format.ts imports 'server-only'", /import\s+"server-only"/.test(src));

  const expected = [
    "formatCredits",
    "formatCount",
    "formatRelative",
    "formatCurrencyMinor",
    "formatPercent",
    "clampUserDays",
    "humanizeLedgerReason",
    "humanizeStatus",
    "humanizePackId",
  ];
  for (const fn of expected) {
    assert(
      `format.ts exports ${fn}`,
      new RegExp(`export\\s+function\\s+${fn}\\b`).test(src)
    );
  }

  // Must NOT re-export from lib/admin/* — the PII wall depends on separation
  assert(
    "format.ts does not import from lib/admin/*",
    !/from\s+["']@\/lib\/admin/.test(src)
  );

  // Must NOT expose USD micro formatters or margin/cost helpers
  for (const banned of [
    "formatMicros",
    "formatUsdMicros",
    "formatMarginPct",
    "formatCostPerCall",
    "formatNetRevenue",
    "maskEmail",
  ]) {
    assert(
      `format.ts does not export banned helper ${banned}`,
      !new RegExp(`export\\s+function\\s+${banned}\\b`).test(src)
    );
  }

  assertNoForbidden("format.ts", "format.ts", src);
}

// ==================================================================
// SECTION C — Per-page contracts
// ==================================================================
console.log("\nC. Per-page contracts");
const PAGES = [
  { path: "app/app/usage/page.tsx", deps: ["getUsageRollup", "getDailySpend"] },
  { path: "app/app/plan/page.tsx", deps: ["getActiveSubscription"] },
  { path: "app/app/credits/page.tsx", deps: ["getRecentCreditLedger"] },
  { path: "app/app/receipts/page.tsx", deps: ["getReceipts"] },
];

for (const { path, deps } of PAGES) {
  const src = mustRead(path);
  const tag = path.replace(/^app\/app\//, "").replace(/\/page\.tsx$/, "");

  assert(
    `${tag}: force-dynamic`,
    /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(src)
  );
  assert(
    `${tag}: runtime nodejs`,
    /export\s+const\s+runtime\s*=\s*"nodejs"/.test(src)
  );
  assert(
    `${tag}: robots noindex in metadata`,
    /robots\s*:\s*\{\s*index\s*:\s*false/.test(src)
  );
  assert(
    `${tag}: default async export`,
    /export\s+default\s+async\s+function\s+\w+Page/.test(src)
  );

  // userId must come from auth() — not from searchParams/params
  assert(
    `${tag}: calls auth()`,
    /const\s+session\s*=\s*await\s+auth\(\)/.test(src)
  );
  assert(
    `${tag}: reads userId from session (not from URL)`,
    /session\?\.user\s*\?\s*\(session\.user\s+as\s+\{\s*id\?:\s*string\s*\}\)\.id/.test(src)
  );
  // Block any runtime access to searchParams.userId or searchParams["userId"],
  // plus any searchParams type annotation that declares a userId field.
  assert(
    `${tag}: no runtime access to searchParams.userId`,
    !/searchParams\s*[?.]*\s*(?:\.\s*userId|\[\s*["']userId)/.test(src)
  );
  assert(
    `${tag}: searchParams type has no userId field`,
    !/searchParams[^;{]{0,200}\{[^}]*\buserId\b[^}]*\}/.test(src)
  );
  assert(
    `${tag}: no runtime access to params.userId`,
    !/\bparams\s*[?.]*\s*(?:\.\s*userId|\[\s*["']userId)/.test(src)
  );

  // Imports the required query helpers
  for (const dep of deps) {
    assert(
      `${tag}: imports ${dep} from @/lib/user/queries`,
      new RegExp(
        `import\\s*\\{[^}]*\\b${dep}\\b[^}]*\\}\\s*from\\s*["']@/lib/user/queries["']`,
        "s"
      ).test(src)
    );
  }

  // Must redirect to /login if no userId (auth gate redundancy with layout).
  //
  // 2026-05-01: relaxed the regex to accept the new callback-preserving form
  // `redirect("/login?callbackUrl=...")`. Until today these pages used
  // `redirect("/login")` (no callback), which silently dropped the user's
  // intended destination. The auth-callback-preservation guard
  // (scripts/test-auth-callback-preservation.mjs) now ENFORCES the
  // callback-preserving form at every /app/* page; this guard must accept
  // either form to avoid contradictory invariants between the two suites.
  // The auth-callback guard handles enforcement of the better form.
  assert(
    `${tag}: redirects to /login when userId is missing`,
    /redirect\(\s*["`']\/login(\?[^"`']*)?["`']\s*\)/.test(src) ||
      // Template-literal form: redirect(`/login?callbackUrl=${...}`)
      /redirect\(\s*`\/login\?callbackUrl=\$\{[^`]+\}`\s*\)/.test(src)
  );

  // Must NOT import admin primitives
  assert(
    `${tag}: does NOT import from @/lib/admin/*`,
    !/from\s+["']@\/lib\/admin/.test(src)
  );
  assert(
    `${tag}: does NOT import from @/components/admin/*`,
    !/from\s+["']@\/components\/admin/.test(src)
  );

  assertNoForbidden(tag, path, src);
}

// ==================================================================
// SECTION D — Forbidden-column wall across ALL app/app/**/page.tsx
// ==================================================================
console.log("\nD. Cost/margin wall across app/app/**");
{
  // Scan ALL user-facing pages, not just the new ones, to catch regressions
  // elsewhere in the /app/app tree.
  const userPages = [
    "app/app/dashboard/page.tsx",
    "app/app/files/page.tsx",
    "app/app/chat/page.tsx",
    "app/app/api-keys/page.tsx",
    "app/app/billing/page.tsx",
    "app/app/settings/page.tsx",
    "app/app/usage/page.tsx",
    "app/app/plan/page.tsx",
    "app/app/credits/page.tsx",
    "app/app/receipts/page.tsx",
    "app/app/page.tsx",
  ];
  for (const p of userPages) {
    const abs = resolve(ROOT, p);
    if (!existsSync(abs)) continue; // some tree members optional
    const src = readFileSync(abs, "utf8");
    assertNoForbidden(p, p, src);
  }
}

// ==================================================================
// SECTION E — AppShell NAV + dashboard wiring
// ==================================================================
console.log("\nE. AppShell + dashboard wiring");
{
  const shell = mustRead("components/app/AppShell.tsx");
  assert(
    "AppShell NAV includes /app/usage",
    /href:\s*["']\/app\/usage["']/.test(shell)
  );

  const dash = mustRead("app/app/dashboard/page.tsx");
  // StatCard passes href as a JS object prop, so the URL appears as a
  // quoted string (`href: "/app/usage?days=7"`) rather than a JSX attr.
  // Match any quoted occurrence of the path.
  assert(
    "dashboard links to /app/usage",
    /["']\/app\/usage(?:["']|\?)/.test(dash)
  );
  assert(
    "dashboard links to /app/credits",
    /["']\/app\/credits(?:["']|\?)/.test(dash)
  );
  assert(
    "dashboard links to /app/receipts",
    /["']\/app\/receipts(?:["']|\?)/.test(dash)
  );
  assert(
    "dashboard imports formatCredits from @/lib/user/format",
    /from\s+["']@\/lib\/user\/format["']/.test(dash)
  );
  assert(
    "dashboard imports getSpendSummary from @/lib/user/queries",
    /getSpendSummary[^;]*from\s+["']@\/lib\/user\/queries["']/.test(dash)
  );
  assertNoForbidden("dashboard", "app/app/dashboard/page.tsx", dash);
}

// ==================================================================
// SECTION F — Suite registration in run-all-tests.mjs
// ==================================================================
console.log("\nF. run-all-tests.mjs registration");
{
  const runner = mustRead("scripts/run-all-tests.mjs");
  assert(
    "run-all-tests.mjs registers user-dashboard-v2 suite",
    /name:\s*["']user-dashboard-v2["']/.test(runner)
  );
  assert(
    "run-all-tests.mjs points at test-user-dashboard-v2.mjs",
    /file:\s*["']test-user-dashboard-v2\.mjs["']/.test(runner)
  );
  // The user-dashboard suite should sit near admin-dashboard in the file
  // so reviewers see the two surfaces side-by-side.
  assert(
    "user-dashboard-v2 is registered near admin-dashboard in SUITES",
    /admin-dashboard[\s\S]{0,4000}user-dashboard-v2/.test(runner)
  );
}

// ==================================================================
// Summary
// ==================================================================
console.log(`\nUser dashboard v2 tests: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
