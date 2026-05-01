"use client";

// components/tools/PdfOverlayTool.tsx
//
// 2026-05-01 Tier 2: stamp one PDF onto another (letterhead / template /
// watermark). Two-PDF input shape — bespoke component (the existing
// shared bases assume single-PDF input).
//
// Standardized hooks wired:
//   ✓ useTrackToolView (GA4 funnel)
//   ✓ mapPdfOpError (canonical user-facing errors)
//   ✓ suffixedFilename (collision-safe download names)
//   ✓ useScrollErrorIntoView (auto-scroll error into view)
//   ✓ HandoffSuggestions (cross-tool funnel after success)
//   ✓ useHandoffConsumer (loads BASE PDF from handoff registry)
//   ✓ useFileUrlConsumer (loads BASE PDF from ?file= deep-link)
// All 7 hooks present — pdf-overlay's input IS PDF (just two of them);
// the standardized hooks load the base/dominant input and a custom
// dropzone handles the secondary overlay file.

import { useState, useCallback, useRef } from "react";
import { I } from "@/components/icons/Icons";
import { humanSize, MAX_FILE_SIZE_BYTES } from "@/lib/client/pdf-utils";
import { suffixedFilename } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import { useScrollErrorIntoView } from "./useScrollErrorIntoView";
import { useHandoffConsumer } from "./useHandoffConsumer";
import { useFileUrlConsumer } from "./useFileUrlConsumer";
import { HandoffSuggestions } from "./HandoffSuggestions";
import { mapPdfOpError } from "@/lib/pdf/error-messages";
import type { OverlayLayer, OverlayFit } from "@/lib/pdf/ops/overlay";

interface ResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  pageCount: number;
  appliedCount: number;
}

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    /\.pdf$/i.test(file.name) ||
    file.type === "application/octet-stream"
  );
}

