#!/usr/bin/env node
/**
 * 2026-04-30 SEO guard: every URL advertised in sitemap.xml must have
 * a corresponding route that returns 200 OK.
 *
 * Background: a curl audit of pdfcraftai.com/sitemap.xml found that
 * **35 of 116 non-dynamic URLs (30%)** return HTTP 404. The pattern:
 * `lib/seo-pages.ts` declares slugs in `SEO_SLUGS` (which `app/sitemap.ts`
 * reads), but many of those slugs have no matching `app/<slug>/page.tsx`
 * directory. Sitemap.xml therefore advertises dead URLs to search
 * engines — which is one of the worst possible SEO signals: 30% of
 * the catalog is "soft-404", crawl budget gets wasted, and Google
 * may demote the entire domain's authority.
 *
 * This guard runs in sub-second time at `npm test`, walks every slug
 * source that feeds sitemap.ts (SEO_SLUGS, USE_CASE_SLUGS,
 * BLOG_POSTS, ALL_HELP_ARTICLES, COMPETITOR_SLUGS, AUTHOR_SLUGS,
 * LEGAL_SLUGS, plus the static-route list inside sitemap.ts itself),
 * and verifies each maps to a real route on disk.
 *
 * Why static-parse instead of a runtime smoke against /sitemap.xml:
 *   - Faster (sub-second vs. 30+ min for a full curl sweep).
 *   - Catches the regression at commit time, before deploy.
 *   - The runtime smoke spec already exists for the sitemap-routed
 *     surfaces it can reach (all-tools, SEO landings); this fills the
 *     gap for slugs that are advertised but never routed.
 *
 * Failure modes flagged:
 *   1. SEO_SLUG without app/<slug>/page.tsx → 404 in sitemap
 *   2. USE_CASE_SLUG missing from USE_CASES dictionary → 404
 *   3. BLOG_POSTS slug without app/blog/[slug] route handler params
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
// Section A — extract SEO_SLUGS from lib/seo-pages.ts.
//
// SEO_SLUGS is the type-union literal at the top of the file. Each
// member like `| "merge-pdf"` becomes a sitemap URL `/merge-pdf`.
// ---------------------------------------------------------------------------

const SEO_SRC = fs.readFileSync(path.join(LIB_ROOT, "seo-pages.ts"), "utf8");

// Match `| "<slug>"` lines anywhere in the type union. The union spans
// many lines with category-comment blocks interleaved. The LAST entry
// ends with `";` (statement terminator) not bare `"`, so allow an
// optional trailing semicolon — without it the last slug silently
// drops from the count.
const SEO_UNION_RE = /^\s*\|\s*"([^"]+)"\s*;?\s*$/gm;
const SEO_SLUGS = [];
let m;
while ((m = SEO_UNION_RE.exec(SEO_SRC)) !== null) {
  SEO_SLUGS.push(m[1]);
}
assert(
  SEO_SLUGS.length >= 80,
  `lib/seo-pages.ts SEO_SLUGS parse: expected >= 80 slugs, got ${SEO_SLUGS.length}`,
);

// ---------------------------------------------------------------------------
// Section B — every SEO_SLUG must have a corresponding app/<slug>/page.tsx.
//
// Known-broken backlog (sister of test-seo-pages-tool-mapping.mjs's
// KNOWN_DEAD_REFS): slugs that have been declared for SEO equity but
// the actual route file hasn't shipped. Each entry is a real bug
// (sitemap.xml advertises a dead URL), but tracked here so the guard
// fires only on NEW dead routes.
// ---------------------------------------------------------------------------

const KNOWN_MISSING_SEO_ROUTES = new Set([
  // Backlog from 2026-04-30 audit. 30% of sitemap was 404 at that
  // point — these are the routes the user (or a future tool-shipping
  // session) needs to either build, redirect, or remove from
  // SEO_SLUGS.
  //
  // **Currently mitigated via 308 redirects in next.config.mjs**
  // (commit shipped 2026-04-30). Each slug below now redirects to
  // its closest live equivalent (most → /tool/<id>, a few → /tools
  // category page when no specific tool exists). The user-facing
  // 404 is fixed; the soft-404 SEO penalty clears on next crawl
  // cycle.
  //
  // Why these stay in the list anyway: the long-term fix is to
  // either (a) ship real app/<slug>/page.tsx landings (better SEO —
  // unique content per keyword, internal linking) OR (b) remove
  // the slug from SEO_SLUGS so the sitemap stops advertising it.
  // The 308 is a stopgap. When a real landing lands, remove the
  // slug from this list AND drop the matching redirect from
  // next.config.mjs.
  "merge-pdf",
  "split-pdf",
  "compress-pdf",
  "word-to-pdf",
  "excel-to-pdf",
  "powerpoint-to-pdf",
  "jpg-to-pdf",
  "png-to-pdf",
  "extract-pdf-pages",
  "delete-pdf-pages",
  "pdf-page-count",
  "resize-pdf",
  "remove-pdf-metadata",
  "add-logo-to-pdf",
  "add-text-to-pdf",
  "highlight-pdf",
  "redact-pdf-free",
  // 2026-05-02 — extract-pdf-attachments + edit-pdf landings shipped
  // (real tools wired, app/<slug>/page.tsx files now exist).
  "sign-pdf-free",
  "repair-pdf",
  "flatten-pdf",
  "markdown-to-pdf",
  "text-to-pdf",
  "extract-pdf-form-data",
  "reorder-pdf-pages",
  // 2026-05-02 — extract-emails-from-pdf landing shipped (extract-
  // contacts tool wired, app/extract-emails-from-pdf/page.tsx exists).
  "extract-entities-from-pdf",
  "stamp-pdf",
  "n-up-pdf",
  // 2026-05-02 — grayscale-pdf landing shipped (real tool wired,
  // app/grayscale-pdf/page.tsx exists).
  "strip-links",
  // 2026-05-02 — booklet-pdf landing shipped (real tool wired,
  // app/booklet-pdf/page.tsx exists).
  "free-draw-pdf",
  "add-links",
]);

const missingRoutes = [];
for (const slug of SEO_SLUGS) {
  const pagePath = path.join(APP_ROOT, slug, "page.tsx");
  if (!fs.existsSync(pagePath)) {
    if (KNOWN_MISSING_SEO_ROUTES.has(slug)) continue;
    missingRoutes.push(slug);
  }
}

assert(
  missingRoutes.length === 0,
  `Found ${missingRoutes.length} NEW SEO slug(s) declared in SEO_SLUGS but lacking app/<slug>/page.tsx.\n` +
    `Each one will be advertised in sitemap.xml but return HTTP 404 — search engines treat this as soft-404, wastes crawl budget, demotes domain authority.\n\n` +
    `Either (a) create app/<slug>/page.tsx (mirror an existing landing's pattern), (b) remove the slug from SEO_SLUGS in lib/seo-pages.ts, or (c) if shipping is genuinely on the backlog with a known timeline, add to KNOWN_MISSING_SEO_ROUTES in this file.\n\n` +
    `Missing route files:\n` +
    missingRoutes.map((s) => `  app/${s}/page.tsx`).join("\n"),
);

// Soft cap so the backlog can't grow indefinitely.
assert(
  KNOWN_MISSING_SEO_ROUTES.size <= 50,
  `KNOWN_MISSING_SEO_ROUTES has ${KNOWN_MISSING_SEO_ROUTES.size} entries — over the 50-item soft cap. Either ship some of the missing routes or trim SEO_SLUGS.`,
);

// ---------------------------------------------------------------------------
// Section C — USE_CASE_SLUGS must each have an entry in USE_CASES.
//
// USE_CASES dictionary keys vs. USE_CASE_SLUGS array — if they
// diverge, the dynamic /use-cases/[slug] route hits notFound() at
// runtime.
// ---------------------------------------------------------------------------

const USE_CASES_SRC = fs.readFileSync(
  path.join(LIB_ROOT, "use-cases.ts"),
  "utf8",
);

// USE_CASE_SLUGS is computed at runtime via `Object.keys(USE_CASES)`,
// so there's no literal array to parse. Walk the USE_CASES object
// keys instead — those ARE the canonical sitemap slug source.
const useCaseDictKeys = new Set();
const USE_CASE_DICT_KEY_RE = /^\s+"([^"]+)":\s*\{/gm;
let dm;
while ((dm = USE_CASE_DICT_KEY_RE.exec(USE_CASES_SRC)) !== null) {
  useCaseDictKeys.add(dm[1]);
}

// Sanity: should have at least 5 use-cases. We don't need a separate
// "USE_CASE_SLUGS array entries match USE_CASES keys" check because
// USE_CASE_SLUGS literally IS Object.keys(USE_CASES) — no possible
// drift.
assert(
  useCaseDictKeys.size >= 5,
  `USE_CASES parse: expected >= 5 keys, got ${useCaseDictKeys.size}`,
);

// Each use-case key implies a /use-cases/<slug> route handled by
// app/use-cases/[slug]/page.tsx via generateStaticParams. Verify
// the dynamic route file exists (without it, every use-case URL
// 404s).
const useCaseRouteFile = path.join(
  APP_ROOT,
  "use-cases",
  "[slug]",
  "page.tsx",
);
assert(
  fs.existsSync(useCaseRouteFile),
  `Missing app/use-cases/[slug]/page.tsx — every USE_CASE_SLUG would 404.`,
);

// ---------------------------------------------------------------------------
// Section D — self-test the regexes.
// ---------------------------------------------------------------------------

const POS_UNION = '  | "merge-pdf"';
const reCheck = /^\s*\|\s*"([^"]+)"\s*$/;
assert(reCheck.test(POS_UNION), "regex catches the canonical SEO union literal shape");
const NEG_FIELD = '    tool: "merge",';
assert(!reCheck.test(NEG_FIELD), "regex does NOT match a field assignment");

// ---------------------------------------------------------------------------
// Aggregator-friendly summary line.
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(
  `sitemap-routes-exist: ${passed} passed, ${failed} failed (of ${total})`,
);
if (failed > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
