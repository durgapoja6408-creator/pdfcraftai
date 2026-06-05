#!/usr/bin/env node
// /app/dashboard improvement contract guard (2026-06-05). Pins the P0/P1/P2
// rebuild so it can't silently regress:
//   • Quick start launcher (POPULAR tools -> /tool/<id>) + "Browse all" -> /tools
//   • Only REAL metrics are stat cards (balance/7d/30d); NO fake value="→"
//   • Credit-balance card has a Top up CTA (-> /pricing) + low-balance state
//   • Receipts/Refer demoted to a Manage row (still links /app/receipts etc.)
//   • Recent activity = recent AI outputs (clickable -> AI History) with a
//     clickable recent-files fallback (no dead-end rows)
// Static parse — no build needed. Complements test-user-dashboard-v2.mjs
// (which guards the PII/cost wall); this guard owns the UX structure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0; const failures = [];
const assert = (c, m) => { if (c) passed++; else { failed++; failures.push(m); console.error(`  ✗ ${m}`); } };
const src = fs.readFileSync(path.join(ROOT, "app/app/dashboard/page.tsx"), "utf8");

console.log("imports for the new surfaces:");
assert(/POPULAR_TOOL_IDS[^;]*from\s+["']@\/lib\/tool-sections["']/.test(src), "imports POPULAR_TOOL_IDS");
assert(/toolById[^;]*from\s+["']@\/lib\/tools["']/.test(src), "imports toolById");
assert(/\bformatRelative\b/.test(src) && /from\s+["']@\/lib\/user\/format["']/.test(src), "imports formatRelative");
assert(/\bsql\b[^;]*from\s+["']drizzle-orm["']/.test(src), "imports sql (for the AI-outputs query)");

console.log("Quick start launcher (P0 — primary action):");
assert(/Quick start/.test(src), "renders a 'Quick start' heading");
assert(/QUICK_TOOLS\s*=\s*POPULAR_TOOL_IDS\.map/.test(src), "QUICK_TOOLS derived from POPULAR_TOOL_IDS");
assert(/href=\{`\/tool\/\$\{t\.id\}`\}/.test(src), "quick-start cards link to /tool/<id>");
assert(/href="\/tools"/.test(src), "has a 'Browse all tools' link to /tools");

console.log("Stat cards = real metrics only, no fake arrow values (P1):");
assert(!/value="→"/.test(src), 'no fake value="→" stat cards remain');
assert((src.match(/<StatCard/g) || []).length === 3, "exactly 3 StatCards (balance / 7d / 30d)");
assert(/label="Credit balance"/.test(src) && /label="Last 7 days"/.test(src) && /label="Last 30 days"/.test(src), "the 3 cards are balance/7d/30d");

console.log("Top up CTA + low-balance state (P1):");
assert(/const LOW_BALANCE\s*=/.test(src), "LOW_BALANCE threshold defined");
assert(/lowBalance\s*=\s*balance\s*<=\s*LOW_BALANCE/.test(src), "lowBalance computed from threshold");
assert(/text:\s*"Top up",\s*accent:\s*true/.test(src), "balance card has an accent 'Top up' CTA");
assert(/href:\s*"\/pricing"/.test(src), "Top up points at /pricing");
assert(/ctas:\s*\{[^}]*href[^}]*text[^}]*accent\?/.test(src) || /ctas\?:|ctas:/.test(src), "StatCard takes a ctas array");

console.log("Manage row (Receipts/Refer demoted) — guard-required links kept:");
assert(/href="\/app\/receipts"/.test(src), "Manage row links /app/receipts");
assert(/href="\/app\/refer"/.test(src), "Manage row links /app/refer");
assert(/href="\/app\/billing"/.test(src), "Manage row links /app/billing");
assert(/function ManageLink/.test(src), "ManageLink component exists");

console.log("Recent activity = AI outputs, clickable, with files fallback (P0):");
assert(/schema\.aiOutputs/.test(src), "queries schema.aiOutputs");
assert(/innerJoin\(schema\.files,\s*eq\(schema\.aiOutputs\.fileId,\s*schema\.files\.id\)\)/.test(src), "joins ai_outputs -> files");
assert(/where\(eq\(schema\.files\.userId,\s*userId\)\)/.test(src), "AI-outputs query scoped to files.userId (tenancy)");
assert(/recentRuns\.length\s*>\s*0\s*\?/.test(src), "renders recent AI runs when present");
assert(/:\s*recent\.length\s*>\s*0\s*\?/.test(src), "falls back to recent files");
assert(/href="\/app\/ai-history"/.test(src), "AI run rows link to /app/ai-history");
assert(/KIND_LABEL/.test(src) && /function kindLabel/.test(src), "kind -> friendly label map present");
assert(/formatRelative\(/.test(src), "rows show relative time");

console.log("");
if (failed === 0) { console.log(`PASS — ${passed} assertions`); console.log(`${passed} passed, 0 failed`); process.exit(0); }
else { console.error("FAIL:"); for (const m of failures) console.error(`  ${m}`); console.log(`${passed} passed, ${failed} failed`); process.exit(1); }
