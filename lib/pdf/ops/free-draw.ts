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
//
// 2026-04-28 (smoothing v2): each stroke&rsquo;s point list is run through
// smoothStroke() before drawLine — quadratic-Bézier-through-midpoints
// samples produce smooth curves instead of jagged polylines on long
// or fast strokes. Subdivision factor of 6 samples per source-segment
// is enough for visual smoothness without bloating output PDF size.

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
    // Subdivide via Bézier-through-midpoints for smooth curves.
    // Strokes with 2 points stay as a single line segment.
    const smoothed = smoothStroke(stroke.points);
    for (let i = 1; i < smoothed.length; i++) {
      const a = smoothed[i - 1];
      const b = smoothed[i];
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

/**
 * Smooth a stroke by sampling along quadratic Bézier curves whose
 * control points are the original sample points and whose endpoints
 * are midpoints of consecutive sample pairs. The first and last
 * source points are kept as-is so strokes start and end at the user&rsquo;s
 * actual click positions.
 *
 * Algorithm (the "smoothed polyline through midpoints" trick):
 *   For input points P0, P1, P2, ..., P(n-1) where n >= 3:
 *     - Output starts with P0
 *     - For each i in [1, n-2]:
 *         M_prev = (P_{i-1} + P_i) / 2
 *         M_next = (P_i + P_{i+1}) / 2
 *         Sample SUBDIV+1 points along the Bézier from M_prev to M_next
 *         with control point P_i: B(t) = (1-t)²M_prev + 2(1-t)t·P_i + t²M_next
 *     - Output ends with P(n-1)
 *
 * Each consecutive Bézier piece joins smoothly because they share
 * midpoint endpoints. Net effect: the polyline looks continuous and
 * curved, with no kinks at the original sample points.
 */
const SUBDIV = 6;
function smoothStroke(points: StrokePoint[]): StrokePoint[] {
  if (points.length < 3) return points.slice();
  const out: StrokePoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const mPrev = { x: (prev.x + cur.x) / 2, y: (prev.y + cur.y) / 2 };
    const mNext = { x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2 };
    // Sample SUBDIV+1 points along the quadratic Bézier (skip t=0
    // because it equals mPrev which we already added — except on the
    // first iteration where we want to connect from P0 cleanly).
    const startT = i === 1 ? 0 : 1 / SUBDIV;
    for (let j = 0; j <= SUBDIV; j++) {
      const t = j / SUBDIV;
      if (t < startT - 1e-9) continue;
      const omt = 1 - t;
      const x = omt * omt * mPrev.x + 2 * omt * t * cur.x + t * t * mNext.x;
      const y = omt * omt * mPrev.y + 2 * omt * t * cur.y + t * t * mNext.y;
      out.push({ x, y });
    }
  }
  out.push(points[points.length - 1]);
  return out;
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
