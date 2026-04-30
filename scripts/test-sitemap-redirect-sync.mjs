#!/usr/bin/env node
/**
 * 2026-04-30 sitemap-canonicalization guard:
 * REDIRECTED_SEO_SLUGS in app/sitemap.ts MUST equal the set of `/<slug>`
 * sources in next.config.mjs `redirects()` whose source matches an
 * SEO_SLUGS entry.
 *
 * Background: commits 89cd1e8 + cadf27c shipped 40 308 redirects for
 * dead/broken SEO landings. To keep sitemap.xml clean (canonical URLs
 * only, not redirect sources), app/sitemap.ts excludes those slugs
 * from the SEO_SLUGS-based seoRoutes section.
 *
 * Two failure modes this guard protects against:
 *   1. New redirect added to next.config.mjs but not added to
 *      REDIRECTED_SEO_SLUGS → sitemap.xml advertises a redirect
 *      source again → minor SEO hygiene drift.
 *   2. Redirect removed from next.config.mjs (because the route was
 *      finally built) but slug stays in REDIRECTED_SEO_SLUGS →
 *      canonical landing missing from sitemap → real SEO loss.
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

const NEXT_SRC = fs.readFileSync(
  path.join(ROOT, "next.config.mjs"),
  "utf8",
);
const SITEMAP_SRC = fs.readFileSync(
  path.join(ROOT, "app", "sitemap.ts"),
  "utf8",
);
const SEO_PAGES_SRC = fs.readFileSync(
  path.join(ROOT, "lib", "seo-pages.ts"),
  "utf8",
);

// ---------------------------------------------------------------------------
// Section A — extract SEO_SLUGS from lib/seo-pages.ts.
// ---------------------------------------------------------------------------

// Allow optional trailing semicolon — the LAST entry in the union
// type ends with `";` (statement terminator), not just `"`. Without
// the `;?` the parser silently drops the last slug.
const SEO_UNION_RE = /^\s*\|\s*"([^"]+)"\s*;?\s*$/gm;
const SEO_SLUGS = new Set();
let m;
while ((m = SEO_UNION_RE.exec(SEO_PAGES_SRC)) !== null) {
  SEO_SLUGS.add(m[1]);
}
assert(
  SEO_SLUGS.size >= 80,
  `lib/seo-pages.ts SEO_SLUGS parse: expected >= 80, got ${SEO_SLUGS.size}`,
);

// ---------------------------------------------------------------------------
// Section B — extract /<slug> redirect sources from next.config.mjs
// where the slug is also in SEO_SLUGS.
//
// We only count single-segment top-level slugs (like /merge-pdf), not
// multi-segment legacy patterns (like /tools/merge-pdf which redirect
// to /<slug> and aren't sitemap concerns).
// ---------------------------------------------------------------------------

const REDIRECT_RE =
  /\{\s*source:\s*"\/([^"\/]+)"\s*,\s*destination:\s*"[^"]+"\s*,\s*permanent:\s*true\s*\}/g;
const seoRedirectSources = new Set();
let r;
while ((r = REDIRECT_RE.exec(NEXT_SRC)) !== null) {
  const slug = r[1];
  if (SEO_SLUGS.has(slug)) {
    seoRedirectSources.add(slug);
  }
}

// Sanity: should be ~40 entries after commits 89cd1e8 + cadf27c
// (35 + 5 = 40).
assert(
  seoRedirectSources.size >= 35,
  `next.config.mjs SEO redirects parse: expected >= 35 single-segment redirects whose source is in SEO_SLUGS, got ${seoRedirectSources.size}`,
);

// ---------------------------------------------------------------------------
// Section C — extract REDIRECTED_SEO_SLUGS from app/sitemap.ts.
// ---------------------------------------------------------------------------

const REDIRECTED_BLOCK_RE =
  /const REDIRECTED_SEO_SLUGS\s*=\s*new Set\(\[([\s\S]*?)\]\)/;
const blockMatch = REDIRECTED_BLOCK_RE.exec(SITEMAP_SRC);
assert(
  blockMatch !== null,
  `app/sitemap.ts is missing the REDIRECTED_SEO_SLUGS Set literal — sitemap canonicalization layer broken`,
);

const sitemapRedirectedSlugs = new Set();
if (blockMatch) {
  const literals = blockMatch[1].match(/"([^"]+)"/g) || [];
  for (const l of literals) {
    sitemapRedirectedSlugs.add(l.replace(/"/g, ""));
  }
}

// ---------------------------------------------------------------------------
// Section D — the two sets must be equal.
// ---------------------------------------------------------------------------

const inNextNotInSitemap = [...seoRedirectSources].filter(
  (s) => !sitemapRedirectedSlugs.has(s),
);
const inSitemapNotInNext = [...sitemapRedirectedSlugs].filter(
  (s) => !seoRedirectSources.has(s),
);

assert(
  inNextNotInSitemap.length === 0,
  `${inNextNotInSitemap.length} slug(s) redirect in next.config.mjs but missing from REDIRECTED_SEO_SLUGS in app/sitemap.ts:\n` +
    inNextNotInSitemap.map((s) => `  - ${s}`).join("\n") +
    `\n\nSitemap.xml will advertise these as canonical URLs even though they redirect. Add them to REDIRECTED_SEO_SLUGS in app/sitemap.ts to canonicalize.`,
);

assert(
  inSitemapNotInNext.length === 0,
  `${inSitemapNotInNext.length} slug(s) listed in REDIRECTED_SEO_SLUGS but NOT redirected in next.config.mjs:\n` +
    inSitemapNotInNext.map((s) => `  - ${s}`).join("\n") +
    `\n\nThese landings exist as live routes but are excluded from sitemap.xml — silent SEO loss. Either add the redirect to next.config.mjs or remove from REDIRECTED_SEO_SLUGS.`,
);

// ---------------------------------------------------------------------------
// Section E — self-test the regexes.
// ---------------------------------------------------------------------------

const POS_REDIRECT =
  '{ source: "/merge-pdf", destination: "/tool/merge", permanent: true }';
const reCheck =
  /\{\s*source:\s*"\/([^"\/]+)"\s*,\s*destination:\s*"[^"]+"\s*,\s*permanent:\s*true\s*\}/;
assert(
  reCheck.test(POS_REDIRECT),
  "regex catches the canonical single-segment 308 redirect",
);
const NEG_LEGACY =
  '{ source: "/tools/merge-pdf", destination: "/merge-pdf", permanent: true }';
assert(
  !reCheck.test(NEG_LEGACY),
  "regex does NOT match multi-segment /tools/<slug> legacy redirects (those aren't sitemap concerns)",
);

// ---------------------------------------------------------------------------
// Aggregator-friendly summary.
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(
  `sitemap-redirect-sync: ${passed} passed, ${failed} failed (of ${total})`,
);
if (failed > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
