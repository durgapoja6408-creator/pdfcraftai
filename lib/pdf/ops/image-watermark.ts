// lib/pdf/ops/image-watermark.ts
//
// Tier 5 (2026-04-28): image watermark / logo overlay. Embeds a
// PNG or JPEG into the document and draws it on every page.
//
// v1 was config-only (position preset + opacity + scale).
// v2 (2026-04-28): adds optional `customPositionPt` for visual
// click-to-place — when set, overrides the `position` preset and
// stamps at the same (x, y) on every page (in PDF points,
// bottom-left origin). Doc-wide semantics preserved: the watermark
// still goes on every page; only the placement coordinate changes.

import { PDFDocument } from "pdf-lib";

export type ImagePosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface ImageWatermarkOptions {
  /** Image bytes — PNG or JPEG. */
  imageBytes: Uint8Array;
  /** Mime type — used to pick embedPng vs embedJpg. */
  imageMime: "image/png" | "image/jpeg";
  position: ImagePosition;
  /** 0–1. Default 0.5. */
  opacity?: number;
  /**
   * Image width as a fraction of page width. Default 0.25 (25%).
   * Height scales proportionally to preserve aspect ratio.
   */
  widthScale?: number;
  /** Margin from page edge in PDF points. Default 28 (~0.4 inch). */
  margin?: number;
  /**
   * Optional custom position in PDF points (bottom-left origin).
   * When provided, overrides `position` preset. The watermark's
   * BOTTOM-LEFT corner anchors at (x, y). Used by the visual
   * click-to-place editor — the click point in pixel coords gets
   * converted via the page's renderScale before being passed in.
   * Output is clamped to keep the image fully on-page.
   */
  customPositionPt?: { x: number; y: number };
}

export interface ImageWatermarkResult {
  bytes: Uint8Array;
  pageCount: number;
}

export async function imageWatermarkPdf(
  bytes: Uint8Array,
  opts: ImageWatermarkOptions,
): Promise<ImageWatermarkResult> {
  if (!opts.imageBytes || opts.imageBytes.length === 0) {
    throw new Error("Pick an image to use as the watermark.");
  }
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const pageCount = doc.getPageCount();
  if (pageCount === 0) throw new Error("This PDF has no pages.");

  const opacity = Math.max(0, Math.min(1, opts.opacity ?? 0.5));
  const widthScale = Math.max(0.05, Math.min(1, opts.widthScale ?? 0.25));
  const margin = opts.margin ?? 28;

  // Embed the image once; pdf-lib reuses the embedded resource across
  // every drawImage call, so output stays compact.
  const img =
    opts.imageMime === "image/jpeg"
      ? await doc.embedJpg(opts.imageBytes)
      : await doc.embedPng(opts.imageBytes);

  for (const page of doc.getPages()) {
    const { width: pw, height: ph } = page.getSize();
    const drawW = pw * widthScale;
    const drawH = drawW * (img.height / img.width);

    let x = 0;
    let y = 0;
    if (opts.customPositionPt) {
      // Custom (x, y) anchors the BOTTOM-LEFT corner. Clamp so the
      // image stays on-page even if the click was near an edge.
      x = Math.max(0, Math.min(pw - drawW, opts.customPositionPt.x));
      y = Math.max(0, Math.min(ph - drawH, opts.customPositionPt.y));
    } else {
      if (opts.position.endsWith("-left")) x = margin;
      else if (opts.position.endsWith("-right")) x = pw - drawW - margin;
      else x = (pw - drawW) / 2;

      if (opts.position.startsWith("top-")) y = ph - drawH - margin;
      else if (opts.position.startsWith("bottom-")) y = margin;
      else y = (ph - drawH) / 2;
    }

    page.drawImage(img, { x, y, width: drawW, height: drawH, opacity });
  }

  const out = await doc.save({ useObjectStreams: true });
  return { bytes: out, pageCount };
}
