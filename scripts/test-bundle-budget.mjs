#!/usr/bin/env node
// scripts/test-bundle-budget.mjs
//
// Phase 5 (2026-04-30): Bundle-size budget test. Reads
// .next/build-manifest.json (and the .next/static/chunks dir) and
// asserts that:
//   - The shared "first load" JS for any route stays below a budget
//   - Individual chunks don't grow past per-chunk caps
//   - Total chunks count + total size stay reasonable
//
// Why: M24 split each tool into its own webpack chunk (3.7 kB
// page-specific JS for /tool/[id]). It's easy for a future dep
// addition or accidental top-level import to undo that win and
// re-bloat the shared chunks. This test catches it at CI time.
//
// Skipping: if .next/ doesn't exist, this test no-ops with a
// friendly message (so `npm test` doesn't force a 60s production
// build for everyone). CI runs this AFTER a build step.
//
// Run: `node scripts/test-bundle-budget.mjs`
// Or:  npm test  (auto-included via the aggregator)

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const NEXT_DIR = resolve(ROOT, ".next");
const CHUNKS_DIR = resolve(NEXT_DIR, "static/chunks");
const MANIFEST = resolve(NEXT_DIR, "build-manifest.json");

let pass = 0;
let fail = 0;
const failures = [];

function assert(label, cond, detail) {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push({ label, detail: detail ?? "" });
  }
}

// ---------------------------------------------------------------------------
// Skip gracefully if .next isn't present. This keeps `npm test` fast
// for local dev (no need to build first). CI should run `npm run build`
// before invoking this suite.
// ---------------------------------------------------------------------------

if (!existsSync(NEXT_DIR)) {
  console.log("test-bundle-budget: 0 passed, 0 failed (of 0) [skipped — no .next/ build]");
  process.exit(0);
}

if (!existsSync(MANIFEST)) {
  console.log(
    "test-bundle-budget: 0 passed, 0 failed (of 0) [skipped — .next/build-manifest.json not found; run `npm run build`]",
  );
  process.exit(0);
}

