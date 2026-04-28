"use client";

// components/tools/PageGridTool.tsx
//
// Tier 2 (2026-04-27): shared thumbnail-grid runner for tools that
// operate on a SET of pages (Extract Pages, Delete Pages, future
// Sort Pages). Same UI shape across all of them: drop PDF → render
// thumbnails via PDFium → click to toggle selection → bulk actions
// → apply → download.
//
// Each consumer tool passes:
//   • Display strings  (drop prompt, helper text, action label, etc.)
//   • Selection style  ("accent" for extract, "destructive" for delete)
//   • Optional bounds  (minSelected, maxSelected)
//   • The op fn        (apply: bytes + selectedIndices → result)
//
// The base component handles the rest — file size cap, GA4 funnel,
// thumbnail render, selection state, bulk Select-all / Invert / Clear,
// aria-labelled busy + result cards, repeat-use CTA.
//
// Why a shared base instead of two near-duplicate runners: Extract
// and Delete are visually 95% identical. Maintaining two copies leads
// to drift the moment we tweak any UI detail (button placement, busy
// label, accessibility wiring). One base + thin wrappers means a
// single source of truth for the page-selection UX.

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import { usePdfThumbnails, type PdfThumbnail } from "./usePdfThumbnails";
import type { ToolGroup } from "@/lib/tools";

type PageThumb = PdfThumbnail;

export interface PageGridApplyResult {
  /** Serialized output PDF bytes. */
  outputBytes: Uint8Array;
  /** Suggested download filename (with .pdf). */
  outputFileName: string;
  /** Pages in the output PDF (after the op). */
  resultPageCount: number;
  /** Pages the user explicitly selected (for the success card copy). */
  selectedCount: number;
  /** Total pages in the source (for the success card copy). */
  sourcePageCount: number;
}

export interface PageGridToolProps {
  /** Tool id, must match lib/tools.ts. */
  toolId: string;
  /** Tool group, used for GA4 funnel categorization. */
  toolGroup: ToolGroup;

  // ---- Display ----
  dropPrompt: string;
  dropHint?: string;
  /** Helper text shown above the grid when no pages are selected yet. */
  helperWhenEmpty: string;
  /** Helper text generator when pages are selected. */
  helperWhenSelected?: (count: number, total: number) => string;
  /** Selection-state label inside each thumbnail (e.g. "Extract"). */
  selectedBadgeLabel: string;
  /** Action button label when ready, parameterized on selection count. */
  actionLabel: (count: number) => string;
  /** Disabled-button label when no selection (e.g. "Pick pages first"). */
  emptyActionLabel: string;
  /** Spinner label during apply. */
  busyLabel: string;
  /** Repeat-use CTA after the user downloads the result. */
  successCta: string;
  /** ARIA-friendly description for the success card. */
  successDescription: (r: PageGridApplyResult) => string;

  // ---- Selection styling ----
  /** "accent" = blue accent border (kept pages); "destructive" = red. */
  selectionStyle: "accent" | "destructive";

  // ---- Constraints ----
  /** Minimum pages user must select before Apply. Default 1. */
  minSelected?: number;
  /**
   * Maximum pages user can select. Returns the cap given total page count.
   * Default: total (no cap). Used by Delete to prevent "delete every page".
   */
  maxSelected?: (total: number) => number;
  /** Tracker error code on failure ("extract_failed" / "delete_failed"). */
  errorCode: string;

  // ---- The actual operation ----
  apply: (
    bytes: Uint8Array,
    selectedIndices: number[],
    sourceFile: File,
    sourcePageCount: number,
  ) => Promise<Omit<PageGridApplyResult, "sourcePageCount">>;
}

type Stage = "idle" | "rendering-thumbnails" | "ready" | "applying";

