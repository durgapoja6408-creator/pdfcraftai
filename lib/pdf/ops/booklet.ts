// lib/pdf/ops/booklet.ts
//
// 2026-05-01 Tier 1: saddle-stitch booklet imposition.
//
// Saddle-stitch = print double-sided, fold the entire stack in half,
// staple along the fold. To make this work, pages must be reordered
// so that when the stack is folded, the original page sequence is
// preserved.
//
// Imposition rule for an N-page document where N is a multiple of 4:
//   sheet 1: [page N, page 1] front | [page 2, page N-1] back
//   sheet 2: [page N-2, page 3] front | [page 4, page N-3] back
//   ...
// Each sheet is landscape, holding 2 source pages side-by-side.
//
// If N is not a multiple of 4, we pad with blank pages at the END
// so the cover wrap-around math works out.
//
// Output paper sizes are landscape — saddle stitch only makes sense
// when each sheet holds two portrait halves.

import { PDFDocument } from "pdf-lib";

export type BookletPaperSize = "letter" | "legal" | "a4" | "a3";

/** Landscape dimensions of supported sheet sizes (PDF points). */
const SHEET_LANDSCAPE: Record<
  BookletPaperSize,
  { width: number; height: number }
> = {
  // Each sheet width = 2 × portrait width (so two source pages
  // side-by-side); height = portrait height.
  letter: { width: 1224, height: 792 }, // 17 × 11
  legal: { width: 1224, height: 1008 }, // 17 × 14
  a4: { width: 1190, height: 842 }, // a3 = 2 × a4 portrait
  a3: { width: 1684, height: 1191 }, // a2 sheet
};

export interface BookletOptions {
  paper: BookletPaperSize;
  /** Draw a faint center fold line on each output sheet. Default true. */
  foldLineGuide?: boolean;
}

export interface BookletResult {
  bytes: Uint8Array;
  /** Source page count BEFORE blank padding. */
  sourcePageCount: number;
  /** Source page count AFTER padding to multiple of 4. */
  paddedPageCount: number;
  /** Number of output sheets (paddedPageCount / 2 for double-sided). */
  sheetCount: number;
}

/**
 * Build a saddle-stitch booklet PDF. Caller prints double-sided
 * (flip-on-long-edge), stacks in order, folds in half, staples
 * along the fold.
 */
export async function bookletPdf(
  bytes: Uint8Array,
  opts: BookletOptions,
): Promise<BookletResult> {
  const src = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const sourcePageCount = src.getPageCount();
  if (sourcePageCount === 0) throw new Error("This PDF has no pages.");

  const sheet = SHEET_LANDSCAPE[opts.paper];
  const halfWidth = sheet.width / 2;

  // Pad to a multiple of 4 (each output sheet holds 4 source pages
  // — 2 front + 2 back — so a stack of M sheets covers 4M source
  // pages).
  const paddedPageCount =
    sourcePageCount % 4 === 0
      ? sourcePageCount
      : sourcePageCount + (4 - (sourcePageCount % 4));

  // Embed all source pages once. Pages beyond sourcePageCount are
  // synthetic blanks — we just don't draw anything for those slots.
  const indices: number[] = [];
  for (let i = 0; i < sourcePageCount; i++) indices.push(i);
  const out = await PDFDocument.create();
  const embedded = await out.embedPdf(src, indices);

  /**
   * Place embedded source page at slot in output. Scales to fit the
   * half-sheet area while preserving aspect ratio. Centers within
   * the half.
   */
  function placePage(
    outPage: ReturnType<typeof out.addPage>,
    sourceIdx0: number,
    leftHalf: boolean,
  ) {
    if (sourceIdx0 >= sourcePageCount) return; // blank padding slot
    const emb = embedded[sourceIdx0];
    const dims = emb.size();
    const scale = Math.min(halfWidth / dims.width, sheet.height / dims.height);
    const w = dims.width * scale;
    const h = dims.height * scale;
    const xOffset = leftHalf ? 0 : halfWidth;
    const x = xOffset + (halfWidth - w) / 2;
    const y = (sheet.height - h) / 2;
    outPage.drawPage(emb, { x, y, width: w, height: h });
  }

  // Saddle-stitch imposition. Output is double-sided sheets; we
  // produce the whole sequence (front then back of sheet 1, front
  // then back of sheet 2, etc.) so the user can hand it to a
  // print-double-sided dialog without further reordering.
  //
  // For N padded pages and i = 0..N/2 - 1:
  //   if i is even: sheet front = [page N-i, page i+1]
  //   if i is odd:  sheet back  = [page i+1, page N-i]
  //
  // Index variables below are 1-based to match the docstring.
  const sheetCount = paddedPageCount / 2;
  for (let outputSlotIndex = 0; outputSlotIndex < sheetCount; outputSlotIndex++) {
    const isFront = outputSlotIndex % 2 === 0;
    // 1-based source page numbers (N-i and i+1 from the rule).
    const i = outputSlotIndex; // 0-based progression through halves
    const leftPage1Based = isFront ? paddedPageCount - i : i + 1;
    const rightPage1Based = isFront ? i + 1 : paddedPageCount - i;

    const page = out.addPage([sheet.width, sheet.height]);
    placePage(page, leftPage1Based - 1, /*leftHalf=*/ true);
    placePage(page, rightPage1Based - 1, /*leftHalf=*/ false);

    if (opts.foldLineGuide ?? true) {
      page.drawLine({
        start: { x: halfWidth, y: 0 },
        end: { x: halfWidth, y: sheet.height },
        thickness: 0.5,
        opacity: 0.15,
      });
    }
  }

  const outBytes = await out.save({ useObjectStreams: false });
  return {
    bytes: outBytes,
    sourcePageCount,
    paddedPageCount,
    sheetCount,
  };
}
