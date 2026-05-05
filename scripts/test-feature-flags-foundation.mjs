#!/usr/bin/env node
/**
 * 2026-05-05 — feature flag system foundation guard (PENDING §4d).
 *
 * This guard goes deeper than static-parse where it can: the pure
 * helpers in lib/flags.ts (`bucketUserId`, `parsePercent`,
 * `parseUserList`, `parseOverride`, `envKey`) are simple enough to
 * extract + execute against canonical inputs, mirroring the
 * dynamic-execution pattern from `slack-alert-foundation`. The
 * resolver `isFeatureEnabled` is harder to dynamic-test (it reads
 * process.env, which CAN be set in this guard's process, but
 * order-dependent test mutations are fragile), so that one stays
 * static-parse.
 *
 * Sections:
 *   A. Library surface — module exists, exports the registered
 *      flags + helpers + resolver + snapshot function.
 *   B. Pure-function semantics via dynamic execution:
 *        - bucketUserId: deterministic + uniform spread + flag-name
 *          inclusion (different flags → different buckets for same
 *          user).
 *        - parsePercent: valid 0-100, rejects invalid.
 *        - parseUserList: dedup + trim + empty-drop.
 *        - parseOverride: case-insensitive on/off/null.
 *        - envKey: uppercase + suffix concatenation.
 *   C. Resolver short-circuit ordering — override BEFORE user-list
 *      BEFORE percent BEFORE default-off (static-parse on the
 *      function body order).
 *   D. Admin page — exists, gates on requireAdmin, consumes
 *      snapshotAllFlags + envKey, force-dynamic.
 *   E. Layout NAV — entry exists in 'Ops' section.
 *   F. Cross-file invariant — registry constants used as call-site
 *      keys (no string literals like `isFeatureEnabled("annual_plan")`
 *      — must be `isFeatureEnabled(FEATURE_FLAGS.ANNUAL_PLAN)`).
 *      Catches the typo class at compile time AND at this guard.
 *
 * Output line conforms to aggregator regex:
 *   `${name}: ${pass} passed, ${fail} failed`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

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

const LIB_PATH = path.join(ROOT, "lib", "flags.ts");
const LIB_SRC = fs.existsSync(LIB_PATH) ? fs.readFileSync(LIB_PATH, "utf8") : "";

// ============================================================================
// SECTION A: Library surface
// ============================================================================

assert(LIB_SRC.length > 0, "A1: lib/flags.ts exists");
assert(
  /export\s+const\s+FEATURE_FLAGS\s*=\s*\{/.test(LIB_SRC),
  "A2: FEATURE_FLAGS registry exported",
);
assert(
  /export\s+type\s+FeatureFlagName/.test(LIB_SRC),
  "A3: FeatureFlagName type exported",
);
assert(
  /export\s+interface\s+IsFeatureEnabledOptions/.test(LIB_SRC),
  "A4: IsFeatureEnabledOptions interface exported",
);
assert(
  /export\s+function\s+isFeatureEnabled\(/.test(LIB_SRC),
  "A5: isFeatureEnabled function exported",
);
assert(
  /export\s+function\s+snapshotAllFlags\(/.test(LIB_SRC),
  "A6: snapshotAllFlags function exported",
);
assert(
  /export\s+function\s+envKey\(/.test(LIB_SRC),
  "A7: envKey helper exported",
);

// Pure helpers exported separately for testability.
for (const name of ["bucketUserId", "parsePercent", "parseUserList", "parseOverride"]) {
  assert(
    new RegExp(`export\\s+function\\s+${name}\\(`).test(LIB_SRC),
    `A8.${name}: ${name} pure helper exported`,
  );
}

// ============================================================================
// SECTION B: Pure-function semantics via dynamic execution
// ============================================================================
//
// Strip TS-only syntax (return-type annotations, interface/type
// declarations, server-only import) into a JS subset, evaluate via
// new Function(). Same approach as slack-alert-foundation Section B.

function extractBlock(src, regex) {
  const m = src.match(regex);
  return m ? m[0] : "";
}

const ENV_KEY_BLOCK = extractBlock(
  LIB_SRC,
  /export\s+function\s+envKey\([\s\S]*?\n\}/,
);
const BUCKET_BLOCK = extractBlock(
  LIB_SRC,
  /export\s+function\s+bucketUserId\([\s\S]*?\n\}/,
);
const PERCENT_BLOCK = extractBlock(
  LIB_SRC,
  /export\s+function\s+parsePercent\([\s\S]*?\n\}/,
);
const USERLIST_BLOCK = extractBlock(
  LIB_SRC,
  /export\s+function\s+parseUserList\([\s\S]*?\n\}/,
);
const OVERRIDE_BLOCK = extractBlock(
  LIB_SRC,
  /export\s+function\s+parseOverride\([\s\S]*?\n\}/,
);

assert(
  ENV_KEY_BLOCK && BUCKET_BLOCK && PERCENT_BLOCK && USERLIST_BLOCK && OVERRIDE_BLOCK,
  "B1: extracted all 5 pure-helper blocks",
);

function stripTsToJs(ts) {
  return (
    ts
      .replace(/^export\s+/gm, "")
      // Strip return type annotations FIRST: `): ReturnType {` for any
      // ReturnType including unions like `boolean | null`. Anchor on
      // the closing paren of the param list + colon + non-greedy text
      // up to the opening brace.
      .replace(/\)\s*:\s*[\w\s\|\[\]"<>,]+?\s*\{/g, ") {")
      // Strip param-level type annotations: `arg: TypeName` → `arg`.
      // Type-grammar handled: word, word[], string literal "X",
      // unions of any combination of those. Repeats `|` segments
      // until next `,` or `)`. Doesn't handle generics like
      // `Array<{...}>` — fine for our pure helpers' simple types.
      .replace(
        /(\b\w+)\s*:\s*(?:"[^"]+"|\w+(?:\[\])?)\s*(?:\|\s*(?:"[^"]+"|\w+(?:\[\])?)\s*)*(?=[,)])/g,
        "$1",
      )
      // `import "server-only"` and `import {createHash} from "node:crypto"` —
      // we'll inject crypto separately for the bucket function.
      .replace(/import\s+"server-only";\s*/g, "")
      .replace(/import\s+\{\s*createHash\s*\}\s+from\s+"node:crypto";\s*/g, "")
  );
}

