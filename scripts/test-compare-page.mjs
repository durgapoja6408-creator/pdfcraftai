#!/usr/bin/env node
// scripts/test-compare-page.mjs
//
// 2026-05-12 — CI guard for TOOL_IMPROVEMENT_PLAN T2-6 (compare
// intent-router). Locks in the structural invariants so future
// refactors don't accidentally regress the page into something
// less SEO-friendly or less complete.
//
// Sections:
//   A — page file exists + has all 12 intent groups
//   B — every candidate Link has a valid /tool/* or /<slug> target
//       + a "Free" or "AI" kind badge
//   C — page is SEO-indexable (canonical + open-graph + twitter)
//   D — sitemap registers /compare with priority 0.8
//   E — back-out CTA: link to /tools for full catalog browse
//
// Pure static-parse — no live render needed.

import { readFileSync } from "node:fs";

const PAGE_PATH = "app/compare/page.tsx";
const SITEMAP_PATH = "app/sitemap.ts";

const PAGE = readFileSync(PAGE_PATH, "utf8");
const SITEMAP = readFileSync(SITEMAP_PATH, "utf8");

let pass = 0;
let fail = 0;
const report = [];

function check(label, predicate) {
  const ok = !!predicate;
  if (ok) pass++;
  else fail++;
  report.push({ label, ok });
}

// ─── Section A: 12 intent groups present ───
check("A1: compare page file present", PAGE.length > 0);
check(
  "A2: INTENTS array declared",
  /const INTENTS:\s*Intent\[\]\s*=\s*\[/.test(PAGE)
);

const expectedIntents = [
  "combine",
  "split-extract",
  "convert-from-pdf",
  "convert-to-pdf",
  "shrink",
  "understand",
  "fill-sign",
  "security",
  "translate",
  "redact",
  "compare",
  "annotate",
];
for (const id of expectedIntents) {
  check(
    `A3.${id}: intent "${id}" present`,
    new RegExp(`id:\\s*"${id}"`).test(PAGE)
  );
}

check(
  "A4: ComparePage default export present",
  /export default function ComparePage\(\)/.test(PAGE)
);
check(
  "A5: hero question 'What do you want to do' present",
  /What do you want to do with your PDF\?/.test(PAGE)
);

// ─── Section B: candidate hrefs + kind badges ───
// Every candidate must be either a /tool/<id> href or a /<slug> SEO
// landing href. No bare external links, no /app/* routes (those need
// auth — wrong audience for /compare).
const hrefs = [...PAGE.matchAll(/href:\s*"(\/[a-z0-9/-]+)"/g)].map(
  (m) => m[1]
);
check(
  "B1: at least 18 candidate hrefs",
  hrefs.length >= 18,
  `got ${hrefs.length}`
);

const badHrefs = hrefs.filter(
  (h) => !(h.startsWith("/tool/") || /^\/[a-z-]+$/.test(h))
);
check(
  "B2: no malformed candidate hrefs",
  badHrefs.length === 0,
  badHrefs.length ? `bad: ${badHrefs.join(", ")}` : ""
);

const noAppHrefs = hrefs.filter((h) => h.startsWith("/app/"));
check(
  "B3: no /app/* hrefs (auth-gated routes not for /compare audience)",
  noAppHrefs.length === 0
);

// kind: "free" or "ai" tagging
check(
  "B4: candidate kind field exists for badge",
  /kind:\s*"(free|ai)"/.test(PAGE)
);
check(
  "B5: at least one 'ai' kind candidate (Summarize / Chat / Redact / ...)",
  /kind:\s*"ai"/.test(PAGE)
);
check(
  "B6: at least one 'free' kind candidate (Merge / Split / ...)",
  /kind:\s*"free"/.test(PAGE)
);

// ─── Section C: SEO surface ───
check(
  "C1: metadata title present",
  /title:\s*"Which PDF tool do I need\?/.test(PAGE)
);
check(
  "C2: canonical /compare set",
  /canonical:\s*"\/compare"/.test(PAGE)
);
check("C3: openGraph block present", /openGraph:\s*\{/.test(PAGE));
check("C4: twitter card meta present", /twitter:\s*\{/.test(PAGE));
check(
  "C5: description references key verbs (combine, split, shrink, ...)",
  /Combine, split, convert, shrink/.test(PAGE)
);

// ─── Section D: sitemap entry ───
check(
  "D1: /compare URL in sitemap",
  /\$\{SITE_URL\}\/compare/.test(SITEMAP)
);
check(
  "D2: /compare priority is 0.8",
  /\/compare`[^,]*?priority:\s*0\.8/.test(SITEMAP) ||
    /\/compare[^}]*priority:\s*0\.8/.test(SITEMAP)
);
check(
  "D3: /compare changeFrequency is weekly",
  /\/compare[^}]*changeFrequency:\s*"weekly"/.test(SITEMAP)
);

// ─── Section E: back-out CTA ───
check(
  "E1: 'See all' CTA links to /tools (full catalog escape hatch)",
  /href="\/tools"/.test(PAGE)
);
check(
  "E2: 'Didn't find it' fallback copy present",
  /Didn't find it\?/.test(PAGE)
);

// ─── Report ───
console.log("compare-page:");
for (const r of report) {
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}`);
}
const total = pass + fail;
console.log(`compare-page: ${pass} passed, ${fail} failed (of ${total})`);
process.exit(fail === 0 ? 0 : 1);
