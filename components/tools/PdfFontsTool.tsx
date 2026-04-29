"use client";

// components/tools/PdfFontsTool.tsx
//
// Build 2 Wave 4 (final) (2026-04-27): list every font referenced
// in a PDF, dedupe across pages, flag embedded vs not.

import { useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import type { PdfFont } from "@/lib/pdf/ops/fonts";
import { mapPdfOpError } from "@/lib/pdf/error-messages";

interface FontsToolResult {
  fileName: string;
  fileSize: number;
  fonts: PdfFont[];
  nonEmbeddedCount: number;
  unsupported: boolean;
}

type LoadStage = "idle" | "extracting" | "done";

export function PdfFontsTool() {
  const tracker = useTrackToolView("pdf-fonts", "Organize");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<LoadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FontsToolResult | null>(null);
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
      const { extractFonts } = await import("@/lib/pdf/ops/fonts");
      const r = extractFonts(bytes);
      setResult({
        fileName: file.name,
        fileSize: file.size,
        fonts: r.fonts,
        nonEmbeddedCount: r.nonEmbeddedCount,
        unsupported: r.unsupported,
      });
      setStage("done");
      tracker.success({
        creditCost: 0,
        pageCount: r.fonts.length,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("pdf-fonts failed", err);
      const msg =
        err instanceof Error ? err.message : "Could not parse the PDF fonts.";
      setError(mapPdfOpError(msg));
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
    const header = "base_font,subtype,embedded,subsetted,pages";
    const rows = result.fonts.map((f) =>
      [
        escape(f.baseFont),
        f.subtype,
        f.embedded ? "yes" : "no",
        f.subsetted ? "yes" : "no",
        escape(f.pages.join(",")),
      ].join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      const base = result.fileName.replace(/\.pdf$/i, "");
      a.download = `${base}.fonts.csv`;
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
      await navigator.clipboard.writeText(JSON.stringify(result.fonts, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
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
          prompt="Drop a PDF to inspect its fonts"
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
            Reading fonts…
          </div>
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden" }}
          role="status"
          aria-live="polite"
          aria-label={`Found ${result.fonts.length} fonts`}
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
                {result.fonts.length === 0
                  ? result.unsupported
                    ? "Couldn't parse fonts"
                    : "No fonts found"
                  : `${result.fonts.length} font${result.fonts.length === 1 ? "" : "s"}`}
              </div>
              {result.fonts.length > 0 && result.nonEmbeddedCount > 0 && (
                <div
                  className="subtle"
                  style={{ fontSize: 12, marginTop: 2, color: "var(--accent)" }}
                >
                  {result.nonEmbeddedCount} of {result.fonts.length} not embedded
                  — print may substitute glyphs
                </div>
              )}
              {result.fonts.length > 0 && result.nonEmbeddedCount === 0 && (
                <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                  All fonts embedded — safe for print
                </div>
              )}
              {result.fonts.length === 0 && result.unsupported && (
                <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                  Cross-reference streams or encryption block our byte parser.
                </div>
              )}
            </div>
            {result.fonts.length > 0 && (
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={copyJson}
                  aria-label="Copy fonts as JSON"
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
                  aria-label="Download fonts as CSV"
                >
                  <I.Download size={12} /> CSV
                </button>
              </div>
            )}
          </div>

          {result.fonts.length > 0 && (
            <div style={{ maxHeight: 480, overflowY: "auto" }}>
              <table
                style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: "var(--bg-1)",
                    }}
                  >
                    <th style={cellStyle(true)}>Font</th>
                    <th style={cellStyle(true)}>Subtype</th>
                    <th style={cellStyle(true)}>Embedded</th>
                    <th style={cellStyle(true)}>Pages</th>
                  </tr>
                </thead>
                <tbody>
                  {result.fonts.map((f, i) => (
                    <tr
                      key={`${f.objectNumber}-${i}`}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td style={cellStyle()} title={f.baseFont}>
                        <span style={{ fontFamily: "var(--mono, monospace)" }}>
                          {f.baseFont}
                        </span>
                        {f.subsetted && (
                          <span
                            className="subtle"
                            style={{ fontSize: 11, marginLeft: 6 }}
                          >
                            (subset)
                          </span>
                        )}
                      </td>
                      <td style={cellStyle()}>
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
                          {f.subtype || "—"}
                        </span>
                      </td>
                      <td style={cellStyle()}>
                        {f.embedded ? (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 500,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: "rgba(74, 222, 128, 0.12)",
                              color: "rgb(74, 222, 128)",
                            }}
                          >
                            ✓ embedded
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 500,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: "rgba(251, 146, 60, 0.12)",
                              color: "rgb(251, 146, 60)",
                            }}
                          >
                            ✗ not embedded
                          </span>
                        )}
                      </td>
                      <td style={cellStyle()}>
                        <span className="subtle" style={{ fontSize: 11 }}>
                          {f.pages.length === 1
                            ? `p. ${f.pages[0]}`
                            : f.pages.length <= 5
                              ? `pp. ${f.pages.join(", ")}`
                              : `${f.pages.length} pages`}
                        </span>
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
              {busy ? "Reading…" : "Inspect fonts"}
            </button>
          </>
        )}
      </div>

      {/* P12: removed — duplicates ToolIntroPanel + Related Tools. */}
    </div>
  );
}

function cellStyle(isHeader = false): React.CSSProperties {
  return {
    padding: "10px 16px",
    textAlign: "left",
    fontWeight: isHeader ? 500 : 400,
    fontSize: isHeader ? 11 : 13,
    letterSpacing: isHeader ? "0.05em" : undefined,
    textTransform: isHeader ? ("uppercase" as const) : undefined,
    color: isHeader ? "var(--fg-muted)" : "var(--fg)",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  };
}
