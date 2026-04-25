"use client";

// FreeDrawTool — Tier 1 §1.5 P1.
//
// Canvas-overlay free-draw / sketch tool. Mark up PDF pages with
// freeform pen strokes — arrows, circles, sketches, signature-style
// marks. Multi-page, multi-color, configurable stroke width.
//
// Same canvas-overlay pattern as HighlightPdfTool / AddTextBoxTool:
// pdfjs renders the page to a canvas, an absolutely-positioned SVG
// overlay catches pointer events and shows a live preview of the
// strokes, and on commit each stroke is converted from canvas coords
// to PDF points and drawn via pdf-lib's `drawSvgPath`.
//
// Stroke representation:
//   - In-flight: array of {x, y} CSS pixels relative to the canvas
//     element's bounding rect.
//   - Stored:    array of {x, y} PDF points (origin bottom-left), so
//     the stored data survives canvas resizes and re-renders without
//     coordinate drift.
//
// Apply path: each stroke's points → SVG path string "M x1 y1 L x2 y2…"
// → page.drawSvgPath(path, { borderColor, borderWidth }). drawSvgPath
// is part of pdf-lib's high-level API — no PDFDict surgery needed.
//
// SEO: "draw on pdf", "annotate pdf free", "pdf sketch tool", "mark up
// pdf online".

import { useState, useCallback, useEffect, useRef } from "react";
import { PDFDocument, rgb } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  deriveOutputName,
  downloadBytes,
  humanSize,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";
import { useTrackToolView } from "./useToolTracking";

const RENDER_SCALE = 1.5;

// Drop the smallest meaningful pen movements before recording — keeps
// stroke count manageable for long sketches and avoids "noise" points
// from the cursor not actually moving.
const MIN_POINT_DELTA_CSS_PX = 1.5;

type Color = {
  id: string;
  label: string;
  rgb: [number, number, number]; // 0-1 floats for pdf-lib
  css: string;
};

const COLORS: readonly Color[] = [
  { id: "black", label: "Black", rgb: [0, 0, 0], css: "#000" },
  { id: "red", label: "Red", rgb: [0.85, 0.1, 0.1], css: "#d91a1a" },
  { id: "blue", label: "Blue", rgb: [0.1, 0.4, 0.85], css: "#1a66d9" },
  { id: "green", label: "Green", rgb: [0.1, 0.55, 0.2], css: "#1a8c33" },
  { id: "orange", label: "Orange", rgb: [0.95, 0.55, 0.05], css: "#f28c0d" },
] as const;

type StrokePoint = { x: number; y: number }; // PDF points, origin bottom-left

type Stroke = {
  id: string;
  pageIndex: number;
  color: Color;
  widthPt: number;
  points: StrokePoint[];
};

type Loaded = {
  file: File;
  buffer: ArrayBuffer;
  pageSizes: Array<{ widthPt: number; heightPt: number }>;
};

type InFlight = {
  pageIndex: number;
  cssPoints: Array<{ x: number; y: number }>;
};

