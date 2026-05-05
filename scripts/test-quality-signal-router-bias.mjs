#!/usr/bin/env node
/**
 * 2026-05-04 — quality-signal router-bias guard (PENDING §6c
 * automation).
 *
 * Follow-up to commit `81087df` (quality-signal foundation). The
 * foundation shipped the classifier + read helpers + admin viewer;
 * this commit wires the router side: `lib/ai/router.ts:route()` now
 * passes the optional `userId` from RouteOptions through
 * `applyQualityBiasIfEnabled` to deprioritize providers the user
 * thumbs-down'd in their trailing streak.
 *
 * Today the bias step is dormant — env flag
 * `QUALITY_SIGNAL_AUTO_ROUTE_ENABLED` is unset, so the helper
 * short-circuits to ladder-unchanged on the first line.
 *
 * This guard locks in:
 *   A. Imports — applyQualityBiasIfEnabled imported from
 *      ./quality-signal.
 *   B. RouteOptions.userId — optional field added so route handlers
 *      can pass the authenticated user without breaking system /
 *      anonymous callers.
 *   C. route() wire-up — bias step inserted AFTER resolveLadder
 *      (caller preference + env policy still drive the canonical
 *      ladder; bias only reorders).
 *   D. Bias helper short-circuits — env-flag-off, no-userId,
 *      not-flagged, empty-providers, signal-throw all return the
 *      original ladder. Crucially: env-flag-off is the FIRST check
 *      so the no-op path doesn't touch the DB.
 *   E. Cross-file invariant — applyQualityBiasIfEnabled signature
 *      matches what route() calls (ladder, userId).
 *
 * Output line conforms to aggregator regex:
 *   `${name}: ${pass} passed, ${fail} failed`.
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

const ROUTER_PATH = path.join(ROOT, "lib", "ai", "router.ts");
const ROUTER_SRC = fs.existsSync(ROUTER_PATH)
  ? fs.readFileSync(ROUTER_PATH, "utf8")
  : "";

const QS_PATH = path.join(ROOT, "lib", "ai", "quality-signal.ts");
const QS_SRC = fs.existsSync(QS_PATH) ? fs.readFileSync(QS_PATH, "utf8") : "";

assert(ROUTER_SRC.length > 0, "A0: lib/ai/router.ts exists");
assert(QS_SRC.length > 0, "A0b: lib/ai/quality-signal.ts exists");

// ============================================================================
// SECTION A: Imports
// ============================================================================

assert(
  /import\s+\{\s*applyQualityBiasIfEnabled\s*\}\s+from\s+"\.\/quality-signal"/.test(
    ROUTER_SRC,
  ),
  "A1: router.ts imports applyQualityBiasIfEnabled from ./quality-signal",
);

// ============================================================================
// SECTION B: RouteOptions.userId field
// ============================================================================

const ROUTE_OPTIONS_MATCH = ROUTER_SRC.match(
  /export\s+interface\s+RouteOptions\s*\{[\s\S]*?\n\}/,
);
const ROUTE_OPTIONS_BODY = ROUTE_OPTIONS_MATCH ? ROUTE_OPTIONS_MATCH[0] : "";
assert(ROUTE_OPTIONS_BODY.length > 0, "B1: RouteOptions interface extracted");

// userId field is OPTIONAL (?:) and accepts null (system / anon callers
// pass null instead of an empty string).
assert(
  /userId\?:\s*string\s*\|\s*null/.test(ROUTE_OPTIONS_BODY) ||
    /userId\?:\s*null\s*\|\s*string/.test(ROUTE_OPTIONS_BODY),
  "B2: RouteOptions.userId is `string | null` and OPTIONAL (system callers pass null)",
);

// preferredId still present — refactor must preserve existing field.
assert(
  /preferredId\?:\s*AIProviderId/.test(ROUTE_OPTIONS_BODY),
  "B3: RouteOptions.preferredId still present (no regression)",
);

// ============================================================================
// SECTION C: route() wire-up
// ============================================================================

const ROUTE_FN_MATCH = ROUTER_SRC.match(
  /export\s+async\s+function\s+route\([\s\S]*?(?=\n\}\n)/,
);
const ROUTE_FN_BODY = ROUTE_FN_MATCH ? ROUTE_FN_MATCH[0] : "";
assert(ROUTE_FN_BODY.length > 0, "C1: route() function body extracted");

// resolveLadder must still be called (canonical ladder source).
assert(
  /resolveLadder\(\s*op\s*,\s*opts\.preferredId\s*\)/.test(ROUTE_FN_BODY),
  "C2: route() still invokes resolveLadder(op, opts.preferredId) for canonical ladder",
);

// Bias helper must be called AFTER resolveLadder (canonical ladder is
// the input; bias is post-processing).
const resolveIdx = ROUTE_FN_BODY.indexOf("resolveLadder");
const biasIdx = ROUTE_FN_BODY.indexOf("applyQualityBiasIfEnabled");
assert(
  resolveIdx >= 0 && biasIdx >= 0 && resolveIdx < biasIdx,
  "C3: applyQualityBiasIfEnabled called AFTER resolveLadder (post-processing the canonical ladder)",
);

// Bias call must pass opts.userId — otherwise the helper short-
// circuits to ladder-unchanged for every caller (defeats the wire-up).
assert(
  /applyQualityBiasIfEnabled\([\s\S]{0,200}opts\.userId/.test(ROUTE_FN_BODY),
  "C4: applyQualityBiasIfEnabled invoked with opts.userId",
);

// The result of the bias call must be awaited (helper is async) AND
// assigned to a variable that the for-loop iterates. If either is
// missed, ladder iteration walks the wrong array.
assert(
  /await\s+applyQualityBiasIfEnabled/.test(ROUTE_FN_BODY),
  "C5: applyQualityBiasIfEnabled is awaited (helper is async)",
);
// The for-loop must iterate the BIASED ladder, not the base. Anchor:
// `const ladder =` followed eventually by `for (const id of ladder)`.
assert(
  /const\s+ladder\s*=\s*await\s+applyQualityBiasIfEnabled/.test(ROUTE_FN_BODY) &&
    /for\s*\(\s*const\s+id\s+of\s+ladder\s*\)/.test(ROUTE_FN_BODY),
  "C6: route() iterates the biased `ladder` (not a stale base reference)",
);

// ============================================================================
// SECTION D: Bias helper short-circuit invariants
// ============================================================================

const HELPER_MATCH = QS_SRC.match(
  /export\s+async\s+function\s+applyQualityBiasIfEnabled[\s\S]*?\n\}\n/,
);
const HELPER_BODY = HELPER_MATCH ? HELPER_MATCH[0] : "";
assert(HELPER_BODY.length > 0, "D1: applyQualityBiasIfEnabled body extracted");

// Env-flag check MUST be first — short-circuit before DB query.
const envCheckIdx = HELPER_BODY.indexOf("autoRouteEnabled()");
const userIdCheckIdx = HELPER_BODY.indexOf("if (!userId)");
const dbCallIdx = HELPER_BODY.indexOf("loadUserQualitySignal");
assert(
  envCheckIdx >= 0 && envCheckIdx < userIdCheckIdx && envCheckIdx < dbCallIdx,
  "D2: env-flag check is FIRST in helper (no-op path returns before DB query)",
);

// userId check before DB query (anonymous callers shouldn't trigger
// per-user lookup).
assert(
  userIdCheckIdx >= 0 && userIdCheckIdx < dbCallIdx,
  "D3: userId null-check precedes loadUserQualitySignal call",
);

// loadUserQualitySignal call wrapped in try/catch (DB hiccup must
// not take down the router).
assert(
  /try\s*\{[\s\S]*?loadUserQualitySignal[\s\S]*?\}\s*catch/.test(HELPER_BODY),
  "D4: loadUserQualitySignal call wrapped in try/catch (DB hiccup → fall back to canonical ladder)",
);

// Bucket check restricts bias to "flagged" only (watch is operator-
// only signal; biasing on watch would be too aggressive).
assert(
  /bucket\s*!==\s*"flagged"/.test(HELPER_BODY),
  "D5: bias only applies when bucket === \"flagged\" (watch is operator-only signal, not auto-route)",
);

// Empty-recentProviders check — if the streak landed on null-provider
// rows, ladder unchanged.
assert(
  /recentProviders\.length\s*===\s*0/.test(HELPER_BODY),
  "D6: empty recentProviders short-circuits to ladder-unchanged",
);

// No-overlap optimization — if the bias didn't actually move anything,
// return original reference (preserves identity for downstream checks).
assert(
  /tail\.length\s*===\s*0/.test(HELPER_BODY),
  "D7: no-overlap shortcut returns original ladder reference",
);

// Helper must NEVER throw — every code path returns. No `throw`
// keyword in the body (post-comment-strip).
const helperCodeOnly = HELPER_BODY
  .replace(/\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");
assert(
  !/\bthrow\b/.test(helperCodeOnly),
  "D8: applyQualityBiasIfEnabled has no `throw` statements (route() never crashes due to bias step)",
);

// ============================================================================
// SECTION E: Cross-file signature invariant
// ============================================================================

// Helper signature: (ladder, userId) where userId can be null/undefined.
// The router call passes `(baseLadder, opts.userId)` so opts.userId
// must accept the same input shape.
assert(
  /applyQualityBiasIfEnabled<T\s+extends\s+string>\(\s*ladder:\s*T\[\]\s*,\s*userId:\s*string\s*\|\s*null\s*\|\s*undefined/.test(
    QS_SRC,
  ),
  "E1: applyQualityBiasIfEnabled<T extends string>(ladder: T[], userId: string | null | undefined) — generic over ladder element type, userId nullable",
);

// loadUserQualitySignal must populate recentProviders from the chip
// data. The select() call must include providerId.
assert(
  /loadUserQualitySignal[\s\S]{0,2000}providerId:\s*schema\.aiFeedback\.providerId/.test(
    QS_SRC,
  ),
  "E2: loadUserQualitySignal SELECTs ai_feedback.provider_id (the bias-step input source)",
);

// recentProviders is dedup'd via Set so a streak of 4 thumbs-down on
// the same provider doesn't surface 4 entries.
assert(
  /recentProviders\s*=\s*Array\.from\(\s*new\s+Set\(/.test(QS_SRC),
  "E3: recentProviders dedup'd via Array.from(new Set(...)) (preserves most-recent-first ordering)",
);

// ============================================================================
// Output
// ============================================================================

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(
  `quality-signal-router-bias: ${passed} passed, ${failed} failed`,
);
process.exit(failed > 0 ? 1 : 0);
