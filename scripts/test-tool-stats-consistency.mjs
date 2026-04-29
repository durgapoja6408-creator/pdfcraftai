#!/usr/bin/env node
// scripts/test-tool-stats-consistency.mjs
//
// Pins the "single source of truth for tool counts" invariant shipped
// 2026-04-24 alongside the Tier-1 expansion. Every marketing surface
// that says "N tools" / "M free forever" / "K AI-powered" reads from
// lib/tools.ts::TOOL_STATS. If someone hardcodes a number in the UI
// and TOOLS[] grows, the UI drifts and starts lying to users.
//
// Prior drift: before this fix the homepage said "16 tools / 8 free",
// the pricing chip said "8 tools · always free", the SEO landing
// trust row said "18 tools", and the auth shell said "16 tools. 8
// free forever." The actual TOOLS[] count at the time was 19 (14 free
// + 10 AI) — every number on the marketing surface was wrong.
//
// Enforcement strategy:
//   1. TOOL_STATS exists in lib/tools.ts and is DERIVED (not hardcoded).
//   2. Every known count-bearing file imports TOOL_STATS and uses
//      template literals — not bare integers in JSX.
//   3. No file under app/ or components/marketing/ contains the
//      specific "N tools" / "N free" / "N AI" strings as baked-in
//      integers (except the tool-stats regression tests themselves).
//
// Run: `node scripts/test-tool-stats-consistency.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const TOOLS_SRC = readFileSync(resolve(ROOT, "lib", "tools.ts"), "utf8");

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

// =============================================================================
// SECTION A — TOOL_STATS is defined + derived (not hardcoded)
// =============================================================================

assert(
  "A1 TOOL_STATS exported from lib/tools.ts",
  /export const TOOL_STATS\s*=\s*\{/.test(TOOLS_SRC),
  "TOOL_STATS is the single source of truth for 'N tools / M free / K AI' — it must live in lib/tools.ts so every consumer imports the same values."
);

assert(
  "A2 TOOL_STATS.total = TOOLS.length (derived, not hardcoded)",
  /total:\s*TOOLS\.length/.test(TOOLS_SRC),
  "If TOOL_STATS.total is a literal integer, adding a tool drifts the count on every marketing surface. Must read from TOOLS.length."
);

assert(
  "A3 TOOL_STATS.free = TOOLS.filter(t => t.free).length",
  /free:\s*TOOLS\.filter\(\s*\(t\)\s*=>\s*t\.free\s*\)\.length/.test(TOOLS_SRC),
  "Derive .free from a filter on the free:true flag. Otherwise an AI tool mistakenly marked free:true wouldn't show up in the count."
);

assert(
  "A4 TOOL_STATS.ai = TOOLS.filter(t => !t.free).length",
  /ai:\s*TOOLS\.filter\(\s*\(t\)\s*=>\s*!t\.free\s*\)\.length/.test(TOOLS_SRC),
  "Symmetric to A3 — the count of paid/AI tools is derived from the same source."
);

// =============================================================================
// SECTION B — consumers import TOOL_STATS and use it
// =============================================================================

const CONSUMERS = [
  "app/page.tsx",
  "app/pricing/page.tsx",
  "app/tools/page.tsx",
  "components/auth/AuthShell.tsx",
  "components/marketing/SeoLandingPage.tsx",
];

for (const rel of CONSUMERS) {
  const src = readFileSync(resolve(ROOT, rel), "utf8");
  assert(
    `B.${rel} imports TOOL_STATS from @/lib/tools`,
    /import\s*\{[^}]*\bTOOL_STATS\b[^}]*\}\s*from\s*["'@]+\/?lib\/tools["']/.test(
      src
    ),
    `${rel} has UI copy that depends on tool counts. It must import TOOL_STATS so additions to TOOLS[] auto-update this surface.`
  );
  assert(
    `B.${rel} references TOOL_STATS.total / .free / .ai`,
    /TOOL_STATS\.(total|free|ai)/.test(src),
    `${rel} imports TOOL_STATS but doesn't reference it. That means either the import is dead code (a regression is coming) or someone hardcoded the count after this was wired.`
  );
}