let envKeyFn = null;
let bucketFn = null;
let percentFn = null;
let userListFn = null;
let overrideFn = null;
try {
  const compiled = new Function(
    "createHash",
    `${stripTsToJs(ENV_KEY_BLOCK)}\n${stripTsToJs(BUCKET_BLOCK)}\n${stripTsToJs(PERCENT_BLOCK)}\n${stripTsToJs(USERLIST_BLOCK)}\n${stripTsToJs(OVERRIDE_BLOCK)}\nreturn { envKey, bucketUserId, parsePercent, parseUserList, parseOverride };`,
  );
  const fns = compiled(crypto.createHash);
  envKeyFn = fns.envKey;
  bucketFn = fns.bucketUserId;
  percentFn = fns.parsePercent;
  userListFn = fns.parseUserList;
  overrideFn = fns.parseOverride;
} catch (e) {
  failures.push(`B2: failed to compile pure helpers to JS: ${e.message}`);
  failed++;
}

if (typeof envKeyFn === "function") {
  passed++;
  // envKey: lowercase flag → uppercase + suffix.
  assert(
    envKeyFn("annual_plan", "OVERRIDE") === "FEATURE_ANNUAL_PLAN_OVERRIDE",
    "B3: envKey('annual_plan', 'OVERRIDE') === 'FEATURE_ANNUAL_PLAN_OVERRIDE'",
  );
  assert(
    envKeyFn("multi_seat", "PERCENT") === "FEATURE_MULTI_SEAT_PERCENT",
    "B4: envKey('multi_seat', 'PERCENT') === 'FEATURE_MULTI_SEAT_PERCENT'",
  );

  // bucketUserId: deterministic, in [0, 99].
  const bucket1 = bucketFn("user_alice", "annual_plan");
  const bucket2 = bucketFn("user_alice", "annual_plan");
  assert(
    bucket1 === bucket2,
    "B5: bucketUserId is deterministic (same inputs → same output)",
  );
  assert(
    bucket1 >= 0 && bucket1 < 100,
    `B6: bucketUserId returns 0-99 (got ${bucket1})`,
  );

  // bucketUserId: different flags assign different buckets to same user
  // (anti-correlation invariant). Test 5 known users — a perfect collision
  // across all 5 would be ~1 in 100^5 = 10^10, basically impossible if the
  // hash is fine.
  let collisionCount = 0;
  const TEST_USERS = ["u1", "u2", "u3", "u4", "u5"];
  for (const u of TEST_USERS) {
    if (bucketFn(u, "annual_plan") === bucketFn(u, "multi_seat")) {
      collisionCount++;
    }
  }
  assert(
    collisionCount < TEST_USERS.length,
    `B7: bucketUserId includes flag name in hash — different flags give different buckets for at least one of ${TEST_USERS.length} test users (got ${collisionCount} collisions)`,
  );

  // bucketUserId: spread is roughly uniform — sample 1000 users and
  // check that the buckets cover at least 50 distinct values (out of
  // 100 possible). A degenerate hash that always returned 42 would
  // give 1 distinct value; SHA-1 should give ~100.
  const distinctBuckets = new Set();
  for (let i = 0; i < 1000; i++) {
    distinctBuckets.add(bucketFn(`u_${i}`, "test_flag"));
  }
  assert(
    distinctBuckets.size >= 50,
    `B8: bucketUserId spread covers ≥50 distinct buckets across 1000 users (got ${distinctBuckets.size})`,
  );

  // parsePercent
  assert(percentFn(undefined) === null, "B9: parsePercent(undefined) === null");
  assert(percentFn("") === null, "B10: parsePercent('') === null");
  assert(percentFn("25") === 25, "B11: parsePercent('25') === 25");
  assert(percentFn("0") === 0, "B12: parsePercent('0') === 0");
  assert(percentFn("100") === 100, "B13: parsePercent('100') === 100");
  assert(percentFn("-1") === null, "B14: parsePercent('-1') === null (rejects negative)");
  assert(percentFn("101") === null, "B15: parsePercent('101') === null (rejects > 100)");
  assert(percentFn("not_a_number") === null, "B16: parsePercent non-numeric → null");

  // parseUserList
  assert(userListFn(undefined).length === 0, "B17: parseUserList(undefined) === []");
  assert(userListFn("").length === 0, "B18: parseUserList('') === []");
  const list1 = userListFn("u1,u2,u3");
  assert(list1.length === 3 && list1[0] === "u1", "B19: parseUserList parses comma-separated");
  const list2 = userListFn(" u1 , u2 , , u1 ");
  assert(
    list2.length === 2 && list2.includes("u1") && list2.includes("u2"),
    "B20: parseUserList trims whitespace + drops empty + dedupes",
  );

  // parseOverride
  assert(overrideFn(undefined) === null, "B21: parseOverride(undefined) === null");
  assert(overrideFn("on") === true, "B22: parseOverride('on') === true");
  assert(overrideFn("ON") === true, "B23: parseOverride('ON') === true (case-insensitive)");
  assert(overrideFn("off") === false, "B24: parseOverride('off') === false");
  assert(overrideFn("1") === true, "B25: parseOverride('1') === true (truthy shortcut)");
  assert(overrideFn("0") === false, "B26: parseOverride('0') === false");
  assert(overrideFn("yes") === null, "B27: parseOverride unrecognized → null (not coerced)");
}

