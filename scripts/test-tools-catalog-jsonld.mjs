#!/usr/bin/env node
// scripts/test-tools-catalog-jsonld.mjs
//
// 2026-05-12 — CI guard for the CollectionPage + ItemList JSON-LD
// added to /tools (the canonical tool catalog page). Mirrors the
// FAQPage JSON-LD pattern locked in on /compare (test-compare-page
// G-section).
//
// Sections:
//   A — both JSON-LD constants declared with the right shapes
//   B — CollectionPage + ItemList nesting matches schema.org spec
//   C — ItemList items derive from TOOLS at render time (not hardcoded)
//   D — Breadcrumb covers Home → All tools
//   E — both blocks emitted via application/ld+json script tags
//
// Pure static-parse — no live render needed.

import { readFileSync } from "node:fs";

const PAGE_PATH = "app/tools/page.tsx";
const PAGE = readFileSync(PAGE_PATH, "utf8");

let pass = 0;
let fail = 0;
const report = [];

function check(label, predicate) {
  const ok = !!predicate;
  if (ok) pass++;
  else fail++;
  report.push({ label, ok });
}

// ─── Section A: constants ───
check(
  "A1: COLLECTION_JSONLD constant declared",
  /const COLLECTION_JSONLD\s*=/.test(PAGE)
);
check(
  "A2: BREADCRUMB_JSONLD constant declared",
  /const BREADCRUMB_JSONLD\s*=/.test(PAGE)
);
check(
  "A3: TOOLS imported from @/lib/tools (not duplicated)",
  /import\s*\{[^}]*TOOLS[^}]*\}\s*from\s*"@\/lib\/tools"/.test(PAGE)
);

// ─── Section B: CollectionPage + ItemList shapes ───
check(
  "B1: @type CollectionPage on top-level schema",
  /"@type":\s*"CollectionPage"/.test(PAGE)
);
check(
  "B2: ItemList nested under mainEntity",
  /mainEntity:\s*\{[\s\S]*?"@type":\s*"ItemList"/.test(PAGE)
);
check(
  "B3: numberOfItems wired to TOOL_STATS.total",
  /numberOfItems:\s*TOOL_STATS\.total/.test(PAGE)
);
check(
  "B4: itemListElement maps over TOOLS",
  /itemListElement:\s*TOOLS\.map/.test(PAGE)
);
check(
  "B5: each entry has @type ListItem + position + url + name",
  /"@type":\s*"ListItem"/.test(PAGE) &&
    /position:\s*idx\s*\+\s*1/.test(PAGE) &&
    /url:\s*`\$\{SITE\}\/tool\/\$\{tool\.id\}`/.test(PAGE) &&
    /name:\s*tool\.name/.test(PAGE)
);

// ─── Section C: deriving from canonical TOOLS (not hardcoded) ───
// Anti-drift: if someone hardcodes a literal itemListElement array
// inside COLLECTION_JSONLD instead of mapping over TOOLS, the schema
// falls out of sync with the actual catalog (and stays wrong forever
// when new tools ship). C1 anchors on the CollectionPage block only
// — the breadcrumb's itemListElement IS allowed to be a literal
// because it has exactly two static entries (Home + All tools).
check(
  "C1: CollectionPage itemListElement uses TOOLS.map (not a literal)",
  // Anchor scope: substring between COLLECTION_JSONLD declaration and
  // the closing `};` of that block. Inside that scope, the
  // itemListElement must be `TOOLS.map(...)`.
  (() => {
    const start = PAGE.indexOf("const COLLECTION_JSONLD");
    if (start < 0) return false;
    const end = PAGE.indexOf("};", start);
    if (end < 0) return false;
    const block = PAGE.slice(start, end);
    return (
      /itemListElement:\s*TOOLS\.map/.test(block) &&
      !/itemListElement:\s*\[/.test(block)
    );
  })()
);
check(
  "C2: description field is truncated past 200 chars (schema-spec hygiene)",
  /tool\.desc\.length\s*>\s*200/.test(PAGE) &&
    /tool\.desc\.slice\(0,\s*197\)/.test(PAGE)
);

// ─── Section D: breadcrumb ───
check(
  "D1: BreadcrumbList @type",
  /"@type":\s*"BreadcrumbList"/.test(PAGE)
);
check(
  "D2: breadcrumb has Home + All tools items",
  /name:\s*"Home"[\s\S]*name:\s*"All tools"/.test(PAGE)
);

// ─── Section E: rendered as JSON-LD script tags ───
check(
  "E1: at least 2 application/ld+json script tags (CollectionPage + Breadcrumb)",
  (PAGE.match(/type="application\/ld\+json"/g) || []).length >= 2
);
check(
  "E2: JSON.stringify wraps both schemas (not inline JSON)",
  /JSON\.stringify\(COLLECTION_JSONLD\)/.test(PAGE) &&
    /JSON\.stringify\(BREADCRUMB_JSONLD\)/.test(PAGE)
);

// ─── Report ───
console.log("tools-catalog-jsonld:");
for (const r of report) {
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}`);
}
const total = pass + fail;
console.log(
  `tools-catalog-jsonld: ${pass} passed, ${fail} failed (of ${total})`
);
process.exit(fail === 0 ? 0 : 1);