// =============================================================================
// SECTION C — no hardcoded tool-count strings remain
// =============================================================================
//
// We scan app/ and components/marketing/ for exact strings like
// "15 tools", "15 free", "10 AI" and fail if any show up outside
// comments or test files. False positives: strings inside comments
// (filtered crudely), strings inside docs/, strings inside scripts/
// (where THIS test lives).

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const p = resolve(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

const SCAN_DIRS = [
  resolve(ROOT, "app"),
  resolve(ROOT, "components", "marketing"),
  resolve(ROOT, "components", "auth"),
  resolve(ROOT, "components", "landing"),
];

// Patterns that indicate a hardcoded tool count in UI copy. We allow
// TOOL_STATS.* references and template-literal interpolations by
// only flagging the specific string shapes that appear in rendered
// DOM (JSX children, attribute values, template literals in metadata).
const BAD_PATTERNS = [
  // Bare "NN tools" as JSX text or in a string that's NOT using the TOOL_STATS
  // template variable. The template form would read ${TOOL_STATS.total}, never a raw integer.
  /\b\d{1,3}\s+tools?\b(?![^\n]*TOOL_STATS)/,
  /\b\d{1,3}\s+free\s+forever\b(?![^\n]*TOOL_STATS)/,
  /\b\d{1,3}\s+AI[- ]powered\b(?![^\n]*TOOL_STATS)/,
];

const offenders = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const src = readFileSync(file, "utf8");
    // Strip /* ... */ block comments and // line comments so our regex
    // only scans live code. Perfect comment stripping is hard — this
    // is best-effort.
    const sansComments = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const pat of BAD_PATTERNS) {
      if (pat.test(sansComments)) {
        // Find the match line for a helpful error.
        const match = sansComments.match(pat);
        offenders.push({
          file: relative(ROOT, file),
          match: match ? match[0].trim() : "(pattern matched)",
        });
        break; // one hit per file is enough noise
      }
    }
  }
}

assert(
  `C1 no hardcoded "N tools" / "N free" / "N AI-powered" strings outside TOOL_STATS use`,
  offenders.length === 0,
  offenders.length > 0
    ? `Found hardcoded tool counts in ${offenders.length} file(s):\n      ` +
      offenders
        .map((o) => `${o.file}: "${o.match}"`)
        .slice(0, 10)
        .join("\n      ")
    : ""
);

// =============================================================================
// SECTION D — TOOL_STATS actually matches what tools.ts declares
// =============================================================================
//
// Count lines like `{ id: "...", ..., free: true,` and compare to
// what TOOL_STATS.free would compute. This is a sanity check in case
// someone hand-edits TOOL_STATS to a literal integer trying to "fix"
// a perceived discrepancy — the whole point is that it auto-derives.

const toolEntryCount = (TOOLS_SRC.match(/^\s+\{\s*id:\s*"/gm) || []).length;
const freeTrueCount = (TOOLS_SRC.match(/free:\s*true/g) || []).length;
const freeFalseCount = (TOOLS_SRC.match(/free:\s*false/g) || []).length;

assert(
  `D1 TOOLS registry has ${toolEntryCount} entries (free=${freeTrueCount}, ai=${freeFalseCount})`,
  toolEntryCount > 0 && freeTrueCount + freeFalseCount === toolEntryCount,
  "Every TOOLS entry must set free: true or free: false. A missing flag drops a tool out of one of the counts and silently breaks stats."
);

// =============================================================================
// SECTION E — every PageEditorTool consumer declares the four
// required UX strings: dropPrompt, errorCode, successCta, busyLabel.
// =============================================================================
//
// G17 (2026-04-28): the standardization audit (#193 / docs/UI_COPY.md)
// found that PageEditorTool consumers occasionally shipped without one
// of these — usually busyLabel, which left the spinner showing the
// active CTA label instead of a present-continuous form. Catching this
// in tests means future tools fail the harness instead of drifting
// silently to production.

const PAGE_EDITOR_CONSUMERS = [
  "components/tools/PdfAddLinksTool.tsx",
  "components/tools/PdfAddTextBoxTool.tsx",
  "components/tools/PdfCropTool.tsx",
  "components/tools/PdfFreeDrawTool.tsx",
  "components/tools/PdfHighlightTool.tsx",
  "components/tools/PdfImageWatermarkTool.tsx",
  "components/tools/PdfRedactTool.tsx",
  "components/tools/PdfSignTool.tsx",
];

const REQUIRED_PROPS = ["dropPrompt", "busyLabel", "successCta", "errorCode"];

for (const rel of PAGE_EDITOR_CONSUMERS) {
  const src = readFileSync(resolve(ROOT, rel), "utf8");
  for (const prop of REQUIRED_PROPS) {
    assert(
      `E.${rel}#${prop}`,
      new RegExp(`\\b${prop}\\s*[=:]`).test(src),
      `${rel} uses PageEditorTool but doesn't pass \`${prop}\`. The shared base needs all four (dropPrompt, busyLabel, successCta, errorCode) to render correctly. See docs/UI_COPY.md for canonical voice.`,
    );
  }
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
console.log(
  `test-tool-stats-consistency: ${pass} passed, ${fail} failed (of ${total})`
);
process.exit(fail > 0 ? 1 : 0);
