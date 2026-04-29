"use client";

// components/tools/PdfSplitTool.tsx
//
// Build 2 Wave 9 (2026-04-27): split a PDF into multiple PDFs.
// 2026-04-27 (visual split UX): rebuilt around a thumbnail grid with
// click-to-mark split points — same pattern as the rotate tool. Text
// expression survives as an "Advanced" toggle for power users / huge
// PDFs where rendering thumbnails is too slow.
//
// Visual mode:
//   1. Drop PDF → PDFium renders every page as a thumbnail.
//   2. Each thumbnail (except the last) has a right-edge "split here"
//      affordance. Click toggles a split AFTER that page.
//   3. Toolbar: "Split every page", "Split in half", "Clear splits".
//   4. Live segment preview: "3 outputs · pages 1-3, 4-7, 8-10".
//   5. Apply button calls splitPdf(mode: "range", ranges: built from
//      the split-point set).
//
// Advanced mode:
//   The original three modes (every / size / range) remain. Some users
//   know exactly what they want and don't need thumbnails — and huge
//   PDFs (>200 pages) render slowly enough that text-mode is faster.

import { useState, useCallback, useRef } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import { usePdfThumbnails, type PdfThumbnail } from "./usePdfThumbnails";
import { useVirtualGrid } from "./useVirtualGrid";
import { mapPdfOpError } from "@/lib/pdf/error-messages";
import type { SplitMode, SplitOutput } from "@/lib/pdf/ops/split";

// Split's thumbnail shape matches the hook's exactly — no enrichment.
type PageThumb = PdfThumbnail;

interface SplitResultState {
  outputs: SplitOutput[];
  sourceFileName: string;
  sourcePageCount: number;
}

type Stage = "idle" | "rendering-thumbnails" | "ready" | "applying";
type UIMode = "visual" | "advanced";

