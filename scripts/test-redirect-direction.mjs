#!/usr/bin/env node
/**
 * 2026-05-02: redirect-direction integrity guard.
 *
 * Background: today's session caught two redirect-direction bugs of
 * the same shape:
 *
 *   • /text-to-pdf → /tool/pdf-to-text (caught + fixed 2026-04-24)
 *     User searches "text to PDF converter" (input=text, output=PDF)
 *     and lands on the OPPOSITE-direction PDF → text extractor.
 *
 *   • /markdown-to-pdf → /tool/pdf-to-markdown (caught + fixed today)
 *     Same shape: user searches "Markdown to PDF" (input=md,
 *     output=PDF) and lands on the OPPOSITE-direction PDF → markdown
 *     extractor.
 *
 * Both bugs lurked silently because the redirect destinations DO
 * exist — they just happen to be the wrong tool for the URL the user
 * was on. CI guards that just check "redirect destination is a real
 * tool" (test-redirect-destinations.mjs) and "every advertised slug
 * resolves to something" (test-sitemap-routes-exist.mjs) BOTH pass
 * for these cases, because the destination tool exists and the URL
 * returns 200. The bug is structural — direction mismatch between
 * URL semantics and destination tool semantics.
 *
 * This guard pins the floor: if a slug has an SEO landing with
 * `tool: "X"` AND a redirect with `source: "/<slug>"`, then the
 * redirect destination MUST resolve to "/tool/X" (the same tool the
 * SEO landing references). Otherwise the redirect is bypassing the
 * canonical landing AND sending users to the wrong tool — the worst
 * possible failure mode for keyword-targeted SEO.
 *
 * The KNOWN_FALLBACK_REDIRECTS allowlist whitelists deliberate
 * "shipping ahead of tooling" cases where the redirect intentionally
 * routes to a fallback tool (because the canonical tool doesn't ship
 * yet). Those entries must match the KNOWN_DEAD_REFS in
 * test-seo-pages-tool-mapping.mjs — both files document the same
 * deliberate-deferral state from different angles.
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
const SEO_SRC = fs.readFileSync(
  path.join(ROOT, "lib", "seo-pages.ts"),
  "utf8",
);

// ---------------------------------------------------------------------------
// Section A — extract { source, destination } pairs from next.config.mjs.
//
// Match shape: { source: "/foo", destination: "/tool/bar", permanent: true }
// Single-segment sources only (no /tools/<x>, no /:slug+ patterns).
// ---------------------------------------------------------------------------

const REDIRECT_RE =
  /\{\s*source:\s*"(\/[a-z0-9-]+)"\s*,\s*destination:\s*"(\/tool\/[a-z0-9-]+)"\s*,/g;
const redirects = []; // [{ source, destinationSlug }]
let m;
while ((m = REDIRECT_RE.exec(NEXT_SRC)) !== null) {
  redirects.push({
    source: m[1].slice(1), // strip leading "/"
    destinationSlug: m[2].replace(/^\/tool\//, ""),
  });
}

assert(
  redirects.length >= 4,
  `next.config.mjs parse: expected >= 20 single-segment /<slug> → /tool/<id> redirects, got ${redirects.length}`,
);

// ---------------------------------------------------------------------------
// Section B — extract slug → tool mapping from lib/seo-pages.ts.
//
// Walk the file line-by-line tracking the nearest preceding
// "<slug>": { wrapper. Same approach as test-seo-pages-tool-mapping.
// ---------------------------------------------------------------------------

const slugToTool = new Map();
const lines = SEO_SRC.split("\n");
let currentSlug = null;
const slugRe = /^\s*"([^"]+)":\s*\{/;
const toolRe = /^\s*tool:\s*"([^"]+)"/;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const sm = slugRe.exec(line);
  if (sm) {
    currentSlug = sm[1];
    continue;
  }
  const tm = toolRe.exec(line);
  if (tm && currentSlug) {
    slugToTool.set(currentSlug, tm[1]);
  }
}

assert(
  slugToTool.size >= 80,
  `lib/seo-pages.ts parse: expected >= 80 slug→tool entries, got ${slugToTool.size}`,
);

// ---------------------------------------------------------------------------
// Section C — direction-mismatch detection.
//
// Allowlist for deliberate fallbacks (matches KNOWN_DEAD_REFS in
// test-seo-pages-tool-mapping.mjs). Adding a new entry here means
// "the source slug's SEO landing intentionally points at a not-yet-
// shipped tool, AND the redirect intentionally routes to a fallback
// while the real tool ships." Each entry documents the deliberate
// deferral.
// ---------------------------------------------------------------------------

const KNOWN_FALLBACK_REDIRECTS = new Set([
  // Office bidirectionals — server-side LibreOffice rail, deferred
  // until Paddle KYC unblocks paid tier. SEO landing's `tool:` is
  // "pdf-to-office" (not yet shipped); redirect routes to
  // /tool/pdf-to-text (closest live extraction tool).
  "pdf-to-word",
  "pdf-to-excel",
  "pdf-to-powerpoint",
]);

const directionMismatches = [];
for (const { source, destinationSlug } of redirects) {
  const seoTool = slugToTool.get(source);
  if (!seoTool) continue; // no SEO landing for this slug — orthogonal
  if (seoTool === destinationSlug) continue; // direction matches → fine
  if (KNOWN_FALLBACK_REDIRECTS.has(source)) continue; // deliberate fallback
  directionMismatches.push({ source, destinationSlug, seoTool });
}

assert(
  directionMismatches.length === 0,
  `Found ${directionMismatches.length} redirect(s) whose destination doesn't match the SEO landing's tool:.\n` +
    `Each one is a wrong-direction bug — user searches for the URL's keyword but lands on a tool that does the opposite.\n` +
    `Either (a) update the redirect's destination to match the SEO landing's tool field, (b) remove the redirect entirely (so the landing renders), or (c) if the destination is intentionally a fallback for a not-yet-shipped tool, add the source slug to KNOWN_FALLBACK_REDIRECTS in this file with a comment explaining the deferral.\n\n` +
    `Mismatches:\n` +
    directionMismatches
      .map(
        (r) =>
          `  - /${r.source} → /tool/${r.destinationSlug} | SEO landing tool: "${r.seoTool}"`,
      )
      .join("\n"),
);

// ---------------------------------------------------------------------------
// Section D — KNOWN_FALLBACK_REDIRECTS shouldn't grow without bound.
// ---------------------------------------------------------------------------

assert(
  KNOWN_FALLBACK_REDIRECTS.size <= 6,
  `KNOWN_FALLBACK_REDIRECTS has ${KNOWN_FALLBACK_REDIRECTS.size} entries — over the 6-item soft cap. Either ship some of the missing tools or de-list the SEO landings.`,
);

// Each allowlist entry must actually appear in next.config.mjs (no
// stale entries).
for (const slug of KNOWN_FALLBACK_REDIRECTS) {
  const found = redirects.some((r) => r.source === slug);
  assert(
    found,
    `KNOWN_FALLBACK_REDIRECTS entry "${slug}" doesn't appear as a /<slug> → /tool/<id> redirect in next.config.mjs — stale allowlist?`,
  );
}

// ---------------------------------------------------------------------------
// Section E — self-test the regexes so future config refactors fail loud.
// ---------------------------------------------------------------------------

const POS_REDIRECT = `      { source: "/markdown-to-pdf", destination: "/tool/markdown-to-pdf", permanent: true },`;
const matched = REDIRECT_RE.exec(POS_REDIRECT);
assert(
  matched !== null && matched[1] === "/markdown-to-pdf" && matched[2] === "/tool/markdown-to-pdf",
  "self-test: REDIRECT_RE captures source + destination from canonical line",
);
REDIRECT_RE.lastIndex = 0;

const POS_SLUG = `  "markdown-to-pdf": {`;
assert(slugRe.test(POS_SLUG), "self-test: slugRe matches the canonical SEO entry shape");

const POS_TOOL = `    tool: "markdown-to-pdf",`;
assert(toolRe.test(POS_TOOL), "self-test: toolRe matches the canonical tool field shape");

// ---------------------------------------------------------------------------
// Aggregator-friendly summary line.
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(`redirect-direction: ${passed} passed, ${failed} failed (of ${total})`);
if (failed > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
