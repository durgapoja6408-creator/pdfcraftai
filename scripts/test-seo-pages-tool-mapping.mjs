#!/usr/bin/env node
/**
 * 2026-04-30 CI guard: every `tool: "..."` in lib/seo-pages.ts must
 * match an `id: "..."` in lib/tools.ts.
 *
 * Background: the SEO-landings smoke spec (tests/e2e/seo-landings-
 * smoke.spec.ts) caught 5 SEO landings whose `tool:` field referenced
 * a tool ID that doesn't exist in the registry. The downstream effect
 * is `SeoLandingPage` returning null on render, which causes Next to
 * fall back to the layout's notFound boundary — pages return 200 with
 * a "page hasn't been ported yet" body. Bad SEO, worse UX, and easy
 * to miss because the runtime smoke takes 5 min and only runs
 * post-deploy.
 *
 * This guard catches the same regression at `npm test` time (sub-
 * second) so dead `tool:` references can never make it past commit
 * review. Same posture as scripts/test-tool-runner-coverage.mjs
 * (which guards lib/tools.ts ↔ ToolRunner.tsx coverage).
 *
 * Output line conforms to the aggregator regex
 * `${name}: ${pass} passed, ${fail} failed`.
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

const TOOLS_SRC = fs.readFileSync(
  path.join(ROOT, "lib", "tools.ts"),
  "utf8",
);
const SEO_SRC = fs.readFileSync(
  path.join(ROOT, "lib", "seo-pages.ts"),
  "utf8",
);

// ---------------------------------------------------------------------------
// Section A — extract tool IDs from lib/tools.ts.
// ---------------------------------------------------------------------------

const TOOL_ID_RE = /^\s*\{\s*id:\s*"([^"]+)"/gm;
const TOOL_IDS = new Set();
let m;
while ((m = TOOL_ID_RE.exec(TOOLS_SRC)) !== null) {
  TOOL_IDS.add(m[1]);
}
assert(
  TOOL_IDS.size >= 80,
  `lib/tools.ts parse: expected >= 80 tool ids, got ${TOOL_IDS.size} ` +
    `(regex drift?)`,
);

// ---------------------------------------------------------------------------
// Section B — extract `tool:` values from lib/seo-pages.ts.
// ---------------------------------------------------------------------------

// Match `    tool: "<id>",` lines. The leading whitespace anchors the
// match to actual record fields (not type-union literals at the top of
// the file, which use `| "<slug>"` form, no `tool:` prefix).
const SEO_TOOL_RE = /^\s+tool:\s*"([^"]+)"/gm;
const seoToolRefs = []; // { tool, slug, lineNo }
let match;

// Walk the file and group each tool: ref with the slug it belongs to
// (the nearest preceding `"<slug>": {` line). This gives us
// per-record context when we report failures.
const lines = SEO_SRC.split("\n");
let currentSlug = null;
const slugRe = /^\s*"([^"]+)":\s*\{/;
const toolRe = /^\s*tool:\s*"([^"]+)"/;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const slugMatch = slugRe.exec(line);
  if (slugMatch) {
    currentSlug = slugMatch[1];
    continue;
  }
  const tm = toolRe.exec(line);
  if (tm) {
    seoToolRefs.push({
      tool: tm[1],
      slug: currentSlug,
      lineNo: i + 1,
    });
  }
}

assert(
  seoToolRefs.length >= 80,
  `lib/seo-pages.ts parse: expected >= 80 'tool:' refs, got ${seoToolRefs.length} ` +
    `(regex drift?)`,
);

// ---------------------------------------------------------------------------
// Section C — every SEO `tool:` ref must resolve to a real tool ID.
//
// Known-dead refs (2026-04-30 audit): some SEO landings have been
// shipped ahead of the tools they describe — the product team's
// pattern of seeding keyword-targeted pages so they accumulate
// SERP equity before the tool is built. These get a free pass HERE
// (so the guard stays useful and only fires on NEW dead refs), but
// they are NOT free passes in production: each one currently
// renders a 200 OK page with a "this page hasn't been ported yet"
// body. Until the tool ships, those pages should either be
// no-indexed or hidden from sitemap.xml.
//
// Format: "<slug>" → "<tool-id>". Adding a new entry here means
// "we know this is broken and have product context for shipping
// the missing piece". If you don't have that context, fix the
// underlying ref instead of silencing the guard.
// ---------------------------------------------------------------------------

const KNOWN_DEAD_REFS = new Map([
  // Compress — multi-rail tool (Ghostscript / pdf-lib reflow);
  // requires server-side path that's gated behind Paddle KYC.
  ["compress-pdf", "compress"],
  // PDF ↔ Office bidirectional. Server-side LibreOffice rail; Phase
  // 2 backlog.
  ["pdf-to-word", "pdf-to-office"],
  ["pdf-to-excel", "pdf-to-office"],
  ["pdf-to-powerpoint", "pdf-to-office"],
  ["word-to-pdf", "to-pdf"],
  ["excel-to-pdf", "to-pdf"],
  ["powerpoint-to-pdf", "to-pdf"],
  // 2026-05-01 (first batch): jpg-to-pdf, png-to-pdf, text-to-pdf
  // REMOVED — real tools now ship.
  // 2026-05-01 Tier 1 batch: markdown-to-pdf, grayscale-pdf,
  // booklet-pdf REMOVED — real tools now ship in this commit. SEO
  // landings' tool: refs already point at the canonical tool IDs.
  // 2026-05-01 — extract-contacts SHIPPED (commit c56705e). Removed.
  // 2026-05-01 — extract-dates SHIPPED (commit c586d63). Removed.
  // 2026-05-01 — extract-pdf-form-data REPOINTED to existing pdf-forms
  // tool (was: ["extract-pdf-form-data", "extract-form-data"]).
  // 2026-05-01 — extract-attachments SHIPPED (commit pending). The
  // /extract-pdf-attachments SEO landing now resolves to a real tool
  // with stream decompression + ZIP bundle download. Removed (was:
  // ["extract-pdf-attachments", "extract-attachments"]).
  // 2026-05-01 — /edit-pdf REPOINTED to existing add-text-box tool.
  // Was: ["edit-pdf", "edit-pdf"]. The aggregated "Edit PDF" generic
  // surface (add-text + highlight + redact + draw in one canvas) is
  // genuinely Adobe-Acrobat-Pro-tier engineering and no free-tier
  // competitor ships it at quality. Repoint surfaces add-text-box's
  // existing overlay-tier work + the related toolkit (sign + redact +
  // free-draw) for the parts of "edit PDF" people actually want.
  // 2026-05-01 — ai-court-order SHIPPED. The /court-judgment-summarizer
  // SEO landing now resolves to a real AI tool (depth=court-order routing
  // through /api/ai/summarize, with structured JSON output rendered by
  // the dedicated CourtOrderTool UI). Removed (was:
  // ["court-judgment-summarizer", "ai-court-order"]).
]);

const deadRefs = [];
for (const ref of seoToolRefs) {
  if (!TOOL_IDS.has(ref.tool)) {
    // Allow if the slug→tool pair is in our known-dead list.
    if (KNOWN_DEAD_REFS.get(ref.slug ?? "") === ref.tool) continue;
    deadRefs.push(ref);
  }
}

assert(
  deadRefs.length === 0,
  `Found ${deadRefs.length} NEW SEO landing(s) with dead tool: references.\n` +
    `Each one renders a 200 OK page with a 404-style "this page hasn't been ported yet" body — bad SEO, worse UX.\n` +
    `Either (a) add the missing tool to lib/tools.ts and lib/tool-routes.ts + ToolRunner switch, or (b) re-map the SEO landing's tool: field to an existing tool id in lib/tools.ts, or (c) if the tool is genuinely on the backlog, add the entry to KNOWN_DEAD_REFS in this file with a comment explaining product context.\n\n` +
    `Locations (lib/seo-pages.ts):\n` +
    deadRefs
      .map(
        (r) =>
          `  line ${r.lineNo}: slug="${r.slug ?? "(unknown)"}" → tool="${r.tool}" (missing from lib/tools.ts)`,
      )
      .join("\n"),
);

// Sanity: KNOWN_DEAD_REFS shouldn't grow forever. If it has more
// than ~30 entries, we've drifted from "shipped ahead of tooling"
// into "broken and ignored". Surface it as a soft warning by
// failing the test — forces a triage pass.
assert(
  KNOWN_DEAD_REFS.size <= 30,
  `KNOWN_DEAD_REFS has ${KNOWN_DEAD_REFS.size} entries — over the 30-item soft cap. Either ship some of the missing tools or de-list the SEO landings.`,
);

// ---------------------------------------------------------------------------
// Section D — sanity: at least 50 unique mapped tools, since seo-pages
// drives a big chunk of SEO traffic and shrinkage could indicate a
// regression in either file.
// ---------------------------------------------------------------------------

const uniqueRefdTools = new Set(seoToolRefs.map((r) => r.tool));
assert(
  uniqueRefdTools.size >= 50,
  `lib/seo-pages.ts references only ${uniqueRefdTools.size} unique tools — expected >= 50. Did the SEO catalog shrink?`,
);

// ---------------------------------------------------------------------------
// Section E — self-test the regex against synthetic strings so a
// future refactor that breaks the parser fails loudly.
// ---------------------------------------------------------------------------

const POS_TOOL = '    tool: "merge",';
assert(
  toolRe.test(POS_TOOL),
  "regex catches the canonical `    tool: \"...\"` shape",
);
const NEG_UNION_LITERAL = '  | "merge-pdf"';
assert(
  !toolRe.test(NEG_UNION_LITERAL),
  "regex does NOT match the type-union literal at the top of seo-pages.ts",
);
const POS_DEEPLY_INDENTED = '            tool: "ai-summarize",';
assert(
  toolRe.test(POS_DEEPLY_INDENTED),
  "regex matches deeply-nested record fields (slug → tool: nested in object)",
);

// ---------------------------------------------------------------------------
// Aggregator-friendly summary line.
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(
  `seo-pages-tool-mapping: ${passed} passed, ${failed} failed (of ${total})`,
);
if (failed > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
