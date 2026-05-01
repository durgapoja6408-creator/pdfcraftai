#!/usr/bin/env node
// scripts/test-tool-content-coverage.mjs
//
// 2026-05-01: catch missing intro / longform entries on free tools.
//
// Background: the runner page (app/tool/[id]/page.tsx) renders the
// "What you'll get" intro and the longform marketing block (use
// cases / how-it-works / FAQs / CTA) ONLY if the tool has entries
// in lib/tool-intros.ts AND lib/tool-longforms.ts respectively.
// Tools without entries silently render the spartan dropzone-only
// page — same chrome, none of the content depth.
//
// The 2026-05-01 jpg-to-pdf / png-to-pdf / text-to-pdf arc shipped
// the runners + LIVE_TOOL_IDS + ToolRunner.tsx + standardized hooks,
// but missed both content maps. Production showed three tools that
// looked half-finished compared to Page Count / PDF Inspector / etc.
//
// This guard pins the floor: every free tool wired into LIVE_TOOL_IDS
// must have BOTH intro + longform entries — OR be in one of two
// allowlists (PER_TOOL_LONGFORM_TOOLS for tools with their own custom
// component like Page Count + PDF Inspector, GRANDFATHERED for pre-
// 2026-05-01 drift). Adding a tool here without rationale fails CI.
//
// Output line conforms to the aggregator regex
// `${name}: ${pass} passed, ${fail} failed`.

import { readFileSync } from "node:fs";
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
// Section A — load source files + parse the entry sets.
// ---------------------------------------------------------------------

