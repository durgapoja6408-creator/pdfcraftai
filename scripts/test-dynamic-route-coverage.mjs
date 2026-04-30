#!/usr/bin/env node
/**
 * 2026-04-30 dynamic-route coverage guard: every public-facing
 * dynamic route directory under app/ that's referenced by sitemap.ts
 * must have a non-empty data source AND a working file at
 * `app/<path>/[<param>]/page.tsx`.
 *
 * Background: sitemap.ts pulls slugs from many data sources to
 * generate per-slug URLs. A regression where the data file is
 * trimmed (e.g. someone removes COMPETITOR_SLUGS entries) or the
 * route file is renamed silently shrinks the sitemap surface — the
 * existing all-tools / SEO smoke specs don't cover this because
 * they walk top-level app dirs, not nested dynamic routes.
 *
 * What this guard checks:
 *   1. Each data source (BLOG_POSTS, ALL_HELP_ARTICLES,
 *      COMPETITOR_SLUGS, AUTHOR_SLUGS, USE_CASES) has at least N
 *      entries (sanity floor — catches accidental deletions).
 *   2. Each corresponding dynamic-route file exists.
 *   3. Each route file has `generateStaticParams` (so static
 *      generation works at build time).
 *
 * Out of scope:
 *   - Auth-gated dynamic routes (/app/files/[id], /admin/users/[id])
 *     — those don't go in sitemap.
 *   - Marketing parallel routes (app/(marketing)/...) — those
 *     duplicate-route the same slugs via Next route groups.
 *
 * Output line conforms to the aggregator regex
 * `${name}: ${pass} passed, ${fail} failed`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const APP_ROOT = path.join(ROOT, "app");
const LIB_ROOT = path.join(ROOT, "lib");

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

// ---------------------------------------------------------------------------
// Public dynamic routes that contribute to sitemap.xml.
// ---------------------------------------------------------------------------

/**
 * Each entry describes one dynamic route + its data source:
 *   - path: app/<path>/[<param>]/page.tsx — the file we expect
 *   - dataFile: lib/<file>.ts — where the slugs live
 *   - countRegex: regex that matches one entry per slug
 *   - minCount: floor for sanity check (prevents accidental deletion
 *     from silently shrinking the sitemap)
 *   - label: human-readable for failure messages
 */
const ROUTES = [
  {
    label: "blog",
    pageFile: path.join(APP_ROOT, "blog", "[slug]", "page.tsx"),
    dataFile: path.join(LIB_ROOT, "blog-posts.ts"),
    countRegex: /^\s+slug:\s*"[^"]+"/gm,
    minCount: 10,
  },
  {
    label: "help articles",
    pageFile: path.join(APP_ROOT, "help", "[slug]", "page.tsx"),
    dataFile: path.join(LIB_ROOT, "help-topics.ts"),
    // Help articles are nested in `arts: [...]` inside topics, with
    // their own `slug:` field. The simple `slug:` count includes
    // both topic slugs and article slugs — the route only consumes
    // article slugs, but the floor here is total (>= 30) so we don't
    // need to disambiguate.
    countRegex: /\bslug:\s*"[^"]+"/g,
    minCount: 25,
  },
  {
    label: "alternatives (competitors)",
    pageFile: path.join(APP_ROOT, "alternatives", "[competitor]", "page.tsx"),
    dataFile: path.join(LIB_ROOT, "alternatives.ts"),
    countRegex: /\bslug:\s*"[^"]+"/g,
    minCount: 4,
  },
  {
    label: "author bio pages",
    pageFile: path.join(APP_ROOT, "about", "authors", "[slug]", "page.tsx"),
    dataFile: path.join(LIB_ROOT, "authors.ts"),
    countRegex: /\bslug:\s*"[^"]+"/g,
    minCount: 1,
  },
  {
    label: "use-case detail pages",
    pageFile: path.join(APP_ROOT, "use-cases", "[slug]", "page.tsx"),
    dataFile: path.join(LIB_ROOT, "use-cases.ts"),
    // USE_CASES is a record dictionary keyed by slug — count the keys.
    countRegex: /^\s+"([a-z0-9-]+)":\s*\{/gm,
    minCount: 5,
  },
  {
    label: "tool runners",
    pageFile: path.join(APP_ROOT, "tool", "[id]", "page.tsx"),
    dataFile: path.join(LIB_ROOT, "tools.ts"),
    countRegex: /^\s*\{\s*id:\s*"[^"]+"/gm,
    minCount: 80,
  },
];

