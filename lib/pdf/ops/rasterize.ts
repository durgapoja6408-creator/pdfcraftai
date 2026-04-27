// lib/pdf/ops/rasterize.ts
//
// Build 2 Wave 2 (2026-04-27): shared op for PDF → JPG and PDF →
// PNG. Renders each PDF page to a raster image using PDFium's
// page.render() with a browser-native canvas-backed render
// callback.
//
// Why separate from text-export.ts: rasterization touches a
// different PDFium codepath (the bitmap renderer, not the text
// extractor). Keeping the ops separate keeps the bundle splits
// clean — users on /tool/pdf-to-text don't pay the canvas-backed
// rasterizer's cost on first page load.
//
// PDFium's render() returns raw RGBA pixel data. We feed that into
// a canvas, then `canvas.toBlob('image/jpeg' | 'image/png')` to
// produce the final image bytes. Both formats share the canvas
// pipeline; only the toBlob mime differs.
//
// Default scale: 2x (144 DPI effective) — a good middle ground
// between file size and clarity. Users can pick from 1×/2×/3× in
// the UI; higher scales linearly increase memory + render time.

"use client";

import { withPdfDocument } from "../library";

export type RasterFormat = "jpeg" | "png";

export interface RasterPage {
  /** 1-based page number for filename and display. */
  pageNumber: number;
  /** Final encoded image bytes (JPEG or PNG). */
  bytes: Uint8Array;
  /** Width / height of the rendered image in CSS pixels. */
  width: number;
  height: number;
}

export interface RasterizeOptions {
  format: RasterFormat;
  /** Render scale relative to the PDF's natural size (1pt = 1px at scale=1). */
  scale: number;
  /** Optional JPEG quality 0–1. Ignored for PNG. Default 0.9. */
  quality?: number;
  /** Called with each rendered page so the UI can stream-render previews. */
  onProgress?: (pageNumber: number, totalPages: number) => void;
}

/**
 * Browser canvas-backed render callback. PDFium hands us raw RGBA
 * pixels; we paint to a canvas and read back as the requested
 * encoded format. This is the only browser-side path PDFium offers
 * — there's no native JPEG/PNG encoder in the WASM bundle.
 */
function makeBrowserRenderCallback(
  format: RasterFormat,
  quality: number,
): (options: { width: number; height: number; data: Uint8Array }) => Promise<Uint8Array> {
  return async ({ width, height, data }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2D context unavailable");
    // PDFium's default colorSpace is BGRA. ImageData expects RGBA,
    // so we swap channels in place.
    const rgba = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      rgba[i] = data[i + 2]; // R ← B
      rgba[i + 1] = data[i + 1]; // G ← G
      rgba[i + 2] = data[i]; // B ← R
      rgba[i + 3] = data[i + 3]; // A
    }
    const img = new ImageData(rgba, width, height);
    ctx.putImageData(img, 0, 0);
    const mime = format === "jpeg" ? "image/jpeg" : "image/png";
    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob(resolve, mime, format === "jpeg" ? quality : undefined);
    });
    if (!blob) throw new Error("canvas.toBlob returned null");
    return new Uint8Array(await blob.arrayBuffer());
  };
}

/**
 * Render every page of the PDF to encoded image bytes.
 *
 * Memory-aware: we yield the event loop between pages via
 * `await new Promise(r => setTimeout(r, 0))` so big PDFs don't
 * freeze the browser tab during canvas operations. The progress
 * callback fires after each page lands.
 */
export async function rasterizePdf(
  bytes: Uint8Array,
  options: RasterizeOptions,
): Promise<RasterPage[]> {
  const { format, scale, quality = 0.9, onProgress } = options;
  const renderCallback = makeBrowserRenderCallback(format, quality);
  return withPdfDocument(bytes, async (doc) => {
    const pageCount = doc.getPageCount();
    const out: RasterPage[] = [];
    for (let i = 0; i < pageCount; i++) {
      const p = doc.getPage(i);
      const rendered = await p.render({
        scale,
        render: renderCallback,
      });
      out.push({
        pageNumber: i + 1,
        bytes: rendered.data,
        width: rendered.width,
        height: rendered.height,
      });
      onProgress?.(i + 1, pageCount);
      // Yield to the event loop so the spinner stays smooth on
      // multi-page docs. The ~0ms timeout is enough to flush
      // pending paints.
      await new Promise((r) => setTimeout(r, 0));
    }
    return out;
  });
}
