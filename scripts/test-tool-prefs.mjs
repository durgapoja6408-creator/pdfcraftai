#!/usr/bin/env node
// Unit tests for lib/client/tool-prefs.ts pure helpers (addToFront, toggleId).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0; const failures = [];
const assert = (c, m) => { if (c) passed++; else { failed++; failures.push(m); console.error(`  ✗ ${m}`); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const src = fs.readFileSync(path.join(ROOT, "lib/client/tool-prefs.ts"), "utf8");
const stripped = src
  .replace(/: Record<string, unknown>/g, "").replace(/: readonly string\[\]/g, "")
  .replace(/: unknown/g, "").replace(/: string/g, "").replace(/: number/g, "")
  .replace(/export function/g, "function").replace(/export const/g, "const");
const { addToFront, toggleId, RECENT_CAP } = new Function(`${stripped}\nreturn { addToFront, toggleId, RECENT_CAP };`)();

console.log("addToFront:");
assert(eq(addToFront([], "a", 8), ["a"]), "into empty");
assert(eq(addToFront(["b", "c"], "a", 8), ["a", "b", "c"]), "prepends new");
assert(eq(addToFront(["a", "b", "c"], "c", 8), ["c", "a", "b"]), "moves existing to front (dedupe)");
assert(eq(addToFront(["a", "b", "c"], "d", 3), ["d", "a", "b"]), "caps length, drops oldest");
assert(addToFront(["a", "b", "c", "d", "e", "f", "g", "h", "i"], "x", RECENT_CAP).length === RECENT_CAP, "respects RECENT_CAP");

console.log("toggleId:");
assert(eq(toggleId([], "a"), ["a"]), "adds when absent");
assert(eq(toggleId(["a"], "a"), []), "removes when present");
assert(eq(toggleId(["a", "b"], "c"), ["c", "a", "b"]), "adds to front when absent");
assert(eq(toggleId(["a", "b", "c"], "b"), ["a", "c"]), "removes middle, preserves order");

console.log("");
if (failed === 0) { console.log(`PASS — ${passed} assertions`); console.log(`${passed} passed, 0 failed`); process.exit(0); }
else { console.error(`FAIL:`); for (const m of failures) console.error(`  ${m}`); console.log(`${passed} passed, ${failed} failed`); process.exit(1); }
