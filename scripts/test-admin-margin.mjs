#!/usr/bin/env node
// Self-contained test harness for Task #22's read-side — the
// /api/admin/margin endpoint and its supporting helpers in
// lib/ai/margin-rollup.ts. Mirrors scripts/test-ai-margin-rollup.mjs:
// plain Node assertions, static greps, no DB, no live TS import.
//
// Why a second margin suite? The first one (ai-margin-rollup) pins the
// WRITE path (cron + lib/ai/margin-rollup.ts core). This one pins the
// READ path (admin dashboard endpoint + the admin-auth helpers + the
// per-day aggregate shape). They fail independently so a regression
// in either side surfaces at the right granularity — "admin-margin"
// vs "ai-margin-rollup" tells you whether the cron broke or the
// dashboard broke.
//
// What this covers:
//   SECTION A — route file exists at app/api/admin/margin/route.ts with
//               the expected runtime directives (force-dynamic, nodejs)
//               and imports NextAuth `auth` + the rollup helpers.
//   SECTION B — auth guard semantics: calls auth(), reads session email,
//               401 on anonymous, 403 on non-admin, references
//               process.env.ADMIN_EMAILS (not a hard-coded allowlist),
//               502 on DB failure (matches /api/ai/* posture).
//   SECTION C — clampAdminDays pure-function contract: bounds at [1, 90],
//               default 14, non-integer → default, null/empty → default.
//               Pinned by branch greps (harness-wide pattern).
//   SECTION D — parseAdminEmails pure-function contract: founder-email
//               fallback on empty, lowercase normalisation, trim, comma
//               split, `@` presence filter.
//   SECTION E — isAdminEmail: null/undefined → false, delegates to
//               parseAdminEmails for the set membership check.
//   SECTION F — library admin-surface exports: ADMIN_MARGIN_MAX_DAYS=90,
//               ADMIN_MARGIN_DEFAULT_DAYS=14, the three admin types, and
//               getAdminMarginSummary returning currentStreakDays,
//               gate7Reached, floorBpsByOp, recentRedSlices, range.
//   SECTION G — run-all-tests.mjs aggregator lists admin-margin right
//               after ai-margin-rollup (they form a write/read pair).
//   SECTION H — docs/DEPLOYMENT_NOTES.md documents the ADMIN_EMAILS
//               env var so an ops handover doesn't lock future admins
//               out of the dashboard.
//
// Run: `node scripts/test-admin-margin.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const ROUTE_PATH = resolve(
  ROOT,
  "app",
  "api",
  "admin",
  "margin",
  "route.ts"
);
const ROLLUP_PATH = resolve(ROOT, "lib", "ai", "margin-rollup.ts");
const AGGREGATOR_PATH = resolve(ROOT, "scripts", "run-all-tests.mjs");
const DEPLOY_NOTES_PATH = resolve(ROOT, "docs", "DEPLOYMENT_NOTES.md");

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

// Fail-fast on missing files with clear errors (rather than a fleet of
// "source missing" assertion failures later).
for (const p of [ROUTE_PATH, ROLLUP_PATH, AGGREGATOR_PATH, DEPLOY_NOTES_PATH]) {
  if (!existsSync(p)) {
    console.error(`FATAL: required source file missing: ${p}`);
    process.exit(1);
  }
}

const ROUTE_SRC = readFileSync(ROUTE_PATH, "utf8");
const ROLLUP_SRC = readFileSync(ROLLUP_PATH, "utf8");
const AGG_SRC = readFileSync(AGGREGATOR_PATH, "utf8");
const DEPLOY_SRC = readFileSync(DEPLOY_NOTES_PATH, "utf8");

// Page-layer surface shipped in the follow-up bundle. Same feature
// (admin-margin), distinct file — the page is how a logged-in admin
// reads the JSON endpoint through a browser. Reading it here keeps
// the whole admin-margin regression surface in one test file so a
// failure in either route or page lines up with the same suite.
const PAGE_PATH = resolve(ROOT, "app", "app", "admin", "margin", "page.tsx");
if (!existsSync(PAGE_PATH)) {
  console.error(`FATAL: required source file missing: ${PAGE_PATH}`);
  process.exit(1);
}
const PAGE_SRC = readFileSync(PAGE_PATH, "utf8");

