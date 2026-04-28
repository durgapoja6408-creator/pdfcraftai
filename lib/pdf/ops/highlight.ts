// lib/pdf/ops/highlight.ts
//
// Tier 6 (2026-04-28): draw translucent highlight rectangles on a
// specific page via pdf-lib&rsquo;s drawRectangle. v1 is single-page —
// highlights apply to one user-chosen page (default: page 1). Multi-
// page highlighting requires page navigation in the runner UI, which
// is a v2 enhancement.

import { PDFDocument, rgb } from "pdf-lib";

export interface HighlightRect {
  /** X position in PDF user-space points (origin bottom-left). */
  x: number;
  /** Y position in PDF user-space points (origin bottom-left). */
  y: number;
  /** Width of rectangle in PDF points. */
  width: number;
  /** Height of rectangle in PDF points. */
  height: number;
}

export interface HighlightOptions {
  rects: HighlightRect[];
  /** Hex color. Default "#FFFF00" (yellow). */
  color?: string;
  /** 0–1. Default 0.4. */
  opacity?: number;
  /** 0-based page index to highlight. Default 0 (page 1). */
  pageIndex?: number;
}

export interface HighlightResult {
  bytes: Uint8Array;
  pageCount: number;
  highlightedRectCount: number;
}

export async function highlightPdf(
  bytes: Uint8Array,
  opts: HighlightOptions,
): Promise<HighlightResult> {
  if (opts.rects.length === 0) {
    throw new Error("Draw at least one highlight rectangle first.");
  }
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const pages = doc.getPages();
  if (pages.length === 0) throw new Error("This PDF has no pages.");
  const idx = opts.pageIndex ?? 0;
  if (idx < 0 || idx >= pages.length) {
    throw new Error(
      `Page index ${idx + 1} is outside 1-${pages.length}.`,
    );
  }
  const page = pages[idx];
  const color = parseHex(opts.color ?? "#FFFF00");
  const opacity = Math.max(0, Math.min(1, opts.opacity ?? 0.4));

  for (const r of opts.rects) {
    if (r.width <= 0 || r.height <= 0) continue;
    page.drawRectangle({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      color,
      opacity,
      // No border — keeps the highlight visually clean.
      borderWidth: 0,
    });
  }

  const out = await doc.save({ useObjectStreams: true });
  return {
    bytes: out,
    pageCount: pages.length,
    highlightedRectCount: opts.rects.filter((r) => r.width > 0 && r.height > 0).length,
  };
}

function parseHex(hex: string): ReturnType<typeof rgb> {
  const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return rgb(1, 1, 0); // fallback yellow
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}
