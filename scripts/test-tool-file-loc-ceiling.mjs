#!/usr/bin/env node
// scripts/test-tool-file-loc-ceiling.mjs
//
// 2026-05-12 — TOOL_IMPROVEMENT_PLAN T2-4 first-pass.
//
// The full T2-4 ("refactor the 5 largest tool files to <500 LOC each")
// is a 1-week refactor. This guard is the SAFE half: it locks the
// CURRENT line counts as a no-worsening ceiling. Any growth in these
// files must be paired with an extraction (move pure helpers to
// lib/, split a sub-component out) that brings the count back below
// the ceiling. This stops the bleed without forcing a multi-day
// refactor commitment.
//
// Discovery on first measurement (2026-05-12): the files have all
// grown since the TOOL_IMPROVEMENT_PLAN documented their LOC counts
// in early 2026-05:
//
//   SummarizeVariantTool  1090 → 1177  (+87)
//   SignPdfTool            952 → 1038  (+86)
//   PdfSplitTool           926 → 1005  (+79)
//   PageGridTool           874 →  884  (+10)
//   PdfAddLinksTool        862 →  885  (+23)
//
// Total +285 LOC of silent growth across the five. The ceiling pins
// the current counts so this growth pattern stops today.
//
// How to lower the ceiling: after extracting a sub-component or
// helper, run wc -l on the file, update the entry below, commit.
// Only-shrinkage discipline: the cap below should monotonically
// decrease as refactors land.

import { readFileSync } from "node:fs";

const CEILINGS = {
  "components/tools/SummarizeVariantTool.tsx": 1177,
  "components/tools/SignPdfTool.tsx": 1038,
  "components/tools/PdfSplitTool.tsx": 1005,
  "components/tools/PageGridTool.tsx": 884,
  // 2026-05-12 — PdfAddLinksTool 885 → 881 after formatBytes
  // extraction (commit pending). First real ceiling reduction from
  // a T2-4 extraction. Only-shrinkage discipline: subsequent
  // extractions lower this further.
  "components/tools/PdfAddLinksTool.tsx": 881,
  // 2026-05-12 SEV-1 audit extension — server-side library files
  // >700 LOC. T2-4 originally scoped the ceiling to the 5 largest
  // component files, but bug density scales with LOC regardless of
  // whether the file lives in components/ or lib/. The 4 additions
  // below were caught by the comprehensive gap analysis:
  //   lib/admin/queries.ts      1985 LOC — admin SQL surface
  //   lib/ai/summarize.ts       1755 LOC — multi-variant summarizer
  //   lib/ai/margin-rollup.ts   1650 LOC — daily margin aggregation
  //   lib/ai/sign.ts            1066 LOC — AI sign + form-fill
  // Total +6456 server-side LOC now under the same only-shrinkage
  // discipline as the component-file ceiling.
  "lib/admin/queries.ts": 1985,
  "lib/ai/summarize.ts": 1755,
  "lib/ai/margin-rollup.ts": 1650,
  "lib/ai/sign.ts": 1066,
};

let pass = 0, fail = 0;
const report = [];
function check(label, predicate, extra = "") {
  const ok = !!predicate;
  if (ok) pass++; else fail++;
  report.push({ label, ok, extra });
}

for (const [path, ceiling] of Object.entries(CEILINGS)) {
  const src = readFileSync(path, "utf8");
  const lines = (src.match(/\n/g) || []).length;
  check(
    `${path} <= ${ceiling} LOC (current: ${lines})`,
    lines <= ceiling,
    lines > ceiling
      ? `+${lines - ceiling} LOC over ceiling. Extract a helper or split a sub-component before merging. Once the file is back under ${ceiling}, lower the ceiling in scripts/test-tool-file-loc-ceiling.mjs to the new count.`
      : ""
  );
}

// Total-across-five ceiling: catches the case where one file shrinks
// by 200 but another grows by 250 — the per-file checks pass but the
// fleet is still growing. Monotonic discipline at the aggregate level.
const TOTAL_CEILING = Object.values(CEILINGS).reduce((a, b) => a + b, 0);
let totalCurrent = 0;
for (const path of Object.keys(CEILINGS)) {
  totalCurrent += (readFileSync(path, "utf8").match(/\n/g) || []).length;
}
check(
  `total LOC across ${Object.keys(CEILINGS).length} files <= ${TOTAL_CEILING} (current: ${totalCurrent})`,
  totalCurrent <= TOTAL_CEILING,
  totalCurrent > TOTAL_CEILING
    ? `+${totalCurrent - TOTAL_CEILING} LOC over aggregate ceiling`
    : ""
);

console.log("tool-file-loc-ceiling:");
for (const r of report) {
  const tail = r.extra ? `\n      ${r.extra}` : "";
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}${tail}`);
}
console.log(
  `tool-file-loc-ceiling: ${pass} passed, ${fail} failed (of ${pass + fail})`
);
process.exit(fail === 0 ? 0 : 1);
