#!/usr/bin/env node
/**
 * 2026-05-01 — auth-callback preservation guard.
 *
 * Background: until this commit, the auth funnel had a sitewide bug
 * where every layer hardcoded /app/dashboard as the post-sign-in
 * destination, ignoring any callback context the visitor arrived
 * with. The fix has four parts:
 *
 *   1. lib/auth-callback.ts — sanitizeCallbackUrl() validates an
 *      origin-relative URL (rejects schema-relative, protocol-prefixed,
 *      /api/*, /login, /register, and anything over 512 chars).
 *   2. LoginForm + RegisterForm read ?callbackUrl= from the URL,
 *      pass it to signIn("google", { callbackUrl }), and propagate
 *      to credentials sign-in via a hidden form input.
 *   3. loginAction + registerAction read formData.get("callbackUrl"),
 *      sanitize server-side as defense-in-depth, use as redirectTo.
 *   4. Every /app/* page-level auth gate calls
 *      redirect(`/login?callbackUrl=${encodeURIComponent("/app/...")}`)
 *      so anonymous users return to where they intended after auth.
 *
 * What this guard catches:
 *
 *   • A new /app/* page added without a callback-preserving redirect
 *     (would silently regress to "land everyone on dashboard")
 *   • A future `signIn("google", { callbackUrl: "/some/hardcoded" })`
 *     that bypasses the URL-param read
 *   • The credentials actions losing their callbackUrl form-data read
 *   • The hidden callbackUrl input being deleted from either form
 *
 * Approach: pure static parse (sub-second, no runtime needed).
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

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ---------------------------------------------------------------------
// Section A — sanitizer module exists and exports the contract.
// ---------------------------------------------------------------------

const SANITIZER_PATH = "lib/auth-callback.ts";
assert(
  fs.existsSync(path.join(ROOT, SANITIZER_PATH)),
  `${SANITIZER_PATH} missing — sanitizer is the foundation of the callback fix.`,
);

if (fs.existsSync(path.join(ROOT, SANITIZER_PATH))) {
  const src = readFile(SANITIZER_PATH);
  assert(
    /export\s+function\s+sanitizeCallbackUrl/.test(src),
    "sanitizeCallbackUrl not exported from lib/auth-callback.ts",
  );
  assert(
    /export\s+const\s+DEFAULT_CALLBACK\s*=\s*"\/app\/dashboard"/.test(src),
    "DEFAULT_CALLBACK must be exported and equal to '/app/dashboard'",
  );
  // Defense-in-depth checks for the security-critical rejections.
  assert(
    /url\.startsWith\(["']\/\/["']\)/.test(src),
    "Sanitizer must reject schema-relative URLs (//evil.com). " +
      "Expected `url.startsWith('//')` check.",
  );
  assert(
    /url\.startsWith\(["']\/api\/["']\)/.test(src),
    "Sanitizer must reject /api/* destinations. " +
      "Expected `url.startsWith('/api/')` check.",
  );
  assert(
    /url\s*===\s*["']\/login["']/.test(src),
    "Sanitizer must reject /login (would loop). " +
      "Expected `url === '/login'` check.",
  );
  assert(
    /url\s*===\s*["']\/register["']/.test(src),
    "Sanitizer must reject /register (would loop). " +
      "Expected `url === '/register'` check.",
  );
}

// ---------------------------------------------------------------------
// Section B — LoginForm + RegisterForm read URL param + propagate.
// ---------------------------------------------------------------------

for (const formPath of [
  "components/auth/LoginForm.tsx",
  "components/auth/RegisterForm.tsx",
]) {
  const src = readFile(formPath);

  // Reads from URL.
  assert(
    /sanitizeCallbackUrl\(\s*search\??\.get\(["']callbackUrl["']\)\s*\)/.test(
      src,
    ),
    `${formPath} must read sanitizeCallbackUrl(search?.get("callbackUrl")). ` +
      "Without this, the URL's ?callbackUrl= param is silently dropped.",
  );

  // Passes to Google sign-in WITHOUT hardcoding the destination.
  assert(
    /signIn\(["']google["'],\s*\{\s*callbackUrl\s*\}\s*\)/.test(src),
    `${formPath} must pass the dynamic callbackUrl to signIn("google", { callbackUrl }). ` +
      'Hardcoded values like `callbackUrl: "/app/dashboard"` are the original bug.',
  );

  // Hardcoded /app/dashboard in signIn() is forbidden — that's the bug.
  assert(
    !/signIn\(["']google["'],\s*\{\s*callbackUrl:\s*["']\/[^"']*["']\s*\}\s*\)/.test(
      src,
    ),
    `${formPath} must NOT hardcode the callbackUrl value in signIn("google", ...). ` +
      "Use the dynamic { callbackUrl } shorthand instead.",
  );

  // Hidden form input for the credentials path.
  assert(
    /<input[^>]+type=["']hidden["'][^>]+name=["']callbackUrl["'][^>]+value=\{callbackUrl\}/.test(
      src,
    ),
    `${formPath} must include <input type="hidden" name="callbackUrl" value={callbackUrl} /> ` +
      "so the credentials server action can read it from form data.",
  );
}

// ---------------------------------------------------------------------
// Section C — server actions read callbackUrl + sanitize + use as redirectTo.
// ---------------------------------------------------------------------

const ACTIONS_SRC = readFile("lib/auth-actions.ts");

assert(
  /import\s+\{\s*sanitizeCallbackUrl\s*\}\s+from\s+["']@\/lib\/auth-callback["']/.test(
    ACTIONS_SRC,
  ),
  "lib/auth-actions.ts must import sanitizeCallbackUrl. Without it, " +
    "server-side validation of the callbackUrl form input is missing.",
);

// Both registerAction and loginAction must read from formData.
const callbackReads = (
  ACTIONS_SRC.match(/formData\.get\(["']callbackUrl["']\)/g) ?? []
).length;
assert(
  callbackReads >= 2,
  `lib/auth-actions.ts should call formData.get("callbackUrl") twice ` +
    `(loginAction + registerAction). Found ${callbackReads}.`,
);

// Both actions must use redirectTo from the sanitized variable, not hardcoded.
const hardcodedDashboardCount = (
  ACTIONS_SRC.match(/redirectTo:\s*["']\/app\/dashboard["']/g) ?? []
).length;
assert(
  hardcodedDashboardCount === 0,
  `lib/auth-actions.ts must NOT hardcode redirectTo: "/app/dashboard". ` +
    `Found ${hardcodedDashboardCount}. Use a sanitized redirectTo variable instead.`,
);

const redirectToVarUses = (
  ACTIONS_SRC.match(/redirectTo,\s*\}/g) ?? []
).length;
assert(
  redirectToVarUses >= 2,
  "lib/auth-actions.ts should pass `redirectTo,` (the sanitized variable) " +
    `to signIn() in both actions. Found ${redirectToVarUses}.`,
);

// ---------------------------------------------------------------------
// Section D — every /app/* page-level redirect preserves callback.
// ---------------------------------------------------------------------
//
// Walk app/app/**/page.tsx (and the [id] sub-routes), grep for
// `redirect(...login...)`, and verify the URL contains `callbackUrl=`.
// The single layout-level redirect at app/app/layout.tsx is exempt
// because it's documented defense-in-depth (the page-level redirects
// run after the layout for any actual /app/* request).

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (entry.name === "page.tsx") results.push(full);
  }
  return results;
}

