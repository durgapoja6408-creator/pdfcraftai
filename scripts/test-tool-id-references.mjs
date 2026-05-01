#!/usr/bin/env node
/**
 * 2026-05-01 — tool-id reference integrity guard.
 *
 * Background: today's session caught two pre-existing/new bugs where
 * editorial content references a tool id that doesn't exist in the
 * canonical TOOLS array (lib/tools.ts):
 *
 *   • lib/tool-longforms.ts:730 had a CTA `linkHref: "/tool/fill-forms"`
 *     where the actual tool id is "pdf-form-fill" (singular). Has been
 *     wrong since the longform shipped — every click 404s.
 *   • lib/seo-pages.ts:2385 (today's /ai-fill-pdf-form landing) listed
 *     related: [..., "sign", "fill-form"] where "sign" and "fill-form"
 *     aren't tool ids. Each renders a related-tool card that links to
 *     /tool/sign or /tool/fill-form — both 404.
 *
 * Both cases broke a click-through that the editorial assumed worked.
 *
 * This guard pins the floor: every tool id referenced in a CTA
 * `linkHref` or a `related[]` array must exist in TOOLS. Sub-second
 * static parse, fails the build the moment someone fat-fingers an
 * id that doesn't match the canonical catalog.
 *
 * Approach:
 *   1. Extract canonical tool ids from lib/tools.ts (regex matches
 *      `{ id: "..." }` shape).
 *   2. Walk lib/tool-longforms.ts for `linkHref: "/tool/<id>"` —
 *      every <id> must be in the canonical set.
 *   3. Walk lib/seo-pages.ts for `related: [...]` arrays — every
 *      string must be in the canonical set.
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

const TOOLS_SRC = fs.readFileSync(path.join(ROOT, "lib/tools.ts"), "utf8");
const LONGFORMS_SRC = fs.readFileSync(
  path.join(ROOT, "lib/tool-longforms.ts"),
  "utf8",
);
const SEO_SRC = fs.readFileSync(path.join(ROOT, "lib/seo-pages.ts"), "utf8");

// ---------------------------------------------------------------------
// Pre-existing broken tool ids in lib/seo-pages.ts related[] arrays.
//
// 22 unique ids across ~70 reference points across the SEO catalog.
// Each renders as a /tool/<id> link that 404s. None are from today's
// shipped work — all are pre-existing editorial drift from when the
// catalog evolved (tools renamed, deprecated, or never built).
//
// Pattern categories:
//
//   • Renamed tools where related[] still references the old id:
//     "fill-forms" → actual id is "pdf-form-fill"
//     "extract-attachments" → actual id is "pdf-attachments"
//
//   • Aspirational references to tools that were planned but never
//     shipped (no client-side equivalent in pdf-lib):
//     "compress" — no client-side PDF compression
//     "protect"  — no client-side encryption (needs server qpdf)
//     "edit-pdf" — no text editing capability
//
//   • Indian-context AI tools deferred / not shipped:
//     "ai-tnpsc", "ai-upsc", "ai-jee-neet", "ai-rental",
//     "ai-court-order"
//
//   • SEO slug names accidentally placed in related[] (which expects
//     tool ids, not slugs):
//     "tamil-pdf-translator", "hindi-pdf-translator", "pdf-to-excel",
//     "split-pdf", "extract-pdf-attachments"
//
//   • Catch-all category names from an early catalog scheme:
//     "to-pdf", "pdf-to-office", "pdf-metadata", "invoice-generator",
//     "extract-form-data", "extract-contacts", "extract-dates"
//
// Phase 3 cleanup task: triage each id, replace with a valid tool id
// in every related[] that uses it (or remove the entry entirely if no
// equivalent exists), then remove from this set and lower the cap.
//
// The cap = 22 is the current set size. Only shrinkage allowed —
// adding a NEW broken id (not in the allowlist) fails the build. To
// intentionally add a known-broken reference (rare; only when the
// related[] genuinely should point at a not-yet-shipped tool with
// known migration plan), reuse one of the existing entries rather
// than expanding the set.
const KNOWN_BROKEN_RELATED_IDS = new Set([
  // Renames
  "fill-forms",
  "extract-attachments",
  // Aspirational / not built
  "compress",
  "protect",
  "edit-pdf",
  // Indian-context AI tools deferred
  "ai-tnpsc",
  "ai-upsc",
  "ai-jee-neet",
  "ai-rental",
  "ai-court-order",
  // SEO slugs misplaced in related[]
  "tamil-pdf-translator",
  "hindi-pdf-translator",
  "pdf-to-excel",
  "split-pdf",
  "extract-pdf-attachments",
  // Catch-all category names from early scheme
  "to-pdf",
  "pdf-to-office",
  "pdf-metadata",
  "invoice-generator",
  "extract-form-data",
  "extract-contacts",
  "extract-dates",
]);

// ---------------------------------------------------------------------
// Section A — extract canonical tool ids from lib/tools.ts
// ---------------------------------------------------------------------

const validIds = new Set();
const TOOL_RE = /\{\s*id:\s*"([a-z0-9-]+)"/g;
let m;
while ((m = TOOL_RE.exec(TOOLS_SRC)) !== null) validIds.add(m[1]);

assert(
  validIds.size >= 100,
  `Expected to find >= 100 tool ids in lib/tools.ts. Found ${validIds.size}. ` +
    "Has the catalog file shape changed?",
);

// ---------------------------------------------------------------------
// Section B — every CTA linkHref in tool-longforms.ts must point at
// a real tool id. CTA shape: `linkHref: "/tool/<id>"`.
// ---------------------------------------------------------------------

const longformCtaIssues = [];
const CTA_RE = /linkHref:\s*"\/tool\/([a-z0-9-]+)"/g;
let c;
while ((c = CTA_RE.exec(LONGFORMS_SRC)) !== null) {
  if (!validIds.has(c[1])) {
    // Find the line for a useful diagnostic.
    const line = LONGFORMS_SRC.slice(0, c.index).split("\n").length;
    longformCtaIssues.push(
      `lib/tool-longforms.ts:${line}: CTA linkHref references "/tool/${c[1]}" but ` +
        `"${c[1]}" is not a valid tool id. Did you mean a similar id from lib/tools.ts?`,
    );
  }
}

assert(
  longformCtaIssues.length === 0,
  `Found ${longformCtaIssues.length} broken CTA linkHref(s) in lib/tool-longforms.ts.\n` +
    "Each one renders a 404 when users click through:\n\n" +
    longformCtaIssues.map((s) => "  " + s).join("\n"),
);

// ---------------------------------------------------------------------
// Section C — every entry in a `related: [...]` array in seo-pages.ts
// must be a valid tool id.
// ---------------------------------------------------------------------

// Strict path: any id NOT in validIds AND NOT in the known-broken
// allowlist is a NEW bug — fails the build immediately.
// Grandfathered path: ids in KNOWN_BROKEN_RELATED_IDS are silently
// accepted. Their references are pre-existing 404s tracked for Phase 3.
// Encountered-broken set: also tracks WHICH known-broken ids actually
// got referenced this run, so we can enforce the cap on actual usage
// (not just declared list size).
const seoRelatedIssues = [];
const encounteredBroken = new Set();
const RELATED_RE = /related:\s*\[((?:\s*"[a-z0-9-]+",?\s*)+)\]/g;
let r;
while ((r = RELATED_RE.exec(SEO_SRC)) !== null) {
  const ids = [...r[1].matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1]);
  for (const id of ids) {
    if (validIds.has(id)) continue; // Valid → fine.
    if (KNOWN_BROKEN_RELATED_IDS.has(id)) {
      encounteredBroken.add(id); // Grandfathered → accepted, tracked.
      continue;
    }
    // Neither valid nor grandfathered → genuine new bug.
    const line = SEO_SRC.slice(0, r.index).split("\n").length;
    seoRelatedIssues.push(
      `lib/seo-pages.ts:${line}: related[] contains "${id}" which is neither ` +
        "a valid tool id NOR a grandfathered known-broken id. New invalid " +
        "references must use a real tool id from lib/tools.ts. To grandfather " +
        "(rare), add the id to KNOWN_BROKEN_RELATED_IDS in this script with " +
        "rationale and bump the cap.",
    );
  }
}

assert(
  seoRelatedIssues.length === 0,
  `Found ${seoRelatedIssues.length} NEW invalid tool id(s) in lib/seo-pages.ts ` +
    `related[] arrays (not in the grandfather allowlist).\n\n` +
    seoRelatedIssues.map((s) => "  " + s).join("\n"),
);

// Allowlist hygiene: every id in KNOWN_BROKEN_RELATED_IDS should
// actually be referenced somewhere in SEO_SRC. If an id has been fully
// repaired (no longer referenced anywhere), it should be removed from
// the allowlist to keep the cap meaningful.
const staleAllowlistEntries = [...KNOWN_BROKEN_RELATED_IDS].filter(
  (id) => !encounteredBroken.has(id),
);
assert(
  staleAllowlistEntries.length === 0,
  `KNOWN_BROKEN_RELATED_IDS contains ${staleAllowlistEntries.length} stale entr(ies) ` +
    `that are no longer referenced anywhere in lib/seo-pages.ts. Remove them from the ` +
    `allowlist + lower the cap to keep the shrinkage-discipline meaningful: ` +
    staleAllowlistEntries.join(", "),
);

// Cap: only-shrinkage discipline. Adding a NEW grandfather entry
// (instead of fixing the underlying reference) bumps the size; this
// assertion forces a deliberate cap bump in the same PR for visibility.
assert(
  KNOWN_BROKEN_RELATED_IDS.size <= 22,
  `KNOWN_BROKEN_RELATED_IDS has ${KNOWN_BROKEN_RELATED_IDS.size} entries; ` +
    `cap is 22. Either fix one of the listed ids to repair its references ` +
    `(preferred — repair the real tool reference in seo-pages.ts), or if a ` +
    `new id genuinely needs grandfathering, fix one existing entry first ` +
    `to keep the cap monotonic.`,
);

// ---------------------------------------------------------------------
// Section D — same check for related[] arrays in tool-longforms.ts
// (SEO landings have related; longforms also have CTA + related is
// implicit via the catalog, but if related[] ever appears here, audit it).
// ---------------------------------------------------------------------

const longformRelatedIssues = [];
let lr;
const LONGFORM_RELATED_RE = /related:\s*\[((?:\s*"[a-z0-9-]+",?\s*)+)\]/g;
while ((lr = LONGFORM_RELATED_RE.exec(LONGFORMS_SRC)) !== null) {
  const ids = [...lr[1].matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1]);
  for (const id of ids) {
    if (!validIds.has(id)) {
      const line = LONGFORMS_SRC.slice(0, lr.index).split("\n").length;
      longformRelatedIssues.push(
        `lib/tool-longforms.ts:${line}: related[] contains "${id}" which is not a valid tool id.`,
      );
    }
  }
}

assert(
  longformRelatedIssues.length === 0,
  `Found ${longformRelatedIssues.length} invalid tool id(s) in lib/tool-longforms.ts related[] arrays.\n\n` +
    longformRelatedIssues.map((s) => "  " + s).join("\n"),
);

// ---------------------------------------------------------------------
// Section E — every CTA linkHref in seo-pages.ts (if any) must also
// point at a real tool id. SEO pages don't typically have linkHref
// (the SeoLandingPage template uses primaryHref derived from
// data.tool, not a per-page linkHref), but if one is added in the
// future this catches it.
// ---------------------------------------------------------------------

const seoCtaIssues = [];
let sc;
const SEO_CTA_RE = /linkHref:\s*"\/tool\/([a-z0-9-]+)"/g;
while ((sc = SEO_CTA_RE.exec(SEO_SRC)) !== null) {
  if (!validIds.has(sc[1])) {
    const line = SEO_SRC.slice(0, sc.index).split("\n").length;
    seoCtaIssues.push(
      `lib/seo-pages.ts:${line}: CTA linkHref references "/tool/${sc[1]}" but ` +
        `"${sc[1]}" is not a valid tool id.`,
    );
  }
}

assert(
  seoCtaIssues.length === 0,
  `Found ${seoCtaIssues.length} broken CTA linkHref(s) in lib/seo-pages.ts.\n\n` +
    seoCtaIssues.map((s) => "  " + s).join("\n"),
);

// ---------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
}

console.log(`tool-id-references: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