// =============================================================================
// SECTION A: route file shape
// =============================================================================

assert(
  "A1 route exports a GET handler",
  /export\s+async\s+function\s+GET\s*\(/.test(ROUTE_SRC),
  "Expected `export async function GET(` in route.ts"
);

assert(
  "A1 route pins force-dynamic (never static)",
  /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(ROUTE_SRC),
  "Admin endpoint must be `force-dynamic` — 'yesterday UTC' would freeze at build time otherwise"
);

assert(
  "A1 route pins nodejs runtime (mysql2 is node-only)",
  /export\s+const\s+runtime\s*=\s*"nodejs"/.test(ROUTE_SRC),
  "Drizzle + mysql2 require the nodejs runtime — edge would crash at request time"
);

assert(
  "A1 route imports NextAuth auth()",
  /import\s+\{\s*auth\s*\}\s+from\s+"@\/auth"/.test(ROUTE_SRC),
  "Route must import `auth` from @/auth to resolve the session"
);

assert(
  "A1 route imports the three admin helpers",
  /import\s+\{[^}]*\bclampAdminDays\b[^}]*\}\s+from\s+"@\/lib\/ai\/margin-rollup"/.test(
    ROUTE_SRC
  ) &&
    /\bgetAdminMarginSummary\b/.test(ROUTE_SRC) &&
    /\bisAdminEmail\b/.test(ROUTE_SRC),
  "Route must import clampAdminDays, getAdminMarginSummary, isAdminEmail"
);

assert(
  "A1 route uses 'server-only' (keeps helpers off the client bundle)",
  /import\s+"server-only"/.test(ROUTE_SRC),
  "Missing 'server-only' import"
);

// =============================================================================
// SECTION B: auth guard semantics
// =============================================================================

assert(
  "B1 route calls auth() to resolve session",
  /const\s+session\s*=\s*await\s+auth\(\)/.test(ROUTE_SRC),
  "Must call `await auth()` at the start of GET"
);

assert(
  "B1 route reads email from session.user",
  /session\?\.\s*user[\s\S]{0,200}\.email/.test(ROUTE_SRC),
  "Must read the email off session.user — NextAuth default"
);

