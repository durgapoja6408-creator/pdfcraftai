"use client";

// components/tools/PageCountTool.tsx
//
// 2026-04-27 (Inspector P3 — split): trimmed back to a focused
// page-count-only surface. Users searching "page count" / "count
// pages PDF" want ONE number to copy — they don't need a 5-stat
// dashboard. The richer 5-stat experience now lives at the sibling
// tool /tool/pdf-inspector (PdfInspectorTool.tsx).
//
// Both tools share the same `inspectPdf()` parse from
// lib/pdf/ops/inspect.ts — this one just renders the page count and
// drops everything else. Includes a cross-promo card pointing at
// PDF Inspector for users who want more.
//
// Why the split:
//   - URL/title alignment: /tool/page-count now actually says
//     "Page Counter", not "PDF Inspector"
//   - Search-intent fit: page-count seekers get a fast answer; users
//     who need more click through to the inspector
//   - SEO surface: two tools, two pages, two ranking opportunities

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import { mapPdfOpError } from "@/lib/pdf/error-messages";

type Result = {
  pageCount: number;
  fileName: string;
  fileSize: number;
  /**
   * P10: carry the scan-detection signal through from inspect.ts even
   * though Page Count doesn't show the rest of the inspector stats.
   * A scanned 10-page legal exhibit dropped here would otherwise
   * silently report "10 pages" with no hint that OCR is needed.
   */
  looksLikeScan: boolean;
};

type LoadStage = "idle" | "loading-engine" | "counting" | "done";

export function PageCountTool() {
  // P6: capture tracker so we can fire upload/success/error in addition
  // to the auto-fired tool_view. Funnel parity with PDF Inspector.
  const tracker = useTrackToolView("page-count", "Organize");
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
      // Reuse the full inspect op — we only need pageCount, but going
      // through the same module keeps both tools on one PDFium parse
      // and avoids divergent error handling.
      const { inspectPdf } = await import("@/lib/pdf/ops/inspect");
      setStage("counting");
      const inspection = await inspectPdf(bytes);
      setResult({
        pageCount: inspection.pageCount,
        fileName: file.name,
        fileSize: file.size,
        looksLikeScan: inspection.looksLikeScan,
      });
      setStage("done");
      tracker.success({
        creditCost: 0,
        pageCount: inspection.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("page-count failed", err);
      const msg =
        err instanceof Error ? err.message : "Could not read the PDF. Is it valid?";
      setError(mapPdfOpError(msg));
      setStage("idle");
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

  const copyCount = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(String(result.pageCount));
      setCopied(true);
    } catch {
      // Silent fail — clipboard write needs user gesture + HTTPS,
      // and a follow-up click usually succeeds.
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

  const busy = stage === "loading-engine" || stage === "counting";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to count pages"
          hint="Up to 100 MB · runs privately in your browser via Google PDFium"
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
                : "Counting pages…"}
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
          style={{
            padding: "24px 28px",
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            alignItems: "center",
            gap: 20,
          }}
          role="status"
          aria-live="polite"
          aria-label={`Page count result: ${result.pageCount} pages`}
        >
          <div
            style={{
              fontSize: 56,
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
            <div style={{ fontSize: 16, fontWeight: 500 }}>
              page{result.pageCount === 1 ? "" : "s"}
            </div>
            <div
              className="subtle"
              style={{ fontSize: 12, marginTop: 4 }}
              title={result.fileName}
            >
              in {truncateFilename(result.fileName, 36)} ·{" "}
              {humanSize(result.fileSize)}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={copyCount}
            aria-label="Copy page count to clipboard"
            style={{ minWidth: 110 }}
          >
            {copied ? (
              <>
                <I.Check size={14} /> Copied
              </>
            ) : (
              <>
                <I.Copy size={14} /> Copy
              </>
            )}
          </button>
        </div>
      )}

      {/* P10: scan warning (mirrors the same nudge on PDF Inspector).
          Page Count's narrow purpose still benefits from this signal
          — a user who dropped a scan into Page Count is going to
          immediately wonder why their PDF doesn't seem searchable.
          Surfacing the OCR CTA here saves them the round-trip. */}
      {result?.looksLikeScan && (
        <div
          className="card"
          style={{
            padding: "10px 16px",
            background: "var(--accent-soft)",
            color: "var(--accent)",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <I.Scan size={14} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
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
        </div>
      )}

      {/* Cross-promo to PDF Inspector previously rendered here. Removed
          because the same cross-link is already provided by the
          ToolIntroPanel above the dropzone (via TOOL_INTROS) AND by
          the Related Tools row at the bottom of the runner page. Three
          cross-promos for one tool was overkill. */}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {/* P10: mirror PDF Inspector's pattern — when a result is
            shown, the action button changes from a quiet ghost
            "Reset" to a primary "Count another PDF" CTA, encouraging
            repeat use rather than feeling terminal. */}
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Count another PDF
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
              {busy ? "Counting…" : "Count pages"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
