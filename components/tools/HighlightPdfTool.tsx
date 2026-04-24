"use client";

// HighlightPdfTool — Tier 1 §1.5 P0.
//
// Drag-to-select highlight rectangles across multi-page PDFs. Same
// canvas-overlay pattern as AddTextBoxTool (render via pdfjs → user
// interacts in canvas space → convert to PDF points → apply via
// pdf-lib), but the interaction is drag rather than click.
//
// Highlight fidelity note (honest in the UI + FAQ):
//   Real PDF highlights are `/Annot` objects of subtype /Highlight
//   — they sit in the page's annotation array, not in the content
//   stream. Most consumers (viewers, screen readers, copy-paste)
//   handle annotation-style highlights better than content-stream
//   rectangles. But pdf-lib doesn't expose a high-level annotation
//   constructor — building one from scratch requires manual PDFDict
//   / PDFArray surgery that gets brittle fast. For the free MVP we
//   draw semi-transparent rectangles via `page.drawRectangle(...,
//   { opacity: 0.4 })` which every viewer renders consistently.
//   When we ship a paid Annotate tool later, we'll upgrade to real
//   /Highlight annotations via low-level pdf-lib ops.
//
// Coordinate conversion reuses the AddTextBoxTool logic: canvas
// renders at RENDER_SCALE=1.5x, y-axis flipped (pdfjs top-origin vs
// pdf-lib bottom-origin).

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
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

const RENDER_SCALE = 1.5;

// 0-1 opacity at apply time. 40% is the sweet spot — low enough to
// read the underlying text cleanly, high enough that the highlight
// is unmistakable. Matches Preview.app / Acrobat defaults.
const APPLY_OPACITY = 0.4;

// Preview overlay alpha while the user is still staging highlights —
// slightly higher (55%) so the rectangles pop against the canvas
// before commit. At apply time we drop to APPLY_OPACITY.
const PREVIEW_ALPHA = 0.55;

// Minimum drag distance (in CSS pixels) before a down→move→up
// counts as a rectangle rather than a stray click. Guards against
// accidentally committing zero-sized highlights.
const MIN_DRAG_CSS_PX = 6;

type HighlightColor = {
  id: string;
  label: string;
  rgb: [number, number, number]; // 0-1 floats for pdf-lib
  css: string;
};

const COLORS: readonly HighlightColor[] = [
  { id: "yellow", label: "Yellow", rgb: [1.0, 0.92, 0.23], css: "rgba(255, 235, 59, A)" },
  { id: "green", label: "Green", rgb: [0.55, 0.9, 0.45], css: "rgba(140, 230, 115, A)" },
  { id: "pink", label: "Pink", rgb: [1.0, 0.5, 0.72], css: "rgba(255, 128, 184, A)" },
  { id: "blue", label: "Blue", rgb: [0.45, 0.78, 1.0], css: "rgba(115, 200, 255, A)" },
  { id: "orange", label: "Orange", rgb: [1.0, 0.66, 0.3], css: "rgba(255, 168, 77, A)" },
] as const;

type Highlight = {
  id: string;
  pageIndex: number;
  // PDF points, origin bottom-left:
  xPdf: number;
  yPdf: number;
  widthPt: number;
  heightPt: number;
  color: HighlightColor;
};

type Loaded = {
  file: File;
  buffer: ArrayBuffer;
  pageSizes: Array<{ widthPt: number; heightPt: number }>;
};

type Drag = {
  startXCss: number;
  startYCss: number;
  currentXCss: number;
  currentYCss: number;
};

