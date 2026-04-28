// lib/pdf/ops/crop.ts
//
// Tier 4 (2026-04-28): visually crop a PDF by setting /CropBox on
// every page. The underlying content stream is untouched — we just
// tell viewers to display a smaller region of each page. This is
// LOSSLESS: nothing is removed from the PDF, the visible area just
// shrinks. Anyone with the PDF can still read full-page metadata
// tools (qpdf, pdfinfo) to recover the original media box.
//
// pdf-lib&rsquo;s page.setCropBox(x, y, width, height) takes coordinates in
// PDF user space (1/72 inch units, origin at bottom-left of the page).
// Caller is responsible for converting from screen pixels to PDF
// points using the render scale.

import { PDFDocument } from "pdf-lib";

export interface CropRect {
  /** X position of crop rectangle in PDF points (origin bottom-left). */
  x: number;
  /** Y position of crop rectangle in PDF points (origin bottom-left). */
  y: number;
  /** Width of crop rectangle in PDF points. */
  width: number;
  /** Height of crop rectangle in PDF points. */
  height: number;
}

export interface CropResult {
  bytes: Uint8Array;
  pageCount: number;
  /** Crop applied (echoed back for the success card). */
  appliedCrop: CropRect;
}

/**
 * Apply a uniform crop rectangle to every page of the PDF. Intended
 * for the common case where every page has the same scanner margin
 * or the same content area. Per-page crop is a future extension.
 *
 * The crop rectangle is interpreted in PDF user-space coordinates
 * (origin bottom-left, 1/72 inch units). It must fit within each
 * page's media box; if any page is smaller than the crop, that
 * page&rsquo;s crop is clamped to its media box rather than failing the
 * whole operation.
 */
export async function cropPdf(
  bytes: Uint8Array,
  crop: CropRect,
): Promise<CropResult> {
  if (crop.width <= 0 || crop.height <= 0) {
    throw new Error("Crop rectangle has zero or negative size.");
  }
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const pageCount = doc.getPageCount();
  if (pageCount === 0) throw new Error("This PDF has no pages.");

  for (const page of doc.getPages()) {
    const { width: pw, height: ph } = page.getSize();
    // Clamp the crop to fit within this page's media box. Pages that
    // are smaller than the crop just get cropped to their full size
    // (effectively no crop) instead of failing the whole save.
    const x = Math.max(0, Math.min(crop.x, pw));
    const y = Math.max(0, Math.min(crop.y, ph));
    const w = Math.max(1, Math.min(crop.width, pw - x));
    const h = Math.max(1, Math.min(crop.height, ph - y));
    page.setCropBox(x, y, w, h);
  }

  const out = await doc.save({ useObjectStreams: true });
  return {
    bytes: out,
    pageCount,
    appliedCrop: crop,
  };
}
