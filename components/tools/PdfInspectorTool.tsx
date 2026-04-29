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
import type { PdfMetadata } from "@/lib/pdf/ops/metadata";
import { mapPdfOpError } from "@/lib/pdf/error-messages";

type Result = DocumentInspection & {
  fileName: string;
  fileSize: number;
};

type LoadStage = "idle" | "loading-engine" | "inspecting" | "done";

export function PdfInspectorTool() {
  // P6: capture the tracker so we can fire upload/success/error events,
  // not just view. Was previously discarded — we got tool_view for
  // free but no funnel beyond that.
  const tracker = useTrackToolView("pdf-inspector", "Organize");
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
      // P6: fire tool_upload as soon as the user accepts a file (not
      // when they click Inspect). Captures intent even if they
      // abandon before running.
      tracker.upload(f);
    },
    [tracker],
  );

  const run = async () => {
    if (!file) return;
    setError(null);
    setStage("loading-engine");
    const t0 = performance.now();
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
      // P6: tool_run_success — credit cost is 0 (free tool), but
      // logging it lets us compute funnel conversion vs other tools.
      tracker.success({
        creditCost: 0,
        pageCount: inspection.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("inspect failed", err);
      const msg =
        err instanceof Error ? err.message : "Could not read the PDF. Is it valid?";
      setError(mapPdfOpError(msg));
      setStage("idle");
      // P6: classify error coarsely for analytics — distinguishes
      // engine-load failures from parse failures.
      const errorCode =
        err instanceof Error && /pdfium|wasm/i.test(err.message)
          ? "engine_load"
          : "parse_failed";
      tracker.error({ errorCode });
    }
  };

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setStage("idle");
    setCopied(false);
  };

  /**
   * P7: download the full inspection as a JSON file. Useful for
   * auditors and batch workflows where the user wants programmatic
   * access to the stats without screen-scraping the result card.
   *
   * Filename mirrors the source PDF (.pdf → .inspection.json) so a
   * batch of 50 inspections lands as 50 differently-named files.
   * Pure browser-side blob — no network round-trip.
   */
  const downloadJson = () => {
    if (!result) return;
    const dimsInches = {
      width: Number(pointsToInches(result.firstPageDimensions.width).toFixed(2)),
      height: Number(pointsToInches(result.firstPageDimensions.height).toFixed(2)),
    };
    const payload = {
      // Echo the source so the JSON is self-describing.
      file: { name: result.fileName, size_bytes: result.fileSize },
      // Inspection results.
      pages: result.pageCount,
      page_size: {
        label: describePageSize(result.firstPageDimensions),
        points: {
          width: result.firstPageDimensions.width,
          height: result.firstPageDimensions.height,
        },
        inches: dimsInches,
      },
      uniform_dimensions: result.uniformDimensions,
      word_count: result.wordCount,
      word_count_estimated: result.wordCountEstimated,
      reading_time: formatReadingTime(result.wordCount),
      looks_like_scan: result.looksLikeScan,
      pages_with_text: result.pagesWithText,
      // Metadata block. Empty fields preserved here (vs. clipboard
      // copy which strips them) so consumers parsing the JSON can
      // assume the schema is stable.
      metadata: result.metadata,
      // Provenance — helpful when this JSON ends up in a batch
      // pipeline three months from now.
      generated_by: "pdfcraft.ai PDF Inspector",
      generated_at: new Date().toISOString(),
      schema_version: 1,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      // Strip .pdf and append .inspection.json. Defensive against
      // weird casing.
      const base = result.fileName.replace(/\.pdf$/i, "");
      a.download = `${base}.inspection.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      // Revoke immediately — the click triggers the download
      // synchronously, so we don't need to keep the blob alive.
      URL.revokeObjectURL(url);
    }
  };

  const copySummary = async () => {
    if (!result) return;
    const dimsIn = `${pointsToInches(result.firstPageDimensions.width).toFixed(1)} × ${pointsToInches(result.firstPageDimensions.height).toFixed(1)} in`;
    const lines = [
      `File: ${result.fileName}`,
      `Pages: ${result.pageCount}`,
      `Size: ${humanSize(result.fileSize)}`,
      `Page size: ${describePageSize(result.firstPageDimensions)} (${dimsIn})`,
      `Words: ${result.wordCount.toLocaleString()}${result.wordCountEstimated ? " (approx)" : ""}`,
      `Reading time: ${formatReadingTime(result.wordCount)} @ 250 wpm`,
    ];
    // P5: append metadata section if any field is populated. We don't
    // dump empties — keeps the clipboard payload clean for users who
    // paste into spreadsheets / docs.
    const m = result.metadata;
    const metaLines: string[] = [];
    if (m.version) metaLines.push(`PDF version: ${m.version}`);
    if (m.encrypted) metaLines.push(`Encrypted: yes`);
    if (m.title) metaLines.push(`Title: ${m.title}`);
    if (m.author) metaLines.push(`Author: ${m.author}`);
    if (m.subject) metaLines.push(`Subject: ${m.subject}`);
    if (m.creator) metaLines.push(`Creator: ${m.creator}`);
    if (m.producer) metaLines.push(`Producer: ${m.producer}`);
    if (m.creationDate) metaLines.push(`Created: ${m.creationDate}`);
    if (m.modDate) metaLines.push(`Modified: ${m.modDate}`);
    if (metaLines.length) lines.push("", "Metadata", ...metaLines);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
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
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden" }}
          role="status"
          aria-live="polite"
          aria-label={`Inspection results: ${result.pageCount} pages`}
        >
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
            <div className="row" style={{ gap: 6 }}>
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
              {/* P7: JSON export. Downloads as <filename>.inspection.json.
                  Useful for batch audits + pipeline integrations where
                  Copy-paste isn't an option. */}
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={downloadJson}
                aria-label="Download inspection as JSON"
                title="Download as JSON"
              >
                <I.Download size={12} /> JSON
              </button>
            </div>
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

          {/* Inspector P5 metadata block. Renders only when at least
              ONE field is populated — avoids dumping an empty section
              for stripped PDFs or docs where the cross-ref stream
              hides the Info dict from our byte parser. The block
              groups: identity (Title/Author/Subject), provenance
              (Creator/Producer/dates), and tech (PDF version,
              encryption). */}
          <PdfMetadataSection metadata={result.metadata} />

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

          {/* Inspector P8: hybrid PDF detection. Some pages have text,
              some don't — typically a mix of scanned content + a
              cover page or a digital chapter inserted into a scan
              stack. The fully-scanned case is already covered above
              by looksLikeScan; the fully-textual case needs no
              warning. The middle case (some but not all) is what we
              flag here. */}
          {!result.looksLikeScan &&
            result.pagesWithText > 0 &&
            result.pagesWithText < result.pageCount && (
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
                Hybrid PDF: {result.pagesWithText} of {result.pageCount} page
                {result.pageCount === 1 ? "" : "s"} have extractable text
                {result.wordCountEstimated && " (sampled)"}. The other{" "}
                {result.pageCount - result.pagesWithText} may be scanned or blank
                — consider running{" "}
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
                if Ctrl-F isn&apos;t finding what you expect.
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

/**
 * Inspector P5 metadata block. Only renders if the parser pulled at
 * least one usable field. Layout: a horizontal rule above, then a
 * 2-column responsive grid of label/value rows, then small badge
 * chips for the technical bits (PDF version, encrypted flag).
 *
 * Empty fields are omitted entirely — better UX than showing "Title:
 * (empty)" rows for stripped or scrubbed PDFs.
 */
function PdfMetadataSection({ metadata }: { metadata: PdfMetadata }) {
  // Have any meaningful field? If everything is empty + version is
  // null + not encrypted, render nothing.
  const hasAny =
    !!metadata.version ||
    metadata.encrypted ||
    !!metadata.title ||
    !!metadata.author ||
    !!metadata.subject ||
    !!metadata.keywords ||
    !!metadata.creator ||
    !!metadata.producer ||
    !!metadata.creationDate ||
    !!metadata.modDate;
  if (!hasAny) return null;

  const rows: Array<[string, string]> = [];
  if (metadata.title) rows.push(["Title", metadata.title]);
  if (metadata.author) rows.push(["Author", metadata.author]);
  if (metadata.subject) rows.push(["Subject", metadata.subject]);
  if (metadata.keywords) rows.push(["Keywords", metadata.keywords]);
  if (metadata.creator) rows.push(["Creator", metadata.creator]);
  if (metadata.producer) rows.push(["Producer", metadata.producer]);
  if (metadata.creationDate) rows.push(["Created", formatIsoForDisplay(metadata.creationDate)]);
  if (metadata.modDate) rows.push(["Modified", formatIsoForDisplay(metadata.modDate)]);

  return (
    <div
      style={{
        padding: "16px 24px",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div
        className="mono subtle"
        style={{
          fontSize: 10,
          letterSpacing: "0.05em",
          marginBottom: 12,
        }}
      >
        METADATA
      </div>

      {/* Tech badges row (PDF version + encryption flag). These get
          their own row above the metadata table because they're
          single-token facts, not key/value pairs. */}
      {(metadata.version || metadata.encrypted) && (
        <div
          className="row"
          style={{ gap: 8, marginBottom: rows.length ? 14 : 0, flexWrap: "wrap" }}
        >
          {metadata.version && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "3px 8px",
                borderRadius: 4,
                background: "var(--bg-2)",
                color: "var(--fg-muted)",
              }}
            >
              PDF {metadata.version}
            </span>
          )}
          {metadata.encrypted && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "3px 8px",
                borderRadius: 4,
                background: "rgba(251, 146, 60, 0.12)",
                color: "rgb(251, 146, 60)",
              }}
            >
              <I.Lock size={10} style={{ verticalAlign: "middle", marginRight: 3 }} />
              Encrypted
            </span>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "120px 1fr",
            rowGap: 8,
            columnGap: 16,
            margin: 0,
            fontSize: 13,
          }}
        >
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt
                className="subtle"
                style={{ fontSize: 12, paddingTop: 1 }}
              >
                {k}
              </dt>
              <dd
                style={{
                  margin: 0,
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                }}
                title={v}
              >
                {v}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Display-format an ISO 8601 date as a user-friendly string. */
function formatIsoForDisplay(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    // E.g. "Apr 27, 2026, 09:30" — locale-aware, short form.
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
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
