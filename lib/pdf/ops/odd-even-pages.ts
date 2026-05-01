// lib/pdf/ops/odd-even-pages.ts
//
// 2026-05-01 Tier 2: extract just the odd or even pages of a PDF.
//
// Common use case: re-scanning a duplex (two-sided) document where
// the duplex feeder failed and you only got one side. Drop the
// resulting "every other page" file in here, get a clean PDF
// containing just the captured side. Run twice and merge for the
// full document.
//
// Pure pdf-lib copyPages — fast, lossless, non-destructive. No
// rasterization.

import { PDFDocument } from "pdf-lib";

export type Parity = "odd" | "even";

export interface OddEvenOptions {
  parity: Parity;
}

export interface OddEvenResult {
  bytes: Uint8Array;
  /** Source page count BEFORE filtering. */
  sourcePageCount: number;
  /** Output page count AFTER filtering. */
  pageCount: number;
}

/**
 * Extract just the odd-numbered pages (1, 3, 5, ...) or just the
 * even-numbered pages (2, 4, 6, ...). 1-based numbering matches what
 * users see in PDF viewers (page 1 = first page).
 */
export async function oddEvenPagesPdf(
  bytes: Uint8Array,
  opts: OddEvenOptions,
): Promise<OddEvenResult> {
  const src = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const sourcePageCount = src.getPageCount();
  if (sourcePageCount === 0) throw new Error("This PDF has no pages.");

  // 1-based: page 1 (index 0) is odd; page 2 (index 1) is even.
  const wantOdd = opts.parity === "odd";
  const indices: number[] = [];
  for (let i = 0; i < sourcePageCount; i++) {
    const isOddPage = i % 2 === 0; // 0-indexed even = 1-based odd
    if (isOddPage === wantOdd) indices.push(i);
  }

  if (indices.length === 0) {
    throw new Error(
      `No ${opts.parity}-numbered pages in a ${sourcePageCount}-page PDF.`,
    );
  }

  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  for (const p of copied) out.addPage(p);

  const outBytes = await out.save({ useObjectStreams: false });
  return {
    bytes: outBytes,
    sourcePageCount,
    pageCount: indices.length,
  };
}
