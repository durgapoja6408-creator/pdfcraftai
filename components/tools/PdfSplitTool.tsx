"use client";

// components/tools/PdfSplitTool.tsx
//
// Build 2 Wave 9 (2026-04-27): split a PDF into multiple PDFs.
// Three modes — every / range / size. Single-output downloads
// directly; multi-output bundles into a .zip via JSZip.
//
// JSZip is dynamically imported on demand to keep the route bundle small.

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import type { SplitMode, SplitOutput } from "@/lib/pdf/ops/split";

interface SplitResultState {
  outputs: SplitOutput[];
  sourceFileName: string;
  sourcePageCount: number;
}

export function PdfSplitTool() {
  const tracker = useTrackToolView("split", "Organize");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<SplitMode>("every");
  const [ranges, setRanges] = useState<string>("1-5, 6-10");
  const [chunkSize, setChunkSize] = useState<number>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SplitResultState | null>(null);

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
      const { splitPdf } = await import("@/lib/pdf/ops/split");
      const r = await splitPdf(bytes, {
        mode,
        ranges: mode === "range" ? ranges : undefined,
        chunkSize: mode === "size" ? chunkSize : undefined,
      });
      setResult({
        outputs: r.outputs,
        sourceFileName: file.name,
        sourcePageCount: r.sourcePageCount,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.sourcePageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("split failed", err);
      const msg = err instanceof Error ? err.message : "Could not split the PDF.";
      setError(msg);
      tracker.error({ errorCode: "split_failed" });
    } finally {
      setBusy(false);
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
      for (const out of result.outputs) {
        zip.file(prefixed(out.name), out.bytes);
      }
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

      {file && !result && (
        <div
          className="card"
          style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div style={{ fontSize: 13, fontWeight: 500 }}>How to split</div>
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend className="visually-hidden" style={{ position: "absolute", left: -10000 }}>
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
                  className={`btn btn-sm ${mode === opt.v ? "btn-primary" : "btn-outline"}`}
                  style={{ cursor: "pointer" }}
                >
                  <input
                    type="radio"
                    name="split-mode"
                    value={opt.v}
                    checked={mode === opt.v}
                    onChange={() => setMode(opt.v)}
                    style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          {mode === "size" && (
            <label
              style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}
            >
              <span>Pages per output</span>
              <input
                type="number"
                min={1}
                max={500}
                value={chunkSize}
                onChange={(e) => setChunkSize(Math.max(1, Number(e.target.value) || 1))}
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

          {mode === "range" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              <span>Page ranges (one output per range)</span>
              <input
                type="text"
                value={ranges}
                onChange={(e) => setRanges(e.target.value)}
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

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
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
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>Splitting PDF…</div>
        </div>
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
        ) : (
          <>
            {file && (
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
              disabled={!file || busy}
              onClick={run}
            >
              {busy ? "Splitting…" : "Split PDF"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
