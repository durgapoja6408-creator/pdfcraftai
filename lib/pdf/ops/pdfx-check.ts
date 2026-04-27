// lib/pdf/ops/pdfx-check.ts
//
// Build 2 Wave 8: heuristic PDF/X compliance check. PDF/X is for
// print production — fonts embedded, color managed, page boxes
// defined, no transparency (X-1a) or specific transparency rules.
//
// Reads markers from XMP and trailer, plus composite checks.

import {
  bytesToLatin1,
  checkCommonStructure,
  detectPdfXVersion,
  readObjectBody,
} from "./standards-helpers";
import { extractFonts } from "./fonts";

export interface PdfXCheckResult {
  /** Declared version, e.g. "PDF/X-4" or null. */
  declaredVersion: string | null;
  checks: Array<{
    label: string;
    status: "pass" | "fail" | "warning" | "info";
    detail: string;
  }>;
  compliant: boolean;
  failureCount: number;
  unsupported: boolean;
}

const EMPTY_RESULT: PdfXCheckResult = {
  declaredVersion: null,
  checks: [],
  compliant: false,
  failureCount: 0,
  unsupported: false,
};

export function checkPdfX(bytes: Uint8Array): PdfXCheckResult {
  try {
    const common = checkCommonStructure(bytes);
    const fontResult = extractFonts(bytes);
    const declaredVersion = detectPdfXVersion(bytes, common.xmpMetadata);
    const text = bytesToLatin1(bytes);

    const checks: PdfXCheckResult["checks"] = [];

    // 1. PDF/X identification.
    checks.push({
      label: "PDF/X identification marker",
      status: declaredVersion ? "pass" : "fail",
      detail: declaredVersion
        ? `Declared as ${declaredVersion}.`
        : "No /GTS_PDFXVersion or <pdfxid:GTS_PDFXVersion> marker. PDF/X requires explicit version identification.",
    });

    // 2. No encryption.
    checks.push({
      label: "No encryption",
      status: common.encrypted ? "fail" : "pass",
      detail: common.encrypted
        ? "Document is encrypted. PDF/X doesn't allow encryption — print production needs unrestricted access."
        : "Not encrypted — PDF/X compatible.",
    });

    // 3. No JavaScript.
    checks.push({
      label: "No JavaScript",
      status: common.hasJavaScript ? "fail" : "pass",
      detail: common.hasJavaScript
        ? "JavaScript detected. PDF/X doesn't allow scripts in print files."
        : "No JavaScript — PDF/X compatible.",
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
            : `${nonEmbedded.length} of ${fontResult.fonts.length} fonts not embedded. PDF/X requires all fonts embedded for print accuracy.`,
    });

    // 5. OutputIntent — PDF/X requires an output intent ICC profile.
    const rootMatch = text.match(/\/Root\s+(\d+)\s+\d+\s+R/);
    let hasOutputIntent = false;
    if (rootMatch) {
      const catalog = readObjectBody(text, rootMatch[1]);
      if (catalog) {
        hasOutputIntent =
          /\/OutputIntents\s*\[/.test(catalog) ||
          /\/OutputIntent\b/.test(catalog);
      }
    }
    checks.push({
      label: "Output intent declared",
      status: hasOutputIntent ? "pass" : "fail",
      detail: hasOutputIntent
        ? "Catalog has /OutputIntents — print conditions specified."
        : "No /OutputIntents in catalog. PDF/X requires an output intent describing the target print conditions (CMYK profile, paper, etc.).",
    });

    // 6. Trim box defined on at least the first page.
    const hasTrimBox = /\/TrimBox\s*\[/.test(text);
    const hasBleedBox = /\/BleedBox\s*\[/.test(text);
    checks.push({
      label: "Trim box defined",
      status: hasTrimBox ? "pass" : "fail",
      detail: hasTrimBox
        ? "/TrimBox found — trim dimensions specified."
        : "No /TrimBox found. PDF/X requires /TrimBox or /ArtBox on every page.",
    });
    checks.push({
      label: "Bleed box defined",
      status: hasBleedBox ? "pass" : "warning",
      detail: hasBleedBox
        ? "/BleedBox found — bleed area specified."
        : "No /BleedBox found. Common for print files but not strictly required by all PDF/X levels.",
    });

    // Info: transparency / RGB rules.
    checks.push({
      label: "Transparency rules (manual review)",
      status: "info",
      detail:
        "PDF/X-1a forbids transparency; PDF/X-3 and X-4 allow it. We don't analyze transparency — use a real PDF/X validator for full compliance.",
    });
    checks.push({
      label: "Color spaces (manual review)",
      status: "info",
      detail:
        "PDF/X-1a allows only CMYK + grayscale + spot. PDF/X-3 / X-4 allow RGB with embedded ICC. We don't enumerate color spaces — needs structural inspection.",
    });

    const failureCount = checks.filter((c) => c.status === "fail").length;
    return {
      declaredVersion,
      checks,
      compliant: failureCount === 0 && declaredVersion !== null,
      failureCount,
      unsupported: false,
    };
  } catch {
    return { ...EMPTY_RESULT, unsupported: true };
  }
}