// ============================================================================
// SECTION C: Resolver short-circuit ordering
// ============================================================================

const RESOLVER_BLOCK = extractBlock(
  LIB_SRC,
  /export\s+function\s+isFeatureEnabled\([\s\S]*?\n\}/,
);
assert(RESOLVER_BLOCK.length > 0, "C1: isFeatureEnabled body extracted");

// Override check FIRST, then user-list, then percent, then default-off.
const overrideIdx = RESOLVER_BLOCK.indexOf("parseOverride");
const userListIdx = RESOLVER_BLOCK.indexOf("parseUserList");
const percentIdx = RESOLVER_BLOCK.indexOf("parsePercent");
const returnFalseIdx = RESOLVER_BLOCK.lastIndexOf("return false");
assert(
  overrideIdx >= 0 && userListIdx >= 0 && percentIdx >= 0,
  "C2: resolver references all 3 parsers",
);
assert(
  overrideIdx < userListIdx,
  "C3: parseOverride checked BEFORE parseUserList (override has highest priority)",
);
assert(
  userListIdx < percentIdx,
  "C4: parseUserList checked BEFORE parsePercent (user list bypasses percent gate)",
);
assert(
  returnFalseIdx > percentIdx,
  "C5: default `return false` comes LAST (after all 3 parser checks)",
);

