"use client";

// components/tools/PdfLinksTool.tsx
// Build 2 Wave 8: extract every hyperlink from a PDF.

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import type { PdfLink } from "@/lib/pdf/ops/links";

interface ToolResult {
  fileName: string;
  fileSize: number;
  links: PdfLink[];
  externalCount: number;
  internalCount: number;
  unsupported: boolean;
}

type LoadStage = "idle" | "extracting" | "done";

export function PdfLinksTool() {
  const tracker = useTrackToolView("pdf-links", "Organize");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<LoadStage>("idle");
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
      const { extractLinks } = await import("@/lib/pdf/ops/links");
      const r = extractLinks(bytes);
      setResult({
        fileName: file.name,
        fileSize: file.size,
        links: r.links,
        externalCount: r.externalCount,
        internalCount: r.internalCount,
        unsupported: r.unsupported,
      });
      setStage("done");
      tracker.success({
        creditCost: 0,
        pageCount: r.links.length,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("pdf-links failed", err);
      const msg = err instanceof Error ? err.message : "Could not parse the PDF.";
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

  const downloadCsv = () => {
    if (!result) return;
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = "page,type,target";
    const rows = result.links.map((l) =>
      [l.pageNumber, l.type, escape(l.target)].join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      const base = result.fileName.replace(/\.pdf$/i, "");
      a.download = `${base}.links.csv`;
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
      await navigator.clipboard.writeText(JSON.stringify(result.links, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  };

  const truncate = (s: string, max = 48) =>
    s.length <= max ? s : `${s.slice(0, max - 1)}…`;

  const busy = stage === "extracting";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to extract its links"
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
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>Extracting links…</div>
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
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {result.links.length === 0
                  ? result.unsupported
                    ? "Couldn't parse links"
                    : "No links found"
                  : `${result.links.length} link${result.links.length === 1 ? "" : "s"}`}
              </div>
              {result.links.length > 0 && (
                <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                  {result.externalCount} external · {result.internalCount} internal
                </div>
              )}
            </div>
            {result.links.length > 0 && (
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

          {result.links.length > 0 && (
            <div style={{ maxHeight: 480, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: "var(--bg-1)",
                    }}
                  >
                    <th style={cell(true)}>Page</th>
                    <th style={cell(true)}>Type</th>
                    <th style={cell(true)}>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {result.links.map((l, i) => (
                    <tr
                      key={i}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td style={cell()}>{l.pageNumber}</td>
                      <td style={cell()}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background:
                              l.type === "external"
                                ? "rgba(56, 189, 248, 0.12)"
                                : "var(--bg-2)",
                            color:
                              l.type === "external"
                                ? "rgb(56, 189, 248)"
                                : "var(--fg-muted)",
                          }}
                        >
                          {l.type}
                        </span>
                      </td>
                      <td
                        style={{
                          ...cell(),
                          fontFamily: "var(--mono, monospace)",
                          maxWidth: 460,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={l.target}
                      >
                        {l.type === "external" ? (
                          <a
                            href={l.target}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--accent)" }}
                          >
                            {l.target}
                          </a>
                        ) : (
                          l.target
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Extract from another PDF
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
              {busy ? "Extracting…" : "Extract links"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function cell(isHeader = false): React.CSSProperties {
  return {
    padding: "10px 16px",
    textAlign: "left",
    fontWeight: isHeader ? 500 : 400,
    fontSize: isHeader ? 11 : 13,
    letterSpacing: isHeader ? "0.05em" : undefined,
    textTransform: isHeader ? ("uppercase" as const) : undefined,
    color: isHeader ? "var(--fg-muted)" : "var(--fg)",
    verticalAlign: "top",
  };
}
