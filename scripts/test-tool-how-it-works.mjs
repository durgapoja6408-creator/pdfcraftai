#!/usr/bin/env node
/**
 * 2026-05-08 — Item #8 from the improvement analysis: inline tool
 * explainers. SummarizePdfTool ships as the canary; other 30+
 * tool runners follow the same pattern in a follow-up sweep.
 *
 * What this guard catches:
 *   - ToolHowItWorks component file deleted/renamed
 *   - Component reverts to a non-<details> implementation (would
 *     lose default keyboard-accessibility + screen-reader behavior)
 *   - Component drops the steps prop (the 3-step structure is the
 *     canonical form across all SEO landing pages)
 *   - Canary mount removed from SummarizePdfTool
 *   - Canary mount drops the privacyNote (zero-retention messaging
 *     is the load-bearing differentiator on the AI surface)
 *   - Steps array reduced below 3 (loses the canonical 3-step
 *     parity with /summarize-pdf landing page)
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

const COMP_PATH = path.join(ROOT, "components/tools/ToolHowItWorks.tsx");
const TOOL_PATH = path.join(ROOT, "components/tools/SummarizePdfTool.tsx");

assert(fs.existsSync(COMP_PATH), `ToolHowItWorks missing at ${COMP_PATH}`);
assert(fs.existsSync(TOOL_PATH), `SummarizePdfTool missing at ${TOOL_PATH}`);

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  console.log(`tool-how-it-works: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

const COMP_SRC = fs.readFileSync(COMP_PATH, "utf8");
const TOOL_SRC = fs.readFileSync(TOOL_PATH, "utf8");

// ---------------------------------------------------------------------
// Section A — component shape.
// ---------------------------------------------------------------------

assert(
  /export\s+function\s+ToolHowItWorks\s*\(/.test(COMP_SRC),
  "Named export `ToolHowItWorks` not found.",
);

assert(
  /<details/.test(COMP_SRC),
  "Component must use a native <details> element. Reimplementing " +
    "the collapse with useState would lose default keyboard " +
    "accessibility (Enter/Space toggle, screen-reader 'expanded/" +
    "collapsed' announcements).",
);

assert(
  /<summary/.test(COMP_SRC),
  "Component must use a <summary> as the toggle. <details> without " +
    "<summary> renders nothing for the click target.",
);

assert(
  /steps\s*:\s*Array<\s*\{\s*title\s*:\s*string;\s*body\s*:\s*string\s*\}\s*>/.test(
    COMP_SRC,
  ),
  "Props type must include `steps: Array<{ title: string; body: string }>`. " +
    "The 3-step shape is canonical across the SEO landing pages — " +
    "loosening the shape would let tools drift into 1-step or 5-step " +
    "explainers and the design language fragments.",
);

assert(
  /privacyNote\?\s*:\s*string/.test(COMP_SRC),
  "Props type must include optional `privacyNote?: string`. Zero-" +
    "retention messaging is load-bearing on the AI surface (items " +
    "#4, #22) — the explainer needs a place to surface it.",
);

// ---------------------------------------------------------------------
// Section B — SummarizePdfTool wires the canary.
// ---------------------------------------------------------------------

assert(
  /import\s*\{\s*ToolHowItWorks\s*\}\s*from\s*"\.\/ToolHowItWorks"/.test(
    TOOL_SRC,
  ),
  "SummarizePdfTool must import ToolHowItWorks. Without the import, " +
    "the canary mount below fails at compile time.",
);

assert(
  /<ToolHowItWorks[\s\S]*?steps=\{\[[\s\S]*?\]\}/.test(TOOL_SRC),
  "SummarizePdfTool must mount <ToolHowItWorks steps={[...]} />. " +
    "Pass exactly the 3-step canonical structure for parity with " +
    "/summarize-pdf landing.",
);

// Count the step entries — each is `{ title: ... }`. There must be
// at least 3 (the canonical structure across landing pages).
const stepsBlock = TOOL_SRC.match(
  /<ToolHowItWorks[\s\S]*?steps=\{(\[[\s\S]*?\])\}/,
);
const stepTitleCount = stepsBlock
  ? (stepsBlock[1].match(/title\s*:/g) || []).length
  : 0;
assert(
  stepTitleCount >= 3,
  `SummarizePdfTool's <ToolHowItWorks steps={[...]}> has ${stepTitleCount} ` +
    "step(s); minimum 3 to match the canonical 3-step structure used " +
    "across all /tool-name SEO landing pages. Loosening this lets " +
    "individual tool explainers drift away from the design language.",
);

assert(
  /<ToolHowItWorks[\s\S]*?privacyNote=/.test(TOOL_SRC),
  "SummarizePdfTool must pass the privacyNote prop. The canary's " +
    "whole point is showing tool-specific privacy messaging — without " +
    "it, future tool migrations might forget the prop entirely.",
);

assert(
  /privacyNote=["'][^"']*never persisted[^"']*["']|privacyNote=["'][^"']*Zero retention[^"']*["']/i.test(
    TOOL_SRC,
  ),
  "SummarizePdfTool's privacyNote must reference 'never persisted' or " +
    "'Zero retention'. These are the canonical zero-retention phrases " +
    "introduced in items #4 + #22; using a different formulation here " +
    "fragments the privacy story.",
);

// ---------------------------------------------------------------------
// Section C — Sweep expansion to top free tools (batch 2).
// ---------------------------------------------------------------------
//
// 2026-05-11 — beyond the SummarizePdfTool canary, the explainer
// pattern is now also wired on the top 3 free tools (merge / split
// / compress). Each must:
//   - Import ToolHowItWorks
//   - Mount with at least 3 steps
//   - Pass a privacyNote that mentions tool-specific privacy
//     posture (free tools say "in your browser" or "never leaves
//     your machine"; the canary AI tool says "never persisted").
//
// As tools are added to this sweep, list them here. Adding a tool
// to the list without wiring fails CI; removing wiring without
// removing the entry also fails. Both directions correct.

const SWEEP_FREE_TOOLS = [
  "PdfMergeTool",
  "PdfSplitTool",
  "PdfCompressTool",
  // 2026-05-11 sweep batch 3 — Rotate + Unlock.
  "PdfRotateTool",
  "PdfUnlockTool",
  // 2026-05-11 sweep batch 4 — PageNumbers + Stamp + SortPages.
  "PdfPageNumbersTool",
  "PdfStampTool",
  "PdfSortPagesTool",
  // 2026-05-11 sweep batch 5 — base-component refactor (PdfSimpleOpsTool
  // + PageEditorTool now thread a `howItWorks` prop) unblocked these.
  "PdfBatesNumbersTool",
  "PdfHighlightTool",
  // 2026-05-11 sweep batch 6 — bulk migration of 5 more PageEditorTool
  // consumers (Crop / FreeDraw / AddLinks / AddTextBox / RedactTool-free).
  "PdfCropTool",
  "PdfFreeDrawTool",
  "PdfAddLinksTool",
  "PdfAddTextBoxTool",
  "PdfRedactTool",
  // 2026-05-11 sweep batch 7 — remaining 6 shared-base tools
  // (Booklet / Grayscale / NUp / OddEvenPages → PdfSimpleOpsTool;
  // ImageWatermark / SignFree → PageEditorTool). All shared-base
  // consumers now wired through the howItWorks prop.
  "PdfBookletTool",
  "PdfGrayscaleTool",
  "PdfNUpTool",
  "PdfOddEvenPagesTool",
  "PdfImageWatermarkTool",
  "PdfSignTool",
  // 2026-05-11 sweep batch 8 — direct-ToolDropzone tools.
  // PdfChecklistTool gained a `howItWorks` prop (same shape as the
  // shared-base refactor in batches 5-7) so all 4 audit wrappers
  // (PDF/A check, PDF/X check, accessibility, JS detector) wire
  // it via their own ToolHowItWorks. PdfInspectorTool / PageCountTool /
  // ExtractImagesTool / ExtractAttachmentsTool mount ToolHowItWorks
  // directly above their own ToolDropzone.
  "PdfChecklistTool",
  "PdfInspectorTool",
  "PageCountTool",
  "ExtractImagesTool",
  "ExtractAttachmentsTool",
  // 2026-05-11 sweep batch 9 — PdfReadOpsTool consumers.
  // PdfReadOpsTool itself gained a `howItWorks?: ReactNode` prop
  // (same slot-fill pattern as batches 5-8). All 6 byte-parser
  // tools that use it now thread their own ToolHowItWorks block:
  // PdfAnnotationsTool, PdfAttachmentsTool, PdfFontsTool,
  // PdfFormsTool, ExtractContactsTool, ExtractDatesTool.
  "PdfAnnotationsTool",
  "PdfAttachmentsTool",
  "PdfFontsTool",
  "PdfFormsTool",
  "ExtractContactsTool",
  "ExtractDatesTool",
  // 2026-05-11 sweep batch 10 — PageGridTool consumers + inline-
  // dropzone tools. PageGridTool gained a `howItWorks?: React.ReactNode`
  // prop (same slot pattern as the other 4 base components from
  // batches 5-9), wiring Delete + Extract Pages. The 4 inline-
  // dropzone tools (PdfFormFillTool / PdfDiffTool / CsvToPdfTool /
  // PdfBatchProcessTool) mount ToolHowItWorks directly above their
  // custom dropzones.
  "PdfDeletePagesTool",
  "PdfExtractPagesTool",
  "PdfFormFillTool",
  "PdfDiffTool",
  "CsvToPdfTool",
  "PdfBatchProcessTool",
  // 2026-05-11 sweep batch 11 — top-traffic AI tools. The Summarize
  // canary from batch 1 ships ToolHowItWorks; the remaining
  // headline AI tools were still bare. Wired in one batch:
  // Translate, Compare, Rewrite, Generate, OCR, TableExtract, Tldr.
  // All AI tools use the "Zero retention" / "in-memory" canonical
  // phrase (vs free tools' "in your browser" / "never leaves your
  // machine") per the privacy-story parity established in batch 2.
  "TranslatePdfTool",
  "ComparePdfTool",
  "RewritePdfTool",
  "GeneratePdfTool",
  "OcrPdfTool",
  "TableExtractTool",
  "TldrPdfTool",
  // 2026-05-11 sweep batch 12 — remaining free tools. PdfLinks /
  // PdfOutline use the PdfReadOpsTool howItWorks prop from
  // batch 9; PdfResize uses the PdfSimpleOpsTool howItWorks prop
  // from batch 5. PdfRasterize / PdfTextExport / PdfaConvert /
  // SearchPdf mount directly above their own ToolDropzone.
  // ImagesToPdf / MarkdownToPdf / TextToPdf / PdfOverlay use inline
  // custom dropzones. PdfaConvert is server-side Ghostscript so
  // it uses "discarded immediately" privacy phrase.
  "PdfLinksTool",
  "PdfOutlineTool",
  "PdfResizeTool",
  "PdfRasterizeTool",
  "PdfTextExportTool",
  "PdfaConvertTool",
  "SearchPdfTool",
  "ImagesToPdfTool",
  "MarkdownToPdfTool",
  "TextToPdfTool",
  "PdfOverlayTool",
];

for (const name of SWEEP_FREE_TOOLS) {
  const p = path.join(ROOT, `components/tools/${name}.tsx`);
  if (!fs.existsSync(p)) {
    assert(false, `${name}: file missing at ${p}`);
    continue;
  }
  const src = fs.readFileSync(p, "utf8");

  assert(
    /import\s*\{\s*ToolHowItWorks\s*\}\s*from\s*"\.\/ToolHowItWorks"/.test(src),
    `${name}: must import ToolHowItWorks. Without the import, the " +
      "mount below fails at compile time.`,
  );

  assert(
    /<ToolHowItWorks[\s\S]*?steps=\{\[[\s\S]*?\]\}/.test(src),
    `${name}: must mount <ToolHowItWorks steps={[...]} />.`,
  );

  const stepsMatch = src.match(/<ToolHowItWorks[\s\S]*?steps=\{(\[[\s\S]*?\])\}/);
  const titleCount = stepsMatch
    ? (stepsMatch[1].match(/title\s*:/g) || []).length
    : 0;
  assert(
    titleCount >= 3,
    `${name}: <ToolHowItWorks steps={[...]}> has ${titleCount} step(s); ` +
      "minimum 3 to match the canonical structure.",
  );

  assert(
    /<ToolHowItWorks[\s\S]*?privacyNote=/.test(src),
    `${name}: must pass the privacyNote prop.`,
  );

  // Free tools say "in your browser" OR "never leaves your machine"
  // OR "never persisted" (the AI-tool canonical) — any of these
  // three load-bearing phrases satisfies the privacy-story parity
  // requirement.
  assert(
    /privacyNote=["'][^"']*(in your browser|never leaves|never persisted|Zero retention|discarded immediately)[^"']*["']/i.test(
      src,
    ),
    `${name}: privacyNote must reference a canonical privacy phrase ` +
      "('in your browser', 'never leaves', 'never persisted', " +
      "'Zero retention', or 'discarded immediately'). Drift here " +
      "fragments the privacy story.",
  );
}

// ---------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
}

console.log(`tool-how-it-works: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
