"use client";

// components/tools/PdfInspectorTool.tsx
//
// 2026-04-27 (Inspector P3 — split from Page Counter):
//   The full document inspector that previously lived inside
//   PageCountTool. Same single PDFium load, surfaces all five stats
//   (pages, file size, page size, word count, reading time) plus the
//   mixed-orientation warning. Mounted at /tool/pdf-inspector so the
//   URL matches the visible product name.
//
// Page Counter (the sibling tool at /tool/page-count) ships a
// stripped-down "just one number" surface for the high-volume
// "page count" search intent — see PageCountTool.tsx for that.
//
// The two tools deliberately share `lib/pdf/ops/inspect.ts` — the
// inspector calls the same parse, just renders all the fields
// instead of one.

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import {
  describePageSize,
  formatReadingTime,
  pointsToInches,
  type DocumentInspection,
} from "@/lib/pdf/ops/inspect";

type Result = DocumentInspection & {
  fileName: string;
  fileSize: number;
};

type LoadStage = "idle" | "loading-engine" | "inspecting" | "done";

export function PdfInspectorTool() {
  useTrackToolView("pdf-inspector", "Organize");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<LoadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const onFiles = useCallback((files: File[]) => {
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
  }, []);

  const run = async () => {
    if (!file) return;
    setError(null);
    setStage("loading-engine");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { inspectPdf } = await import("@/lib/pdf/ops/inspect");
      setStage("inspecting");
      const inspection = await inspectPdf(bytes);
      setResult({
        ...inspection,
        fileName: file.name,
        fileSize: file.size,
      });
      setStage("done");
    } catch (err) {
      console.error("inspect failed", err);
      setError(
        err instanceof Error ? err.message : "Could not read the PDF. Is it valid?",
      );
      setStage("idle");
    }
  };

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setStage("idle");
    setCopied(false);
  };

  const copySummary = async () => {
    if (!result) return;
    const dimsIn = `${pointsToInches(result.firstPageDimensions.width).toFixed(1)} × ${pointsToInches(result.firstPageDimensions.height).toFixed(1)} in`;
    const summary = [
      `File: ${result.fileName}`,
      `Pages: ${result.pageCount}`,
      `Size: ${humanSize(result.fileSize)}`,
      `Page size: ${describePageSize(result.firstPageDimensions)} (${dimsIn})`,
      `Words: ${result.wordCount.toLocaleString()}${result.wordCountEstimated ? " (approx)" : ""}`,
      `Reading time: ${formatReadingTime(result.wordCount)} @ 250 wpm`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
    } catch {
      // Clipboard write can fail on non-HTTPS or without user gesture.
      // Silent fall-through — the next click usually succeeds.
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

  const busy = stage === "loading-engine" || stage === "inspecting";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to inspect"
          hint="Up to 100 MB · processed privately in your browser via Google PDFium"
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
        >
          <span
            className="pulse-soft"
            style={{ color: "var(--accent)", display: "inline-flex" }}
          >
            <I.Sparkle size={16} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {stage === "loading-engine"
                ? "Loading PDFium engine…"
                : "Inspecting the PDF…"}
            </div>
            {stage === "loading-engine" && (
              <div className="subtle" style={{ fontSize: 11, marginTop: 2 }}>
                One-time download (~3.8 MB) · cached for next time
              </div>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid var(--border)",
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                fontSize: 40,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "var(--accent)",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
              aria-label={`${result.pageCount} pages`}
            >
              {result.pageCount.toLocaleString()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                page{result.pageCount === 1 ? "" : "s"}
              </div>
              <div
                className="subtle"
                style={{ fontSize: 12, marginTop: 2 }}
                title={result.fileName}
              >
                in {truncateFilename(result.fileName, 36)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={copySummary}
              aria-label="Copy summary to clipboard"
              style={{ minWidth: 110 }}
            >
              {copied ? (
                <>
                  <I.Check size={12} /> Copied
                </>
              ) : (
                <>
                  <I.Copy size={12} /> Copy stats
                </>
              )}
            </button>
          </div>

          <div
            style={{
              padding: "16px 24px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 16,
            }}
          >
            <Stat label="File size" value={humanSize(result.fileSize)} />
            <Stat
              label="Page size"
              value={describePageSize(result.firstPageDimensions)}
              hint={`${pointsToInches(result.firstPageDimensions.width).toFixed(1)} × ${pointsToInches(result.firstPageDimensions.height).toFixed(1)} in`}
            />
            <Stat
              label="Word count"
              value={`${result.wordCount.toLocaleString()}${result.wordCountEstimated ? "*" : ""}`}
              hint={result.wordCountEstimated ? "approx (sampled)" : "exact"}
            />
            <Stat
              label="Reading time"
              value={formatReadingTime(result.wordCount)}
              hint="at 250 wpm"
            />
          </div>

          {/* Page-size warning OR confirmation. The asymmetry of only
              showing the negative was a missed reassurance opportunity
              — when pages ARE uniform, surfacing that closes the loop
              for users doing print-prep. */}
          {result.uniformDimensions ? (
            <div
              style={{
                padding: "10px 24px",
                borderTop: "1px solid var(--border)",
                fontSize: 12,
                color: "var(--green, #4ade80)",
                background: "var(--bg-1)",
              }}
            >
              <I.Check size={12} style={{ verticalAlign: "middle", marginRight: 6 }} />
              All pages share the same size and orientation.
            </div>
          ) : (
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
              This PDF mixes page sizes or orientations — heads up if you&apos;re printing.
            </div>
          )}

          {/* Inspector P4 scan-detection nudge: dramatically low text
              per page → almost certainly a scanned PDF. Surface OCR
              CTA so the user knows their next step. The check runs
              after the warning row above so it appears as a separate,
              more prominent block. */}
          {result.looksLikeScan && (
            <div
              style={{
                padding: "10px 24px",
                borderTop: "1px solid var(--border)",
                fontSize: 12,
                color: "var(--accent)",
                background: "var(--accent-soft)",
              }}
            >
              <I.Scan size={12} style={{ verticalAlign: "middle", marginRight: 6 }} />
              Looks like a scanned PDF — text isn&apos;t searchable. Run{" "}
              <Link
                href="/tool/ai-searchable-pdf"
                style={{
                  color: "var(--accent)",
                  fontWeight: 500,
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                  textUnderlineOffset: 3,
                }}
              >
                Make PDF Searchable
              </Link>{" "}
              to OCR it.
            </div>
          )}
        </div>
      )}

      {/* Cross-promo to Page Counter previously rendered here. Removed
          because the same cross-link is already provided by the
          ToolIntroPanel above the dropzone (via TOOL_INTROS) AND by
          the Related Tools row at the bottom of the runner page. */}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {/* P4: when a result is shown, the action button changes from
            "Reset" to "Inspect another PDF" — same handler, more
            inviting copy. Encourages repeat use rather than feeling
            terminal. */}
        {result ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={reset}
          >
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
              {busy ? "Inspecting…" : "Inspect PDF"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div
        className="mono subtle"
        style={{ fontSize: 10, letterSpacing: "0.05em" }}
      >
        {label.toUpperCase()}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 500,
          marginTop: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {hint && (
        <div className="subtle" style={{ fontSize: 11, marginTop: 2 }}>
          {hint}
        </div>
      )}
    </div>
  );
}