export function PdfSplitTool() {
  const tracker = useTrackToolView("split", "Organize");
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SplitResultState | null>(null);
  // Hook owns thumbnails, blob-URL lifecycle, and progress state.
  const { thumbnails, progress, render: renderThumbnails, reset: resetThumbnails } =
    usePdfThumbnails();

  // M5 (#193, 2026-04-29): cancellation. AbortController per render.
  const renderAbortRef = useRef<AbortController | null>(null);
  const cancelRender = useCallback(() => renderAbortRef.current?.abort(), []);

  // UI state
  const [uiMode, setUiMode] = useState<UIMode>("visual");
  // Visual-mode state: set of 0-based indices AFTER which to split.
  // `splits.has(2)` means "split after page 3 (index 2)" → segments
  // [0..2] and [3..end].
  const [splits, setSplits] = useState<Set<number>>(new Set());

  // Advanced-mode state (mirrors the previous text-input flow).
  const [advMode, setAdvMode] = useState<SplitMode>("every");
  const [advRanges, setAdvRanges] = useState<string>("1-5, 6-10");
  const [advChunkSize, setAdvChunkSize] = useState<number>(2);

  const onFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      setResult(null);
      const f = files[0];
      if (!f) return;
      if (!f.type.includes("pdf") && !f.name.toLowerCase().endsWith(".pdf")) {
        setError("That's not a PDF. Drop a .pdf file to continue.");
        return;
      }
      if (f.size > 100 * 1024 * 1024) {
        setError("File over 100 MB — try a smaller one.");
        return;
      }

      setFile(f);
      tracker.upload(f);
      setStage("rendering-thumbnails");

      // M5 (#193): supersede any prior in-flight render.
      renderAbortRef.current?.abort();
      const controller = new AbortController();
      renderAbortRef.current = controller;

      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        setPdfBytes(bytes);
        await renderThumbnails(bytes, controller.signal);
        setSplits(new Set());
        setStage("ready");
        renderAbortRef.current = null;
      } catch (err) {
        // M5: cancel-by-user — reset cleanly, don't surface as error.
        if (err instanceof DOMException && err.name === "AbortError") {
          setFile(null);
          setPdfBytes(null);
          setStage("idle");
          renderAbortRef.current = null;
          return;
        }
        console.error("split thumbnail render failed", err);
        const msg =
          err instanceof Error ? err.message : "Could not parse the PDF.";
        setError(mapPdfOpError(msg));
        setStage("idle");
        renderAbortRef.current = null;
        tracker.error({ errorCode: "thumbnail_failed" });
      }
    },
    [tracker, renderThumbnails],
  );

  const reset = () => {
    resetThumbnails();
    setFile(null);
    setPdfBytes(null);
    setError(null);
    setResult(null);
    setStage("idle");
    setSplits(new Set());
  };

  const toggleSplit = (idxAfter: number) => {
    setSplits((prev) => {
      const next = new Set(prev);
      if (next.has(idxAfter)) next.delete(idxAfter);
      else next.add(idxAfter);
      return next;
    });
  };

  const splitEveryPage = () => {
    const all = new Set<number>();
    for (let i = 0; i < thumbnails.length - 1; i++) all.add(i);
    setSplits(all);
  };

  const splitInHalf = () => {
    if (thumbnails.length < 2) return;
    const mid = Math.floor(thumbnails.length / 2) - 1;
    setSplits(new Set([mid]));
  };

  const clearSplits = () => setSplits(new Set());

  // Translate the splits set into a list of [start, end] 1-based
  // segment ranges. With pageCount=10 and splits={2,5}: segments are
  // [1-3], [4-6], [7-10]. Both ends inclusive.
  const segments = computeSegments(thumbnails.length, splits);

  const apply = async () => {
    if (!pdfBytes || !file) return;

    let opts: { mode: SplitMode; ranges?: string; chunkSize?: number };
    if (uiMode === "visual") {
      if (segments.length < 2) {
        setError("Mark at least one split point to create multiple PDFs.");
        return;
      }
      // Build a comma-separated range list for the existing op.
      const rangeStr = segments.map((s) => `${s.start}-${s.end}`).join(", ");
      opts = { mode: "range", ranges: rangeStr };
    } else {
      opts = {
        mode: advMode,
        ranges: advMode === "range" ? advRanges : undefined,
        chunkSize: advMode === "size" ? advChunkSize : undefined,
      };
    }

    setError(null);
    setStage("applying");
    const t0 = performance.now();
    try {
      const { splitPdf } = await import("@/lib/pdf/ops/split");
      const r = await splitPdf(pdfBytes, opts);
      setResult({
        outputs: r.outputs,
        sourceFileName: file.name,
        sourcePageCount: r.sourcePageCount,
      });
      setStage("ready");
      // M7 (#193): release input bytes after success. The split-tool
      // result is a list of N output blobs; the input is no longer
      // needed until the user resets and re-uploads.
      setPdfBytes(null);
      tracker.success({
        creditCost: 0,
        pageCount: r.sourcePageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("split failed", err);
      const msg = err instanceof Error ? err.message : "Could not split the PDF.";
      setError(mapPdfOpError(msg));
      setStage("ready");
      tracker.error({ errorCode: "split_failed" });
    }
  };

  const downloadOne = (out: SplitOutput) => {
    const blob = new Blob([out.bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = prefixed(out.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const downloadAllZip = async () => {
    if (!result) return;
    try {
      const JSZipMod = (await import("jszip")).default;
      const zip = new JSZipMod();
      for (const out of result.outputs) zip.file(prefixed(out.name), out.bytes);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        const baseName = result.sourceFileName.replace(/\.pdf$/i, "");
        a.download = `${baseName || "split"}-split.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (err) {
      console.error("zip failed", err);
      setError("Could not zip the outputs.");
    }
  };

  const prefixed = (name: string): string => {
    if (!result) return name;
    const base = result.sourceFileName.replace(/\.pdf$/i, "");
    if (!base) return name;
    return `${base}-${name}`;
  };

  const truncate = (s: string, max = 38) =>
    s.length <= max ? s : `${s.slice(0, max - 1)}…`;

  const busy = stage === "rendering-thumbnails" || stage === "applying";

  // G4 (#193): virtualization for huge split grids (500+ page PDFs).
  // Same hook as PageGridTool. Below the threshold returns
  // virtualized=false so the existing .map() runs unchanged.
  const firstAspect =
    thumbnails.length > 0 && thumbnails[0].width > 0
      ? thumbnails[0].height / thumbnails[0].width
      : 1.41;
  const virtual = useVirtualGrid({
    itemCount: thumbnails.length,
    minColWidth: 140,
    gap: 14,
    itemAspectRatio: firstAspect,
    // Tile chrome: 8px top padding + thumb + 6px gap + ~14px page
    // label + 8px bottom padding + 2px borders. The split-after
    // button lives in the gap, sized 0 vertically (extends from
    // top: 6 to bottom: 6 inside the card) so it doesn't change
    // row height.
    itemFooterHeight: 38,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to split"
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
                {thumbnails.length > 0 ? ` · ${thumbnails.length} pages` : ""}
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
            {progress.total > 0
              ? thumbnails.length > 0
                ? `Rendering page previews · ${progress.done} / ${progress.total} (showing as they finish)`
                : `Rendering page previews · ${progress.done} / ${progress.total}`
              : "Rendering page previews…"}
          </div>
          {/* M5 (#193): cancel an in-flight render. */}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={cancelRender}
            aria-label="Cancel preview rendering"
            style={{ padding: "4px 10px", fontSize: 12 }}
          >
            Cancel
          </button>
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
            Splitting PDF…
          </div>
        </div>
      )}

      {/* Show the grid as soon as the first thumbnail arrives — even
          while rendering is still in progress. The Apply button below
          stays gated on stage === "ready" so users can't split
          mid-stream (which would silently use a wrong segment count). */}
      {thumbnails.length > 0 && !result && stage !== "applying" && (
        <>
          {/* UI mode toggle */}
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="subtle" style={{ fontSize: 12 }}>Mode:</span>
            <div className="row" style={{ gap: 4 }}>
              <button
                type="button"
                className={`btn btn-sm ${uiMode === "visual" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setUiMode("visual")}
              >
                Visual
              </button>
              <button
                type="button"
                className={`btn btn-sm ${uiMode === "advanced" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setUiMode("advanced")}
              >
                Advanced
              </button>
            </div>
          </div>

          {uiMode === "visual" ? (
            <>
              {/* Visual toolbar */}
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
                  {splits.size === 0
                    ? "Click between two pages to split there. Each split creates one output PDF."
                    : `${segments.length} output${segments.length === 1 ? "" : "s"} · ${splits.size} split point${splits.size === 1 ? "" : "s"}`}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={splitEveryPage}
                  >
                    Split every page
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={splitInHalf}
                    disabled={thumbnails.length < 2}
                  >
                    Split in half
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={clearSplits}
                    disabled={splits.size === 0}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Segment preview chip strip */}
              {segments.length > 0 && (
                <div
                  className="card"
                  style={{
                    padding: "10px 14px",
                    background: "var(--bg-1)",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    alignItems: "center",
                    fontSize: 12,
                  }}
                  aria-label="Output segment preview"
                >
                  <span className="subtle">Outputs:</span>
                  {segments.map((seg, i) => (
                    <span
                      key={i}
                      style={{
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: "var(--accent-soft)",
                        color: "var(--accent)",
                        fontWeight: 500,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {seg.start === seg.end
                        ? `Page ${seg.start}`
                        : `Pages ${seg.start}–${seg.end}`}
                    </span>
                  ))}
                </div>
              )}

              {/* Thumbnail grid — G4 (#193) virtualizes when >= 80 pages.
                  Below the threshold, virtual.virtualized is false and
                  the original `.map()` runs unchanged with no extra
                  wrapper. Above it, only items in the visible row
                  range + 2-row overscan are rendered. */}
              <div
                ref={virtual.containerRef}
                style={
                  virtual.virtualized
                    ? { position: "relative", height: virtual.totalHeight }
                    : {
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(140px, 1fr))",
                        gap: 14,
                      }
                }
              >
                <div
                  style={
                    virtual.virtualized
                      ? {
                          position: "absolute",
                          top: virtual.offsetTop,
                          left: 0,
                          right: 0,
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fill, minmax(140px, 1fr))",
                          gap: 14,
                        }
                      : { display: "contents" }
                  }
                >
                {(virtual.virtualized
                  ? thumbnails.slice(virtual.startIndex, virtual.endIndex)
                  : thumbnails
                ).map((p, sliceIdx) => {
                  const idx = virtual.virtualized
                    ? virtual.startIndex + sliceIdx
                    : sliceIdx;
                  const isLast = idx === thumbnails.length - 1;
                  const isSplitAfter = splits.has(idx);
                  return (
                    <div
                      key={p.pageNumber}
                      style={{
                        position: "relative",
                        background: "var(--bg-1)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
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
                        style={{
                          textAlign: "center",
                          fontSize: 11,
                        }}
                      >
                        <span
                          className="subtle"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          Page {p.pageNumber}
                        </span>
                      </div>
                      {/*
                       * Split-after click target. Lives in the GAP to the
                       * right of this thumbnail (right: -7 with width: 14
                       * fits perfectly inside the grid's 14 px gap).
                       *
                       * Why moved out of the card: when this button lived
                       * inside the thumbnail (bottom-right, "Split here"
                       * label), users read it as a per-page action ("select
                       * page N for output") instead of a between-pages
                       * action ("split AFTER page N"). Putting the bar in
                       * the seam between cards makes the "boundary, not
                       * page" semantic visually obvious.
                       *
                       * Hidden on the last thumbnail of the doc (no "next
                       * page" exists to split before).
                       */}
                      {!isLast && (
                        <button
                          type="button"
                          onClick={() => toggleSplit(idx)}
                          aria-label={
                            isSplitAfter
                              ? `Remove split between page ${p.pageNumber} and page ${p.pageNumber + 1}`
                              : `Split between page ${p.pageNumber} and page ${p.pageNumber + 1}`
                          }
                          aria-pressed={isSplitAfter}
                          title={
                            isSplitAfter
                              ? "Click to remove this split"
                              : `Split between page ${p.pageNumber} and ${p.pageNumber + 1}`
                          }
                          style={{
                            position: "absolute",
                            top: 6,
                            bottom: 6,
                            right: -7,
                            width: 14,
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                            zIndex: 2,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              display: "block",
                              width: isSplitAfter ? 4 : 2,
                              height: "100%",
                              borderRadius: 2,
                              background: isSplitAfter
                                ? "var(--accent)"
                                : "var(--border)",
                              transition:
                                "background 0.15s ease, width 0.15s ease",
                            }}
                          />
                        </button>
                      )}
                    </div>
                  );
                })}
                </div>
              </div>
            </>
          ) : (
            <div
              className="card"
              style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div style={{ fontSize: 13, fontWeight: 500 }}>How to split</div>
              <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
                <legend
                  className="visually-hidden"
                  style={{ position: "absolute", left: -10000 }}
                >
                  Split mode
                </legend>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {(
                    [
                      { v: "every", label: "Every page → its own PDF" },
                      { v: "size", label: "Fixed-size chunks" },
                      { v: "range", label: "Custom ranges" },
                    ] as Array<{ v: SplitMode; label: string }>
                  ).map((opt) => (
                    <label
                      key={opt.v}
                      className={`btn btn-sm ${advMode === opt.v ? "btn-primary" : "btn-outline"}`}
                      style={{ cursor: "pointer" }}
                    >
                      <input
                        type="radio"
                        name="split-mode"
                        value={opt.v}
                        checked={advMode === opt.v}
                        onChange={() => setAdvMode(opt.v)}
                        style={{
                          position: "absolute",
                          opacity: 0,
                          pointerEvents: "none",
                        }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {advMode === "size" && (
                <label
                  style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}
                >
                  <span>Pages per output</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={advChunkSize}
                    onChange={(e) =>
                      setAdvChunkSize(Math.max(1, Number(e.target.value) || 1))
                    }
                    style={{
                      width: 80,
                      padding: "6px 10px",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      background: "var(--bg-1)",
                      color: "var(--fg)",
                    }}
                  />
                </label>
              )}

              {advMode === "range" && (
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}
                >
                  <span>Page ranges (one output per range)</span>
                  <input
                    type="text"
                    value={advRanges}
                    onChange={(e) => setAdvRanges(e.target.value)}
                    placeholder="e.g. 1-5, 6, 7-10"
                    style={{
                      padding: "8px 12px",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontFamily: "var(--mono, monospace)",
                      background: "var(--bg-1)",
                      color: "var(--fg)",
                    }}
                  />
                </label>
              )}
            </div>
          )}
        </>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden" }}
          role="status"
          aria-live="polite"
          aria-label={`Split into ${result.outputs.length} PDFs`}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--border)",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Split into {result.outputs.length} PDF
                {result.outputs.length === 1 ? "" : "s"}
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                Source: {result.sourcePageCount} page
                {result.sourcePageCount === 1 ? "" : "s"}
              </div>
            </div>
            {result.outputs.length > 1 && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={downloadAllZip}
              >
                <I.Download size={12} /> Download all (.zip)
              </button>
            )}
          </div>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              maxHeight: 360,
              overflowY: "auto",
            }}
          >
            {result.outputs.map((out, idx) => (
              <li
                key={idx}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 20px",
                  borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontFamily: "var(--mono, monospace)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {prefixed(out.name)}
                  </div>
                  <div className="subtle" style={{ fontSize: 11, marginTop: 2 }}>
                    Pages {out.pageNumbers[0]}
                    {out.pageNumbers.length > 1
                      ? `–${out.pageNumbers[out.pageNumbers.length - 1]}`
                      : ""}{" "}
                    · {humanSize(out.bytes.length)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => downloadOne(out)}
                >
                  <I.Download size={12} /> Download
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Split another PDF
          </button>
        ) : stage === "ready" && thumbnails.length > 0 ? (
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
              disabled={
                busy ||
                (uiMode === "visual" && segments.length < 2) ||
                (uiMode === "advanced" &&
                  advMode === "range" &&
                  !advRanges.trim())
              }
              onClick={apply}
            >
              {busy
                ? "Splitting…"
                : uiMode === "visual"
                  ? segments.length < 2
                    ? "Mark a split point first"
                    : `Split into ${segments.length} PDFs`
                  : "Split PDF"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Translate a set of "split-after" indices into 1-based [start, end]
 * segments. Both endpoints inclusive.
 *
 *   pageCount=10, splits={2, 5} →
 *     [{ start: 1, end: 3 }, { start: 4, end: 6 }, { start: 7, end: 10 }]
 */
function computeSegments(
  pageCount: number,
  splits: Set<number>,
): Array<{ start: number; end: number }> {
  if (pageCount === 0) return [];
  const sorted = [...splits].sort((a, b) => a - b);
  const segments: Array<{ start: number; end: number }> = [];
  let cursor = 0; // 0-based start of next segment
  for (const splitIdx of sorted) {
    if (splitIdx < 0 || splitIdx >= pageCount - 1) continue;
    segments.push({ start: cursor + 1, end: splitIdx + 1 });
    cursor = splitIdx + 1;
  }
  segments.push({ start: cursor + 1, end: pageCount });
  return segments;
}
