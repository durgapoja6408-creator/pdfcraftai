#!/usr/bin/env node
/**
 * 2026-05-08 — ToolDropzone size-error recovery suggestion guard.
 *
 * Background: when a user dropped an oversized PDF (>50MB) onto any
 * tool runner, the dropzone said "X exceeds 50MB limit" and stopped.
 * Most users don't know what to do with that — they hit a brick
 * wall and bounce. This commit changes the error to surface the
 * Compress tool inline as a one-click recovery path.
 *
 * What this guard catches:
 *   - The structured DropzoneError union getting flattened back to
 *     a plain string (would lose the recovery JSX wiring)
 *   - The /tool/compress recovery Link getting removed or pointed
 *     at a wrong tool (the recovery only makes sense for the
 *     existing free Compress tool that takes any sized PDF and
 *     trims it)
 *   - A future contributor "simplifying" the makeError helper back
 *     to a string-only return shape — would silently drop the
 *     recovery affordance for every ToolDropzone consumer
 *   - Non-PDF errors gaining a recovery suggestion (only the
 *     too-large case has a sensible single-tool answer; "drop a
 *     PDF" has no per-tool recovery)
 *
 * Pure static parse. Sub-second.
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

const COMP_PATH = path.join(ROOT, "components/tools/ToolDropzone.tsx");
assert(fs.existsSync(COMP_PATH), `ToolDropzone missing at ${COMP_PATH}`);

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  console.log(`tool-dropzone-recovery: ${passed} passed, ${failed} failed`);
  process.exit(1);
}

const SRC = fs.readFileSync(COMP_PATH, "utf8");

// ---------------------------------------------------------------------
// Section A — structured DropzoneError union (not flattened to string).
// ---------------------------------------------------------------------

assert(
  /type\s+DropzoneError\s*=\s*\|\s*\{\s*kind:\s*"non-pdf";/.test(SRC),
  "DropzoneError discriminated-union type not found. The error must " +
    "be structured (kind: 'non-pdf' | 'too-large') so the JSX " +
    "render path can branch on the kind to produce different " +
    "recovery affordances.",
);

assert(
  /\{\s*kind:\s*"too-large";\s*fileName:\s*string;\s*sizeBytes:\s*number;\s*limitBytes:\s*number\s*\}/.test(
    SRC,
  ),
  "too-large variant must include fileName + sizeBytes + limitBytes. " +
    "Without sizeBytes the user can't see how much over they are; " +
    "without limitBytes the message can't say what the limit is " +
    "(important when AI tools start passing tighter caps).",
);

// ---------------------------------------------------------------------
// Section B — error state holds the structured error.
// ---------------------------------------------------------------------

assert(
  /const\s+\[error\s*,\s*setError\]\s*=\s*useState<DropzoneError\s*\|\s*null>/.test(
    SRC,
  ),
  "useState must be typed `<DropzoneError | null>`. Reverting to " +
    "`<string | null>` would lose the structure and the JSX would " +
    "have to fall back to plain string rendering — no recovery affordance.",
);

// ---------------------------------------------------------------------
// Section C — both error paths route through makeError.
// ---------------------------------------------------------------------

assert(
  /setError\(\s*\{\s*kind:\s*"non-pdf",\s*fileName:\s*f\.name\s*\}\s*\)/.test(SRC),
  "non-PDF branch must call setError with `{ kind: 'non-pdf', fileName: f.name }`. " +
    "Anything else either bypasses the union (compile error) or " +
    "loses the file name from the message.",
);

assert(
  /setError\(\s*\{\s*kind:\s*"too-large",\s*fileName:\s*f\.name,\s*sizeBytes:\s*f\.size,\s*limitBytes:\s*MAX_FILE_SIZE_BYTES\s*,?\s*\}\s*\)/.test(
    SRC,
  ),
  "too-large branch must call setError with all 4 fields populated " +
    "(kind, fileName, sizeBytes, limitBytes). Missing sizeBytes or " +
    "limitBytes would force the makeError helper to fall back to " +
    "generic copy.",
);

// ---------------------------------------------------------------------
// Section D — makeError returns { message, recovery } structured pair.
// ---------------------------------------------------------------------

assert(
  /function\s+makeError\(\s*error:\s*DropzoneError\s*\)\s*:\s*\{\s*message:\s*string;\s*recovery:\s*ReactNode\s*\|\s*null\s*\}/.test(
    SRC,
  ),
  "makeError signature must be `(error: DropzoneError) => { message: string; recovery: ReactNode | null }`. " +
    "Returning a plain string drops the recovery affordance shape; " +
    "returning ReactNode for the message complicates the alert text " +
    "for screen readers.",
);

// ---------------------------------------------------------------------
// Section E — too-large error surfaces the Compress recovery link.
// ---------------------------------------------------------------------

assert(
  /href="\/tool\/compress-pdf"/.test(SRC),
  "Recovery Link must point at `/tool/compress-pdf`. That's the actual " +
    "tool id (per lib/tools.ts) for the existing free Compress tool — " +
    "the single sensible answer to 'this PDF is too big.' Bare " +
    "`/tool/compress` 404s because the registry uses the longer slug.",
);

assert(
  /Compress\s+this\s+PDF\s+first/i.test(SRC),
  "Recovery Link copy must say 'Compress this PDF first'. The 'first' " +
    "is load-bearing — it tells the user this is a recoverable path, " +
    "not a permanent dead end.",
);

assert(
  /aria-label="Compress\s+this\s+PDF\s+first[^"]*"/.test(SRC),
  "Recovery Link must have an aria-label since the Link is visually " +
    "iconified — screen readers need the explicit context.",
);

// ---------------------------------------------------------------------
// Section F — non-PDF error has NO recovery (different mental model).
// ---------------------------------------------------------------------
//
// The "only PDF files supported" error doesn't have a sensible
// per-tool recovery — there's no "Convert to PDF" tool that
// universally takes whatever the user dropped. Recovery suggestion
// here would be wrong: e.g. suggesting /tool/jpg-to-pdf when they
// dropped a .docx is misleading. Better to leave the user to find
// the right tool from /tools.

assert(
  /if\s*\(\s*error\.kind\s*===\s*"non-pdf"\s*\)\s*\{[\s\S]*?recovery:\s*null/.test(
    SRC,
  ),
  "non-pdf branch in makeError must return `recovery: null`. " +
    "Suggesting a single recovery tool here is misleading — what " +
    "the user dropped could be .docx, .pages, .jpg, .png, etc. " +
    "Better to leave them to /tools.",
);

// ---------------------------------------------------------------------
// Section G — JSX render path uses the structured pair.
// ---------------------------------------------------------------------

assert(
  /const\s+\{\s*message,\s*recovery\s*\}\s*=\s*makeError\(\s*error\s*\)/.test(SRC),
  "JSX render must destructure `{ message, recovery }` from " +
    "makeError(error). Otherwise the recovery JSX is unused even if " +
    "makeError still returns it.",
);

assert(
  /\{message\}[\s\S]{0,300}\{recovery\}/.test(SRC),
  "JSX must render both {message} and {recovery} adjacent to each " +
    "other. Rendering only message would drop the recovery affordance " +
    "even though the structure is intact.",
);

// ---------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------

if (failed > 0) {
  console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
}

console.log(`tool-dropzone-recovery: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
