// lib/pdf/ops/accessibility.ts
//
// Build 2 Wave 8: heuristic accessibility audit. Checks the
// structural markers WCAG / PDF/UA require — tagged PDF flag,
// structure tree, language, title, display-title preference.
//
// HONEST about what we can't check:
//   - Color contrast (would need rendered pixel analysis)
//   - Reading-order quality (need to compare struct tree to visual order)
//   - Alt-text correctness (we can detect Figure tags but can't tell
//     if the alt text is meaningful)
//   - Color-as-only-information violations
// These require human review or rendered-pixel analysis we don't do.

import { checkCommonStructure, bytesToLatin1, readObjectBody } from "./standards-helpers";

export interface AccessibilityCheck {
  /** Short label, e.g. "Tagged PDF". */
  label: string;
  /** Pass / fail / warning. */
  status: "pass" | "fail" | "warning" | "info";
  /** Detail explaining the verdict. */
  detail: string;
  /** Severity if it fails: must-fix vs should-fix. */
  severity: "must-fix" | "should-fix" | "info";
}

export interface AccessibilityResult {
  checks: AccessibilityCheck[];
  /** 0–100 score based on must-fix vs should-fix vs info passes. */
  score: number;
  /** Number of must-fix failures. */
  mustFixCount: number;
  unsupported: boolean;
}

const EMPTY_RESULT: AccessibilityResult = {
  checks: [],
  score: 0,
  mustFixCount: 0,
  unsupported: false,
};

export function auditAccessibility(bytes: Uint8Array): AccessibilityResult {
  try {
    const common = checkCommonStructure(bytes);
    const checks: AccessibilityCheck[] = [];

    // Must-fix structural checks
    checks.push({
      label: "Tagged PDF",
      status: common.isTagged ? "pass" : "fail",
      severity: "must-fix",
      detail: common.isTagged
        ? "Document has /MarkInfo /Marked true — assistive tech can read structure."
        : "PDF is not tagged. Screen readers will read content in an unpredictable order. Re-export with 'Tag' / 'Tagged PDF' enabled.",
    });

    checks.push({
      label: "Structure tree",
      status: common.hasStructTree ? "pass" : "fail",
      severity: "must-fix",
      detail: common.hasStructTree
        ? "Document has /StructTreeRoot — logical reading order is defined."
        : "No structure tree. Headings, paragraphs, and lists aren't semantically labeled. Add structure during export.",
    });

    checks.push({
      label: "Document language",
      status: common.language ? "pass" : "fail",
      severity: "must-fix",
      detail: common.language
        ? `Document language declared as "${common.language}". Screen readers can pick the right voice.`
        : "No /Lang attribute. Screen readers don't know which language to read in. Set the document language during export.",
    });

    // Should-fix: title metadata
    checks.push({
      label: "Document title",
      status: common.title ? "pass" : "warning",
      severity: "should-fix",
      detail: common.title
        ? `Title metadata present: "${common.title}".`
        : "No title in metadata. Window title bars and bookmarks will show the filename instead — less useful for AT users with multiple PDFs open.",
    });

    checks.push({
      label: "Display title in viewers",
      status: common.displayDocTitle
        ? "pass"
        : common.title
          ? "warning"
          : "info",
      severity: "should-fix",
      detail: common.displayDocTitle
        ? "/ViewerPreferences /DisplayDocTitle is true — viewers show the title, not the filename."
        : common.title
          ? "Title is set but DisplayDocTitle is not enabled — viewers may show the filename instead."
          : "No title set, so this preference doesn't apply.",
    });

    // Info: encryption can break some AT workflows
    checks.push({
      label: "Encryption",
      status: common.encrypted ? "warning" : "pass",
      severity: "info",
      detail: common.encrypted
        ? "Document is encrypted. Some assistive technologies struggle with encrypted PDFs. If AT users need this doc, consider unencrypting."
        : "Not encrypted — AT compatible.",
    });

    // Info: JavaScript can interfere with AT
    checks.push({
      label: "No JavaScript",
      status: common.hasJavaScript ? "warning" : "pass",
      severity: "info",
      detail: common.hasJavaScript
        ? "Document contains JavaScript. JS-driven dynamic content can confuse screen readers. Test with NVDA / VoiceOver."
        : "No JavaScript. Document is statically readable.",
    });

    // Image alt-text presence — heuristic: count Figure tags + look for /Alt entries
    const figureCount = countFigureTags(bytes);
    checks.push({
      label: "Image alt text",
      status:
        figureCount.figures === 0
          ? "info"
          : figureCount.withAlt === figureCount.figures
            ? "pass"
            : "warning",
      severity: "should-fix",
      detail:
        figureCount.figures === 0
          ? "No <Figure> tags found in the structure tree (no tagged images detected)."
          : `${figureCount.withAlt} of ${figureCount.figures} <Figure> tags have /Alt attributes. Each tagged image should have alt text describing its purpose.`,
    });

    // Compute score: 100 if all must-fix pass, lose 20 per must-fix
    // failure, 5 per should-fix warning. Floor at 0.
    let score = 100;
    let mustFixCount = 0;
    for (const c of checks) {
      if (c.status === "fail" && c.severity === "must-fix") {
        score -= 20;
        mustFixCount++;
      } else if (c.status === "warning" && c.severity === "should-fix") {
        score -= 5;
      }
    }
    score = Math.max(0, score);

    return { checks, score, mustFixCount, unsupported: false };
  } catch {
    return { ...EMPTY_RESULT, unsupported: true };
  }
}

function countFigureTags(bytes: Uint8Array): { figures: number; withAlt: number } {
  const text = bytesToLatin1(bytes);
  // Count /S /Figure occurrences inside structure elements.
  const figures = (text.match(/\/S\s*\/Figure\b/g) || []).length;
  // Count occurrences of /S /Figure that have a sibling /Alt (rough — same object scan).
  // We do a quick pass: for each /S /Figure match, check if /Alt appears within ~500 chars.
  let withAlt = 0;
  const re = /\/S\s*\/Figure\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const window = text.slice(m.index, m.index + 500);
    if (/\/Alt\s*\(/.test(window) || /\/Alt\s*</.test(window)) withAlt++;
  }
  // Sanity check for malformed counts
  if (withAlt > figures) withAlt = figures;
  // Suppress unused readObjectBody import
  void readObjectBody;
  return { figures, withAlt };
}
