"use client";

// components/tools/PdfResizeTool.tsx
// Tier 5 (2026-04-28): resize every page to a target paper size,
// scaling content to fit while preserving aspect ratio.

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { suffixedFilename } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import type { PaperSize } from "@/lib/pdf/ops/resize";
import { mapPdfOpError } from "@/lib/pdf/error-messages";

interface ResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  pageCount: number;
  width: number;
  height: number;
}

const SIZES: Array<{ v: PaperSize; label: string; pt: string }> = [
  { v: "letter", label: "US Letter", pt: "612 × 792" },
  { v: "legal", label: "US Legal", pt: "612 × 1008" },
  { v: "a4", label: "A4", pt: "595 × 842" },
  { v: "a3", label: "A3", pt: "842 × 1191" },
  { v: "a5", label: "A5", pt: "420 × 595" },
];

export function PdfResizeTool() {
  const tracker = useTrackToolView("resize-pdf", "Edit");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [size, setSize] = useState<PaperSize>("letter");
  const [landscape, setLandscape] = useState(false);

  const onFiles = useCallback(
    (files: File[]) => {
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
    },
    [tracker],
  );

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setBusy(false);
  };

  const run = async () => {
    if (!file) return;
    setError(null);
    setBusy(true);
    const t0 = performance.now();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { resizePdf } = await import("@/lib/pdf/ops/resize");
      const r = await resizePdf(bytes, { size, landscape });
      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "document"}-${size}.pdf`,
        pageCount: r.pageCount,
        width: r.width,
        height: r.height,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      setError(mapPdfOpError(err instanceof Error ? err.message : "Could not resize the PDF."));
      tracker.error({ errorCode: "resize_failed" });
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

  const truncate = (s: string, max = 38) =>
    s.length <= max ? s : `${s.slice(0, max - 1)}…`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone onFiles={onFiles} prompt="Drop a PDF to resize" hint="Up to 100 MB · runs privately in your browser" />
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span style={{ color: "var(--fg-subtle)" }}><I.File size={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={file.name}>{truncate(file.name)}</div>
              <div className="subtle" style={{ fontSize: 12 }}>{humanSize(file.size)}</div>
            </div>
            <button type="button" className="btn btn-sm btn-ghost" onClick={reset} disabled={busy} aria-label="Remove file"><I.X size={14} /></button>
          </div>
        </div>
      )}

      {file && !result && (
        <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Target size</div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {SIZES.map((opt) => (
              <button key={opt.v} type="button" className={`btn btn-sm ${size === opt.v ? "btn-primary" : "btn-outline"}`} onClick={() => setSize(opt.v)} title={`${opt.pt} pt`}>
                {opt.label}
              </button>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={landscape} onChange={(e) => setLandscape(e.target.checked)} />
            Landscape orientation
          </label>
          <div className="subtle" style={{ fontSize: 12 }}>
            Content scales to fit while preserving aspect ratio. Margins fill the rest.
          </div>
        </div>
      )}

      {error && <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>}

      {busy && (
        <div className="card" style={{ padding: 16, background: "var(--bg-1)", display: "flex", gap: 12 }} role="status" aria-live="polite" aria-busy="true">
          <span className="pulse-soft" style={{ color: "var(--accent)" }}><I.Sparkle size={16} /></span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>Resizing pages…</div>
        </div>
      )}

      {result && (
        <div className="card" style={{ padding: "16px 20px" }} role="status" aria-live="polite">
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Resized {result.pageCount} page{result.pageCount === 1 ? "" : "s"}</div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>{Math.round(result.width)}×{Math.round(result.height)} pt · {humanSize(result.outputBytes.length)}</div>
            </div>
            <button type="button" className="btn btn-sm btn-outline" onClick={download}><I.Download size={12} /> Download</button>
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>Resize another PDF</button>
        ) : (
          <>
            {file && <button type="button" className="btn btn-ghost" onClick={reset} disabled={busy}>Reset</button>}
            <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={run}>{busy ? "Resizing…" : `Resize to ${SIZES.find((s) => s.v === size)?.label}`}</button>
          </>
        )}
      </div>
    </div>
  );
}