export function FreeDrawTool() {
  useTrackToolView("free-draw-pdf", "Edit");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState<Color>(COLORS[0]);
  const [widthPt, setWidthPt] = useState<number>(2);
  const [inFlight, setInFlight] = useState<InFlight | null>(null);
  const [busy, setBusy] = useState(false);
  const [renderBusy, setRenderBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ bytes: Uint8Array; name: string; size: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const onFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setStrokes([]);
    setPageIndex(0);
    setBusy(true);
    try {
      const buffer = await f.arrayBuffer();
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pages = doc.getPages();
      if (pages.length === 0) throw new Error("PDF has no pages.");
      setLoaded({
        file: f,
        buffer,
        pageSizes: pages.map((p) => ({ widthPt: p.getWidth(), heightPt: p.getHeight() })),
      });
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && /encrypted|password/i.test(err.message)
          ? "This PDF is password-protected. Unlock it first."
          : "Couldn't read that PDF. It may be corrupt."
      );
      setLoaded(null);
    } finally {
      setBusy(false);
    }
  }, []);

  // Render the current page to canvas — same pattern as
  // HighlightPdfTool: pdfjs render task tracked in a ref so we can
  // cancel cleanly when the user navigates pages quickly.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const render = async () => {
      setRenderBusy(true);
      renderTaskRef.current?.cancel();
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs-worker.min.mjs";
        }
        const src = await pdfjs.getDocument({ data: loaded.buffer.slice(0) }).promise;
        if (cancelled) return;
        const page = await src.getPage(pageIndex + 1);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;
        setCanvasSize({ w: viewport.width, h: viewport.height });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (!/cancelled|Worker was destroyed/i.test(msg)) {
          console.error("page render failed:", err);
          setError("Couldn't render this page.");
        }
      } finally {
        if (!cancelled) setRenderBusy(false);
      }
    };
    render();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [loaded, pageIndex]);

  const reset = () => {
    setLoaded(null);
    setStrokes([]);
    setPageIndex(0);
    setError(null);
    setResult(null);
    setInFlight(null);
  };

  // CSS-pixel → PDF-point converter, anchored to the current canvas
  // size + page height. Returns null if any state isn't ready.
  const cssToPdf = useCallback(
    (xCss: number, yCss: number): StrokePoint | null => {
      if (!loaded || !canvasRef.current || !canvasSize) return null;
      const rect = canvasRef.current.getBoundingClientRect();
      const cssToCanvas = canvasSize.w / rect.width;
      const xCanvas = xCss * cssToCanvas;
      const yCanvas = yCss * cssToCanvas;
      const pageH = loaded.pageSizes[pageIndex]?.heightPt ?? 0;
      // pdfjs render is at RENDER_SCALE; canvas pixels = PDF points * scale.
      const xPdf = xCanvas / RENDER_SCALE;
      // Canvas y grows downward; pdf-lib y grows upward.
      const yPdf = pageH - yCanvas / RENDER_SCALE;
      return { x: xPdf, y: yPdf };
    },
    [loaded, canvasSize, pageIndex]
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current || busy || renderBusy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setInFlight({ pageIndex, cssPoints: [{ x, y }] });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!inFlight || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const last = inFlight.cssPoints[inFlight.cssPoints.length - 1];
    const dx = Math.abs(x - last.x);
    const dy = Math.abs(y - last.y);
    if (dx < MIN_POINT_DELTA_CSS_PX && dy < MIN_POINT_DELTA_CSS_PX) return;
    setInFlight({ ...inFlight, cssPoints: [...inFlight.cssPoints, { x, y }] });
  };

  const onPointerUp = () => {
    if (!inFlight) return;
    if (inFlight.cssPoints.length < 2) {
      // Too short to be a meaningful stroke — drop it.
      setInFlight(null);
      return;
    }
    // Convert all in-flight CSS points to PDF points and store.
    const pdfPoints: StrokePoint[] = [];
    for (const p of inFlight.cssPoints) {
      const pt = cssToPdf(p.x, p.y);
      if (pt) pdfPoints.push(pt);
    }
    if (pdfPoints.length < 2) {
      setInFlight(null);
      return;
    }
    setStrokes((prev) => [
      ...prev,
      {
        id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        pageIndex: inFlight.pageIndex,
        color,
        widthPt,
        points: pdfPoints,
      },
    ]);
    setInFlight(null);
  };

  const removeStroke = (id: string) => {
    setStrokes((prev) => prev.filter((s) => s.id !== id));
  };

  const undo = () => {
    setStrokes((prev) => {
      // Drop the last stroke on the CURRENT page (so undo on page 3
      // doesn't accidentally remove the last stroke from page 1).
      const idx = [...prev]
        .reverse()
        .findIndex((s) => s.pageIndex === pageIndex);
      if (idx === -1) return prev;
      const trueIdx = prev.length - 1 - idx;
      return [...prev.slice(0, trueIdx), ...prev.slice(trueIdx + 1)];
    });
  };

  // Build SVG path from stroke points in PDF space. pdf-lib's
  // drawSvgPath uses SVG-style coords (y-down) but applies its own
  // transform, so we just feed (x, pageH - y) ... wait: actually
  // drawSvgPath() coordinates ARE PDF points with y-up. The path is
  // applied to the page's content stream with the current PDF
  // coordinate convention. So: just feed (x, y) directly.
  const strokeToSvgPath = (s: Stroke): string => {
    const parts: string[] = [];
    for (let i = 0; i < s.points.length; i++) {
      const p = s.points[i];
      parts.push(`${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    }
    return parts.join(" ");
  };

  const apply = async () => {
    if (!loaded) return;
    if (strokes.length === 0) {
      setError("No strokes yet — draw at least one mark before applying.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const doc = await PDFDocument.load(loaded.buffer.slice(0), { ignoreEncryption: true });
      const pages = doc.getPages();
      // Group strokes by page so we don't re-process unaffected pages.
      const byPage = new Map<number, Stroke[]>();
      for (const s of strokes) {
        const list = byPage.get(s.pageIndex) ?? [];
        list.push(s);
        byPage.set(s.pageIndex, list);
      }
      for (const [pIdx, list] of byPage.entries()) {
        const page = pages[pIdx];
        if (!page) continue;
        for (const s of list) {
          page.drawSvgPath(strokeToSvgPath(s), {
            borderColor: rgb(s.color.rgb[0], s.color.rgb[1], s.color.rgb[2]),
            borderWidth: s.widthPt,
          });
        }
      }
      const bytes = await doc.save({ useObjectStreams: true });
      const name = deriveOutputName(loaded.file.name, "-annotated");
      setResult({ bytes, name, size: bytes.length });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "free-draw-pdf",
          name,
          mime: "application/pdf",
          sizeBytes: bytes.length,
          sha256,
        });
      } catch (logErr) {
        console.warn("logToolResult failed (non-fatal):", logErr);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Apply failed.");
    } finally {
      setBusy(false);
    }
  };

  // SVG overlay path generation (CSS-pixel coords for live preview).
  // Uses scale = canvasSize.w / rect.width to keep the overlay aligned
  // with the canvas regardless of CSS scaling.
  const renderOverlayPaths = (): JSX.Element[] => {
    if (!loaded || !canvasSize || !canvasRef.current) return [];
    const rect = canvasRef.current.getBoundingClientRect();
    const canvasToCssX = rect.width / canvasSize.w;
    const canvasToCssY = rect.height / canvasSize.h;
    const pageH = loaded.pageSizes[pageIndex]?.heightPt ?? 0;
    const pdfToCss = (p: StrokePoint): { x: number; y: number } => ({
      x: p.x * RENDER_SCALE * canvasToCssX,
      y: (pageH - p.y) * RENDER_SCALE * canvasToCssY,
    });
    const els: JSX.Element[] = [];

    // Committed strokes on this page.
    for (const s of strokes) {
      if (s.pageIndex !== pageIndex) continue;
      const cssPoints = s.points.map(pdfToCss);
      const d = cssPoints
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(" ");
      els.push(
        <path
          key={s.id}
          d={d}
          stroke={s.color.css}
          strokeWidth={s.widthPt * RENDER_SCALE * canvasToCssX}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );
    }
    // In-flight stroke (live drag preview).
    if (inFlight && inFlight.pageIndex === pageIndex && inFlight.cssPoints.length > 1) {
      const d = inFlight.cssPoints
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(" ");
      els.push(
        <path
          key="in-flight"
          d={d}
          stroke={color.css}
          strokeWidth={widthPt * RENDER_SCALE * canvasToCssX}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={0.85}
        />
      );
    }
    return els;
  };

  const strokesOnThisPage = strokes.filter((s) => s.pageIndex === pageIndex);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {!loaded ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to draw, sketch, and annotate"
        />
      ) : (
        <>
          <div className="card" style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ color: "var(--fg-subtle)" }}><I.File size={18} /></span>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div title={loaded.file.name} style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {loaded.file.name}
              </div>
              <div className="subtle" style={{ fontSize: 12 }}>
                {humanSize(loaded.file.size)} · {loaded.pageSizes.length} page{loaded.pageSizes.length === 1 ? "" : "s"} · {strokes.length} stroke{strokes.length === 1 ? "" : "s"} total
              </div>
            </div>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={reset} aria-label="Remove file">
              <I.X size={14} />
            </button>
          </div>

          {/* Toolbar: color + width + page nav + undo */}
          <div className="card" style={{ padding: 12, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6 }}>
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c.label}
                  title={c.label}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: c.css,
                    border: color.id === c.id ? "3px solid var(--fg)" : "2px solid var(--border)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 12 }}>Width: {widthPt}pt</span>
              <input
                type="range"
                min={1}
                max={8}
                step={0.5}
                value={widthPt}
                onChange={(e) => setWidthPt(parseFloat(e.target.value))}
                style={{ width: 100 }}
              />
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={pageIndex === 0 || renderBusy}
                onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
              >
                ← Prev
              </button>
              <span className="muted" style={{ fontSize: 13, minWidth: 80, textAlign: "center" }}>
                Page {pageIndex + 1} / {loaded.pageSizes.length}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={pageIndex >= loaded.pageSizes.length - 1 || renderBusy}
                onClick={() => setPageIndex(Math.min(loaded.pageSizes.length - 1, pageIndex + 1))}
              >
                Next →
              </button>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={strokesOnThisPage.length === 0}
              onClick={undo}
              title="Remove the last stroke on this page"
            >
              ↶ Undo
            </button>
          </div>

          {/* Canvas + SVG overlay */}
          <div
            style={{
              position: "relative",
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
              background: "var(--bg-2)",
              maxWidth: "100%",
              touchAction: "none",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas
              ref={canvasRef}
              style={{ display: "block", width: "100%", height: "auto", cursor: "crosshair" }}
            />
            {canvasSize && (
              <svg
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
              >
                {renderOverlayPaths()}
              </svg>
            )}
            {renderBusy && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.4)",
                  display: "grid",
                  placeItems: "center",
                  color: "white",
                  fontSize: 13,
                }}
              >
                Loading page…
              </div>
            )}
          </div>

          {strokesOnThisPage.length > 0 && (
            <div className="muted" style={{ fontSize: 12 }}>
              {strokesOnThisPage.length} stroke{strokesOnThisPage.length === 1 ? "" : "s"} on this page · {strokes.length} total · click ↶ Undo to remove the last one
            </div>
          )}
        </>
      )}

      {error && <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>}

      {result && (
        <div className="card" style={{ padding: 20, borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent)", color: "var(--bg-1)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 2 }}>Annotations applied</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {strokes.length} stroke{strokes.length === 1 ? "" : "s"} · {humanSize(result.size)}
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => downloadBytes(result.bytes, result.name)}>
              <I.Download size={14} />
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {loaded && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>
            Reset
          </button>
        )}
        <button type="button" className="btn btn-primary" disabled={!loaded || busy || strokes.length === 0} onClick={apply}>
          {busy ? "Applying…" : `Apply ${strokes.length || ""} stroke${strokes.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
