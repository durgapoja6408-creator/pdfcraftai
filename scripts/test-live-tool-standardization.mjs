#!/usr/bin/env node
// scripts/test-live-tool-standardization.mjs
//
// 2026-05-01: catch standardization-parity drift on free tools.
//
// Background: the 2026-05-01 jpg-to-pdf / png-to-pdf / text-to-pdf
// arc shipped 3 tools that wired up GA4 tracking + canonical errors
// + filename collision suffixes (3/7 standardized hooks), but
// skipped useScrollErrorIntoView + HandoffSuggestions (and their
// CI-enforced relatives). Result: those tools were ~43%
// standardized — same look as the rest, but no error scroll-into-
// view and no cross-tool funnel after success.
//
// This guard pins the floor: every tool wired into ToolRunner.tsx
// must wire up the standardized hooks too, OR pick up a shared
// base component (PageEditorTool / PageGridTool / PdfReadOpsTool /
// PdfSimpleOpsTool / PdfChecklistTool) which threads them through
// internally.
//
// The standardized 7-hook contract:
//   1. useTrackToolView (or shared base)
//   2. mapPdfOpError    (or shared base)
//   3. suffixedFilename (or shared base)
//   4. useScrollErrorIntoView (or shared base)
//   5. HandoffSuggestions (or shared base) — gated on PDF output
//   6. useHandoffConsumer (or shared base) — gated on PDF input
//   7. useFileUrlConsumer (or shared base) — gated on PDF input
//
// Hooks 6 + 7 are PDF-input-only by design (the registry stores
// PDF blobs, the ?file= deep-link spec assumes application/pdf).
// Tools whose input is non-PDF (jpg-to-pdf takes images, text-to-pdf
// takes text) are listed in NON_PDF_INPUT_TOOLS with a rationale
// — they're exempt from 6 + 7 only.
//
// Scope: client-side free tools wired into LIVE_TOOL_IDS. AI tools
// have a different contract (server-side fetch + auth + credit
// spend) and are explicitly skipped via AI_PREFIX.
//
// Output line conforms to the aggregator regex
// `${name}: ${pass} passed, ${fail} failed`.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

let pass = 0;
let fail = 0;
const failures = [];
function assert(label, cond, detail) {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push({ label, detail: detail ?? "" });
  }
}

// ---------------------------------------------------------------------
// Section A — parse the source-of-truth lists.
// ---------------------------------------------------------------------

const PAGE_SRC = readFileSync(
  resolve(ROOT, "app", "tool", "[id]", "page.tsx"),
  "utf8",
);
const RUNNER_SRC = readFileSync(
  resolve(ROOT, "components", "tools", "ToolRunner.tsx"),
  "utf8",
);

const liveBlock = PAGE_SRC.match(
  /LIVE_TOOL_IDS\s*=\s*new\s+Set<string>\(\[([\s\S]*?)\]\)/,
);
if (!liveBlock) {
  console.error("FATAL: LIVE_TOOL_IDS block not found.");
  process.exit(2);
}
const liveIds = new Set(
  [...liveBlock[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]),
);

assert(
  "LIVE_TOOL_IDS parsed",
  liveIds.size > 50,
  `expected >50 live ids, got ${liveIds.size}`,
);

// AI tools have a different standardization contract (auth, credit
// spend, server-side fetch via fetchAiWithRetry). They're outside
// this guard's scope.
const AI_PREFIX = "ai-";

