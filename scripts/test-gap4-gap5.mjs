#!/usr/bin/env node
/**
 * 2026-05-03 plan §7 + §8 + §9 — post-plan Gap #4 + Gap #5 contract.
 *
 * Static-parse guards that lock in the wins from the Gap #4 + #5 batch
 * so a future refactor can't silently break:
 *
 *   A. /api/account/recent-usage endpoint contract
 *      - auth gate present (delegates to auth())
 *      - 401 on missing session
 *      - 7-day window constant
 *      - top-3 cap constant
 *      - response shape matches what OutOfCreditsAlert expects
 *      - delegates to lib/user/queries:getUsageRollup (credits-only —
 *        the queries helper is the credits-only contract)
 *      - no admin imports leaking (would expose USD micros)
 *
 *   B. OutOfCreditsAlert recap fetch
 *      - useEffect fires on mount with fetch + AbortController
 *      - calls /api/account/recent-usage (NOT a different path)
 *      - hides recap when totalCredits === 0
 *      - hides recap when top.length === 0
 *      - swallows fetch errors silently (no scary banner)
 *      - cleanup aborts pending fetch on unmount
 *      - displayOp helper has the canonical 9 AI ops mapped
 *
 *   C. lib/admin/user-actions.ts contract
 *      - both adminGrantCredits + adminDebitCredits exist + exported
 *      - both call requireAdmin() FIRST (before any DB write)
 *      - both have the 1000-credit fat-finger cap
 *      - both stamp admin email into ledger note for audit trail
 *      - both use second-aligned idempotency key shape
 *      - debit clamps to current balance (no negative balance state)
 *      - reasons are exactly "manual_grant" / "manual_debit"
 *      - error logs structured JSON (admin email, target user, amount)
 *
 *   D. AdminUserActions client component contract
 *      - uses "use client" directive
 *      - uses useTransition for pending state (not just useState)
 *      - imports the server actions from lib/admin/user-actions
 *      - 5s auto-clear on result toast (so messages don't bleed
 *        across user pages)
 *      - debit input disabled when balance === 0
 *
 *   E. /admin/users/[id]/page.tsx integration
 *      - mounts AdminUserActions BEFORE the abuse-signal panel
 *        (admins reviewing a flagged account can claw back without
 *        scrolling — discovered during Gap #5 placement decision)
 *      - passes targetUserId + currentBalance props
 *
 * Output line conforms to the aggregator regex
 * `${name}: ${pass} passed, ${fail} failed`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
  }
}

const RECENT_USAGE_ROUTE = path.join(
  ROOT,
  "app",
  "api",
  "account",
  "recent-usage",
  "route.ts"
);
const ALERT_COMPONENT = path.join(
  ROOT,
  "components",
  "upsell",
  "OutOfCreditsAlert.tsx"
);
const ADMIN_ACTIONS_LIB = path.join(
  ROOT,
  "lib",
  "admin",
  "user-actions.ts"
);
const ADMIN_ACTIONS_CLIENT = path.join(
  ROOT,
  "components",
  "admin",
  "AdminUserActions.tsx"
);
const ADMIN_USER_PAGE = path.join(
  ROOT,
  "app",
  "admin",
  "users",
  "[id]",
  "page.tsx"
);

// ============================================================================
// Section A — /api/account/recent-usage endpoint
// ============================================================================

assert(
  fs.existsSync(RECENT_USAGE_ROUTE),
  "A0: /api/account/recent-usage/route.ts exists"
);
const usageRouteSrc = fs.readFileSync(RECENT_USAGE_ROUTE, "utf8");

assert(
  /import\s*\{\s*auth\s*\}\s*from\s*["']@\/auth["']/.test(usageRouteSrc),
  "A1: imports auth() — endpoint is gated"
);
assert(
  /\bauth\(\)/.test(usageRouteSrc) &&
    /401/.test(usageRouteSrc) &&
    /auth_required/.test(usageRouteSrc),
  "A2: returns 401 with error:'auth_required' when session is missing"
);
assert(
  /WINDOW_DAYS\s*=\s*7\b/.test(usageRouteSrc),
  "A3: window is 7 days (Plan §9 specifies 'last 7 days you used')"
);
assert(
  /TOP_N\s*=\s*3\b/.test(usageRouteSrc),
  "A4: top-3 cap (alert visual budget — anyone using 4+ tools is already a power user)"
);
assert(
  /import\s*\{\s*getUsageRollup\s*\}\s*from\s*["']@\/lib\/user\/queries["']/.test(
    usageRouteSrc
  ),
  "A5: delegates to lib/user/queries:getUsageRollup (the credits-only contract — admin queries module would leak USD micros)"
);
assert(
  !/lib\/admin\//.test(usageRouteSrc),
  "A6: NO imports from lib/admin/* (would expose cost_micros / netRevenue / margin to user surface)"
);
assert(
  /totalCredits/.test(usageRouteSrc) &&
    /\btop\b/.test(usageRouteSrc) &&
    /\bdays\b/.test(usageRouteSrc),
  "A7: response shape exposes { totalCredits, days, top } — matches OutOfCreditsAlert expectations"
);
assert(
  /op:\s*r\.operation/.test(usageRouteSrc) &&
    /credits:\s*r\.creditsSpent/.test(usageRouteSrc) &&
    /calls:\s*r\.calls/.test(usageRouteSrc),
  "A8: each top[] row has { op, credits, calls } — does NOT leak cost_micros / margin"
);
assert(
  /export\s+const\s+runtime\s*=\s*["']nodejs["']/.test(usageRouteSrc),
  "A9: nodejs runtime (db driver requires it)"
);

// ============================================================================
// Section B — OutOfCreditsAlert recap fetch
// ============================================================================

const alertSrc = fs.readFileSync(ALERT_COMPONENT, "utf8");

assert(
  /useEffect/.test(alertSrc) && /useState/.test(alertSrc),
  "B1: uses useEffect + useState (recap is client-side soft-load)"
);
assert(
  /fetch\(\s*["']\/api\/account\/recent-usage["']/.test(alertSrc),
  "B2: fetches the EXACT canonical path /api/account/recent-usage (not a typo'd variant)"
);
assert(
  /AbortController/.test(alertSrc) && /\.abort\(\)/.test(alertSrc),
  "B3: uses AbortController + cleanup (prevents setState-after-unmount warning)"
);
assert(
  /data\.totalCredits\s*>\s*0/.test(alertSrc) &&
    /data\.top\.length\s*>\s*0/.test(alertSrc),
  "B4: hides recap when totalCredits=0 OR top is empty (don't condescend to brand-new signups)"
);
// The catch block must be present and EMPTY (just a comment) — silent
// soft-fail, never a scary "analytics failed" banner.
assert(
  /\.catch\(\(\)\s*=>\s*\{[^}]*\}\s*\)/.test(alertSrc),
  "B5: catch block swallows fetch failures silently (no banner)"
);
// Verify the displayOp helper has the canonical 9 AI ops.
const REQUIRED_OPS = [
  "summarize",
  "rewrite",
  "table",
  "compare",
  "generate",
  "translate",
  "ocr",
  "redact",
  "sign",
];
for (const op of REQUIRED_OPS) {
  assert(
    new RegExp(`${op}:\\s*["']`).test(alertSrc),
    `B6.${op}: OP_DISPLAY_NAMES has "${op}" (recap line uses it)`
  );
}
assert(
  /recap\s*&&\s*\(/.test(alertSrc),
  "B7: recap rendered conditionally (null state hides the section entirely)"
);

// ============================================================================
// Section C — lib/admin/user-actions.ts
// ============================================================================

assert(
  fs.existsSync(ADMIN_ACTIONS_LIB),
  "C0: lib/admin/user-actions.ts exists"
);
const adminLibSrc = fs.readFileSync(ADMIN_ACTIONS_LIB, "utf8");

assert(
  /^"use server"/.test(adminLibSrc),
  "C1: 'use server' directive at top (server action module)"
);
assert(
  /import\s+["']server-only["']/.test(adminLibSrc),
  "C2: server-only import (prevents accidental client bundle)"
);
assert(
  /export\s+async\s+function\s+adminGrantCredits/.test(adminLibSrc),
  "C3: adminGrantCredits exported"
);
assert(
  /export\s+async\s+function\s+adminDebitCredits/.test(adminLibSrc),
  "C4: adminDebitCredits exported"
);
assert(
  /import\s*\{\s*requireAdmin\s*\}/.test(adminLibSrc),
  "C5: imports requireAdmin from lib/admin/guard"
);
// Both functions MUST call requireAdmin() FIRST, before any DB work.
// Look for "const admin = await requireAdmin()" appearing twice (one per fn).
const requireAdminCount = (
  adminLibSrc.match(/const\s+admin\s*=\s*await\s+requireAdmin\(\)/g) ?? []
).length;
assert(
  requireAdminCount === 2,
  `C6: BOTH adminGrantCredits + adminDebitCredits call requireAdmin() FIRST (got ${requireAdminCount} call sites; expected 2)`
);
assert(
  /MAX_ABS_AMOUNT\s*=\s*1000\b/.test(adminLibSrc),
  "C7: 1000-credit fat-finger cap (catches typing extra digit)"
);
assert(
  /\[admin:\s*\$\{admin\.email\}\]/.test(adminLibSrc),
  "C8: admin email stamped into ledger note for audit trail"
);
// Idempotency key shape: admin_${grant|debit}:${userId}:${tsKey}
assert(
  /admin_grant:\$\{input\.targetUserId\}:\$\{tsKey\}/.test(adminLibSrc),
  "C9a: grant idempotency key shape: admin_grant:userId:tsKey"
);
assert(
  /admin_debit:\$\{input\.targetUserId\}:\$\{tsKey\}/.test(adminLibSrc),
  "C9b: debit idempotency key shape: admin_debit:userId:tsKey"
);
assert(
  /Math\.floor\(Date\.now\(\)\s*\/\s*1000\)/.test(adminLibSrc),
  "C9c: tsKey is second-aligned (spam-clicks within 1s collide; 2s+ retries make separate rows)"
);
// Debit clamps to balance.
assert(
  /Math\.min\(amount,\s*currentBalance\)/.test(adminLibSrc),
  "C10: debit clamps to current balance (refuses to push below 0)"
);
assert(
  /reason:\s*["']manual_grant["']/.test(adminLibSrc),
  "C11a: grant reason is exactly 'manual_grant' (matches humanizeLedgerReason map)"
);
assert(
  /reason:\s*["']manual_debit["']/.test(adminLibSrc),
  "C11b: debit reason is exactly 'manual_debit'"
);
// Error path logs structured JSON.
assert(
  /event:\s*["']admin_grant_failed["']/.test(adminLibSrc),
  "C12a: grant failure logs event:'admin_grant_failed'"
);
assert(
  /event:\s*["']admin_debit_failed["']/.test(adminLibSrc),
  "C12b: debit failure logs event:'admin_debit_failed'"
);
// revalidatePath call refreshes the admin user page after a successful grant/debit.
assert(
  /revalidatePath\(`\/admin\/users\/\$\{input\.targetUserId\}`\)/.test(
    adminLibSrc
  ),
  "C13: revalidatePath after successful grant/debit (so the ledger panel updates immediately)"
);

// ============================================================================
// Section D — AdminUserActions client component
// ============================================================================

assert(
  fs.existsSync(ADMIN_ACTIONS_CLIENT),
  "D0: components/admin/AdminUserActions.tsx exists"
);
const adminClientSrc = fs.readFileSync(ADMIN_ACTIONS_CLIENT, "utf8");

assert(
  /^"use client"/.test(adminClientSrc),
  "D1: 'use client' directive at top"
);
assert(
  /useTransition/.test(adminClientSrc),
  "D2: uses useTransition (canonical Next 14 pattern for server-action loading state)"
);
assert(
  /import\s*\{[^}]*adminGrantCredits[^}]*adminDebitCredits[^}]*\}\s*from\s*["']@\/lib\/admin\/user-actions["']/.test(
    adminClientSrc
  ) ||
    (/adminGrantCredits/.test(adminClientSrc) &&
      /adminDebitCredits/.test(adminClientSrc) &&
      /from\s*["']@\/lib\/admin\/user-actions["']/.test(adminClientSrc)),
  "D3: imports BOTH server actions from canonical path"
);
assert(
  /setTimeout\(\(\)\s*=>\s*setResult\(null\),\s*5000\)/.test(adminClientSrc),
  "D4: 5s auto-clear on result toast (prevents stale messages bleeding across user pages)"
);
// Debit input is disabled when balance = 0.
assert(
  /currentBalance\s*===\s*0/.test(adminClientSrc),
  "D5: debit input disables when currentBalance === 0"
);
// max attribute syntax flex — accept both the simple form
//   max={Math.min(1000, currentBalance)}
// and the defensive form
//   max={Math.min(1000, Math.max(currentBalance, 1))}
// (the defensive form prevents max=0 which makes the input always
// invalid even when disabled; cosmetic but matters for screen readers).
assert(
  /max=\{Math\.min\(1000,\s*(?:Math\.max\(\s*)?currentBalance/.test(
    adminClientSrc
  ),
  "D6: debit max attribute clamps to Math.min(1000, currentBalance) — defensive Math.max wrapper allowed"
);

// ============================================================================
// Section E — /admin/users/[id]/page.tsx mount
// ============================================================================

assert(
  fs.existsSync(ADMIN_USER_PAGE),
  "E0: /admin/users/[id]/page.tsx exists"
);
const userPageSrc = fs.readFileSync(ADMIN_USER_PAGE, "utf8");

assert(
  /import\s*\{\s*AdminUserActions\s*\}\s*from\s*["']@\/components\/admin\/AdminUserActions["']/.test(
    userPageSrc
  ),
  "E1: imports AdminUserActions from canonical path"
);
assert(
  /<AdminUserActions[\s\S]*?targetUserId=\{params\.id\}[\s\S]*?currentBalance=\{[^}]+\}/.test(
    userPageSrc
  ),
  "E2: passes targetUserId={params.id} + currentBalance props"
);
// Critical placement invariant: AdminUserActions BEFORE the
// "Abuse signals" SectionTitle. Admins reviewing a flagged account
// can claw back without scrolling.
const adminActionsIdx = userPageSrc.search(/<AdminUserActions/);
const abuseSignalsIdx = userPageSrc.search(/<SectionTitle>Abuse signals/);
assert(
  adminActionsIdx > 0 && abuseSignalsIdx > 0 && adminActionsIdx < abuseSignalsIdx,
  "E3: AdminUserActions mounted BEFORE Abuse signals section (placement matters — admins reviewing flagged accounts shouldn't have to scroll past flagged-account signals to claw back)"
);

// ============================================================================
// Output
// ============================================================================

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`gap4-gap5: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
