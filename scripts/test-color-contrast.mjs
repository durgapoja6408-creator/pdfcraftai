#!/usr/bin/env node
/**
 * 2026-05-08 — Item #13 from the improvement analysis: color
 * contrast audit. Programmatic CI guard that parses the design
 * tokens in app/globals.css, converts oklch → linear sRGB →
 * relative luminance → WCAG contrast ratio, and asserts the
 * canonical token pairs meet WCAG AA thresholds in BOTH themes.
 *
 * The token definitions have notes referring to manual contrast
 * fixes from 2026-04-20 (--fg-subtle bumped 0.55 → 0.68 in dark,
 * 0.58 → 0.45 in light). This guard pins those values so a
 * future "tweak the design tokens for nicer aesthetics" PR can't
 * silently regress contrast below WCAG AA.
 *
 * WCAG AA thresholds:
 *   - 4.5:1 for normal-sized body text
 *   - 3.0:1 for large text (18pt+ or 14pt+ bold) and UI components
 *
 * Pairs checked (in both themes):
 *   fg on bg              — body text (4.5:1)
 *   fg on bg-1            — body text on a slightly elevated bg (4.5:1)
 *   fg-muted on bg-1      — muted body text (4.5:1)
 *   fg-subtle on bg-1     — subtlest text we expose (4.5:1)
 *   accent on bg          — accent links/buttons (3.0:1 — UI)
 *   accent-fg on accent   — text inside accent-filled button (4.5:1)
 *
 * Pure math, no deps. Sub-second.
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

const CSS_PATH = path.join(ROOT, "app/globals.css");
assert(fs.existsSync(CSS_PATH), `globals.css missing at ${CSS_PATH}`);
if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  console.log(`color-contrast: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

const CSS_SRC = fs.readFileSync(CSS_PATH, "utf8");

// ---------------------------------------------------------------------
// Color math — oklch → contrast ratio.
// ---------------------------------------------------------------------
//
// Pipeline: oklch (cylindrical) → oklab (cartesian) → linear sRGB
// → relative luminance → WCAG contrast.
//
// Reference: Björn Ottosson's oklab paper (2020) for the matrix
// constants. Linear-sRGB-from-oklab is Ottosson's published
// inverse; relative luminance is the standard ITU-R BT.709
// weighting that WCAG 2 specifies.

function oklchToOklab(L, C, H_deg) {
  const h = (H_deg * Math.PI) / 180;
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

function oklabToLinearRGB(L, a, b) {
  // Compute LMS' (cube-rooted LMS).
  const lp = L + 0.3963377774 * a + 0.2158037573 * b;
  const mp = L - 0.1055613458 * a - 0.0638541728 * b;
  const sp = L - 0.0894841775 * a - 1.291485548 * b;
  // Cube to recover LMS.
  const l3 = lp ** 3;
  const m3 = mp ** 3;
  const s3 = sp ** 3;
  // LMS → linear sRGB matrix.
  return [
    +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
}

function relativeLuminance(linR, linG, linB) {
  // Out-of-gamut clamping. Negative components (color outside sRGB
  // gamut) get pushed to 0; >1 gets clamped to 1. Acceptable
  // approximation since the design tokens are in-gamut by design.
  const r = Math.max(0, Math.min(1, linR));
  const g = Math.max(0, Math.min(1, linG));
  const b = Math.max(0, Math.min(1, linB));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(L1, L2) {
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

function oklchToLuminance(L, C, H_deg) {
  const [oL, oa, ob] = oklchToOklab(L, C, H_deg);
  const [r, g, b] = oklabToLinearRGB(oL, oa, ob);
  return relativeLuminance(r, g, b);
}

// ---------------------------------------------------------------------
// Token extraction — parse the dark + light token blocks.
// ---------------------------------------------------------------------

function extractBlock(label, startMarker) {
  // Find the marker, then capture everything until the next `}` at
  // outer-brace depth. Tokens use single-line `--name: oklch(...)`
  // form so no nesting; a simple scan-to-`}` is enough.
  const start = CSS_SRC.indexOf(startMarker);
  if (start < 0) return null;
  const end = CSS_SRC.indexOf("}", start);
  if (end < 0) return null;
  return CSS_SRC.slice(start, end);
}

function parseTokens(block) {
  // Match `--name: oklch(L C H)` lines. C and H accept negative + dec.
  const re = /--([a-z][a-z0-9-]*)\s*:\s*oklch\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\)/gi;
  const tokens = {};
  let m;
  while ((m = re.exec(block)) !== null) {
    const [, name, L, C, H] = m;
    tokens[name] = { L: parseFloat(L), C: parseFloat(C), H: parseFloat(H) };
  }
  return tokens;
}

const darkBlock = extractBlock("dark", '[data-theme="dark"]');
const lightBlock = extractBlock("light", '[data-theme="light"]');
assert(darkBlock !== null, "Could not locate the [data-theme=\"dark\"] block in globals.css");
assert(lightBlock !== null, "Could not locate the [data-theme=\"light\"] block in globals.css");

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  console.log(`color-contrast: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

const darkTokens = parseTokens(darkBlock);
const lightTokens = parseTokens(lightBlock);

// ---------------------------------------------------------------------
// Sanity: tokens we depend on were parsed.
// ---------------------------------------------------------------------

const REQUIRED_TOKENS = [
  "bg",
  "bg-1",
  "fg",
  "fg-muted",
  "fg-subtle",
  "accent",
  "accent-fg",
];
for (const name of REQUIRED_TOKENS) {
  assert(
    darkTokens[name],
    `Required dark token --${name} not parsed. Check globals.css line for syntax change.`,
  );
  assert(
    lightTokens[name],
    `Required light token --${name} not parsed. Check globals.css line for syntax change.`,
  );
}

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  console.log(`color-contrast: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

// ---------------------------------------------------------------------
// WCAG AA assertions.
// ---------------------------------------------------------------------

const PAIRS = [
  // Body text — strict 4.5:1
  { fg: "fg", bg: "bg", min: 4.5, label: "fg on bg (body text)" },
  { fg: "fg", bg: "bg-1", min: 4.5, label: "fg on bg-1 (body text on card)" },
  { fg: "fg-muted", bg: "bg-1", min: 4.5, label: "fg-muted on bg-1 (muted body text)" },
  { fg: "fg-subtle", bg: "bg-1", min: 4.5, label: "fg-subtle on bg-1 (subtlest text)" },
  // UI components — 3.0:1 (links/buttons against page bg are
  // distinguishable from surrounding text by other means too).
  { fg: "accent", bg: "bg", min: 3.0, label: "accent on bg (link/button color)" },
  // Accent button text — strict 4.5:1
  {
    fg: "accent-fg",
    bg: "accent",
    min: 4.5,
    label: "accent-fg on accent (button text)",
  },
];

function checkPair(themeName, tokens, pair) {
  const fg = tokens[pair.fg];
  const bg = tokens[pair.bg];
  if (!fg || !bg) {
    assert(false, `[${themeName}] could not resolve ${pair.label} — token missing`);
    return;
  }
  const fgLum = oklchToLuminance(fg.L, fg.C, fg.H);
  const bgLum = oklchToLuminance(bg.L, bg.C, bg.H);
  const ratio = contrastRatio(fgLum, bgLum);
  // Rounded to 2 decimal places for the failure message — the math
  // is approximate at the gamut edges and a 0.01 difference is
  // imperceptible.
  const ratioStr = ratio.toFixed(2);
  assert(
    ratio >= pair.min,
    `[${themeName}] ${pair.label}: ${ratioStr}:1 < ${pair.min}:1 (WCAG AA fail). ` +
      "Either bump the foreground L value (lighter text on dark bg, " +
      "darker text on light bg) or adjust the background. The token " +
      "comments in globals.css document the prior 2026-04-20 fix " +
      "history — keep this pair above its threshold.",
  );
}

for (const pair of PAIRS) {
  checkPair("dark", darkTokens, pair);
  checkPair("light", lightTokens, pair);
}

// ---------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
}

console.log(`color-contrast: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