export function PdfOverlayTool() {
  const tracker = useTrackToolView("pdf-overlay", "Edit");
  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [overlayFile, setOverlayFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [layer, setLayer] = useState<OverlayLayer>("front");
  const [fit, setFit] = useState<OverlayFit>("fit");
  const [opacity, setOpacity] = useState(50); // 0-100, divides by 100 in op
  const baseInputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const [dragOverBase, setDragOverBase] = useState(false);
  const [dragOverOverlay, setDragOverOverlay] = useState(false);
  const errorRef = useScrollErrorIntoView(error);

  const onBaseFiles = useCallback(
    (files: File[]) => {
      setError(null);
      setResult(null);
      const f = files[0];
      if (!f) return;
      if (!isPdf(f)) {
        setError(`"${f.name}" is not a PDF file.`);
        return;
      }
      if (f.size > MAX_FILE_SIZE_BYTES) {
        setError(`"${f.name}" exceeds ${humanSize(MAX_FILE_SIZE_BYTES)}.`);
        return;
      }
      setBaseFile(f);
      tracker.upload(f);
    },
    [tracker],
  );

  // Standardized hooks consume into the BASE PDF (the dominant input).
  useHandoffConsumer(onBaseFiles);
  useFileUrlConsumer(onBaseFiles);

  const onOverlayFiles = (files: File[]) => {
    setError(null);
    setResult(null);
    const f = files[0];
    if (!f) return;
    if (!isPdf(f)) {
      setError(`"${f.name}" is not a PDF file.`);
      return;
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      setError(`"${f.name}" exceeds ${humanSize(MAX_FILE_SIZE_BYTES)}.`);
      return;
    }
    setOverlayFile(f);
  };

  const reset = () => {
    setBaseFile(null);
    setOverlayFile(null);
    setError(null);
    setResult(null);
    setBusy(false);
  };

  const run = async () => {
    if (!baseFile || !overlayFile) return;
    setError(null);
    setBusy(true);
    const t0 = performance.now();
    try {
      const baseBytes = new Uint8Array(await baseFile.arrayBuffer());
      const overlayBytes = new Uint8Array(await overlayFile.arrayBuffer());
      const { overlayPdf } = await import("@/lib/pdf/ops/overlay");
      const r = await overlayPdf(baseBytes, overlayBytes, {
        layer,
        fit,
        opacity: opacity / 100,
      });
      const baseName = baseFile.name.replace(/\.pdf$/i, "");
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "document"}-overlaid.pdf`,
        pageCount: r.pageCount,
        appliedCount: r.appliedCount,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("pdf-overlay failed", err);
      setError(
        mapPdfOpError(
          err instanceof Error ? err.message : "Couldn't apply the overlay.",
        ),
      );
      tracker.error({ errorCode: "pdf_overlay_failed" });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([result.outputBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = suffixedFilename(result.outputFileName);
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
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
      {!result && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            {/* Base PDF dropzone */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                Base PDF (the document)
              </div>
              <div
                role="button"
                tabIndex={0}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverBase(true);
                }}
                onDragLeave={() => setDragOverBase(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverBase(false);
                  if (e.dataTransfer.files.length > 0) {
                    onBaseFiles(Array.from(e.dataTransfer.files));
                  }
                }}
                onClick={() => baseInputRef.current?.click()}
                style={dropzoneStyle(dragOverBase)}
              >
                <I.File
                  size={20}
                  style={{ color: "var(--fg-muted)", marginBottom: 6 }}
                />
                <div style={{ fontSize: 13 }}>
                  {baseFile ? baseFile.name : "Drop or click to browse"}
                </div>
                {baseFile && (
                  <div className="subtle" style={{ fontSize: 11, marginTop: 2 }}>
                    {humanSize(baseFile.size)}
                  </div>
                )}
                <input
                  ref={baseInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  hidden
                  onChange={(e) => {
                    if (e.target.files) {
                      onBaseFiles(Array.from(e.target.files));
                    }
                  }}
                />
              </div>
            </div>

            {/* Overlay PDF dropzone */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                Overlay PDF (letterhead / watermark)
              </div>
              <div
                role="button"
                tabIndex={0}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverOverlay(true);
                }}
                onDragLeave={() => setDragOverOverlay(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverOverlay(false);
                  if (e.dataTransfer.files.length > 0) {
                    onOverlayFiles(Array.from(e.dataTransfer.files));
                  }
                }}
                onClick={() => overlayInputRef.current?.click()}
                style={dropzoneStyle(dragOverOverlay)}
              >
                <I.Image
                  size={20}
                  style={{ color: "var(--fg-muted)", marginBottom: 6 }}
                />
                <div style={{ fontSize: 13 }}>
                  {overlayFile ? overlayFile.name : "Drop or click to browse"}
                </div>
                {overlayFile && (
                  <div className="subtle" style={{ fontSize: 11, marginTop: 2 }}>
                    {humanSize(overlayFile.size)} · first page used as stamp
                  </div>
                )}
                <input
                  ref={overlayInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  hidden
                  onChange={(e) => {
                    if (e.target.files) {
                      onOverlayFiles(Array.from(e.target.files));
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {(baseFile || overlayFile) && (
            <div
              className="card"
              style={{
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                  Layer
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${layer === "front" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setLayer("front")}
                  >
                    On top (watermark)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${layer === "behind" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setLayer("behind")}
                  >
                    Behind (letterhead)
                  </button>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                  Fit mode
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${fit === "fit" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setFit("fit")}
                  >
                    Fit (preserve aspect ratio)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${fit === "stretch" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setFit("stretch")}
                  >
                    Stretch (fill page)
                  </button>
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
                <span style={{ minWidth: 60 }}>Opacity:</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  style={{ flex: 1, maxWidth: 240 }}
                />
                <span style={{ minWidth: 40, textAlign: "right" }}>{opacity}%</span>
              </label>
              <div className="subtle" style={{ fontSize: 12 }}>
                {layer === "front"
                  ? "Overlay sits on top of the original content. Lower opacity for translucent watermarks."
                  : "Overlay sits behind the original content. Use for letterheads where text stays readable on top."}
                {fit === "stretch"
                  ? " Stretching distorts aspect ratio but matches the destination edge-to-edge."
                  : " Fit preserves aspect ratio; smaller overlays center on the page."}
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
          style={{
            padding: 16,
            background: "var(--bg-1)",
            display: "flex",
            gap: 12,
          }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="pulse-soft" style={{ color: "var(--accent)" }}>
            <I.Sparkle size={16} />
          </span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
            Applying overlay…
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
                Applied overlay to {result.appliedCount} of {result.pageCount}{" "}
                page{result.pageCount === 1 ? "" : "s"}
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                {humanSize(result.outputBytes.length)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={download}
            >
              <I.Download size={12} /> Download
            </button>
          </div>
          <HandoffSuggestions
            sourceToolId="pdf-overlay"
            outputBytes={result.outputBytes}
            outputFileName={result.outputFileName}
          />
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Apply another overlay
          </button>
        ) : (
          <>
            {(baseFile || overlayFile) && (
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
              disabled={!baseFile || !overlayFile || busy}
              onClick={run}
            >
              {busy ? "Applying…" : "Apply overlay"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
