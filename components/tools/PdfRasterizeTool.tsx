"use client";

// components/tools/PdfRasterizeTool.tsx
//
// Build 2 Wave 2 (2026-04-27): shared runner for PDF → JPG and
// PDF → PNG. Same factoring as the text-export trio: one runner
// component with a `format` prop, two thin per-tool wrappers.
//
// Differs from the text-export runner in three ways:
//   1. Output is binary blobs, not text — no preview pane, instead
//      a page-thumbnail grid showing the rendered images.
//   2. Multi-page output bundles into a .zip via JSZip; single-page
//      downloads directly.
//   3. User picks the resolution (1×/2×/3×) before rendering.
//      Higher scale = bigger files but sharper images.
//
// JSZip is dynamically imported on demand so the ~100 KB lib doesn't
// inflate the initial route bundle.

import { useState, useCallback, useEffect } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { ToolHowItWorks } from "./ToolHowItWorks";
import { humanSize } from "@/lib/client/pdf-utils";
import { downloadBytes } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import type { RasterFormat, RasterPage } from "@/lib/pdf/ops/rasterize";
import { mapPdfOpError } from "@/lib/pdf/error-messages";

export type RasterizeFormat = RasterFormat;

interface RasterResult {
  fileName: string;
  fileSize: number;
  pages: RasterPage[];
  thumbnails: string[]; // object URLs for previews
  totalBytes: number;
}

const FORMAT_CONFIG: Record<
  RasterizeFormat,
  {
    actionLabel: string;
    busyLabel: string;
    extension: string;
    mimeType: string;
    dropPrompt: string;
    productName: string;
  }
> = {
  jpeg: {
    actionLabel: "Convert to JPG",
    busyLabel: "Converting to JPG…",
    extension: "jpg",
    mimeType: "image/jpeg",
    dropPrompt: "Drop a PDF to convert to JPG",
    productName: "JPG",
  },
  png: {
    actionLabel: "Convert to PNG",
    busyLabel: "Converting to PNG…",
    extension: "png",
    mimeType: "image/png",
    dropPrompt: "Drop a PDF to convert to PNG",
    productName: "PNG",
  },
};

type LoadStage = "idle" | "loading-engine" | "rendering" | "done";

export interface PdfRasterizeToolProps {
  toolId: string;
  format: RasterizeFormat;
}

