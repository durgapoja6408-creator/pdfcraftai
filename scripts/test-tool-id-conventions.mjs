#!/usr/bin/env node
// scripts/test-tool-id-conventions.mjs
//
// 2026-05-12 — scoped take on TOOL_IMPROVEMENT_PLAN T2-2.
//
// The full T2-2 ("Standardize tool ID conventions") proposes a
// multi-day refactor that migrates every existing ID to a single
// convention plus a redirect table for every legacy URL. That is
// SEO- and bookmark-disruptive without a clear payoff.
//
// This guard takes the SAFE half: it locks in the conventions that
// the catalog HAPPENS to already follow, so any new tool that drifts
// from those conventions fails CI. No URL changes, no migrations,
// no redirects required. The cost is a sub-second static-parse CI
// check; the benefit is that the catalog stays internally consistent
// as it grows.
//
// Rules pinned (all currently 113/113 compliant — verified before
// shipping this guard):
//
//   1. Every `id` matches /^[a-z][a-z0-9-]*$/ (lowercase kebab,
//      starts with a letter, no leading/trailing/double hyphens).
//   2. Every `id` is unique across the TOOLS array.
//   3. Every tool with `free: false` has an `ai-` prefix on its id.
//      (Mirror: marketing surfaces use the prefix to distinguish
//      paid AI tools from free in-browser tools; user expectation
//      is that ai-* costs credits and non-prefixed does not.)
//   4. Every tool with `free: true` does NOT have an `ai-` prefix.
//      Same expectation from the user side, just enforced both ways.
//   5. Every tool's `group` value is in the canonical 6-group enum
//      ("AI" | "Organize" | "Inspect" | "Convert" | "Optimize" | "Edit" |
//      "Security"). The TS union enforces this at compile-time, but
//      a wrong literal can slip past the typechecker if it matches
//      one of the union strings. The guard adds belt-and-suspenders.
//   6. Every AI tool (free:false) is in the "AI" group; every
//      non-AI tool is NOT in the "AI" group. Same logical pairing
//      as 3/4 — the group is what powers the catalog's left-rail
//      filter; an AI tool placed in "Organize" disappears from the
//      AI filter and confuses everyone.
//
// Anti-rules deliberately NOT pinned (intentional escapes):
//
//   - No requirement that free tools use "-pdf" suffix. We have
//     `merge`, `split`, `rotate`, `unlock`, `compress`, `protect`,
//     `crop`, `extract-pages`, `delete-pages` — short single-word
//     IDs are fine and reading better than `merge-pdf` etc.
//   - No requirement on minimum or maximum ID length. `merge` is
//     fine; `ai-research-paper` is fine.
//   - No restriction on number of hyphens. Some IDs are deep
//     (`ai-research-paper`, `ai-loan-bundle`), some are shallow
//     (`unlock`, `rotate`). Both are legitimate.
//
// Output line conforms to the aggregator regex
// `${name}: ${pass} passed, ${fail} failed`.

import { readFileSync } from "node:fs";

const TOOLS_PATH = "lib/tools.ts";
const TOOLS_SRC = readFileSync(TOOLS_PATH, "utf8");

const VALID_GROUPS = new Set([
  "AI",
  "Organize",
  "Inspect", // 2026-06-05 IA rebalance: read-only inspectors/extractors
  "Convert",
  "Optimize",
  "Edit",
  "Security",
]);

