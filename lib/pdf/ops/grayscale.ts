// lib/pdf/ops/grayscale.ts
//
// 2026-05-01 Tier 1: convert a PDF to grayscale.
//
// Approach: rasterize each page via PDFium → grayscale the pixel
// buffer with the ITU-R BT.709 luminance formula (0.2126·R + 0.7152·G
// + 0.0722·B) → re-embed as a JPEG image into a fresh PDF.
//
// Trade-off: the output is RASTERIZED. Text is no longer selectable
// or searchable; vector graphics become images. This matches what
// every online "grayscale PDF" tool does (the alternative —
// content-stream rewriting to convert color operators to gray
// equivalents — is fragile across tagged PDFs / soft masks /
// transparency groups, and pdf-lib doesn't expose content streams).
//
// The UI's longform FAQ calls this trade-off out clearly so the user
// isn't surprised. For text-preserving grayscale, the only reliable
// path is server-side Ghostscript with `-sColorConversionStrategy=Gray`
// — that's a future server-side rail, not in this batch.

"use client";

import { PDFDocument, degrees, PageSizes as _Unused } from "pdf-lib";
import { withPdfDocument } from "../library";

// Suppress unused import warning at compile — kept in case the
// imposed page sizing path needs it later.
void _Unused;

export interface GrayscaleOptions {
  /** Render scale relative to source page size. Default 2 (~144 DPI). */
  scale?: number;
  /** JPEG quality 0–1. Default 0.9. */
  quality?: number;
}

export interface GrayscaleResult {
  bytes: Uint8Array;
  pageCount: number;
}

/**
 * Convert RGBA pixel buffer to grayscale in place. Uses ITU-R BT.709
 * luminance weights — the same formula used by Photoshop's "Image →
 * Mode → Grayscale" and most modern image software. (Naive averaging
 * of R+G+B/3 produces less perceptually accurate results — pure-blue
 * text, for instance, becomes too light.)
 *
 * Input/output shape: PDFium hands BGRA, but rasterize.ts already
 * swaps to RGBA before passing to canvas. This function expects
 * RGBA — it's called downstream of the channel swap.
 */
function grayscaleInPlace(rgba: Uint8ClampedArray): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    // BT.709 luminance. Round, not floor — rounding is closer to the
    // mathematical luminance for mid-tones (consistent with Photoshop).
    const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    rgba[i] = lum;
    rgba[i + 1] = lum;
    rgba[i + 2] = lum;
    // alpha unchanged
  }
}

/**
 * Convert a PDF to grayscale. Output is a fresh PDF with each page
 * rendered as a grayscale JPEG; original page dimensions preserved.
 */
export async function grayscalePdf(
  bytes: Uint8Array,
  opts: GrayscaleOptions = {},
): Promise<GrayscaleResult> {
  const scale = opts.scale ?? 2;
  const quality = opts.quality ?? 0.9;

  // Per-page rendered grayscale bytes. We collect them all first,
  // then build the output PDF — keeps the PDFium document handle
  // open during rendering and avoids interleaving PDFium and
  // pdf-lib operations.
  const pages: Array<{
    jpgBytes: Uint8Array;
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
  }> = [];

  await withPdfDocument(bytes, async (doc) => {
    const pageCount = doc.getPageCount();
    if (pageCount === 0) throw new Error("This PDF has no pages.");

    for (let i = 0; i < pageCount; i++) {
      const p = doc.getPage(i);
      // Per-page render with our own grayscaling render callback.
      // The render callback receives raw BGRA pixels from PDFium and
      // returns encoded image bytes (matches the rasterize.ts signature).
      const rendered = await p.render({
        scale,
        render: async ({
          width,
          height,
          data,
        }: {
          width: number;
          height: number;
          data: Uint8Array;
        }): Promise<Uint8Array> => {
          // Channel swap (BGRA → RGBA), grayscale, JPEG encode.
          const rgba = new Uint8ClampedArray(data.length);
          for (let j = 0; j < data.length; j += 4) {
            rgba[j] = data[j + 2];
            rgba[j + 1] = data[j + 1];
            rgba[j + 2] = data[j];
            rgba[j + 3] = data[j + 3];
          }
          grayscaleInPlace(rgba);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("canvas 2D context unavailable");
          ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
          const blob: Blob | null = await new Promise((resolve) => {
            canvas.toBlob(resolve, "image/jpeg", quality);
          });
          if (!blob) throw new Error("canvas.toBlob returned null");
          return new Uint8Array(await blob.arrayBuffer());
        },
      });

      // PDFium renders at `scale` × source size, so back-calculate
      // the original page dimensions in PDF points.
      pages.push({
        jpgBytes: rendered.data,
        width: rendered.width,
        height: rendered.height,
        sourceWidth: rendered.width / scale,
        sourceHeight: rendered.height / scale,
      });

      // Yield the event loop so big PDFs don't freeze the tab.
      await new Promise((r) => setTimeout(r, 0));
    }
  });

  // Build output PDF: one page per source page, sized to the
  // ORIGINAL dimensions (so 8.5×11 input stays 8.5×11 output even
  // though we rendered at 2× scale). The JPEG fills the page.
  const out = await PDFDocument.create();
  for (const p of pages) {
    const jpg = await out.embedJpg(p.jpgBytes);
    const outPage = out.addPage([p.sourceWidth, p.sourceHeight]);
    outPage.drawImage(jpg, {
      x: 0,
      y: 0,
      width: p.sourceWidth,
      height: p.sourceHeight,
      rotate: degrees(0),
    });
  }
  const outBytes = await out.save({ useObjectStreams: false });
  return { bytes: outBytes, pageCount: pages.length };
}
