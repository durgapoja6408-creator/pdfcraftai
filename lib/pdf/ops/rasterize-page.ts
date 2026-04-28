// lib/pdf/ops/rasterize-page.ts
//
// Tier 6 (2026-04-28): render a SINGLE page of a PDF to a JPEG/PNG
// via PDFium. Used by PageEditorTool for the visual-editor canvas
// and for on-demand page navigation.
//
// Why a separate op from rasterize.ts: rasterize.ts loops over every
// page (for PDF→JPG / PDF→PNG / Extract Images). PageEditorTool only
// ever needs ONE page rendered at a time, and re-renders cheaply on
// navigation. Loading the whole rasterize machinery + iterating
// through pages wastes a 100-page doc&rsquo;s worth of work when we only
// need page N.

"use client";

import { withPdfDocument } from "../library";

export type RasterFormat = "jpeg" | "png";

export interface RenderPageOptions {
  /** 0-based page index. */
  pageIndex: number;
  format: RasterFormat;
  /** Render scale relative to the PDF's natural size (1pt = 1px at scale=1). */
  scale: number;
  /** Optional JPEG quality 0–1. Ignored for PNG. Default 0.9. */
  quality?: number;
}

export interface RenderedPage {
  /** Encoded image bytes (JPEG or PNG). */
  bytes: Uint8Array;
  /** Pixel width / height of the rendered image. */
  width: number;
  height: number;
}

/**
 * Render exactly one page of the PDF. Caller picks the page index
 * and scale.
 */
export async function renderPdfPage(
  bytes: Uint8Array,
  options: RenderPageOptions,
): Promise<RenderedPage> {
  const { pageIndex, format, scale, quality = 0.9 } = options;
  return withPdfDocument(bytes, async (doc) => {
    const pageCount = doc.getPageCount();
    if (pageIndex < 0 || pageIndex >= pageCount) {
      throw new Error(
        `Page index ${pageIndex + 1} is outside 1-${pageCount}.`,
      );
    }
    const page = doc.getPage(pageIndex);
    const rendered = await page.render({
      scale,
      render: makeBrowserRenderCallback(format, quality),
    });
    return {
      bytes: rendered.data,
      width: rendered.width,
      height: rendered.height,
    };
  });
}

/**
 * Browser canvas-backed render callback. Same approach as in
 * rasterize.ts — PDFium hands us raw RGBA pixels (actually BGRA);
 * we paint to a canvas, swap channels, and read back as the
 * requested encoded format.
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
    const rgba = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      rgba[i] = data[i + 2];
      rgba[i + 1] = data[i + 1];
      rgba[i + 2] = data[i];
      rgba[i + 3] = data[i + 3];
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
