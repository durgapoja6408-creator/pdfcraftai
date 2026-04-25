"use client";

// AddLinksTool — Tier 1 §1.5 P1.
//
// Click-and-drag a rectangular region on a PDF page, paste a URL, and
// the tool registers a /Link annotation pointing to that URL. Inverse
// of strip-links — together they bracket the link round-trip.
//
// Why this is interesting: pdf-lib has no high-level addLink() helper
// (drawSvgPath / drawText / drawRectangle write to the page CONTENT
// STREAM; annotations are different — they're a sibling of the content
// stream that the viewer overlays for interactivity). So we construct
// the /Link annotation ourselves via pdf-lib's low-level
// PDFDict / PDFArray / PDFString API, register it with
// doc.context.register(...), and append the resulting indirect ref to
// each page's /Annots array.
//
// Annotation shape:
//   << /Type /Annot
//      /Subtype /Link
//      /Rect [x1 y1 x2 y2]   — bottom-left and top-right in PDF points
//      /Border [0 0 0]       — no visible rectangle drawn around the link
//      /A << /Type /Action
//            /S /URI
//            /URI (https://...) >>
//   >>
//
// SEO: "add hyperlink to pdf", "make text clickable in pdf", "insert
// link in pdf online".

import { useState, useCallback, useEffect, useRef } from "react";
import {
  PDFDocument,
  PDFArray,
  PDFName,
  PDFString,
} from "pdf-lib";
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
const MIN_DRAG_CSS_PX = 6;

