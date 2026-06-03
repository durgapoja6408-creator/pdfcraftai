#!/usr/bin/env node
// scripts/test-marketing-pages-jsonld.mjs
//
// 2026-05-12 — CI guard covering /bulk, /help marketing-page
// JSON-LD additions. Each page uses a different schema shape
// appropriate to its content:
//
//   - /bulk → Service + OfferCatalog (feature-led service surface)
//   - /help → CollectionPage + ItemList (topic-grouped help center)
//
// Each page also emits a BreadcrumbList anchored on its parent.
//
// Pure static-parse.

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const report = [];
function check(label, predicate) {
  const ok = !!predicate;
  if (ok) pass++; else fail++;
  report.push({ label, ok });
}

// ─── /bulk — Service ───
const BULK = readFileSync("app/bulk/page.tsx", "utf8");
check("bulk/B1: SERVICE_JSONLD declared", /const SERVICE_JSONLD\s*=/.test(BULK));
check("bulk/B2: @type Service", /"@type":\s*"Service"/.test(BULK));
check("bulk/B3: hasOfferCatalog OfferCatalog", /hasOfferCatalog:\s*\{[\s\S]*?"@type":\s*"OfferCatalog"/.test(BULK));
check("bulk/B4: itemListElement maps CAPABILITIES", /itemListElement:\s*CAPABILITIES\.map/.test(BULK));
check(
  "bulk/B5: SERVICE_JSONLD itemListElement uses .map (not literal)",
  (() => {
    const start = BULK.indexOf("const SERVICE_JSONLD");
    if (start < 0) return false;
    const end = BULK.indexOf("};", start);
    if (end < 0) return false;
    const block = BULK.slice(start, end);
    return /itemListElement:\s*CAPABILITIES\.map/.test(block) && !/itemListElement:\s*\[/.test(block);
  })()
);
check("bulk/B6: BreadcrumbList present", /"@type":\s*"BreadcrumbList"/.test(BULK));
check("bulk/B7: 2 ld+json script tags", (BULK.match(/type="application\/ld\+json"/g) || []).length >= 2);

// ─── /help — CollectionPage ───
const HELP = readFileSync("app/help/page.tsx", "utf8");
check("help/H1: COLLECTION_JSONLD declared", /const COLLECTION_JSONLD\s*=/.test(HELP));
check("help/H2: @type CollectionPage", /"@type":\s*"CollectionPage"/.test(HELP));
check("help/H3: numberOfItems = HELP_TOPICS.length", /numberOfItems:\s*HELP_TOPICS\.length/.test(HELP));
check("help/H4: itemListElement maps HELP_TOPICS", /itemListElement:\s*HELP_TOPICS\.map/.test(HELP));
check(
  "help/H5: COLLECTION_JSONLD itemListElement uses .map (not literal)",
  (() => {
    const start = HELP.indexOf("const COLLECTION_JSONLD");
    if (start < 0) return false;
    const end = HELP.indexOf("};", start);
    if (end < 0) return false;
    const block = HELP.slice(start, end);
    return /itemListElement:\s*HELP_TOPICS\.map/.test(block) && !/itemListElement:\s*\[/.test(block);
  })()
);
check("help/H6: BreadcrumbList present", /"@type":\s*"BreadcrumbList"/.test(HELP));
check("help/H7: 2 ld+json script tags", (HELP.match(/type="application\/ld\+json"/g) || []).length >= 2);

console.log("marketing-pages-jsonld:");
for (const r of report) console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}`);
console.log(`marketing-pages-jsonld: ${pass} passed, ${fail} failed (of ${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
