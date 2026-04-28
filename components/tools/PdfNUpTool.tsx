"use client";

// components/tools/PdfNUpTool.tsx
// Tier 5 (2026-04-28): N-up — pack 2 or 4 source pages onto each
// output sheet via pdf-lib embedPdf + drawPage.

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import type { NUpLayout } from "@/lib/pdf/ops/n-up";

interface ResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  pageCount: number;
  sourcePageCount: number;
}

export function PdfNUpTool() {
  const tracker = useTrackToolView("n-up-pdf", "Edit");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [layout, setLayout] = useState<NUpLayout>("2");

  const onFiles = useCallback(
    (files: File[]) => {
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
      const { nUpPdf } = await import("@/lib/pdf/ops/n-up");
      const r = await nUpPdf(bytes, { layout });
      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "document"}-${layout}up.pdf`,
        pageCount: r.pageCount,
        sourcePageCount: r.sourcePageCount,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.sourcePageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not produce N-up PDF.");
      tracker.error({ errorCode: "n_up_failed" });
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone onFiles={onFiles} prompt="Drop a PDF to lay out N-up" hint="Up to 100 MB · runs privately in your browser" />
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
          <div style={{ fontSize: 13, fontWeight: 500 }}>Pages per sheet</div>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className={`btn btn-sm ${layout === "2" ? "btn-primary" : "btn-outline"}`} onClick={() => setLayout("2")}>2-up (vertical stack)</button>
            <button type="button" className={`btn btn-sm ${layout === "4" ? "btn-primary" : "btn-outline"}`} onClick={() => setLayout("4")}>4-up (2×2 grid)</button>
          </div>
          <div className="subtle" style={{ fontSize: 12 }}>
            Output sheet size matches your source. {layout === "2" ? "2 source pages per output sheet." : "4 source pages per output sheet."}
          </div>
        </div>
      )}

      {error && <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>}

      {busy && (
        <div className="card" style={{ padding: 16, background: "var(--bg-1)", display: "flex", gap: 12 }} role="status" aria-live="polite" aria-busy="true">
          <span className="pulse-soft" style={{ color: "var(--accent)" }}><I.Sparkle size={16} /></span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>Building {layout}-up layout…</div>
        </div>
      )}

      {result && (
        <div className="card" style={{ padding: "16px 20px" }} role="status" aria-live="polite">
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{result.sourcePageCount} pages → {result.pageCount} sheets ({layout}-up)</div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>Output: {humanSize(result.outputBytes.length)}</div>
            </div>
            <button type="button" className="btn btn-sm btn-outline" onClick={download}><I.Download size={12} /> Download</button>
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>N-up another PDF</button>
        ) : (
          <>
            {file && <button type="button" className="btn btn-ghost" onClick={reset} disabled={busy}>Reset</button>}
            <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={run}>{busy ? "Building…" : `Build ${layout}-up PDF`}</button>
          </>
        )}
      </div>
    </div>
  );
}
