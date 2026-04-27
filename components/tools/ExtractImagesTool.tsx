"use client";

// components/tools/ExtractImagesTool.tsx
//
// Build 2 Wave 3 (2026-04-27): pull every embedded image out of a
// PDF as PNG bytes. Distinct from PDF→JPG/PNG which rasterizes the
// WHOLE PAGE — this one extracts the original embedded images at
// their native resolution.
//
// Reuses the gallery + JSZip pattern from PdfRasterizeTool but
// without the scale picker (image objects have intrinsic size).

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import type { ExtractedImage } from "@/lib/pdf/ops/extract-images";

interface ExtractResult {
  fileName: string;
  fileSize: number;
  images: ExtractedImage[];
  thumbnails: string[];
  totalBytes: number;
  pagesScanned: number;
}

type LoadStage = "idle" | "loading-engine" | "extracting" | "done";

export function ExtractImagesTool() {
  const tracker = useTrackToolView("extract-images", "Convert");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<LoadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [progress, setProgress] = useState<{
    page: number;
    totalPages: number;
    foundCount: number;
  }>({ page: 0, totalPages: 0, foundCount: 0 });

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
    setStage("loading-engine");
    setProgress({ page: 0, totalPages: 0, foundCount: 0 });
    const t0 = performance.now();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { extractImages } = await import("@/lib/pdf/ops/extract-images");
      setStage("extracting");
      const images = await extractImages(bytes, {
        onProgress: (page, totalPages, foundCount) =>
          setProgress({ page, totalPages, foundCount }),
      });
      const thumbnails = images.map((img) =>
        URL.createObjectURL(new Blob([img.bytes as BlobPart], { type: "image/png" })),
      );
      const totalBytes = images.reduce((sum, i) => sum + i.bytes.length, 0);
      setResult({
        fileName: file.name,
        fileSize: file.size,
        images,
        thumbnails,
        totalBytes,
        pagesScanned: progress.totalPages || 0,
      });
      setStage("done");
      tracker.success({
        creditCost: 0,
        pageCount: images.length,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error("extract-images failed", err);
      const msg =
        err instanceof Error ? err.message : "Could not read the PDF. Is it valid?";
      setError(msg);
      setStage("idle");
      tracker.error({
        errorCode:
          err instanceof Error && /pdfium|wasm/i.test(err.message)
            ? "engine_load"
            : "extract_failed",
      });
    }
  };

  const reset = () => {
    result?.thumbnails.forEach((u) => URL.revokeObjectURL(u));
    setFile(null);
    setError(null);
    setResult(null);
    setStage("idle");
    setProgress({ page: 0, totalPages: 0, foundCount: 0 });
  };

  const downloadImage = (img: ExtractedImage) => {
    if (!result) return;
    const blob = new Blob([img.bytes as BlobPart], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      const base = result.fileName.replace(/\.pdf$/i, "");
      a.download = `${base}-page${img.pageNumber}-img${img.indexOnPage}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const downloadAllZip = async () => {
    if (!result) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const base = result.fileName.replace(/\.pdf$/i, "");
    for (const img of result.images) {
      zip.file(
        `${base}-page${img.pageNumber}-img${img.indexOnPage}.png`,
        img.bytes,
      );
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}-images.zip`;
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

  const busy = stage === "loading-engine" || stage === "extracting";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to extract images"
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
                : progress.totalPages > 0
                  ? `Scanning page ${progress.page} of ${progress.totalPages} · found ${progress.foundCount} image${progress.foundCount === 1 ? "" : "s"}`
                  : "Scanning…"}
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
          aria-label={`Extracted ${result.images.length} images`}
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
                <strong>{result.images.length}</strong>{" "}
                image{result.images.length === 1 ? "" : "s"} extracted
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                {humanSize(result.totalBytes)} total · all PNG · original resolution
              </div>
            </div>
            {result.images.length > 1 ? (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={downloadAllZip}
                aria-label="Download all images as a ZIP archive"
              >
                <I.Download size={12} /> Download all (.zip)
              </button>
            ) : result.images.length === 1 ? (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => downloadImage(result.images[0])}
                aria-label="Download .png"
              >
                <I.Download size={12} /> Download .png
              </button>
            ) : null}
          </div>

          {result.images.length === 0 ? (
            <div
              style={{
                padding: "32px 24px",
                textAlign: "center",
                fontSize: 13,
              }}
              className="muted"
            >
              No embedded raster images found. This PDF is text-only or uses
              vector graphics throughout.{" "}
              <Link
                href="/tool/pdf-to-png"
                style={{
                  color: "var(--accent)",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                  textUnderlineOffset: 3,
                }}
              >
                PDF to PNG
              </Link>{" "}
              renders each page as an image instead.
            </div>
          ) : (
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
              {result.images.map((img, i) => (
                <figure
                  key={`${img.pageNumber}-${img.indexOnPage}`}
                  style={{ margin: 0, display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.thumbnails[i]}
                    alt={`Page ${img.pageNumber} image ${img.indexOnPage}`}
                    style={{
                      width: "100%",
                      height: "auto",
                      aspectRatio: `${img.width} / ${img.height}`,
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
                      P{img.pageNumber} · {img.width}×{img.height}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => downloadImage(img)}
                      aria-label={`Download image ${img.indexOnPage} from page ${img.pageNumber}`}
                      style={{ padding: "2px 6px", fontSize: 11 }}
                    >
                      <I.Download size={11} />
                    </button>
                  </div>
                </figure>
              ))}
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
              {busy ? "Extracting…" : "Extract images"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
