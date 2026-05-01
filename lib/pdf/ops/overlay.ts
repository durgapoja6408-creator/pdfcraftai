// lib/pdf/ops/overlay.ts
//
// 2026-05-01 Tier 2: stamp one PDF on top of every page of another.
// Common use: applying letterhead, custom watermarks, header/footer
// templates, or any pre-designed PDF asset onto an arbitrary
// document.
//
// Distinct from stamp-pdf (which draws a TEXT overlay) and from
// image-watermark (which draws a single bitmap). pdf-overlay carries
// the full vector content of the overlay PDF — typography,
// signatures, decorative elements, anything that lives in the
// overlay file's first page.
//
// Behavior model:
//  - Use the FIRST page of the overlay PDF as the stamp template
//    (multi-page overlays are reasonable but add UX complexity;
//    pick a sane default).
//  - "behind" mode draws the overlay BEFORE the original content
//    (useful for letterhead — original text stays on top).
//  - "front" mode draws the overlay AFTER the original content
//    (useful for watermarks — overlay is the visible top layer).
//  - Scaling: by default overlay scales to fit the destination page
//    while preserving aspect ratio; if "stretch" is enabled, fills
//    the destination edge-to-edge (distorts aspect ratio but matches
//    every page exactly — useful when the overlay was designed for
//    the same paper size).

import { PDFDocument } from "pdf-lib";

export type OverlayLayer = "front" | "behind";
export type OverlayFit = "fit" | "stretch";

export interface OverlayOptions {
  /** "behind" stamps before original content (letterhead);
   *  "front" stamps after (watermark). Default "front". */
  layer?: OverlayLayer;
  /** "fit" preserves aspect ratio; "stretch" matches dest dimensions
   *  exactly. Default "fit". */
  fit?: OverlayFit;
  /** Opacity 0–1. Default 1.0 (fully opaque). */
  opacity?: number;
  /** Apply only to specific 1-based page numbers. Empty = every page. */
  applyToPages?: number[];
}

export interface OverlayResult {
  bytes: Uint8Array;
  pageCount: number;
  /** Number of pages the overlay was actually applied to. */
  appliedCount: number;
}

/**
 * Stamp the FIRST page of `overlayBytes` onto pages of `baseBytes`.
 * Returns a fresh PDF with the overlay applied.
 *
 * pdf-lib's drawPage takes an embedded page and renders it at a
 * specified position with optional opacity. We embed the overlay
 * once and re-use the same embedded ref for every target page.
 */
export async function overlayPdf(
  baseBytes: Uint8Array,
  overlayBytes: Uint8Array,
  opts: OverlayOptions = {},
): Promise<OverlayResult> {
  const layer = opts.layer ?? "front";
  const fit = opts.fit ?? "fit";
  const opacity = Math.max(0, Math.min(1, opts.opacity ?? 1));
  const applyTo = opts.applyToPages;

  const base = await PDFDocument.load(baseBytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const overlay = await PDFDocument.load(overlayBytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const baseCount = base.getPageCount();
  if (baseCount === 0) throw new Error("Base PDF has no pages.");
  if (overlay.getPageCount() === 0) {
    throw new Error("Overlay PDF has no pages.");
  }

  // For "behind" mode we need to rebuild the document: copy each
  // base page, draw the overlay first, THEN draw the base page's
  // original content. pdf-lib doesn't expose direct "stack-below"
  // page composition, so we use a fresh document and embed both.
  //
  // For "front" mode the simpler path is to draw the overlay
  // directly onto each base page in place (overlay sits on top of
  // existing content because it's drawn after).

  if (layer === "front") {
    // Embed overlay into the BASE document so drawPage can reference it.
    const [embeddedOverlay] = await base.embedPdf(overlay, [0]);
    const overlayDims = embeddedOverlay.size();
    const pages = base.getPages();
    let applied = 0;
    for (let i = 0; i < pages.length; i++) {
      const pageNumber1Based = i + 1;
      if (applyTo && applyTo.length > 0 && !applyTo.includes(pageNumber1Based)) {
        continue;
      }
      const page = pages[i];
      const { width: dw, height: dh } = page.getSize();
      let drawW: number;
      let drawH: number;
      let x: number;
      let y: number;
      if (fit === "stretch") {
        drawW = dw;
        drawH = dh;
        x = 0;
        y = 0;
      } else {
        const scale = Math.min(dw / overlayDims.width, dh / overlayDims.height);
        drawW = overlayDims.width * scale;
        drawH = overlayDims.height * scale;
        x = (dw - drawW) / 2;
        y = (dh - drawH) / 2;
      }
      page.drawPage(embeddedOverlay, {
        x,
        y,
        width: drawW,
        height: drawH,
        opacity,
      });
      applied += 1;
    }
    const out = await base.save({ useObjectStreams: false });
    return { bytes: out, pageCount: baseCount, appliedCount: applied };
  }

  // "behind" mode — fresh document, embed both, draw overlay first.
  const fresh = await PDFDocument.create();
  const [embeddedOverlay] = await fresh.embedPdf(overlay, [0]);
  const baseIndices: number[] = [];
  for (let i = 0; i < baseCount; i++) baseIndices.push(i);
  const embeddedBasePages = await fresh.embedPdf(base, baseIndices);
  const overlayDims = embeddedOverlay.size();

  let applied = 0;
  for (let i = 0; i < baseCount; i++) {
    const baseEmb = embeddedBasePages[i];
    const baseDims = baseEmb.size();
    const newPage = fresh.addPage([baseDims.width, baseDims.height]);
    const pageNumber1Based = i + 1;
    const shouldApply =
      !applyTo || applyTo.length === 0 || applyTo.includes(pageNumber1Based);

    if (shouldApply) {
      let drawW: number;
      let drawH: number;
      let x: number;
      let y: number;
      if (fit === "stretch") {
        drawW = baseDims.width;
        drawH = baseDims.height;
        x = 0;
        y = 0;
      } else {
        const scale = Math.min(
          baseDims.width / overlayDims.width,
          baseDims.height / overlayDims.height,
        );
        drawW = overlayDims.width * scale;
        drawH = overlayDims.height * scale;
        x = (baseDims.width - drawW) / 2;
        y = (baseDims.height - drawH) / 2;
      }
      newPage.drawPage(embeddedOverlay, {
        x,
        y,
        width: drawW,
        height: drawH,
        opacity,
      });
      applied += 1;
    }
    // Original base content on top.
    newPage.drawPage(baseEmb, {
      x: 0,
      y: 0,
      width: baseDims.width,
      height: baseDims.height,
    });
  }

  const out = await fresh.save({ useObjectStreams: false });
  return { bytes: out, pageCount: baseCount, appliedCount: applied };
}
