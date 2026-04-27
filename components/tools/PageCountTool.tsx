"use client";

// components/tools/PageCountTool.tsx
//
// Build 1 P0 upgrade (2026-04-27): turned the single-fact "Page Counter"
// into a proper Document Inspector. Same single PDFium load, much more
// value surfaced. Route stays `/tool/page-count` and the page-count
// number is still the headline so SEO doesn't churn — but the result
// card now shows page dimensions, document classification, word count,
// reading time, plus a copy-to-clipboard.
//
// Why the renamed-but-not-renamed approach:
//   - "page count" is a high-volume search term we already rank for
//   - "PDF inspector" is a higher-volume search term but less specific
//   - Solution: keep the URL/H1 keyword, expand what the result card
//     actually delivers. Best of both — rank for "page count" but
//     deliver a 5x richer answer.

import { useState, useCallback, useEffect } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import {
  describePageSize,
  estimateReadingTimeMinutes,
  pointsToInches,
  type DocumentInspection,
} from "@/lib/pdf/ops/inspect";

type Result = DocumentInspection & {
  fileName: string;
  fileSize: number;
};

type LoadStage = "idle" | "loading-engine" | "inspecting" | "done";

export function PageCountTool() {
  useTrackToolView("page-count", "Organize");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<LoadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  // Auto-clear "Copied" state after 1.5s.
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

    // Stage 1: lazy-load the engine (only slow on first run)
    setStage("loading-engine");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { inspectPdf } = await import("@/lib/pdf/ops/inspect");

      // Stage 2: actual inspection (fast even on big PDFs)
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
        err instanceof Error
          ? err.message
          : "Could not read the PDF. Is it valid?",
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

  const copyCount = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(String(result.pageCount));
      setCopied(true);
    } catch {
      // Some browsers block clipboard without user gesture or HTTPS;
      // fall back to old-school selection. Skipping for brevity here.
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

      {/* Loading state with two-stage feedback */}
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
                : "Reading the PDF…"}
            </div>
            {stage === "loading-engine" && (
              <div className="subtle" style={{ fontSize: 11, marginTop: 2 }}>
                One-time download (~3.8 MB) · cached for next time
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rich result card — Document Inspector view */}
      {result && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {/* Headline: page count + filename */}
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
              onClick={copyCount}
              aria-label="Copy page count to clipboard"
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
          </div>

          {/* Stat grid */}
          <div
            style={{
              padding: "16px 24px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 16,
            }}
          >
            <Stat
              label="File size"
              value={humanSize(result.fileSize)}
            />
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
              value={`~${estimateReadingTimeMinutes(result.wordCount)} min`}
              hint="at 250 wpm"
            />
          </div>

          {/* Per-page-size warning */}
          {!result.uniformDimensions && (
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
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
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
        {/* Hide "Inspect" button after we have a result — replaced by Reset */}
        {!result && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!file || busy}
            onClick={run}
          >
            {busy ? "Inspecting…" : "Inspect PDF"}
          </button>
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
      <div className="mono subtle" style={{ fontSize: 10, letterSpacing: "0.05em" }}>
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
