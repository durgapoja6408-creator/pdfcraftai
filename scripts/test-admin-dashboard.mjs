#!/usr/bin/env node
// Self-contained test harness for Task #18 — the Phase B admin dashboard
// v2 (14 admin pages under app/admin/*).
//
// Mirrors the plain-Node pattern used by every other test-*.mjs harness
// in this repo: assert() with a pass/fail counter, static file greps
// only (no live TS import, no DB, no spawned Next server), emits the
// canonical "N passed, M failed" summary line that run-all-tests.mjs
// parses.
//
// Why a second admin harness? The existing admin-margin suite pins
// /api/admin/margin (JSON endpoint) and app/app/admin/margin (the Phase
// A7 read-only page). This one pins the /admin/* surface — the full
// 14-page Phase B dashboard that gives operators a bird's-eye view of
// revenue, costs, net margin, users, ops, providers, router, alarms,
// transactions, credits, deploy, and webhook logs. They pin different
// code:
//
//   - admin-margin    →  app/app/admin/margin + /api/admin/margin
//   - admin-dashboard →  app/admin/* (14 pages) + components/admin/ui
//                        + lib/admin/{guard,format,queries}.ts
//
// Regressions in one surface shouldn't dark-hole the other, so they
// stay in separate suites.
//
// What this covers:
//   SECTION A — shared gate: lib/admin/guard.ts uses notFound() (NOT
//               redirect, NOT 403), sources allowlist from
//               process.env.ADMIN_EMAILS, re-exports isAdminEmail.
//   SECTION B — app/admin/layout.tsx wires requireAdmin() once, sets
//               robots noindex+nofollow, force-dynamic + nodejs, and
//               declares the exact 13-entry NAV (14th is the overview
//               at /admin itself).
//   SECTION C — every one of the 14 pages exists at the right path,
//               pins force-dynamic + nodejs, imports from the shared
//               queries+ui modules, and does NOT duplicate its own
//               requireAdmin() call (the layout gate is the source
//               of truth).
//   SECTION D — components/admin/ui.tsx exports the expected primitives
//               (StatCard, ErrorBanner, Th, Td, DayPicker, clampDays,
//               SectionTitle, tableStyle).
//   SECTION E — lib/admin/queries.ts exports all 12 aggregator
//               functions with the expected names + AdminQueryResult
//               wrapper shape.
//   SECTION F — lib/admin/format.ts exports the expected helpers
//               (microsToUsd, bpsToPercent, formatCount,
//               formatRelative, maskEmail, etc.)
//   SECTION G — PII posture: list pages (users, transactions) call
//               maskEmail; only the per-user detail page shows the
//               unmasked email.
//   SECTION H — run-all-tests.mjs registers the suite.
//
// Run: `node scripts/test-admin-dashboard.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const GUARD_PATH = resolve(ROOT, "lib", "admin", "guard.ts");
const FORMAT_PATH = resolve(ROOT, "lib", "admin", "format.ts");
const QUERIES_PATH = resolve(ROOT, "lib", "admin", "queries.ts");
const UI_PATH = resolve(ROOT, "components", "admin", "ui.tsx");
const LAYOUT_PATH = resolve(ROOT, "app", "admin", "layout.tsx");
const AGGREGATOR_PATH = resolve(ROOT, "scripts", "run-all-tests.mjs");

