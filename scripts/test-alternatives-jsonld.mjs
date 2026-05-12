#!/usr/bin/env node
// scripts/test-alternatives-jsonld.mjs
//
// 2026-05-12 — CI guard for the CollectionPage + ItemList JSON-LD
// added to /alternatives (competitor comparisons index). Mirrors
// the pattern from /tools (test-tools-catalog-jsonld) and /compare
// (test-compare-page G-section).
//
// Sections:
//   A — constants declared
//   B — schema.org shape
//   C — itemListElement derived from COMPETITOR_SLUGS (anti-drift)
//   D — breadcrumb covers Home → Alternatives
//   E — rendering hygiene (script tags + JSON.stringify)
//
// Pure static-parse — no live render needed.

import { readFileSync } from "node:fs";

const PAGE_PATH = "app/alternatives/page.tsx";
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

// ─── Section A ───
check("A1: COLLECTION_JSONLD declared", /const COLLECTION_JSONLD\s*=/.test(PAGE));
check("A2: BREADCRUMB_JSONLD declared", /const BREADCRUMB_JSONLD\s*=/.test(PAGE));
check(
  "A3: imports both COMPETITORS + COMPETITOR_SLUGS",
  /import\s*\{[^}]*COMPETITORS[^}]*COMPETITOR_SLUGS[^}]*\}\s*from\s*"@\/lib\/alternatives"/.test(PAGE)
);

// ─── Section B ───
check("B1: @type CollectionPage", /"@type":\s*"CollectionPage"/.test(PAGE));
check(
  "B2: ItemList nested under mainEntity",
  /mainEntity:\s*\{[\s\S]*?"@type":\s*"ItemList"/.test(PAGE)
);
check(
  "B3: numberOfItems wired to COMPETITOR_SLUGS.length",
  /numberOfItems:\s*COMPETITOR_SLUGS\.length/.test(PAGE)
);
check(
  "B4: itemListElement maps over COMPETITOR_SLUGS",
  /itemListElement:\s*COMPETITOR_SLUGS\.map/.test(PAGE)
);
check(
  "B5: each item has @type ListItem + position + url + name",
  /"@type":\s*"ListItem"/.test(PAGE) &&
    /position:\s*idx\s*\+\s*1/.test(PAGE) &&
    /url:\s*`\$\{SITE\}\/alternatives\/\$\{slug\}`/.test(PAGE) &&
    /name:\s*`\$\{c\.name\} alternative`/.test(PAGE)
);
check(
  "B6: each item description truncates past 200 chars (schema hygiene)",
  /c\.oneLine\.length\s*>\s*200/.test(PAGE) &&
    /c\.oneLine\.slice\(0,\s*197\)/.test(PAGE)
);

// ─── Section C: derivation-not-literal (anchored on COLLECTION_JSONLD) ───
// Same anti-drift pattern as /tools. Anchor scope: substring between
// COLLECTION_JSONLD declaration and its closing `};`.
check(
  "C1: COLLECTION_JSONLD itemListElement uses .map (not literal)",
  (() => {
    const start = PAGE.indexOf("const COLLECTION_JSONLD");
    if (start < 0) return false;
    const end = PAGE.indexOf("};", start);
    if (end < 0) return false;
    const block = PAGE.slice(start, end);
    return (
      /itemListElement:\s*COMPETITOR_SLUGS\.map/.test(block) &&
      !/itemListElement:\s*\[/.test(block)
    );
  })()
);

// ─── Section D: breadcrumb ───
check("D1: BreadcrumbList @type", /"@type":\s*"BreadcrumbList"/.test(PAGE));
check(
  "D2: breadcrumb has Home + Alternatives items",
  /name:\s*"Home"[\s\S]*name:\s*"Alternatives"/.test(PAGE)
);

// ─── Section E: rendering hygiene ───
check(
  "E1: at least 2 application/ld+json script tags",
  (PAGE.match(/type="application\/ld\+json"/g) || []).length >= 2
);
check(
  "E2: JSON.stringify wraps both schemas",
  /JSON\.stringify\(COLLECTION_JSONLD\)/.test(PAGE) &&
    /JSON\.stringify\(BREADCRUMB_JSONLD\)/.test(PAGE)
);

// ─── Report ───
console.log("alternatives-jsonld:");
for (const r of report) {
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}`);
}
const total = pass + fail;
console.log(`alternatives-jsonld: ${pass} passed, ${fail} failed (of ${total})`);
process.exit(fail === 0 ? 0 : 1);
