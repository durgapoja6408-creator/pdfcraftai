#!/usr/bin/env node
/**
 * 2026-04-30 a11y CI guard: prevent the inline accent-color link
 * antipattern from regressing.
 *
 * Background: in this arc we found 18 instances across 13 files of:
 *
 *     <Link/a style={{ color: "var(--accent)", textDecoration: "none" }}>
 *
 * inside body-text contexts (paragraphs, list items, helper text).
 * Brand-accent vs. surrounding muted-body text contrast comes in at
 * ~1.14:1, well below the 3:1 surround-contrast minimum, AND there's
 * no non-color affordance — so axe correctly flags this as a serious
 * `link-in-text-block` WCAG 1.4.1 violation.
 *
 * The fix was `textDecoration: "underline", textUnderlineOffset: 2`.
 * Without a CI guard, any future edit could re-introduce
 * `textDecoration: "none"` (the visual designer's instinct: links
 * inside text "look cleaner" without underlines) and silently regress
 * the a11y fix until the next prod axe run.
 *
 * This guard is intentionally narrow:
 *   - Triggers ONLY on the exact pattern `color: "var(--accent)"` +
 *     `textDecoration: "none"` in the same `style={{ ... }}` block.
 *   - Does NOT flag standalone accent-color links without
 *     `textDecoration: "none"` (those might be in flex layouts,
 *     buttons, etc. where underline is genuinely wrong).
 *   - Does NOT flag non-link accent colors (icons, eyebrow text,
 *     decorative spans).
 *
 * False positives are easy to silence: if a future link genuinely
 * needs the no-underline treatment AND is NOT in a text block, prove
 * it's accessible (good contrast vs. surrounding bg, clear focus
 * affordance, distinct positioning) and add a comment with the
 * rationale immediately before the style block. The regex skips lines
 * within 3 lines of an `// a11y-allowed:` marker comment.
 *
 * Suite name: `inline-link-a11y`. Output line conforms to the
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

// ---------------------------------------------------------------------------
// Walk every .tsx file under app/ and components/ (skip node_modules,
// .next, build artifacts). We don't use globs — keep stdlib-only so
// the harness has zero new deps.
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Standard ignore list. node_modules + .next + dot-dirs.
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
  tsxFiles.length > 0,
  `Walked ${tsxFiles.length} .tsx files (expected > 0; check ROOT path)`,
);

// ---------------------------------------------------------------------------
// The antipattern: a single line containing both
//   color: "var(--accent)"
// AND
//   textDecoration: "none"
// — within the same `style={{ ... }}` block. We don't try to parse JSX
// properly; instead we use a textual regex that catches both
// single-line and multi-line style blocks where the two properties are
// within ~6 lines of each other (typical for spread style props).
// ---------------------------------------------------------------------------

const PATTERN_SINGLE_LINE = /color:\s*["']var\(--accent[^"']*\)["'][^}]*textDecoration:\s*["']none["']/;
const PATTERN_REVERSED =
  /textDecoration:\s*["']none["'][^}]*color:\s*["']var\(--accent[^"']*\)["']/;
// Allow marker can be either a `// a11y-allowed:` line comment (in
// .ts contexts) or a `{/* a11y-allowed: */}` JSX block comment, since
// the antipattern lives in JSX.
const ALLOW_MARKER = /(?:\/\/|\{\/\*)\s*a11y-allowed:/i;

const regressions = [];

for (const file of tsxFiles) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (PATTERN_SINGLE_LINE.test(line) || PATTERN_REVERSED.test(line)) {
      // Check if any of the previous 8 lines has the allow marker.
      // 8 lines is generous enough to allow a multi-line rationale
      // comment plus the JSX scaffolding (`<a href={...}` etc.) that
      // sits between the marker and the style block.
      const start = Math.max(0, i - 8);
      const window = lines.slice(start, i).join("\n");
      if (ALLOW_MARKER.test(window)) continue;
      regressions.push({
        file: path.relative(ROOT, file),
        line: i + 1,
        text: line.trim().slice(0, 200),
      });
    }
  }

  // Also catch the multi-line case: a `style={{` block that spans
  // several lines with both properties inside. We scan style blocks
  // by finding `style={{` and walking forward until the matching
  // `}}` (max 20 lines of lookahead — anything bigger is a different
  // problem).
  const styleOpenRe = /style=\{\{/g;
  let match;
  while ((match = styleOpenRe.exec(text)) !== null) {
    const idx = match.index;
    // Find the matching }} — naïve depth counter on { and }.
    let depth = 2;
    let j = idx + match[0].length;
    let block = "";
    while (j < text.length && depth > 0) {
      const ch = text[j];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      block += ch;
      j++;
      if (block.length > 800) break; // safety: huge blocks aren't us
    }
    const hasAccent = /color:\s*["']var\(--accent[^"']*\)["']/.test(block);
    const hasNoDecoration = /textDecoration:\s*["']none["']/.test(block);
    if (hasAccent && hasNoDecoration) {
      // Find which line this block started on.
      const before = text.slice(0, idx);
      const lineNo = before.split("\n").length;
      // Allow-marker check: any of the 8 lines before the style block.
      // Same window as the per-line scan above so a single rationale
      // comment can silence both code paths.
      const prevLines = lines
        .slice(Math.max(0, lineNo - 9), lineNo - 1)
        .join("\n");
      if (ALLOW_MARKER.test(prevLines)) continue;
      // Dedupe with the per-line scan: if we already flagged this file
      // at this line, skip.
      if (regressions.some((r) => r.file === path.relative(ROOT, file) && Math.abs(r.line - lineNo) <= 6)) {
        continue;
      }
      regressions.push({
        file: path.relative(ROOT, file),
        line: lineNo,
        text: `style block at line ${lineNo} mixes accent color + textDecoration: none`,
      });
    }
  }
}

assert(
  regressions.length === 0,
  `Found ${regressions.length} inline-link a11y regression${regressions.length === 1 ? "" : "s"}.\n` +
    `Pattern: <Link/a style={{ color: "var(--accent)", textDecoration: "none" }}> in text-block context.\n` +
    `Fix: replace textDecoration: "none" with textDecoration: "underline", textUnderlineOffset: 2.\n` +
    `If the link is genuinely standalone (e.g. button-style, flex card CTA) and the context proves accessibility independent of underline, add a "// a11y-allowed: <reason>" comment within 3 lines above the style block to silence this guard.\n\n` +
    `Locations:\n` +
    regressions
      .slice(0, 20)
      .map((r) => `  ${r.file}:${r.line}\n    ${r.text}`)
      .join("\n") +
    (regressions.length > 20 ? `\n  ... and ${regressions.length - 20} more` : ""),
);

// ---------------------------------------------------------------------------
// Self-test the regex against synthetic positive + negative cases.
// Without these, a future refactor that breaks the regex (e.g. swaps
// double-quotes for single-quotes) would silently make this guard
// useless. Always parse-test the parse tester.
// ---------------------------------------------------------------------------

const POS_SINGLE_LINE =
  '<Link href="/x" style={{ color: "var(--accent)", textDecoration: "none" }}>';
assert(
  PATTERN_SINGLE_LINE.test(POS_SINGLE_LINE),
  "regex catches the canonical antipattern (color first, decoration second)",
);

const POS_REVERSED =
  '<Link href="/x" style={{ textDecoration: "none", color: "var(--accent)" }}>';
assert(
  PATTERN_REVERSED.test(POS_REVERSED),
  "regex catches reversed property order (decoration first, color second)",
);

const POS_FALLBACK =
  '<a href="/x" style={{ color: "var(--accent, #6aa9ff)", textDecoration: "none" }}>';
assert(
  PATTERN_SINGLE_LINE.test(POS_FALLBACK),
  "regex catches accent with fallback color value",
);

const NEG_UNDERLINE =
  '<Link style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}>';
assert(
  !PATTERN_SINGLE_LINE.test(NEG_UNDERLINE) &&
    !PATTERN_REVERSED.test(NEG_UNDERLINE),
  "regex does NOT flag the canonical fix (underline + offset)",
);

const NEG_NON_LINK_ACCENT =
  '<span style={{ color: "var(--accent)" }}>icon</span>';
assert(
  !PATTERN_SINGLE_LINE.test(NEG_NON_LINK_ACCENT) &&
    !PATTERN_REVERSED.test(NEG_NON_LINK_ACCENT),
  "regex does NOT flag accent color without textDecoration: none (non-link uses)",
);

const NEG_DIFFERENT_DECORATION =
  '<a style={{ color: "var(--accent)", textDecoration: "line-through" }}>';
assert(
  !PATTERN_SINGLE_LINE.test(NEG_DIFFERENT_DECORATION) &&
    !PATTERN_REVERSED.test(NEG_DIFFERENT_DECORATION),
  "regex does NOT flag textDecoration values other than 'none'",
);

// ---------------------------------------------------------------------------
// Aggregator-friendly summary line.
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(
  `inline-link-a11y: ${passed} passed, ${failed} failed (of ${total})`,
);
if (failed > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
