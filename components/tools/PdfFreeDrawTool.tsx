"use client";

// components/tools/PdfFreeDrawTool.tsx
//
// Tier 6 (2026-04-28): sixth visual editor on PageEditorTool. Pen
// tool over the page render — pointer down/move/up captures stroke
// points, rendered live as SVG polylines, applied via pdf-lib drawLine
// segments.
//
// State shape: array of complete strokes (each is a list of points
// in image-pixel coords plus color/width). The current in-progress
// stroke lives in component-local useState since it's transient and
// would create unnecessary re-renders if pushed through PageEditorTool's
// state on every pointer-move event.

import { useRef, useState } from "react";
import {
  PageEditorTool,
  type PageEditorEditorProps,
  type PageEditorConfigProps,
  type PageEditorResult,
} from "./PageEditorTool";

interface PixelPoint {
  x: number;
  y: number;
}

interface PixelStroke {
  points: PixelPoint[];
  color: string;
  width: number;
}

interface FreeDrawState {
  strokes: PixelStroke[];
  /** Current pen color. */
  color: string;
  /** Current pen width in screen pixels (will scale to PDF points at apply). */
  width: number;
}

const INITIAL_STATE: FreeDrawState = {
  strokes: [],
  color: "#000000",
  width: 3,
};

const COLOR_SWATCHES: Array<{ value: string; label: string }> = [
  { value: "#000000", label: "Black" },
  { value: "#1d4ed8", label: "Blue" },
  { value: "#dc2626", label: "Red" },
  { value: "#16a34a", label: "Green" },
];

