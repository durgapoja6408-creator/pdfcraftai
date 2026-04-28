"use client";

// components/tools/PdfRedactTool.tsx
//
// Tier 6 (2026-04-28): fourth visual-editor consumer of PageEditorTool.
// Drag to add an opaque redaction rectangle over sensitive content;
// multiple redactions per session. Same shape as Highlight but with
// solid color (no opacity slider) and an upfront honest-scope warning
// about what this can and can't do.
//
// 2026-04-28 (Task #171): now multi-page. Iterate entries, chain bytes
// through redactPdf op once per page.

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

interface RedactState {
  rects: PixelRect[];
  color: string;
}

const INITIAL_STATE: RedactState = {
  rects: [],
  color: "#000000",
};

const COLOR_SWATCHES: Array<{ value: string; label: string }> = [
  { value: "#000000", label: "Black" },
  { value: "#FFFFFF", label: "White (erase)" },
  { value: "#808080", label: "Gray" },
];

const realRects = (rects: PixelRect[]) =>
  rects.filter((r) => r.w >= 8 && r.h >= 8);

export function PdfRedactTool() {
  return (
    <PageEditorTool<RedactState>
      toolId="redact-free"
      toolGroup="Security"
      dropPrompt="Drop a PDF to redact"
      busyLabel="Applying redactions…"
      successCta="Redact another PDF"
      errorCode="redact_failed"
      initialState={INITIAL_STATE}
      multiPage={true}
      hasEdits={(s) => realRects(s.rects).length > 0}
      resetPageContent={(s) => ({ ...s, rects: [] })}
      disabledReason={(entries) => {
        const total = entries.reduce(
          (n, e) => n + realRects(e.state.rects).length,
          0,
        );
        if (total === 0) return "Drag to add a redaction box";
        return null;
      }}
      applyLabel={(entries) => {
        const total = entries.reduce(
          (n, e) => n + realRects(e.state.rects).length,
          0,
        );
        const pages = entries.length;
        if (pages <= 1) {
          return `Apply ${total} redaction${total === 1 ? "" : "s"}`;
        }
        return `Apply ${total} redaction${total === 1 ? "" : "s"} on ${pages} pages`;
      }}
      apply={async (bytes, file, entries) => {
        if (entries.length === 0) {
          throw new Error("No valid redaction rectangles to apply.");
        }
        const { redactPdf } = await import("@/lib/pdf/ops/redact");
        let currentBytes = bytes;
        let totalRects = 0;
        let totalPages = 0;
        const editedPageNumbers: number[] = [];
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
          const r = await redactPdf(currentBytes, {
            rects: rectsPt,
            color: entry.state.color,
            pageIndex: entry.pageIndex,
          });
          currentBytes = r.bytes;
          totalRects += r.redactedRectCount;
          totalPages += 1;
          editedPageNumbers.push(entry.pageIndex + 1);
        }
        const baseName = file.name.replace(/\.pdf$/i, "");
        const headline =
          totalPages === 1
            ? `Applied ${totalRects} redaction${totalRects === 1 ? "" : "s"} to page ${editedPageNumbers[0]}`
            : `Applied ${totalRects} redaction${totalRects === 1 ? "" : "s"} across ${totalPages} pages`;
        const result: PageEditorResult = {
          outputBytes: currentBytes,
          outputFileName: `${baseName || "document"}-redacted.pdf`,
          successHeadline: headline,
          successDetail: `Output: ${formatSize(currentBytes.length)}. Visual cover only — see FAQ on full destruction.`,
        };
        return result;
      }}
      configPanel={RedactConfigPanel}
      editor={RedactEditorOverlay}
    />
  );
}