export function HighlightPdfTool() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [color, setColor] = useState<HighlightColor>(COLORS[0]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [busy, setBusy] = useState(false);
  const [renderBusy, setRenderBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const onFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setHighlights([]);
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
        pageSizes: pages.map((p) => ({
          widthPt: p.getWidth(),
          heightPt: p.getHeight(),
        })),
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
    setHighlights([]);
    setPageIndex(0);
    setError(null);
    setResult(null);
    setDrag(null);
  };

  // Mouse event handlers — drag state tracks both endpoints in CSS
  // pixels. On mouse-up we convert to PDF points and push to state,
  // unless the drag was too small (a click on empty canvas).
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || busy) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrag({ startXCss: x, startYCss: y, currentXCss: x, currentYCss: y });
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDrag({
      ...drag,
      currentXCss: e.clientX - rect.left,
      currentYCss: e.clientY - rect.top,
    });
  };

  const commitDrag = () => {
    if (!drag || !loaded || !canvasRef.current || !canvasSize) {
      setDrag(null);
      return;
    }
    const dx = Math.abs(drag.currentXCss - drag.startXCss);
    const dy = Math.abs(drag.currentYCss - drag.startYCss);
    if (dx < MIN_DRAG_CSS_PX || dy < MIN_DRAG_CSS_PX) {
      setDrag(null);
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const cssToCanvas = canvasSize.w / rect.width;
    const x0Canvas = Math.min(drag.startXCss, drag.currentXCss) * cssToCanvas;
    const y0Canvas = Math.min(drag.startYCss, drag.currentYCss) * cssToCanvas;
    const x1Canvas = Math.max(drag.startXCss, drag.currentXCss) * cssToCanvas;
    const y1Canvas = Math.max(drag.startYCss, drag.currentYCss) * cssToCanvas;
    const pageH = loaded.pageSizes[pageIndex]?.heightPt ?? 0;
    // Convert. Canvas-y grows downward; pdf-lib y grows upward.
    // Rectangle in PDF space = (xPdf, yPdf, widthPt, heightPt)
    // where (xPdf, yPdf) is the BOTTOM-LEFT corner.
    const xPdf = x0Canvas / RENDER_SCALE;
    const widthPt = (x1Canvas - x0Canvas) / RENDER_SCALE;
    const yTopPt = pageH - y0Canvas / RENDER_SCALE;
    const yBotPt = pageH - y1Canvas / RENDER_SCALE;
    const yPdf = yBotPt;
    const heightPt = yTopPt - yBotPt;
    setHighlights((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        pageIndex,
        xPdf,
        yPdf,
        widthPt,
        heightPt,
        color,
      },
    ]);
    setDrag(null);
  };

  const removeHighlight = (id: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  };

  const apply = async () => {
    if (!loaded) return;
    if (highlights.length === 0) {
      setError("Draw at least one highlight first.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const doc = await PDFDocument.load(loaded.buffer.slice(0), {
        ignoreEncryption: true,
      });
      for (const h of highlights) {
        const page = doc.getPage(h.pageIndex);
        page.drawRectangle({
          x: h.xPdf,
          y: h.yPdf,
          width: h.widthPt,
          height: h.heightPt,
          color: rgb(h.color.rgb[0], h.color.rgb[1], h.color.rgb[2]),
          opacity: APPLY_OPACITY,
          borderWidth: 0,
        });
      }
      const bytes = await doc.save({ useObjectStreams: true });
      const name = deriveOutputName(loaded.file.name, "-highlighted");
      setResult({ bytes, name, size: bytes.length });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "highlight-pdf",
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

  const currentPageHighlights = useMemo(
    () => highlights.filter((h) => h.pageIndex === pageIndex),
    [highlights, pageIndex]
  );

  // Build CSS for the in-progress drag rectangle (if any).
  const dragCss = useMemo(() => {
    if (!drag || !canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width === 0) return null;
    const left = (Math.min(drag.startXCss, drag.currentXCss) / rect.width) * 100;
    const top = (Math.min(drag.startYCss, drag.currentYCss) / rect.height) * 100;
    const width =
      (Math.abs(drag.currentXCss - drag.startXCss) / rect.width) * 100;
    const height =
      (Math.abs(drag.currentYCss - drag.startYCss) / rect.height) * 100;
    return { left, top, width, height };
  }, [drag]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!loaded ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to highlight"
        />
      ) : (
        <>
          <div
            className="card"
            style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}
          >
            <span style={{ color: "var(--fg-subtle)" }}>
              <I.File size={18} />
            </span>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div
                title={loaded.file.name}
                style={{
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {loaded.file.name}
              </div>
              <div className="subtle" style={{ fontSize: 12 }}>
                {humanSize(loaded.file.size)} · {loaded.pageSizes.length} page
                {loaded.pageSizes.length === 1 ? "" : "s"} · {highlights.length} highlight
                {highlights.length === 1 ? "" : "s"} staged
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={busy}
              onClick={reset}
              aria-label="Remove file"
            >
              <I.X size={14} />
            </button>
          </div>

          <div
            className="card"
            style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div
              style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)" }}
            >
              HIGHLIGHT COLOR
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COLORS.map((c) => {
                const selected = color.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setColor(c)}
                    aria-pressed={selected}
                    style={{
                      padding: "8px 14px",
                      border: `2px solid ${selected ? "var(--fg)" : "var(--border)"}`,
                      background: c.css.replace("A", "1"),
                      borderRadius: "var(--radius)",
                      cursor: busy ? "not-allowed" : "pointer",
                      fontSize: 13,
                      color: "black",
                      fontWeight: selected ? 600 : 400,
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            <div className="subtle" style={{ fontSize: 12 }}>
              Drag on the page below to draw a highlight rectangle. Apply opacity
              is {Math.round(APPLY_OPACITY * 100)}%.
            </div>
          </div>

          <div
            className="card"
            style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div
              className="row"
              style={{ justifyContent: "space-between", gap: 10, alignItems: "center" }}
            >
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || pageIndex === 0}
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              >
                <I.ArrowLeft size={14} />
                <span>Prev</span>
              </button>
              <div
                className="mono"
                style={{ fontSize: 13, color: "var(--fg-subtle)" }}
              >
                Page {pageIndex + 1} / {loaded.pageSizes.length}
                {renderBusy ? " · rendering…" : ""}
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || pageIndex >= loaded.pageSizes.length - 1}
                onClick={() =>
                  setPageIndex((p) => Math.min(loaded.pageSizes.length - 1, p + 1))
                }
              >
                <span>Next</span>
                <I.ArrowRight size={14} />
              </button>
            </div>

            <div
              style={{
                position: "relative",
                width: "100%",
                overflow: "auto",
                background: "var(--bg-2)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                padding: 12,
              }}
            >
              <div
                style={{
                  position: "relative",
                  margin: "0 auto",
                  width: canvasSize ? canvasSize.w : undefined,
                  maxWidth: "100%",
                }}
              >
                <canvas
                  ref={canvasRef}
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={commitDrag}
                  onMouseLeave={commitDrag}
                  style={{
                    display: "block",
                    width: "100%",
                    maxWidth: canvasSize ? canvasSize.w : undefined,
                    height: "auto",
                    background: "var(--bg-1)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    cursor: busy ? "default" : "crosshair",
                    userSelect: "none",
                  }}
                />
                {/* Staged highlights for this page. */}
                {canvasSize &&
                  currentPageHighlights.map((h) => {
                    const pageH = loaded.pageSizes[pageIndex]?.heightPt ?? 0;
                    if (pageH === 0) return null;
                    const pageWpx = canvasSize.w / RENDER_SCALE;
                    const pageHpx = canvasSize.h / RENDER_SCALE;
                    const leftPct = (h.xPdf / pageWpx) * 100;
                    const widthPct = (h.widthPt / pageWpx) * 100;
                    // Convert yPdf (bottom-origin) to canvas-top-origin.
                    const topPct = ((pageH - h.yPdf - h.heightPt) / pageHpx) * 100;
                    const heightPct = (h.heightPt / pageHpx) * 100;
                    return (
                      <div
                        key={h.id}
                        style={{
                          position: "absolute",
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                          width: `${widthPct}%`,
                          height: `${heightPct}%`,
                          background: h.color.css.replace("A", String(PREVIEW_ALPHA)),
                          borderRadius: 2,
                          pointerEvents: "auto",
                        }}
                        title={`${h.color.label} · ${Math.round(h.widthPt)}×${Math.round(h.heightPt)} pt`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeHighlight(h.id);
                          }}
                          aria-label="Remove highlight"
                          style={{
                            position: "absolute",
                            top: 2,
                            right: 2,
                            border: "none",
                            background: "rgba(0,0,0,0.2)",
                            color: "white",
                            width: 16,
                            height: 16,
                            borderRadius: 8,
                            fontSize: 10,
                            cursor: "pointer",
                            padding: 0,
                            lineHeight: "16px",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                {/* In-progress drag preview. */}
                {dragCss && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${dragCss.left}%`,
                      top: `${dragCss.top}%`,
                      width: `${dragCss.width}%`,
                      height: `${dragCss.height}%`,
                      background: color.css.replace("A", String(PREVIEW_ALPHA)),
                      border: "1px dashed rgba(0,0,0,0.3)",
                      borderRadius: 2,
                      pointerEvents: "none",
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {highlights.length > 0 && (
            <div className="card" style={{ padding: "12px 16px" }}>
              <div
                style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)", marginBottom: 8 }}
              >
                STAGED HIGHLIGHTS ({highlights.length})
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                {highlights.map((h) => (
                  <li
                    key={h.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: "6px 10px",
                      background: h.pageIndex === pageIndex ? "var(--accent-soft)" : "var(--bg-1)",
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        background: h.color.css.replace("A", "1"),
                        borderRadius: 3,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      className="mono"
                      style={{ color: "var(--fg-subtle)", width: 50, flexShrink: 0 }}
                    >
                      p.{h.pageIndex + 1}
                    </span>
                    <span style={{ flex: 1 }}>{h.color.label}</span>
                    <span className="mono subtle" style={{ fontSize: 11 }}>
                      {Math.round(h.widthPt)} × {Math.round(h.heightPt)} pt
                    </span>
                    <button
                      type="button"
                      onClick={() => removeHighlight(h.id)}
                      className="btn btn-sm btn-ghost"
                      disabled={busy}
                      aria-label="Remove highlight"
                    >
                      <I.X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {result && (
        <div
          className="card"
          style={{
            padding: 20,
            borderColor: "var(--accent)",
            background: "var(--accent-soft)",
          }}
        >
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--accent)",
                color: "var(--bg-1)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 2 }}>
                {highlights.length} highlight{highlights.length === 1 ? "" : "s"} applied
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {humanSize(result.size)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => downloadBytes(result.bytes, result.name)}
            >
              <I.Download size={14} />
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {loaded && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={reset}
          >
            Reset
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!loaded || busy || highlights.length === 0}
          onClick={apply}
        >
          {busy ? "Applying…" : `Apply (${highlights.length})`}
        </button>
      </div>
    </div>
  );
}
