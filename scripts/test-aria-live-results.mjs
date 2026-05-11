#!/usr/bin/env node
/**
 * 2026-05-08 — Item #14 (screen reader announcements). AI tool
 * runners that render a result card on success need the OUTER
 * card wrapper marked as a live region so assistive tech announces
 * the arrival when the result lands.
 *
 * Pattern: `role="status" aria-live="polite" aria-atomic="true"` on
 * the outer ResultCard root <div>. Polite (not assertive) because
 * a successful op completion shouldn't interrupt — should queue
 * after the user's current focus/announcement. Atomic ensures the
 * whole region is read on arrival rather than just the diff.
 *
 * Sister to the aria-busy={busy} pattern asserted by
 * test-retry-status-ux.mjs which covers the in-flight state.
 * Together: aria-busy on click → screen reader announces "busy",
 * aria-live status on result → screen reader announces the result
 * when it lands.
 *
 * Tools that render results inline (no ResultCard function) are
 * tracked separately and follow in a follow-up sweep — INLINE_RESULT_TOOLS
 * is the explicit allowlist below so we know which ones are
 * intentionally not yet wired.
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

// Tools with a `function ResultCard` declaration — the result-card
// wrapper is a discrete <div className="card"> we can pin. Each must
// have role="status" + aria-live="polite" + aria-atomic="true" on
// that root.
const RESULT_CARD_TOOLS = [
  "SummarizePdfTool",
  "TranslatePdfTool",
  "ComparePdfTool",
  "RewritePdfTool",
  "GeneratePdfTool",
  "OcrPdfTool",
  "RedactPdfTool",
  "SignPdfTool",
  "TableExtractTool",
];

// Tools that render results inline (no `function ResultCard`
// extraction) but HAVE been wired with aria-live anyway. Each gets
// the same three aria attributes; placement is per-file (the
// inline result-region <div> wherever the result conditional is).
// Asserts the three attributes are present somewhere in the file —
// can't anchor on a function boundary because there isn't one.
const INLINE_RESULT_TOOLS_WIRED = [
  "TldrPdfTool",
  "MindmapPdfTool",
  "ResumeParserTool",
  "BloodTestTool",
  "SemanticSearchPdfTool",
  // 2026-05-11 batch 3 — final 4 inline tools closed.
  "CourtOrderTool",
  "SearchablePdfTool",
  "StructuredVariantTool",
  "SummarizeVariantTool",
];

// Empty list now that every inline-result tool has been wired.
// Kept as a deliberate empty allowlist (not removed entirely) so a
// future inline-result tool added to the codebase has an obvious
// home and the "deferred" tracking pattern stays visible.
const INLINE_RESULT_TOOLS_DEFERRED = [];

for (const name of RESULT_CARD_TOOLS) {
  const p = path.join(ROOT, `components/tools/${name}.tsx`);
  if (!fs.existsSync(p)) {
    assert(false, `${name}: file missing at ${p}`);
    continue;
  }
  const src = fs.readFileSync(p, "utf8");

  // Locate the ResultCard function body. We assert the three aria
  // attributes appear within the function — placement on the outer
  // wrapper is enforced by the require-them-all-together pattern
  // below (a stray role="status" elsewhere wouldn't satisfy ALL three
  // checks together with aria-live polite + aria-atomic true).
  const fnIdx = src.indexOf("function ResultCard");
  assert(
    fnIdx >= 0,
    `${name}: no \`function ResultCard\` declaration found. If the ` +
      "result rendering moved inline, move this tool from " +
      "RESULT_CARD_TOOLS to INLINE_RESULT_TOOLS_DEFERRED in this guard.",
  );
  if (fnIdx < 0) continue;

  const body = src.slice(fnIdx);

  assert(
    /role="status"/.test(body),
    `${name}: ResultCard root must include role="status" so screen ` +
      "readers recognize the live region. Without it, aria-live " +
      "alone may not be announced consistently across AT/browser combos.",
  );
  assert(
    /aria-live="polite"/.test(body),
    `${name}: ResultCard root must include aria-live="polite". ` +
      "Polite (not assertive) — successful op completion shouldn't " +
      "interrupt the user's current focus/announcement.",
  );
  assert(
    /aria-atomic="true"/.test(body),
    `${name}: ResultCard root must include aria-atomic="true" so the ` +
      "entire region is read on arrival, not just the diff. Without " +
      "this, a re-render that touches a small substring would only " +
      "announce that fragment.",
  );
}

// INLINE_RESULT_TOOLS_WIRED — assert all three aria attributes
// appear somewhere in the file. Can't anchor on a function boundary
// because the result region is inline; the "all three together"
// requirement is what makes a stray role="status" elsewhere
// unable to false-positive (you'd need to also have aria-live polite
// AND aria-atomic true in the same file by accident).
for (const name of INLINE_RESULT_TOOLS_WIRED) {
  const p = path.join(ROOT, `components/tools/${name}.tsx`);
  if (!fs.existsSync(p)) {
    assert(false, `${name}: file missing at ${p}`);
    continue;
  }
  const src = fs.readFileSync(p, "utf8");
  assert(
    /role="status"/.test(src),
    `${name} (inline-wired): file must contain role="status" on the ` +
      "result region. If the result rendering was refactored, update " +
      "the placement OR move this tool back to INLINE_RESULT_TOOLS_DEFERRED.",
  );
  assert(
    /aria-live="polite"/.test(src),
    `${name} (inline-wired): file must contain aria-live="polite" on the ` +
      "result region.",
  );
  assert(
    /aria-atomic="true"/.test(src),
    `${name} (inline-wired): file must contain aria-atomic="true" on the ` +
      "result region.",
  );
}

// Sanity: every deferred-tool file still exists (file rename would
// silently drop coverage tracking). Empty deferred list is FINE —
// it's the goal state. Kept as an allowlist for future inline-result
// tools to have a documented home.
for (const name of INLINE_RESULT_TOOLS_DEFERRED) {
  const p = path.join(ROOT, `components/tools/${name}.tsx`);
  assert(
    fs.existsSync(p),
    `Deferred tool ${name} not found at ${p}. Renamed file? Update ` +
      "INLINE_RESULT_TOOLS_DEFERRED in this guard so the deferred-" +
      "scope tracking stays accurate.",
  );
}

console.log(
  `[info] aria-live wired on ${RESULT_CARD_TOOLS.length + INLINE_RESULT_TOOLS_WIRED.length} ` +
    `tools (${RESULT_CARD_TOOLS.length} ResultCard + ${INLINE_RESULT_TOOLS_WIRED.length} inline); ` +
    `${INLINE_RESULT_TOOLS_DEFERRED.length} inline-result tools deferred.`,
);

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
}

console.log(`aria-live-results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
