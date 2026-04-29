"use client";

// components/tools/PdfUnlockTool.tsx
//
// Build 2 Wave 9 (2026-04-27): remove owner-restriction encryption
// from a PDF. Honest scope — strips no-print/no-copy/no-edit
// restrictions on PDFs that don't use a true user password. For
// password-protected files we surface a friendly redirect.

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import { mapPdfOpError } from "@/lib/pdf/error-messages";

interface UnlockResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  pageCount: number;
  wasEncrypted: boolean;
}

export function PdfUnlockTool() {
  const tracker = useTrackToolView("unlock", "Security");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UnlockResultState | null>(null);

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
      const { unlockPdf } = await import("@/lib/pdf/ops/unlock");
      const r = await unlockPdf(bytes);
      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "document"}-unlocked.pdf`,
        pageCount: r.pageCount,
        wasEncrypted: r.wasEncrypted,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("unlock failed", err);
      const msg = err instanceof Error ? err.message : "Could not unlock the PDF.";
      setError(mapPdfOpError(msg));
      tracker.error({ errorCode: "unlock_failed" });
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
          prompt="Drop a PDF to unlock"
          hint="Up to 100 MB · runs privately in your browser"
        />
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span style={{ color: "var(--fg-subtle)" }}>
              <I.Lock size={18} />
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
            padding: 14,
            background: "var(--bg-1)",
            fontSize: 12,
            color: "var(--fg-muted)",
          }}
        >
          <strong style={{ color: "var(--fg)", fontSize: 12 }}>What this does:</strong>{" "}
          Removes owner restrictions (no-print, no-copy, no-edit) from PDFs that don&rsquo;t
          require a password to open. <strong style={{ color: "var(--fg)" }}>What it can&rsquo;t do:</strong>{" "}
          crack a forgotten user password. If your PDF asks for a password to open, this
          tool will surface a friendly error instead of attempting to crack it.
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
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>Unlocking…</div>
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: "16px 20px" }}
          role="status"
          aria-live="polite"
          aria-label={
            result.wasEncrypted
              ? `Unlocked ${result.pageCount} pages`
              : "PDF was not encrypted"
          }
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
                {result.wasEncrypted
                  ? `Unlocked — ${result.pageCount} page${result.pageCount === 1 ? "" : "s"}`
                  : `Already unlocked — ${result.pageCount} page${result.pageCount === 1 ? "" : "s"}`}
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                Output: {humanSize(result.outputBytes.length)}
                {result.wasEncrypted ? "" : " · no encryption was present"}
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
            Unlock another PDF
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
              {busy ? "Unlocking…" : "Unlock PDF"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
