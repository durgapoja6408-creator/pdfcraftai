#!/usr/bin/env node
/**
 * 2026-05-04 — per-user quality-signal foundation guard.
 *
 * PENDING_WORK_ANALYSIS.md §6c. Mirrors the dunning + ai-feedback
 * foundation discipline: pure helpers + read-side query + admin
 * viewer + CI guard land before the surface has meaningful traffic,
 * so when accumulated chip data starts producing real flagged users
 * the operator surface is already in place.
 *
 * This guard locks in:
 *   A. lib/ai/quality-signal.ts surface — pure classifier, policy
 *      constants, read helpers all exported with the right shapes.
 *   B. Pure-function semantics — `computeConsecutiveNegative` is a
 *      pure function over a verdict array; `classifyQualitySignal`
 *      is a pure threshold check. We can test those by string-
 *      parsing the source (no live DB needed) plus invariants on
 *      the policy constants.
 *   C. /admin/quality-signals page — exists, gates on requireAdmin,
 *      consumes listFlaggedUsers + QUALITY_SIGNAL_POLICY, renders
 *      the three buckets.
 *   D. Admin nav entry under Ops.
 *   E. Cross-file invariant — bucket names agree across the type
 *      union, the classifier, the page palette, and the doc copy.
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

// ============================================================================
// SECTION A: lib/ai/quality-signal.ts surface
// ============================================================================

const LIB_PATH = path.join(ROOT, "lib", "ai", "quality-signal.ts");
const LIB_SRC = fs.existsSync(LIB_PATH) ? fs.readFileSync(LIB_PATH, "utf8") : "";

assert(LIB_SRC.length > 0, "A1: lib/ai/quality-signal.ts file exists");

// Type exports — the public contract for /admin/quality-signals + future
// auto-routing wiring.
assert(
  /export\s+type\s+QualityBucket\s*=/.test(LIB_SRC),
  "A2: QualityBucket type exported",
);
assert(
  /export\s+interface\s+QualityFeedbackRow/.test(LIB_SRC),
  "A3: QualityFeedbackRow interface exported",
);
assert(
  /export\s+interface\s+UserQualitySignal/.test(LIB_SRC),
  "A4: UserQualitySignal interface exported",
);

// Policy constants.
assert(
  /export\s+const\s+QUALITY_SIGNAL_POLICY/.test(LIB_SRC),
  "A5: QUALITY_SIGNAL_POLICY exported",
);
// All three threshold knobs must be present so a future tuning PR
// can find them without needing to read the rest of the file.
for (const key of ["watchThreshold", "flaggedThreshold", "recentWindow"]) {
  assert(
    new RegExp(`${key}:\\s*\\d+`).test(LIB_SRC),
    `A6.${key}: ${key} present in QUALITY_SIGNAL_POLICY with a numeric default`,
  );
}

// Pure helpers.
assert(
  /export\s+function\s+computeConsecutiveNegative\(/.test(LIB_SRC),
  "A7: computeConsecutiveNegative exported",
);
assert(
  /export\s+function\s+classifyQualitySignal\(/.test(LIB_SRC),
  "A8: classifyQualitySignal exported",
);

// Read-side helpers.
assert(
  /export\s+async\s+function\s+loadUserQualitySignal\(/.test(LIB_SRC),
  "A9: loadUserQualitySignal exported (async)",
);
assert(
  /export\s+async\s+function\s+listFlaggedUsers\(/.test(LIB_SRC),
  "A10: listFlaggedUsers exported (async)",
);

// 2026-05-04 (PENDING §6c automation, follow-up to commit 81087df) —
// auto-routing bias step. Behind a default-off env flag. Function
// is generic over the ladder element type (`<T extends string>`)
// so callers don't have to widen to string[] just to pass through.
assert(
  /export\s+async\s+function\s+applyQualityBiasIfEnabled\s*</.test(LIB_SRC),
  "A11: applyQualityBiasIfEnabled exported (async, generic)",
);
// recentProviders field added to UserQualitySignal — without it the
// bias step has nothing to bias by.
assert(
  /recentProviders:\s*string\[\]/.test(LIB_SRC),
  "A12: UserQualitySignal interface includes recentProviders: string[] (bias-step input)",
);
// Env-flag check uses the canonical name.
assert(
  /QUALITY_SIGNAL_AUTO_ROUTE_ENABLED/.test(LIB_SRC),
  "A13: env flag uses canonical name QUALITY_SIGNAL_AUTO_ROUTE_ENABLED",
);

// Schema usage — read helpers MUST go through the Drizzle schema
// (not raw SQL strings) so renames surface as TS errors at compile.
assert(
  /from\s+"@\/db\/client"/.test(LIB_SRC) && /schema\.aiFeedback/.test(LIB_SRC),
  "A11: read helpers reference schema.aiFeedback (schema-typed, not raw SQL)",
);

// ============================================================================
// SECTION B: Pure-function semantics
// ============================================================================

// flaggedThreshold MUST be > watchThreshold (otherwise classifyQualitySignal
// would fall through the wrong branch and never return "watch"). The
// `>= flaggedThreshold` branch in classifyQualitySignal must come BEFORE
// the `>= watchThreshold` branch (otherwise a streak of 5 with thresholds
// (2, 4) would be caught by the watch branch and incorrectly bucketed).
assert(
  /flaggedThreshold[\s\S]{0,500}watchThreshold/.test(LIB_SRC) ||
    /watchThreshold[\s\S]{0,200}flaggedThreshold/.test(LIB_SRC),
  "B1: both threshold constants appear in the policy block",
);

// classifyQualitySignal must check flagged BEFORE watch.
const classifyMatch = LIB_SRC.match(
  /export\s+function\s+classifyQualitySignal\([\s\S]*?\n\}/,
);
const classifyBody = classifyMatch ? classifyMatch[0] : "";
assert(classifyBody.length > 0, "B2: classifyQualitySignal body extracted");
const flaggedIdx = classifyBody.indexOf("flaggedThreshold");
const watchIdx = classifyBody.indexOf("watchThreshold");
assert(
  flaggedIdx >= 0 && watchIdx >= 0 && flaggedIdx < watchIdx,
  "B3: classifyQualitySignal checks flaggedThreshold BEFORE watchThreshold (avoids streak-5 misbucketed-as-watch trap)",
);

// computeConsecutiveNegative must use a "break on non-down" loop —
// not `filter`, which would count non-trailing thumbs-down too.
const computeMatch = LIB_SRC.match(
  /export\s+function\s+computeConsecutiveNegative\([\s\S]*?\n\}/,
);
const computeBody = computeMatch ? computeMatch[0] : "";
assert(computeBody.length > 0, "B4: computeConsecutiveNegative body extracted");
assert(
  /\bbreak\b/.test(computeBody),
  "B5: computeConsecutiveNegative uses break (counts trailing streak only, not total downs)",
);
assert(
  !/\.filter\(/.test(computeBody),
  "B6: computeConsecutiveNegative does NOT use .filter (would over-count non-trailing downs)",
);

// loadUserQualitySignal must order by updated_at DESC — otherwise the
// "trailing streak" semantics break. The verdict-array passed into
// computeConsecutiveNegative is most-recent-first by contract.
assert(
  /loadUserQualitySignal[\s\S]{0,2000}orderBy\(\s*desc\(/.test(LIB_SRC),
  "B7: loadUserQualitySignal orders by desc() (most-recent-first contract)",
);
assert(
  /loadUserQualitySignal[\s\S]{0,2000}\.limit\(\s*QUALITY_SIGNAL_POLICY\.recentWindow\s*\)/.test(
    LIB_SRC,
  ),
  "B8: loadUserQualitySignal caps query at QUALITY_SIGNAL_POLICY.recentWindow",
);

// ============================================================================
// SECTION C: /admin/quality-signals page
// ============================================================================

const PAGE_PATH = path.join(
  ROOT,
  "app",
  "admin",
  "quality-signals",
  "page.tsx",
);
const PAGE_SRC = fs.existsSync(PAGE_PATH) ? fs.readFileSync(PAGE_PATH, "utf8") : "";

assert(PAGE_SRC.length > 0, "C1: app/admin/quality-signals/page.tsx exists");
assert(
  /requireAdmin\(\)/.test(PAGE_SRC),
  "C2: page gates access via requireAdmin()",
);
assert(
  /listFlaggedUsers/.test(PAGE_SRC) &&
    /from\s+"@\/lib\/ai\/quality-signal"/.test(PAGE_SRC),
  "C3: page consumes listFlaggedUsers from lib/ai/quality-signal",
);
assert(
  /QUALITY_SIGNAL_POLICY/.test(PAGE_SRC),
  "C4: page references QUALITY_SIGNAL_POLICY for threshold display",
);

// All three buckets must appear in the BucketChip palette so the
// summary cards never show `undefined` for a bucket we forgot.
for (const bucket of ["flagged", "watch", "healthy"]) {
  assert(
    new RegExp(`${bucket}:\\s*\\{`).test(PAGE_SRC),
    `C5.${bucket}: BucketChip palette has '${bucket}' entry`,
  );
}

// Page is force-dynamic (admin pages must not render-cache).
assert(
  /dynamic\s*=\s*"force-dynamic"/.test(PAGE_SRC),
  "C6: page is force-dynamic",
);

// Page must surface the "read-only today / auto-routing later" caveat
// so operators reading the page understand the surface scope.
assert(
  /Read-only|read-only/.test(PAGE_SRC) && /TODO\(automation\)/.test(PAGE_SRC),
  "C7: page surfaces 'read-only today, automation later' caveat",
);

// ============================================================================
// SECTION D: Admin nav entry
// ============================================================================

const LAYOUT_PATH = path.join(ROOT, "app", "admin", "layout.tsx");
const LAYOUT_SRC = fs.readFileSync(LAYOUT_PATH, "utf8");

assert(
  /href:\s*"\/admin\/quality-signals"/.test(LAYOUT_SRC),
  "D1: /admin/quality-signals entry exists in admin nav",
);
const navMatch = LAYOUT_SRC.match(
  /section:\s*"Ops"[\s\S]{0,500}\/admin\/quality-signals/,
);
assert(
  navMatch !== null,
  "D2: /admin/quality-signals nav entry is in 'Ops' section (matches ai-feedback + dunning rationale)",
);

// ============================================================================
// SECTION E: Cross-file invariant — bucket names
// ============================================================================

const BUCKETS = ["healthy", "watch", "flagged"];
for (const bucket of BUCKETS) {
  // Library type union has the bucket.
  assert(
    new RegExp(`"${bucket}"`).test(LIB_SRC),
    `E1.${bucket}: QualityBucket union has "${bucket}"`,
  );
  // Admin page references the bucket.
  assert(
    new RegExp(`"${bucket}"`).test(PAGE_SRC) || new RegExp(`${bucket}:`).test(PAGE_SRC),
    `E2.${bucket}: admin page references the "${bucket}" bucket`,
  );
}

// PENDING_WORK_ANALYSIS.md §6c references — surface should remain
// findable even if someone refactors the file structure later.
const PENDING_PATH = path.join(ROOT, "docs", "PENDING_WORK_ANALYSIS.md");
const PENDING_SRC = fs.existsSync(PENDING_PATH)
  ? fs.readFileSync(PENDING_PATH, "utf8")
  : "";
assert(
  /6c\.\s+No\s+per-user\s+quality\s+signal/i.test(PENDING_SRC),
  "E3: PENDING_WORK_ANALYSIS.md still references §6c by name (anchor preserved)",
);

// ============================================================================
// Output
// ============================================================================

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`quality-signal-foundation: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