assert(
  "B1 anonymous request returns 401 not_authenticated",
  /json\(\s*401\s*,[\s\S]{0,80}not_authenticated/.test(ROUTE_SRC),
  "Missing 401 not_authenticated branch for anonymous caller"
);

assert(
  "B1 non-admin request returns 403 forbidden (not 404)",
  /json\(\s*403\s*,[\s\S]{0,80}forbidden/.test(ROUTE_SRC),
  "Missing 403 forbidden branch — UI needs to distinguish signed-in-as-non-admin from unknown endpoint"
);

assert(
  "B1 admin allowlist sourced from process.env.ADMIN_EMAILS",
  /isAdminEmail\s*\(\s*email\s*,\s*process\.env\.ADMIN_EMAILS\s*\)/.test(
    ROUTE_SRC
  ),
  "Route must pass process.env.ADMIN_EMAILS into isAdminEmail — no hard-coded allowlist"
);

assert(
  "B1 DB read errors surface as 502 (not 500)",
  /json\(\s*502\s*,[\s\S]{0,80}rollup_read_failed/.test(ROUTE_SRC),
  "Missing 502 rollup_read_failed branch — matches /api/ai/* upstream-error posture"
);

assert(
  "B1 query param parsed via clampAdminDays(url.searchParams.get('days'))",
  /clampAdminDays\s*\(\s*url\.searchParams\.get\(\s*"days"\s*\)\s*\)/.test(
    ROUTE_SRC
  ),
  "Must clamp user-supplied ?days= before passing to the rollup helper"
);

// =============================================================================
// SECTION C: clampAdminDays pure-function contract
// =============================================================================

assert(
  "C1 clampAdminDays is exported from the library",
  /export\s+function\s+clampAdminDays\s*\(/.test(ROLLUP_SRC),
  "`export function clampAdminDays` missing"
);

assert(
  "C1 clampAdminDays returns default on null/undefined/empty",
  /if\s*\(\s*raw\s*===\s*null\s*\|\|\s*raw\s*===\s*undefined\s*\|\|\s*raw\s*===\s*""\s*\)[\s\S]{0,80}return\s+ADMIN_MARGIN_DEFAULT_DAYS/.test(
    ROLLUP_SRC
  ),
  "Missing null/undefined/empty → default branch in clampAdminDays"
);

assert(
  "C1 clampAdminDays falls back to default on non-integers",
  /if\s*\(\s*!Number\.isFinite\(\s*n\s*\)\s*\|\|\s*!Number\.isInteger\(\s*n\s*\)\s*\)[\s\S]{0,80}return\s+ADMIN_MARGIN_DEFAULT_DAYS/.test(
    ROLLUP_SRC
  ),
  "Non-integer input must fall back to default — otherwise `?days=3.5` would silently accept"
);

assert(
  "C1 clampAdminDays floors to 1 (no zero-day requests)",
  /if\s*\(\s*n\s*<\s*1\s*\)\s*return\s+1/.test(ROLLUP_SRC),
  "Lower clamp missing — `?days=0` would return empty window without clamp"
);

assert(
  "C1 clampAdminDays ceils at ADMIN_MARGIN_MAX_DAYS",
  /if\s*\(\s*n\s*>\s*ADMIN_MARGIN_MAX_DAYS\s*\)\s*return\s+ADMIN_MARGIN_MAX_DAYS/.test(
    ROLLUP_SRC
  ),
  "Upper clamp missing — `?days=9999` could trigger an unindexed scan"
);

// =============================================================================
// SECTION D: parseAdminEmails pure-function contract
// =============================================================================

assert(
  "D1 parseAdminEmails is exported from the library",
  /export\s+function\s+parseAdminEmails\s*\(/.test(ROLLUP_SRC),
  "`export function parseAdminEmails` missing"
);

assert(
  "D1 parseAdminEmails defaults to founder email on empty",
  /FOUNDER_FALLBACK\s*=\s*"rajasekarjavaee@gmail\.com"/.test(ROLLUP_SRC),
  "Founder-email fallback missing — fresh deploy without ADMIN_EMAILS env var would lock admin out"
);

assert(
  "D1 parseAdminEmails returns founder on unset/empty raw",
  /if\s*\(\s*!raw\s*\|\|\s*!raw\.trim\(\)\s*\)\s*return\s+new\s+Set\(\s*\[\s*FOUNDER_FALLBACK/.test(
    ROLLUP_SRC
  ),
  "Missing `if (!raw || !raw.trim()) return new Set([FOUNDER_FALLBACK])` branch"
);

assert(
  "D1 parseAdminEmails lowercase-normalises entries",
  /\.map\(\s*\(s\)\s*=>\s*s\.trim\(\)\.toLowerCase\(\)\s*\)/.test(ROLLUP_SRC),
  "Must lowercase emails — case-insensitive comparison is the whole point"
);

assert(
  "D1 parseAdminEmails filters entries without '@'",
  /\.filter\(\s*\(s\)\s*=>\s*s\.length\s*>\s*0\s*&&\s*s\.includes\(\s*"@"\s*\)\s*\)/.test(
    ROLLUP_SRC
  ),
  "Must reject garbage entries — env var typos shouldn't silently grant or deny admin access"
);

assert(
  "D1 parseAdminEmails returns founder fallback when filter empties the list",
  /if\s*\(\s*emails\.length\s*===\s*0\s*\)\s*return\s+new\s+Set\(\s*\[\s*FOUNDER_FALLBACK/.test(
    ROLLUP_SRC
  ),
  "If every entry was filtered out as garbage, the caller should still be able to reach the dashboard as founder"
);

// =============================================================================
// SECTION E: isAdminEmail
// =============================================================================

assert(
  "E1 isAdminEmail is exported from the library",
  /export\s+function\s+isAdminEmail\s*\(/.test(ROLLUP_SRC),
  "`export function isAdminEmail` missing"
);

assert(
  "E1 isAdminEmail returns false on missing email",
  /if\s*\(\s*!email\s*\)\s*return\s+false/.test(ROLLUP_SRC),
  "null/undefined email must short-circuit to false before hitting the set"
);

assert(
  "E1 isAdminEmail delegates to parseAdminEmails",
  /return\s+parseAdminEmails\(\s*raw\s*\)\.has\(\s*email\.toLowerCase\(\)\s*\)/.test(
    ROLLUP_SRC
  ),
  "Set membership check must go through parseAdminEmails so parse semantics stay centralised"
);

// =============================================================================
// SECTION F: library admin-surface exports
// =============================================================================

assert(
  "F1 ADMIN_MARGIN_MAX_DAYS = 90",
  /export\s+const\s+ADMIN_MARGIN_MAX_DAYS\s*=\s*90\b/.test(ROLLUP_SRC),
  "Ceiling must be 90 days (one quarter) — matches computeGreenStreak's maxDays"
);

assert(
  "F1 ADMIN_MARGIN_DEFAULT_DAYS = 14",
  /export\s+const\s+ADMIN_MARGIN_DEFAULT_DAYS\s*=\s*14\b/.test(ROLLUP_SRC),
  "Default must be 14 — two weeks is enough to visually confirm the 7-day streak"
);

for (const t of [
  "AdminMarginDaySummary",
  "AdminMarginRedSlice",
  "AdminMarginSummary",
]) {
  assert(
    `F1 library exports type ${t}`,
    new RegExp(`export\\s+type\\s+${t}\\b`).test(ROLLUP_SRC),
    `Type ${t} must be exported so the route can annotate its response`
  );
}

assert(
  "F1 getAdminMarginSummary exported as async function",
  /export\s+async\s+function\s+getAdminMarginSummary\s*\(/.test(ROLLUP_SRC),
  "`export async function getAdminMarginSummary` missing"
);

assert(
  "F1 summary return shape includes currentStreakDays",
  /currentStreakDays\s*,/.test(ROLLUP_SRC),
  "Summary must carry currentStreakDays so the UI can render the gate #7 indicator without a second round-trip"
);

assert(
  "F1 summary return shape includes gate7Reached boolean",
  /gate7Reached:\s*currentStreakDays\s*>=\s*7/.test(ROLLUP_SRC),
  "gate7Reached must be derived from currentStreakDays — UI shouldn't re-derive the threshold"
);

assert(
  "F1 summary return shape includes floorBpsByOp",
  /floorBpsByOp:\s*\{\s*\.\.\.OP_MARGIN_FLOOR_BPS\s*\}/.test(ROLLUP_SRC),
  "Dashboard needs the per-op floor table to draw the red zone on the bar chart"
);

assert(
  "F1 summary return shape includes recentRedSlices",
  /recentRedSlices,/.test(ROLLUP_SRC),
  "Summary must include recentRedSlices so the dashboard can show which slices tripped the floor"
);

assert(
  "F1 summary computes currentStreakDays via computeGreenStreak",
  /computeGreenStreak\(\s*\{\s*throughDate:\s*toStr\s*\}\s*\)/.test(ROLLUP_SRC),
  "Must call computeGreenStreak — dashboard and cron have to agree on what 'consecutive' means"
);

assert(
  "F1 summary reuses utcDayStart for window boundaries",
  /utcDayStart\(\s*yesterday\s*\)\.getTime\(\)\s*-\s*\(\s*days\s*-\s*1\s*\)\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(
    ROLLUP_SRC
  ),
  "Window start must be (days - 1) * 86400000 ms before yesterday UTC midnight"
);

assert(
  "F1 getAdminMarginSummary filters red slices with isGreen = 0",
  /eq\(\s*schema\.aiDailyMargin\.isGreen\s*,\s*0\s*\)/.test(ROLLUP_SRC),
  "Red-slice query must filter on isGreen = 0 (not marginBps < floorBps) to stay consistent with the cron"
);

assert(
  "F1 getAdminMarginSummary caps redSliceLimit to [1, 50]",
  /Math\.max\(\s*1\s*,\s*Math\.min\(\s*opts\.redSliceLimit\s*\?\?\s*10\s*,\s*50\s*\)\s*\)/.test(
    ROLLUP_SRC
  ),
  "redSliceLimit must clamp — an unbounded LIMIT on a composite-indexed scan can still hit unplanned rows"
);

// =============================================================================
// SECTION G: aggregator wiring
// =============================================================================

assert(
  "G1 aggregator registers an admin-margin suite",
  /name:\s*"admin-margin"/.test(AGG_SRC) &&
    /file:\s*"test-admin-margin\.mjs"/.test(AGG_SRC),
  "Must register admin-margin in SUITES so `npm test` includes it"
);

assert(
  "G1 admin-margin suite runs right after ai-margin-rollup",
  /"ai-margin-rollup"[\s\S]{0,2000}"admin-margin"/.test(AGG_SRC),
  "admin-margin should follow ai-margin-rollup — they pin the same subsystem's write/read sides"
);

assert(
  "G1 admin-margin suite still runs before dev-hooks",
  /"admin-margin"[\s\S]{0,3000}"dev-hooks"/.test(AGG_SRC),
  "dev-hooks must remain last — it's the tooling gate, not a subsystem gate"
);

// =============================================================================
// SECTION H: deploy-notes documentation
// =============================================================================

assert(
  "H1 docs/DEPLOYMENT_NOTES.md documents ADMIN_EMAILS",
  /ADMIN_EMAILS/.test(DEPLOY_SRC),
  "ADMIN_EMAILS env var must be listed in DEPLOYMENT_NOTES.md so ops can add admins without reading source"
);

// =============================================================================
// SECTION I: page-layer shape (app/app/admin/margin/page.tsx)
// =============================================================================
//
// The page is a server React component that consumes the same helpers
// as the route. These asserts pin the pieces that matter for the
// runtime contract — not the cosmetic details (column order, inline
// styles) — so a future UI polish pass doesn't churn this harness.

assert(
  "I1 page lives under /app/admin/margin (inherits middleware+layout auth gate)",
  /app[\/\\]app[\/\\]admin[\/\\]margin[\/\\]page\.tsx$/.test(PAGE_PATH),
  "Path must be app/app/admin/margin/page.tsx so NextAuth /app/* gate applies"
);

assert(
  "I1 page pins force-dynamic (same as route — no build-time freeze)",
  /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(PAGE_SRC),
  "Page must be force-dynamic; yesterday-UTC semantics would freeze at build time"
);

assert(
  "I1 page pins nodejs runtime",
  /export\s+const\s+runtime\s*=\s*"nodejs"/.test(PAGE_SRC),
  "Drizzle+mysql2 require nodejs runtime"
);

assert(
  "I1 page metadata sets robots noindex + nofollow",
  /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/.test(PAGE_SRC),
  "Admin surface must not be indexed — belt-and-braces even though robots.txt disallows /app/*"
);

assert(
  "I1 page imports auth() from @/auth",
  /import\s+\{\s*auth\s*\}\s+from\s+"@\/auth"/.test(PAGE_SRC),
  "Page must import auth() to resolve the session"
);

assert(
  "I1 page imports the admin helpers + types",
  /import\s+\{[\s\S]{0,400}\bisAdminEmail\b[\s\S]{0,400}\}\s+from\s+"@\/lib\/ai\/margin-rollup"/.test(
    PAGE_SRC
  ) &&
    /\bgetAdminMarginSummary\b/.test(PAGE_SRC) &&
    /\bclampAdminDays\b/.test(PAGE_SRC),
  "Page must import isAdminEmail, getAdminMarginSummary, clampAdminDays"
);

assert(
  "I1 page reads admin allowlist from process.env.ADMIN_EMAILS",
  /isAdminEmail\s*\(\s*email\s*,\s*process\.env\.ADMIN_EMAILS\s*\)/.test(PAGE_SRC),
  "Allowlist must come from env — no hard-coded emails"
);

assert(
  "I1 page has an unauthenticated branch (NotSignedIn)",
  /NotSignedIn/.test(PAGE_SRC) && /if\s*\(\s*!email\s*\)/.test(PAGE_SRC),
  "Page must render a friendly no-session card (middleware usually catches this but belt-and-braces)"
);

assert(
  "I1 page has a not-admin branch (NotAuthorised)",
  /NotAuthorised/.test(PAGE_SRC) &&
    /if\s*\(\s*!isAdminEmail\s*\(/.test(PAGE_SRC),
  "Page must render a 'you're signed in but not admin' card on allowlist miss"
);

assert(
  "I1 page reads days from searchParams",
  /searchParams\?\.\s*days/.test(PAGE_SRC) &&
    /clampAdminDays\s*\(\s*searchParams\?\.\s*days/.test(PAGE_SRC),
  "Page must take ?days= off searchParams and clamp it like the route"
);

assert(
  "I1 page shows day-preset selector linking back with ?days=<N>",
  /\/app\/admin\/margin\?days=/.test(PAGE_SRC),
  "Day selector must link to the same path with ?days= preserved"
);

assert(
  "I1 page surfaces gate #7 status from summary.gate7Reached",
  /summary\.gate7Reached/.test(PAGE_SRC) &&
    /Gate\s*#7/.test(PAGE_SRC),
  "UI must make the gate #7 state obvious at a glance"
);

assert(
  "I1 page surfaces current green streak from summary.currentStreakDays",
  /summary\.currentStreakDays/.test(PAGE_SRC),
  "UI must show the current streak — it's the headline Task #22 metric"
);

assert(
  "I1 page renders per-day table (days.map)",
  /summary\.days[\s\S]{0,200}\.map\s*\(/.test(PAGE_SRC) ||
    /days\s*=\s*\{summary\.days\}/.test(PAGE_SRC),
  "Per-day table must iterate summary.days"
);

assert(
  "I1 page renders red-slice table (recentRedSlices.map)",
  /summary\.recentRedSlices[\s\S]{0,200}\.map\s*\(/.test(PAGE_SRC) ||
    /slices\s*=\s*\{summary\.recentRedSlices\}/.test(PAGE_SRC),
  "Red-slice table must iterate summary.recentRedSlices"
);

assert(
  "I1 page references floorBpsByOp for the floor reference block",
  /summary\.floorBpsByOp/.test(PAGE_SRC),
  "Floor reference table must come from summary.floorBpsByOp"
);

assert(
  "I1 page uses the existing CSS-var design system (--bg-1 / --fg-muted)",
  /var\(--bg-1\)/.test(PAGE_SRC) && /var\(--fg-muted\)/.test(PAGE_SRC),
  "Page must match existing /app pages' theme tokens (no Tailwind, no new CSS)"
);

assert(
  "I1 page is NOT linked from AppShell sidebar (ops-only surface)",
  /NAV/.test(readFileSync(resolve(ROOT, "components", "app", "AppShell.tsx"), "utf8")) &&
    !/admin[\/\\]margin/.test(
      readFileSync(resolve(ROOT, "components", "app", "AppShell.tsx"), "utf8")
    ),
  "Admin-margin page must not appear in the product sidebar — discovery by direct URL only"
);

// =============================================================================
// Report
// =============================================================================

const total = pass + fail;
console.log("");
console.log(`test-admin-margin.mjs — ${pass}/${total} assertions passed`);
// Canonical summary line — parsed by scripts/run-all-tests.mjs.
console.log(`Admin-margin tests: ${pass} passed, ${fail} failed`);
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
