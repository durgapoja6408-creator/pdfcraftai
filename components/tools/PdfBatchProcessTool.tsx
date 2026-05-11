"use client";

// components/tools/PdfBatchProcessTool.tsx
//
// 2026-05-01 Tier 3: apply one operation across many PDFs at once.
// Bespoke multi-PDF input UI; bundles outputs into a zip via JSZip.
//
// All 7 standardized hooks wired (input is PDF — but multi-file).
// Handoff/file-URL load the FIRST input; user can add more via the
// dropzone. The "operation picker" is the dominant UX surface.

import { useState, useCallback, useEffect, useRef } from "react";
import { I } from "@/components/icons/Icons";
import { humanSize, MAX_FILE_SIZE_BYTES, isPdfFile } from "@/lib/client/pdf-utils";
import { downloadBytes } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import { useScrollErrorIntoView } from "./useScrollErrorIntoView";
import { useHandoffConsumer } from "./useHandoffConsumer";
import { useFileUrlConsumer } from "./useFileUrlConsumer";
import { ToolHowItWorks } from "./ToolHowItWorks";
import { mapPdfOpError } from "@/lib/pdf/error-messages";
import type { BatchOpId, BatchOutputItem } from "@/lib/pdf/ops/batch";

const MAX_BATCH_SIZE = 50;

const OPS: Array<{ v: BatchOpId; label: string; desc: string; needsText: boolean }> = [
  { v: "rotate-90", label: "Rotate 90° clockwise", desc: "All pages, all PDFs", needsText: false },
  { v: "rotate-180", label: "Rotate 180°", desc: "Flip every page upside-down", needsText: false },
  { v: "rotate-270", label: "Rotate 270° (90° counter-clockwise)", desc: "All pages, all PDFs", needsText: false },
  { v: "page-numbers", label: "Add page numbers", desc: "Bottom-right · &ldquo;Page 1 of N&rdquo; · 11pt", needsText: false },
  { v: "watermark", label: "Add diagonal watermark", desc: "30% opacity · diagonal across each page", needsText: true },
  { v: "remove-metadata", label: "Remove metadata", desc: "Strip title, author, producer, dates", needsText: false },
  { v: "flatten-forms", label: "Flatten forms", desc: "Bake AcroForm values into static content", needsText: false },
  { v: "strip-links", label: "Strip hyperlinks", desc: "Remove all URL annotations", needsText: false },
];

interface InputFile {
  file: File;
}

interface ResultState {
  items: BatchOutputItem[];
  successCount: number;
  failureCount: number;
  zipBlob: Blob | null;
  zipFileName: string;
}

