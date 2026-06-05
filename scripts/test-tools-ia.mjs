#!/usr/bin/env node
// /tools information-architecture contract guard (2026-06-05). Pins the
// 2026-06-05 IA rebalance so the catalog taxonomy can't silently regress:
//   • compress-pdf lives in Optimize (was wrongly under Convert)
//   • pdf-a-convert lives in Convert (moved out of the Organize catch-all)
//   • the 16 read-only inspectors/extractors live in the new Inspect group
//   • Organize is now the 7 page-operation tools only
//   • FREE_SECTIONS: 6 sections, correct order/labels, key===group invariant
//   • every FREE_SECTION key has a SECTION_BLURB
//   • Inspect is a registered ToolGroup (type + GROUP_ORDER)
// Static parse — no build needed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0; const failures = [];
const assert = (c, m) => { if (c) passed++; else { failed++; failures.push(m); console.error(`  ✗ ${m}`); } };
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const tools = read("lib/tools.ts");
const sec = read("lib/tool-sections.ts");

// --- parse id -> group from the TOOLS array ---
const groupOf = new Map();
for (const m of tools.matchAll(/\{ id: "([a-z0-9-]+)", name: "[^"]*"[^}]*?group: "([A-Za-z]+)"/g)) {
  groupOf.set(m[1], m[2]);
}
assert(groupOf.size > 100, `parsed tool groups (${groupOf.size})`);

console.log("ToolGroup type + GROUP_ORDER include Inspect:");
assert(/export type ToolGroup =[^;]*"Inspect"/.test(tools), "ToolGroup type includes Inspect");
assert(/GROUP_ORDER[^=]*=\s*\[[^\]]*"Inspect"[^\]]*\]/.test(tools), "GROUP_ORDER includes Inspect");

console.log("marquee re-homes:");
assert(groupOf.get("compress-pdf") === "Optimize", "compress-pdf is in Optimize");
assert(groupOf.get("pdf-a-convert") === "Convert", "pdf-a-convert is in Convert");

console.log("Inspect group = the 16 read-only inspectors/extractors:");
const INSPECT = ["pdf-inspector","pdf-diff","pdf-search","pdf-outline","pdf-forms","pdf-attachments","extract-contacts","extract-dates","extract-attachments","pdf-fonts","pdf-links","pdf-annotations","pdf-javascript","pdf-accessibility","pdf-a-check","pdf-x-check"];
for (const id of INSPECT) assert(groupOf.get(id) === "Inspect", `${id} is in Inspect`);
const inspectCount = [...groupOf.values()].filter((g) => g === "Inspect").length;
assert(inspectCount === 16, `exactly 16 tools in Inspect (got ${inspectCount})`);

console.log("Organize = the 7 page-operation tools only (no inspectors left behind):");
const ORGANIZE = ["page-count","odd-even-pages","merge","split","extract-pages","delete-pages","sort-pages"];
for (const id of ORGANIZE) assert(groupOf.get(id) === "Organize", `${id} is in Organize`);
const organizeCount = [...groupOf.values()].filter((g) => g === "Organize").length;
assert(organizeCount === 7, `exactly 7 tools in Organize (got ${organizeCount})`);

console.log("Optimize = compress + grayscale (2):");
const optimizeCount = [...groupOf.values()].filter((g) => g === "Optimize").length;
assert(optimizeCount === 2, `exactly 2 tools in Optimize (got ${optimizeCount})`);

// --- FREE_SECTIONS parse ---
const freeBlock = (sec.match(/FREE_SECTIONS[^=]*=\s*\[([\s\S]*?)\];/) || [])[1] || "";
const freeRows = [...freeBlock.matchAll(/key: "([^"]+)", label: "([^"]+)", group: "([^"]+)"/g)].map((m) => ({ key: m[1], label: m[2], group: m[3] }));
console.log("FREE_SECTIONS shape:");
assert(freeRows.length === 6, `6 free sections (got ${freeRows.length})`);
const expectOrder = [
  ["Organize", "Organize & pages"],
  ["Convert", "Convert"],
  ["Optimize", "Compress & optimize"],
  ["Edit", "Edit & annotate"],
  ["Inspect", "Inspect & audit"],
  ["Security", "Security & redaction"],
];
expectOrder.forEach(([key, label], i) => {
  assert(freeRows[i] && freeRows[i].key === key, `free section ${i} key=${key}`);
  assert(freeRows[i] && freeRows[i].label === label, `free section ${i} label="${label}"`);
});
console.log("key===group invariant (buildSections routes free tools by group):");
for (const r of freeRows) assert(r.key === r.group, `section "${r.label}" key===group (${r.key})`);

console.log("every FREE_SECTION key has a SECTION_BLURB:");
const blurbBlock = (sec.match(/SECTION_BLURBS[^=]*=\s*\{([\s\S]*?)\n\};/) || [])[1] || "";
for (const r of freeRows) assert(new RegExp(`(^|\\n)\\s*${r.key}: "`).test(blurbBlock), `blurb present for "${r.key}"`);

console.log("");
if (failed === 0) { console.log(`PASS — ${passed} assertions`); console.log(`${passed} passed, 0 failed`); process.exit(0); }
else { console.error("FAIL:"); for (const m of failures) console.error(`  ${m}`); console.log(`${passed} passed, ${failed} failed`); process.exit(1); }
