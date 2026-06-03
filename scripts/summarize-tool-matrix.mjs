// scripts/summarize-tool-matrix.mjs
// Parse a Playwright JSON report (results.json) → per-tool PASS/GAP matrix.
// Writes a markdown summary to $GITHUB_STEP_SUMMARY (if set) + stdout.
import { readFileSync, appendFileSync } from "node:fs";

const file = process.argv[2] || "results.json";
let data;
try { data = JSON.parse(readFileSync(file, "utf8")); }
catch (e) { console.error("Cannot read", file, e.message); process.exit(0); }

const specs = [];
function walk(suite, trail) {
  const t = [...trail, suite.title].filter(Boolean);
  for (const sp of suite.specs || []) {
    const test = (sp.tests || [])[0] || {};
    const results = test.results || [];
    const last = results[results.length - 1] || {};
    const status = last.status || (sp.ok ? "passed" : "failed");
    const anns = [...(test.annotations || []), ...(last.annotations || [])];
    const verdict = anns.find((a) => a.type === "verdict")?.description || "";
    const credit = anns.find((a) => a.type === "ai-402" || a.type === "ai-out-of-credits") ? "402 out-of-credits" : "";
    const errMsg = (last.error?.message || (last.errors || [])[0]?.message || "").replace(/\s+/g, " ").slice(0, 160);
    specs.push({ title: sp.title, status, verdict, credit, errMsg });
  }
  for (const s of suite.suites || []) walk(s, t);
}
for (const s of data.suites || []) walk(s, []);

const cat = (s) => s.title.startsWith("free:") ? "free" : s.title.startsWith("ai:") ? "ai" : "infra";
const groups = { free: [], ai: [], infra: [] };
for (const s of specs) groups[cat(s)].push(s);

const ok = (s) => s.status === "passed" || (s.status === "skipped" && s.credit);
let out = "# Per-tool execution matrix\n\n";
for (const [g, label] of [["free", "Free tools"], ["ai", "AI tools"], ["infra", "Backend / Security / SEO"]]) {
  const rows = groups[g];
  if (!rows.length) continue;
  const pass = rows.filter(ok).length;
  const skip = rows.filter((r) => r.status === "skipped" && !r.credit).length;
  const fail = rows.length - pass - skip;
  out += `## ${label} — ${pass}/${rows.length} pass${skip ? `, ${skip} skipped` : ""}${fail ? `, **${fail} GAP**` : ""}\n\n`;
  const bad = rows.filter((r) => !ok(r) && !(r.status === "skipped" && !r.credit));
  if (bad.length) {
    out += "| Tool / check | Status | Reason |\n|---|---|---|\n";
    for (const r of bad) out += `| ${r.title} | ${r.status} | ${(r.errMsg || r.verdict || "").replace(/\|/g, "/")} |\n`;
    out += "\n";
  } else {
    out += "_All green._\n\n";
  }
}
const totalPass = specs.filter(ok).length;
const totalFail = specs.filter((s) => !ok(s) && !(s.status === "skipped" && !s.credit)).length;
out = `**Overall: ${totalPass}/${specs.length} pass, ${totalFail} gap(s)**\n\n` + out;

console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