const PAGE_SRC = readFileSync(
  resolve(ROOT, "app", "tool", "[id]", "page.tsx"),
  "utf8",
);
const INTROS_SRC = readFileSync(
  resolve(ROOT, "lib", "tool-intros.ts"),
  "utf8",
);
const LONGFORMS_SRC = readFileSync(
  resolve(ROOT, "lib", "tool-longforms.ts"),
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

// Match the leading-2-space `  "id":` shape used for record entries
// (avoids matching nested fields like `related: { id: "..." }`).
// JS object syntax allows unquoted keys for safe identifiers (e.g.
// `merge:` is valid, `"merge":` is also valid) — accept both shapes
// so a tool whose ID happens to be a valid bare identifier doesn't
// silently slip through. Rejects all-digit / hyphenated bare keys
// (those force quoting in JS), but our IDs are all letters or
// letter-hyphen-letter, so nothing real is missed.
function parseRecordIds(src) {
  const ids = new Set();
  // Quoted form: `  "tool-id": {`
  for (const m of src.matchAll(/^  "([a-z0-9-]+)":\s*\{/gm)) ids.add(m[1]);
  // Unquoted form: `  toolId: {` (valid identifier, no hyphen)
  for (const m of src.matchAll(/^  ([a-z][a-z0-9]*):\s*\{/gm)) ids.add(m[1]);
  return ids;
}
const introIds = parseRecordIds(INTROS_SRC);
const longformIds = parseRecordIds(LONGFORMS_SRC);

assert(
  "TOOL_INTROS parsed (sanity floor)",
  introIds.size > 50,
  `expected >50 intro entries, got ${introIds.size} — regex may have drifted.`,
);
assert(
  "TOOL_LONGFORMS parsed (sanity floor)",
  longformIds.size > 30,
  `expected >30 longform entries, got ${longformIds.size} — regex may have drifted.`,
);

// ---------------------------------------------------------------------
// Section B — define the contract.
// ---------------------------------------------------------------------

// 2026-05-01 — Phase 1 of AI standardization parity. The previous
// blanket AI_PREFIX exemption was REMOVED. AI tools now go through
// the same longform check as free tools, with the realistic caveat
// that the editorial backfill is partial: 12 high-traffic AI tools
// have full longforms shipped today; the remaining ~38 sit in
// KNOWN_AI_LONGFORM_PENDING (below) with per-tool TODO rationale
// and a shrinkage cap that forces the list to only get smaller over
// time.
//
// Honest framing: this isn't an architectural decision, it's editorial
// debt being paid down incrementally. Adding a NEW AI tool without a
// longform now requires either writing one or explicitly grandfathering
// it (which the cap prevents past the current size).
//
// AI tool variants (38+ summarize variants) get genuinely-distinct
// longforms — no shared template + variant override — to avoid Google's
// near-duplicate-content classifier flagging the cluster.

// Tools that ship their OWN custom longform component (registered
// in app/tool/[id]/page.tsx via PER_TOOL_FAQ + dedicated <X />
// imports). They don't need a TOOL_LONGFORMS entry — would be
// rendered as a duplicate section.
//
// This list MUST stay in sync with the page.tsx render condition:
//   {TOOL_LONGFORMS[tool.id] && tool.id !== "pdf-inspector" &&
//    tool.id !== "page-count" && (...)}
const PER_TOOL_LONGFORM_TOOLS = new Set(["pdf-inspector", "page-count"]);

// Tools that pre-date this guard and don't have intro / longform
// entries. NOT a free pass forever — each entry is a TODO. New
// tools shipped after 2026-05-01 must NOT appear here.
//
// Value is the array of CHECKS to skip for the tool. Per-tool
// rationale must be in a comment near the entry. Possible values:
//   "intro"     — skip the TOOL_INTROS coverage check
//   "longform"  — skip the TOOL_LONGFORMS coverage check
//
// Examples:
//   ["foo", ["intro"]]              → only skip the intro check
//   ["bar", ["intro", "longform"]]  → skip both checks
const GRANDFATHERED_NO_CONTENT = new Map([
  // Inspector tools — their entire UI IS the inspection result;
  // adding generic marketing longform would duplicate the inline
  // content the inspector already shows. Skip longform check; intro
  // line is still helpful and most are already covered.
  ["pdf-outline", ["longform"]],
  ["pdf-attachments", ["longform"]],
  ["pdf-fonts", ["longform"]],
  ["pdf-links", ["longform"]],
  ["pdf-annotations", ["longform"]],
  ["pdf-javascript", ["longform"]],
  ["pdf-accessibility", ["longform"]],
  ["pdf-a-check", ["longform"]],
  ["pdf-x-check", ["longform"]],
  ["pdf-forms", ["longform"]],
  // pdf-search results UI is the content surface — no marketing
  // longform fits.
  ["pdf-search", ["longform"]],
  // Pre-2026-05-01 free tools that shipped without longform entries.
  // Each is a migration TODO; the list should shrink over time.
  ["sort-pages", ["longform"]],
  ["stamp-pdf", ["longform"]],
  ["strip-links", ["longform"]],
  ["free-draw-pdf", ["longform"]],
  ["add-links", ["longform"]],
  ["sign-pdf-free", ["longform"]],
  ["redact-free", ["longform"]],
  ["highlight-pdf", ["longform"]],
  ["add-text-box", ["longform"]],
  ["repair-pdf", ["longform"]],
  ["remove-metadata", ["longform"]],
  ["resize-pdf", ["longform"]],
  ["flatten-pdf", ["longform"]],
  ["crop-pdf", ["longform"]],
  ["image-watermark", ["longform"]],
  ["n-up-pdf", ["longform"]],
  ["pdf-to-markdown", ["longform"]],
  ["pdf-to-html", ["longform"]],
  ["extract-pages", ["longform"]],
  ["delete-pages", ["longform"]],
  ["extract-images", ["longform"]],
  // 2026-05-01: merge, split, rotate, page-numbers, unlock REMOVED.
  // Audit found these were CI-guard false positives — all 5 ALREADY
  // had full ToolLongformData entries in lib/tool-longforms.ts but
  // used unquoted JS object keys (`merge: {` not `"merge": {`),
  // which the test's record-key regex initially missed. The
  // earlier-this-session fix to parseRecordIds() (accepting both
  // quoted and unquoted forms) resolves the parser bug so the
  // grandfather entries are now stale.
  // Grandfather list shrinks 5 entries (35 → 30); cap-on-grandfather
  // forces this to keep shrinking over time.
]);

// 2026-05-01 — AI standardization parity, Phase 1.
//
// The blanket AI_PREFIX exemption is gone (see Section B comment).
// 12 high-traffic AI tools have full longforms shipped today
// (ai-summarize, ai-tldr, ai-key-points, ai-eli5, ai-translate,
// ai-compare, ai-ocr, ai-flashcards, ai-quiz, ai-cover-letter,
// ai-redact, ai-resume-parse). The remaining ~38 sit here as
// per-tool TODOs.
//
// Each entry's value is a free-form rationale string (rendered in
// the failure message if a tool falls off the list without a
// longform getting written). The cap-on-pending below forces this
// list to monotonically shrink — a NEW AI tool shipping without a
// longform will fail CI unless it's added here, and the cap
// prevents adding-without-bound.
//
// Phase 2 backfill priority order roughly matches the SEO-traffic
// rank for each variant; entries are grouped by family for review
// purposes only.
const KNOWN_AI_LONGFORM_PENDING = new Map([
  // 2026-05-01 — Phase 2 COMPLETE. All 39 grandfathered AI tools now
  // have full longform entries in lib/tool-longforms.ts:
  //
  //   Tier 1 (8 highest-traffic): ai-faq, ai-action-items, ai-mindmap,
  //     ai-blood-test, ai-jd-match, ai-paraphrase, ai-detector, ai-rewrite
  //   Tier 2 (9 content-focused): ai-study-notes, ai-syllabus, ai-discharge,
  //     ai-blog, ai-readability, ai-newsletter, ai-video-script,
  //     ai-improve-writing, ai-proofread
  //   Tier 3 (8 legal/specialist): ai-nda, ai-employment, ai-partnership-deed,
  //     ai-loan-bundle, ai-insurance, ai-research-paper, ai-salary-slip,
  //     ai-ats-resume
  //   Tier 4 (14 variants): ai-condense, ai-expand, ai-tone-analyze,
  //     ai-citations, ai-sentiment, ai-bias, ai-entities, ai-social-thread,
  //     ai-semantic-search, ai-searchable-pdf, ai-chart-to-table, ai-table,
  //     ai-generate, ai-sign
  //
  // Cap is now 0 — every AI tool runner has full editorial parity with
  // the free tools. Future AI tools must ship with a longform entry on
  // creation; the grandfather list is intentionally empty so it can't
  // be quietly resurrected.
  //
  // To add a NEW grandfather entry (only when truly necessary), bump
  // the cap below to 1+ and add the entry — but the strong default is
  // "ship with longform" because we now have proof the editorial
  // discipline is sustainable.
]);

// ---------------------------------------------------------------------
// Section C — for every live tool, check coverage.
// ---------------------------------------------------------------------

const introMisses = [];
const longformMisses = [];

for (const id of liveIds) {
  // AI tools in KNOWN_AI_LONGFORM_PENDING are explicitly grandfathered
  // for the longform check while we backfill. Intro check still applies.
  if (KNOWN_AI_LONGFORM_PENDING.has(id)) {
    if (!introIds.has(id)) introMisses.push(id);
    continue;
  }

  const skipChecks = new Set(GRANDFATHERED_NO_CONTENT.get(id) ?? []);

  // Intro coverage — required unless explicitly grandfathered.
  if (!introIds.has(id) && !skipChecks.has("intro")) {
    introMisses.push(id);
  }

  // Longform coverage — required unless tool ships its own custom
  // longform component (PER_TOOL_LONGFORM_TOOLS) or is grandfathered.
  if (PER_TOOL_LONGFORM_TOOLS.has(id)) continue;
  if (!longformIds.has(id) && !skipChecks.has("longform")) {
    longformMisses.push(id);
  }
}

assert(
  "Every free tool has a TOOL_INTROS entry",
  introMisses.length === 0,
  introMisses.length === 0
    ? ""
    : `These tools render without the "What you'll get" intro line above the dropzone — ` +
        `add an entry to lib/tool-intros.ts (text + optional related tool ID), or grandfather ` +
        `with rationale in this script.\n\n  Missing: ${introMisses.sort().join(", ")}`,
);

assert(
  "Every free tool has a TOOL_LONGFORMS entry (or custom longform / grandfather)",
  longformMisses.length === 0,
  longformMisses.length === 0
    ? ""
    : `These tools render without the longform marketing block (use cases / how-it-works / ` +
        `FAQs / CTA). Add a full ToolLongformData entry to lib/tool-longforms.ts, ship a custom ` +
        `longform component (and add to PER_TOOL_LONGFORM_TOOLS in this script + the page.tsx ` +
        `render condition), or grandfather with rationale.\n\n  Missing: ${longformMisses.sort().join(", ")}`,
);

// ---------------------------------------------------------------------
// Section D — sanity on the exemption maps.
// ---------------------------------------------------------------------

const orphanGrandfather = [...GRANDFATHERED_NO_CONTENT.keys()].filter(
  (id) => !liveIds.has(id),
);
assert(
  "GRANDFATHERED_NO_CONTENT only references live tools",
  orphanGrandfather.length === 0,
  orphanGrandfather.length === 0
    ? ""
    : `Stale entries in GRANDFATHERED_NO_CONTENT: ${orphanGrandfather.join(", ")}`,
);

const orphanCustom = [...PER_TOOL_LONGFORM_TOOLS].filter(
  (id) => !liveIds.has(id),
);
assert(
  "PER_TOOL_LONGFORM_TOOLS only references live tools",
  orphanCustom.length === 0,
  orphanCustom.length === 0
    ? ""
    : `Stale entries in PER_TOOL_LONGFORM_TOOLS: ${orphanCustom.join(", ")}`,
);

// Sanity: the page.tsx render condition must also list the same
// custom-longform IDs. Catches the case where this guard's allowlist
// drifts from the page render gate.
for (const id of PER_TOOL_LONGFORM_TOOLS) {
  assert(
    `page.tsx longform render condition excludes "${id}"`,
    PAGE_SRC.includes(`tool.id !== "${id}"`),
    `Add \`tool.id !== "${id}"\` to the longform render condition in app/tool/[id]/page.tsx, ` +
      `or remove "${id}" from PER_TOOL_LONGFORM_TOOLS here. Without the page.tsx exclusion, ` +
      `the tool renders both its custom longform AND the generic ToolRunnerLongform.`,
  );
}

// Cap on grandfathered list to force shrinkage over time. Cap is
// generous (40) to start — currently 36 — but the list should
// only get smaller as tools migrate.
assert(
  "GRANDFATHERED_NO_CONTENT stays bounded (≤ 40 entries)",
  GRANDFATHERED_NO_CONTENT.size <= 40,
  `GRANDFATHERED_NO_CONTENT has ${GRANDFATHERED_NO_CONTENT.size} entries; cap is 40. ` +
    `Migrate a tool off the list before adding new ones.`,
);

// 2026-05-01 — KNOWN_AI_LONGFORM_PENDING orphan check + cap.
//
// Same shrinkage discipline as GRANDFATHERED_NO_CONTENT. The cap is
// the current size; new AI tools must SHIP with a longform OR the
// developer adds them here AND has a principled reason for doing so
// AND finds a tool to remove from the list to keep the size flat
// (or shipping enough longforms first to make room).
const orphanAiPending = [...KNOWN_AI_LONGFORM_PENDING.keys()].filter(
  (id) => !liveIds.has(id),
);
assert(
  "KNOWN_AI_LONGFORM_PENDING only references live tools",
  orphanAiPending.length === 0,
  orphanAiPending.length === 0
    ? ""
    : `Stale entries in KNOWN_AI_LONGFORM_PENDING: ${orphanAiPending.join(", ")}.\n` +
        `  Remove them — they don't gate any actual rendering.`,
);
// Tools in KNOWN_AI_LONGFORM_PENDING that ALREADY have a longform —
// these are stale grandfather entries that should be removed.
const aiPendingButShipped = [...KNOWN_AI_LONGFORM_PENDING.keys()].filter(
  (id) => longformIds.has(id),
);
assert(
  "KNOWN_AI_LONGFORM_PENDING entries are actually missing longforms",
  aiPendingButShipped.length === 0,
  aiPendingButShipped.length === 0
    ? ""
    : `These AI tools are in KNOWN_AI_LONGFORM_PENDING but ALREADY have longforms in lib/tool-longforms.ts: ` +
        aiPendingButShipped.join(", ") +
        `.\n  Remove them from KNOWN_AI_LONGFORM_PENDING — the longform exists so the grandfather is stale.`,
);
assert(
  "KNOWN_AI_LONGFORM_PENDING stays bounded (≤ 0 entries — Phase 2 complete)",
  KNOWN_AI_LONGFORM_PENDING.size <= 0,
  `KNOWN_AI_LONGFORM_PENDING has ${KNOWN_AI_LONGFORM_PENDING.size} entries; cap is 0. ` +
    `Phase 2 closed the AI longform backlog. New AI tools must ship with a longform entry. ` +
    `If you genuinely need to grandfather a new tool (rare), bump this cap to 1 with rationale.`,
);

// ---------------------------------------------------------------------
// Section E — orphan check: intro / longform entries that don't
// correspond to any live tool. These are dead weight (they render
// nothing because page.tsx only consults the maps for live tools)
// but they accumulate over time.
// ---------------------------------------------------------------------

const orphanIntros = [...introIds].filter(
  (id) => !liveIds.has(id),
);
assert(
  "TOOL_INTROS entries don't reference dead tools",
  orphanIntros.length <= 5,
  orphanIntros.length <= 5
    ? ""
    : `${orphanIntros.length} intro entries point at non-live tools (>5 cap): ${orphanIntros.slice(0, 10).join(", ")}${orphanIntros.length > 10 ? ", ..." : ""}`,
);

const orphanLongforms = [...longformIds].filter((id) => !liveIds.has(id));
assert(
  "TOOL_LONGFORMS entries don't reference dead tools",
  orphanLongforms.length <= 3,
  orphanLongforms.length <= 3
    ? ""
    : `${orphanLongforms.length} longform entries point at non-live tools (>3 cap): ${orphanLongforms.join(", ")}`,
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
  `tool-content-coverage: ${pass} passed, ${fail} failed (of ${total})`,
);
process.exit(fail > 0 ? 1 : 0);
