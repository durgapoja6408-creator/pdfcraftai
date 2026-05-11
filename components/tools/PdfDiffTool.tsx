"use client";

// components/tools/PdfDiffTool.tsx
//
// 2026-05-01 Tier 3 final wedge: visual pixel-level diff between
// two PDFs. Two-PDF input (similar shape to pdf-overlay), but the
// op is read-only on inputs and produces a freshly composed
// "diff visualization" PDF.

import { useState, useCallback, useRef } from "react";
import { I } from "@/components/icons/Icons";
import { humanSize, MAX_FILE_SIZE_BYTES, isPdfFile } from "@/lib/client/pdf-utils";
import { downloadBytes } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import { useScrollErrorIntoView } from "./useScrollErrorIntoView";
import { useHandoffConsumer } from "./useHandoffConsumer";
import { useFileUrlConsumer } from "./useFileUrlConsumer";
import { HandoffSuggestions } from "./HandoffSuggestions";
import { ToolHowItWorks } from "./ToolHowItWorks";
import { mapPdfOpError } from "@/lib/pdf/error-messages";
import type { DiffPageStat } from "@/lib/pdf/ops/diff";

interface ResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  pageCount: number;
  changedPageCount: number;
  stats: DiffPageStat[];
  aPageCount: number;
  bPageCount: number;
}

