#!/usr/bin/env node
/**
 * 2026-04-30 redirect health guard: every `destination:` value in
 * next.config.mjs `redirects()` must resolve to a real route.
 *
 * Background: commit 89cd1e8 shipped 35 308 redirects pointing at
 * /tool/<id> destinations to fix the 30%-of-sitemap-is-404 finding.
 * Plus there are pre-existing legacy /tools/<slug> redirects (Task
 * #71) and the /signup → /register alias. If a tool ID is later
 * renamed or removed, our redirects would silently start pointing
 * at dead URLs — recreating the same soft-404 SEO penalty we just
 * fixed.
 *
 * This guard parses every `{ source: ..., destination: ... }` block
 * in next.config.mjs and verifies:
 *   1. /tool/<id> destinations exist in lib/tools.ts
 *   2. /tools, /tools-with-internal-anchor, /pricing, /register etc.
 *      static routes have an app/<route>/page.tsx
 *   3. /<seo-slug> destinations resolve via either an
 *      app/<slug>/page.tsx OR another redirect (chains are allowed
 *      but tracked).
 *
 * Out of scope:
 *   - External destinations (https://*) — we trust those.
 *   - Dynamic patterns like /tools/:slug+ → /tools — the guard
 *     resolves the destination side, not the source pattern.
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
// Section A — extract every redirect from next.config.mjs.
// ---------------------------------------------------------------------------

const NEXT_SRC = fs.readFileSync(
  path.join(ROOT, "next.config.mjs"),
  "utf8",
);

// Match `{ source: "...", destination: "...", permanent: ... }` on
// one line OR multi-line. Capture each pair so we can report
// per-redirect failures.
const REDIRECT_RE =
  /\{\s*source:\s*"([^"]+)"\s*,\s*destination:\s*"([^"]+)"\s*,\s*permanent:\s*(true|false)\s*\}/g;
const redirects = [];
let m;
while ((m = REDIRECT_RE.exec(NEXT_SRC)) !== null) {
  redirects.push({
    source: m[1],
    destination: m[2],
    permanent: m[3] === "true",
  });
}

// Sanity: should be 60+ redirects (35 new + 18 legacy + ai-detector
// rebrand + signup alias).
assert(
  redirects.length >= 50,
  `next.config.mjs redirects parse: expected >= 50, got ${redirects.length} (regex drift?)`,
);

// ---------------------------------------------------------------------------
// Section B — extract tool IDs from lib/tools.ts for /tool/<id>
// destination resolution.
// ---------------------------------------------------------------------------

const TOOLS_SRC = fs.readFileSync(
  path.join(ROOT, "lib", "tools.ts"),
  "utf8",
);
const TOOL_ID_RE = /^\s*\{\s*id:\s*"([^"]+)"/gm;
const TOOL_IDS = new Set();
let tm;
while ((tm = TOOL_ID_RE.exec(TOOLS_SRC)) !== null) {
  TOOL_IDS.add(tm[1]);
}

// ---------------------------------------------------------------------------
// Section C — resolve each destination and flag dead ones.
//
// Resolution rules:
//   - /tool/<id>          → must exist in TOOL_IDS
//   - /<top-level>        → app/<top-level>/page.tsx must exist OR
//                            another redirect must source-match it
//   - /tools, /pricing, /register, /tools-with-anchor — same as top-
//     level; anchors stripped before resolution
//   - external / dynamic / hash-only → skipped (out of scope)
// ---------------------------------------------------------------------------

// Build set of source paths so we can detect redirect chains. A
// chain is acceptable IF the chain endpoint resolves; we just want
// to know about cycles.
const sourcePaths = new Set(redirects.map((r) => r.source));

function resolveDestination(dest, depth = 0) {
  if (depth > 4) return { ok: false, reason: "redirect-cycle (>4 hops)" };
  // Strip query + hash before route resolution.
  const cleanDest = dest.split("?")[0].split("#")[0];
  // External — out of scope.
  if (/^https?:\/\//.test(cleanDest)) return { ok: true, reason: "external" };
  // /tool/<id> → resolve via TOOL_IDS.
  if (cleanDest.startsWith("/tool/")) {
    const id = cleanDest.slice("/tool/".length);
    if (TOOL_IDS.has(id)) {
      return { ok: true, reason: `tool ${id}` };
    }
    return { ok: false, reason: `tool id "${id}" not in lib/tools.ts` };
  }
  // Top-level static route — app/<segment>/page.tsx.
  // Strip leading slash + any trailing slash.
  const segment = cleanDest.replace(/^\/+/, "").replace(/\/+$/, "");
  if (segment === "") {
    // Bare /; homepage. Should always exist.
    if (fs.existsSync(path.join(APP_ROOT, "page.tsx"))) {
      return { ok: true, reason: "homepage" };
    }
    return { ok: false, reason: "homepage page.tsx missing" };
  }
  // First segment (handles /tools-with-anchor etc.).
  const firstSeg = segment.split("/")[0];
  const pagePath = path.join(APP_ROOT, firstSeg, "page.tsx");
  if (fs.existsSync(pagePath)) {
    return { ok: true, reason: `app/${firstSeg}/page.tsx` };
  }
  // No file route — check if another redirect catches it.
  if (sourcePaths.has("/" + firstSeg)) {
    // Find the chained redirect and recurse.
    const chained = redirects.find((r) => r.source === "/" + firstSeg);
    if (chained) {
      const sub = resolveDestination(chained.destination, depth + 1);
      if (sub.ok) {
        return {
          ok: true,
          reason: `chain → ${chained.destination} (${sub.reason})`,
        };
      }
      return {
        ok: false,
        reason: `chain → ${chained.destination} which is dead: ${sub.reason}`,
      };
    }
  }
  return {
    ok: false,
    reason: `no app/${firstSeg}/page.tsx and no matching redirect`,
  };
}

const dead = [];
for (const r of redirects) {
  const result = resolveDestination(r.destination);
  if (!result.ok) {
    dead.push({ ...r, reason: result.reason });
  }
}

assert(
  dead.length === 0,
  `Found ${dead.length} redirect(s) pointing at dead destinations.\n` +
    `These would silently re-introduce soft-404 SEO penalties. Either fix the destination or remove the redirect.\n\n` +
    `Locations (next.config.mjs):\n` +
    dead
      .map(
        (r) =>
          `  ${r.source} → ${r.destination}  (permanent: ${r.permanent})\n    why: ${r.reason}`,
      )
      .join("\n"),
);

// ---------------------------------------------------------------------------
// Section D — sanity self-tests on the regex.
// ---------------------------------------------------------------------------

const POS_INLINE =
  '{ source: "/merge-pdf", destination: "/tool/merge", permanent: true }';
const reCheck =
  /\{\s*source:\s*"([^"]+)"\s*,\s*destination:\s*"([^"]+)"\s*,\s*permanent:\s*(true|false)\s*\}/;
assert(
  reCheck.test(POS_INLINE),
  "regex catches the canonical single-line redirect shape",
);

// ---------------------------------------------------------------------------
// Aggregator-friendly summary line.
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(
  `redirect-destinations: ${passed} passed, ${failed} failed (of ${total})`,
);
if (failed > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
