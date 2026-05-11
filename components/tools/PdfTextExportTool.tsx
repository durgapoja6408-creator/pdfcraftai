"use client";

// components/tools/PdfTextExportTool.tsx
//
// Build 2 (2026-04-27): shared runner used by three sibling tools —
// PDF → Text, PDF → Markdown, PDF → HTML. Differs only in the
// `format` prop, the displayed action labels, and the file
// extension. All three call the same `extractPagesText()` op + one
// of the three formatters in lib/pdf/ops/text-export.ts.
//
// Why one component with three thin wrappers instead of three
// separate components: the tool's mechanics are identical (drop,
// extract, format, download). Diverging into three near-duplicate
// 200-line components would mean three places to fix bugs. The
// per-tool surface (URL, name, copy) lives in the wrapper.

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { ToolHowItWorks } from "./ToolHowItWorks";
import { humanSize } from "@/lib/client/pdf-utils";
import { downloadBytes } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import {
  formatAsText,
  formatAsMarkdown,
  formatAsHtml,
} from "@/lib/pdf/ops/text-export";
import { mapPdfOpError } from "@/lib/pdf/error-messages";

export type TextExportFormat = "text" | "markdown" | "html";

interface ExportResult {
  fileName: string;
  fileSize: number;
  pageCount: number;
  output: string;
  outputBytes: number;
  looksLikeScan: boolean;
}

const FORMAT_CONFIG: Record<
  TextExportFormat,
  {
    actionLabel: string;
    busyLabel: string;
    nounLabel: string;
    extension: string;
    mimeType: string;
    dropPrompt: string;
  }
> = {
  text: {
    actionLabel: "Extract text",
    busyLabel: "Extracting text…",
    nounLabel: "text",
    extension: "txt",
    mimeType: "text/plain;charset=utf-8",
    dropPrompt: "Drop a PDF to extract text",
  },
  markdown: {
    actionLabel: "Convert to Markdown",
    busyLabel: "Converting to Markdown…",
    nounLabel: "markdown",
    extension: "md",
    mimeType: "text/markdown;charset=utf-8",
    dropPrompt: "Drop a PDF to convert to Markdown",
  },
  html: {
    actionLabel: "Convert to HTML",
    busyLabel: "Converting to HTML…",
    nounLabel: "html",
    extension: "html",
    mimeType: "text/html;charset=utf-8",
    dropPrompt: "Drop a PDF to convert to HTML",
  },
};

type LoadStage = "idle" | "loading-engine" | "extracting" | "done";

export interface PdfTextExportToolProps {
  /** Tool id used for GA4 tracking + cross-promo links. */
  toolId: string;
  /** Format-specific copy + extension. */
  format: TextExportFormat;
}

export function PdfTextExportTool({ toolId, format }: PdfTextExportToolProps) {
  const tracker = useTrackToolView(toolId, "Convert");
  const cfg = FORMAT_CONFIG[format];
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<LoadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
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
      const { extractPagesText } = await import("@/lib/pdf/ops/text-export");
      const { inspectPdf } = await import("@/lib/pdf/ops/inspect");
      setStage("extracting");
      // Run the extraction + a lightweight inspection in parallel —
      // both touch the same bytes. We use the inspection only for
      // looksLikeScan (so we can warn the user if their export will
      // be empty), not for the export itself.
      const [pages, inspection] = await Promise.all([
        extractPagesText(bytes),
        inspectPdf(bytes),
      ]);
      const formatter =
        format === "text"
          ? formatAsText
          : format === "markdown"
            ? formatAsMarkdown
            : formatAsHtml;
      const output =
        format === "html"
          ? formatAsHtml(pages, file.name.replace(/\.pdf$/i, ""))
          : formatter(pages);
      setResult({
        fileName: file.name,
        fileSize: file.size,
        pageCount: inspection.pageCount,
        output,
        outputBytes: new Blob([output]).size,
        looksLikeScan: inspection.looksLikeScan,
      });
      setStage("done");
      tracker.success({
        creditCost: 0,
        pageCount: inspection.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error(`${toolId} failed`, err);
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

  const copyOutput = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.output);
      setCopied(true);
    } catch {
      // Clipboard write requires HTTPS + user gesture. Silent fail.
    }
  };

  const downloadOutput = () => {
    if (!result) return;
    const base = result.fileName.replace(/\.pdf$/i, "");
    downloadBytes(result.output, `${base}.${cfg.extension}`, cfg.mimeType);
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

  const busy = stage === "loading-engine" || stage === "extracting";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <ToolHowItWorks
        steps={[
          {
            title: "Drop in your PDF",
            body: "Text-based PDFs work best — scanned image PDFs need to be run through OCR first to have an extractable text layer. Up to 100 MB.",
          },
          {
            title: "PDFium extracts every page's text",
            body: "Reading order preserved, page breaks marked, multi-column flow stitched correctly. We pull the actual text bytes — not a re-OCR — so it stays accurate to the source.",
          },
          {
            title: "Save as .txt or copy to clipboard",
            body: "Drop the plain text into your downstream pipeline, search index, RAG ingest, or notes app. One file per source PDF.",
          },
        ]}
        privacyNote="Your PDF never leaves your browser. PDFium runs locally in WebAssembly — nothing is uploaded or persisted."
      />
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt={cfg.dropPrompt}
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
                : cfg.busyLabel}
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
          aria-label={`Extracted ${cfg.nounLabel} from ${result.pageCount} pages`}
        >
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid var(--border)",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Extracted {cfg.nounLabel} from{" "}
                <strong>{result.pageCount}</strong>{" "}
                page{result.pageCount === 1 ? "" : "s"}
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                {humanSize(result.outputBytes)} · ready to download or copy
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={copyOutput}
                aria-label="Copy output to clipboard"
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
                className="btn btn-sm btn-primary"
                onClick={downloadOutput}
                aria-label={`Download as .${cfg.extension}`}
              >
                <I.Download size={12} /> Download .{cfg.extension}
              </button>
            </div>
          </div>

          {/* Preview — first ~600 chars of the output, rendered as
              monospace pre. Helps users see "yes, this is what I
              expected" before they commit to download. */}
          <pre
            style={{
              margin: 0,
              padding: "16px 24px",
              fontSize: 12,
              lineHeight: 1.6,
              fontFamily: "var(--mono, monospace)",
              maxHeight: 280,
              overflow: "auto",
              background: "var(--bg-1)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {result.output.length > 600
              ? `${result.output.slice(0, 600)}\n…\n[${(result.output.length - 600).toLocaleString()} more characters — download to see the rest]`
              : result.output}
          </pre>

          {/* Scan-detection nudge — same heuristic as Inspector. If
              the user dropped a scan, the export is going to be empty
              or near-empty; surface OCR before they wonder why. */}
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
              Looks like a scanned PDF — the export will be sparse because
              there&apos;s little extractable text. Run{" "}
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
              first to OCR it.
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Convert another PDF
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
              {busy ? cfg.busyLabel : cfg.actionLabel}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ----- Thin per-tool wrappers --------------------------------------
// Each tool gets its own export so the dispatch switch in
// app/tool/[id]/page.tsx stays explicit (one case per tool, no
// dynamic prop wiring at the call site).

export function PdfToTextTool() {
  return <PdfTextExportTool toolId="pdf-to-text" format="text" />;
}
export function PdfToMarkdownTool() {
  return <PdfTextExportTool toolId="pdf-to-markdown" format="markdown" />;
}
export function PdfToHtmlTool() {
  return <PdfTextExportTool toolId="pdf-to-html" format="html" />;
}