export function PageGridTool(props: PageGridToolProps) {
  const tracker = useTrackToolView(props.toolId, props.toolGroup);
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PageGridApplyResult | null>(null);
  // Hook owns thumbnail array, blob-URL lifecycle, and progress
  // state. Three near-identical 25-line blocks across PageGridTool /
  // SortPages / Split collapsed into one render() call here.
  const { thumbnails, progress, render: renderThumbnails, reset: resetThumbnails } =
    usePdfThumbnails();

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
        await renderThumbnails(bytes);
        setSelected(new Set());
        setStage("ready");
      } catch (err) {
        console.error(`${props.toolId} thumbnail render failed`, err);
        const msg =
          err instanceof Error ? err.message : "Could not parse the PDF.";
        setError(msg);
        setStage("idle");
        tracker.error({ errorCode: "thumbnail_failed" });
      }
    },
    [props.toolId, tracker, renderThumbnails],
  );

  const reset = () => {
    resetThumbnails();
    setFile(null);
    setPdfBytes(null);
    setSelected(new Set());
    setError(null);
    setResult(null);
    setStage("idle");
  };

  const togglePage = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAll = () => {
    const cap = props.maxSelected
      ? props.maxSelected(thumbnails.length)
      : thumbnails.length;
    const next = new Set<number>();
    for (let i = 0; i < Math.min(cap, thumbnails.length); i++) next.add(i);
    setSelected(next);
  };

  const invertSelection = () => {
    setSelected((prev) => {
      const next = new Set<number>();
      for (let i = 0; i < thumbnails.length; i++) {
        if (!prev.has(i)) next.add(i);
      }
      // Respect maxSelected cap — drop items past the cap.
      if (props.maxSelected) {
        const cap = props.maxSelected(thumbnails.length);
        if (next.size > cap) {
          const trimmed = new Set<number>();
          let added = 0;
          for (const i of [...next].sort((a, b) => a - b)) {
            if (added >= cap) break;
            trimmed.add(i);
            added++;
          }
          return trimmed;
        }
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const apply = async () => {
    if (!pdfBytes || !file) return;
    const min = props.minSelected ?? 1;
    if (selected.size < min) {
      setError(
        min === 1
          ? "Pick at least one page first."
          : `Pick at least ${min} pages first.`,
      );
      return;
    }
    if (props.maxSelected) {
      const cap = props.maxSelected(thumbnails.length);
      if (selected.size > cap) {
        setError(
          `Pick at most ${cap} of ${thumbnails.length} pages.`,
        );
        return;
      }
    }
    setError(null);
    setStage("applying");
    const t0 = performance.now();
    try {
      const orderedIndices = [...selected].sort((a, b) => a - b);
      const r = await props.apply(
        pdfBytes,
        orderedIndices,
        file,
        thumbnails.length,
      );
      // sourcePageCount is owned by the base component (it knows it
      // from the rendered thumbnails) so the wrapper op fns don't have
      // to pass it through.
      setResult({ ...r, sourcePageCount: thumbnails.length });
      setStage("ready");
      tracker.success({
        creditCost: 0,
        pageCount: r.selectedCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error(`${props.toolId} apply failed`, err);
      const msg =
        err instanceof Error ? err.message : "Could not apply the operation.";
      setError(msg);
      setStage("ready");
      tracker.error({ errorCode: props.errorCode });
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

  const accentColor =
    props.selectionStyle === "destructive"
      ? "var(--red, #ef4444)"
      : "var(--accent)";
  // Soft variant used for badge background. Falls back gracefully if
  // --accent-soft isn't defined (the destructive path inlines its own
  // rgba).
  const softBg =
    props.selectionStyle === "destructive"
      ? "rgba(239, 68, 68, 0.14)"
      : "var(--accent-soft)";

  const busy = stage === "rendering-thumbnails" || stage === "applying";
  const min = props.minSelected ?? 1;
  const cap = props.maxSelected
    ? props.maxSelected(thumbnails.length)
    : thumbnails.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt={props.dropPrompt}
          hint={props.dropHint ?? "Up to 100 MB · runs privately in your browser"}
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
                {thumbnails.length > 0
                  ? ` · ${thumbnails.length} page${thumbnails.length === 1 ? "" : "s"}`
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
            {progress.total > 0
              ? thumbnails.length > 0
                ? `Rendering page previews · ${progress.done} / ${progress.total} (showing as they finish)`
                : `Rendering page previews · ${progress.done} / ${progress.total}`
              : "Rendering page previews…"}
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
            {props.busyLabel}
          </div>
        </div>
      )}

      {/* Show the grid as soon as the FIRST thumbnail arrives — even
          while rendering is still in progress. Live-streaming UX:
          users see thumbnails appearing instead of staring at a
          spinner for 40s on a 500-page PDF. The progress card above
          stays mounted until rendering completes. */}
      {thumbnails.length > 0 && !result && stage !== "applying" && (
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
              {selected.size === 0
                ? props.helperWhenEmpty
                : props.helperWhenSelected
                  ? props.helperWhenSelected(selected.size, thumbnails.length)
                  : `${selected.size} of ${thumbnails.length} page${thumbnails.length === 1 ? "" : "s"} selected`}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={selectAll}
                disabled={selected.size === thumbnails.length}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={invertSelection}
                disabled={thumbnails.length === 0}
              >
                Invert
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={clearSelection}
                disabled={selected.size === 0}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Thumbnail grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 14,
            }}
          >
            {thumbnails.map((p, idx) => {
              const isSelected = selected.has(idx);
              return (
                <button
                  key={p.pageNumber}
                  type="button"
                  onClick={() => togglePage(idx)}
                  aria-label={
                    isSelected
                      ? `Deselect page ${p.pageNumber}`
                      : `Select page ${p.pageNumber}`
                  }
                  aria-pressed={isSelected}
                  style={{
                    position: "relative",
                    background: "var(--bg-1)",
                    border: isSelected
                      ? `2px solid ${accentColor}`
                      : "1px solid var(--border)",
                    // Compensate the 1-vs-2 px border so the grid doesn't
                    // jiggle when a card flips selected.
                    margin: isSelected ? 0 : 1,
                    borderRadius: 8,
                    padding: 8,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    font: "inherit",
                    color: "inherit",
                    textAlign: "left",
                    transition: "border-color 0.12s",
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
                      // For the destructive (delete) tool: dim the image
                      // when selected so it visually reads as "marked
                      // for removal" instead of "highlighted".
                      opacity:
                        props.selectionStyle === "destructive" && isSelected
                          ? 0.5
                          : 1,
                      transition: "opacity 0.12s",
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
                    {isSelected && (
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 500,
                          background: softBg,
                          color: accentColor,
                        }}
                      >
                        {props.selectedBadgeLabel}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: "16px 20px" }}
          role="status"
          aria-live="polite"
          aria-label={props.successDescription(result)}
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
                {props.successDescription(result)}
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                Output: {humanSize(result.outputBytes.length)} ·{" "}
                {result.resultPageCount} page
                {result.resultPageCount === 1 ? "" : "s"}
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
            {props.successCta}
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
              disabled={busy || selected.size < min || selected.size > cap}
              onClick={apply}
            >
              {busy
                ? props.busyLabel
                : selected.size < min
                  ? props.emptyActionLabel
                  : props.actionLabel(selected.size)}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