// ---------------------------------------------------------------------------
// Section A — verify each route file exists with generateStaticParams.
// ---------------------------------------------------------------------------

for (const r of ROUTES) {
  assert(
    fs.existsSync(r.pageFile),
    `Missing route file for ${r.label}: ${path.relative(ROOT, r.pageFile)}`,
  );
  if (!fs.existsSync(r.pageFile)) continue;

  const pageSrc = fs.readFileSync(r.pageFile, "utf8");
  // /tool/[id] uses ToolRunner via dynamic dispatch — no
  // generateStaticParams (everything's client-rendered behind ssr:
  // false). Skip the staticParams check there.
  if (r.label === "tool runners") continue;
  assert(
    /generateStaticParams\b/.test(pageSrc),
    `Missing generateStaticParams in ${r.label} route: ${path.relative(ROOT, r.pageFile)}. Without it, Next builds the route at runtime and slugs aren't pre-rendered.`,
  );
}

// ---------------------------------------------------------------------------
// Section B — verify each data source has at least minCount entries.
// ---------------------------------------------------------------------------

for (const r of ROUTES) {
  assert(
    fs.existsSync(r.dataFile),
    `Missing data file for ${r.label}: ${path.relative(ROOT, r.dataFile)}`,
  );
  if (!fs.existsSync(r.dataFile)) continue;

  const dataSrc = fs.readFileSync(r.dataFile, "utf8");
  const matches = dataSrc.match(r.countRegex) || [];
  assert(
    matches.length >= r.minCount,
    `${r.label} data source has ${matches.length} entries, below floor of ${r.minCount}. Either an accidental deletion or the regex needs updating. File: ${path.relative(ROOT, r.dataFile)}`,
  );
}

// ---------------------------------------------------------------------------
// Section C — sitemap.ts must import from each data file.
// (If sitemap stops importing one of these, sitemap.xml shrinks
// silently — easy to miss in code review.)
// ---------------------------------------------------------------------------

const SITEMAP_SRC = fs.readFileSync(
  path.join(APP_ROOT, "sitemap.ts"),
  "utf8",
);

const REQUIRED_IMPORTS = [
  { file: "@/lib/tools", label: "TOOLS" },
  { file: "@/lib/blog-posts", label: "BLOG_POSTS" },
  { file: "@/lib/help-topics", label: "ALL_HELP_ARTICLES" },
  { file: "@/lib/alternatives", label: "COMPETITOR_SLUGS" },
  { file: "@/lib/authors", label: "AUTHOR_SLUGS" },
  { file: "@/lib/use-cases", label: "USE_CASE_SLUGS" },
  { file: "@/lib/seo-pages", label: "SEO_SLUGS" },
  { file: "@/lib/legal-docs", label: "LEGAL_SLUGS" },
];

for (const imp of REQUIRED_IMPORTS) {
  assert(
    SITEMAP_SRC.includes(`from "${imp.file}"`),
    `app/sitemap.ts is missing import from ${imp.file} (${imp.label}). Sitemap.xml would silently lose those slugs.`,
  );
}

// ---------------------------------------------------------------------------
// Section D — self-tests on the regexes.
// ---------------------------------------------------------------------------

const POS_BLOG = '    slug: "byok-guide",';
const blogRe = /^\s+slug:\s*"[^"]+"/gm;
assert(
  POS_BLOG.match(blogRe)?.length === 1,
  "regex catches the canonical `    slug: \"...\"` shape",
);
const POS_USE_CASE = '  "ocr-old-archive": {';
const useCaseRe = /^\s+"([a-z0-9-]+)":\s*\{/gm;
assert(
  POS_USE_CASE.match(useCaseRe)?.length === 1,
  "regex catches the use-case dictionary key shape",
);

// ---------------------------------------------------------------------------
// Aggregator-friendly summary.
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(
  `dynamic-route-coverage: ${passed} passed, ${failed} failed (of ${total})`,
);
if (failed > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
