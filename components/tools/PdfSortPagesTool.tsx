"use client";

// components/tools/PdfSortPagesTool.tsx
//
// Tier 2 (2026-04-27): Sort Pages / Organize PDF.
//
// Third consumer of the thumbnail-grid UX pattern (after Rotate,
// Extract, Delete). The interaction model is different enough from
// PageGridTool's selection pattern that it ships as a sibling
// component instead of a mode flag — Sort cares about ORDER (an array
// permutation), not selection (a Set membership). HTML5 native
// drag-and-drop handles the reorder, same approach PdfMergeTool uses
// for its file list.
//
// Each thumbnail keeps its ORIGINAL page number visible at all times
// — that's what users care about when reordering ("move the chapter
// 3 page before chapter 2"). The position in the grid is the new
// position in the output.

import { useState, useCallback, useEffect } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";

interface PageThumb {
  /** 1-based ORIGINAL page number from the source PDF — fixed, never reassigned. */
  pageNumber: number;
  /** 0-based ORIGINAL page index from the source PDF — used by the reorder op. */
  sourceIndex: number;
  thumbnailUrl: string;
  width: number;
  height: number;
}

interface SortResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  pageCount: number;
}

type Stage = "idle" | "rendering-thumbnails" | "ready" | "applying";

export function PdfSortPagesTool() {
  const tracker = useTrackToolView("sort-pages", "Organize");
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  // The grid's current order. pages[i].sourceIndex tells the op which
  // source page should land at output position i.
  const [pages, setPages] = useState<PageThumb[]>([]);
  // Snapshot of the original ordering for "Reset" — same array, but
  // sorted by sourceIndex.
  const [originalOrder, setOriginalOrder] = useState<PageThumb[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SortResultState | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    return () => pages.forEach((p) => URL.revokeObjectURL(p.thumbnailUrl));
  }, [pages]);

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
      setStage("rendering-thumbnails");

      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        setPdfBytes(bytes);

        const { rasterizePdf } = await import("@/lib/pdf/ops/rasterize");
        const rendered = await rasterizePdf(bytes, {
          format: "jpeg",
          scale: 0.5,
          quality: 0.7,
          onProgress: (done, total) => setProgress({ done, total }),
        });

        const thumbs: PageThumb[] = rendered.map((r, i) => {
          const blob = new Blob([r.bytes], { type: "image/jpeg" });
          return {
            pageNumber: r.pageNumber,
            sourceIndex: i,
            thumbnailUrl: URL.createObjectURL(blob),
            width: r.width,
            height: r.height,
          };
        });
        setPages(thumbs);
        setOriginalOrder(thumbs);
        setStage("ready");
      } catch (err) {
        console.error("sort-pages thumbnail render failed", err);
        const msg =
          err instanceof Error ? err.message : "Could not parse the PDF.";
        setError(msg);
        setStage("idle");
        tracker.error({ errorCode: "thumbnail_failed" });
      }
    },
    [tracker],
  );

  const reset = () => {
    pages.forEach((p) => URL.revokeObjectURL(p.thumbnailUrl));
    setPages([]);
    setOriginalOrder([]);
    setFile(null);
    setPdfBytes(null);
    setError(null);
    setResult(null);
    setStage("idle");
    setDragIndex(null);
    setProgress({ done: 0, total: 0 });
  };

  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) {
      return;
    }
    setPages((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const reverseOrder = () => {
    setPages((prev) => [...prev].reverse());
  };

  const restoreOriginal = () => {
    setPages(originalOrder);
  };

  // True when current order differs from original. Drives the Apply
  // button's enabled state — saving without changes would just produce
  // a no-op rewrite.
  const orderChanged = (() => {
    if (pages.length !== originalOrder.length) return false;
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].sourceIndex !== originalOrder[i].sourceIndex) return true;
    }
    return false;
  })();

  const apply = async () => {
    if (!pdfBytes || !file) return;
    if (!orderChanged) {
      setError("Order is unchanged — drag a thumbnail or use Reverse first.");
      return;
    }
    setError(null);
    setStage("applying");
    const t0 = performance.now();
    try {
      const newOrder = pages.map((p) => p.sourceIndex);
      const { reorderPages } = await import("@/lib/pdf/ops/page-selection");
      const r = await reorderPages(pdfBytes, newOrder);
      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "document"}-reordered.pdf`,
        pageCount: r.pageCount,
      });
      setStage("ready");
      tracker.success({
        creditCost: 0,
        pageCount: r.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("sort-pages apply failed", err);
      const msg =
        err instanceof Error ? err.message : "Could not save the reordered PDF.";
      setError(msg);
      setStage("ready");
      tracker.error({ errorCode: "sort_failed" });
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

  const busy = stage === "rendering-thumbnails" || stage === "applying";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to reorder its pages"
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
                {pages.length > 0
                  ? ` · ${pages.length} page${pages.length === 1 ? "" : "s"}`
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

      {stage === "rendering-thumbnails" && (
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
            Rendering page previews
            {progress.total > 0 ? ` · ${progress.done} / ${progress.total}` : "…"}
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
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
            Saving in new order…
          </div>
        </div>
      )}

      {stage === "ready" && pages.length > 0 && !result && (
        <>
          {/* Toolbar */}
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
              {orderChanged
                ? "Order changed — Apply to save the new sequence."
                : "Drag a thumbnail to a new position. Or use the bulk actions."}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={reverseOrder}
                disabled={pages.length < 2}
              >
                Reverse
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={restoreOriginal}
                disabled={!orderChanged}
              >
                Reset
              </button>
            </div>
          </div>

          {/* Thumbnail grid — draggable items */}
          <ol
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 14,
            }}
          >
            {pages.map((p, idx) => {
              const isDragging = dragIndex === idx;
              const isMoved = originalOrder[idx]?.sourceIndex !== p.sourceIndex;
              return (
                <li
                  key={p.sourceIndex}
                  draggable={!busy}
                  onDragStart={(e) => {
                    setDragIndex(idx);
                    // Firefox demands a payload for the drag to start.
                    try {
                      e.dataTransfer.setData("text/plain", String(idx));
                      e.dataTransfer.effectAllowed = "move";
                    } catch {
                      // ignored — some browsers block writes here
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null) moveTo(dragIndex, idx);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  aria-label={`Page ${p.pageNumber}, currently in position ${idx + 1} of ${pages.length}. Drag to a new position.`}
                  style={{
                    position: "relative",
                    background: "var(--bg-1)",
                    border: isMoved
                      ? "2px solid var(--accent)"
                      : "1px solid var(--border)",
                    margin: isMoved ? 0 : 1,
                    borderRadius: 8,
                    padding: 8,
                    cursor: busy ? "default" : "grab",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    opacity: isDragging ? 0.4 : 1,
                    transition: "border-color 0.12s, opacity 0.1s",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: `${p.width} / ${p.height}`,
                      overflow: "hidden",
                      borderRadius: 4,
                      background: "var(--bg-2)",
                      display: "grid",
                      placeItems: "center",
                      pointerEvents: "none", // so drag fires on the <li> not the img
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.thumbnailUrl}
                      alt={`Page ${p.pageNumber} preview`}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  </div>
                  <div
                    className="row"
                    style={{
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 11,
                    }}
                  >
                    <span
                      className="subtle"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      Page {p.pageNumber}
                    </span>
                    {isMoved && (
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 500,
                          background: "var(--accent-soft)",
                          color: "var(--accent)",
                        }}
                      >
                        Moved
                      </span>
                    )}
                  </div>
                  {/* Position indicator (new index in the output) */}
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "var(--bg-2)",
                      color: "var(--fg-muted)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    #{idx + 1}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: "16px 20px" }}
          role="status"
          aria-live="polite"
          aria-label={`Saved reordered PDF with ${result.pageCount} pages`}
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
                Reordered {result.pageCount} page
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
            Reorder another PDF
          </button>
        ) : stage === "ready" && pages.length > 0 ? (
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
              disabled={busy || !orderChanged}
              onClick={apply}
            >
              {busy
                ? "Saving…"
                : !orderChanged
                  ? "Reorder pages first"
                  : "Save in new order"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
