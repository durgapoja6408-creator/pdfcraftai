"use client";

// components/tools/PdfHighlightTool.tsx
//
// Tier 6 (2026-04-28): third visual-editor consumer of PageEditorTool.
// Drag to add a highlight rectangle; multiple highlights supported per
// session. Same drag-rectangle pattern as Crop, but the state is an
// ARRAY of rects rather than a single one, and the apply op stamps
// translucent yellow (or other color) overlays via pdf-lib instead of
// modifying /CropBox.
//
// v1 SCOPE: single-page only — highlights apply to page 1. Multi-page
// highlighting needs page navigation in PageEditorTool which is a v2
// enhancement once 2+ visual editors validate the navigation pattern.

import { useState, useRef } from "react";
import {
  PageEditorTool,
  type PageEditorEditorProps,
  type PageEditorConfigProps,
  type PageEditorResult,
} from "./PageEditorTool";

interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface HighlightState {
  rects: PixelRect[];
  color: string;
  opacity: number;
}

const INITIAL_STATE: HighlightState = {
  rects: [],
  color: "#FFFF00",
  opacity: 0.4,
};

const COLOR_SWATCHES: Array<{ value: string; label: string }> = [
  { value: "#FFFF00", label: "Yellow" },
  { value: "#A8E5A0", label: "Green" },
  { value: "#FFB6C1", label: "Pink" },
  { value: "#ADD8E6", label: "Blue" },
];

export function PdfHighlightTool() {
  return (
    <PageEditorTool<HighlightState>
      toolId="highlight-pdf"
      toolGroup="Edit"
      dropPrompt="Drop a PDF to highlight"
      busyLabel="Applying highlights…"
      successCta="Highlight another PDF"
      errorCode="highlight_failed"
      initialState={INITIAL_STATE}
      disabledReason={(state) => {
        if (state.rects.length === 0) return "Drag to add a highlight";
        // Drop tiny rects (stray clicks) before checking — they won't
        // contribute to the apply call but shouldn't enable the button.
        const real = state.rects.filter((r) => r.w >= 8 && r.h >= 8);
        if (real.length === 0) return "Drag to add a highlight";
        return null;
      }}
      applyLabel={(state) => {
        const real = state.rects.filter((r) => r.w >= 8 && r.h >= 8);
        return `Apply ${real.length} highlight${real.length === 1 ? "" : "s"}`;
      }}
      apply={async (bytes, file, state, render) => {
        const real = state.rects.filter((r) => r.w >= 8 && r.h >= 8);
        if (real.length === 0) {
          throw new Error("No valid highlight rectangles to apply.");
        }
        // image-pixel coords (top-left origin) → PDF user-space points
        // (bottom-left origin). Y axis flips, both divide by render scale.
        const pxToPt = (px: number) => px / render.renderScale;
        const rectsPt = real.map((r) => ({
          x: pxToPt(r.x),
          y: pxToPt(render.pxHeight - r.y - r.h),
          width: pxToPt(r.w),
          height: pxToPt(r.h),
        }));
        const { highlightPdf } = await import("@/lib/pdf/ops/highlight");
        const r = await highlightPdf(bytes, {
          rects: rectsPt,
          color: state.color,
          opacity: state.opacity,
          pageIndex: 0,
        });
        const baseName = file.name.replace(/\.pdf$/i, "");
        const result: PageEditorResult = {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-highlighted.pdf`,
          successHeadline: `Added ${r.highlightedRectCount} highlight${r.highlightedRectCount === 1 ? "" : "s"} to page 1`,
          successDetail: `Output: ${formatSize(r.bytes.length)} · ${r.pageCount} page${r.pageCount === 1 ? "" : "s"} total`,
        };
        return result;
      }}
      configPanel={HighlightConfigPanel}
      editor={HighlightEditorOverlay}
    />
  );
}

function HighlightConfigPanel({
  state,
  setState,
  busy,
}: PageEditorConfigProps<HighlightState>) {
  const realRects = state.rects.filter((r) => r.w >= 8 && r.h >= 8);
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
          {realRects.length === 0
            ? "Drag a rectangle on the page to add a highlight. Drag again for more."
            : `${realRects.length} highlight${realRects.length === 1 ? "" : "s"} on page 1`}
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setState((s) => ({ ...s, rects: [] }))}
          disabled={busy || state.rects.length === 0}
        >
          Clear all
        </button>
      </div>

      <div style={{ fontSize: 13, fontWeight: 500 }}>Highlight color</div>
      <div className="row" style={{ gap: 6 }}>
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
      </div>

      <label
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
      >
        <span>Opacity</span>
        <input
          type="range"
          min={10}
          max={80}
          value={Math.round(state.opacity * 100)}
          onChange={(e) =>
            setState((s) => ({ ...s, opacity: Number(e.target.value) / 100 }))
          }
          disabled={busy}
          style={{ width: 140 }}
        />
        <span
          className="subtle"
          style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", minWidth: 36 }}
        >
          {Math.round(state.opacity * 100)}%
        </span>
      </label>
    </div>
  );
}

function HighlightEditorOverlay({
  pageRender,
  state,
  setState,
  busy,
}: PageEditorEditorProps<HighlightState>) {
  const [drawing, setDrawing] = useState<{ startX: number; startY: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const pointerToPx = (e: React.PointerEvent): { x: number; y: number } => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;
    const xPx = (xCss / rect.width) * pageRender.pxWidth;
    const yPx = (yCss / rect.height) * pageRender.pxHeight;
    return {
      x: Math.max(0, Math.min(xPx, pageRender.pxWidth)),
      y: Math.max(0, Math.min(yPx, pageRender.pxHeight)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy) return;
    const { x, y } = pointerToPx(e);
    setDrawing({ startX: x, startY: y });
    // Push a new rect with zero size; we'll grow it during pointermove.
    setState((s) => ({ ...s, rects: [...s.rects, { x, y, w: 0, h: 0 }] }));
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const { x, y } = pointerToPx(e);
    const x0 = Math.min(drawing.startX, x);
    const y0 = Math.min(drawing.startY, y);
    const w = Math.abs(x - drawing.startX);
    const h = Math.abs(y - drawing.startY);
    setState((s) => {
      // Update the LAST rect (the one being drawn).
      if (s.rects.length === 0) return s;
      const next = s.rects.slice(0, -1);
      next.push({ x: x0, y: y0, w, h });
      return { ...s, rects: next };
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawing) return;
    setDrawing(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    // Drop tiny rects (stray clicks) so they don't accumulate visually.
    setState((s) => {
      if (s.rects.length === 0) return s;
      const last = s.rects[s.rects.length - 1];
      if (last.w < 8 || last.h < 8) {
        return { ...s, rects: s.rects.slice(0, -1) };
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
      {state.rects.map((r, i) => {
        const left = (r.x / pageRender.pxWidth) * 100;
        const top = (r.y / pageRender.pxHeight) * 100;
        const width = (r.w / pageRender.pxWidth) * 100;
        const height = (r.h / pageRender.pxHeight) * 100;
        return (
          <div
            key={i}
            aria-hidden="true"
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              background: state.color,
              opacity: state.opacity,
              pointerEvents: "none",
              // Only show a border on the rect being drawn so committed
              // highlights look clean.
              border:
                i === state.rects.length - 1 && drawing
                  ? "1px solid rgba(0,0,0,0.4)"
                  : "none",
            }}
          />
        );
      })}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
