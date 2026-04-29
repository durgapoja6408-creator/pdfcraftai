"use client";

// components/tools/PdfCropTool.tsx
//
// Tier 4 (2026-04-28): Crop PDF — drag a rectangle on page 1 to
// define a crop area, applied uniformly to every page.
//
// 2026-04-28 (Tier 6 refactor): rewritten on top of <PageEditorTool>.
// File-drop, PDFium render, busy/error/result cards, GA4 funnel,
// download, and Apply/Reset buttons all live in the base now. The
// remaining ~100 LOC here is purely crop-specific: the drag-rect
// state machine, image-pixel ↔ PDF-point conversion, and the dim-
// outside-overlay rendering. Behavior is byte-identical to the
// pre-refactor version — same data flow, same op call.

import { useState, useRef } from "react";
import {
  PageEditorTool,
  type PageEditorEditorProps,
  type PageEditorResult,
} from "./PageEditorTool";

interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CropState {
  /** Crop rectangle in image-pixel coordinates (top-left origin). */
  cropPx: PixelRect | null;
}

const INITIAL_STATE: CropState = { cropPx: null };

export function PdfCropTool() {
  return (
    <PageEditorTool<CropState>
      toolId="crop-pdf"
      toolGroup="Edit"
      dropPrompt="Drop a PDF to crop"
      busyLabel="Applying crop…"
      successCta="Crop another PDF"
      errorCode="crop_failed"
      initialState={INITIAL_STATE}
      disabledReason={(state, render) => {
        if (!state.cropPx) return "Drag to define crop area";
        if (state.cropPx.w < 8 || state.cropPx.h < 8)
          return "Drag to define crop area";
        if (
          state.cropPx.x === 0 &&
          state.cropPx.y === 0 &&
          Math.abs(state.cropPx.w - render.pxWidth) < 1 &&
          Math.abs(state.cropPx.h - render.pxHeight) < 1
        )
          return "Drag to define crop area";
        return null;
      }}
      applyLabel="Apply crop to all pages"
      apply={async (bytes, file, state, render) => {
        if (!state.cropPx) throw new Error("Drag to define a crop area first.");
        // image-pixel coords (top-left origin) → PDF user-space points
        // (bottom-left origin). Y axis flips, both divide by render scale.
        const pxToPt = (px: number) => px / render.renderScale;
        const cropPt = {
          x: pxToPt(state.cropPx.x),
          y: pxToPt(render.pxHeight - state.cropPx.y - state.cropPx.h),
          width: pxToPt(state.cropPx.w),
          height: pxToPt(state.cropPx.h),
        };
        const { cropPdf } = await import("@/lib/pdf/ops/crop");
        const r = await cropPdf(bytes, cropPt);
        const baseName = file.name.replace(/\.pdf$/i, "");
        const result: PageEditorResult = {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-cropped.pdf`,
          successHeadline: `Cropped ${r.pageCount} page${r.pageCount === 1 ? "" : "s"}`,
          successDetail: `Output: ${formatSize(r.bytes.length)} · crop ${Math.round(cropPt.width)}×${Math.round(cropPt.height)} pt`,
        };
        return result;
      }}
      editor={CropEditorOverlay}
    />
  );
}

function CropEditorOverlay({
  pageRender,
  state,
  setState,
  busy,
}: PageEditorEditorProps<CropState>) {
  const [drawing, setDrawing] = useState<{ startX: number; startY: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Default the crop rect to full-page on first interaction so users
  // see the whole page and shrink IN. Stored in state so consumers can
  // detect the no-change-yet state via disabledReason.
  const cropPx = state.cropPx ?? {
    x: 0,
    y: 0,
    w: pageRender.pxWidth,
    h: pageRender.pxHeight,
  };
  const isFullPage =
    cropPx.x === 0 &&
    cropPx.y === 0 &&
    Math.abs(cropPx.w - pageRender.pxWidth) < 1 &&
    Math.abs(cropPx.h - pageRender.pxHeight) < 1;

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
    setState({ cropPx: { x, y, w: 0, h: 0 } });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const { x, y } = pointerToPx(e);
    const x0 = Math.min(drawing.startX, x);
    const y0 = Math.min(drawing.startY, y);
    const w = Math.abs(x - drawing.startX);
    const h = Math.abs(y - drawing.startY);
    setState({ cropPx: { x: x0, y: y0, w, h } });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawing) return;
    setDrawing(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    // Stray click → reset to full page so apply stays disabled until a
    // real drag happens.
    if (cropPx.w < 8 || cropPx.h < 8) {
      setState({ cropPx: null });
    }
  };

  return (
    <>
      <div
        style={{
          padding: "10px 14px",
          marginBottom: 14,
          background: "var(--bg-1)",
          borderRadius: 8,
          fontSize: 13,
          color: "var(--fg-muted)",
          textAlign: "center",
        }}
      >
        {isFullPage
          ? "Drag a rectangle on the page to define the crop area. Crop will apply to every page."
          : `Crop: ${Math.round(cropPx.w / pageRender.renderScale)}×${Math.round(cropPx.h / pageRender.renderScale)} pt — drag again to redraw.`}
      </div>
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
          cursor: "crosshair",
          background: "var(--bg-2)",
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid var(--border)",
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
        {!isFullPage && (
          <CropOverlay
            cropPx={cropPx}
            imgPxWidth={pageRender.pxWidth}
            imgPxHeight={pageRender.pxHeight}
          />
        )}
      </div>
    </>
  );
}

function CropOverlay({
  cropPx,
  imgPxWidth,
  imgPxHeight,
}: {
  cropPx: PixelRect;
  imgPxWidth: number;
  imgPxHeight: number;
}) {
  const left = (cropPx.x / imgPxWidth) * 100;
  const top = (cropPx.y / imgPxHeight) * 100;
  const right = ((cropPx.x + cropPx.w) / imgPxWidth) * 100;
  const bottom = ((cropPx.y + cropPx.h) / imgPxHeight) * 100;
  const dim = "rgba(0, 0, 0, 0.55)";
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: dim,
          clipPath: `polygon(
            0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
            ${left}% ${top}%,
            ${left}% ${bottom}%,
            ${right}% ${bottom}%,
            ${right}% ${top}%,
            ${left}% ${top}%
          )`,
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: `${left}%`,
          top: `${top}%`,
          width: `${right - left}%`,
          height: `${bottom - top}%`,
          border: "2px solid var(--accent)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.4)",
          pointerEvents: "none",
        }}
      />
    </>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