const APP_DIR = path.join(ROOT, "app/app");
const pagePaths = walk(APP_DIR);

assert(
  pagePaths.length >= 8,
  `Expected to find at least 8 /app/* pages. Found ${pagePaths.length}. ` +
    "Has the route layout changed dramatically?",
);

const redirectRe = /redirect\(\s*[`"]([^`"]+)[`"]\s*\)|redirect\(\s*`(\/login\?callbackUrl=\$\{[^`]+\})`\s*\)/g;

let pagesWithoutCallback = [];
for (const filePath of pagePaths) {
  const src = fs.readFileSync(filePath, "utf8");
  // Match any redirect call that ends with `/login` or starts a /login URL.
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/redirect\(/.test(line)) continue;
    if (!/\/login/.test(line)) continue;
    // Has /login but might not have callbackUrl=
    if (!/callbackUrl/.test(line)) {
      const rel = path.relative(ROOT, filePath);
      pagesWithoutCallback.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
  }
}

assert(
  pagesWithoutCallback.length === 0,
  `Found ${pagesWithoutCallback.length} /app/* page-level redirect(s) to /login without ` +
    `?callbackUrl=. Each one silently drops the user's intended destination on auth, ` +
    `landing them on /app/dashboard regardless of where they came from.\n\n` +
    pagesWithoutCallback.map((s) => `  ${s}`).join("\n"),
);

// ---------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
}

console.log(
  `auth-callback-preservation: ${passed} passed, ${failed} failed`,
);
process.exit(failed > 0 ? 1 : 0);
