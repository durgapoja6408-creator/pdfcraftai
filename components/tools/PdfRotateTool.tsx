"use client";

// components/tools/PdfRotateTool.tsx
//
// Build 2 Wave 9 (2026-04-27): rotate PDF pages 90°/180°/270°.
// pdf-lib adjusts the /Rotate page entry — lossless, milliseconds.

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import type { RotateAngle } from "@/lib/pdf/ops/rotate";

interface RotateResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  rotatedCount: number;
  pageCount: number;
}

export function PdfRotateTool() {
  const tracker = useTrackToolView("rotate", "Edit");
  const [file, setFile] = useState<File | null>(null);
  const [angle, setAngle] = useState<RotateAngle>(90);
  const [pages, setPages] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RotateResultState | null>(null);

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
      const { rotatePdf } = await import("@/lib/pdf/ops/rotate");
      const r = await rotatePdf(bytes, { angle, pages });
      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "document"}-rotated.pdf`,
        rotatedCount: r.rotatedCount,
        pageCount: r.pageCount,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.rotatedCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("rotate failed", err);
      const msg = err instanceof Error ? err.message : "Could not rotate the PDF.";
      setError(msg);
      tracker.error({ errorCode: "rotate_failed" });
    } finally {
      setBusy(false);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to rotate"
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
          style={{
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500 }}>Rotation</div>
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend className="visually-hidden" style={{ position: "absolute", left: -10000 }}>
              Angle
            </legend>
            <div className="row" style={{ gap: 8 }}>
              {([90, 180, 270] as RotateAngle[]).map((opt) => (
                <label
                  key={opt}
                  className={`btn btn-sm ${angle === opt ? "btn-primary" : "btn-outline"}`}
                  style={{ cursor: "pointer" }}
                >
                  <input
                    type="radio"
                    name="rotate-angle"
                    value={opt}
                    checked={angle === opt}
                    onChange={() => setAngle(opt)}
                    style={{
                      position: "absolute",
                      opacity: 0,
                      pointerEvents: "none",
                    }}
                  />
                  {opt}° {opt === 90 ? "↻" : opt === 180 ? "↻↻" : "↺"}
                </label>
              ))}
            </div>
          </fieldset>
          <label
            style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}
          >
            <span>
              Pages to rotate{" "}
              <span className="subtle" style={{ fontSize: 11 }}>
                (e.g. <code>all</code>, <code>1-3, 7</code>, <code>2</code>)
              </span>
            </span>
            <input
              type="text"
              value={pages}
              onChange={(e) => setPages(e.target.value)}
              placeholder="all"
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
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>Rotating…</div>
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: "16px 20px" }}
          role="status"
          aria-live="polite"
          aria-label={`Rotated ${result.rotatedCount} pages`}
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
                Rotated {result.rotatedCount} of {result.pageCount} page
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
            Rotate another PDF
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
              {busy ? "Rotating…" : `Rotate ${angle}°`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
