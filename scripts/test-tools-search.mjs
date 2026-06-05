#!/usr/bin/env node
// Unit tests for lib/client/tools-search.ts (pure fuzzy/highlight helpers).
// Type-strip + execute pattern (cf. test-csv-helper.mjs) — no bundler.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0; const failures = [];
const assert = (c, m) => { if (c) passed++; else { failed++; failures.push(m); console.error(`  ✗ ${m}`); } };

const src = fs.readFileSync(path.join(ROOT, "lib/client/tools-search.ts"), "utf8");
const stripped = src
  .replace(/: string\[\]/g, "").replace(/: readonly string\[\]/g, "")
  .replace(/: string/g, "").replace(/: number/g, "").replace(/: boolean/g, "")
  .replace(/export function/g, "function");
const fns = new Function(`${stripped}\nreturn { normalize, tokenize, editDistanceWithin, tokenMatches, matchesQuery, highlightSegments };`)();
const { editDistanceWithin, tokenMatches, matchesQuery, highlightSegments } = fns;

console.log("editDistanceWithin:");
assert(editDistanceWithin("rotate", "rotate", 1) === true, "identical within 1");
assert(editDistanceWithin("compres", "compress", 1) === true, "compres→compress is dist 1");
assert(editDistanceWithin("cat", "dog", 1) === false, "cat/dog beyond 1");
assert(editDistanceWithin("abcd", "abce", 1) === true, "single substitution");
assert(editDistanceWithin("abcd", "abef", 1) === false, "two substitutions beyond 1");

console.log("tokenMatches:");
assert(tokenMatches("merge", "merge") === true, "exact token");
assert(tokenMatches("comp", "compress") === true, "prefix matches");
assert(tokenMatches("compres", "compress") === true, "1-typo matches (len>=4)");
assert(tokenMatches("rotat", "rotate") === true, "prefix rotat→rotate");
assert(tokenMatches("xyz", "compress") === false, "junk no match");
assert(tokenMatches("ab", "cd") === false, "short non-match no fuzzy");

console.log("matchesQuery:");
assert(matchesQuery("Merge PDFs Combine multiple PDFs Organize", "merge") === true, "substring hit");
assert(matchesQuery("Compress PDF Shrink Optimize", "compres") === true, "typo hit on compress");
assert(matchesQuery("Rotate PDF turn pages", "rotat") === true, "prefix hit on rotate");
assert(matchesQuery("Merge PDFs", "") === true, "empty query matches all");
assert(matchesQuery("Merge PDFs Organize", "zzzz") === false, "no match");
assert(matchesQuery("Summarize PDF Understand", "understand") === true, "category-word in haystack matches");

console.log("highlightSegments:");
const h1 = highlightSegments("Merge PDFs", "merge");
assert(h1.length === 2 && h1[0].hit === true && h1[0].t === "Merge", "highlights leading match, case-insensitive");
assert(h1[1].hit === false && h1[1].t === " PDFs", "tail not highlighted");
const h2 = highlightSegments("Rotate PDF", "");
assert(h2.length === 1 && h2[0].hit === false, "empty query → single non-hit segment");
const h3 = highlightSegments("Split PDF", "zzz");
assert(h3.length === 1 && h3[0].hit === false, "no match → whole string non-hit");
const joined = highlightSegments("PDF to PDF", "pdf").map((s) => s.t).join("");
assert(joined === "PDF to PDF", "segments reconstruct the original text");

console.log("");
if (failed === 0) { console.log(`PASS — ${passed} assertions`); console.log(`${passed} passed, 0 failed`); process.exit(0); }
else { console.error(`FAIL:`); for (const m of failures) console.error(`  ${m}`); console.log(`${passed} passed, ${failed} failed`); process.exit(1); }