// Parse each tool entry. Anchor on the leading `{ id: "..."` then
// look ahead to find name/free/group on the same line.
const ENTRY_REGEX =
  /\{\s*id:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"[^}]*?free:\s*(true|false)[^}]*?group:\s*"([^"]+)"/g;

const entries = [];
let m;
while ((m = ENTRY_REGEX.exec(TOOLS_SRC)) !== null) {
  entries.push({
    id: m[1],
    name: m[2],
    free: m[3] === "true",
    group: m[4],
  });
}

let pass = 0;
let fail = 0;
const report = [];

function check(label, predicate, extra = "") {
  const ok = !!predicate;
  if (ok) pass++;
  else fail++;
  report.push({ label, ok, extra });
}

// ─── Section A: parse sanity ───
check(
  "A1: TOOLS_PATH parsed at least 100 entries (sanity check)",
  entries.length >= 100,
  `parsed ${entries.length}`
);

// ─── Section B: ID format ───
const ID_RE = /^[a-z][a-z0-9-]*$/;
const NO_DOUBLE_HYPHEN = /^[^-].*[^-]$|^[a-z0-9]+$/;
const badFormat = entries.filter(
  (e) => !ID_RE.test(e.id) || /--/.test(e.id) || /-$/.test(e.id)
);
check(
  "B1: every id matches lowercase kebab-case",
  badFormat.length === 0,
  badFormat.length ? `bad: ${badFormat.map((e) => e.id).join(", ")}` : ""
);

// ─── Section C: uniqueness ───
const seen = new Map();
const dupes = [];
for (const e of entries) {
  if (seen.has(e.id)) dupes.push(e.id);
  else seen.set(e.id, true);
}
check(
  "C1: every id is unique",
  dupes.length === 0,
  dupes.length ? `dupes: ${dupes.join(", ")}` : ""
);

// ─── Section D: ai- prefix discipline ───
const aiToolsWithoutPrefix = entries.filter(
  (e) => !e.free && !e.id.startsWith("ai-")
);
check(
  "D1: every AI tool (free:false) starts with ai-",
  aiToolsWithoutPrefix.length === 0,
  aiToolsWithoutPrefix.length
    ? `missing prefix: ${aiToolsWithoutPrefix.map((e) => e.id).join(", ")}`
    : ""
);

const freeToolsWithPrefix = entries.filter(
  (e) => e.free && e.id.startsWith("ai-")
);
check(
  "D2: no free tool (free:true) starts with ai-",
  freeToolsWithPrefix.length === 0,
  freeToolsWithPrefix.length
    ? `false-prefix: ${freeToolsWithPrefix.map((e) => e.id).join(", ")}`
    : ""
);

// ─── Section E: group is in canonical enum ───
const badGroup = entries.filter((e) => !VALID_GROUPS.has(e.group));
check(
  "E1: every tool's group is in the canonical 6-group enum",
  badGroup.length === 0,
  badGroup.length
    ? `bad: ${badGroup.map((e) => `${e.id}=${e.group}`).join(", ")}`
    : ""
);

// ─── Section F: group <-> free pairing ───
const aiToolsNotInAiGroup = entries.filter(
  (e) => !e.free && e.group !== "AI"
);
check(
  "F1: every AI tool (free:false) is in the 'AI' group",
  aiToolsNotInAiGroup.length === 0,
  aiToolsNotInAiGroup.length
    ? `mismatched: ${aiToolsNotInAiGroup.map((e) => `${e.id}=${e.group}`).join(", ")}`
    : ""
);

const nonAiToolsInAiGroup = entries.filter((e) => e.free && e.group === "AI");
check(
  "F2: no free tool (free:true) is in the 'AI' group",
  nonAiToolsInAiGroup.length === 0,
  nonAiToolsInAiGroup.length
    ? `mismatched: ${nonAiToolsInAiGroup.map((e) => e.id).join(", ")}`
    : ""
);

// ─── Section G: name uniqueness (defense in depth) ───
// IDs are guaranteed unique by section C. Names CAN repeat in
// theory (different tools can share a marketing display name) but
// in practice they don't. Catch accidental duplicates introduced
// when a new tool is added without updating the marketing name.
const nameSeen = new Map();
const nameDupes = [];
for (const e of entries) {
  if (nameSeen.has(e.name)) nameDupes.push(e.name);
  else nameSeen.set(e.name, true);
}
check(
  "G1: every tool name is unique (display-name collision check)",
  nameDupes.length === 0,
  nameDupes.length ? `dupes: ${nameDupes.join(", ")}` : ""
);

// ─── Report ───
console.log("tool-id-conventions:");
for (const r of report) {
  const tail = r.extra ? `  (${r.extra})` : "";
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}${tail}`);
}
const total = pass + fail;
console.log(
  `tool-id-conventions: ${pass} passed, ${fail} failed (of ${total})`
);
process.exit(fail === 0 ? 0 : 1);