export function PdfDiffTool() {
  const tracker = useTrackToolView("pdf-diff", "Organize");
  const [aFile, setAFile] = useState<File | null>(null);
  const [bFile, setBFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [threshold, setThreshold] = useState(16);
  const aInputRef = useRef<HTMLInputElement>(null);
  const bInputRef = useRef<HTMLInputElement>(null);
  const [dragOverA, setDragOverA] = useState(false);
  const [dragOverB, setDragOverB] = useState(false);
  const errorRef = useScrollErrorIntoView(error);

  const onAFiles = useCallback(
    (files: File[]) => {
      setError(null);
      setResult(null);
      const f = files[0];
      if (!f) return;
      if (!isPdfFile(f)) {
        setError(`"${f.name}" is not a PDF file.`);
        return;
      }
      if (f.size > MAX_FILE_SIZE_BYTES) {
        setError(`"${f.name}" exceeds ${humanSize(MAX_FILE_SIZE_BYTES)}.`);
        return;
      }
      setAFile(f);
      tracker.upload(f);
    },
    [tracker],
  );

  // Standardized hooks load the FIRST input (PDF A — the dominant
  // surface). User adds B via its own dropzone.
  useHandoffConsumer(onAFiles);
  useFileUrlConsumer(onAFiles);

  const onBFiles = (files: File[]) => {
    setError(null);
    setResult(null);
    const f = files[0];
    if (!f) return;
    if (!isPdfFile(f)) {
      setError(`"${f.name}" is not a PDF file.`);
      return;
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      setError(`"${f.name}" exceeds ${humanSize(MAX_FILE_SIZE_BYTES)}.`);
      return;
    }
    setBFile(f);
  };

  const reset = () => {
    setAFile(null);
    setBFile(null);
    setError(null);
    setResult(null);
    setBusy(false);
  };

  const run = async () => {
    if (!aFile || !bFile) return;
    setError(null);
    setBusy(true);
    const t0 = performance.now();
    try {
      const aBytes = new Uint8Array(await aFile.arrayBuffer());
      const bBytes = new Uint8Array(await bFile.arrayBuffer());
      const { diffPdfs } = await import("@/lib/pdf/ops/diff");
      const r = await diffPdfs(aBytes, bBytes, { threshold });
      const baseName = aFile.name.replace(/\.pdf$/i, "");
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "comparison"}-diff.pdf`,
        pageCount: r.pageCount,
        changedPageCount: r.changedPageCount,
        stats: r.stats,
        aPageCount: r.aPageCount,
        bPageCount: r.bPageCount,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("pdf-diff failed", err);
      setError(
        mapPdfOpError(err instanceof Error ? err.message : "Couldn't compute the diff."),
      );
      tracker.error({ errorCode: "pdf_diff_failed" });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    downloadBytes(result.outputBytes, result.outputFileName);
  };

  const dropzoneStyle = (active: boolean): React.CSSProperties => ({
    border: `2px dashed ${active ? "var(--accent)" : "var(--border)"}`,
    borderRadius: 12,
    padding: "20px 24px",
    textAlign: "center" as const,
    background: active ? "var(--accent-soft)" : "var(--bg-1)",
    cursor: "pointer",
    transition: "border-color 0.15s, background 0.15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <ToolHowItWorks
        steps={[
          {
            title: "Drop in both PDFs (before + after)",
            body: "Up to 100 MB each. The diff runs locally in your browser — neither version leaves the page.",
          },
          {
            title: "We line up the text and compare",
            body: "Page-by-page text extraction + word-level diff surfaces added, removed, and modified passages with line context preserved.",
          },
          {
            title: "Review changes side-by-side",
            body: "Inline highlights show what moved between versions. Useful for contract redlines, doc-version reviews, or proofreading rounds. Export the changes as JSON for downstream tracking.",
          },
        ]}
        privacyNote="Both PDFs stay in your browser. The diff happens client-side — nothing is uploaded, logged, or persisted."
      />
      {!result && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                PDF A (original / before)
              </div>
              <div
                role="button"
                tabIndex={0}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverA(true);
                }}
                onDragLeave={() => setDragOverA(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverA(false);
                  if (e.dataTransfer.files.length > 0) {
                    onAFiles(Array.from(e.dataTransfer.files));
                  }
                }}
                onClick={() => aInputRef.current?.click()}
                style={dropzoneStyle(dragOverA)}
              >
                <I.File size={20} style={{ color: "var(--fg-muted)", marginBottom: 6 }} />
                <div style={{ fontSize: 13 }}>
                  {aFile ? aFile.name : "Drop or click to browse"}
                </div>
                {aFile && (
                  <div className="subtle" style={{ fontSize: 11, marginTop: 2 }}>
                    {humanSize(aFile.size)}
                  </div>
                )}
                <input
                  ref={aInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  hidden
                  onChange={(e) => {
                    if (e.target.files) onAFiles(Array.from(e.target.files));
                  }}
                />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                PDF B (revised / after)
              </div>
              <div
                role="button"
                tabIndex={0}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverB(true);
                }}
                onDragLeave={() => setDragOverB(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverB(false);
                  if (e.dataTransfer.files.length > 0) {
                    onBFiles(Array.from(e.dataTransfer.files));
                  }
                }}
                onClick={() => bInputRef.current?.click()}
                style={dropzoneStyle(dragOverB)}
              >
                <I.File size={20} style={{ color: "var(--fg-muted)", marginBottom: 6 }} />
                <div style={{ fontSize: 13 }}>
                  {bFile ? bFile.name : "Drop or click to browse"}
                </div>
                {bFile && (
                  <div className="subtle" style={{ fontSize: 11, marginTop: 2 }}>
                    {humanSize(bFile.size)}
                  </div>
                )}
                <input
                  ref={bInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  hidden
                  onChange={(e) => {
                    if (e.target.files) onBFiles(Array.from(e.target.files));
                  }}
                />
              </div>
            </div>
          </div>

          {(aFile || bFile) && (
            <div
              className="card"
              style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
                <span style={{ minWidth: 80 }}>Sensitivity:</span>
                <input
                  type="range"
                  min={4}
                  max={64}
                  step={2}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  style={{ flex: 1, maxWidth: 240 }}
                />
                <span style={{ minWidth: 60, textAlign: "right", fontFamily: "monospace" }}>
                  ±{threshold}
                </span>
              </label>
              <div className="subtle" style={{ fontSize: 12 }}>
                Per-channel pixel-delta threshold (0–255). Lower values catch
                tiny color shifts (anti-aliasing differences); higher values
                only flag substantial visual changes. Default 16 catches
                meaningful differences while ignoring rendering noise.
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p
          ref={errorRef as React.RefObject<HTMLParagraphElement>}
          role="alert"
          style={{ color: "var(--red)", fontSize: 13, margin: 0 }}
        >
          {error}
        </p>
      )}

      {busy && (
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
            Rendering both PDFs and computing pixel diff…
          </div>
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: "16px 20px" }}
          role="status"
          aria-live="polite"
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
                {result.changedPageCount === 0
                  ? "No visual differences detected"
                  : `${result.changedPageCount} of ${result.pageCount} page${result.pageCount === 1 ? "" : "s"} differ`}
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                A: {result.aPageCount} pages · B: {result.bPageCount} pages ·{" "}
                Output: {humanSize(result.outputBytes.length)}
              </div>
            </div>
            <button type="button" className="btn btn-sm btn-outline" onClick={download}>
              <I.Download size={12} /> Download diff PDF
            </button>
          </div>
          {/* Per-page stats table */}
          <div
            style={{
              marginTop: 14,
              maxHeight: 220,
              overflowY: "auto",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          >
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {result.stats.map((s, i) => (
                <li
                  key={s.pageNumber}
                  style={{
                    padding: "6px 12px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    display: "grid",
                    gridTemplateColumns: "60px 1fr 80px",
                    gap: 12,
                    alignItems: "center",
                    fontSize: 12,
                    fontFamily: "monospace",
                  }}
                >
                  <span>page {s.pageNumber}</span>
                  <span className="subtle" style={{ fontSize: 11 }}>
                    {s.source === "both"
                      ? "both"
                      : s.source === "a-only"
                        ? "only in A (blue)"
                        : "only in B (green)"}
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      color:
                        s.diffPercent === 0
                          ? "var(--fg-muted)"
                          : s.diffPercent > 5
                            ? "var(--red)"
                            : "var(--accent)",
                    }}
                  >
                    {s.diffPercent.toFixed(2)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <HandoffSuggestions
            sourceToolId="pdf-diff"
            outputBytes={result.outputBytes}
            outputFileName={result.outputFileName}
          />
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Compare another pair
          </button>
        ) : (
          <>
            {(aFile || bFile) && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={reset}
                disabled={busy}
              >
                Reset
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={!aFile || !bFile || busy}
              onClick={run}
            >
              {busy ? "Comparing…" : "Compare PDFs"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
