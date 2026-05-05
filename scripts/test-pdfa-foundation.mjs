#!/usr/bin/env node
/**
 * 2026-05-05 — PDF/A foundation guard (PENDING §5b).
 *
 * Locks the storage + helper + route surface for the Ghostscript-
 * backed PDF/A-2b converter. Mirrors test-pdf-compress-foundation.mjs;
 * pure static parse, sub-second.
 *
 * What it catches
 * ---------------
 * - PdfaLevel union expanded beyond "2b" without a CI sign-off
 *   (foundation deliberately ships only -2b — see lib/tools/ghostscript/pdfa.ts
 *   docstring for why -1b / -3b / -2u / -2a are excluded)
 * - PDFACompatibilityPolicy=1 dropped (would let gs silently strip
 *   un-PDF/A-able content and produce files that LIE about conformance)
 * - Output intent profile flag dropped (without it the output isn't
 *   actually PDF/A even though gs claims it is)
 * - Process color model declaration dropped
 * - Route loses its feature-flag gate (would expose to all logged-in
 *   users on first deploy)
 * - Route loses auth or size cap or magic-header check
 * - Helper drops mkdtemp/finally{} cleanup or SIGKILL discipline
 *
 * Output line conforms to aggregator regex:
 *   `${name}: ${pass} passed, ${fail} failed`.
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

const HELPER = path.join(ROOT, "lib/tools/ghostscript/pdfa.ts");
const ROUTE = path.join(ROOT, "app/api/tools/pdf-a/route.ts");
const FLAGS = path.join(ROOT, "lib/flags.ts");

// ---------------------------------------------------------------------------
// Section A: helper public surface + Ghostscript invariants
// ---------------------------------------------------------------------------

assert(fs.existsSync(HELPER), "A1: lib/tools/ghostscript/pdfa.ts exists");
const helperSrc = fs.readFileSync(HELPER, "utf8");

assert(
  /export\s+type\s+PdfaLevel\s*=\s*"2b"\s*;/.test(helperSrc),
  "A2: PdfaLevel union is exactly '2b' (no -1b, -3b, -2u, -2a)",
);

assert(
  /export\s+const\s+PDFA_MAX_INPUT_BYTES\s*=\s*COMPRESS_MAX_INPUT_BYTES/.test(
    helperSrc,
  ),
  "A3: PDFA_MAX_INPUT_BYTES = COMPRESS_MAX_INPUT_BYTES (single source of truth)",
);

assert(
  /export\s+const\s+PDFA_TIMEOUT_MS\s*=\s*90_?000/.test(helperSrc),
  "A4: PDFA_TIMEOUT_MS = 90s (PDF/A is slower than compress)",
);

assert(
  /export\s+async\s+function\s+convertToPdfa\b/.test(helperSrc),
  "A5: convertToPdfa is exported async",
);

// PDF/A-specific Ghostscript flags. Each one is load-bearing:
//   -dPDFA=2 — sets conformance target
//   -dPDFACompatibilityPolicy=1 — abort instead of lie about conformance
//   -sProcessColorModel=DeviceRGB — required color model declaration
//   -sOutputIntentProfile=... — required output intent
const REQUIRED_PDFA_FLAGS = [
  "-dPDFA=2",
  "-dPDFACompatibilityPolicy=1",
  "-sProcessColorModel=DeviceRGB",
];
for (const flag of REQUIRED_PDFA_FLAGS) {
  assert(
    helperSrc.includes(`"${flag}"`),
    `A6.${flag}: helper passes ${flag} to gs`,
  );
}

// Output intent profile — the path comes from options.iccProfilePath
// or a default. Dropping this would silently produce non-conformant
// PDFs (gs claims it's PDF/A but the renderer rejects it).
assert(
  /-sOutputIntentProfile=\$\{iccProfilePath\}/.test(helperSrc),
  "A7: helper passes -sOutputIntentProfile with a real ICC path",
);

// Standard non-interactive triplet (same as compress)
const REQUIRED_GS_FLAGS = ["-sDEVICE=pdfwrite", "-dNOPAUSE", "-dQUIET", "-dBATCH"];
for (const flag of REQUIRED_GS_FLAGS) {
  assert(
    helperSrc.includes(`"${flag}"`),
    `A8.${flag}: helper passes ${flag} to gs`,
  );
}

// Temp-file + signal discipline (same as compress)
assert(
  /mkdtemp\s*\(/.test(helperSrc),
  "A9: helper uses mkdtemp for isolated temp dir per call",
);
assert(
  /finally\s*\{[\s\S]*?rm\s*\(/.test(helperSrc),
  "A10: helper cleans up temp dir in finally{}",
);
assert(
  /child\.kill\(\s*"SIGKILL"\s*\)/.test(helperSrc),
  "A11: timeout sends SIGKILL (not SIGTERM)",
);

// PDFA-2b is the only conformance level we expose; helper must
// default to it.
assert(
  /options\.level\s*\?\?\s*"2b"/.test(helperSrc),
  "A12: convertToPdfa defaults level to '2b'",
);

// Re-uses GhostscriptError from compress.ts (single source of truth
// for error categorization). Importing avoids two parallel error
// hierarchies that drift apart.
assert(
  /import\s*\{[^}]*GhostscriptError[^}]*\}\s*from\s*["']\.\/compress["']/.test(
    helperSrc,
  ),
  "A13: helper imports GhostscriptError from ./compress (shared error type)",
);

// ---------------------------------------------------------------------------
// Section B: route handler invariants
// ---------------------------------------------------------------------------

assert(fs.existsSync(ROUTE), "B1: app/api/tools/pdf-a/route.ts exists");
const routeSrc = fs.readFileSync(ROUTE, "utf8");

assert(
  /export\s+async\s+function\s+POST\b/.test(routeSrc),
  "B2: POST handler is exported",
);
assert(
  /export\s+const\s+runtime\s*=\s*"nodejs"/.test(routeSrc),
  "B3: runtime = nodejs",
);
assert(
  /export\s+const\s+dynamic\s*=\s*"force-dynamic"/.test(routeSrc),
  "B4: dynamic = force-dynamic",
);

assert(
  /const\s+session\s*=\s*await\s+auth\(\)/.test(routeSrc),
  "B5: route awaits auth() before any work",
);
assert(
  /not_authenticated/.test(routeSrc),
  "B6: route returns not_authenticated 401 on missing session",
);

// Feature flag gate — the foundation invariant
assert(
  /isFeatureEnabled\(\s*FEATURE_FLAGS\.PDF_A_CONVERT/.test(routeSrc),
  "B7: route checks PDF_A_CONVERT feature flag",
);
assert(
  /feature_disabled/.test(routeSrc),
  "B8: route returns feature_disabled when flag is off",
);

assert(
  /pdfFile\.size\s*>\s*PDFA_MAX_INPUT_BYTES/.test(routeSrc),
  "B9: route checks file size before buffering bytes",
);
assert(
  /payload_too_large/.test(routeSrc),
  "B10: route returns payload_too_large on oversize input",
);

assert(
  /inputBytes\[0\][\s\S]*?0x25[\s\S]*?inputBytes\[1\][\s\S]*?0x50[\s\S]*?inputBytes\[2\][\s\S]*?0x44[\s\S]*?inputBytes\[3\][\s\S]*?0x46/.test(
    routeSrc,
  ),
  "B11: route checks %PDF magic header bytes on inputBytes[0..3]",
);

assert(
  /application\/pdf/.test(routeSrc),
  "B12: route accepts application/pdf mime",
);
assert(
  /application\/octet-stream/.test(routeSrc),
  "B13: route also accepts application/octet-stream",
);

assert(
  /err\s+instanceof\s+GhostscriptError/.test(routeSrc),
  "B14: route catches GhostscriptError specifically",
);
assert(
  /pdfa_failed/.test(routeSrc),
  "B15: route returns pdfa_failed error code on gs error",
);

// Route does NOT expose `level` as a user-controlled field — we
// only ship -2b. If someone adds a `level` form parameter the type
// signature in the helper would catch it (PdfaLevel union is "2b"
// only), but pin here as belt-and-braces.
assert(
  !/form\.get\(\s*"level"/.test(routeSrc),
  "B16: route does NOT read a 'level' parameter (only -2b is exposed)",
);

// ---------------------------------------------------------------------------
// Section C: feature flag registration
// ---------------------------------------------------------------------------

assert(fs.existsSync(FLAGS), "C1: lib/flags.ts exists");
const flagsSrc = fs.readFileSync(FLAGS, "utf8");

assert(
  /PDF_A_CONVERT:\s*"pdf_a_convert"/.test(flagsSrc),
  "C2: FEATURE_FLAGS.PDF_A_CONVERT is registered with value 'pdf_a_convert'",
);

assert(
  /FEATURE_FLAGS\s*=\s*\{[\s\S]*?PDF_A_CONVERT[\s\S]*?\}\s*as\s+const/m.test(
    flagsSrc,
  ),
  "C3: PDF_A_CONVERT appears inside FEATURE_FLAGS `as const` literal",
);

// ---------------------------------------------------------------------------
// Section D: shared discipline with compress (single source of truth)
// ---------------------------------------------------------------------------

// Both helpers should use the same input size limit (50MB). If
// compress.ts changes COMPRESS_MAX_INPUT_BYTES, pdfa.ts inherits via
// the imported re-export. The pin below catches the regression where
// someone copy-pastes a literal here and breaks the inheritance.
assert(
  !/PDFA_MAX_INPUT_BYTES\s*=\s*\d+\s*\*\s*\d+\s*\*\s*\d+/.test(helperSrc),
  "D1: PDFA_MAX_INPUT_BYTES is not a literal (must inherit from COMPRESS_MAX_INPUT_BYTES)",
);

// stderr cap pinned at 64KB (same as compress)
assert(
  /stderr\.length\s*<\s*64\s*\*\s*1024/.test(helperSrc),
  "D2: stderr capture capped at 64KB (matches compress.ts)",
);

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`pdfa-foundation: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
