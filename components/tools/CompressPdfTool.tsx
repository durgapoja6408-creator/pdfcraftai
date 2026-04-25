"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  downloadBytes,
  humanSize,
  sha256HexOfBytes,
  deriveOutputName,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";
import { useTrackToolView } from "./useToolTracking";

export function CompressPdfTool() {
  useTrackToolView("compress", "Optimize");
  const [file, setFile] = useState<File | null>(null);
  const [stripMetadata, setStripMetadata] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    originalSize: number;
    outSize: number;
  } | null>(null);

  const reset = () => {
    setFile(null);
    setStripMetadata(true);
    setError(null);
    setResult(null);
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const originalSize = file.size;
      const doc = await PDFDocument.load(await file.arrayBuffer(), {
        ignoreEncryption: true,
        updateMetadata: false,
      });

      if (stripMetadata) {
        // pdf-lib exposes setters for each metadata field individually.
        try {
          doc.setTitle("");
          doc.setAuthor("");
          doc.setSubject("");
          doc.setKeywords([]);
          doc.setProducer("");
          doc.setCreator("");
        } catch {
          // Non-fatal — some PDFs have locked metadata trees.
        }
      }

      const bytes = await doc.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 50,
      });
      const name = deriveOutputName(file.name, "-compressed");
      setResult({ bytes, name, originalSize, outSize: bytes.length });

      // Log metadata (best-effort; no-op for anonymous users).
      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "compress",
          name,
          mime: "application/pdf",
          sizeBytes: bytes.length,
          sha256,
        });
      } catch (logErr) {
        console.warn("logToolResult failed (non-fatal):", logErr);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Compress failed.");
    } finally {
      setBusy(false);
    }
  };

  const savedBytes = result ? result.originalSize - result.outSize : 0;
  const savedPct =
    result && result.originalSize > 0
      ? (savedBytes / result.originalSize) * 100
      : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone onFiles={(files) => setFile(files[0] ?? null)} />
      ) : (
        <>
          <div
            className="card"
            style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}
          >
            <span style={{ color: "var(--fg-subtle)" }}>
              <I.File size={16} />
            </span>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div
                title={file.name}
                style={{
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {file.name}
              </div>
              <div className="subtle" style={{ fontSize: 12 }}>
                {humanSize(file.size)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              aria-label="Remove"
              disabled={busy}
              onClick={reset}
              style={{ padding: 6, color: "var(--fg-subtle)" }}
            >
              <I.X size={14} />
            </button>
          </div>

          <label
            className="card"
            style={{
              padding: 14,
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={stripMetadata}
              onChange={(e) => setStripMetadata(e.target.checked)}
              disabled={busy}
              style={{ marginTop: 3 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Strip metadata
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                Clears title, author, subject, producer, and other descriptive fields. Usually shaves a few KB.
              </div>
            </div>
          </label>

          <div
            className="card"
            style={{
              padding: 14,
              background: "var(--bg-2)",
              borderColor: "var(--border)",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ color: "var(--fg-subtle)", marginTop: 1 }}>
                <I.Info size={14} />
              </span>
              <p className="subtle" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                We repackage the PDF with object-stream compression and (optionally) strip metadata — all in your browser. This is
                lossless, so text-heavy documents shrink modestly. Image-heavy PDFs often won&apos;t compress further without re-encoding images, which this tool doesn&apos;t do.
              </p>
            </div>
          </div>
        </>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {result && (
        <div
          className="card"
          style={{
            padding: 20,
            borderColor: "var(--accent)",
            background: "var(--accent-soft)",
          }}
        >
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--accent)",
                color: "var(--bg-1)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 2 }}>
                {savedBytes > 0
                  ? `Saved ${humanSize(savedBytes)} (${savedPct.toFixed(1)}%)`
                  : "Compressed"}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {humanSize(result.originalSize)} in → {humanSize(result.outSize)} out
                {savedBytes <= 0 && " — this PDF was already well compressed."}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => downloadBytes(result.bytes, result.name)}
            >
              <I.Download size={14} />
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {file && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>
            Reset
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !file}
          onClick={run}
        >
          {busy ? "Compressing…" : "Compress PDF"}
        </button>
      </div>
    </div>
  );
}
