#!/usr/bin/env node
/**
 * 2026-04-30 security guard: every `<a target="_blank">` (or
 * `<Link target="_blank">`) MUST have `rel="noopener noreferrer"`.
 *
 * Why: without `rel="noopener"`, the linked page can use
 * `window.opener` to redirect or modify the original page —
 * a classic reverse-tabnabbing attack that turns a benign
 * "open in new tab" affordance into a phishing vector.
 *
 * Modern browsers default to `noopener` for `target="_blank"` since
 * 2021, so this is more of a belt-and-suspenders + signal-correctness
 * check than a hot vulnerability. But it's also a Lighthouse +
 * Web.dev best-practice violation, and screenshots / static security
 * audits will flag the pattern even when browsers defend against it.
 *
 * `rel="noreferrer"` adds a second layer: the linked page doesn't
 * see Referer header from the original page (privacy hygiene).
 *
 * Audit scope:
 *   - All .tsx files under app/ and components/.
 *   - Both `<a>` and `<Link>` JSX elements.
 *   - Multi-line JSX attributes (the JSX block can span 5+ lines).
 *
 * Out of scope:
 *   - Markdown <a> tags (we don't ship raw markdown to browsers).
 *   - dangerouslySetInnerHTML strings (would need an HTML parser).
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

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name.startsWith(".")
      ) {
        continue;
      }
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const APP_DIR = path.join(ROOT, "app");
const COMP_DIR = path.join(ROOT, "components");
const tsxFiles = [
  ...(fs.existsSync(APP_DIR) ? walk(APP_DIR) : []),
  ...(fs.existsSync(COMP_DIR) ? walk(COMP_DIR) : []),
];

assert(
  tsxFiles.length >= 50,
  `walked ${tsxFiles.length} .tsx files (expected >= 50)`,
);

// ---------------------------------------------------------------------------
// Section A — find every JSX block containing target="_blank" and
// verify the same block has rel="noopener" (and ideally noreferrer).
//
// JSX attributes can span multiple lines; we use a heuristic: walk
// each line that contains target="_blank", capture a 12-line window
// around it (6 before + 6 after), and check whether `rel=` with
// `noopener` appears in that window.
// ---------------------------------------------------------------------------

const TARGET_BLANK_RE = /target=["']_blank["']/;
const REL_NOOPENER_RE = /rel=["'][^"']*\bnoopener\b[^"']*["']/;
const REL_NOREFERRER_RE = /rel=["'][^"']*\bnoreferrer\b[^"']*["']/;

const violations = [];

for (const file of tsxFiles) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (!TARGET_BLANK_RE.test(lines[i])) continue;

    // Window: 6 lines before through 6 lines after (inclusive). Most
    // JSX blocks fit easily.
    const start = Math.max(0, i - 6);
    const end = Math.min(lines.length, i + 7);
    const win = lines.slice(start, end).join("\n");

    if (!REL_NOOPENER_RE.test(win)) {
      violations.push({
        file: path.relative(ROOT, file),
        line: i + 1,
        kind: "noopener",
        excerpt: lines[i].trim().slice(0, 200),
      });
    }
    // noreferrer is best-practice but not a security requirement.
    // Surface it as a separate finding so noopener-only links can
    // still be triaged. Many "share to twitter" or partner-link
    // patterns intentionally allow Referer.
    if (!REL_NOREFERRER_RE.test(win)) {
      violations.push({
        file: path.relative(ROOT, file),
        line: i + 1,
        kind: "noreferrer (advisory)",
        excerpt: lines[i].trim().slice(0, 200),
      });
    }
  }
}

const noopenerViolations = violations.filter((v) => v.kind === "noopener");
const noreferrerViolations = violations.filter(
  (v) => v.kind === "noreferrer (advisory)",
);

assert(
  noopenerViolations.length === 0,
  `Found ${noopenerViolations.length} <a target="_blank"> WITHOUT rel="noopener". Reverse-tabnabbing risk + Lighthouse violation.\n\nFix: add rel="noopener noreferrer" to the same JSX element.\n\nLocations:\n` +
    noopenerViolations
      .slice(0, 20)
      .map((v) => `  ${v.file}:${v.line}\n    ${v.excerpt}`)
      .join("\n") +
    (noopenerViolations.length > 20
      ? `\n  ... and ${noopenerViolations.length - 20} more`
      : ""),
);

// noreferrer is advisory — surface as warning but don't fail the
// suite. Print to stdout so it's visible in the test log.
if (noreferrerViolations.length > 0) {
  console.warn(
    `[advisory] ${noreferrerViolations.length} target="_blank" link(s) missing rel="noreferrer" (privacy best-practice — Referer header leaks origin to the linked page). Triaged separately because some patterns intentionally allow Referer (e.g. "share to twitter" buttons).`,
  );
}

// ---------------------------------------------------------------------------
// Section B — sanity self-tests on the regex.
// ---------------------------------------------------------------------------

const POS_BLANK = '<a href="https://x.com" target="_blank">';
assert(
  TARGET_BLANK_RE.test(POS_BLANK),
  "regex catches the canonical target=\"_blank\" shape",
);
const POS_REL = 'rel="noopener noreferrer"';
assert(
  REL_NOOPENER_RE.test(POS_REL),
  "regex catches rel=\"noopener noreferrer\"",
);
assert(
  REL_NOREFERRER_RE.test(POS_REL),
  "regex catches noreferrer in the same string",
);
const NEG_REL = 'rel="external"';
assert(
  !REL_NOOPENER_RE.test(NEG_REL),
  "regex correctly fails on rel=\"external\" (no noopener)",
);
const POS_SINGLE_NOOPENER = 'rel="noopener"';
assert(
  REL_NOOPENER_RE.test(POS_SINGLE_NOOPENER),
  "regex catches rel=\"noopener\" alone (without noreferrer)",
);

// ---------------------------------------------------------------------------
// Aggregator-friendly summary.
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(
  `target-blank-rel: ${passed} passed, ${failed} failed (of ${total})`,
);
if (failed > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