export function PdfRasterizeTool({ toolId, format }: PdfRasterizeToolProps) {
  const tracker = useTrackToolView(toolId, "Convert");
  const cfg = FORMAT_CONFIG[format];
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<LoadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RasterResult | null>(null);
  const [scale, setScale] = useState<1 | 2 | 3>(2);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  // 2026-05-11 (item #17 sweep batch 5) — URL permalink state sync.
  // Numeric variant — first sweep target with a non-string-literal
  // type (1 | 2 | 3 union). URL parser parses + range-checks before
  // dispatching to setScale. Default (2) omitted from URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("scale");
    // Numeric type but read as string from URL — parseInt + bounds
    // check. The 1/2/3 literals are radix-10 single digits so we
    // don't need parseFloat or any fancy validation.
    if (raw === "1") setScale(1);
    else if (raw === "2") setScale(2);
    else if (raw === "3") setScale(3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (scale === 2) {
      params.delete("scale");
    } else {
      params.set("scale", String(scale));
    }
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [scale]);

  // Revoke object URLs on cleanup or reset to prevent memory leaks.
  useEffect(() => {
    return () => {
      result?.thumbnails.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [result]);

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
    setProgress({ done: 0, total: 0 });
    const t0 = performance.now();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { rasterizePdf } = await import("@/lib/pdf/ops/rasterize");
      setStage("rendering");
      const pages = await rasterizePdf(bytes, {
        format,
        scale,
        quality: 0.9,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const thumbnails = pages.map((p) =>
        URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: cfg.mimeType })),
      );
      const totalBytes = pages.reduce((sum, p) => sum + p.bytes.length, 0);
      setResult({
        fileName: file.name,
        fileSize: file.size,
        pages,
        thumbnails,
        totalBytes,
      });
      setStage("done");
      tracker.success({
        creditCost: 0,
        pageCount: pages.length,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error(`${toolId} failed`, err);
      const msg =
        err instanceof Error ? err.message : "Could not render the PDF. Is it valid?";
      setError(mapPdfOpError(msg));
      setStage("idle");
      const errorCode =
        err instanceof Error && /pdfium|wasm/i.test(err.message)
          ? "engine_load"
          : err instanceof Error && /memory|heap/i.test(err.message)
            ? "out_of_memory"
            : "render_failed";
      tracker.error({ errorCode });
    }
  };

  const reset = () => {
    result?.thumbnails.forEach((u) => URL.revokeObjectURL(u));
    setFile(null);
    setError(null);
    setResult(null);
    setStage("idle");
    setProgress({ done: 0, total: 0 });
  };

  /**
   * Download a single page directly as <filename>-page-N.<ext>.
   * No zipping — direct browser download.
   */
  const downloadPage = (page: RasterPage) => {
    if (!result) return;
    const base = result.fileName.replace(/\.pdf$/i, "");
    const padded = String(page.pageNumber).padStart(
      String(result.pages.length).length,
      "0",
    );
    downloadBytes(
      page.bytes,
      `${base}-page-${padded}.${cfg.extension}`,
      cfg.mimeType,
    );
  };

  /**
   * Bundle all pages into a single .zip download. Dynamically imports
   * JSZip so it doesn't bloat the initial bundle.
   */
  const downloadAllZip = async () => {
    if (!result) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const base = result.fileName.replace(/\.pdf$/i, "");
    const padWidth = String(result.pages.length).length;
    for (const p of result.pages) {
      const padded = String(p.pageNumber).padStart(padWidth, "0");
      zip.file(`${base}-page-${padded}.${cfg.extension}`, p.bytes);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBytes(blob, `${base}-${cfg.extension}.zip`, "application/zip");
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

  const busy = stage === "loading-engine" || stage === "rendering";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <ToolHowItWorks
        steps={[
          {
            title: "Drop in your PDF",
            body: "Up to 100 MB. PDFium runs in WebAssembly in your browser — your PDF never leaves the page.",
          },
          {
            title: "Pick a scale",
            body: "1× / 2× / 3× pixel density. 1× matches the original page size; 2× and 3× sharpen for retina displays or print. Each scale balances file size against quality.",
          },
          {
            title: "Download every page as an image",
            body: "Output bundles one JPEG / PNG per page in a single .zip. Filenames carry the page number so the order is obvious. Great for thumbnails, image-only archives, or printing pages individually.",
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

      {/* Scale selector — pre-render. Renders inside the file card
          area so it's clearly part of "configure before running." */}
      {file && !result && !busy && (
        <div
          className="card"
          style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}
        >
          <div style={{ fontSize: 13, fontWeight: 500 }}>Resolution:</div>
          <div className="row" style={{ gap: 6 }}>
            {([1, 2, 3] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScale(s)}
                aria-pressed={scale === s}
                className={`btn btn-sm ${scale === s ? "btn-primary" : "btn-ghost"}`}
                style={{ minWidth: 64 }}
              >
                {s}× ({s * 72} DPI)
              </button>
            ))}
          </div>
          <div className="subtle" style={{ fontSize: 11, marginLeft: "auto" }}>
            {scale === 1 ? "smallest files" : scale === 3 ? "best quality" : "balanced"}
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
                : progress.total > 0
                  ? `${cfg.busyLabel} (page ${progress.done} of ${progress.total})`
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
          aria-label={`Rendered ${result.pages.length} pages as ${cfg.productName}`}
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
                <strong>{result.pages.length}</strong>{" "}
                {cfg.productName} image{result.pages.length === 1 ? "" : "s"}{" "}
                ready
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                {humanSize(result.totalBytes)} total · {scale}× resolution
              </div>
            </div>
            {result.pages.length > 1 ? (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={downloadAllZip}
                aria-label="Download all pages as a ZIP archive"
              >
                <I.Download size={12} /> Download all (.zip)
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => downloadPage(result.pages[0])}
                aria-label={`Download .${cfg.extension}`}
              >
                <I.Download size={12} /> Download .{cfg.extension}
              </button>
            )}
          </div>

          {/* Thumbnail grid. Each tile shows the rendered image
              with a per-page download button. For large PDFs this
              can be tall — wrap in scroll container. */}
          <div
            style={{
              padding: "16px 24px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 14,
              maxHeight: 480,
              overflowY: "auto",
            }}
          >
            {result.pages.map((p, i) => (
              <figure
                key={p.pageNumber}
                style={{
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.thumbnails[i]}
                  alt={`Page ${p.pageNumber}`}
                  style={{
                    width: "100%",
                    height: "auto",
                    aspectRatio: `${p.width} / ${p.height}`,
                    objectFit: "contain",
                    background: "var(--bg-2)",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                  }}
                  loading="lazy"
                />
                <div
                  className="row"
                  style={{ alignItems: "center", justifyContent: "space-between" }}
                >
                  <span className="subtle" style={{ fontSize: 11 }}>
                    Page {p.pageNumber} · {humanSize(p.bytes.length)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => downloadPage(p)}
                    aria-label={`Download page ${p.pageNumber}`}
                    style={{ padding: "2px 6px", fontSize: 11 }}
                  >
                    <I.Download size={11} />
                  </button>
                </div>
              </figure>
            ))}
          </div>
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

      {/* P12: removed — duplicates ToolIntroPanel + Related Tools. */}
    </div>
  );
}

// ----- Thin per-tool wrappers --------------------------------------

export function PdfToJpgTool() {
  return <PdfRasterizeTool toolId="pdf-to-jpg" format="jpeg" />;
}
export function PdfToPngTool() {
  return <PdfRasterizeTool toolId="pdf-to-png" format="png" />;
}
