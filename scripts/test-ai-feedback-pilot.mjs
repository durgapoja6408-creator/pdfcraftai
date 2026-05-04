#!/usr/bin/env node
/**
 * 2026-05-04 — AI feedback stage 2 pilot guard.
 *
 * PENDING_WORK_ANALYSIS.md §6b stage 2. This guard locks in the
 * pilot wire-up:
 *
 *   A. FeedbackChip component exists and exports correctly
 *   B. Summarize route surfaces aiUsageId in BOTH 200 + 207 paths
 *   C. SummarizePdfTool: imports FeedbackChip, captures aiUsageId
 *      in result state, renders chip in ResultCard with all 5 props
 *      (operation, aiUsageId, fileId, providerId, model)
 *   D. Rollout doc exists tracking which tools are wired
 *
 * Stage 3 (fleet rollout) extends this guard to cover each new
 * tool as it lands. The tools list at TOP is the SSOT for "what's
 * wired"; adding a new tool means appending to the list and to the
 * code.
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

const CHIP_PATH = path.join(
  ROOT,
  "components",
  "feedback",
  "FeedbackChip.tsx",
);
const ROLLOUT_DOC_PATH = path.join(ROOT, "docs", "AI_FEEDBACK_ROLLOUT.md");

// Tools currently wired. Each entry: { component, route, operation }.
// Adding a new tool to the rollout means appending here AND wiring
// the code per docs/AI_FEEDBACK_ROLLOUT.md §"What needs to happen at
// each route".
const WIRED_TOOLS = [
  {
    component: "components/tools/SummarizePdfTool.tsx",
    route: "app/api/ai/summarize/route.ts",
    operation: "summarize",
  },
  // 2026-05-04 — Batch A (3 of 5 top-traffic ops). Each route was
  // already instrumented in commit f7d5a9c (Batch 1 of the
  // AI_USAGE_INSTRUMENTATION_GAP rollout); this batch adds the
  // FeedbackChip wire-up on the matching tool components.
  {
    component: "components/tools/TranslatePdfTool.tsx",
    route: "app/api/ai/translate/route.ts",
    operation: "translate",
  },
  {
    component: "components/tools/RewritePdfTool.tsx",
    route: "app/api/ai/rewrite/route.ts",
    operation: "rewrite",
  },
  {
    component: "components/tools/OcrPdfTool.tsx",
    route: "app/api/ai/ocr/route.ts",
    operation: "ocr",
  },
  // 2026-05-04 — Batch A finish (5 of 5 top-traffic ops). Routes
  // were instrumented in Batch 2 (commit 37b6573); this batch wires
  // the chip on the matching tool components.
  {
    component: "components/tools/TableExtractTool.tsx",
    route: "app/api/ai/table/route.ts",
    operation: "table",
  },
  {
    component: "components/tools/ComparePdfTool.tsx",
    route: "app/api/ai/compare/route.ts",
    operation: "compare",
  },
];

// ============================================================================
// Section A — FeedbackChip component
// ============================================================================

assert(fs.existsSync(CHIP_PATH), "A0: FeedbackChip.tsx exists");
const chipSrc = fs.existsSync(CHIP_PATH) ? fs.readFileSync(CHIP_PATH, "utf8") : "";

assert(
  /"use client"/.test(chipSrc),
  "A1: FeedbackChip is a client component (uses fetch + state)",
);
assert(
  /export\s+function\s+FeedbackChip/.test(chipSrc),
  "A2: FeedbackChip exported as named function",
);
assert(
  /export\s+interface\s+FeedbackChipProps/.test(chipSrc),
  "A3: FeedbackChipProps interface exported (consumers can type-check)",
);
// Required props.
for (const prop of ["operation", "aiUsageId", "fileId", "providerId", "model"]) {
  assert(
    new RegExp(`${prop}\\??:`).test(chipSrc),
    `A4.${prop}: prop ${prop} declared on FeedbackChipProps`,
  );
}
// fetches POST /api/ai/feedback
assert(
  /fetch\(\s*["']\/api\/ai\/feedback["']/.test(chipSrc),
  "A5: chip POSTs to /api/ai/feedback (the persist endpoint)",
);
assert(
  /method:\s*["']POST["']/.test(chipSrc),
  "A6: chip uses POST method",
);
// Handles 401 → auth_required state (graceful pivot to login).
assert(
  /401/.test(chipSrc) && /auth_required/.test(chipSrc),
  "A7: chip handles 401 → auth_required state (session-expired pivot)",
);
// Handles network error gracefully (no unhandled rejection).
assert(
  /catch\s*(?:\(.*?\))?\s*\{/.test(chipSrc),
  "A8: chip wraps fetch in try/catch (no unhandled rejections)",
);

// ============================================================================
// Section B — Summarize route surfaces aiUsageId
// ============================================================================

const SUMMARIZE_ROUTE = path.join(
  ROOT,
  "app",
  "api",
  "ai",
  "summarize",
  "route.ts",
);
assert(fs.existsSync(SUMMARIZE_ROUTE), "B0: summarize route exists");
const routeSrc = fs.readFileSync(SUMMARIZE_ROUTE, "utf8");

// recordAiUsage return value captured (was previously a fire-and-forget
// `await recordAiUsage(...)`; now must be `const x = await recordAiUsage(...)`).
assert(
  /const\s+\w+\s*=\s*await\s+recordAiUsage\(/.test(routeSrc),
  "B1: summarize captures recordAiUsage return value",
);
// Both response branches surface aiUsageId.
const aiUsageIdInResponse =
  /aiUsageId:\s*\w+\.applied\s*\?\s*\w+\.id\s*:\s*null/g;
const matches = routeSrc.match(aiUsageIdInResponse);
assert(
  matches !== null && matches.length >= 2,
  `B2: aiUsageId surfaced in BOTH 200 + 207 response bodies (got ${matches?.length ?? 0} occurrences; expected 2)`,
);

// ============================================================================
// Section C — SummarizePdfTool wired correctly
// ============================================================================

const TOOL_PATH = path.join(
  ROOT,
  "components",
  "tools",
  "SummarizePdfTool.tsx",
);
assert(fs.existsSync(TOOL_PATH), "C0: SummarizePdfTool.tsx exists");
const toolSrc = fs.readFileSync(TOOL_PATH, "utf8");

assert(
  /import\s*\{\s*FeedbackChip\s*\}\s*from\s*"@\/components\/feedback\/FeedbackChip"/.test(
    toolSrc,
  ),
  "C1: imports FeedbackChip from @/components/feedback/FeedbackChip",
);
// SummaryResult type carries aiUsageId field.
assert(
  /aiUsageId:\s*string\s*\|\s*null/.test(toolSrc),
  "C2: SummaryResult type declares aiUsageId: string | null",
);
// Response parser captures aiUsageId from body.
assert(
  /typeof\s+body\.aiUsageId\s*===\s*["']string["']/.test(toolSrc),
  "C3: response parser captures body.aiUsageId from API response",
);
// JSX: <FeedbackChip ... /> with all 5 props.
assert(
  /<FeedbackChip[\s\S]{0,500}operation="summarize"/.test(toolSrc),
  "C4a: <FeedbackChip operation=\"summarize\" /> rendered",
);
assert(
  /<FeedbackChip[\s\S]{0,500}aiUsageId=\{result\.aiUsageId\}/.test(toolSrc),
  "C4b: aiUsageId prop wired from result state",
);
assert(
  /<FeedbackChip[\s\S]{0,500}fileId=\{result\.fileId\s*\?\?\s*null\}/.test(
    toolSrc,
  ),
  "C4c: fileId prop wired with null fallback",
);
assert(
  /<FeedbackChip[\s\S]{0,500}providerId=\{result\.providerId\}/.test(toolSrc),
  "C4d: providerId prop wired",
);
assert(
  /<FeedbackChip[\s\S]{0,500}model=\{result\.model\}/.test(toolSrc),
  "C4e: model prop wired",
);

// ============================================================================
// Section D — Rollout doc + WIRED_TOOLS sync
// ============================================================================

assert(fs.existsSync(ROLLOUT_DOC_PATH), "D0: AI_FEEDBACK_ROLLOUT.md exists");
const docSrc = fs.existsSync(ROLLOUT_DOC_PATH)
  ? fs.readFileSync(ROLLOUT_DOC_PATH, "utf8")
  : "";

assert(
  /Stage 1 — foundation/.test(docSrc),
  "D1: rollout doc has Stage 1 section",
);
assert(
  /Stage 2 — FeedbackChip \+ Summarize pilot/.test(docSrc),
  "D2: rollout doc has Stage 2 section",
);
assert(
  /Stage 3 — fleet rollout/.test(docSrc),
  "D3: rollout doc has Stage 3 section",
);
// Doc must enumerate the rollout batches A/B/C.
assert(
  /Batch A/.test(docSrc) && /Batch B/.test(docSrc) && /Batch C/.test(docSrc),
  "D4: rollout doc enumerates Batch A/B/C plan",
);

// Cross-check: every tool in WIRED_TOOLS has its files present.
for (const tool of WIRED_TOOLS) {
  const compPath = path.join(ROOT, tool.component);
  const routePath = path.join(ROOT, tool.route);
  assert(
    fs.existsSync(compPath),
    `D5.${tool.operation}.component: ${tool.component} exists`,
  );
  assert(
    fs.existsSync(routePath),
    `D5.${tool.operation}.route: ${tool.route} exists`,
  );
  // Each wired tool's component must contain a FeedbackChip render
  // referencing its operation. This is the cross-file invariant
  // that catches "tool added to WIRED_TOOLS list but the chip wasn't
  // actually wired in."
  const componentSrc = fs.readFileSync(compPath, "utf8");
  assert(
    new RegExp(`operation="${tool.operation}"`).test(componentSrc),
    `D5.${tool.operation}.chip: <FeedbackChip operation="${tool.operation}" /> rendered in ${tool.component}`,
  );
}

// ============================================================================
// Output
// ============================================================================

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`ai-feedback-pilot: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