export function PdfBatchProcessTool() {
  const tracker = useTrackToolView("pdf-batch", "Edit");
  const [files, setFiles] = useState<InputFile[]>([]);
  const [op, setOp] = useState<BatchOpId>("rotate-90");
  const [watermarkText, setWatermarkText] = useState("DRAFT");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorRef = useScrollErrorIntoView(error);

  const onFiles = useCallback(
    (incoming: File[]) => {
      setError(null);
      setResult(null);
      const accepted: InputFile[] = [];
      for (const f of incoming) {
        if (!isPdfFile(f)) {
          setError(`"${f.name}" is not a PDF file.`);
          return;
        }
        if (f.size > MAX_FILE_SIZE_BYTES) {
          setError(`"${f.name}" exceeds ${humanSize(MAX_FILE_SIZE_BYTES)}.`);
          return;
        }
        accepted.push({ file: f });
      }
      const next = [...files, ...accepted];
      if (next.length > MAX_BATCH_SIZE) {
        setError(`Limit ${MAX_BATCH_SIZE} PDFs per batch.`);
        return;
      }
      setFiles(next);
      for (const a of accepted) tracker.upload(a.file);
    },
    [files, tracker],
  );

  useHandoffConsumer(onFiles);
  useFileUrlConsumer(onFiles);

  const removeAt = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const reset = () => {
    setFiles([]);
    setError(null);
    setResult(null);
    setBusy(false);
    setProgress(null);
  };

  const run = async () => {
    if (files.length === 0) return;
    if (op === "watermark" && watermarkText.trim().length === 0) {
      setError("Watermark text is required.");
      return;
    }
    setError(null);
    setBusy(true);
    setProgress({ current: 0, total: files.length });
    const t0 = performance.now();
    try {
      const inputs = await Promise.all(
        files.map(async (f) => ({
          name: f.file.name,
          bytes: new Uint8Array(await f.file.arrayBuffer()),
        })),
      );
      // Iterate manually so we can stream progress to the UI
      // (batchProcess() doesn't expose a callback today).
      const items: BatchOutputItem[] = [];
      let success = 0;
      let failure = 0;
      const { batchProcess } = await import("@/lib/pdf/ops/batch");
      for (let i = 0; i < inputs.length; i++) {
        setProgress({ current: i + 1, total: inputs.length });
        const r = await batchProcess([inputs[i]], {
          op,
          watermarkText: op === "watermark" ? watermarkText : undefined,
        });
        items.push(...r.items);
        success += r.successCount;
        failure += r.failureCount;
        // Yield event loop so the progress label paints between items.
        await new Promise((r2) => setTimeout(r2, 0));
      }

      // Build zip from successful items.
      const successful = items.filter((it) => it.bytes !== undefined);
      let zipBlob: Blob | null = null;
      let zipFileName = "batch-output.zip";
      if (successful.length > 0) {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (const it of successful) {
          if (it.bytes) zip.file(it.outputName, it.bytes);
        }
        zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 5 },
        });
        zipFileName = `batch-${op.replace(/-/g, "_")}-${successful.length}.zip`;
      }

      setResult({
        items,
        successCount: success,
        failureCount: failure,
        zipBlob,
        zipFileName,
      });
      tracker.success({
        creditCost: 0,
        pageCount: success,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("pdf-batch failed", err);
      setError(
        mapPdfOpError(err instanceof Error ? err.message : "Batch processing failed."),
      );
      tracker.error({ errorCode: "pdf_batch_failed" });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const downloadZip = () => {
    if (!result?.zipBlob) return;
    downloadBytes(result.zipBlob, result.zipFileName, "application/zip");
  };

  const downloadSingle = (item: BatchOutputItem) => {
    if (!item.bytes) return;
    downloadBytes(item.bytes, item.outputName);
  };

  const selectedOp = OPS.find((o) => o.v === op);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <ToolHowItWorks
        steps={[
          {
            title: "Drop in your PDFs",
            body: "Drop multiple PDFs at once (up to 100 MB each). Files queue up locally — nothing leaves your browser while you set up the run.",
          },
          {
            title: "Pick the operation to apply",
            body: "Compress, rotate, grayscale, watermark, add page numbers, split — same engines as the single-file tools, applied to every file in the queue.",
          },
          {
            title: "Download as a ZIP",
            body: "Each output file lands in a single .zip with the operation suffix in its name (foo-compressed.pdf, bar-rotated.pdf …) so you can see at a glance what was applied.",
          },
        ]}
        privacyNote="Your PDFs stay in your browser. Every operation runs client-side — nothing is uploaded or persisted at any step."
      />
      {!result && (
        <>
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length > 0) {
                onFiles(Array.from(e.dataTransfer.files));
              }
            }}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 12,
              padding: "32px 24px",
              textAlign: "center",
              background: dragOver ? "var(--accent-soft)" : "var(--bg-1)",
              cursor: "pointer",
            }}
          >
            <I.File size={28} style={{ color: "var(--fg-muted)", marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 500 }}>
              {files.length === 0
                ? "Drop multiple PDFs here or click to browse"
                : `Add more PDFs (${files.length} loaded)`}
            </div>
            <div className="subtle" style={{ fontSize: 12, marginTop: 6 }}>
              Up to {MAX_BATCH_SIZE} PDFs · {humanSize(MAX_FILE_SIZE_BYTES)} each · runs privately in your browser
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) onFiles(Array.from(e.target.files));
              }}
            />
          </div>

          {files.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden", maxHeight: 280, overflowY: "auto" }}>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {files.map((f, i) => (
                  <li
                    key={`${f.file.name}-${i}`}
                    style={{
                      padding: "10px 16px",
                      borderTop: i === 0 ? "none" : "1px solid var(--border)",
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={f.file.name}
                      >
                        {f.file.name}
                      </div>
                    </div>
                    <span className="subtle" style={{ fontSize: 11 }}>
                      {humanSize(f.file.size)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => removeAt(i)}
                      aria-label={`Remove ${f.file.name}`}
                    >
                      <I.X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {files.length > 0 && (
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
                  Operation to apply to every PDF
                </div>
                <select
                  value={op}
                  onChange={(e) => setOp(e.target.value as BatchOpId)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    background: "var(--bg-1)",
                    color: "var(--fg)",
                    fontSize: 13,
                  }}
                >
                  {OPS.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {selectedOp && (
                  <div className="subtle" style={{ fontSize: 12, marginTop: 6 }}>
                    {selectedOp.desc}
                  </div>
                )}
              </div>
              {op === "watermark" && (
                <label style={{ fontSize: 13 }}>
                  Watermark text
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    placeholder="DRAFT"
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      background: "var(--bg-1)",
                      color: "var(--fg)",
                      fontSize: 13,
                      marginTop: 4,
                    }}
                  />
                </label>
              )}
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

      {busy && progress && (
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
            Processing {progress.current} of {progress.total}…
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
                Processed {result.successCount} of {result.successCount + result.failureCount} PDFs
                {result.failureCount > 0 ? ` · ${result.failureCount} failed` : ""}
              </div>
              {result.zipBlob && (
                <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                  Bundle: {humanSize(result.zipBlob.size)}
                </div>
              )}
            </div>
            {result.zipBlob && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={downloadZip}
              >
                <I.Download size={12} /> Download zip
              </button>
            )}
          </div>
          {/* Per-file results table */}
          <div
            style={{
              marginTop: 14,
              maxHeight: 240,
              overflowY: "auto",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          >
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {result.items.map((it, i) => (
                <li
                  key={`${it.inputName}-${i}`}
                  style={{
                    padding: "8px 12px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    display: "grid",
                    gridTemplateColumns: "20px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      color: it.bytes ? "var(--green, #22c55e)" : "var(--red)",
                      fontWeight: 700,
                    }}
                    title={it.error}
                  >
                    {it.bytes ? "✓" : "✗"}
                  </span>
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={it.error || it.outputName}
                  >
                    {it.bytes ? it.outputName : `${it.inputName} — ${it.error}`}
                  </span>
                  {it.bytes && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => downloadSingle(it)}
                      style={{ fontSize: 11, padding: "2px 8px" }}
                    >
                      <I.Download size={11} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Process another batch
          </button>
        ) : (
          <>
            {files.length > 0 && (
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
              disabled={files.length === 0 || busy}
              onClick={run}
            >
              {busy
                ? "Processing…"
                : `Process ${files.length} PDF${files.length === 1 ? "" : "s"}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
