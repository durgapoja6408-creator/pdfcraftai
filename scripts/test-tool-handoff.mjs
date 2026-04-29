#!/usr/bin/env node
/**
 * M9 (#193, 2026-04-29): unit tests for the tool-handoff infrastructure.
 *
 * Covers the static portions:
 *  - Every TOOL_SUGGESTIONS source key must reference a real tool id
 *  - Every target id in every suggestion array must be a real tool id
 *  - No tool suggests itself (would create a confusing UI loop)
 *  - handoffUrl() shape (`/tool/<id>?handoff=<key>` with proper encoding)
 *
 * Skips runtime portions (registerHandoff / consumeHandoff) — those
 * touch window globals and are exercised end-to-end by the live tools.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  }
}

// ──────────────────────────────────────────────────────────────────
// Load tool registry (lib/tools.ts) by parsing the source. We don't
// import — that would require a TS loader. The shape is stable: each
// tool entry starts with `id: "<value>"`.
// ──────────────────────────────────────────────────────────────────
const toolsSrc = fs.readFileSync(path.join(ROOT, "lib/tools.ts"), "utf8");
const toolIds = new Set(
  Array.from(toolsSrc.matchAll(/\bid:\s*"([^"]+)"/g), (m) => m[1]),
);
console.log(`Loaded ${toolIds.size} tool IDs from lib/tools.ts`);

// ──────────────────────────────────────────────────────────────────
// Load suggestions map by parsing — same approach.
// ──────────────────────────────────────────────────────────────────
const suggestionsSrc = fs.readFileSync(
  path.join(ROOT, "lib/client/tool-suggestions.ts"),
  "utf8",
);

// Parse the inner object literal. We expect lines of the shape:
//   "<key>": ["<a>", "<b>", "<c>"],
// or:
//   <key>: ["<a>"]   (unquoted keys without dashes)
const suggestions = new Map();
const lineRe = /^\s*"?([\w-]+)"?:\s*\[\s*((?:"[^"]+",?\s*)+)\]/gm;
for (const m of suggestionsSrc.matchAll(lineRe)) {
  const key = m[1];
  const arr = Array.from(m[2].matchAll(/"([^"]+)"/g), (mm) => mm[1]);
  suggestions.set(key, arr);
}
console.log(`Loaded ${suggestions.size} suggestion entries`);

// ──────────────────────────────────────────────────────────────────
// Assertions
// ──────────────────────────────────────────────────────────────────
console.log("Suggestion key validity:");
for (const [src, _] of suggestions) {
  assert(toolIds.has(src), `source "${src}" exists in lib/tools.ts`);
}

console.log("");
console.log("Suggestion target validity + no self-reference:");
for (const [src, targets] of suggestions) {
  for (const tgt of targets) {
    assert(toolIds.has(tgt), `target "${tgt}" (from "${src}") exists in lib/tools.ts`);
    assert(tgt !== src, `"${src}" does not suggest itself`);
  }
}

console.log("");
console.log("Suggestion array shape:");
for (const [src, targets] of suggestions) {
  assert(targets.length >= 1 && targets.length <= 4, `"${src}" has 1–4 suggestions (has ${targets.length})`);
  assert(new Set(targets).size === targets.length, `"${src}" suggestions are unique (no duplicates)`);
}

// ──────────────────────────────────────────────────────────────────
// Static parse: handoffUrl shape.
// Expect: `/tool/${toolId}?handoff=${encodeURIComponent(key)}`
// ──────────────────────────────────────────────────────────────────
console.log("");
console.log("handoffUrl shape (lib/client/handoff.ts):");
{
  const handoffSrc = fs.readFileSync(
    path.join(ROOT, "lib/client/handoff.ts"),
    "utf8",
  );
  assert(
    /export function handoffUrl\(/.test(handoffSrc),
    "handoffUrl is exported",
  );
  assert(
    /\/tool\/\$\{toolId\}\?handoff=\$\{encodeURIComponent\(key\)\}/.test(handoffSrc),
    "handoffUrl uses encodeURIComponent on key",
  );
  assert(
    /export function registerHandoff\(/.test(handoffSrc),
    "registerHandoff is exported",
  );
  assert(
    /export function consumeHandoff\(/.test(handoffSrc),
    "consumeHandoff is exported",
  );
}

// ──────────────────────────────────────────────────────────────────
// PageEditorTool wires consumeHandoff on mount.
// ──────────────────────────────────────────────────────────────────
console.log("");
console.log("PageEditorTool consumes handoffs:");
{
  const editorSrc = fs.readFileSync(
    path.join(ROOT, "components/tools/PageEditorTool.tsx"),
    "utf8",
  );
  assert(/consumeHandoff/.test(editorSrc), "PageEditorTool calls consumeHandoff");
  assert(/registerHandoff/.test(editorSrc), "PageEditorTool calls registerHandoff (success-card buttons)");
  assert(
    /handoffUrl\(/.test(editorSrc),
    "PageEditorTool uses handoffUrl() for the success-card link",
  );
  assert(
    /window\.history\.replaceState/.test(editorSrc),
    "PageEditorTool strips ?handoff= from URL after consume (avoids stale param on refresh)",
  );
}

// ──────────────────────────────────────────────────────────────────
// Wrap up
// ──────────────────────────────────────────────────────────────────
console.log("");
if (failed === 0) {
  console.log(`PASS — ${passed} assertions`);
  console.log(`${passed} passed, 0 failed`);
  process.exit(0);
} else {
  console.error(`FAIL — ${failed} assertion(s) failed`);
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
