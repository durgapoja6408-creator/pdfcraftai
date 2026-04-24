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
const DISPATCHER_SRC = readFileSync(
  resolve(ROOT, "app", "tool", "[id]", "page.tsx"),
  "utf8"
);

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

const NEW_TOOLS = [
  {
    id: "extract-pages",
    component: "ExtractPagesTool",
    group: "Organize",
  },
  {
    id: "delete-pages",
    component: "DeletePagesTool",
    group: "Organize",
  },
  {
    id: "pdf-to-jpg",
    component: "PdfToJpgTool",
    group: "Convert",
  },
  {
    id: "extract-images",
    component: "ExtractImagesTool",
    group: "Convert",
  },
  {
    id: "page-count",
    component: "PageCountTool",
    group: "Edit",
  },
  {
    id: "pdf-metadata",
    component: "PdfMetadataTool",
    group: "Edit",
  },
  // 2026-04-24 wave 2 — Tier 1 §1.4 P1 (PDF → TXT) + §1.5 P1 (Resize
  // Pages) + §1.8 P1 (Remove Metadata). All three are client-side
  // pdf-lib / pdfjs ships with no canvas overlays.
  {
    id: "pdf-to-text",
    component: "PdfToTextTool",
    group: "Convert",
  },
  {
    id: "resize-pdf",
    component: "ResizePdfTool",
    group: "Edit",
  },
  {
    id: "remove-metadata",
    component: "RemoveMetadataTool",
    group: "Security",
  },
  // 2026-04-24 wave 3 — Tier 1 §1.5 P0 image-watermark tool. Splits
  // from the existing page-numbers tool because image watermarks have
  // a different control surface (file upload + scale/opacity sliders
  // vs font/size/color inputs) and target different SEO terms ("add
  // logo to pdf" vs "add watermark text"). Bundling would bloat
  // PageNumbersTool (already 598 lines) and muddle the runner UI.
  {
    id: "image-watermark",
    component: "ImageWatermarkTool",
    group: "Edit",
  },
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

for (const tool of NEW_TOOLS) {
  const importRe = new RegExp(
    `import\\s*\\{\\s*${tool.component}\\s*\\}\\s*from\\s*"@/components/tools/${tool.component}"`
  );
  assert(
    `B.${tool.id} component ${tool.component} is imported`,
    importRe.test(DISPATCHER_SRC),
    `The dispatcher must import ${tool.component} from @/components/tools/${tool.component}. A typoed or missing import fails the build at first reference to the symbol.`
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
  assert(
    `E.${tool.id} component uses <ToolDropzone> for file intake`,
    /ToolDropzone/.test(componentSrc),
    `All free client-side tools should use the shared <ToolDropzone> so the UX (size limit error, PDF-only accept, drag-over visuals) is consistent across tools.`
  );
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
