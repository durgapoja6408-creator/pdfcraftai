"use client";

// components/tools/PdfAttachmentsTool.tsx
//
// Build 2 Wave 4 (2026-04-27): list embedded files in a PDF. Pure
// byte-parser tool — no PDFium needed.
//
// Surfaces filename, description, MIME type, and size for each
// attachment. Doesn't download the actual file bytes (yet) — that
// requires handling FlateDecode and other stream filters which is
// separate work. For now: "what's in here?" not "give me the
// contents". Useful for compliance audits, security review, and
// PDF/A validation workflows where you need to KNOW what's
// embedded but rarely need to extract it.

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import type { PdfAttachment } from "@/lib/pdf/ops/attachments";

interface AttachmentsToolResult {
  fileName: string;
  fileSize: number;
  attachments: PdfAttachment[];
  unsupported: boolean;
}

type LoadStage = "idle" | "extracting" | "done";

export function PdfAttachmentsTool() {
  const tracker = useTrackToolView("pdf-attachments", "Organize");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<LoadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AttachmentsToolResult | null>(null);
  const [copied, setCopied] = useState(false);

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

  const run = async () => {
    if (!file) return;
    setError(null);
    setStage("extracting");
    const t0 = performance.now();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { extractAttachments } = await import("@/lib/pdf/ops/attachments");
      const r = extractAttachments(bytes);
      setResult({
        fileName: file.name,
        fileSize: file.size,
        attachments: r.attachments,
        unsupported: r.unsupported,
      });
      setStage("done");
      tracker.success({
        creditCost: 0,
        pageCount: r.attachments.length,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("pdf-attachments failed", err);
      const msg =
        err instanceof Error
          ? err.message
          : "Could not parse the PDF attachments.";
      setError(msg);
      setStage("idle");
      tracker.error({ errorCode: "parse_failed" });
    }
  };

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setStage("idle");
    setCopied(false);
  };

  const copyList = async () => {
    if (!result) return;
    const lines = result.attachments.map((a) => {
      const size =
        a.sizeBytes >= 0 ? ` (${humanSize(a.sizeBytes)})` : "";
      const desc = a.description ? ` — ${a.description}` : "";
      return `${a.filename}${size}${desc}`;
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  };

  const downloadJson = () => {
    if (!result) return;
    const payload = {
      file: { name: result.fileName, size_bytes: result.fileSize },
      attachments: result.attachments,
      unsupported: result.unsupported,
      generated_by: "pdfcraft.ai PDF Attachments",
      generated_at: new Date().toISOString(),
      schema_version: 1,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      const base = result.fileName.replace(/\.pdf$/i, "");
      a.download = `${base}.attachments.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const truncateFilename = (name: string, max = 48) => {
    if (name.length <= max) return name;
    const ext = name.lastIndexOf(".");
    if (ext < 0) return `${name.slice(0, max - 1)}…`;
    const base = name.slice(0, ext);
    const extension = name.slice(ext);
    const keep = max - extension.length - 1;
    return `${base.slice(0, Math.max(8, keep))}…${extension}`;
  };

  const busy = stage === "extracting";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to list its attachments"
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
                {truncateFilename(file.name)}
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

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
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
            alignItems: "center",
            gap: 12,
          }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span
            className="pulse-soft"
            style={{ color: "var(--accent)", display: "inline-flex" }}
          >
            <I.Sparkle size={16} />
          </span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
            Reading attachments…
          </div>
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden" }}
          role="status"
          aria-live="polite"
          aria-label={`Found ${result.attachments.length} attachments`}
        >
          <div
            style={{
              padding: "16px 24px",
              borderBottom: "1px solid var(--border)",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {result.attachments.length === 0
                  ? result.unsupported
                    ? "Couldn't parse attachments"
                    : "No embedded files"
                  : `${result.attachments.length} attachment${result.attachments.length === 1 ? "" : "s"}`}
              </div>
              {result.attachments.length === 0 && (
                <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                  {result.unsupported
                    ? "This PDF uses cross-reference streams or encryption that our byte parser can't follow."
                    : "This PDF has no embedded file attachments."}
                </div>
              )}
            </div>
            {result.attachments.length > 0 && (
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={copyList}
                  aria-label="Copy attachment list as text"
                  style={{ minWidth: 90 }}
                >
                  {copied ? (
                    <>
                      <I.Check size={12} /> Copied
                    </>
                  ) : (
                    <>
                      <I.Copy size={12} /> Copy
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={downloadJson}
                  aria-label="Download attachment list as JSON"
                >
                  <I.Download size={12} /> JSON
                </button>
              </div>
            )}
          </div>

          {result.attachments.length > 0 && (
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                maxHeight: 480,
                overflowY: "auto",
              }}
            >
              {result.attachments.map((a, i) => (
                <li
                  key={`${a.filespecObjectNumber}-${i}`}
                  style={{
                    padding: "12px 24px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <span
                    style={{
                      color: "var(--fg-subtle)",
                      flexShrink: 0,
                      paddingTop: 2,
                    }}
                  >
                    <I.File size={16} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: "var(--mono, monospace)",
                        wordBreak: "break-word",
                      }}
                    >
                      {a.filename || (
                        <em className="subtle">(unnamed attachment)</em>
                      )}
                    </div>
                    {a.description && (
                      <div
                        className="muted"
                        style={{ fontSize: 12, marginTop: 3 }}
                      >
                        {a.description}
                      </div>
                    )}
                    {a.mimeType && (
                      <div
                        className="subtle"
                        style={{ fontSize: 11, marginTop: 3 }}
                      >
                        {a.mimeType}
                      </div>
                    )}
                  </div>
                  <span
                    className="subtle"
                    style={{ fontSize: 12, whiteSpace: "nowrap" }}
                  >
                    {a.sizeBytes >= 0 ? humanSize(a.sizeBytes) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Honest disclaimer about not extracting bytes. */}
          {result.attachments.length > 0 && (
            <div
              style={{
                padding: "10px 24px",
                borderTop: "1px solid var(--border)",
                fontSize: 12,
                color: "var(--fg-muted)",
                background: "var(--bg-1)",
              }}
            >
              <I.Info size={12} style={{ verticalAlign: "middle", marginRight: 6 }} />
              We list attachments but don&apos;t extract the file bytes —
              that&apos;s separate work. Open the PDF in Acrobat/Preview to save
              individual attachments.
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Inspect another PDF
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
              {busy ? "Reading…" : "List attachments"}
            </button>
          </>
        )}
      </div>

      {/* P12: removed — duplicates ToolIntroPanel + Related Tools. */}
    </div>
  );
}
