// lib/pdf/ops/bates-numbers.ts
//
// 2026-05-01 Tier 2: Bates numbering — sequential identifiers stamped
// on each page, used in legal discovery and litigation. Format is
// typically PREFIX + zero-padded digits, e.g. "LAW000001", "LAW000002",
// ... so files can be sorted alphabetically and remain in chronological
// production order.
//
// Distinct from page-numbers (different UX surface):
//  - page-numbers stamps "1", "Page 1 of N" — generic pagination.
//  - bates-numbers stamps "LAW000001" — discoverable identifier with
//    persistent prefix and a fixed digit count regardless of total
//    page count. The starting number is configurable (so a multi-batch
//    discovery production can continue from where the last batch left
//    off — "LAW001247", "LAW001248", ...).
//
// Pure pdf-lib drawText overlay; non-destructive, lossless.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type BatesPosition =
  | "bottom-right"
  | "bottom-left"
  | "bottom-center"
  | "top-right"
  | "top-left"
  | "top-center";

export interface BatesOptions {
  /** Prefix string (e.g. "LAW", "DEF", "PROD"). Default "LAW". */
  prefix?: string;
  /** Suffix string (rare but supported). Default "". */
  suffix?: string;
  /** Number of digits to zero-pad the counter to. Default 6 → "000001". */
  digits?: number;
  /** First Bates number. Default 1 → "PREFIX000001". */
  startNumber?: number;
  /** Position on each page. Default "bottom-right". */
  position?: BatesPosition;
  /** Font size in points. Default 9 (small, unobtrusive). */
  fontSize?: number;
  /** Margin from page edge in points. Default 24. */
  margin?: number;
}

export interface BatesResult {
  bytes: Uint8Array;
  pageCount: number;
  /** Last Bates label stamped (for "next batch starts at..." UI). */
  lastLabel: string;
}

function formatBatesLabel(
  prefix: string,
  num: number,
  digits: number,
  suffix: string,
): string {
  return prefix + String(num).padStart(digits, "0") + suffix;
}

/**
 * Stamp a Bates label on every page. Deterministic ordering: page i
 * (0-based) gets `startNumber + i`.
 */
export async function batesNumbersPdf(
  bytes: Uint8Array,
  opts: BatesOptions = {},
): Promise<BatesResult> {
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const pageCount = doc.getPageCount();
  if (pageCount === 0) throw new Error("This PDF has no pages.");

  const prefix = opts.prefix ?? "LAW";
  const suffix = opts.suffix ?? "";
  const digits = Math.max(1, Math.min(12, opts.digits ?? 6));
  const startNumber = Math.max(0, opts.startNumber ?? 1);
  const position = opts.position ?? "bottom-right";
  const fontSize = opts.fontSize ?? 9;
  const margin = opts.margin ?? 24;

  // Sanity: ensure the configured digit count is wide enough for
  // (startNumber + pageCount - 1). If not, throw a clear message
  // before stamping anything — beats silently overflowing the digit
  // pad and producing labels like "LAW01000" alongside "LAW000999".
  const lastNumber = startNumber + pageCount - 1;
  if (String(lastNumber).length > digits) {
    throw new Error(
      `Digit count (${digits}) too small for last number ${lastNumber}. ` +
        `Increase digits to at least ${String(lastNumber).length}.`,
    );
  }

  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const color = rgb(0, 0, 0);

  const pages = doc.getPages();
  let lastLabel = "";
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const num = startNumber + i;
    const label = formatBatesLabel(prefix, num, digits, suffix);
    lastLabel = label;
    const textWidth = font.widthOfTextAtSize(label, fontSize);

    const isBottom = position.startsWith("bottom-");
    const y = isBottom ? margin : height - margin - fontSize;
    let x = 0;
    if (position.endsWith("-center")) {
      x = (width - textWidth) / 2;
    } else if (position.endsWith("-right")) {
      x = width - margin - textWidth;
    } else {
      x = margin;
    }

    page.drawText(label, {
      x,
      y,
      size: fontSize,
      font,
      color,
    });
  }

  const outBytes = await doc.save({ useObjectStreams: false });
  return { bytes: outBytes, pageCount, lastLabel };
}
