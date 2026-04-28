// lib/pdf/ops/free-draw.ts
//
// Tier 6 (2026-04-28): pen-tool drawing on a PDF page. Each stroke is
// a sequence of points captured from pointer events. We render each
// stroke as a series of consecutive line segments via pdf-lib&rsquo;s
// drawLine. Simpler than drawSvgPath (no SVG y-axis convention to
// reason about) and gives us direct control over coordinates.
//
// Coordinates arrive in PDF user-space points (y-up) — the runner
// handles the image-pixel ↔ PDF-point conversion before calling here.

import { PDFDocument, rgb, LineCapStyle } from "pdf-lib";

export interface StrokePoint {
  /** X in PDF user-space points. */
  x: number;
  /** Y in PDF user-space points (origin bottom-left). */
  y: number;
}

export interface Stroke {
  points: StrokePoint[];
  /** Hex color. Default "#000000". */
  color?: string;
  /** Stroke width in PDF points. Default 2. */
  width?: number;
}

export interface FreeDrawOptions {
  strokes: Stroke[];
  /** 0-based page index. Default 0 (page 1). */
  pageIndex?: number;
}

export interface FreeDrawResult {
  bytes: Uint8Array;
  pageCount: number;
  strokeCount: number;
  /** Total line segments drawn (sum of (stroke.points.length - 1) across strokes). */
  segmentCount: number;
}

export async function freeDrawPdf(
  bytes: Uint8Array,
  opts: FreeDrawOptions,
): Promise<FreeDrawResult> {
  if (opts.strokes.length === 0) {
    throw new Error("Draw at least one stroke first.");
  }
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const pages = doc.getPages();
  if (pages.length === 0) throw new Error("This PDF has no pages.");
  const idx = opts.pageIndex ?? 0;
  if (idx < 0 || idx >= pages.length) {
    throw new Error(`Page ${idx + 1} is outside 1-${pages.length}.`);
  }
  const page = pages[idx];

  let strokeCount = 0;
  let segmentCount = 0;
  for (const stroke of opts.strokes) {
    if (stroke.points.length < 2) continue;
    const color = parseHex(stroke.color ?? "#000000");
    const thickness = stroke.width ?? 2;
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1];
      const b = stroke.points[i];
      page.drawLine({
        start: { x: a.x, y: a.y },
        end: { x: b.x, y: b.y },
        thickness,
        color,
        // Default lineCap is BUTT — strokes look segmented at corners.
        // ROUND gives a continuous appearance for hand-drawn lines.
        lineCap: LineCapStyle.Round,
      });
      segmentCount++;
    }
    strokeCount++;
  }
  if (strokeCount === 0) {
    throw new Error("All strokes had fewer than 2 points.");
  }

  const out = await doc.save({ useObjectStreams: true });
  return {
    bytes: out,
    pageCount: pages.length,
    strokeCount,
    segmentCount,
  };
}

function parseHex(hex: string): ReturnType<typeof rgb> {
  const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return rgb(0, 0, 0);
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}