type LinkRegion = {
  id: string;
  pageIndex: number;
  // PDF points, origin bottom-left:
  xPdf: number;
  yPdf: number;
  widthPt: number;
  heightPt: number;
  url: string;
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

// Pending region: drag finished, URL input shown, user hasn't confirmed yet.
type Pending = Omit<LinkRegion, "url" | "id">;

export function AddLinksTool() {
  useTrackToolView("add-links", "Edit");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [links, setLinks] = useState<LinkRegion[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string>("");
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
    setLinks([]);
    setPending(null);
    setPendingUrl("");
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

  // Render the current page to canvas (cancellable on rapid page nav).
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
    setLinks([]);
    setPending(null);
    setPendingUrl("");
    setPageIndex(0);
    setError(null);
    setResult(null);
    setDrag(null);
  };

  // Drag handlers — same pattern as HighlightPdfTool. Drag completion
  // produces a pending region (rectangle with no URL yet); the URL
  // input below the canvas is what commits it to state.
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || busy || pending) return;
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

  const onMouseUp = () => {
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
    const xPdf = x0Canvas / RENDER_SCALE;
    const widthPt = (x1Canvas - x0Canvas) / RENDER_SCALE;
    const yTopPt = pageH - y0Canvas / RENDER_SCALE;
    const yBotPt = pageH - y1Canvas / RENDER_SCALE;
    setPending({
      pageIndex,
      xPdf,
      yPdf: yBotPt,
      widthPt,
      heightPt: yTopPt - yBotPt,
    });
    setPendingUrl("");
    setDrag(null);
  };

  const commitPending = () => {
    if (!pending) return;
    const url = pendingUrl.trim();
    if (!url) {
      setError("URL can't be empty.");
      return;
    }
    // Light validation — Razorpay-style permissive: must start with
    // http:// or https:// or be obviously a URL. We don't gate hard
    // because PDF readers themselves accept mailto:, tel:, etc.
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url) && !url.startsWith("/") && !url.startsWith("#")) {
      setError("URL should start with http://, https://, mailto:, or tel:");
      return;
    }
    setError(null);
    setLinks((prev) => [
      ...prev,
      {
        id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...pending,
        url,
      },
    ]);
    setPending(null);
    setPendingUrl("");
  };

  const cancelPending = () => {
    setPending(null);
    setPendingUrl("");
  };

  const removeLink = (id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  const apply = async () => {
    if (!loaded) return;
    if (links.length === 0) {
      setError("No link regions yet — drag a rectangle on the page first.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const doc = await PDFDocument.load(loaded.buffer.slice(0), { ignoreEncryption: true });
      const pages = doc.getPages();

      // Group by page so we update each page's /Annots once.
      const byPage = new Map<number, LinkRegion[]>();
      for (const l of links) {
        const list = byPage.get(l.pageIndex) ?? [];
        list.push(l);
        byPage.set(l.pageIndex, list);
      }

      for (const [pIdx, list] of byPage.entries()) {
        const page = pages[pIdx];
        if (!page) continue;

        // Build one /Link annotation per region.
        const newRefs = list.map((l) => {
          const annot = doc.context.obj({
            Type: "Annot",
            Subtype: "Link",
            Rect: [l.xPdf, l.yPdf, l.xPdf + l.widthPt, l.yPdf + l.heightPt],
            Border: [0, 0, 0],
            A: {
              Type: "Action",
              S: "URI",
              URI: PDFString.of(l.url),
            },
          });
          return doc.context.register(annot);
        });

        // Append to existing /Annots (preserving any prior annotations
        // — this is additive).
        const existing = page.node.Annots();
        if (existing instanceof PDFArray) {
          for (const ref of newRefs) existing.push(ref);
        } else {
          const fresh = doc.context.obj([]) as PDFArray;
          for (const ref of newRefs) fresh.push(ref);
          page.node.set(PDFName.of("Annots"), fresh);
        }
      }

      const bytes = await doc.save({ useObjectStreams: true });
      const name = deriveOutputName(loaded.file.name, "-links");
      setResult({ bytes, name, size: bytes.length });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "add-links",
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

  // Convert a PDF-space rectangle to CSS-pixel rectangle for overlay rendering.
  const pdfToCssRect = (xPdf: number, yPdf: number, widthPt: number, heightPt: number): { left: number; top: number; width: number; height: number } | null => {
    if (!loaded || !canvasSize || !canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const canvasToCssX = rect.width / canvasSize.w;
    const canvasToCssY = rect.height / canvasSize.h;
    const pageH = loaded.pageSizes[pageIndex]?.heightPt ?? 0;
    const xCanvas = xPdf * RENDER_SCALE;
    const widthCanvas = widthPt * RENDER_SCALE;
    const yTopCanvas = (pageH - (yPdf + heightPt)) * RENDER_SCALE;
    const heightCanvas = heightPt * RENDER_SCALE;
    return {
      left: xCanvas * canvasToCssX,
      top: yTopCanvas * canvasToCssY,
      width: widthCanvas * canvasToCssX,
      height: heightCanvas * canvasToCssY,
    };
  };

  const linksOnThisPage = links.filter((l) => l.pageIndex === pageIndex);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {!loaded ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to add clickable hyperlinks"
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
                {humanSize(loaded.file.size)} · {loaded.pageSizes.length} page{loaded.pageSizes.length === 1 ? "" : "s"} · {links.length} link{links.length === 1 ? "" : "s"} pending
              </div>
            </div>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={reset} aria-label="Remove file">
              <I.X size={14} />
            </button>
          </div>

          <div className="card" style={{ padding: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={pageIndex === 0 || renderBusy}
                onClick={() => { setPageIndex(Math.max(0, pageIndex - 1)); setPending(null); }}
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
                onClick={() => { setPageIndex(Math.min(loaded.pageSizes.length - 1, pageIndex + 1)); setPending(null); }}
              >
                Next →
              </button>
            </div>
            <div style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 12 }}>
              {linksOnThisPage.length} link{linksOnThisPage.length === 1 ? "" : "s"} on this page
            </span>
          </div>

          <div
            style={{
              position: "relative",
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
              background: "var(--bg-2)",
            }}
          >
            <canvas
              ref={canvasRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              style={{ display: "block", width: "100%", height: "auto", cursor: pending ? "default" : "crosshair" }}
            />
            {/* Existing committed link rectangles for this page */}
            {linksOnThisPage.map((l) => {
              const r = pdfToCssRect(l.xPdf, l.yPdf, l.widthPt, l.heightPt);
              if (!r) return null;
              return (
                <div
                  key={l.id}
                  title={l.url}
                  style={{
                    position: "absolute",
                    left: r.left,
                    top: r.top,
                    width: r.width,
                    height: r.height,
                    background: "rgba(26, 102, 217, 0.15)",
                    border: "1.5px solid rgba(26, 102, 217, 0.7)",
                    borderRadius: 2,
                    pointerEvents: "none",
                  }}
                />
              );
            })}
            {/* Pending region (drag committed but URL not yet entered) */}
            {pending && (() => {
              const r = pdfToCssRect(pending.xPdf, pending.yPdf, pending.widthPt, pending.heightPt);
              if (!r) return null;
              return (
                <div
                  style={{
                    position: "absolute",
                    left: r.left,
                    top: r.top,
                    width: r.width,
                    height: r.height,
                    background: "rgba(245, 158, 11, 0.18)",
                    border: "2px dashed rgba(245, 158, 11, 0.85)",
                    borderRadius: 2,
                    pointerEvents: "none",
                  }}
                />
              );
            })()}
            {/* Live drag preview */}
            {drag && canvasSize && canvasRef.current && (() => {
              const rect = canvasRef.current.getBoundingClientRect();
              const x = Math.min(drag.startXCss, drag.currentXCss);
              const y = Math.min(drag.startYCss, drag.currentYCss);
              const w = Math.abs(drag.currentXCss - drag.startXCss);
              const h = Math.abs(drag.currentYCss - drag.startYCss);
              return (
                <div
                  style={{
                    position: "absolute",
                    left: x,
                    top: y,
                    width: w,
                    height: h,
                    background: "rgba(26, 102, 217, 0.2)",
                    border: "1.5px dashed rgba(26, 102, 217, 0.85)",
                    pointerEvents: "none",
                  }}
                />
              );
            })()}
            {renderBusy && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", color: "white", fontSize: 13 }}>
                Loading page…
              </div>
            )}
          </div>

          {pending && (
            <div className="card" style={{ padding: 14, borderColor: "rgba(245, 158, 11, 0.6)", background: "rgba(245, 158, 11, 0.06)" }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Add link to selected region</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="url"
                  autoFocus
                  value={pendingUrl}
                  onChange={(e) => setPendingUrl(e.target.value)}
                  placeholder="https://example.com or mailto:you@example.com"
                  onKeyDown={(e) => { if (e.key === "Enter") commitPending(); if (e.key === "Escape") cancelPending(); }}
                  style={{ flex: 1, padding: "8px 12px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13 }}
                />
                <button type="button" className="btn btn-primary" onClick={commitPending}>Add link</button>
                <button type="button" className="btn btn-ghost" onClick={cancelPending}>Cancel</button>
              </div>
            </div>
          )}

          {linksOnThisPage.length > 0 && (
            <div className="card" style={{ padding: 12 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                Pending links on this page (click ✕ to remove):
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {linksOnThisPage.map((l) => (
                  <li key={l.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                    <span title={l.url} style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--fg-subtle)" }}>
                      {l.url}
                    </span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {Math.round(l.widthPt)}×{Math.round(l.heightPt)}pt
                    </span>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeLink(l.id)} aria-label={`Remove link to ${l.url}`}>
                      <I.X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
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
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 2 }}>Hyperlinks added</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {links.length} link{links.length === 1 ? "" : "s"} · {humanSize(result.size)}
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
        <button type="button" className="btn btn-primary" disabled={!loaded || busy || links.length === 0 || pending != null} onClick={apply}>
          {busy ? "Applying…" : `Apply ${links.length || ""} link${links.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
