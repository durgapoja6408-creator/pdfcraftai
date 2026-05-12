#!/usr/bin/env node
// scripts/test-multi-week-foundations.mjs
//
// 2026-05-12 — pins the foundation pieces shipped today for three
// multi-week initiatives that genuinely don't fit in a single
// session. Each item ships its responsible first-pass:
//
//   §5c (Edit Text in PDFs) — EDIT_PDF_TEXT feature flag added to
//   FEATURE_FLAGS. Foundation only — NO user-facing surface (would
//   recreate the compress-pdf bait-and-switch problem). Real work is
//   2-3 weeks of PDFBox sidecar or PDFium-write-engine integration.
//
//   T2-4 (Refactor 5 largest tool files) — test-tool-file-loc-
//   ceiling.mjs locks the current LOC counts as a no-worsening
//   ceiling. Real refactor is 1-week multi-file work. Ceiling stops
//   the silent growth (caught +285 LOC silent growth in this batch).
//
//   §5f / T1-4 / T2-7 (Mobile UI hardening) — tests/e2e/visual-
//   editors-mobile.spec.ts establishes the mobile floor across the
//   13 PageEditorTool consumers (page loads, no horizontal overflow,
//   touch-target audit). Real touch-first redesign is 1-2 weeks.
//
// Pure static-parse.

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const report = [];
function check(label, predicate) {
  const ok = !!predicate;
  if (ok) pass++; else fail++;
  report.push({ label, ok });
}

// ─── §5c foundation ───
const FLAGS = readFileSync("lib/flags.ts", "utf8");
check(
  "5c.A1: EDIT_PDF_TEXT defined in FEATURE_FLAGS",
  /EDIT_PDF_TEXT:\s*"edit_pdf_text"/.test(FLAGS)
);
check(
  "5c.A2: rationale documents NO user-facing surface ships",
  (() => {
    const idx = FLAGS.indexOf("EDIT_PDF_TEXT:");
    if (idx < 0) return false;
    const before = FLAGS.slice(Math.max(0, idx - 2000), idx);
    return /No user-facing tool ships/.test(before);
  })()
);
check(
  "5c.A3: rationale cites bait-and-switch precedent",
  (() => {
    const idx = FLAGS.indexOf("EDIT_PDF_TEXT:");
    if (idx < 0) return false;
    const before = FLAGS.slice(Math.max(0, idx - 2000), idx);
    return /compress-pdf bait-and-switch/.test(before);
  })()
);
check(
  "5c.A4: rationale cites T1-1 fix commit",
  (() => {
    const idx = FLAGS.indexOf("EDIT_PDF_TEXT:");
    if (idx < 0) return false;
    const before = FLAGS.slice(Math.max(0, idx - 2000), idx);
    return /T1-1/.test(before) && /19e52a4/.test(before);
  })()
);

// ─── T2-4 LOC ceiling ───
const LOC_GUARD = readFileSync(
  "scripts/test-tool-file-loc-ceiling.mjs",
  "utf8"
);
check(
  "T2-4.B1: LOC ceiling guard exists",
  LOC_GUARD.length > 0
);
const TARGETS = [
  "SummarizeVariantTool.tsx",
  "SignPdfTool.tsx",
  "PdfSplitTool.tsx",
  "PageGridTool.tsx",
  "PdfAddLinksTool.tsx",
];
for (const file of TARGETS) {
  check(
    `T2-4.B2: ceiling covers ${file}`,
    new RegExp(file).test(LOC_GUARD)
  );
}
check(
  "T2-4.B3: uses newline-count (matches wc -l), not split-segment count",
  /\(src\.match\(\/\\n\/g\)\s*\|\|\s*\[\]\)\.length/.test(LOC_GUARD)
);
check(
  // 2026-05-12 SEV-1: ceiling expanded from 5 component files to 9
  // (added lib/admin/queries.ts, lib/ai/summarize.ts, lib/ai/margin-
  // rollup.ts, lib/ai/sign.ts). The aggregate label is now derived
  // from Object.keys(CEILINGS).length so it stays accurate as the
  // ceiling expands. Match the dynamic template literal not the
  // hardcoded number.
  "T2-4.B4: aggregate ceiling check present (any file-count)",
  /total LOC across \$\{Object\.keys\(CEILINGS\)\.length\} files/.test(LOC_GUARD)
);

// ─── §5f mobile spec ───
const MOBILE = readFileSync(
  "tests/e2e/visual-editors-mobile.spec.ts",
  "utf8"
);
check("5f.C1: mobile spec exists", MOBILE.length > 0);
check(
  "5f.C2: scoped to mobile via test.skip on isMobile",
  /test\.skip\([\s\S]{0,200}?isMobile/.test(MOBILE)
);
const EDITORS = [
  "add-text-box",
  "add-page-numbers",
  "pdf-overlay",
  "image-watermark",
  "sign-pdf-free",
  "free-draw-pdf",
  "pdf-add-links",
  "pdf-crop",
  "pdf-highlight",
  "redact-free",
  "bates-numbers",
  "stamp-pdf",
  "pdf-form-fill",
];
for (const id of EDITORS) {
  check(
    `5f.C3: mobile spec covers ${id}`,
    new RegExp(`"${id}"`).test(MOBILE)
  );
}
check(
  "5f.C4: horizontal-overflow check present",
  /scrollWidth[\s\S]{0,200}?clientWidth/.test(MOBILE)
);
check(
  "5f.C5: touch-target 44px audit present (WCAG 2.5.5 AAA floor)",
  /44/.test(MOBILE) && /touch.target/i.test(MOBILE)
);

console.log("multi-week-foundations:");
for (const r of report) console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}`);
console.log(
  `multi-week-foundations: ${pass} passed, ${fail} failed (of ${pass + fail})`
);
process.exit(fail === 0 ? 0 : 1);