function RedactConfigPanel({
  state,
  setState,
  busy,
  pageRender,
}: PageEditorConfigProps<RedactState>) {
  const realRects = state.rects.filter((r) => r.w >= 8 && r.h >= 8);
  const currentPage = pageRender.pageIndex + 1;
  return (
    <div
      className="card"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
    >
      {/*
       * Honest-scope warning. PDF redaction is one of those things
       * users assume works one way (destroys content) when in reality
       * pdf-lib drawRectangle just covers it. Surfacing the limitation
       * upfront prevents misuse on high-stakes content.
       */}
      <div
        style={{
          padding: 12,
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: 6,
          fontSize: 12,
          color: "var(--fg)",
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: "var(--red, #ef4444)" }}>
          Visual redaction only.
        </strong>{" "}
        This covers content with an opaque rectangle but does NOT destroy
        the underlying text/images. Anyone with PDF tooling can recover
        what&rsquo;s under the box. For court filings, FOIA releases, or
        healthcare records, use Adobe Acrobat&rsquo;s redaction feature or a
        server-side qpdf workflow. Fine for low-stakes uses (covering a
        name on a printout, hiding a price on a screenshot).
      </div>

      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <div style={{ fontSize: 13 }}>
          {realRects.length === 0
            ? "Drag a rectangle on the page to redact. Drag a placed redaction to reposition, drag a corner to resize."
            : `${realRects.length} redaction${realRects.length === 1 ? "" : "s"} on page ${currentPage} · drag to reposition, corners to resize`}
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

      <div style={{ fontSize: 13, fontWeight: 500 }}>Cover color</div>
      <div className="row" style={{ gap: 6 }}>
        {COLOR_SWATCHES.map((sw) => (
          <button
            key={sw.value}
            type="button"
            onClick={() => setState((s) => ({ ...s, color: sw.value }))}
            disabled={busy}
            aria-label={sw.label}
            aria-pressed={state.color === sw.value}
            title={sw.label}
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
    </div>
  );
}

function RedactEditorOverlay({
  pageRender,
  state,
  setState,
  busy,
}: PageEditorEditorProps<RedactState>) {
  const [drawing, setDrawing] = useState<{ startX: number; startY: number } | null>(
    null,
  );
  const overlayRef = useRef<HTMLDivElement | null>(null);
  // 2026-04-28 (#186): drag-to-reposition saved rects, mirroring
  // Add Hyperlinks #180 + Highlight #186.
  const movingRef = useRef<{
    index: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [movingIndex, setMovingIndex] = useState<number | null>(null);

  // 2026-04-28 (#187): corner-resize handles, mirroring Add
  // Hyperlinks #181 + Highlight #187.
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
    setState((s) => ({ ...s, rects: [...s.rects, { x, y, w: 0, h: 0 }] }));
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (resizingRef.current) {
      applyResize(e);
      return;
    }
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
    setState((s) => {
      if (s.rects.length === 0) return s;
      const last = s.rects[s.rects.length - 1];
      if (last.w < 8 || last.h < 8) {
        return { ...s, rects: s.rects.slice(0, -1) };
      }
      return s;
    });
  };

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

  // Resize math, mirrors Highlight #187 + Add Hyperlinks #181.
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
        const isLastBeingDrawn =
          i === state.rects.length - 1 && drawing !== null;
        const isMoving = movingIndex === i;
        const isMovable =
          !isLastBeingDrawn && r.w >= 8 && r.h >= 8 && !busy;
        const showDelete = isMovable;
        // Delete button needs to be readable against either dark
        // (#000) or light (#FFF) redaction colors. We pick a chip
        // background that contrasts with whatever the user picked.
        const isDarkColor =
          state.color.toLowerCase() === "#000000" ||
          state.color.toLowerCase() === "#808080";
        return (
          <div
            key={i}
            // 2026-04-28 (#186): saved rects draggable to reposition,
            // matching Add Hyperlinks #180 + Highlight #186. Tiny
            // mid-creation rects skip the wiring (isMovable false).
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
              touchAction: "none",
              userSelect: "none",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                background: state.color,
                opacity: 1,
                border: isLastBeingDrawn
                  ? "1px solid rgba(255,255,255,0.6)"
                  : "none",
                boxShadow: isMoving
                  ? "0 4px 12px rgba(0,0,0,0.45)"
                  : "none",
                transition: isMoving ? "none" : "box-shadow 0.15s ease",
              }}
            />
            {showDelete && (
              // 40×40 transparent tap target with visible 20×20 chip
              // centered inside — same pattern as Highlight, finger-
              // friendly without expanding the visual footprint.
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
                aria-label={`Remove redaction ${i + 1}`}
                title="Remove redaction"
                style={{
                  position: "absolute",
                  top: -18,
                  right: -18,
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  border: "none",
                  background: "transparent",
                  color: isDarkColor ? "#fff" : "var(--fg)",
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
                    border: isDarkColor
                      ? "1.5px solid rgba(255,255,255,0.85)"
                      : "1.5px solid rgba(0,0,0,0.6)",
                    background: isDarkColor ? "#1a1a1a" : "var(--bg-1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                  }}
                >
                  <I.X size={11} />
                </span>
              </button>
            )}
            {/* 2026-04-28 (#187): corner-resize handles. Indicator
                is a white square with dark border — high contrast
                against any redaction color (black, white, gray). */}
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
                    touchAction: "none",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: "#fff",
                      border: "2px solid rgba(0, 0, 0, 0.7)",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.45)",
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
