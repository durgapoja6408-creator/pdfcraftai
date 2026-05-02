#!/usr/bin/env node
/**
 * 2026-05-02 Tier A2: download-helper adoption guard.
 *
 * After today's Tier A1 sweep migrated 30 tools from hand-rolled
 * Blob → createObjectURL → click → revoke to the canonical
 * downloadBytes() helper in lib/client/download.ts, this guard
 * locks the migration: any new tool that hand-rolls the dance
 * fails at npm test.
 *
 * Why it matters:
 *  - The hand-rolled dance is 14 lines that was duplicated across
 *    ~30 files before today. Each copy was a separate maintenance
 *    point for: filename collision suffix (suffixedFilename), MIME
 *    type accuracy, URL revocation timing, anchor click semantics.
 *  - 14 of those copies skipped suffixedFilename → silent overwrite
 *    on repeat downloads. Migration to downloadBytes auto-fixes
 *    this; guard prevents regression.
 *  - Future bug-fix to download mechanics (e.g. iOS Safari blob:
 *    URL quirks, Content-Disposition workarounds) lands in ONE
 *    place when the helper is the only consumer.
 *
 * Approach:
 *  1. Walk every components/tools and lib/client TS file looking
 *     for the canonical hand-rolled signature.
 *  2. The canonical pattern: `createElement("a")` followed by
 *     `.download = ` (the assignment that triggers the browser
 *     download flow).
 *  3. Allowlist for known legitimate exceptions (currently empty —
 *     downloadBytes handles every shape we have).
 *  4. Self-test the parser against synthetic strings.
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

// ---------------------------------------------------------------------------
// Section A — discover candidate files.
// ---------------------------------------------------------------------------

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and .next (huge, irrelevant).
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      out.push(...walk(full));
    } else if (entry.isFile()) {
      if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
  }
  return out;
}

const FILES = [
  ...walk(path.join(ROOT, "components", "tools")),
  ...walk(path.join(ROOT, "lib", "client")),
];

// ---------------------------------------------------------------------------
// Section B — allowlist for legitimate exceptions.
//
// lib/client/download.ts itself IS the helper that does the dance —
// it's the canonical implementation, so it's exempt. Same for
// lib/client/csv.ts which has its own downloadCsvString helper that
// wraps the dance for opaque-CSV consumers.
// ---------------------------------------------------------------------------

const ALLOWLIST_FILES = new Set([
  // Canonical helper — the dance lives HERE so consumers don't repeat it.
  "lib/client/download.ts",
  // Sister helper for already-formatted CSV strings (TableExtractTool's
  // LLM-output case where re-escaping through buildCsv would corrupt).
  "lib/client/csv.ts",
]);

// ---------------------------------------------------------------------------
// Section C — scan each file for hand-rolled download patterns.
//
// Pattern signatures we want to catch:
//   1. `createElement("a")` followed within a few lines by `.download = `
//   2. `URL.createObjectURL` paired with manual `.click()` + revoke
//
// Pattern (1) is the most reliable signal — anchor-with-download is
// unambiguous about intent. Pattern (2) without (1) is rare and
// usually legitimate (e.g. blob preview without download).
// ---------------------------------------------------------------------------

const ANCHOR_DOWNLOAD_RE = /createElement\(\s*"a"\s*\)/;
const DOWNLOAD_ASSIGN_RE = /\.download\s*=/;

const violations = [];
for (const filePath of FILES) {
  const relPath = path.relative(ROOT, filePath);
  if (ALLOWLIST_FILES.has(relPath)) continue;
  const src = fs.readFileSync(filePath, "utf8");
  if (!ANCHOR_DOWNLOAD_RE.test(src)) continue;
  // Found anchor.createElement("a"). Confirm it's used for download
  // (not for, say, opening a tab or rendering a fake link).
  if (!DOWNLOAD_ASSIGN_RE.test(src)) continue;
  // Hand-rolled download dance found.
  violations.push(relPath);
}

assert(
  violations.length === 0,
  `Found ${violations.length} file(s) with hand-rolled download dance.\n` +
    `Each one should use lib/client/download.ts:downloadBytes() instead — it handles Blob+download+revoke+filename-collision-suffix in one call.\n` +
    `Migration recipe (matches today's Tier A1 sweep):\n` +
    `  1. Replace the entire createObjectURL/createElement/click/revoke block with: downloadBytes(content, filename[, mimeType])\n` +
    `  2. Remove the 'suffixedFilename' import if unused (downloadBytes calls it internally)\n` +
    `  3. Add 'import { downloadBytes } from "@/lib/client/download";'\n\n` +
    `Files:\n` +
    violations.map((v) => `  - ${v}`).join("\n"),
);

// ---------------------------------------------------------------------------
// Section D — sanity: floor on downloadBytes adoption. Should be
// ~38 consumers after today's Tier A1 sweep. If this drops, someone
// regressed a tool back to hand-rolled OR removed download
// functionality entirely.
// ---------------------------------------------------------------------------

let adoptionCount = 0;
for (const filePath of FILES) {
  const relPath = path.relative(ROOT, filePath);
  if (relPath === "lib/client/download.ts") continue; // helper itself
  const src = fs.readFileSync(filePath, "utf8");
  if (/\bdownloadBytes\s*\(/.test(src)) adoptionCount++;
}

assert(
  adoptionCount >= 30,
  `Expected >= 30 downloadBytes consumers; found ${adoptionCount}. Did someone migrate a tool back to hand-rolled?`,
);

// ---------------------------------------------------------------------------
// Section E — self-test the regexes so future refactors fail loud.
// ---------------------------------------------------------------------------

const POS_HAND_ROLLED = `
const a = document.createElement("a");
a.href = url;
a.download = "report.pdf";
`;
assert(
  ANCHOR_DOWNLOAD_RE.test(POS_HAND_ROLLED) &&
    DOWNLOAD_ASSIGN_RE.test(POS_HAND_ROLLED),
  "self-test: regexes catch the canonical hand-rolled pattern",
);

const NEG_NON_DOWNLOAD = `
const a = document.createElement("a");
a.href = "/about";
a.click();
`;
assert(
  ANCHOR_DOWNLOAD_RE.test(NEG_NON_DOWNLOAD) &&
    !DOWNLOAD_ASSIGN_RE.test(NEG_NON_DOWNLOAD),
  "self-test: anchor created but no .download assignment doesn't trip the guard",
);

const NEG_DOWNLOADBYTES_CALLER = `
import { downloadBytes } from "@/lib/client/download";
downloadBytes(bytes, "report.pdf");
`;
assert(
  !ANCHOR_DOWNLOAD_RE.test(NEG_DOWNLOADBYTES_CALLER),
  "self-test: downloadBytes consumer doesn't trip the guard",
);

// ---------------------------------------------------------------------------
// Aggregator-friendly summary line.
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(
  `download-helper-adoption: ${passed} passed, ${failed} failed (of ${total})`,
);
if (failed > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
