// lib/pdf/ops/pdfa-check.ts
//
// Build 2 Wave 8: heuristic PDF/A compliance check. Reads the
// XMP markers (pdfaid:part + pdfaid:conformance) and runs the
// composite checks PDF/A requires (font embedding, no
// encryption, no JS, etc.).
//
// HONEST: this is a heuristic. Real PDF/A validators (veraPDF,
// Acrobat Pro) do dozens more structural checks (color profiles,
// transparency rules, etc.). We surface the major checks and tell
// you what we can't verify.

import {
  checkCommonStructure,
  detectPdfALevel,
} from "./standards-helpers";
import { extractFonts } from "./fonts";

export interface PdfACheckResult {
  /** Detected level, e.g. "PDF/A-2b" or null if no markers. */
  declaredLevel: string | null;
  /** Per-requirement checks. */
  checks: Array<{
    label: string;
    status: "pass" | "fail" | "warning" | "info";
    detail: string;
  }>;
  /** True if all required checks pass. */
  compliant: boolean;
  /** Number of failures. */
  failureCount: number;
  unsupported: boolean;
}

const EMPTY_RESULT: PdfACheckResult = {
  declaredLevel: null,
  checks: [],
  compliant: false,
  failureCount: 0,
  unsupported: false,
};

export function checkPdfA(bytes: Uint8Array): PdfACheckResult {
  try {
    const common = checkCommonStructure(bytes);
    const fontResult = extractFonts(bytes);
    const declared = detectPdfALevel(common.xmpMetadata);
    const declaredLevel = declared
      ? `PDF/A-${declared.part}${declared.conformance.toLowerCase()}`
      : null;

    const checks: PdfACheckResult["checks"] = [];

    // 1. PDF/A identification marker.
    checks.push({
      label: "PDF/A identification marker",
      status: declared ? "pass" : "fail",
      detail: declared
        ? `XMP declares ${declaredLevel}.`
        : "No <pdfaid:part> / <pdfaid:conformance> markers in XMP metadata. PDF/A requires these.",
    });

    // 2. Encryption — PDF/A doesn't allow encryption.
    checks.push({
      label: "No encryption",
      status: common.encrypted ? "fail" : "pass",
      detail: common.encrypted
        ? "Document is encrypted. PDF/A doesn't allow encryption (it would block long-term access)."
        : "Not encrypted — PDF/A compatible.",
    });

    // 3. JavaScript — PDF/A doesn't allow JS.
    checks.push({
      label: "No JavaScript",
      status: common.hasJavaScript ? "fail" : "pass",
      detail: common.hasJavaScript
        ? "JavaScript detected. PDF/A doesn't allow scripts (they break long-term reproducibility)."
        : "No JavaScript — PDF/A compatible.",
    });

    // 4. Fonts embedded.
    const nonEmbedded = fontResult.fonts.filter((f) => !f.embedded);
    checks.push({
      label: "All fonts embedded",
      status:
        fontResult.fonts.length === 0
          ? "info"
          : nonEmbedded.length === 0
            ? "pass"
            : "fail",
      detail:
        fontResult.fonts.length === 0
          ? "No fonts referenced — image-only or empty PDF."
          : nonEmbedded.length === 0
            ? `All ${fontResult.fonts.length} fonts are embedded.`
            : `${nonEmbedded.length} of ${fontResult.fonts.length} fonts not embedded: ${nonEmbedded.slice(0, 3).map((f) => f.baseFont).join(", ")}${nonEmbedded.length > 3 ? "…" : ""}. PDF/A requires all fonts embedded.`,
    });

    // 5. XMP metadata stream present.
    checks.push({
      label: "XMP metadata present",
      status: common.xmpMetadata ? "pass" : "fail",
      detail: common.xmpMetadata
        ? "XMP metadata stream found."
        : "No XMP metadata stream. PDF/A requires XMP metadata for archival identification.",
    });

    // Info: things we don't check.
    checks.push({
      label: "Color management (manual review)",
      status: "info",
      detail:
        "PDF/A requires ICC color profiles or device-independent color. We don't verify color management — use veraPDF or Acrobat Pro for full validation.",
    });

    checks.push({
      label: "Transparency rules (manual review)",
      status: "info",
      detail:
        "PDF/A-1 forbids transparency; PDF/A-2+ allows it with specific blending modes. We don't check this — needs structural inspection.",
    });

    const failureCount = checks.filter((c) => c.status === "fail").length;
    return {
      declaredLevel,
      checks,
      compliant: failureCount === 0 && declared !== null,
      failureCount,
      unsupported: false,
    };
  } catch {
    return { ...EMPTY_RESULT, unsupported: true };
  }
}
