#!/usr/bin/env node
// scripts/test-use-cases-index-jsonld.mjs
//
// 2026-05-12 — CI guard for the CollectionPage + ItemList JSON-LD
// added to /use-cases (index page). Mirrors test-tools-catalog-jsonld
// + test-alternatives-jsonld pattern. The per-slug /use-cases/[slug]
// pages already emit HowTo + FAQ + Article JSON-LD via the shared
// UseCasePage component — this guard covers only the index.

import { readFileSync } from "node:fs";

const PAGE_PATH = "app/use-cases/page.tsx";
const PAGE = readFileSync(PAGE_PATH, "utf8");

let pass = 0, fail = 0;
const report = [];
function check(label, predicate) {
  const ok = !!predicate;
  if (ok) pass++; else fail++;
  report.push({ label, ok });
}

check("A1: COLLECTION_JSONLD declared", /const COLLECTION_JSONLD\s*=/.test(PAGE));
check("A2: BREADCRUMB_JSONLD declared", /const BREADCRUMB_JSONLD\s*=/.test(PAGE));
check("B1: @type CollectionPage", /"@type":\s*"CollectionPage"/.test(PAGE));
check("B2: ItemList nested under mainEntity", /mainEntity:\s*\{[\s\S]*?"@type":\s*"ItemList"/.test(PAGE));
check("B3: numberOfItems wired to USE_CASE_SLUGS.length", /numberOfItems:\s*USE_CASE_SLUGS\.length/.test(PAGE));
check("B4: itemListElement maps over USE_CASE_SLUGS", /itemListElement:\s*USE_CASE_SLUGS\.map/.test(PAGE));
check(
  "B5: each item has @type ListItem + position + url + name",
  /"@type":\s*"ListItem"/.test(PAGE) &&
    /position:\s*idx\s*\+\s*1/.test(PAGE) &&
    /url:\s*`\$\{SITE\}\/use-cases\/\$\{slug\}`/.test(PAGE) &&
    /name:\s*u\.h1/.test(PAGE)
);
check(
  "C1: COLLECTION_JSONLD itemListElement uses .map (not literal)",
  (() => {
    const start = PAGE.indexOf("const COLLECTION_JSONLD");
    if (start < 0) return false;
    const end = PAGE.indexOf("};", start);
    if (end < 0) return false;
    const block = PAGE.slice(start, end);
    return /itemListElement:\s*USE_CASE_SLUGS\.map/.test(block) && !/itemListElement:\s*\[/.test(block);
  })()
);
check("D1: BreadcrumbList @type", /"@type":\s*"BreadcrumbList"/.test(PAGE));
check("D2: breadcrumb has Home + Use cases items", /name:\s*"Home"[\s\S]*name:\s*"Use cases"/.test(PAGE));
check("E1: at least 2 application/ld+json script tags", (PAGE.match(/type="application\/ld\+json"/g) || []).length >= 2);
check(
  "E2: JSON.stringify wraps both schemas",
  /JSON\.stringify\(COLLECTION_JSONLD\)/.test(PAGE) && /JSON\.stringify\(BREADCRUMB_JSONLD\)/.test(PAGE)
);

console.log("use-cases-index-jsonld:");
for (const r of report) console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}`);
console.log(`use-cases-index-jsonld: ${pass} passed, ${fail} failed (of ${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
