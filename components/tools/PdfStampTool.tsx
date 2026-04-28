"use client";

// components/tools/PdfStampTool.tsx
// Tier 5 (2026-04-28): text watermark / stamp on every page.

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import type { StampPosition } from "@/lib/pdf/ops/stamp";

interface ResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  pageCount: number;
}

export function PdfStampTool() {
  const tracker = useTrackToolView("stamp-pdf", "Edit");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [text, setText] = useState("DRAFT");
  const [position, setPosition] = useState<StampPosition>("diagonal");
  const [opacity, setOpacity] = useState(30);
  const [fontSize, setFontSize] = useState<number | "">("");
  const [color, setColor] = useState("#888888");

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
    if (!text.trim()) {
      setError("Type the watermark text first.");
      return;
    }
    setError(null);
    setBusy(true);
    const t0 = performance.now();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { stampPdf } = await import("@/lib/pdf/ops/stamp");
      const r = await stampPdf(bytes, {
        text: text.trim(),
        position,
        opacity: opacity / 100,
        fontSize: typeof fontSize === "number" && fontSize > 0 ? fontSize : undefined,
        color,
      });
      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "document"}-watermarked.pdf`,
        pageCount: r.pageCount,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stamp the PDF.");
      tracker.error({ errorCode: "stamp_failed" });
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
        <ToolDropzone onFiles={onFiles} prompt="Drop a PDF to add a watermark" hint="Up to 100 MB · runs privately in your browser" />
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
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            <span>Watermark text</span>
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder="e.g. DRAFT, CONFIDENTIAL, your company name" style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-1)", color: "var(--fg)" }} />
          </label>

          <div style={{ fontSize: 13, fontWeight: 500 }}>Position</div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {(
              [
                { v: "diagonal", label: "Diagonal" },
                { v: "center", label: "Center" },
                { v: "top-center", label: "Top" },
                { v: "bottom-center", label: "Bottom" },
              ] as Array<{ v: StampPosition; label: string }>
            ).map((opt) => (
              <button key={opt.v} type="button" className={`btn btn-sm ${position === opt.v ? "btn-primary" : "btn-outline"}`} onClick={() => setPosition(opt.v)}>{opt.label}</button>
            ))}
          </div>

          <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span>Opacity</span>
              <input type="range" min={5} max={100} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} style={{ width: 120 }} />
              <span className="subtle" style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", minWidth: 36 }}>{opacity}%</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span>Color</span>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 36, height: 28, padding: 0, border: "1px solid var(--border)", borderRadius: 4 }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span>Font size</span>
              <input type="number" min={8} max={200} value={fontSize} onChange={(e) => setFontSize(e.target.value === "" ? "" : Number(e.target.value))} placeholder="auto" style={{ width: 80, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-1)", color: "var(--fg)" }} />
              <span className="subtle" style={{ fontSize: 11 }}>pt</span>
            </label>
          </div>
        </div>
      )}

      {error && <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>{error}</p>}

      {busy && (
        <div className="card" style={{ padding: 16, background: "var(--bg-1)", display: "flex", gap: 12 }} role="status" aria-live="polite" aria-busy="true">
          <span className="pulse-soft" style={{ color: "var(--accent)" }}><I.Sparkle size={16} /></span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>Adding watermark…</div>
        </div>
      )}

      {result && (
        <div className="card" style={{ padding: "16px 20px" }} role="status" aria-live="polite">
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Watermarked {result.pageCount} page{result.pageCount === 1 ? "" : "s"}</div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>Output: {humanSize(result.outputBytes.length)}</div>
            </div>
            <button type="button" className="btn btn-sm btn-outline" onClick={download}><I.Download size={12} /> Download</button>
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>Watermark another PDF</button>
        ) : (
          <>
            {file && <button type="button" className="btn btn-ghost" onClick={reset} disabled={busy}>Reset</button>}
            <button type="button" className="btn btn-primary" disabled={!file || busy || !text.trim()} onClick={run}>{busy ? "Stamping…" : "Add watermark"}</button>
          </>
        )}
      </div>
    </div>
  );
}