// percent rollout requires userId — anonymous callers don't get
// partial features.
assert(
  /percent[\s\S]{0,300}userId/.test(RESOLVER_BLOCK),
  "C6: percent rollout branch requires userId (anonymous callers don't get partial features)",
);

// ============================================================================
// SECTION D: Admin page
// ============================================================================

const PAGE_PATH = path.join(ROOT, "app", "admin", "feature-flags", "page.tsx");
const PAGE_SRC = fs.existsSync(PAGE_PATH) ? fs.readFileSync(PAGE_PATH, "utf8") : "";
assert(PAGE_SRC.length > 0, "D1: app/admin/feature-flags/page.tsx exists");
assert(
  /requireAdmin\(\)/.test(PAGE_SRC),
  "D2: page gates access via requireAdmin()",
);
assert(
  /snapshotAllFlags/.test(PAGE_SRC) &&
    /from\s+"@\/lib\/flags"/.test(PAGE_SRC),
  "D3: page imports + uses snapshotAllFlags from @/lib/flags",
);
assert(
  /envKey/.test(PAGE_SRC),
  "D4: page renders envKey() output (operator can see exact env var names)",
);
assert(
  /dynamic\s*=\s*"force-dynamic"/.test(PAGE_SRC),
  "D5: page is force-dynamic",
);

// User-list contents must NOT be displayed (PII concern). Page should
// surface count instead.
assert(
  !/userList\.join/.test(PAGE_SRC) && /userListCount/.test(PAGE_SRC),
  "D6: page shows userListCount, NOT user-list contents (PII safety)",
);

// ============================================================================
// SECTION E: Layout NAV entry
// ============================================================================

const LAYOUT_PATH = path.join(ROOT, "app", "admin", "layout.tsx");
const LAYOUT_SRC = fs.readFileSync(LAYOUT_PATH, "utf8");
assert(
  /href:\s*"\/admin\/feature-flags"/.test(LAYOUT_SRC),
  "E1: /admin/feature-flags entry in admin nav",
);
assert(
  /section:\s*"Ops"[\s\S]{0,500}\/admin\/feature-flags/.test(LAYOUT_SRC),
  "E2: /admin/feature-flags is in 'Ops' section",
);

// ============================================================================
// SECTION F: Registry constants used at call sites (when call sites exist)
// ============================================================================

// Today there are no call sites yet (this is foundation). When they
// land, they MUST use FEATURE_FLAGS.ANNUAL_PLAN etc., not string
// literals. Search lib/ + app/ + components/ for any existing
// `isFeatureEnabled("string_literal")` calls and fail if found.
//
// This guard pre-registers the bad pattern so a future call-site PR
// that uses a string literal triggers a clear failure.
const SCAN_DIRS = ["lib", "app", "components"];
let stringLiteralCallSite = null;
for (const dir of SCAN_DIRS) {
  const root = path.join(ROOT, dir);
  if (!fs.existsSync(root)) continue;
  const stack = [root];
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        stack.push(path.join(cur, entry.name));
      } else if (
        entry.name.endsWith(".ts") ||
        entry.name.endsWith(".tsx") ||
        entry.name.endsWith(".mjs")
      ) {
        const full = path.join(cur, entry.name);
        const src = fs.readFileSync(full, "utf8");
        // Match `isFeatureEnabled("...")` — string literal first arg.
        // The defining file lib/flags.ts is allowed to mention the
        // function name in its docstring; only flag external CALL sites.
        if (full === LIB_PATH) continue;
        if (/isFeatureEnabled\s*\(\s*"/.test(src)) {
          stringLiteralCallSite = full;
          break;
        }
      }
    }
    if (stringLiteralCallSite) break;
  }
  if (stringLiteralCallSite) break;
}
assert(
  !stringLiteralCallSite,
  `F1: no string-literal call site for isFeatureEnabled${stringLiteralCallSite ? ` (found in ${stringLiteralCallSite})` : ""}; use FEATURE_FLAGS.* registry constants instead`,
);

// ============================================================================
// Output
// ============================================================================

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`feature-flags-foundation: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
