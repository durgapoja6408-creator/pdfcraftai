// lib/pdf/ops/diff.ts
//
// 2026-05-01 Tier 3 (final wedge): visual pixel-level diff between
// two PDFs. Both documents are rendered page-by-page via PDFium at
// matching scale, then we compute per-pixel RGBA distance and
// highlight differences in red on a grayscale base.
//
// Output PDF layout (one output page per source page, max(A.pages,
// B.pages) total):
//   - Each page = the diff visualization for that page index
//   - Pages where one side has no content (mismatched lengths) are
//     marked "Only in A" or "Only in B" with that side rendered alone
//
// Stats returned: per-page diff percentage (0–100), page count
// totals, mismatch count.
//
// Why not side-by-side: it doubles output page width and requires
// landscape paper everywhere. Overlay-with-highlight reads more
// like a UI diff tool — the user sees WHERE differences are, not
// just THAT they exist.
//
// Threshold: pixels are flagged "different" when the max channel
// delta exceeds DEFAULT_THRESHOLD (16 / 255). Tunable via options.
// Below threshold = identical for human-eye purposes.

"use client";

import { PDFDocument } from "pdf-lib";
import { withPdfDocument } from "../library";

export interface DiffOptions {
  /** Render scale relative to source page size. Default 1.5. */
  scale?: number;
  /** Pixel-channel delta threshold (0–255). Default 16. */
  threshold?: number;
  /** JPEG quality 0–1 for the diff image. Default 0.85. */
  quality?: number;
}

export interface DiffPageStat {
  /** 1-based page number. */
  pageNumber: number;
  /** % of pixels above threshold (0–100). */
  diffPercent: number;
  /** Source: "both" / "a-only" / "b-only" — which side has content. */
  source: "both" | "a-only" | "b-only";
}

export interface DiffResult {
  bytes: Uint8Array;
  /** Total output page count = max(a.pages, b.pages). */
  pageCount: number;
  /** Pages with diffPercent > 0 (count of pages with any difference). */
  changedPageCount: number;
  /** Per-page stats. */
  stats: DiffPageStat[];
  /** A's page count. */
  aPageCount: number;
  /** B's page count. */
  bPageCount: number;
}

interface RenderedPage {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

// Render a single PDF page to RGBA pixels via PDFium. Accepts the
// page object yielded by withPdfDocument's callback context.
async function renderToRgba(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  scale: number,
): Promise<RenderedPage> {
  // The render() callback needs to return Uint8Array. We capture the
  // BGRA → RGBA swapped pixels in a closure variable and return the
  // raw RGBA as Uint8Array, but we ALSO want the typed array for
  // pixel comparison. We keep a reference via the closure.
  let captured: Uint8ClampedArray | null = null;
  let outWidth = 0;
  let outHeight = 0;
  await page.render({
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
      const rgba = new Uint8ClampedArray(data.length);
      for (let i = 0; i < data.length; i += 4) {
        rgba[i] = data[i + 2];
        rgba[i + 1] = data[i + 1];
        rgba[i + 2] = data[i];
        rgba[i + 3] = data[i + 3];
      }
      captured = rgba;
      outWidth = width;
      outHeight = height;
      // The render contract requires returning encoded bytes; we
      // return a stub PNG since we don't actually use the encoded
      // form — we use the raw pixels via the closure capture.
      // Returning empty Uint8Array signals "we already have what
      // we need."
      return new Uint8Array();
    },
  });
  if (!captured) throw new Error("page render produced no pixels");
  return { rgba: captured, width: outWidth, height: outHeight };
}

/**
 * Compute per-pixel diff and produce a JPEG-encoded diff visualization.
 * Output: grayscale base (so the original content is visible but
 * de-emphasized) with red highlighting on pixels that differ.
 */
