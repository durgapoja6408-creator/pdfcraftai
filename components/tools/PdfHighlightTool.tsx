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
// 2026-04-28 (Task #171): now multi-page. PageEditorTool persists
// per-page state, and apply iterates every page with edits, chaining
// bytes through highlightPdf op once per page.

import { useState, useRef } from "react";
import { I } from "@/components/icons/Icons";
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

// "Real" rect = at least 8×8 px (drop stray clicks). Used everywhere
// we need to know "does this state have actual edits".
const realRects = (rects: PixelRect[]) =>
  rects.filter((r) => r.w >= 8 && r.h >= 8);

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
      multiPage={true}
      hasEdits={(s) => realRects(s.rects).length > 0}
      resetPageContent={(s) => ({ ...s, rects: [] })}
      disabledReason={(entries) => {
        if (entries.length === 0) return "Drag to add a highlight";
        const total = entries.reduce(
          (n, e) => n + realRects(e.state.rects).length,
          0,
        );
        if (total === 0) return "Drag to add a highlight";
        return null;
      }}
      applyLabel={(entries) => {
        const total = entries.reduce(
          (n, e) => n + realRects(e.state.rects).length,
          0,
        );
        const pages = entries.length;
        if (pages <= 1) {
          return `Apply ${total} highlight${total === 1 ? "" : "s"}`;
        }
        return `Apply ${total} highlight${total === 1 ? "" : "s"} on ${pages} pages`;
      }}
      apply={async (bytes, file, entries) => {
        if (entries.length === 0) {
          throw new Error("No valid highlight rectangles to apply.");
        }
        const { highlightPdf } = await import("@/lib/pdf/ops/highlight");
        // Chain bytes through one highlightPdf call per edited page.
        // Each call re-encodes the PDF — measurable overhead only on
        // very large files with many edited pages, acceptable for v1.
        let currentBytes = bytes;
        let totalRects = 0;
        let totalPages = 0;
        const editedPageNumbers: number[] = [];
        let lastPageCount = 0;
        for (const entry of entries) {
          const real = realRects(entry.state.rects);
          if (real.length === 0) continue;
          const pxToPt = (px: number) => px / entry.dims.renderScale;
          const rectsPt = real.map((r) => ({
            x: pxToPt(r.x),
            y: pxToPt(entry.dims.pxHeight - r.y - r.h),
            width: pxToPt(r.w),
            height: pxToPt(r.h),
          }));
          const r = await highlightPdf(currentBytes, {
            rects: rectsPt,
            color: entry.state.color,
            opacity: entry.state.opacity,
            pageIndex: entry.pageIndex,
          });
          currentBytes = r.bytes;
          totalRects += r.highlightedRectCount;
          totalPages += 1;
          editedPageNumbers.push(entry.pageIndex + 1);
          lastPageCount = r.pageCount;
        }
        const baseName = file.name.replace(/\.pdf$/i, "");
        const headline =
          totalPages === 1
            ? `Added ${totalRects} highlight${totalRects === 1 ? "" : "s"} to page ${editedPageNumbers[0]}`
            : `Added ${totalRects} highlight${totalRects === 1 ? "" : "s"} across ${totalPages} pages`;
        const detailPages =
          totalPages > 1 ? ` · pages ${editedPageNumbers.join(", ")}` : "";
        const result: PageEditorResult = {
          outputBytes: currentBytes,
          outputFileName: `${baseName || "document"}-highlighted.pdf`,
          successHeadline: headline,
          successDetail: `Output: ${formatSize(currentBytes.length)} · ${lastPageCount} page${lastPageCount === 1 ? "" : "s"} total${detailPages}`,
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
  pageRender,
}: PageEditorConfigProps<HighlightState>) {
  const realRects = state.rects.filter((r) => r.w >= 8 && r.h >= 8);
  const currentPage = pageRender.pageIndex + 1;
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
            ? "Drag a rectangle on the page to add a highlight. Drag a placed highlight to reposition, drag a corner to resize."
            : `${realRects.length} highlight${realRects.length === 1 ? "" : "s"} on page ${currentPage} · drag to reposition, corners to resize`}
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
  // 2026-04-28 (#186): drag-to-reposition saved rects, mirroring
  // the pattern shipped on Add Hyperlinks in #180. Ref drives the
  // per-pointermove math; useState is for visual amplification only.
  const movingRef = useRef<{
    index: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [movingIndex, setMovingIndex] = useState<number | null>(null);

  // 2026-04-28 (#187): corner-resize handles, mirroring Add
  // Hyperlinks #181. originX/Y + origRect snapshot so all subsequent
  // pointermove math is absolute (delta from origin) rather than
  // incremental — incremental drifts when clamping past min-size or
  // page edge.
  type ResizeCorner = "nw" | "ne" | "sw" | "se";
  const resizingRef = useRef<{
    index: number;
    corner: ResizeCorner;
    originX: number;
    originY: number;
    origRect: PixelRect;
  } | null>(null);
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);

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
    // Resize takes priority over both move and draw.
    if (resizingRef.current) {
      applyResize(e);
      return;
    }
    // Saved-rect move takes priority over drawing. movingRef gets
    // set by the saved-rect's pointerdown (which stopPropagations);
    // this branch is the fallback when capture is on the overlay.
    if (movingRef.current) {
      applyMove(e);
      return;
    }
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
    if (resizingRef.current) {
      resizingRef.current = null;
      setResizingIndex(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      return;
    }
    if (movingRef.current) {
      movingRef.current = null;
      setMovingIndex(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      return;
    }
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

  // Move math, shared between saved-rect pointermove and the
  // overlay's pointermove fallback path.
  const applyMove = (e: React.PointerEvent) => {
    if (!movingRef.current) return;
    const { x, y } = pointerToPx(e);
    const { index, offsetX, offsetY } = movingRef.current;
    setState((s) => {
      if (index < 0 || index >= s.rects.length) return s;
      const target = s.rects[index];
      const newX = Math.max(
        0,
        Math.min(pageRender.pxWidth - target.w, x - offsetX),
      );
      const newY = Math.max(
        0,
        Math.min(pageRender.pxHeight - target.h, y - offsetY),
      );
      const next = [...s.rects];
      next[index] = { ...target, x: newX, y: newY };
      return { ...s, rects: next };
    });
  };

  const onSavedRectPointerDown = (e: React.PointerEvent, index: number) => {
    if (busy) return;
    e.stopPropagation();
    const { x, y } = pointerToPx(e);
    const target = state.rects[index];
    if (!target || target.w < 8 || target.h < 8) return;
    movingRef.current = {
      index,
      offsetX: x - target.x,
      offsetY: y - target.y,
    };
    setMovingIndex(index);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onSavedRectPointerMove = (e: React.PointerEvent) => {
    if (!movingRef.current) return;
    applyMove(e);
  };

  const onSavedRectPointerUp = (e: React.PointerEvent) => {
    if (!movingRef.current) return;
    movingRef.current = null;
    setMovingIndex(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Resize math, shared between resize-handle pointermove and the
  // overlay's pointermove fallback (when pointer capture is on the
  // overlay rather than the handle). Mirrors Add Hyperlinks #181.
  const applyResize = (e: React.PointerEvent) => {
    if (!resizingRef.current) return;
    const { x: px, y: py } = pointerToPx(e);
    const { index, corner, originX, originY, origRect } = resizingRef.current;
    const dx = px - originX;
    const dy = py - originY;
    let newX = origRect.x;
    let newY = origRect.y;
    let newW = origRect.w;
    let newH = origRect.h;
    if (corner === "nw" || corner === "sw") {
      newX = origRect.x + dx;
      newW = origRect.w - dx;
    }
    if (corner === "ne" || corner === "se") {
      newW = origRect.w + dx;
    }
    if (corner === "nw" || corner === "ne") {
      newY = origRect.y + dy;
      newH = origRect.h - dy;
    }
    if (corner === "sw" || corner === "se") {
      newH = origRect.h + dy;
    }
    const MIN = 8;
    if (newW < MIN) {
      if (corner === "nw" || corner === "sw") {
        newX = origRect.x + origRect.w - MIN;
      }
      newW = MIN;
    }
    if (newH < MIN) {
      if (corner === "nw" || corner === "ne") {
        newY = origRect.y + origRect.h - MIN;
      }
      newH = MIN;
    }
    if (newX < 0) {
      newW += newX;
      newX = 0;
    }
    if (newY < 0) {
      newH += newY;
      newY = 0;
    }
    if (newX + newW > pageRender.pxWidth) {
      newW = pageRender.pxWidth - newX;
    }
    if (newY + newH > pageRender.pxHeight) {
      newH = pageRender.pxHeight - newY;
    }
    setState((s) => {
      if (index < 0 || index >= s.rects.length) return s;
      const next = [...s.rects];
      next[index] = { x: newX, y: newY, w: newW, h: newH };
      return { ...s, rects: next };
    });
  };

  const onResizeHandlePointerDown = (
    e: React.PointerEvent,
    index: number,
    corner: ResizeCorner,
  ) => {
    if (busy) return;
    e.stopPropagation();
    const { x, y } = pointerToPx(e);
    const target = state.rects[index];
    if (!target) return;
    resizingRef.current = {
      index,
      corner,
      originX: x,
      originY: y,
      origRect: { ...target },
    };
    setResizingIndex(index);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onResizeHandlePointerMove = (e: React.PointerEvent) => {
    if (!resizingRef.current) return;
    applyResize(e);
  };

  const onResizeHandlePointerUp = (e: React.PointerEvent) => {
    if (!resizingRef.current) return;
    resizingRef.current = null;
    setResizingIndex(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
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
        // M11 (#193, 2026-04-29): pinch-zoom lets mobile users zoom in
        // with two fingers on the editor surface itself; single-finger
        // pointer events still fire (drawing, dragging rects) because
        // pinch-zoom blocks pan + double-tap, not pointer events.
        // Was "none" — which blocked pinch entirely if the gesture
        // started on the editor.
        touchAction: "pinch-zoom",
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
        const isLastBeingDrawn =
          i === state.rects.length - 1 && drawing !== null;
        const isMoving = movingIndex === i;
        // Hide the per-rect delete button on the rect currently being
        // drawn (stray click on a 0×0 rect would delete itself before
        // the user finishes the drag). Same gate decides when a rect
        // is "saved" enough to be draggable — tiny stray-click rects
        // are still mid-creation.
        const isMovable =
          !isLastBeingDrawn && r.w >= 8 && r.h >= 8 && !busy;
        const showDelete = isMovable;
        return (
          <div
            key={i}
            // 2026-04-28 (#186): saved rects are draggable. Same
            // pattern as Add Hyperlinks #180 — pointerdown
            // stopPropagation prevents the parent overlay's
            // draw-new-rect from firing on top of the rect.
            onPointerDown={
              isMovable
                ? (e) => onSavedRectPointerDown(e, i)
                : undefined
            }
            onPointerMove={isMovable ? onSavedRectPointerMove : undefined}
            onPointerUp={isMovable ? onSavedRectPointerUp : undefined}
            onPointerCancel={isMovable ? onSavedRectPointerUp : undefined}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              pointerEvents: isMovable ? "auto" : "none",
              cursor: isMovable
                ? isMoving
                  ? "grabbing"
                  : "move"
                : "default",
              touchAction: "pinch-zoom",
              userSelect: "none",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                background: state.color,
                // Slightly amplified opacity while moving so users
                // can see exactly which rect is following their
                // pointer when several overlap.
                opacity: isMoving
                  ? Math.min(1, state.opacity + 0.15)
                  : state.opacity,
                // Only show a border on the rect being drawn so
                // committed highlights look clean. Add a soft drop
                // shadow while moving for the same reason.
                border: isLastBeingDrawn
                  ? "1px solid rgba(0,0,0,0.4)"
                  : "none",
                boxShadow: isMoving
                  ? "0 4px 12px rgba(0,0,0,0.25)"
                  : "none",
                transition: isMoving ? "none" : "box-shadow 0.15s ease",
              }}
            />
            {showDelete && (
              // 40×40 transparent button is the actual tap target; the
              // visible 20×20 chip is centered inside via flex. Keeps
              // mobile finger-tap-friendly (per Apple HIG / Material
              // Design 44×44) without bloating the visual footprint.
              // Pointer events propagate through the transparent
              // padding because we stopPropagation on the BUTTON's
              // pointerdown, not on a wrapper — drag-to-add still
              // works around the chip.
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setState((s) => ({
                    ...s,
                    rects: s.rects.filter((_, j) => j !== i),
                  }));
                }}
                aria-label={`Remove highlight ${i + 1}`}
                title="Remove highlight"
                style={{
                  position: "absolute",
                  top: -18,
                  right: -18,
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  border: "none",
                  background: "transparent",
                  color: "var(--fg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  pointerEvents: "auto",
                  padding: 0,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "1.5px solid rgba(0,0,0,0.6)",
                    background: "var(--bg-1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                  }}
                >
                  <I.X size={11} />
                </span>
              </button>
            )}
            {/* 2026-04-28 (#187): corner-resize handles, mirroring
                Add Hyperlinks #181. Only shown when isMovable AND
                not while drawing (the last rect is mid-drag) AND
                not while moving (handles would visually conflict
                with the drag preview). */}
            {isMovable && !isMoving &&
              (
                [
                  { corner: "nw" as ResizeCorner, style: { top: -12, left: -12 }, cursor: "nwse-resize" },
                  { corner: "ne" as ResizeCorner, style: { top: -12, right: -12 }, cursor: "nesw-resize" },
                  { corner: "sw" as ResizeCorner, style: { bottom: -12, left: -12 }, cursor: "nesw-resize" },
                  { corner: "se" as ResizeCorner, style: { bottom: -12, right: -12 }, cursor: "nwse-resize" },
                ] as const
              ).map(({ corner, style, cursor }) => (
                <button
                  key={corner}
                  type="button"
                  onPointerDown={(e) =>
                    onResizeHandlePointerDown(e, i, corner)
                  }
                  onPointerMove={onResizeHandlePointerMove}
                  onPointerUp={onResizeHandlePointerUp}
                  onPointerCancel={onResizeHandlePointerUp}
                  aria-label={`Resize ${corner.toUpperCase()} corner`}
                  style={{
                    position: "absolute",
                    ...style,
                    width: 24,
                    height: 24,
                    padding: 0,
                    background: "transparent",
                    border: "none",
                    cursor,
                    pointerEvents: "auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    touchAction: "pinch-zoom",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: "#fff",
                      border: "2px solid rgba(0, 0, 0, 0.6)",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.3)",
                    }}
                  />
                </button>
              ))}
          </div>
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
