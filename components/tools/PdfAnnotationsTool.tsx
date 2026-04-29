"use client";

// components/tools/PdfAnnotationsTool.tsx — Build 2 Wave 8

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import type { PdfAnnotation } from "@/lib/pdf/ops/annotations";
import { mapPdfOpError } from "@/lib/pdf/error-messages";

interface ToolResult {
  fileName: string;
  fileSize: number;
  annotations: PdfAnnotation[];
  unsupported: boolean;
}

export function PdfAnnotationsTool() {
  const tracker = useTrackToolView("pdf-annotations", "Organize");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "extracting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [copied, setCopied] = useState(false);

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

  const run = async () => {
    if (!file) return;
    setError(null);
    setStage("extracting");
    const t0 = performance.now();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { extractAnnotations } = await import("@/lib/pdf/ops/annotations");
      const r = extractAnnotations(bytes);
      setResult({
        fileName: file.name,
        fileSize: file.size,
        annotations: r.annotations,
        unsupported: r.unsupported,
      });
      setStage("done");
      tracker.success({
        creditCost: 0,
        pageCount: r.annotations.length,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("pdf-annotations failed", err);
      setError(mapPdfOpError(err instanceof Error ? err.message : "Could not parse the PDF."));
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

  const downloadCsv = () => {
    if (!result) return;
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = "page,type,author,date,content,color";
    const rows = result.annotations.map((a) =>
      [
        a.pageNumber,
        a.subtype,
        escape(a.author),
        a.creationDate || a.modDate || "",
        escape(a.contents.replace(/\n/g, " ")),
        a.colorHex || "",
      ].join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      const base = result.fileName.replace(/\.pdf$/i, "");
      a.download = `${base}.annotations.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const copyJson = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(result.annotations, null, 2),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  };

  // Group by page for display.
  const byPage = result
    ? result.annotations.reduce<Record<number, PdfAnnotation[]>>((acc, a) => {
        (acc[a.pageNumber] ||= []).push(a);
        return acc;
      }, {})
    : {};

  const truncate = (s: string, max = 48) =>
    s.length <= max ? s : `${s.slice(0, max - 1)}…`;
  const busy = stage === "extracting";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to export its annotations"
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
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
            Reading annotations…
          </div>
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden" }}
          role="status"
          aria-live="polite"
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
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {result.annotations.length === 0
                ? result.unsupported
                  ? "Couldn't parse annotations"
                  : "No annotations found"
                : `${result.annotations.length} annotation${result.annotations.length === 1 ? "" : "s"}`}
            </div>
            {result.annotations.length > 0 && (
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={copyJson}
                  style={{ minWidth: 90 }}
                >
                  {copied ? (
                    <>
                      <I.Check size={12} /> Copied
                    </>
                  ) : (
                    <>
                      <I.Copy size={12} /> JSON
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={downloadCsv}
                >
                  <I.Download size={12} /> CSV
                </button>
              </div>
            )}
          </div>

          {result.annotations.length > 0 && (
            <div style={{ maxHeight: 480, overflowY: "auto", padding: "8px 0" }}>
              {Object.entries(byPage).map(([page, anns]) => (
                <div
                  key={page}
                  style={{
                    padding: "10px 24px",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <div
                    className="mono subtle"
                    style={{ fontSize: 11, letterSpacing: "0.05em", marginBottom: 8 }}
                  >
                    PAGE {page} · {anns.length} annotation{anns.length === 1 ? "" : "s"}
                  </div>
                  {anns.map((a, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 0",
                        borderTop: i === 0 ? "none" : "1px solid var(--border)",
                        fontSize: 13,
                      }}
                    >
                      <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        {a.colorHex && (
                          <span
                            aria-hidden
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 2,
                              background: a.colorHex,
                              flexShrink: 0,
                              border: "1px solid var(--border)",
                            }}
                          />
                        )}
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "var(--bg-2)",
                            color: "var(--fg-muted)",
                          }}
                        >
                          {a.subtype}
                        </span>
                        {a.author && (
                          <span className="subtle" style={{ fontSize: 12 }}>
                            by {a.author}
                          </span>
                        )}
                        {a.creationDate && (
                          <span className="subtle" style={{ fontSize: 11, marginLeft: "auto" }}>
                            {new Date(a.creationDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {a.contents && (
                        <div
                          className="muted"
                          style={{
                            marginTop: 6,
                            fontSize: 13,
                            lineHeight: 1.55,
                            paddingLeft: a.colorHex ? 18 : 0,
                          }}
                        >
                          {a.contents}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Export from another PDF
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
              {busy ? "Reading…" : "Export annotations"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
