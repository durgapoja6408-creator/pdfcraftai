#!/usr/bin/env node
// Unit tests for lib/client/tools-url.ts (URL <-> filter-state).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0; const failures = [];
const assert = (c, m) => { if (c) passed++; else { failed++; failures.push(m); console.error(`  ✗ ${m}`); } };

const src = fs.readFileSync(path.join(ROOT, "lib/client/tools-url.ts"), "utf8");
const stripped = src
  .replace(/export type ToolsQueryState = \{[^}]*\};/g, "")
  .replace(/: ToolsQueryState/g, "").replace(/: string/g, "")
  .replace(/export function/g, "function");
const { parseToolsQuery, buildToolsQuery } = new Function(`${stripped}\nreturn { parseToolsQuery, buildToolsQuery };`)();

console.log("parseToolsQuery:");
let p = parseToolsQuery("?q=merge&filter=ai&cat=Convert");
assert(p.q === "merge" && p.filter === "ai" && p.cat === "Convert", "parses all three params");
assert(parseToolsQuery("").filter === "all", "empty → filter all");
assert(parseToolsQuery("?filter=bogus").filter === "all", "invalid filter falls back to all");
assert(parseToolsQuery("?q=").q === "", "empty q ok");
assert(parseToolsQuery("?filter=FREE").filter === "free", "filter lowercased");

console.log("buildToolsQuery:");
assert(buildToolsQuery({ q: "merge", filter: "ai", cat: "Convert" }) === "?q=merge&filter=ai&cat=Convert", "builds full query");
assert(buildToolsQuery({ q: "", filter: "all", cat: "" }) === "", "default state → empty string (clean URL)");
assert(buildToolsQuery({ q: "rotate", filter: "all", cat: "" }) === "?q=rotate", "only q when filter=all");
assert(buildToolsQuery({ q: "", filter: "free", cat: "" }) === "?filter=free", "only filter");

console.log("round-trip:");
const st = { q: "compress pdf", filter: "free", cat: "Optimize" };
const rt = parseToolsQuery(buildToolsQuery(st));
assert(rt.q === st.q && rt.filter === st.filter && rt.cat === st.cat, "build→parse round-trips");

console.log("");
if (failed === 0) { console.log(`PASS — ${passed} assertions`); console.log(`${passed} passed, 0 failed`); process.exit(0); }
else { console.error(`FAIL:`); for (const m of failures) console.error(`  ${m}`); console.log(`${passed} passed, ${failed} failed`); process.exit(1); }
