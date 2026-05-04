#!/usr/bin/env node
/**
 * 2026-05-04 — AI usage instrumentation tracker (PENDING §6b corollary).
 *
 * Discovered while planning Stage 3 batch A of the FeedbackChip rollout:
 * 8 of 10 AI ops don't call recordAiUsage at all, which means:
 *   - 80% of AI traffic invisible to /admin/margin
 *   - FeedbackChip flip semantics broken on those ops
 *   - /app/usage per-op breakdown wrong
 *   - Per-op error rates unmeasurable
 *
 * See `docs/AI_USAGE_INSTRUMENTATION_GAP.md` for the full writeup.
 *
 * This guard's job:
 *   1. Maintain the SSOT list of "currently instrumented" ops.
 *   2. Cross-check that every entry in the SSOT actually has the
 *      recordAiUsage call in its route handler. Catches refactors
 *      that accidentally remove the call.
 *   3. Cross-check that ops marked "missing" don't accidentally land
 *      a recordAiUsage call without being added to the instrumented
 *      list (catches drift in the other direction — code added but
 *      tracker not updated).
 *
 * Today the guard reports the gap state without failing CI on the
 * missing 8 ops. Once all 10 are instrumented, this guard becomes a
 * pure regression-only check.
 *
 * Output line conforms to aggregator regex `${name}: ${pass} passed,
 * ${fail} failed`.
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
// SSOT — current instrumentation state
// ============================================================================
//
// `instrumented` ops MUST have a `recordAiUsage(` call in the route file.
// `missing` ops MUST NOT (yet) — listing them here documents the known
// gap. Adding a recordAiUsage call to a missing op without moving it to
// the instrumented list will fail this guard.
//
// When closing a gap (e.g. translate's batch 1 lands), move the entry
// from `missing` to `instrumented` in the same commit as the route
// change.

const INSTRUMENTED_OPS = [
  {
    op: "summarize",
    route: "app/api/ai/summarize/route.ts",
    surfacesAiUsageId: true, // PENDING §6b stage 2 pilot
  },
  {
    op: "chat",
    route: "app/api/ai/chat/route.ts",
    surfacesAiUsageId: false, // chat is its own UI; FeedbackChip not wired
  },
  // 2026-05-04 — Batch 1 of the AI_USAGE_INSTRUMENTATION_GAP.md
  // rollout: top-3 missing ops by traffic. Each route now captures
  // providerStartedAt, calls recordAiUsage after the provider succeeds,
  // and surfaces aiUsageId in BOTH 200 + 207 response paths so the
  // FeedbackChip's UNIQUE(user_id, ai_usage_id) flip semantics work.
  {
    op: "translate",
    route: "app/api/ai/translate/route.ts",
    surfacesAiUsageId: true,
  },
  {
    op: "rewrite",
    route: "app/api/ai/rewrite/route.ts",
    surfacesAiUsageId: true,
  },
  {
    op: "ocr",
    route: "app/api/ai/ocr/route.ts",
    surfacesAiUsageId: true,
  },
  // 2026-05-04 — Batch 2 of the AI_USAGE_INSTRUMENTATION_GAP.md
  // rollout: mid-traffic ops. Same pattern as Batch 1.
  {
    op: "table",
    route: "app/api/ai/table/route.ts",
    surfacesAiUsageId: true,
  },
  {
    op: "compare",
    route: "app/api/ai/compare/route.ts",
    surfacesAiUsageId: true,
  },
  {
    op: "generate",
    route: "app/api/ai/generate/route.ts",
    surfacesAiUsageId: true,
  },
];

const MISSING_OPS = [
  // Batch 3 (pending, lowest traffic):
  { op: "sign", route: "app/api/ai/sign/route.ts" },
  { op: "redact", route: "app/api/ai/redact/route.ts" },
];

// ============================================================================
// Section A — Tracker doc exists + describes the gap
// ============================================================================

const TRACKER_PATH = path.join(
  ROOT,
  "docs",
  "AI_USAGE_INSTRUMENTATION_GAP.md",
);
assert(
  fs.existsSync(TRACKER_PATH),
  "A0: docs/AI_USAGE_INSTRUMENTATION_GAP.md exists (the SSOT writeup)",
);
const trackerSrc = fs.existsSync(TRACKER_PATH)
  ? fs.readFileSync(TRACKER_PATH, "utf8")
  : "";

assert(
  /Empirical evidence/.test(trackerSrc),
  "A1: tracker has empirical evidence section (the prod query that proved the gap)",
);
assert(
  /Fix recipe/.test(trackerSrc),
  "A2: tracker has fix recipe (canonical recordAiUsage pattern from summarize)",
);
assert(
  /Rollout plan/.test(trackerSrc) && /Batch 1/.test(trackerSrc),
  "A3: tracker has 3-batch rollout plan (translate/rewrite/ocr first)",
);

// ============================================================================
// Section B — Instrumented ops actually have the recordAiUsage call
// ============================================================================

for (const entry of INSTRUMENTED_OPS) {
  const routePath = path.join(ROOT, entry.route);
  assert(fs.existsSync(routePath), `B0.${entry.op}: ${entry.route} exists`);
  if (!fs.existsSync(routePath)) continue;
  const src = fs.readFileSync(routePath, "utf8");

  assert(
    /recordAiUsage\(/.test(src),
    `B1.${entry.op}: route calls recordAiUsage (instrumented list — removing this without moving to MISSING_OPS would fail this guard)`,
  );

  // operation: "<op>" must be the literal string passed. Catches
  // accidental copy-paste of the wrong op string.
  const opLiteral = new RegExp(
    `recordAiUsage\\(\\s*\\{[\\s\\S]{0,800}operation:\\s*["']${entry.op}["']`,
  );
  // The route may use a different shape — only check if recordAiUsage exists.
  // Be lenient: just check the op literal appears somewhere near the call.
  if (entry.op === "chat") {
    // Chat actually writes operation: "chat_turn" to the table. Skip
    // the op-literal check.
    assert(
      /chat_turn/.test(src),
      "B2.chat: chat route writes operation: 'chat_turn' (the conventional name; ai_usage stores 'chat_turn' not 'chat')",
    );
  } else {
    assert(
      opLiteral.test(src),
      `B2.${entry.op}: recordAiUsage payload has operation: "${entry.op}"`,
    );
  }

  // Routes that surface aiUsageId in the response body (FeedbackChip
  // flip-semantics dependency).
  if (entry.surfacesAiUsageId) {
    assert(
      /aiUsageId:\s*\w+\.applied\s*\?\s*\w+\.id\s*:\s*null/.test(src),
      `B3.${entry.op}: response surfaces aiUsageId for FeedbackChip flip semantics`,
    );
  }
}

// ============================================================================
// Section C — Missing ops MUST NOT have the call (catch drift)
// ============================================================================
//
// If a future commit adds recordAiUsage to translate without removing
// translate from MISSING_OPS, this guard catches the inconsistency.
// The fix: move the entry to INSTRUMENTED_OPS in the same commit.

for (const entry of MISSING_OPS) {
  const routePath = path.join(ROOT, entry.route);
  assert(fs.existsSync(routePath), `C0.${entry.op}: ${entry.route} exists`);
  if (!fs.existsSync(routePath)) continue;
  const src = fs.readFileSync(routePath, "utf8");

  assert(
    !/recordAiUsage\(/.test(src),
    `C1.${entry.op}: route does NOT call recordAiUsage — if you've just added the call, MOVE THIS OP from MISSING_OPS to INSTRUMENTED_OPS in this guard's SSOT (line ~57)`,
  );
}

// ============================================================================
// Section D — Coverage invariant
// ============================================================================
//
// The 10-op AIOp union in lib/ai/router.ts is the canonical AI op list.
// INSTRUMENTED + MISSING must equal that list. Catches the case where a
// new op is added to the union without being tracked here.

const ROUTER_PATH = path.join(ROOT, "lib", "ai", "router.ts");
const routerSrc = fs.readFileSync(ROUTER_PATH, "utf8");

// Pull the AIOp union — it's a `type AIOp = | "ocr" | "translate" | ...`.
const unionMatch = routerSrc.match(
  /export\s+type\s+AIOp\s*=\s*([\s\S]*?);/,
);
assert(unionMatch !== null, "D0: AIOp union extractable from router.ts");

if (unionMatch) {
  const unionRaw = unionMatch[1];
  const opsInUnion = Array.from(
    unionRaw.matchAll(/"([a-z_]+)"/g),
    (m) => m[1],
  );
  // Tracker covers each entry.
  const tracked = new Set([
    ...INSTRUMENTED_OPS.map((e) => e.op),
    ...MISSING_OPS.map((e) => e.op),
  ]);
  for (const op of opsInUnion) {
    assert(
      tracked.has(op),
      `D1.${op}: op '${op}' is in AIOp union but missing from this guard's SSOT — add it to INSTRUMENTED_OPS or MISSING_OPS`,
    );
  }
  // Reverse: tracker doesn't have stale entries.
  for (const op of tracked) {
    assert(
      opsInUnion.includes(op),
      `D2.${op}: op '${op}' tracked here but not in the AIOp union — was it removed? Update the SSOT.`,
    );
  }
}

// ============================================================================
// Section E — Inform the operator about the gap state
// ============================================================================
//
// Print a summary line that surfaces the gap state. CI scrolls past
// this; humans running `node scripts/test-ai-usage-instrumentation.mjs`
// directly will see it. The aggregator-result line at the bottom is
// the machine-readable SUMMARY; this is the human-readable CONTEXT.

const totalOps = INSTRUMENTED_OPS.length + MISSING_OPS.length;
const instrumentedPct = Math.round(
  (INSTRUMENTED_OPS.length / totalOps) * 100,
);
console.log(
  `\n  Instrumentation state: ${INSTRUMENTED_OPS.length}/${totalOps} ops have recordAiUsage (${instrumentedPct}%)`,
);
console.log(
  `  Missing: ${MISSING_OPS.map((e) => e.op).join(", ")}`,
);
console.log(
  `  See docs/AI_USAGE_INSTRUMENTATION_GAP.md for the rollout plan.\n`,
);

// ============================================================================
// Output
// ============================================================================

if (failed > 0) {
  console.error("FAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`ai-usage-instrumentation: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
