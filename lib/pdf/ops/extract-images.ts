// lib/pdf/ops/extract-images.ts
//
// Build 2 Wave 3 (2026-04-27): walk every page, filter image objects,
// render each to PNG bytes via canvas. Different from rasterize.ts
// (which renders the WHOLE page) — this one extracts INDIVIDUAL
// embedded images at their original resolution.
//
// PDFium's PDFiumImageObject exposes `render()` which gives back
// RGBA pixels (BGRA in PDFium's default colorspace, swapped here).
// We paint to canvas + canvas.toBlob() to produce PNG output.
// Could expose JPEG too but PNG is the right default — we don't
// know the source format and re-encoding to lossy JPEG drops
// fidelity unnecessarily.
//
// Memory note: a single PDF page can contain dozens of images. We
// process page-by-page and yield to the event loop between pages
// so the tab stays responsive.

"use client";

import { withPdfDocument } from "../library";

export interface ExtractedImage {
  /** 1-based page number where this image was found. */
  pageNumber: number;
  /** Sequence number within the page (1-based). */
  indexOnPage: number;
  /** Encoded PNG bytes. */
  bytes: Uint8Array;
  /** Pixel width of the image. */
  width: number;
  /** Pixel height of the image. */
  height: number;
}

export interface ExtractImagesOptions {
  /** Called after each page so the UI can stream progress. */
  onProgress?: (pageNumber: number, totalPages: number, foundCount: number) => void;
}

function makePngRenderCallback(): (options: {
  width: number;
  height: number;
  data: Uint8Array;
}) => Promise<Uint8Array> {
  return async ({ width, height, data }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2D context unavailable");
    // BGRA → RGBA swap, same pattern as rasterize.ts.
    const rgba = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      rgba[i] = data[i + 2];
      rgba[i + 1] = data[i + 1];
      rgba[i + 2] = data[i];
      rgba[i + 3] = data[i + 3];
    }
    ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
    if (!blob) throw new Error("canvas.toBlob returned null");
    return new Uint8Array(await blob.arrayBuffer());
  };
}

/**
 * Walk every page of the PDF and return all embedded image objects
 * as PNG bytes. Empty array means the PDF contains no embedded
 * raster images (text-only PDFs are common).
 */
export async function extractImages(
  bytes: Uint8Array,
  options: ExtractImagesOptions = {},
): Promise<ExtractedImage[]> {
  const { onProgress } = options;
  const renderCallback = makePngRenderCallback();
  return withPdfDocument(bytes, async (doc) => {
    const pageCount = doc.getPageCount();
    const found: ExtractedImage[] = [];
    for (let i = 0; i < pageCount; i++) {
      const p = doc.getPage(i);
      let indexOnPage = 0;
      for (const obj of p.objects()) {
        if (obj.type !== "image") continue;
        try {
          const rendered = await obj.render({ render: renderCallback });
          indexOnPage += 1;
          found.push({
            pageNumber: i + 1,
            indexOnPage,
            bytes: rendered.data,
            width: rendered.width,
            height: rendered.height,
          });
        } catch (err) {
          // Some embedded images use codecs PDFium can't decode
          // cleanly (e.g. JBIG2 under encryption). Skip them
          // rather than failing the whole extraction.
          console.warn(
            `extract-images: failed on page ${i + 1} object ${indexOnPage + 1}`,
            err,
          );
        }
      }
      onProgress?.(i + 1, pageCount, found.length);
      // Yield every page so big PDFs don't lock up.
      await new Promise((r) => setTimeout(r, 0));
    }
    return found;
  });
}
