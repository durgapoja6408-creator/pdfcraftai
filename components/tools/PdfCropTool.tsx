"use client";

// components/tools/PdfCropTool.tsx
//
// Tier 4 (2026-04-28): first visual-editor tool — drag a rectangle on
// page 1 to define the crop area, then apply uniformly to every page.
//
// Architecture:
//   1. PDFium renders page 1 at 1.5× scale to a JPEG. The image
//      becomes the visual reference for the editor canvas.
//   2. An absolutely-positioned overlay <div> on top of the image
//      handles pointer events. Drag = define rectangle. We track
//      the rectangle in PIXEL coordinates relative to the image.
//   3. On apply, pixel coords are converted to PDF user-space points
//      using the render scale ratio. Origin flips because PDF Y is
//      bottom-up while pixel Y is top-down.
//   4. Default crop on file load = full page (so users see the whole
//      thing and only need to drag IN).
//
// Out of scope for v1:
//   - per-page crop (every page gets the same rectangle)
//   - aspect-ratio lock or snap-to-edge
//   - resize handles after drawing (just re-draw to change)
//   - keyboard nudging
// All of those are obvious extensions if usage validates the tool.

import { useState, useCallback, useEffect, useRef } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";

interface PageRender {
  url: string;
  /** Rendered pixel width. */
  pxWidth: number;
  /** Rendered pixel height. */
  pxHeight: number;
  /** True PDF page width in points. */
  ptWidth: number;
  /** True PDF page height in points. */
  ptHeight: number;
}

interface ResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  pageCount: number;
}

type Stage = "idle" | "rendering" | "ready" | "applying";

const RENDER_SCALE = 1.5;

interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function PdfCropTool() {
  const tracker = useTrackToolView("crop-pdf", "Edit");
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [render, setRender] = useState<PageRender | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);

  // Crop rectangle in IMAGE PIXEL coordinates (origin top-left).
  // Default to a "full page" rect once the render lands. null means
  // "no rect drawn yet" — but we set it to full-page on render to
  // give users a starting point they can shrink IN to.
  const [cropPx, setCropPx] = useState<PixelRect | null>(null);
  const [drawing, setDrawing] = useState<{ startX: number; startY: number } | null>(null);

  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (render?.url) URL.revokeObjectURL(render.url);
    };
  }, [render]);

  const onFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      setResult(null);
      const f = files[0];
      if (!f) return;
      if (!f.type.includes("pdf") && !f.name.toLowerCase().endsWith(".pdf")) {
        setError("Please drop a PDF file.");
        return;
      }
      if (f.size > 100 * 1024 * 1024) {
        setError("File over 100 MB — try a smaller one.");
        return;
      }
      setFile(f);
      tracker.upload(f);
      setStage("rendering");

      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        setPdfBytes(bytes);
        const { rasterizePdf } = await import("@/lib/pdf/ops/rasterize");
        // Render page 1 only — Cropping is uniform across pages so we
        // don't need a thumbnail strip in v1.
        const rendered = await rasterizePdf(bytes, {
          format: "jpeg",
          scale: RENDER_SCALE,
          quality: 0.85,
        });
        const first = rendered[0];
        if (!first) throw new Error("This PDF has no pages.");
        const blob = new Blob([first.bytes], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        setRender({
          url,
          pxWidth: first.width,
          pxHeight: first.height,
          ptWidth: first.width / RENDER_SCALE,
          ptHeight: first.height / RENDER_SCALE,
        });
        // Initial crop = full page (user shrinks in).
        setCropPx({ x: 0, y: 0, w: first.width, h: first.height });
        setStage("ready");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not parse PDF.";
        setError(msg);
        setStage("idle");
        tracker.error({ errorCode: "crop_render_failed" });
      }
    },
    [tracker],
  );

  const reset = () => {
    if (render?.url) URL.revokeObjectURL(render.url);
    setFile(null);
    setPdfBytes(null);
    setRender(null);
    setCropPx(null);
    setDrawing(null);
    setError(null);
    setResult(null);
    setStage("idle");
  };

  const resetCropToFullPage = () => {
    if (!render) return;
    setCropPx({ x: 0, y: 0, w: render.pxWidth, h: render.pxHeight });
  };

  // Translate a pointer event's clientX/Y to image-relative pixel
  // coordinates, clamped to the image bounds.
  const pointerToPx = (e: React.PointerEvent): { x: number; y: number } => {
    if (!overlayRef.current || !render) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    // The overlay is sized to the image's NATURAL pixel dimensions
    // via aspect-ratio CSS, but it may be displayed at a different
    // CSS size (responsive). Convert from displayed CSS pixels back
    // to native image pixels.
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;
    const xPx = (xCss / rect.width) * render.pxWidth;
    const yPx = (yCss / rect.height) * render.pxHeight;
    return {
      x: Math.max(0, Math.min(xPx, render.pxWidth)),
      y: Math.max(0, Math.min(yPx, render.pxHeight)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (stage !== "ready") return;
    const { x, y } = pointerToPx(e);
    setDrawing({ startX: x, startY: y });
    setCropPx({ x, y, w: 0, h: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const { x, y } = pointerToPx(e);
    const x0 = Math.min(drawing.startX, x);
    const y0 = Math.min(drawing.startY, y);
    const w = Math.abs(x - drawing.startX);
    const h = Math.abs(y - drawing.startY);
    setCropPx({ x: x0, y: y0, w, h });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawing) return;
    setDrawing(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    // If user just clicked without dragging (or drew a tiny rect),
    // restore full-page crop so they don't accidentally apply a 1×1.
    if (cropPx && (cropPx.w < 8 || cropPx.h < 8)) {
      resetCropToFullPage();
    }
  };

  const apply = async () => {
    if (!pdfBytes || !file || !render || !cropPx) return;
    if (cropPx.w < 8 || cropPx.h < 8) {
      setError("Drag to define a crop rectangle first.");
      return;
    }
    setError(null);
    setStage("applying");
    const t0 = performance.now();
    try {
      // Convert image-pixel coords (top-left origin) to PDF user-space
      // coords (bottom-left origin). x stays the same; y flips.
      const pxToPt = (px: number) => px / RENDER_SCALE;
      const cropPt = {
        x: pxToPt(cropPx.x),
        y: pxToPt(render.pxHeight - cropPx.y - cropPx.h),
        width: pxToPt(cropPx.w),
        height: pxToPt(cropPx.h),
      };
      const { cropPdf } = await import("@/lib/pdf/ops/crop");
      const r = await cropPdf(pdfBytes, cropPt);
      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "document"}-cropped.pdf`,
        pageCount: r.pageCount,
      });
      setStage("ready");
      tracker.success({
        creditCost: 0,
        pageCount: r.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not crop the PDF.";
      setError(msg);
      setStage("ready");
      tracker.error({ errorCode: "crop_failed" });
    }
  };

  const downloadResult = () => {
    if (!result) return;
    const blob = new Blob([result.outputBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = result.outputFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const truncate = (s: string, max = 38) =>
    s.length <= max ? s : `${s.slice(0, max - 1)}…`;

  const busy = stage === "rendering" || stage === "applying";
  const isFullPage =
    render && cropPx
      ? cropPx.x === 0 &&
        cropPx.y === 0 &&
        Math.abs(cropPx.w - render.pxWidth) < 1 &&
        Math.abs(cropPx.h - render.pxHeight) < 1
      : false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to crop"
          hint="Up to 100 MB · runs privately in your browser"
        />
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span style={{ color: "var(--fg-subtle)" }}>
              <I.File size={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={file.name}
              >
                {truncate(file.name)}
              </div>
              <div className="subtle" style={{ fontSize: 12 }}>
                {humanSize(file.size)}
                {render
                  ? ` · ${Math.round(render.ptWidth)}×${Math.round(render.ptHeight)} pt`
                  : ""}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={reset}
              disabled={busy}
              aria-label="Remove file"
            >
              <I.X size={14} />
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {stage === "rendering" && (
        <div
          className="card"
          style={{ padding: 16, background: "var(--bg-1)", display: "flex", gap: 12 }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="pulse-soft" style={{ color: "var(--accent)" }}>
            <I.Sparkle size={16} />
          </span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
            Rendering page 1…
          </div>
        </div>
      )}

      {stage === "applying" && (
        <div
          className="card"
          style={{ padding: 16, background: "var(--bg-1)", display: "flex", gap: 12 }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="pulse-soft" style={{ color: "var(--accent)" }}>
            <I.Sparkle size={16} />
          </span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>Applying crop…</div>
        </div>
      )}

      {render && stage === "ready" && !result && (
        <>
          <div
            className="card"
            style={{
              padding: "12px 16px",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div className="subtle" style={{ fontSize: 13 }}>
              {isFullPage
                ? "Drag a rectangle on the page to define the crop area. Crop will apply to every page."
                : `Crop: ${Math.round(cropPx ? cropPx.w / RENDER_SCALE : 0)}×${Math.round(cropPx ? cropPx.h / RENDER_SCALE : 0)} pt — drag again to redraw.`}
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={resetCropToFullPage}
              disabled={isFullPage}
            >
              Reset crop
            </button>
          </div>

          {/* Page editor — image + drag overlay */}
          <div
            style={{
              maxWidth: 720,
              margin: "0 auto",
              width: "100%",
              position: "relative",
              userSelect: "none",
            }}
          >
            <div
              ref={overlayRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: `${render.pxWidth} / ${render.pxHeight}`,
                cursor: drawing ? "crosshair" : "crosshair",
                background: "var(--bg-2)",
                borderRadius: 8,
                overflow: "hidden",
                border: "1px solid var(--border)",
                touchAction: "none", // so pointer events aren't intercepted by scroll
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={render.url}
                alt="Page 1 preview"
                draggable={false}
                style={{
                  width: "100%",
                  height: "100%",
                  display: "block",
                  pointerEvents: "none",
                }}
              />
              {/* Dim mask outside the crop rectangle */}
              {cropPx && !isFullPage && (
                <CropOverlay
                  cropPx={cropPx}
                  imgPxWidth={render.pxWidth}
                  imgPxHeight={render.pxHeight}
                />
              )}
            </div>
          </div>
        </>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: "16px 20px" }}
          role="status"
          aria-live="polite"
          aria-label={`Cropped ${result.pageCount} pages`}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Cropped {result.pageCount} page
                {result.pageCount === 1 ? "" : "s"}
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                Output: {humanSize(result.outputBytes.length)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={downloadResult}
            >
              <I.Download size={12} /> Download
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Crop another PDF
          </button>
        ) : stage === "ready" && render ? (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={reset}
              disabled={busy}
            >
              Reset
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !cropPx || cropPx.w < 8 || cropPx.h < 8 || isFullPage}
              onClick={apply}
            >
              {busy
                ? "Cropping…"
                : isFullPage
                  ? "Drag to define crop area"
                  : "Apply crop to all pages"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Renders the four dim panels surrounding the crop rectangle, plus a
 * border on the rectangle itself. Implemented as four absolutely-
 * positioned <div>s so the page image underneath stays interactive
 * during drag — no compositing tricks needed.
 */
function CropOverlay({
  cropPx,
  imgPxWidth,
  imgPxHeight,
}: {
  cropPx: PixelRect;
  imgPxWidth: number;
  imgPxHeight: number;
}) {
  // Convert pixel coords to percentages of the image so the overlay
  // scales with the responsive image regardless of CSS size.
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
