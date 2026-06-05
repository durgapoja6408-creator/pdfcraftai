#!/usr/bin/env node
// Guard: NEW_TOOL_IDS, POPULAR_TOOL_IDS, and SEARCH_SYNONYMS values must all
// reference real catalog tool ids (static parse — catches typos/stale ids).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0; const failures = [];
const assert = (c, m) => { if (c) passed++; else { failed++; failures.push(m); console.error(`  ✗ ${m}`); } };

const tools = fs.readFileSync(path.join(ROOT, "lib/tools.ts"), "utf8");
const ids = new Set([...tools.matchAll(/\bid:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]));
assert(ids.size > 100, `catalog id set parsed (${ids.size} ids)`);

const sec = fs.readFileSync(path.join(ROOT, "lib/tool-sections.ts"), "utf8");
const block = (name) => {
  // Anchor on the `=` so a `: readonly string[]` type annotation's brackets
  // aren't mistaken for the array literal; tolerate an optional `new Set(`.
  const m = sec.match(new RegExp(name + "[^=]*?=\\s*(?:new Set\\()?\\[([\\s\\S]*?)\\]"));
  return m ? [...m[1].matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1]) : [];
};
const newIds = block("NEW_TOOL_IDS");
const popIds = block("POPULAR_TOOL_IDS");
assert(newIds.length >= 3, `NEW_TOOL_IDS parsed (${newIds.length})`);
assert(popIds.length >= 6, `POPULAR_TOOL_IDS parsed (${popIds.length})`);

console.log("NEW_TOOL_IDS ⊆ catalog:");
for (const id of newIds) assert(ids.has(id), `NEW id "${id}" exists in catalog`);
console.log("POPULAR_TOOL_IDS ⊆ catalog:");
for (const id of popIds) assert(ids.has(id), `POPULAR id "${id}" exists in catalog`);

console.log("SEARCH_SYNONYMS values ⊆ catalog:");
const synBlock = sec.match(/SEARCH_SYNONYMS[\s\S]*?=\s*\{([\s\S]*?)\n\};/);
const synIds = synBlock ? [...synBlock[1].matchAll(/\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1])) : [];
assert(synIds.length > 10, `synonym target ids parsed (${synIds.length})`);
for (const id of new Set(synIds)) assert(ids.has(id), `synonym target "${id}" exists in catalog`);

console.log("");
if (failed === 0) { console.log(`PASS — ${passed} assertions`); console.log(`${passed} passed, 0 failed`); process.exit(0); }
else { console.error(`FAIL:`); for (const m of failures) console.error(`  ${m}`); console.log(`${passed} passed, ${failed} failed`); process.exit(1); }