// The 14 page files. Key matches the NAV href (except the root "/admin"
// which is page.tsx at the root).
const PAGES = [
  { href: "/admin", path: resolve(ROOT, "app", "admin", "page.tsx"), label: "Overview" },
  { href: "/admin/revenue", path: resolve(ROOT, "app", "admin", "revenue", "page.tsx"), label: "Revenue" },
  { href: "/admin/costs", path: resolve(ROOT, "app", "admin", "costs", "page.tsx"), label: "Costs" },
  { href: "/admin/margin", path: resolve(ROOT, "app", "admin", "margin", "page.tsx"), label: "Margin" },
  { href: "/admin/transactions", path: resolve(ROOT, "app", "admin", "transactions", "page.tsx"), label: "Transactions" },
  { href: "/admin/credits", path: resolve(ROOT, "app", "admin", "credits", "page.tsx"), label: "Credits" },
  { href: "/admin/users", path: resolve(ROOT, "app", "admin", "users", "page.tsx"), label: "Users" },
  { href: "/admin/users/[id]", path: resolve(ROOT, "app", "admin", "users", "[id]", "page.tsx"), label: "User detail" },
  { href: "/admin/ops", path: resolve(ROOT, "app", "admin", "ops", "page.tsx"), label: "Operations" },
  { href: "/admin/providers", path: resolve(ROOT, "app", "admin", "providers", "page.tsx"), label: "Providers" },
  { href: "/admin/router", path: resolve(ROOT, "app", "admin", "router", "page.tsx"), label: "Router" },
  { href: "/admin/alarms", path: resolve(ROOT, "app", "admin", "alarms", "page.tsx"), label: "Alarms" },
  { href: "/admin/deploy", path: resolve(ROOT, "app", "admin", "deploy", "page.tsx"), label: "Deploy" },
  { href: "/admin/logs", path: resolve(ROOT, "app", "admin", "logs", "page.tsx"), label: "Webhook logs" },
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

// Fail-fast on missing files.
const REQUIRED = [
  GUARD_PATH,
  FORMAT_PATH,
  QUERIES_PATH,
  UI_PATH,
  LAYOUT_PATH,
  AGGREGATOR_PATH,
  ...PAGES.map((p) => p.path),
];
for (const p of REQUIRED) {
  if (!existsSync(p)) {
    console.error(`FATAL: required source file missing: ${p}`);
    process.exit(1);
  }
}

const GUARD_SRC = readFileSync(GUARD_PATH, "utf8");
const FORMAT_SRC = readFileSync(FORMAT_PATH, "utf8");
const QUERIES_SRC = readFileSync(QUERIES_PATH, "utf8");
const UI_SRC = readFileSync(UI_PATH, "utf8");
const LAYOUT_SRC = readFileSync(LAYOUT_PATH, "utf8");
const AGG_SRC = readFileSync(AGGREGATOR_PATH, "utf8");
const PAGE_SRCS = new Map(
  PAGES.map((p) => [p.href, readFileSync(p.path, "utf8")])
);

// =============================================================================
// SECTION A: shared guard
// =============================================================================

assert(
  "A1 guard.ts exports requireAdmin as async function",
  /export\s+async\s+function\s+requireAdmin\s*\(/.test(GUARD_SRC),
  "`export async function requireAdmin` missing"
);

assert(
  "A1 guard.ts imports notFound from next/navigation",
  /import\s+\{\s*notFound\s*\}\s+from\s+"next\/navigation"/.test(GUARD_SRC),
  "Must import notFound — the gate uses it for the 404 posture"
);

assert(
  "A1 guard calls notFound() on non-admin (not redirect, not 403)",
  /notFound\(\)/.test(GUARD_SRC) &&
    !/redirect\(/.test(GUARD_SRC) &&
    !/status:\s*403/.test(GUARD_SRC),
  "Gate must call notFound() — 403 or redirect would advertise the admin surface exists"
);

assert(
  "A1 guard sources allowlist from process.env.ADMIN_EMAILS",
  /isAdminEmail\s*\(\s*email\s*,\s*process\.env\.ADMIN_EMAILS\s*\)/.test(
    GUARD_SRC
  ),
  "Must delegate to isAdminEmail with process.env.ADMIN_EMAILS — no hard-coded allowlist"
);

assert(
  "A1 guard re-exports isAdminEmail",
  /export\s+\{\s*isAdminEmail\s*\}/.test(GUARD_SRC),
  "Must re-export isAdminEmail so shared nav/components can check admin status without tripping notFound()"
);

assert(
  "A1 guard imports auth() from @/auth",
  /import\s+\{\s*auth\s*\}\s+from\s+"@\/auth"/.test(GUARD_SRC),
  "Must import auth() to resolve the session"
);

assert(
  "A1 guard uses 'server-only'",
  /import\s+"server-only"/.test(GUARD_SRC),
  "server-only keeps the gate off the client bundle"
);

assert(
  "A1 guard exports AdminContext type",
  /export\s+type\s+AdminContext\s*=/.test(GUARD_SRC),
  "AdminContext type must be exported so pages can annotate the gate result"
);

// =============================================================================
// SECTION B: shared layout
// =============================================================================

assert(
  "B1 layout imports requireAdmin from @/lib/admin/guard",
  /import\s+\{\s*requireAdmin\s*\}\s+from\s+"@\/lib\/admin\/guard"/.test(
    LAYOUT_SRC
  ),
  "Layout must import requireAdmin from the shared guard module"
);

assert(
  "B1 layout calls requireAdmin() at top of component",
  /await\s+requireAdmin\(\)/.test(LAYOUT_SRC),
  "Layout must call `await requireAdmin()` — this is the gate every page inherits"
);

assert(
  "B1 layout pins force-dynamic",
  /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(LAYOUT_SRC),
  "Admin data is operational — never cacheable"
);

assert(
  "B1 layout pins nodejs runtime",
  /export\s+const\s+runtime\s*=\s*"nodejs"/.test(LAYOUT_SRC),
  "Drizzle + mysql2 are node-only"
);

assert(
  "B1 layout sets robots noindex + nofollow",
  /robots:\s*\{[\s\S]{0,120}index:\s*false[\s\S]{0,120}follow:\s*false/.test(
    LAYOUT_SRC
  ),
  "Belt-and-braces: the 404 posture already hides /admin, but robots noindex is a second layer"
);

// Every NAV entry in the layout must match one of the page hrefs we
// shipped (except "/admin/users/[id]" which is a detail page reached
// via row links, not sidebar nav).
const SIDEBAR_HREFS = PAGES.filter((p) => p.href !== "/admin/users/[id]").map(
  (p) => p.href
);
for (const href of SIDEBAR_HREFS) {
  assert(
    `B2 layout NAV includes ${href}`,
    new RegExp(`href:\\s*"${href.replace(/\//g, "\\/")}"`).test(LAYOUT_SRC),
    `NAV item for ${href} missing from layout sidebar`
  );
}

// =============================================================================
// SECTION C: per-page contracts
// =============================================================================

for (const page of PAGES) {
  const src = PAGE_SRCS.get(page.href);

  assert(
    `C1 ${page.href} pins force-dynamic`,
    /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(src),
    `Page ${page.href} must be force-dynamic (belt-and-braces alongside layout)`
  );

  assert(
    `C1 ${page.href} pins nodejs runtime`,
    /export\s+const\s+runtime\s*=\s*"nodejs"/.test(src),
    `Page ${page.href} must run on nodejs (mysql2 requirement)`
  );

  assert(
    `C1 ${page.href} has default export`,
    /export\s+default\s+(async\s+)?function/.test(src),
    `Page ${page.href} must export a default page function`
  );

  // No page should duplicate its own requireAdmin() call — the layout
  // gate is the source of truth. Duplication invites drift.
  assert(
    `C1 ${page.href} does NOT duplicate requireAdmin() (layout owns the gate)`,
    !/requireAdmin\(\)/.test(src),
    `Page ${page.href} should not call requireAdmin() directly — that's the layout's job`
  );
}

// Per-page query-function wiring. Each page must import its expected
// aggregator from @/lib/admin/queries (or the admin-level helpers module).
const QUERY_WIRING = [
  { href: "/admin", fn: "getOverviewSummary" },
  { href: "/admin/revenue", fn: "getRevenueBreakdown" },
  { href: "/admin/costs", fn: "getCostsBreakdown" },
  { href: "/admin/margin", fn: "getMarginDaily" },
  { href: "/admin/transactions", fn: "getTransactions" },
  { href: "/admin/credits", fn: "getCreditsSummary" },
  { href: "/admin/users", fn: "getUsersPnl" },
  { href: "/admin/users/[id]", fn: "getUserDetail" },
  { href: "/admin/ops", fn: "getOpsHealth" },
  { href: "/admin/providers", fn: "getProvidersHealth" },
  { href: "/admin/deploy", fn: "getDeploySnapshot" },
  { href: "/admin/logs", fn: "getWebhookLogs" },
];
for (const { href, fn } of QUERY_WIRING) {
  const src = PAGE_SRCS.get(href);
  assert(
    `C2 ${href} imports ${fn} from @/lib/admin/queries`,
    new RegExp(
      `import\\s+\\{[^}]*\\b${fn}\\b[^}]*\\}\\s+from\\s+"@\\/lib\\/admin\\/queries"`
    ).test(src),
    `Page ${href} must import ${fn} from the admin queries module`
  );
}

// Router + Alarms pages don't use queries.ts — they pull from the
// router/margin-rollup libraries directly. Pin those wirings separately.
assert(
  "C3 /admin/router imports currentPolicySnapshot + killSwitchSnapshot",
  /import\s+\{\s*currentPolicySnapshot\s*\}\s+from\s+"@\/lib\/ai\/router"/.test(
    PAGE_SRCS.get("/admin/router")
  ) &&
    /killSwitchSnapshot/.test(PAGE_SRCS.get("/admin/router")),
  "Router page must read live policy + kill-switch state from the router + kill-switches modules"
);

assert(
  "C3 /admin/alarms imports detectAlarms from @/lib/ai/margin-rollup",
  /import\s+\{[^}]*\bdetectAlarms\b[^}]*\}\s+from\s+"@\/lib\/ai\/margin-rollup"/.test(
    PAGE_SRCS.get("/admin/alarms")
  ),
  "Alarms page must use detectAlarms() — same function the nightly cron feeds to Slack"
);

// =============================================================================
// SECTION D: shared UI primitives
// =============================================================================

for (const primitive of [
  "StatCard",
  "ErrorBanner",
  "Th",
  "Td",
  "DayPicker",
  "clampDays",
  "SectionTitle",
]) {
  assert(
    `D1 ui.tsx exports ${primitive}`,
    new RegExp(`export\\s+function\\s+${primitive}\\b`).test(UI_SRC),
    `Shared UI must export ${primitive} — admin pages rely on it`
  );
}

assert(
  "D1 ui.tsx exports tableStyle CSSProperties",
  /export\s+const\s+tableStyle\s*:\s*CSSProperties/.test(UI_SRC),
  "tableStyle must be exported so pages render tables with identical chrome"
);

assert(
  "D1 clampDays defaults to 30 when ?days= missing",
  /function\s+clampDays\s*\([^)]*\)[^{]*\{[\s\S]{0,300}fallback\s*=\s*30/.test(
    UI_SRC
  ) || /fallback\s*=\s*30/.test(UI_SRC),
  "clampDays must default to 30 days when the query param is missing or invalid"
);

assert(
  "D1 clampDays ceils at 365 days",
  /Math\.min\(\s*Math\.floor\(n\)\s*,\s*365\s*\)/.test(UI_SRC),
  "clampDays must ceiling at 365 — unbounded input could hit unindexed scans"
);

// =============================================================================
// SECTION E: queries.ts aggregator surface
// =============================================================================

const EXPECTED_QUERIES = [
  "getOverviewSummary",
  "getRevenueBreakdown",
  "getCostsBreakdown",
  "getMarginDaily",
  "getUsersPnl",
  "getUserDetail",
  "getOpsHealth",
  "getProvidersHealth",
  "getTransactions",
  "getCreditsSummary",
  "getWebhookLogs",
  "getDeploySnapshot",
];
for (const fn of EXPECTED_QUERIES) {
  assert(
    `E1 queries.ts exports ${fn}`,
    new RegExp(`export\\s+(async\\s+)?function\\s+${fn}\\b`).test(QUERIES_SRC),
    `queries.ts must export ${fn} — at least one admin page depends on it`
  );
}

assert(
  "E1 queries.ts defines AdminQueryResult<T> wrapper",
  /export\s+type\s+AdminQueryResult\s*<T>\s*=\s*\{\s*data:\s*T[\s\S]{0,80}error:\s*string\s*\|\s*null/.test(
    QUERIES_SRC
  ),
  "AdminQueryResult<T> = { data, error } wrapper is how every aggregator surfaces failure — page renders branch on .error"
);

assert(
  "E1 queries.ts uses 'server-only' import",
  /import\s+"server-only"/.test(QUERIES_SRC),
  "server-only keeps query helpers off the client bundle"
);

assert(
  "E1 queries.ts excludes BREAKAGE_SYNTHETIC_SLICE from real-slice totals",
  /ne\(\s*schema\.aiDailyMargin\.providerId\s*,\s*BREAKAGE_SYNTHETIC_SLICE\.providerId\s*\)/.test(
    QUERIES_SRC
  ),
  "Cost/call aggregates must exclude the synthetic breakage slice to keep unit-cost math honest"
);

// =============================================================================
// SECTION F: format.ts helper surface
// =============================================================================

for (const helper of [
  "microsToUsd",
  "bpsToPercent",
  "formatCount",
  "formatDuration",
  "formatRelative",
  "formatUtcDate",
  "formatUtcDateTime",
  "formatBool",
  "maskEmail",
]) {
  assert(
    `F1 format.ts exports ${helper}`,
    new RegExp(`export\\s+function\\s+${helper}\\b`).test(FORMAT_SRC),
    `format.ts must export ${helper} — admin pages rely on it`
  );
}

// =============================================================================
// SECTION G: PII posture — list pages mask email, detail page shows full
// =============================================================================

assert(
  "G1 /admin/users list page calls maskEmail on every row",
  /maskEmail\(/.test(PAGE_SRCS.get("/admin/users")),
  "Users list page must mask emails — only the per-user detail page shows the full address"
);

assert(
  "G1 /admin/transactions list page calls maskEmail on every row",
  /maskEmail\(/.test(PAGE_SRCS.get("/admin/transactions")),
  "Transactions list must mask emails for consistency with the users list"
);

assert(
  "G1 /admin/users/[id] detail page does NOT call maskEmail (unmasked by design)",
  !/maskEmail\(/.test(PAGE_SRCS.get("/admin/users/[id]")),
  "The per-user detail page is the one place the full email shows — that's the whole point of clicking through"
);

// =============================================================================
// SECTION H: aggregator wiring
// =============================================================================

assert(
  "H1 aggregator registers an admin-dashboard suite",
  /name:\s*"admin-dashboard"/.test(AGG_SRC) &&
    /file:\s*"test-admin-dashboard\.mjs"/.test(AGG_SRC),
  "Must register admin-dashboard in SUITES so `npm test` includes it"
);

assert(
  "H1 admin-dashboard runs after admin-margin (they share the /admin namespace)",
  /"admin-margin"[\s\S]{0,4000}"admin-dashboard"/.test(AGG_SRC),
  "admin-dashboard should follow admin-margin so the two admin suites sit together at review time"
);

assert(
  "H1 admin-dashboard still runs before dev-hooks",
  /"admin-dashboard"[\s\S]{0,20000}"dev-hooks"/.test(AGG_SRC),
  "dev-hooks must remain last — it's the tooling gate, not a subsystem gate"
);

// =============================================================================
// Report
// =============================================================================

const total = pass + fail;
console.log("");
console.log(`test-admin-dashboard.mjs — ${pass}/${total} assertions passed`);
// Canonical summary line parsed by scripts/run-all-tests.mjs.
console.log(`Admin-dashboard tests: ${pass} passed, ${fail} failed`);
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
