#!/usr/bin/env node
/**
 * 2026-05-08 — /app/files/[id]/preview kind enum parity guard.
 *
 * Background: the preview page's `KIND_LABELS` map drives the eyebrow
 * and the kind-specific detail lines in the header. Until commit
 * (this one) the page used a 4-way ternary chain
 * (summary/translation/comparison/OCR) that silently mislabeled the
 * 5 Phase-5.6 kinds (rewrite/table/redaction/generation/signing) as
 * "AI · OCR" — the trailing `:` branch in the chain swallowed every
 * non-original kind.
 *
 * This guard exists to catch the same class of regression: schema
 * gains a new kind, contributor forgets to extend the page's label
 * map, and the eyebrow renders `undefined` (or worse, the next
 * contributor "fixes" the undefined by reverting to a fallback
 * branch and we're back to mislabeling).
 *
 * What it asserts:
 *   - KIND_LABELS exists with the canonical Record<typeof row.kind, string> shape
 *   - Every member of the schema enum has an entry in KIND_LABELS
 *   - No KIND_LABELS entries are dead code (i.e. no entries the schema doesn't declare)
 *   - The old 4-way ternary chain is gone (regression check)
 *   - Generation is special-cased before the sourceName branch
 *
 * Pure static parse. Sub-second. Output line conforms to the
 * aggregator regex `${name}: ${pass} passed, ${fail} failed`.
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

const PAGE_PATH = path.join(ROOT, "app/app/files/[id]/preview/page.tsx");
const SCHEMA_PATH = path.join(ROOT, "db/schema/app.ts");

assert(fs.existsSync(PAGE_PATH), `Page missing at ${PAGE_PATH}`);
assert(fs.existsSync(SCHEMA_PATH), `Schema missing at ${SCHEMA_PATH}`);

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  console.log(`preview-page-kind-parity: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

const PAGE_SRC = fs.readFileSync(PAGE_PATH, "utf8");
const SCHEMA_SRC = fs.readFileSync(SCHEMA_PATH, "utf8");

// ---------------------------------------------------------------------
// Section A — KIND_LABELS map exists with canonical shape.
// ---------------------------------------------------------------------

assert(
  /const\s+KIND_LABELS\s*:\s*Record<\s*typeof\s+row\.kind\s*,\s*string\s*>\s*=/.test(
    PAGE_SRC,
  ),
  "KIND_LABELS map not found with canonical signature " +
    "`const KIND_LABELS: Record<typeof row.kind, string> = {...}`. " +
    "The Record<typeof row.kind, ...> form is what makes TypeScript " +
    "fail-closed on a missing kind — without that exact constraint, a " +
    "future kind silently renders `undefined` at runtime.",
);

// Extract the body of the KIND_LABELS object literal so we can match
// every key against the schema enum.
const labelsBlockMatch = PAGE_SRC.match(
  /const\s+KIND_LABELS\s*:\s*Record<[^>]+>\s*=\s*\{([\s\S]*?)\};/,
);
assert(
  labelsBlockMatch,
  "Could not extract the KIND_LABELS object body. The braces must " +
    "balance and the literal must terminate with `};` — refactoring " +
    "to `as const` or computed keys breaks this guard.",
);

const labelsBody = labelsBlockMatch ? labelsBlockMatch[1] : "";
// Each entry is `kind: "Label",` — pull every bare key. The keys in
// this map are unquoted (TS literal-typed Record keys), so we match
// `^\s*<word>\s*:`.
const pageKinds = (labelsBody.match(/^\s*([a-z]+)\s*:/gm) || [])
  .map((s) => s.trim().replace(/\s*:$/, ""))
  .sort();

// ---------------------------------------------------------------------
// Section B — schema enum extraction.
// ---------------------------------------------------------------------

const aiOutputsBlock = SCHEMA_SRC.match(
  /export\s+const\s+aiOutputs\s*=\s*mysqlTable\([\s\S]*?\)\s*;/,
);
assert(
  aiOutputsBlock,
  "Could not locate `export const aiOutputs = mysqlTable(...)` block in schema. " +
    "Update this guard if the export was renamed.",
);

const kindCall = aiOutputsBlock
  ? aiOutputsBlock[0].match(/mysqlEnum\(\s*"kind"\s*,\s*\[([\s\S]*?)\]\s*\)/)
  : null;
assert(
  kindCall,
  "Could not find `mysqlEnum('kind', [...])` for ai_outputs.kind in schema.",
);

// Strip line/block comments before pulling literals — the enum has
// inline `// Phase 5.6` comments interleaved.
const kindBody = kindCall ? kindCall[1].replace(/\/\/[^\n]*\n/g, "\n") : "";
const schemaKinds = kindBody
  .match(/"([^"]+)"/g)
  ? kindBody.match(/"([^"]+)"/g).map((s) => s.slice(1, -1)).sort()
  : [];

// ---------------------------------------------------------------------
// Section C — kind enum parity.
// ---------------------------------------------------------------------

assert(
  schemaKinds.length > 0 && pageKinds.length > 0,
  `Schema kinds: [${schemaKinds.join(", ")}], page kinds: [${pageKinds.join(", ")}]. ` +
    "Both must be non-empty.",
);

assert(
  schemaKinds.join(",") === pageKinds.join(","),
  `Kind enum drift between db/schema/app.ts and the preview page. ` +
    `Schema has [${schemaKinds.join(", ")}] but KIND_LABELS has [${pageKinds.join(", ")}]. ` +
    "Add the missing kind to the page's KIND_LABELS map (with a human " +
    "label) — a row with a kind not in KIND_LABELS renders the eyebrow " +
    "as `undefined`. This is the exact bug the original 4-way ternary " +
    "had — don't let it back in.",
);

// ---------------------------------------------------------------------
// Section D — old ternary chain is gone (regression check).
// ---------------------------------------------------------------------
//
// Catches the regression where someone "simplifies" KIND_LABELS back
// to the old chain and reintroduces the silent mislabeling. The old
// shape was: `kind === "summary" ? "..." : kind === "translation" ?
// "..." : kind === "comparison" ? "..." : "OCR"` — assigning an
// "OCR" trailing fallback. We assert this exact pattern is absent.

assert(
  !/kind\s*===\s*"summary"\s*\?\s*"Summary"\s*:\s*kind\s*===\s*"translation"/.test(
    PAGE_SRC,
  ),
  "Detected the regressed 4-way ternary chain " +
    "`kind === 'summary' ? 'Summary' : kind === 'translation' ? ...`. " +
    "This chain has a trailing `:` fallback that silently mislabels " +
    "every kind not explicitly named — the exact bug Tier 4 #11+ fixed. " +
    "Use the KIND_LABELS Record map instead so missing kinds fail at compile time.",
);

// ---------------------------------------------------------------------
// Section E — generation kind is special-cased before sourceName branch.
// ---------------------------------------------------------------------
//
// Generation is the only kind whose `meta.sourceName` is the literal
// string "prompt" rather than a filename. If the JSX falls through to
// the generic `meta.sourceName ? <From X>` branch, the user sees
// "From prompt" — awkward and misleading. The fix branches on
// `kind === "generation"` BEFORE the sourceName check, rendering a
// generation-specific header (title / docType / tone / pageCount).

assert(
  /\)\s*:\s*kind\s*===\s*"generation"\s*\?\s*\(/.test(PAGE_SRC),
  "Generation kind isn't special-cased before the sourceName branch. " +
    "Expected `) : kind === \"generation\" ? (...)` between the comparison " +
    "branch and the sourceName branch in the meta-string ternary chain. " +
    "Without this, generation artifacts render the awkward 'From prompt' string.",
);

// ---------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
}

console.log(`preview-page-kind-parity: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
