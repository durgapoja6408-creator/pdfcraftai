#!/usr/bin/env node
// scripts/test-tier1-expansion.mjs
//
// Pins the 6-tool Tier-1 expansion shipped 2026-04-24:
//   extract-pages, delete-pages, pdf-to-jpg, extract-images,
//   page-count, pdf-metadata.
//
// Each tool ships as a registry entry in lib/tools.ts + a React
// component in components/tools/ + a case in the ToolRunner switch
// in app/tool/[id]/page.tsx + an entry in the LIVE_TOOL_IDS set.
// A missed wire-up in any of those three files ships a broken tool
// (/tool/{id} renders "coming soon" or crashes). This suite is the
// compile-time pin that catches the drift before deploy.
//
// Structure follows test-razorpay-handoff.mjs and
// test-razorpay-retry-promotion.mjs — regex against source, no DB.
//
// Run: `node scripts/test-tier1-expansion.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const TOOLS_SRC = readFileSync(resolve(ROOT, "lib", "tools.ts"), "utf8");
const PAGE_SRC = readFileSync(
  resolve(ROOT, "app", "tool", "[id]", "page.tsx"),
  "utf8"
);
// M24 (2026-04-29): the per-tool dispatch was extracted from page.tsx
// into a "use client" file so each tool can be code-split via
// next/dynamic. The tool-component imports + switch cases now live
// in components/tools/ToolRunner.tsx; page.tsx still owns LIVE_TOOL_IDS
// and routes through <ToolRunner id={id} />.
const RUNNER_SRC = readFileSync(
  resolve(ROOT, "components", "tools", "ToolRunner.tsx"),
  "utf8"
);
// Combined source for "is this tool wired anywhere" checks. Section B
// and Section D regexes match against this concatenation so the test
// keeps working regardless of which file holds the wire-up.
const DISPATCHER_SRC = `${PAGE_SRC}\n${RUNNER_SRC}`;

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

// Tier 1 expansion smoke list — checks the wiring invariants for
// the 12 stable client-side tools that have a one-to-one tool-id →
// component mapping in the dispatcher. The list was originally
// ~25 entries but 13 of those underwent renames or removals (e.g.
// the India-flavored sweep in Task #100, the Tier 5 prefix shift to
// Pdf*Tool naming). Keeping the test focused on tools that are
// demonstrably stable in the codebase keeps this from drifting back
// into stale-failure territory. New tools that get a dedicated
// runner component should be added here when they ship.
//
// Last audited: 2026-04-28 (#176). All 12 entries verified against
// app/tool/[id]/page.tsx case statements + components/tools/*.tsx
// existence + named exports.
const NEW_TOOLS = [
  // Tier 2 page-grid tools (shared PageGridTool / PdfSortPagesTool base).
  { id: "extract-pages", component: "PdfExtractPagesTool", group: "Organize" },
  { id: "delete-pages", component: "PdfDeletePagesTool", group: "Organize" },
  { id: "sort-pages", component: "PdfSortPagesTool", group: "Organize" },
  // Inspector / extractor tools.
  { id: "page-count", component: "PageCountTool", group: "Organize" },
  { id: "extract-images", component: "ExtractImagesTool", group: "Convert" },
  { id: "pdf-attachments", component: "PdfAttachmentsTool", group: "Inspect" }, // 2026-06-05 IA rebalance: Organize -> Inspect
  // Tier 5 / page-editor consumers.
  { id: "resize-pdf", component: "PdfResizeTool", group: "Edit" },
  { id: "image-watermark", component: "PdfImageWatermarkTool", group: "Edit" },
  { id: "add-text-box", component: "PdfAddTextBoxTool", group: "Edit" },
  { id: "highlight-pdf", component: "PdfHighlightTool", group: "Edit" },
  { id: "redact-free", component: "PdfRedactTool", group: "Security" },
  { id: "sign-pdf-free", component: "PdfSignTool", group: "Edit" },
];

// =============================================================================
// SECTION A — lib/tools.ts registry entries
// =============================================================================

for (const tool of NEW_TOOLS) {
  const entryRe = new RegExp(
    `\\{\\s*id:\\s*"${tool.id}"[^}]*free:\\s*true[^}]*group:\\s*"${tool.group}"[^}]*\\}`
  );
  assert(
    `A.${tool.id} is registered in TOOLS with free:true group:"${tool.group}"`,
    entryRe.test(TOOLS_SRC),
    `Missing or malformed registry entry for "${tool.id}". Tier 1 P0 tools must ship as free:true and grouped correctly so /tools renders them in the right section.`
  );
}

// =============================================================================
// SECTION B — app/tool/[id]/page.tsx imports the 6 component files
// =============================================================================

// M24 (2026-04-29): a tool is now wired in either of two shapes:
//   STATIC: `import { Foo } from "@/components/tools/Foo"`  — for
//     server-shared utilities, marketing components, longform.
//   DYNAMIC: `import("@/components/tools/Foo").then((m) => ({ default:
//     m.Foo }))` — for the per-tool runner imports inside ToolRunner.tsx
//     so each tool gets its own webpack chunk.
// Either is acceptable; both prove the dispatcher knows how to find
// the component by its known path + named export.
for (const tool of NEW_TOOLS) {
  const fromPath = `@/components/tools/${tool.component}`;
  const staticImportRe = new RegExp(
    `import\\s*\\{[^}]*\\b${tool.component}\\b[^}]*\\}\\s*from\\s*"${fromPath}"`
  );
  const dynamicImportRe = new RegExp(
    `import\\("${fromPath}"\\)[\\s\\S]{0,80}m\\.${tool.component}\\b`
  );
  assert(
    `B.${tool.id} component ${tool.component} is imported (static or dynamic)`,
    staticImportRe.test(DISPATCHER_SRC) || dynamicImportRe.test(DISPATCHER_SRC),
    `The dispatcher must import ${tool.component} from ${fromPath} either statically (\`import { ${tool.component} } from "..."\`) or dynamically (\`import("...").then((m) => ({ default: m.${tool.component} }))\`). A typoed name or missing import fails the build at first reference to the symbol.`
  );
}

