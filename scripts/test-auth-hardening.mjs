#!/usr/bin/env node
/**
 * 2026-05-02 Day 1.5b (plan §8a items 4-8) — auth-hardening invariants.
 *
 * Pure static-parse guard against regressions on five auth-security
 * properties:
 *   1. bcrypt cost factor ≥ 12 in lib/auth-actions.ts:registerAction
 *      (and any other bcrypt.hash call site).
 *   2. registerSchema enforces password strength: ≥ 10 chars + 3 of 4
 *      character classes via countCharClasses.
 *   3. registerAction does NOT confirm email-existence to the client —
 *      duplicate-email error must be the generic phrasing locked in
 *      this commit.
 *   4. auth.ts uses bcrypt.compare (constant-time) for credentials
 *      authorize. Plain-text equality would be a critical bug.
 *   5. No user-enumeration phrasing anywhere in lib/auth-actions.ts
 *      (no "already exists", "user not found", "wrong password",
 *      "incorrect password" — all attacker hints).
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

const AUTH_ACTIONS = fs.readFileSync(path.join(ROOT, "lib", "auth-actions.ts"), "utf8");
const AUTH_TS = fs.readFileSync(path.join(ROOT, "auth.ts"), "utf8");
// 2026-05-12 SEV-0 audit fix — extended scope. Prior version only
// inspected auth-actions.ts + auth.ts, which let password-reset
// (cost 10) and settings password-change (cost 10) drift below the
// signup cost (12) for an extended period. Now covers all auth
// surfaces + the bcrypt-cost.ts source of truth + the two admin
// pages that were leaking namespace existence.
const PASSWORD_RESET = fs.readFileSync(path.join(ROOT, "lib", "password-reset.ts"), "utf8");
const SETTINGS_ACTIONS = fs.readFileSync(path.join(ROOT, "lib", "settings-actions.ts"), "utf8");
const BCRYPT_COST_FILE = fs.readFileSync(path.join(ROOT, "lib", "auth", "bcrypt-cost.ts"), "utf8");
const KILL_SWITCHES_PAGE = fs.readFileSync(path.join(ROOT, "app", "app", "admin", "kill-switches", "page.tsx"), "utf8");
const MARGIN_PAGE = fs.readFileSync(path.join(ROOT, "app", "app", "admin", "margin", "page.tsx"), "utf8");

// ============================================================================
// Section A — bcrypt cost factor (plan §8a item 4)
// ============================================================================

// 2026-05-12 SEV-0 audit fix: A1/A2 were the original "cost factor
// >= 12 in auth-actions.ts" check. Now superseded by Section F's
// cross-file constant check (BCRYPT_COST = 12, all callsites import
// it, no numeric literals anywhere). A1/A2 kept as a redundant
// sanity check that auth-actions.ts still has at least one hash
// call (via the constant) and zero numeric-literal calls.
const HASH_CONST_RE = /bcrypt\.hash\([^,]+,\s*BCRYPT_COST\)/g;
const constHashCalls = [...AUTH_ACTIONS.matchAll(HASH_CONST_RE)];
assert(
  constHashCalls.length >= 1,
  `A1: at least one bcrypt.hash(_, BCRYPT_COST) call in auth-actions.ts (found ${constHashCalls.length})`
);
const HASH_LITERAL_RE = /bcrypt\.hash\([^,]+,\s*(\d+)\)/g;
const literalCalls = [...AUTH_ACTIONS.matchAll(HASH_LITERAL_RE)];
assert(
  literalCalls.length === 0,
  `A2: no bcrypt.hash(_, NUMERIC_LITERAL) in auth-actions.ts (found ${literalCalls.length} — must use BCRYPT_COST)`
);

// ============================================================================
// Section B — Password strength (plan §8a item 5)
// ============================================================================

assert(
  /\.min\(10/.test(AUTH_ACTIONS),
  "B1: password min length is at least 10"
);
assert(
  /countCharClasses/.test(AUTH_ACTIONS),
  "B2: password strength uses countCharClasses helper"
);
assert(
  /countCharClasses\(p\)\s*>=?\s*3/.test(AUTH_ACTIONS),
  "B3: password requires at least 3 of 4 character classes"
);
assert(
  /\[a-z\]/.test(AUTH_ACTIONS),
  "B4: countCharClasses checks lowercase"
);
assert(
  /\[A-Z\]/.test(AUTH_ACTIONS),
  "B5: countCharClasses checks uppercase"
);
assert(
  /\[0-9\]/.test(AUTH_ACTIONS),
  "B6: countCharClasses checks digits"
);
assert(
  /\[\^A-Za-z0-9\]/.test(AUTH_ACTIONS),
  "B7: countCharClasses checks symbols"
);

// ============================================================================
// Section C — No user enumeration (plan §8a item 7)
// ============================================================================

// Only enumeration-style phrases that confirm user existence. Format-
// validation messages like "Enter a valid email" are NOT enumeration —
// they fire on bad syntax regardless of database state.
const ENUM_PATTERNS = [
  /already\s+exists/i,
  /user\s+not\s+found/i,
  /wrong\s+password/i,
  /incorrect\s+password/i,
  /no\s+account.*found/i,
  /email\s+is\s+not\s+registered/i,
  /this\s+email\s+is\s+(?:in\s+use|taken|registered)/i,
];

for (const pat of ENUM_PATTERNS) {
  // We only check error strings (string literals). Comments are
  // stripped first.
  const stripped = AUTH_ACTIONS.replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/gm, "");
  assert(
    !pat.test(stripped),
    `C: lib/auth-actions.ts contains user-enumeration phrase /${pat.source}/`
  );
}

// ============================================================================
// Section D — bcrypt.compare for credentials authorize (plan §8a item 6)
// ============================================================================

assert(
  /bcrypt\.compare\(/m.test(AUTH_TS),
  "D1: auth.ts uses bcrypt.compare for password verification"
);
// Make sure no plain `===` is being used to compare passwords.
assert(
  !/password\s*===/m.test(AUTH_TS),
  "D2: auth.ts does NOT use === to compare passwords"
);

// ============================================================================
// Section E — Schema sanity (plan §8a item 5 alt path)
// ============================================================================

assert(
  /registerSchema\s*=\s*z\.object/m.test(AUTH_ACTIONS),
  "E1: registerSchema present"
);
assert(
  /password:\s*z\s*\n?\s*\.string\(\)/m.test(AUTH_ACTIONS),
  "E2: password field uses z.string()"
);
assert(
  /\.refine\(/m.test(AUTH_ACTIONS),
  "E3: password schema applies a refine() check (the 3-of-4 rule)"
);

// ============================================================================
// Section F — Cross-file bcrypt parity (SEV-0 audit fix 2026-05-12).
// Pins BCRYPT_COST constant at 12 and ensures all three callsites
// import + use it (not a numeric literal).
// ============================================================================

assert(
  /export const BCRYPT_COST\s*=\s*12/.test(BCRYPT_COST_FILE),
  "F1: lib/auth/bcrypt-cost.ts exports BCRYPT_COST = 12"
);
assert(
  /import\s*\{\s*BCRYPT_COST\s*\}\s*from\s*"@\/lib\/auth\/bcrypt-cost"/.test(AUTH_ACTIONS),
  "F2: auth-actions.ts imports BCRYPT_COST"
);
assert(
  /import\s*\{\s*BCRYPT_COST\s*\}\s*from\s*"@\/lib\/auth\/bcrypt-cost"/.test(SETTINGS_ACTIONS),
  "F3: settings-actions.ts imports BCRYPT_COST"
);
assert(
  /import\s*\{\s*BCRYPT_COST\s*\}\s*from\s*"@\/lib\/auth\/bcrypt-cost"/.test(PASSWORD_RESET),
  "F4: password-reset.ts imports BCRYPT_COST"
);
// Every bcrypt.hash() in every auth surface must use the constant,
// not a literal. The numeric-literal pattern (the original SEV-0
// vector) fails this check.
for (const [name, src] of [
  ["auth-actions.ts", AUTH_ACTIONS],
  ["settings-actions.ts", SETTINGS_ACTIONS],
  ["password-reset.ts", PASSWORD_RESET],
]) {
  const literalHashes = [...src.matchAll(/bcrypt\.hash\([^,]+,\s*(\d+)\)/g)];
  assert(
    literalHashes.length === 0,
    `F5.${name}: no bcrypt.hash() call uses a numeric literal (must use BCRYPT_COST)`
  );
  // And at least one BCRYPT_COST usage exists (so we didn't accidentally
  // remove all hashing).
  assert(
    /bcrypt\.hash\([^,]+,\s*BCRYPT_COST\)/.test(src),
    `F6.${name}: at least one bcrypt.hash(_, BCRYPT_COST) call present`
  );
}
// Reset min-length must match signup (>=10), not the historical 8.
assert(
  /newPassword\.length\s*<\s*10/.test(PASSWORD_RESET),
  "F7: password-reset enforces ≥10 char minimum (matches signup at lib/auth-actions.ts:72)"
);
assert(
  !/newPassword\.length\s*<\s*8\b/.test(PASSWORD_RESET),
  "F8: password-reset does NOT use the old ≥8 minimum"
);

// ============================================================================
// Section G — OAuth account-linking flag (SEV-0 audit fix 2026-05-12).
// allowDangerousEmailAccountLinking must be explicitly false, not
// true (the prior setting allowed an attacker to register a
// Credentials account at victim@example.com and have a later
// legitimate Google sign-in merge into the attacker's account).
// ============================================================================

assert(
  /allowDangerousEmailAccountLinking:\s*false/.test(AUTH_TS),
  "G1: Google provider sets allowDangerousEmailAccountLinking to false"
);
assert(
  !/allowDangerousEmailAccountLinking:\s*true/.test(AUTH_TS),
  "G2: Google provider does NOT have allowDangerousEmailAccountLinking: true"
);

// ============================================================================
// Section H — Admin pages do not leak namespace existence
// (SEV-0 audit fix 2026-05-12). The two read-only ops dashboards
// previously rendered "Admin access required" cards for non-admins,
// confirming the surface exists + telling them which env var to ask
// about. Both now notFound() so the page is indistinguishable from
// any non-existent path.
// ============================================================================

for (const [name, src] of [
  ["kill-switches", KILL_SWITCHES_PAGE],
  ["margin", MARGIN_PAGE],
]) {
  assert(
    /import\s*\{\s*notFound\s*\}\s*from\s*"next\/navigation"/.test(src),
    `H1.${name}: imports notFound from next/navigation`
  );
  // The page must call notFound() on the no-admin path. We check for
  // the call inside the `isAdminEmail` guard branch specifically.
  assert(
    /isAdminEmail\([^)]+\)\)\s*\{[\s\S]{0,800}?notFound\(\)/.test(src),
    `H2.${name}: non-admin path calls notFound() (not <NotAuthorised />)`
  );
  // And the no-session path also notFounds (not <NotSignedIn />).
  assert(
    /if\s*\(!email\)\s*\{[\s\S]{0,400}?notFound\(\)/.test(src),
    `H3.${name}: no-session path calls notFound() (not <NotSignedIn />)`
  );
}

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`auth-hardening: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
