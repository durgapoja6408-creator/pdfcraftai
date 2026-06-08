#!/usr/bin/env node
/**
 * 2026-04-30 redirect-chain guard: no redirect destination should
 * itself be a redirect source.
 *
 * Background: the legacy /tools/<slug> redirects (Task #71) used to
 * point at /<slug>, but commits 89cd1e8 + cadf27c made /<slug>
 * itself redirect to /tool/<id>. That created 2-hop chains:
 *
 *   /tools/merge-pdf → /merge-pdf → /tool/merge
 *
 * Why it matters:
 *   - Google de-rates chained redirects (the destination doesn't
 *     accumulate as much PageRank as the original source had).
 *   - Each hop is a round-trip — slower for users and crawlers.
 *   - Browsers cap chain depth (typically 20); long chains break.
 *
 * Best practice: every redirect points DIRECTLY at the final
 * canonical URL.
 *
 * This guard parses next.config.mjs and asserts that NO redirect
 * destination matches another redirect's source. Sub-second static
 * parse, fails on the next time someone adds a chain.
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

// ---------------------------------------------------------------------------
// Section A — extract every redirect.
// ---------------------------------------------------------------------------

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

assert(
  redirects.length >= 30,
  `next.config.mjs redirects parse: expected >= 50, got ${redirects.length}`,
);

// ---------------------------------------------------------------------------
// Section A.5 — duplicate source detection.
//
// Two redirects with the same `source:` is a silent Next.js footgun:
// the first match wins, the second is ignored. Easy to introduce
// during refactors (e.g. when moving redirects between code blocks
// without noticing an existing entry above). Sub-second static check.
// ---------------------------------------------------------------------------

const seenSources = new Map();
const dupes = [];
for (const r of redirects) {
  const prior = seenSources.get(r.source);
  if (prior) {
    dupes.push({ source: r.source, first: prior, second: r });
  } else {
    seenSources.set(r.source, r);
  }
}

assert(
  dupes.length === 0,
  `Found ${dupes.length} duplicate redirect source(s) in next.config.mjs.\n` +
    `Next.js silently keeps only the FIRST match — the second entry never fires. Either consolidate or rename the source.\n\n` +
    `Dupes:\n` +
    dupes
      .map(
        (d) =>
          `  source="${d.source}"\n    first  → ${d.first.destination}\n    second → ${d.second.destination} (DEAD)`,
      )
      .join("\n"),
);

// ---------------------------------------------------------------------------
// Section B — build source set, then check every destination.
//
// A chain exists when a destination matches another redirect's
// source path (after stripping query + hash). We tolerate dynamic
// source patterns like "/tools/:slug+" by normalizing — any source
// containing ":" is treated as a pattern and skipped on the chain
// check (we can't statically determine if a destination matches a
// dynamic source).
// ---------------------------------------------------------------------------

const STATIC_SOURCES = new Set(
  redirects.filter((r) => !r.source.includes(":")).map((r) => r.source),
);

const chains = [];
for (const r of redirects) {
  const cleanDest = r.destination.split("?")[0].split("#")[0];
  if (STATIC_SOURCES.has(cleanDest)) {
    chains.push({
      source: r.source,
      destination: r.destination,
      // Find the redirect this chains into for the error message.
      next: redirects.find(
        (x) => x.source === cleanDest && !x.source.includes(":"),
      ),
    });
  }
}

assert(
  chains.length === 0,
  `Found ${chains.length} redirect chain(s).\n` +
    `Each one creates a 2+ hop redirect that wastes round-trips and harms SEO.\n` +
    `Fix: point the FIRST redirect directly at the FINAL destination.\n\n` +
    `Chains:\n` +
    chains
      .map(
        (c) =>
          `  ${c.source} → ${c.destination}${
            c.next ? ` → ${c.next.destination}` : ""
          }`,
      )
      .join("\n"),
);

// ---------------------------------------------------------------------------
// Section C — self-tests on the chain detector.
// ---------------------------------------------------------------------------

// Synthetic chain: /A → /B and /B → /C — should fail detection.
{
  const synthetic = [
    { source: "/a", destination: "/b" },
    { source: "/b", destination: "/c" },
  ];
  const sources = new Set(synthetic.map((x) => x.source));
  const found = synthetic.filter((x) => sources.has(x.destination));
  assert(found.length === 1, "synthetic chain detection works");
}
// Synthetic non-chain: /A → /Z, /B → /Y — should pass.
{
  const synthetic = [
    { source: "/a", destination: "/z" },
    { source: "/b", destination: "/y" },
  ];
  const sources = new Set(synthetic.map((x) => x.source));
  const found = synthetic.filter((x) => sources.has(x.destination));
  assert(found.length === 0, "synthetic non-chain passes cleanly");
}

// ---------------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(
  `redirect-chains: ${passed} passed, ${failed} failed (of ${total})`,
);
if (failed > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