// 2026-04-30: skip if .next/ is from `next dev`, not `next build`. Dev
// builds emit `_app-pages-browser_*` chunks under static/chunks/ and a
// static/development/ directory — the chunks include source maps and
// HMR runtime, so they're 5-10× the prod size and would always blow
// the budget. This isn't a regression, just the wrong build mode.
//
// `next dev` artifacts: chunks named `_app-pages-browser_*`, plus a
// `static/development/` directory.
// `next build` artifacts: chunks named `XXXX-<hash>.js` and a
// `static/<buildId>/` directory matching `.next/BUILD_ID`.
const DEV_DIR = resolve(NEXT_DIR, "static/development");
if (existsSync(DEV_DIR)) {
  console.log(
    "test-bundle-budget: 0 passed, 0 failed (of 0) [skipped — .next/ is from `next dev`; run `npm run build` for budget validation]",
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Budgets (bytes, uncompressed). Chosen to allow normal growth but
// catch accidental bloat. Update with deliberate intent + a commit
// message explaining why when the budget needs to expand.
// ---------------------------------------------------------------------------

// Per-chunk individual cap. The biggest existing chunk is pako (zlib
// for pdf-lib's FlateDecode) at ~425KB. We allow headroom up to 600KB
// — beyond that something has gone seriously wrong. The pako shim to
// fflate (documented as a future win) would drop this to ~30KB.
const CHUNK_INDIVIDUAL_CAP_BYTES = 600 * 1024;

// Per-page first-load JS budget. With M24 code-splitting, /tool/[id]
// is 3.7 kB and pages average <5 kB. Most pages stay under 20 kB.
// We allow 40 kB headroom for future complexity.
const PAGE_FIRST_LOAD_BUDGET_BYTES = 40 * 1024;

// Shared chunks across the whole app — Next.js framework + main +
// runtime + polyfills + small shared libs. Today this totals ~374 kB
// raw / ~89 kB compressed (the "First Load JS shared by all" line in
// next build's output is the gzipped value). We allow 500 kB raw
// headroom (~120 kB gzipped). Growing past that means a heavy lib
// leaked into the shared bundle and should be pushed to a per-route
// chunk.
const SHARED_CHUNKS_BUDGET_BYTES = 500 * 1024;

// Total chunks dir size — sanity ceiling. Currently ~3.6 MB after
// M24 (one chunk per tool ≈ ~30KB each × ~100 tools, plus shared).
// Cap at 6 MB.
const TOTAL_CHUNKS_BUDGET_BYTES = 6 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Load + analyze
// ---------------------------------------------------------------------------

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

// Per-chunk sizes
const chunkFiles = readdirSync(CHUNKS_DIR).filter((f) => f.endsWith(".js"));
const chunkSizes = new Map();
for (const f of chunkFiles) {
  chunkSizes.set(f, statSync(join(CHUNKS_DIR, f)).size);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// 1. Every individual chunk under the cap.
const oversizedChunks = [];
for (const [name, size] of chunkSizes.entries()) {
  if (size > CHUNK_INDIVIDUAL_CAP_BYTES) {
    oversizedChunks.push({ name, size });
  }
}
assert(
  `every chunk ≤ ${(CHUNK_INDIVIDUAL_CAP_BYTES / 1024).toFixed(0)}KB`,
  oversizedChunks.length === 0,
  oversizedChunks.length === 0
    ? ""
    : `Oversized chunks: ${oversizedChunks
        .map((c) => `${c.name} (${(c.size / 1024).toFixed(1)} KB)`)
        .join(", ")}`,
);

// 2. Shared chunks (the "rootMainFiles" or "framework" entries) total
//    under budget. Use manifest.rootMainFiles when present (Next 14
//    pages-router) or fall back to /_next/static/chunks/main-*.js +
//    framework-*.js + webpack-*.js.
const sharedFiles = chunkFiles.filter(
  (f) =>
    f.startsWith("framework-") ||
    f.startsWith("main-") ||
    f.startsWith("main-app-") ||
    f.startsWith("webpack-") ||
    f.startsWith("polyfills-"),
);
const sharedSize = sharedFiles.reduce(
  (sum, f) => sum + (chunkSizes.get(f) ?? 0),
  0,
);
assert(
  `shared framework chunks total ≤ ${(SHARED_CHUNKS_BUDGET_BYTES / 1024).toFixed(0)}KB`,
  sharedSize <= SHARED_CHUNKS_BUDGET_BYTES,
  `shared framework total: ${(sharedSize / 1024).toFixed(1)} KB across ${sharedFiles.length} files (${sharedFiles.join(", ")})`,
);

// 3. Total chunks dir under sanity ceiling.
let totalSize = 0;
for (const size of chunkSizes.values()) totalSize += size;
assert(
  `total chunks dir ≤ ${(TOTAL_CHUNKS_BUDGET_BYTES / 1024 / 1024).toFixed(1)}MB`,
  totalSize <= TOTAL_CHUNKS_BUDGET_BYTES,
  `total: ${(totalSize / 1024 / 1024).toFixed(2)} MB across ${chunkFiles.length} chunks`,
);

// 4. Per-page first-load JS — read manifest's per-page entries.
//    `manifest.pages` maps "/page-route" → string[] of chunk paths.
const pages = manifest.pages ?? {};
const oversizedPages = [];
for (const [route, chunks] of Object.entries(pages)) {
  if (!Array.isArray(chunks)) continue;
  // Skip "/_app", "/_error" — framework-internal.
  if (route.startsWith("/_")) continue;
  let pageSize = 0;
  for (const chunkPath of chunks) {
    // Strip leading "static/chunks/" if present.
    const file = chunkPath.replace(/^static\/chunks\//, "");
    pageSize += chunkSizes.get(file) ?? 0;
  }
  // Subtract shared chunks (they're counted in the shared budget).
  for (const f of sharedFiles) {
    if (chunks.some((c) => c.endsWith(f))) {
      pageSize -= chunkSizes.get(f) ?? 0;
    }
  }
  if (pageSize > PAGE_FIRST_LOAD_BUDGET_BYTES) {
    oversizedPages.push({ route, size: pageSize });
  }
}
assert(
  `every page's first-load JS ≤ ${(PAGE_FIRST_LOAD_BUDGET_BYTES / 1024).toFixed(0)}KB (excl. shared)`,
  oversizedPages.length === 0,
  oversizedPages.length === 0
    ? ""
    : `Oversized pages: ${oversizedPages
        .map((p) => `${p.route} (${(p.size / 1024).toFixed(1)} KB)`)
        .join(", ")}`,
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const total = pass + fail;
console.log("");
console.log(
  `Build summary: ${chunkFiles.length} chunks, ${(totalSize / 1024 / 1024).toFixed(2)} MB total, ${(sharedSize / 1024).toFixed(0)} KB shared`,
);
if (fail > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) {
    console.log(`  ✗ ${f.label}`);
    if (f.detail) console.log(`      ${f.detail}`);
  }
}
console.log(
  `\ntest-bundle-budget: ${pass} passed, ${fail} failed (of ${total})`,
);
process.exit(fail > 0 ? 1 : 0);
