// lib/pdf/ops/inspect.ts
//
// PDF document inspection: page count, dimensions, word count estimate,
// reading time. All from a single PDFium load — adds no engine cost
// over the original page-count call, just surfaces more of what we
// already parsed.
//
// Returns the data shape the PageCounter UI renders. Designed so the
// caller can show partial results progressively (page count first,
// word count second, etc.) without needing multiple PDFium loads.
//
// Why this lives in lib/pdf/ops alongside page-count.ts: the function
// is the ops-layer for the "inspect a PDF" use case. The ops layer
// owns the PDFium API; the component owns the UI.

"use client";

import { withPdfDocument } from "../library";

export interface PageDimension {
  /** Width in PDF points (1pt = 1/72 inch). */
  width: number;
  /** Height in PDF points. */
  height: number;
}

export interface DocumentInspection {
  pageCount: number;
  /** First-page dimensions; multi-page docs typically share these. */
  firstPageDimensions: PageDimension;
  /** True if all sampled pages share the same dimensions. */
  uniformDimensions: boolean;
  /** Estimated word count across the document. May be approximate
   * for very long docs (we may sample-and-extrapolate). */
  wordCount: number;
  /** True if the wordCount is an estimate (sampled), false if exact. */
  wordCountEstimated: boolean;
}

/**
 * Friendly name for a page size. PDF standard sizes are well-known.
 * Returns the closest-match common name or "Custom" if no match.
 *
 * Tolerance: ±2pt on each axis to handle rounding in producers.
 */
export function describePageSize(d: PageDimension): string {
  const tolerance = 2;
  const matches = (w: number, h: number) =>
    Math.abs(d.width - w) <= tolerance && Math.abs(d.height - h) <= tolerance;
  // Standard sizes in points (width × height portrait orientation)
  const sizes: Array<[string, number, number]> = [
    ["Letter", 612, 792], // US Letter 8.5 × 11 in
    ["Legal", 612, 1008], // US Legal 8.5 × 14 in
    ["Tabloid", 792, 1224], // Tabloid 11 × 17 in
    ["A4", 595, 842], // A4 8.27 × 11.69 in
    ["A3", 842, 1191], // A3 11.69 × 16.54 in
    ["A5", 420, 595], // A5 5.83 × 8.27 in
    ["B5", 499, 709], // B5 6.93 × 9.84 in
    ["Executive", 522, 756], // Executive 7.25 × 10.5 in
  ];
  for (const [name, w, h] of sizes) {
    if (matches(w, h) || matches(h, w)) return name;
  }
  return "Custom";
}

/** Convert PDF points to inches (1 inch = 72 pt). */
export function pointsToInches(pt: number): number {
  return pt / 72;
}

/** Convert PDF points to millimeters (1 inch = 25.4 mm). */
export function pointsToMm(pt: number): number {
  return (pt / 72) * 25.4;
}

/** Reading time in minutes (~250 words/minute average adult reading). */
export function estimateReadingTimeMinutes(words: number): number {
  return Math.max(1, Math.round(words / 250));
}

/**
 * Inspect a PDF and return rich document metadata.
 *
 * For very large documents (>100 pages), word count is sampled from
 * the first 20 + last 5 pages and extrapolated. For smaller docs,
 * word count is exact (every page scanned).
 */
export async function inspectPdf(
  bytes: Uint8Array,
): Promise<DocumentInspection> {
  return withPdfDocument(bytes, async (doc) => {
    const pageCount = doc.getPageCount();

    // First-page dimensions
    const firstPage = doc.getPage(0);
    const firstSize = firstPage.getOriginalSize();
    const firstPageDimensions: PageDimension = {
      width: firstSize.originalWidth,
      height: firstSize.originalHeight,
    };

    // Check if all sampled pages share dimensions (matters for print
    // QC + suggesting "this PDF has mixed orientation/size")
    const sampleIndices: number[] = [];
    if (pageCount <= 10) {
      for (let i = 0; i < pageCount; i++) sampleIndices.push(i);
    } else {
      // Sample first 5, middle 1, last 4
      sampleIndices.push(0, 1, 2, 3, 4);
      sampleIndices.push(Math.floor(pageCount / 2));
      sampleIndices.push(pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1);
    }
    let uniformDimensions = true;
    for (const i of sampleIndices) {
      if (i === 0) continue;
      const p = doc.getPage(i);
      const s = p.getOriginalSize();
      if (
        Math.abs(s.originalWidth - firstPageDimensions.width) > 1 ||
        Math.abs(s.originalHeight - firstPageDimensions.height) > 1
      ) {
        uniformDimensions = false;
        break;
      }
    }

    // Word count — sample-and-extrapolate for >100 page docs to keep
    // big PDFs responsive. Whitespace split is deliberately rough;
    // the user-facing label says "approximately N words" so we don't
    // need linguist-grade tokenization.
    let wordCount = 0;
    let wordCountEstimated = false;
    if (pageCount <= 100) {
      for (let i = 0; i < pageCount; i++) {
        const p = doc.getPage(i);
        const text = p.getText();
        wordCount += countWords(text);
      }
    } else {
      const sampledIndices: number[] = [];
      for (let i = 0; i < 20; i++) sampledIndices.push(i);
      for (let i = pageCount - 5; i < pageCount; i++) sampledIndices.push(i);
      let sampleWords = 0;
      for (const i of sampledIndices) {
        const p = doc.getPage(i);
        sampleWords += countWords(p.getText());
      }
      const avgPerPage = sampleWords / sampledIndices.length;
      wordCount = Math.round(avgPerPage * pageCount);
      wordCountEstimated = true;
    }

    return {
      pageCount,
      firstPageDimensions,
      uniformDimensions,
      wordCount,
      wordCountEstimated,
    };
  });
}

/** Whitespace-tokenized word count. Ignores empty strings. */
function countWords(s: string): number {
  if (!s) return 0;
  // Match runs of non-whitespace. Reasonable for most languages.
  // CJK doesn't have inter-word spaces — this will undercount, but
  // the UI label calls it "approximately" so the imprecision is OK.
  const matches = s.match(/\S+/g);
  return matches ? matches.length : 0;
}