export function PdfFreeDrawTool() {
  return (
    <PageEditorTool<FreeDrawState>
      toolId="free-draw-pdf"
      toolGroup="Edit"
      dropPrompt="Drop a PDF to draw on"
      busyLabel="Saving drawing…"
      successCta="Draw on another PDF"
      errorCode="free_draw_failed"
      initialState={INITIAL_STATE}
      disabledReason={(state) => {
        const real = state.strokes.filter((s) => s.points.length >= 2);
        if (real.length === 0) return "Draw at least one stroke";
        return null;
      }}
      applyLabel={(state) => {
        const real = state.strokes.filter((s) => s.points.length >= 2);
        return `Save ${real.length} stroke${real.length === 1 ? "" : "s"}`;
      }}
      apply={async (bytes, file, state, render) => {
        const real = state.strokes.filter((s) => s.points.length >= 2);
        if (real.length === 0) {
          throw new Error("No valid strokes to apply.");
        }
        // Convert each point from image-pixel coords (top-left origin,
        // y-down) to PDF user-space points (bottom-left origin, y-up).
        // Stroke width also converts via render scale.
        const strokes = real.map((s) => ({
          color: s.color,
          width: s.width / render.renderScale,
          points: s.points.map((p) => ({
            x: p.x / render.renderScale,
            y: (render.pxHeight - p.y) / render.renderScale,
          })),
        }));
        const { freeDrawPdf } = await import("@/lib/pdf/ops/free-draw");
        const r = await freeDrawPdf(bytes, { strokes, pageIndex: render.pageIndex });
        const baseName = file.name.replace(/\.pdf$/i, "");
        const result: PageEditorResult = {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-drawing.pdf`,
          successHeadline: `Drew ${r.strokeCount} stroke${r.strokeCount === 1 ? "" : "s"} on page ${render.pageIndex + 1}`,
          successDetail: `${r.segmentCount} line segments · ${formatSize(r.bytes.length)}`,
        };
        return result;
      }}
      configPanel={FreeDrawConfigPanel}
      editor={FreeDrawEditorOverlay}
    />
  );
}

function FreeDrawConfigPanel({
  state,
  setState,
  busy,
}: PageEditorConfigProps<FreeDrawState>) {
  const realStrokes = state.strokes.filter((s) => s.points.length >= 2);
  const totalPoints = realStrokes.reduce((sum, s) => sum + s.points.length, 0);

  const undo = () => {
    setState((s) => ({ ...s, strokes: s.strokes.slice(0, -1) }));
  };
  const clear = () => {
    setState((s) => ({ ...s, strokes: [] }));
  };

  return (
    <div
      className="card"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <div style={{ fontSize: 13 }}>
          {realStrokes.length === 0
            ? "Click and drag to draw freehand. Lift the pen to start a new stroke."
            : `${realStrokes.length} stroke${realStrokes.length === 1 ? "" : "s"} · ${totalPoints} points`}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={undo}
            disabled={busy || state.strokes.length === 0}
          >
            Undo
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={clear}
            disabled={busy || state.strokes.length === 0}
          >
            Clear all
          </button>
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 500 }}>Pen color</div>
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        {COLOR_SWATCHES.map((sw) => (
          <button
            key={sw.value}
            type="button"
            onClick={() => setState((s) => ({ ...s, color: sw.value }))}
            disabled={busy}
            aria-label={sw.label}
            aria-pressed={state.color === sw.value}
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              border:
                state.color === sw.value
                  ? "2px solid var(--accent)"
                  : "1px solid var(--border)",
              background: sw.value,
              cursor: busy ? "default" : "pointer",
              padding: 0,
            }}
          />
        ))}
        <input
          type="color"
          value={state.color}
          onChange={(e) => setState((s) => ({ ...s, color: e.target.value }))}
          disabled={busy}
          style={{
            width: 36,
            height: 36,
            padding: 0,
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "var(--bg-1)",
          }}
          title="Custom color"
          aria-label="Custom pen color"
        />
      </div>

      <label
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
      >
        <span>Width</span>
        <input
          type="range"
          min={1}
          max={20}
          value={state.width}
          onChange={(e) =>
            setState((s) => ({ ...s, width: Number(e.target.value) }))
          }
          disabled={busy}
          style={{ width: 140 }}
        />
        <span
          className="subtle"
          style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", minWidth: 36 }}
        >
          {state.width}px
        </span>
      </label>
    </div>
  );
}

function FreeDrawEditorOverlay({
  pageRender,
  state,
  setState,
  busy,
}: PageEditorEditorProps<FreeDrawState>) {
  const [drawing, setDrawing] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  // Track the last point so we can throttle samples that are too close
  // (high-frequency pointer events produce hundreds of points along a
  // short stroke and bloat the path output).
  const lastPointRef = useRef<PixelPoint | null>(null);

  const pointerToPx = (e: React.PointerEvent): PixelPoint => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;
    return {
      x: Math.max(0, Math.min((xCss / rect.width) * pageRender.pxWidth, pageRender.pxWidth)),
      y: Math.max(0, Math.min((yCss / rect.height) * pageRender.pxHeight, pageRender.pxHeight)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy) return;
    const p = pointerToPx(e);
    setDrawing(true);
    lastPointRef.current = p;
    // Start a new stroke with the first point. Subsequent points are
    // appended to this same stroke until pointer up.
    setState((s) => ({
      ...s,
      strokes: [
        ...s.strokes,
        { points: [p], color: s.color, width: s.width },
      ],
    }));
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const p = pointerToPx(e);
    // Throttle: only record points that are at least 2 px from the
    // last recorded point. Keeps stroke arrays small enough that the
    // output PDF stays compact for short hand-drawn marks.
    const last = lastPointRef.current;
    if (last) {
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (dx * dx + dy * dy < 4) return; // < 2 px since last sample
    }
    lastPointRef.current = p;
    setState((s) => {
      if (s.strokes.length === 0) return s;
      const next = s.strokes.slice();
      const lastStroke = next[next.length - 1];
      next[next.length - 1] = {
        ...lastStroke,
        points: [...lastStroke.points, p],
      };
      return { ...s, strokes: next };
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawing) return;
    setDrawing(false);
    lastPointRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    // Drop strokes with fewer than 2 points (stray clicks).
    setState((s) => {
      if (s.strokes.length === 0) return s;
      const last = s.strokes[s.strokes.length - 1];
      if (last.points.length < 2) {
        return { ...s, strokes: s.strokes.slice(0, -1) };
      }
      return s;
    });
  };

  return (
    <div
      ref={overlayRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${pageRender.pxWidth} / ${pageRender.pxHeight}`,
        cursor: busy ? "default" : "crosshair",
        background: "var(--bg-2)",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--border)",
        touchAction: "none",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pageRender.url}
        alt="Page 1 preview"
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${pageRender.pxWidth} ${pageRender.pxHeight}`}
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        {state.strokes.map((stroke, i) => {
          if (stroke.points.length < 1) return null;
          // Build a smooth-curve path (M + Q-through-midpoints) so the
          // live preview matches what the saved PDF will produce. SVG's
          // native quadratic-Bezier renderer handles the smoothing on
          // the browser side; we only need to emit the path string.
          const d = buildSmoothPath(stroke.points);
          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Build a smooth SVG path string for a stroke using the
 * "quadratic-Bézier-through-midpoints" approach. Mirrors the same
 * smoothing math used in lib/pdf/ops/free-draw.ts so the live preview
 * matches the saved PDF exactly.
 *
 * For points P0, P1, P2, ..., P(n-1) where n >= 3:
 *   M01 M12 M23 ... = midpoints of consecutive pairs
 *   path = "M P0 L M01 Q P1 M12 Q P2 M23 ... Q P(n-2) M(n-2)(n-1) L P(n-1)"
 * Each Q segment passes through the next midpoint with the original
 * sample point as control. Adjacent Q segments share endpoints, so
 * the rendered curve is C1-continuous.
 */
function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    // Degenerate: a single point. Render as a tiny line so the stroke
    // is at least visible — matches what saving + reload would do.
    const p = points[0];
    return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  if (points.length === 2) {
    const a = points[0];
    const b = points[1];
    return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  }
  const fmt = (n: number) => n.toFixed(2);
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mNext = {
      x: (points[i].x + points[i + 1].x) / 2,
      y: (points[i].y + points[i + 1].y) / 2,
    };
    d += ` Q ${fmt(points[i].x)} ${fmt(points[i].y)} ${fmt(mNext.x)} ${fmt(mNext.y)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${fmt(last.x)} ${fmt(last.y)}`;
  return d;
}
