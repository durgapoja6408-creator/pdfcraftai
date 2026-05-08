#!/usr/bin/env node
/**
 * 2026-05-08 — Item #5 from the improvement analysis: loading state
 * polish. Specifically — wire `fetchAiWithRetry`'s `onAttempt`
 * callback into the AI tool runners' busy-state UI so a transient
 * 5xx that triggers a retry doesn't read as a frozen
 * "Summarizing…" button for 7 seconds (1s + 2s + 4s backoff).
 *
 * SummarizePdfTool ships as the canary; other 9 AI tool runners
 * follow the same pattern in a follow-up sweep.
 *
 * What this guard catches:
 *   - retryAttempt + retryMax state stripped out (would silence
 *     the retry indicator)
 *   - onAttempt wiring removed from the fetchAiWithRetry call
 *     (would leave the state always 0)
 *   - Reset-in-finally dropped (state would persist after
 *     completion, showing stale "Retrying… (3/3)" forever)
 *   - Button label conditional reverted to busy-only (would lose
 *     the "Retrying… (n/m)" affordance)
 *   - aria-busy attribute dropped (assistive tech wouldn't
 *     announce the in-flight state)
 *
 * Pure static parse. Sub-second.
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

// 2026-05-08 — sweep expansion. The retry-status pattern was first
// shipped on SummarizePdfTool as a canary; this list grows as the
// pattern is mass-applied to other AI tool runners. Adding a tool
// here without the wiring fails CI; removing the wiring without
// removing the entry also fails CI. Both directions are correct
// regression signals.
const TOOL_PATHS = [
  path.join(ROOT, "components/tools/SummarizePdfTool.tsx"),
  path.join(ROOT, "components/tools/TranslatePdfTool.tsx"),
  path.join(ROOT, "components/tools/ComparePdfTool.tsx"),
  path.join(ROOT, "components/tools/RewritePdfTool.tsx"),
  // 2026-05-08 sweep batch 2 — Generate / OCR / Redact.
  path.join(ROOT, "components/tools/GeneratePdfTool.tsx"),
  path.join(ROOT, "components/tools/OcrPdfTool.tsx"),
  path.join(ROOT, "components/tools/RedactPdfTool.tsx"),
];

for (const p of TOOL_PATHS) {
  assert(fs.existsSync(p), `${path.basename(p)} missing at ${p}`);
}

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  console.log(`retry-status-ux: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

// Each tool gets the same set of assertions. We loop the canonical
// SummarizePdfTool checks across every tool path; failures report
// the offending tool so the operator sees exactly which file lost
// the wiring.
const SUMMARIZE_PATH = path.join(ROOT, "components/tools/SummarizePdfTool.tsx");
const SRC = fs.readFileSync(SUMMARIZE_PATH, "utf8");

// ---------------------------------------------------------------------
// Section A — retryAttempt + retryMax state declared.
// ---------------------------------------------------------------------

assert(
  /const\s+\[retryAttempt\s*,\s*setRetryAttempt\]\s*=\s*useState\(\s*0\s*\)/.test(
    SRC,
  ),
  "retryAttempt state must be declared as `useState(0)`. The 0 " +
    "default is what makes the button label show 'Summarize' on the " +
    "normal first-attempt path (only flips to 'Retrying…' when " +
    "attempt > 1).",
);

assert(
  /const\s+\[retryMax\s*,\s*setRetryMax\]\s*=\s*useState\(\s*0\s*\)/.test(SRC),
  "retryMax state must be declared as `useState(0)`. Used to render " +
    "the denominator in 'Retrying… (n/m)'.",
);

// ---------------------------------------------------------------------
// Section B — onAttempt wired into fetchAiWithRetry.
// ---------------------------------------------------------------------

assert(
  /onAttempt:\s*\(attempt\s*,\s*max\)\s*=>/.test(SRC),
  "fetchAiWithRetry call must include `onAttempt: (attempt, max) => ...`. " +
    "Without this, the retry happens silently and the button stays " +
    "frozen at 'Summarizing…' for the full backoff window.",
);

assert(
  /if\s*\(\s*attempt\s*>\s*1\s*\)\s*\{[\s\S]{0,120}setRetryAttempt\(attempt\)/.test(
    SRC,
  ),
  "onAttempt callback must gate setRetryAttempt on `attempt > 1`. " +
    "The first attempt is the normal path; setting state on attempt=1 " +
    "would briefly show 'Retrying… (1/3)' which is confusing.",
);

// ---------------------------------------------------------------------
// Section C — reset in finally block.
// ---------------------------------------------------------------------

assert(
  /finally\s*\{[\s\S]*?setBusy\(false\);[\s\S]*?setRetryAttempt\(0\);[\s\S]*?setRetryMax\(0\);[\s\S]*?\}/.test(
    SRC,
  ),
  "finally block must reset BOTH retryAttempt AND retryMax to 0 " +
    "alongside setBusy(false). Without the reset, the button keeps " +
    "showing the last 'Retrying… (3/3)' label even after the op " +
    "completes.",
);

// ---------------------------------------------------------------------
// Section D — button label uses the conditional ladder.
// ---------------------------------------------------------------------
//
// Required ladder: retryAttempt > 0 → "Retrying… (n/m)"; busy → "Summarizing…";
// idle → "Summarize". Order matters: retry takes priority over busy
// because the user needs the more-specific signal during a retry.

assert(
  /retryAttempt\s*>\s*0\s*\?\s*`Retrying… \(\$\{retryAttempt\}\/\$\{retryMax\}\)`\s*:\s*busy\s*\?\s*"Summarizing…"\s*:\s*"Summarize"/.test(
    SRC,
  ),
  "Button label must use the ladder " +
    "`retryAttempt > 0 ? \\`Retrying… (\\${retryAttempt}/\\${retryMax})\\` " +
    ": busy ? \"Summarizing…\" : \"Summarize\"`. The retry branch " +
    "comes FIRST because during a retry the user needs the more-" +
    "specific signal — busy alone would just show 'Summarizing…'.",
);

// ---------------------------------------------------------------------
// Section E — aria-busy attribute on the button.
// ---------------------------------------------------------------------

assert(
  /aria-busy=\{busy\}/.test(SRC),
  "Button must include `aria-busy={busy}` so assistive tech " +
    "announces the in-flight state. Without it, screen-reader users " +
    "have no signal that the click did anything.",
);

// ---------------------------------------------------------------------
// Section F — sweep expansion: all listed tools have the wiring.
// ---------------------------------------------------------------------
//
// The canonical pattern from SummarizePdfTool above (Section A-E) is
// now applied to multiple tools. Each must have:
//   1. retryAttempt + retryMax state declared as useState(0)
//   2. onAttempt: (attempt, max) => { if (attempt > 1) ... } wiring
//      passed to fetchAiWithRetry
//   3. setRetryAttempt(0) + setRetryMax(0) in the finally block
//   4. aria-busy={busy} on the button
//
// Loop every TOOL_PATH and assert each invariant. Failures name
// the specific tool so the regression is immediately localizable.

for (const tp of TOOL_PATHS) {
  const fname = path.basename(tp);
  const src = fs.readFileSync(tp, "utf8");

  assert(
    /const\s+\[retryAttempt\s*,\s*setRetryAttempt\]\s*=\s*useState\(\s*0\s*\)/.test(
      src,
    ),
    `${fname}: missing retryAttempt useState(0) declaration.`,
  );
  assert(
    /const\s+\[retryMax\s*,\s*setRetryMax\]\s*=\s*useState\(\s*0\s*\)/.test(src),
    `${fname}: missing retryMax useState(0) declaration.`,
  );
  assert(
    /onAttempt:\s*\(attempt\s*,\s*max\)\s*=>/.test(src) &&
      /if\s*\(\s*attempt\s*>\s*1\s*\)/.test(src),
    `${fname}: missing onAttempt wiring with 'attempt > 1' gate inside ` +
      "fetchAiWithRetry options.",
  );
  assert(
    /finally\s*\{[\s\S]*?setRetryAttempt\(0\);[\s\S]*?setRetryMax\(0\);[\s\S]*?\}/.test(
      src,
    ),
    `${fname}: missing setRetryAttempt(0) + setRetryMax(0) in finally block.`,
  );
  assert(
    /aria-busy=\{busy\}/.test(src),
    `${fname}: missing aria-busy={busy} on the action button.`,
  );
}

// ---------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
}

console.log(`retry-status-ux: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