async function computeDiffImage(
  a: RenderedPage | null,
  b: RenderedPage | null,
  threshold: number,
  quality: number,
): Promise<{ jpgBytes: Uint8Array; diffPercent: number; width: number; height: number }> {
  // Pick the dimensions: prefer A's, fall back to B's. (If both
  // exist with mismatched dimensions, we resize is too much for an
  // MVP — pad the smaller to the larger.)
  const w = a?.width ?? b?.width ?? 0;
  const h = a?.height ?? b?.height ?? 0;
  if (w === 0 || h === 0) throw new Error("page has zero dimensions");

  const out = new Uint8ClampedArray(w * h * 4);
  let differentPixels = 0;
  const totalPixels = w * h;

  if (a && b && a.width === b.width && a.height === b.height) {
    // Both sides present + same dimensions: per-pixel compare.
    const pa = a.rgba;
    const pb = b.rgba;
    for (let i = 0; i < pa.length; i += 4) {
      const dr = Math.abs(pa[i] - pb[i]);
      const dg = Math.abs(pa[i + 1] - pb[i + 1]);
      const db = Math.abs(pa[i + 2] - pb[i + 2]);
      const maxDelta = Math.max(dr, dg, db);
      if (maxDelta > threshold) {
        // Different — bright red overlay on grayscale base.
        const lum = Math.round(0.2126 * pa[i] + 0.7152 * pa[i + 1] + 0.0722 * pa[i + 2]);
        // Mix red highlight (255,0,0) at 60% over grayscale base.
        out[i] = 255;
        out[i + 1] = Math.round(lum * 0.4);
        out[i + 2] = Math.round(lum * 0.4);
        out[i + 3] = 255;
        differentPixels += 1;
      } else {
        // Same — grayscale base.
        const lum = Math.round(0.2126 * pa[i] + 0.7152 * pa[i + 1] + 0.0722 * pa[i + 2]);
        out[i] = lum;
        out[i + 1] = lum;
        out[i + 2] = lum;
        out[i + 3] = 255;
      }
    }
  } else if (a && !b) {
    // Only A: render grayscale + tint blue at 30%.
    const pa = a.rgba;
    for (let i = 0; i < pa.length; i += 4) {
      const lum = Math.round(0.2126 * pa[i] + 0.7152 * pa[i + 1] + 0.0722 * pa[i + 2]);
      out[i] = Math.round(lum * 0.6);
      out[i + 1] = Math.round(lum * 0.6);
      out[i + 2] = 255;
      out[i + 3] = 255;
    }
    differentPixels = totalPixels;
  } else if (b && !a) {
    // Only B: render grayscale + tint green.
    const pb = b.rgba;
    for (let i = 0; i < pb.length; i += 4) {
      const lum = Math.round(0.2126 * pb[i] + 0.7152 * pb[i + 1] + 0.0722 * pb[i + 2]);
      out[i] = Math.round(lum * 0.6);
      out[i + 1] = 255;
      out[i + 2] = Math.round(lum * 0.6);
      out[i + 3] = 255;
    }
    differentPixels = totalPixels;
  } else {
    // Mismatched dimensions with both sides present — fill with
    // checkerboard to signal "couldn't compare." Rare.
    for (let i = 0; i < out.length; i += 4) {
      const checker = ((i / 4) % 20 < 10) !== (Math.floor(i / 4 / w) % 20 < 10);
      out[i] = checker ? 200 : 240;
      out[i + 1] = checker ? 200 : 240;
      out[i + 2] = checker ? 200 : 240;
      out[i + 3] = 255;
    }
    differentPixels = totalPixels;
  }

  // Encode to JPEG via canvas.
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2D context unavailable");
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
  const blob: Blob | null = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
  if (!blob) throw new Error("canvas.toBlob returned null");
  const jpgBytes = new Uint8Array(await blob.arrayBuffer());
  const diffPercent = (differentPixels / totalPixels) * 100;
  return { jpgBytes, diffPercent, width: w, height: h };
}

export async function diffPdfs(
  aBytes: Uint8Array,
  bBytes: Uint8Array,
  opts: DiffOptions = {},
): Promise<DiffResult> {
  const scale = opts.scale ?? 1.5;
  const threshold = opts.threshold ?? 16;
  const quality = opts.quality ?? 0.85;

  // Render every page of both documents up front; we need them all
  // for the comparison loop.
  let aPages: RenderedPage[] = [];
  let bPages: RenderedPage[] = [];
  let aPageCount = 0;
  let bPageCount = 0;

  await withPdfDocument(aBytes, async (doc) => {
    aPageCount = doc.getPageCount();
    if (aPageCount === 0) throw new Error("PDF A has no pages.");
    for (let i = 0; i < aPageCount; i++) {
      const p = doc.getPage(i);
      aPages.push(await renderToRgba(p, scale));
      await new Promise((r) => setTimeout(r, 0));
    }
  });
  await withPdfDocument(bBytes, async (doc) => {
    bPageCount = doc.getPageCount();
    if (bPageCount === 0) throw new Error("PDF B has no pages.");
    for (let i = 0; i < bPageCount; i++) {
      const p = doc.getPage(i);
      bPages.push(await renderToRgba(p, scale));
      await new Promise((r) => setTimeout(r, 0));
    }
  });

  const totalPages = Math.max(aPageCount, bPageCount);
  const stats: DiffPageStat[] = [];
  let changedPageCount = 0;

  // Assemble output PDF — one image-page per index.
  const out = await PDFDocument.create();
  for (let i = 0; i < totalPages; i++) {
    const aPage = i < aPageCount ? aPages[i] : null;
    const bPage = i < bPageCount ? bPages[i] : null;
    const source: DiffPageStat["source"] =
      aPage && bPage ? "both" : aPage ? "a-only" : "b-only";
    const { jpgBytes, diffPercent, width, height } = await computeDiffImage(
      aPage,
      bPage,
      threshold,
      quality,
    );
    if (diffPercent > 0) changedPageCount += 1;
    stats.push({
      pageNumber: i + 1,
      diffPercent: Math.round(diffPercent * 100) / 100,
      source,
    });
    const jpg = await out.embedJpg(jpgBytes);
    // Output page sized to original (back-calculate from rendered).
    const outW = width / scale;
    const outH = height / scale;
    const page = out.addPage([outW, outH]);
    page.drawImage(jpg, { x: 0, y: 0, width: outW, height: outH });
  }
  // Drop pixel-buffer references for GC. The output PDF embeds the
  // JPEG bytes via embedJpg above; we no longer need the raw RGBA.
  aPages = [];
  bPages = [];

  const outBytes = await out.save({ useObjectStreams: false });
  return {
    bytes: outBytes,
    pageCount: totalPages,
    changedPageCount,
    stats,
    aPageCount,
    bPageCount,
  };
}
