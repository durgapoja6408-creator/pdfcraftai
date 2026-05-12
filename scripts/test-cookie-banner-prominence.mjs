#!/usr/bin/env node
/**
 * 2026-05-04 — Cookie banner equal-prominence guard.
 *
 * SECURITY_COMPLIANCE_AUDIT.md §2.2 flagged the cookie consent banner
 * as a potential GDPR dark pattern: Accept-all was rendered with
 * `background: var(--accent)` + `fontWeight: 600` (filled primary),
 * while Essential-only used `background: transparent` + `fontWeight:
 * 500` (outlined secondary). Unequal visual prominence between accept
 * and reject is the exact pattern flagged in:
 *
 *   - EDPB Guidelines 03/2022 §3.2.1 ("Hindering")
 *   - CNIL deliberation 2021-152 (€60M Facebook fine, April 2022)
 *   - DPDP Act 2023 §6 (consent must be free, specific, unambiguous)
 *
 * The fix equalized both buttons to the same outlined neutral
 * styling. This guard locks in the equalization so a future visual
 * refactor can't silently regress.
 *
 * What we check:
 *   A. Accept-all and Essential-only share the same `background` value
 *   B. Accept-all and Essential-only share the same `fontWeight` value
 *   C. Accept-all and Essential-only share the same `border` style
 *   D. The audit reference is preserved in the source comment so a
 *      future Claude session reading the file understands WHY both
 *      buttons look identical.
 *
 * Output line conforms to aggregator regex `${name}: ${pass} passed,
 * ${fail} failed`.
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

const BANNER_PATH = path.join(
  ROOT,
  "components",
  "compliance",
  "CookieConsent.tsx",
);

assert(fs.existsSync(BANNER_PATH), "0: CookieConsent.tsx exists");
const src = fs.readFileSync(BANNER_PATH, "utf8");

// Extract the two button blocks. The structure is:
//   <button ref={acceptButtonRef} ... onClick={() => onChoose("all")} style={{...}}>Accept all</button>
//   <button ... onClick={() => onChoose("essential")} style={{...}}>Essential only</button>
//
// We anchor on the discriminator label inside the JSX (Accept all /
// Essential only) so the regex isn't fragile to attribute-order
// changes. We then walk backwards to find the most recent `style={{`
// and forward to find the matching `}}`.

function extractStyleForLabel(label) {
  // Labels live on their own line in the JSX (between the opening
  // `>` of the button tag and the closing `</button>`), so we can't
  // anchor on `>${label}<`. Anchor on the bare label preceded by
  // whitespace and followed by `</button>` within a few hundred
  // chars (matches the JSX prettier formatting).
  const labelRe = new RegExp(
    `\\s${label.replace(/\s+/g, "\\s+")}\\s*<\\/button>`,
  );
  const labelMatch = src.match(labelRe);
  if (!labelMatch || labelMatch.index === undefined) {
    return null;
  }
  const labelIdx = labelMatch.index;
  // Walk backwards from the label to the most recent `style={{`.
  const before = src.slice(0, labelIdx);
  const styleStart = before.lastIndexOf("style={{");
  if (styleStart < 0) return null;
  // Walk forward from `style={{` to the matching `}}` — naive but fine
  // since style values don't contain `}}` patterns.
  const styleEnd = src.indexOf("}}", styleStart);
  if (styleEnd < 0) return null;
  return src.slice(styleStart, styleEnd + 2);
}

const acceptStyle = extractStyleForLabel("Accept all");
// 2026-05-12 SEV-0 audit fix: label changed from "Essential only" to
// "Reject all" per EDPB Guidelines 03/2022 §27 (the standard refuse
// label). The visual-prominence parity check is unchanged — the
// style block is still extracted by the JSX label discriminator,
// just under the new label.
const essentialStyle = extractStyleForLabel("Reject all");

assert(acceptStyle !== null, "1: Accept-all button style block found");
assert(
  essentialStyle !== null,
  "2: Reject-all button style block found",
);

if (acceptStyle && essentialStyle) {
  // ============================================================================
  // Section A — background equality
  // ============================================================================
  const acceptBg = (acceptStyle.match(/background:\s*([^,}]+)/) ?? [])[1]?.trim();
  const essentialBg = (
    essentialStyle.match(/background:\s*([^,}]+)/) ?? []
  )[1]?.trim();

  assert(
    acceptBg !== undefined,
    "A0: Accept-all has explicit `background:` declaration",
  );
  assert(
    essentialBg !== undefined,
    "A1: Essential-only has explicit `background:` declaration",
  );
  assert(
    acceptBg === essentialBg,
    `A2: Accept-all and Essential-only share the same \`background\` value (got Accept='${acceptBg}', Essential='${essentialBg}'; equal-prominence rule per SECURITY_COMPLIANCE_AUDIT.md §2.2)`,
  );

  // ============================================================================
  // Section B — fontWeight equality
  // ============================================================================
  const acceptFw = (
    acceptStyle.match(/fontWeight:\s*(\d+)/) ?? []
  )[1]?.trim();
  const essentialFw = (
    essentialStyle.match(/fontWeight:\s*(\d+)/) ?? []
  )[1]?.trim();

  assert(
    acceptFw !== undefined,
    "B0: Accept-all has explicit `fontWeight:` declaration",
  );
  assert(
    essentialFw !== undefined,
    "B1: Essential-only has explicit `fontWeight:` declaration",
  );
  assert(
    acceptFw === essentialFw,
    `B2: Accept-all and Essential-only share the same \`fontWeight\` (got Accept='${acceptFw}', Essential='${essentialFw}'; equal-prominence rule per SECURITY_COMPLIANCE_AUDIT.md §2.2)`,
  );

  // ============================================================================
  // Section C — border equality
  // ============================================================================
  const acceptBorder = (
    acceptStyle.match(/border:\s*"([^"]+)"/) ?? []
  )[1]?.trim();
  const essentialBorder = (
    essentialStyle.match(/border:\s*"([^"]+)"/) ?? []
  )[1]?.trim();

  assert(
    acceptBorder !== undefined,
    "C0: Accept-all has explicit `border:` declaration",
  );
  assert(
    essentialBorder !== undefined,
    "C1: Essential-only has explicit `border:` declaration",
  );
  assert(
    acceptBorder === essentialBorder,
    `C2: Accept-all and Essential-only share the same \`border\` (got Accept='${acceptBorder}', Essential='${essentialBorder}'; equal-prominence rule per SECURITY_COMPLIANCE_AUDIT.md §2.2)`,
  );

  // ============================================================================
  // Section D — color equality (foreground text contrast)
  // ============================================================================
  const acceptColor = (
    acceptStyle.match(/(?<!background)color:\s*([^,}]+)/) ?? []
  )[1]?.trim();
  const essentialColor = (
    essentialStyle.match(/(?<!background)color:\s*([^,}]+)/) ?? []
  )[1]?.trim();

  assert(
    acceptColor === essentialColor,
    `D1: Accept-all and Essential-only share the same \`color\` (got Accept='${acceptColor}', Essential='${essentialColor}'; equal-prominence rule)`,
  );
}

// ============================================================================
// Section E — audit-reference comment preserved
// ============================================================================

// Future Claude sessions reading this file should immediately see
// WHY both buttons look identical. Without this rationale the next
// "polish-the-CTA" pass is liable to re-introduce the dark pattern.
assert(
  /SECURITY_COMPLIANCE_AUDIT\.md/.test(src),
  "E1: source comment references SECURITY_COMPLIANCE_AUDIT.md (rationale link for equal-prominence rule)",
);
assert(
  /EDPB|GDPR|DPDP/.test(src),
  "E2: source comment references regulatory framework (EDPB / GDPR / DPDP)",
);

// ============================================================================
// Output
// ============================================================================

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`cookie-banner-prominence: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