// Map id → component name (from ToolRunner.tsx switch-cases).
// Pattern: `case "<id>": return <Component … />;`
// Multi-line returns (e.g. case statements with prop-spreading) are
// handled by capturing the JSX tag name on the next non-blank line.
const idToComponent = new Map();
// Map `const PdfFooExportTool = dyn(() => import("@/.../PdfFooTool")
// .then((m) => ({ default: m.PdfFooTool })))` so we can resolve
// dyn-import aliases back to their real component name.
const dynAliases = new Map();
{
  // Remove comments first to avoid matching commented-out cases.
  const stripped = RUNNER_SRC.replace(/\/\/.*$/gm, "").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const caseRe =
    /case\s+"([a-z0-9-]+)"\s*:\s*return\s*<\s*([A-Z][A-Za-z0-9]+)/g;
  let m;
  while ((m = caseRe.exec(stripped)) !== null) {
    idToComponent.set(m[1], m[2]);
  }
  // Pattern: `const Alias = dyn(() => import("@/components/tools/File")
  // .then((m) => ({ default: m.RealName })))`. We capture (Alias,
  // RealName) so the file-finder below uses RealName for definition
  // lookup.
  const dynRe =
    /const\s+([A-Z][A-Za-z0-9]+)\s*=\s*dyn\([\s\S]*?then\([^)]*?\(\s*m\s*\)\s*=>\s*\(\s*\{\s*default:\s*m\.([A-Z][A-Za-z0-9]+)/g;
  let d;
  while ((d = dynRe.exec(stripped)) !== null) {
    if (d[1] !== d[2]) dynAliases.set(d[1], d[2]);
  }
}

assert(
  "ToolRunner switch parses to component map",
  idToComponent.size > 50,
  `expected >50 case→component mappings, got ${idToComponent.size}`,
);

// ---------------------------------------------------------------------
// Section B — define the standardization contract.
// ---------------------------------------------------------------------

// Shared bases that thread the standardized hooks through internally.
// A tool that uses any of these is considered "standardized by
// inheritance" and skips per-hook checks.
const SHARED_BASES = new Set([
  "PageEditorTool",
  "PageGridTool",
  "PdfReadOpsTool",
  "PdfSimpleOpsTool",
  "PdfChecklistTool",
]);

// Pseudo-import test: an `import` line containing one of these
// substrings counts as "this tool wires up the hook".
const HOOK_REQUIREMENTS = [
  { name: "useTrackToolView", import: "useTrackToolView" },
  { name: "mapPdfOpError", import: "mapPdfOpError" },
  { name: "suffixedFilename", import: "suffixedFilename" },
  { name: "useScrollErrorIntoView", import: "useScrollErrorIntoView" },
  { name: "HandoffSuggestions", import: "HandoffSuggestions" },
];

// Hooks that only apply to PDF-input tools — non-PDF-input tools are
// exempted via NON_PDF_INPUT_TOOLS below.
const PDF_INPUT_HOOKS = [
  { name: "useHandoffConsumer", import: "useHandoffConsumer" },
  { name: "useFileUrlConsumer", import: "useFileUrlConsumer" },
];

// Tools whose INPUT is non-PDF. The handoff registry stores PDFs and
// the ?file= consumer hardcodes application/pdf MIME — both hooks
// are PDF-only by design. Non-PDF-input tools are exempt from those
// 2 hooks but must still meet the rest of the contract.
//
// Each entry MUST include a one-line rationale. Adding a new entry
// here means "we've decided this tool's input is genuinely non-PDF
// and the input-side hooks don't apply." If a tool's input is PDF,
// fix the wiring instead of adding to this exemption list.
const NON_PDF_INPUT_TOOLS = new Map([
  ["jpg-to-pdf", "input is image bytes; handoff registry is PDF-only"],
  ["png-to-pdf", "input is image bytes; handoff registry is PDF-only"],
  ["text-to-pdf", "input is plain text; ?file= consumer is PDF-only"],
  ["markdown-to-pdf", "input is markdown text; ?file= consumer is PDF-only"],
  ["csv-to-pdf", "input is CSV text; ?file= consumer is PDF-only"],
]);

// Tools that pre-date this guard and have partial standardization.
// They were shipped before the 7-hook contract was codified; some
// missed useScrollErrorIntoView, some missed mapPdfOpError, etc.
//
// NOT a free pass forever — each tool here is a TODO to migrate
// onto a shared base or wire the missing hooks. The map's value is
// the list of hooks the tool is exempt from, so adding a NEW miss
// (e.g. drift on useTrackToolView) still fails CI for that tool.
//
// Adding a new tool to this map requires evidence it was pre-existing
// drift (git blame / age check). New tools shipped after 2026-05-01
// must not appear here — they need to meet the contract OR get a
// principled exemption in NON_PDF_INPUT_TOOLS / NON_PDF_OUTPUT_TOOLS.
const KNOWN_PARTIAL_STANDARDIZATION = new Map([
  // Tier 1 wave (Build 2): inputs were wired with bespoke dropzones
  // before the 4 input/error hooks landed.
  ["rotate", ["useScrollErrorIntoView", "useHandoffConsumer", "useFileUrlConsumer", "HandoffSuggestions"]],
  ["unlock", ["useScrollErrorIntoView", "useHandoffConsumer", "useFileUrlConsumer", "HandoffSuggestions"]],
  ["page-numbers", ["mapPdfOpError", "useScrollErrorIntoView", "useHandoffConsumer", "useFileUrlConsumer", "HandoffSuggestions"]],
  ["stamp-pdf", ["mapPdfOpError", "useScrollErrorIntoView", "useHandoffConsumer", "useFileUrlConsumer", "HandoffSuggestions"]],
  // Render-and-render-only: pdf-to-image extractors keep their own
  // canvas pipeline; the standardized hooks weren't backported.
  ["pdf-to-jpg", ["suffixedFilename", "useScrollErrorIntoView", "useHandoffConsumer", "useFileUrlConsumer"]],
  ["pdf-to-png", ["suffixedFilename", "useScrollErrorIntoView", "useHandoffConsumer", "useFileUrlConsumer"]],
  ["pdf-search", ["suffixedFilename", "useScrollErrorIntoView", "useHandoffConsumer", "useFileUrlConsumer"]],
  ["extract-images", ["suffixedFilename", "useScrollErrorIntoView", "useHandoffConsumer", "useFileUrlConsumer"]],
  // Inspectors: byte-parsers that pre-date PdfReadOpsTool's slot-fill
  // contract and weren't migrated during the standardization arc.
  ["page-count", ["suffixedFilename", "useScrollErrorIntoView", "useHandoffConsumer", "useFileUrlConsumer"]],
  ["pdf-inspector", ["suffixedFilename", "useScrollErrorIntoView", "useHandoffConsumer", "useFileUrlConsumer"]],
  ["pdf-annotations", ["suffixedFilename", "useScrollErrorIntoView", "useHandoffConsumer", "useFileUrlConsumer"]],
  // Text-output converters use their own download pipeline with
  // copy-to-clipboard preview; never wired the standardized hooks.
  ["pdf-to-text", ["suffixedFilename", "useScrollErrorIntoView", "useHandoffConsumer", "useFileUrlConsumer"]],
  ["pdf-to-markdown", ["suffixedFilename", "useScrollErrorIntoView", "useHandoffConsumer", "useFileUrlConsumer"]],
  ["pdf-to-html", ["suffixedFilename", "useScrollErrorIntoView", "useHandoffConsumer", "useFileUrlConsumer"]],
]);

// Tools whose OUTPUT is non-PDF (e.g. pdf-to-jpg renders images,
// pdf-to-text returns a .txt). HandoffSuggestions registers Blobs
// as application/pdf, so non-PDF-output tools are exempt from the
// HandoffSuggestions requirement. Each entry needs a rationale.
const NON_PDF_OUTPUT_TOOLS = new Map([
  ["pdf-to-jpg", "output is JPEG image bundle"],
  ["pdf-to-png", "output is PNG image bundle"],
  ["pdf-to-text", "output is plain text"],
  ["pdf-to-markdown", "output is markdown text"],
  ["pdf-to-html", "output is HTML markup"],
  ["pdf-search", "output is in-page render, not downloadable bytes"],
  ["page-count", "read-only inspector, no download surface"],
  ["pdf-inspector", "read-only inspector, no download surface"],
  ["pdf-outline", "read-only inspector"],
  ["pdf-attachments", "read-only inspector"],
  ["pdf-fonts", "read-only inspector"],
  ["pdf-links", "read-only inspector"],
  ["pdf-annotations", "read-only inspector"],
  ["pdf-javascript", "read-only inspector"],
  ["pdf-accessibility", "read-only inspector"],
  ["pdf-a-check", "read-only inspector"],
  ["pdf-x-check", "read-only inspector"],
  ["pdf-forms", "read-only inspector"],
  ["extract-images", "output is image bundle"],
]);

// ---------------------------------------------------------------------
// Section C — for every live free tool, audit its component file.
// ---------------------------------------------------------------------

const COMPONENTS_DIR = resolve(ROOT, "components", "tools");

const auditFailures = [];
let auditedCount = 0;
let inheritedCount = 0;

for (const id of liveIds) {
  if (id.startsWith(AI_PREFIX)) continue;
  let compName = idToComponent.get(id);
  if (!compName) {
    auditFailures.push(`  - "${id}" — no component mapped in ToolRunner switch`);
    continue;
  }
  // If the switch case uses a dyn-import alias, resolve to the real
  // component name for file-finding purposes.
  if (dynAliases.has(compName)) compName = dynAliases.get(compName);
  // Resolve component file. Convention: component is exported from
  // components/tools/<ComponentName>.tsx OR a sibling consumer file.
  const direct = resolve(COMPONENTS_DIR, `${compName}.tsx`);
  let src = null;
  if (existsSync(direct)) {
    src = readFileSync(direct, "utf8");
  } else {
    // Search for the component definition across the tools dir.
    // (e.g. PdfJpgToPdfTool lives inside ImagesToPdfTool.tsx)
    const dirFiles = readdirSync(COMPONENTS_DIR);
    for (const f of dirFiles) {
      if (!f.endsWith(".tsx")) continue;
      const text = readFileSync(resolve(COMPONENTS_DIR, f), "utf8");
      if (
        new RegExp(`export\\s+(?:default\\s+)?function\\s+${compName}\\b`).test(
          text,
        ) ||
        new RegExp(`export\\s+const\\s+${compName}\\s*=`).test(text)
      ) {
        src = text;
        break;
      }
      // Fallback for re-exports.
      if (
        new RegExp(`export\\s+\\{[^}]*\\b${compName}\\b[^}]*\\}`).test(text)
      ) {
        src = text;
        break;
      }
    }
  }
  if (!src) {
    auditFailures.push(
      `  - "${id}" → ${compName}: component source not found (tried ${compName}.tsx + sibling files)`,
    );
    continue;
  }
  auditedCount += 1;

  // Inheritance check: if the file imports a SHARED_BASE, it's
  // standardized by inheritance and we skip per-hook audits.
  const usesSharedBase = [...SHARED_BASES].some((base) =>
    new RegExp(`\\b${base}\\b`).test(src),
  );
  if (usesSharedBase) {
    inheritedCount += 1;
    continue;
  }

  // Per-hook audit on the bespoke component.
  const grandfatheredExempt = new Set(
    KNOWN_PARTIAL_STANDARDIZATION.get(id) ?? [],
  );
  const missing = [];
  for (const req of HOOK_REQUIREMENTS) {
    // HandoffSuggestions is gated on PDF output.
    if (
      req.name === "HandoffSuggestions" &&
      NON_PDF_OUTPUT_TOOLS.has(id)
    ) {
      continue;
    }
    if (grandfatheredExempt.has(req.name)) continue;
    if (!new RegExp(`\\b${req.import}\\b`).test(src)) {
      missing.push(req.name);
    }
  }
  if (!NON_PDF_INPUT_TOOLS.has(id)) {
    for (const req of PDF_INPUT_HOOKS) {
      if (grandfatheredExempt.has(req.name)) continue;
      if (!new RegExp(`\\b${req.import}\\b`).test(src)) {
        missing.push(req.name);
      }
    }
  }

  if (missing.length > 0) {
    auditFailures.push(
      `  - "${id}" → ${compName}: missing ${missing.join(", ")}`,
    );
  }
}

assert(
  "Every live free tool meets the standardization contract",
  auditFailures.length === 0,
  auditFailures.length === 0
    ? ""
    : `These ${auditFailures.length} tool(s) drift from the standardized hook contract.\n` +
        `Either (a) refactor onto a shared base (PageEditorTool, PageGridTool, ` +
        `PdfReadOpsTool, PdfSimpleOpsTool, PdfChecklistTool) which threads ` +
        `the hooks internally, or (b) wire the missing hooks directly into ` +
        `the bespoke component, or (c) add the tool to NON_PDF_INPUT_TOOLS / ` +
        `NON_PDF_OUTPUT_TOOLS with a rationale if a hook is genuinely N/A.\n\n` +
        auditFailures.join("\n"),
);

// ---------------------------------------------------------------------
// Section D — sanity checks on the exemption maps.
// ---------------------------------------------------------------------

// Every NON_PDF_INPUT_TOOLS entry must be a real live tool.
const orphanInputExempts = [...NON_PDF_INPUT_TOOLS.keys()].filter(
  (id) => !liveIds.has(id),
);
assert(
  "NON_PDF_INPUT_TOOLS only references live tools",
  orphanInputExempts.length === 0,
  orphanInputExempts.length === 0
    ? ""
    : `Stale entries in NON_PDF_INPUT_TOOLS: ${orphanInputExempts.join(", ")}`,
);

// Every NON_PDF_OUTPUT_TOOLS entry must be a real live tool.
const orphanOutputExempts = [...NON_PDF_OUTPUT_TOOLS.keys()].filter(
  (id) => !liveIds.has(id),
);
assert(
  "NON_PDF_OUTPUT_TOOLS only references live tools",
  orphanOutputExempts.length === 0,
  orphanOutputExempts.length === 0
    ? ""
    : `Stale entries in NON_PDF_OUTPUT_TOOLS: ${orphanOutputExempts.join(", ")}`,
);

// Cap the size of the exemption maps so they don't grow into
// "everything is exempt." If they get too big, the standardization
// contract has eroded and we need to rethink it.
assert(
  "NON_PDF_INPUT_TOOLS stays focused (≤ 8 entries)",
  NON_PDF_INPUT_TOOLS.size <= 8,
  `NON_PDF_INPUT_TOOLS has ${NON_PDF_INPUT_TOOLS.size} entries; cap is 8.`,
);
assert(
  "NON_PDF_OUTPUT_TOOLS stays focused (≤ 25 entries)",
  NON_PDF_OUTPUT_TOOLS.size <= 25,
  `NON_PDF_OUTPUT_TOOLS has ${NON_PDF_OUTPUT_TOOLS.size} entries; cap is 25.`,
);

// Every KNOWN_PARTIAL_STANDARDIZATION entry must reference a real
// live tool. Stale entries here would silently grandfather a tool
// that was deleted / renamed / fully migrated.
const orphanGrandfathered = [...KNOWN_PARTIAL_STANDARDIZATION.keys()].filter(
  (id) => !liveIds.has(id),
);
assert(
  "KNOWN_PARTIAL_STANDARDIZATION only references live tools",
  orphanGrandfathered.length === 0,
  orphanGrandfathered.length === 0
    ? ""
    : `Stale grandfathered entries: ${orphanGrandfathered.join(", ")}.\n` +
        `  These tools aren't in LIVE_TOOL_IDS — remove them from the allowlist.`,
);

// Cap on KNOWN_PARTIAL_STANDARDIZATION so it doesn't grow forever.
// At ship time this is 14 entries; we cap at 16 to allow a small
// number of legitimate additions but force a triage when more drift
// surfaces. The list should SHRINK over time as tools migrate, not grow.
assert(
  "KNOWN_PARTIAL_STANDARDIZATION stays bounded (≤ 16 entries)",
  KNOWN_PARTIAL_STANDARDIZATION.size <= 16,
  `KNOWN_PARTIAL_STANDARDIZATION has ${KNOWN_PARTIAL_STANDARDIZATION.size} entries; cap is 16. ` +
    `If new partial-std tools are landing post-2026-05-01, that's a regression — meet the contract instead of grandfathering.`,
);

// ---------------------------------------------------------------------
// Section E — sanity: at least 30 free tools should be auditable, of
// which most should pass through inheritance (the standardization
// arc shipped 32/42 = 76% on shared bases). If suddenly far fewer,
// the per-tool resolver is broken.
// ---------------------------------------------------------------------

assert(
  "≥ 30 free tools audited (parser sanity)",
  auditedCount >= 30,
  `Only ${auditedCount} tools audited; parser may have drifted.`,
);

assert(
  "≥ 50% of audited tools standardize via shared base inheritance",
  auditedCount === 0 ? false : inheritedCount * 2 >= auditedCount,
  `${inheritedCount}/${auditedCount} tools use shared bases — standardization arc may have regressed.`,
);

// ---------------------------------------------------------------------
// Aggregator-friendly summary line.
// ---------------------------------------------------------------------

const total = pass + fail;
console.log("");
if (fail > 0) {
  console.log("FAILURES:");
  for (const f of failures) {
    console.log(`  ✗ ${f.label}`);
    if (f.detail) {
      for (const line of f.detail.split("\n")) console.log(`      ${line}`);
    }
  }
  console.log("");
}
console.log(
  `live-tool-standardization: ${pass} passed, ${fail} failed (of ${total})`,
);
process.exit(fail > 0 ? 1 : 0);