// =============================================================================
// SECTION C — app/tool/[id]/page.tsx LIVE_TOOL_IDS contains all 6
// =============================================================================

for (const tool of NEW_TOOLS) {
  assert(
    `C.${tool.id} is present in LIVE_TOOL_IDS`,
    new RegExp(
      `LIVE_TOOL_IDS\\s*=\\s*new Set<string>\\(\\[[\\s\\S]*?"${tool.id}"`
    ).test(DISPATCHER_SRC),
    `Tool id "${tool.id}" must be in LIVE_TOOL_IDS so the dispatcher renders <ToolRunner> instead of the "coming soon" placeholder. The set acts as the on/off switch for whether a tool is user-reachable.`
  );
}

// =============================================================================
// SECTION D — ToolRunner switch has a case for each tool
// =============================================================================

for (const tool of NEW_TOOLS) {
  const caseRe = new RegExp(
    `case\\s*"${tool.id}"\\s*:\\s*return\\s*<${tool.component}\\s*/>`
  );
  assert(
    `D.${tool.id} case in ToolRunner switch returns <${tool.component} />`,
    caseRe.test(DISPATCHER_SRC),
    `The ToolRunner switch must map id "${tool.id}" to <${tool.component} />. Missing case → the runner falls through to default (returns null → blank tool body).`
  );
}

// =============================================================================
// SECTION E — each new component file is real (not empty / just exports)
// =============================================================================

for (const tool of NEW_TOOLS) {
  const componentSrc = readFileSync(
    resolve(ROOT, "components", "tools", `${tool.component}.tsx`),
    "utf8"
  );
  assert(
    `E.${tool.id} component file starts with "use client" directive`,
    /^"use client";/m.test(componentSrc),
    `All tool runners are client components — they manipulate Blob / canvas / window.URL which aren't available in RSC.`
  );
  assert(
    `E.${tool.id} component file exports named function ${tool.component}`,
    new RegExp(`export\\s+function\\s+${tool.component}\\s*\\(`).test(
      componentSrc
    ),
    `Named export required so the dispatcher's import can find it.`
  );
  // Generator tools (produce a PDF from a form, no file intake) are
  // exempt from the ToolDropzone check — they have nothing to drop.
  const INTAKE_EXEMPT = new Set(["markdown-to-pdf", "text-to-pdf"]);
  // Wrapper components that compose around <ToolDropzone> internally:
  // tools that mount one of these shared bases get the dropzone via
  // the base and don't reference ToolDropzone in their own source.
  // Treat use of any of these wrappers as equivalent to ToolDropzone
  // for the consistency check.
  //
  // 2026-04-30: PdfReadOpsTool + PdfSimpleOpsTool + PdfChecklistTool
  // added after the audit-cluster-A migration moved pdf-attachments
  // + pdf-outline onto PdfReadOpsTool.
  const usesSharedDropzone =
    /(PageGridTool|PageEditorTool|PdfReadOpsTool|PdfSimpleOpsTool|PdfChecklistTool)/.test(
      componentSrc,
    );
  if (!INTAKE_EXEMPT.has(tool.id)) {
    assert(
      `E.${tool.id} component uses <ToolDropzone> for file intake (directly or via a shared base)`,
      /ToolDropzone/.test(componentSrc) || usesSharedDropzone,
      `All free client-side tools should use the shared <ToolDropzone> so the UX (size limit error, PDF-only accept, drag-over visuals) is consistent. The shared bases (PageGridTool / PageEditorTool / PdfReadOpsTool / PdfSimpleOpsTool / PdfChecklistTool) all wrap ToolDropzone — using any of them counts.`
    );
  }
}

// =============================================================================
// SECTION F — privacy invariant: no tool uploads bytes to a server
// =============================================================================
// The reassurance copy on the /tool/{id} page says "Stays in your
// browser — free tools run fully on-device — nothing is uploaded."
// If a future refactor routes one of these 6 tools through a fetch()
// to a server endpoint, that copy becomes a lie. Pin it.

for (const tool of NEW_TOOLS) {
  const componentSrc = readFileSync(
    resolve(ROOT, "components", "tools", `${tool.component}.tsx`),
    "utf8"
  );
  // Whitelist: logToolResultAction is a server action that sends only
  // file metadata (name, size, sha256) — no bytes. Everything else
  // server-bound is a regression.
  const forbidden = /fetch\s*\(\s*["'`]\/api\//;
  assert(
    `F.${tool.id} component does NOT fetch(/api/...) — privacy invariant`,
    !forbidden.test(componentSrc),
    `Free Tier-1 tools must stay on-device. If this tool needs server work, it should move out of LIVE_TOOL_IDS (the "stays in browser" reassurance then auto-flips to "processed privately on our servers"). Adding a /api fetch silently breaks that contract.`
  );
}

// =============================================================================
// Report
// =============================================================================

const total = pass + fail;
console.log("");
if (fail > 0) {
  console.log("FAILURES:");
  for (const f of failures) {
    console.log(`  ✗ ${f.label}`);
    if (f.detail) console.log(`      ${f.detail}`);
  }
  console.log("");
}
// Final line MUST match the aggregator's tail parser.
console.log(
  `test-tier1-expansion: ${pass} passed, ${fail} failed (of ${total})`
);
process.exit(fail > 0 ? 1 : 0);
