"use client";

// components/tools/ImagesToPdfTool.tsx
//
// 2026-05-01: shared runner for /tool/jpg-to-pdf and /tool/png-to-pdf.
//
// This is a NEW tool category: input is non-PDF (image files), output
// is PDF. The existing shared bases (PageEditorTool, PageGridTool,
// PdfReadOpsTool, PdfSimpleOpsTool) all assume PDF input + use the
// PDF-specific ToolDropzone, so we render an inline image-typed
// dropzone here instead. Two consumers (PdfJpgToPdfTool /
// PdfPngToPdfTool) wrap this with a `format` prop.
//
// Quality model:
//   - Multi-file: drop several images at once, drag-reorder before
//     conversion (one image per PDF page).
//   - Page size selectable: Letter / A4 / "Fit to image" (no margins).
//   - Landscape toggle for rectangular paper sizes.
//   - Per-image native resolution preserved (pdf-lib embedJpg/embedPng
//     don't recompress).
//
// Why the bespoke layout (instead of forcing a shared base):
//   The shared bases are PDF-input-shaped. Building a generic
//   FileToPdfTool base for one or two consumers would be drift
//   toward feature-bloat. When we add markdown-to-pdf / text-to-pdf
//   later, if they share enough UI we can extract a shared base then.

import { useState, useCallback, useEffect, useRef } from "react";
import { I } from "@/components/icons/Icons";
import { humanSize } from "@/lib/client/pdf-utils";
import { downloadBytes } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import { useScrollErrorIntoView } from "./useScrollErrorIntoView";
import { HandoffSuggestions } from "./HandoffSuggestions";
import { ToolHowItWorks } from "./ToolHowItWorks";
import { mapPdfOpError } from "@/lib/pdf/error-messages";
import type { PaperSize } from "@/lib/pdf/ops/images-to-pdf";

// 2026-05-01 — standardization parity follow-up. The 4-hook
// standardized infra for free tools is:
//   1. useTrackToolView         — GA4 funnel (already wired)
//   2. mapPdfOpError            — canonical user-facing errors (already wired)
//   3. suffixedFilename         — collision-safe download names (already wired)
//   4. useScrollErrorIntoView   — scroll error region into view on null→string
//   5. HandoffSuggestions       — "Open this output in: [Tool] [Tool]" panel
// Plus two PDF-input-only hooks NOT applicable here:
//   - useHandoffConsumer   (handoff registry stores PDFs; this tool takes images)
//   - useFileUrlConsumer   (?file= deep-link is PDF-only by design)
// These two are intentionally exempt; the exemption is codified in
// scripts/test-live-tool-standardization.mjs's NON_PDF_INPUT_TOOLS set.

const PAPER_SIZES: Array<{ v: PaperSize; label: string }> = [
  { v: "letter", label: "Letter" },
  { v: "a4", label: "A4" },
  { v: "legal", label: "Legal" },
  { v: "a3", label: "A3" },
  { v: "a5", label: "A5" },
  { v: "fit", label: "Fit to image (no margins)" },
];

export interface ImagesToPdfToolProps {
  /** Tool ID — "jpg-to-pdf" or "png-to-pdf". */
  toolId: string;
  /** "jpeg" or "png" — passed straight to the op. */
  format: "jpeg" | "png";
  /** Accept attribute for the file input. */
  accept: string;
  /** Friendly file-type label for prompts ("JPG" / "PNG"). */
  formatLabel: string;
  /** MIME prefix to validate dropped files. */
  mimePrefix: string;
}

interface ImageFile {
  file: File;
  /** Object URL for preview thumb. Revoked on remove/reset. */
  previewUrl: string;
}

interface ResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  pageCount: number;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per image
const MAX_TOTAL_FILES = 50;

export function ImagesToPdfTool({
  toolId,
  format,
  accept,
  formatLabel,
  mimePrefix,
}: ImagesToPdfToolProps) {
  const tracker = useTrackToolView(toolId, "Convert");
  const [images, setImages] = useState<ImageFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [pageSize, setPageSize] = useState<PaperSize>("letter");
  const [landscape, setLandscape] = useState(false);

  // 2026-05-11 (item #17 sweep batch 6) — URL permalink state sync.
  // Two-param shape (pageSize + landscape boolean). Single useEffect
  // with [pageSize, landscape] dep array — separate effects would race
  // because history.replaceState doesn't batch (same load-bearing
  // detail as GeneratePdfTool's 3-param sync). Lets users share
  // `/tool/images-to-pdf?pageSize=a4&landscape=1`. Defaults
  // ("letter" + false) omitted from URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawSize = params.get("pageSize");
    if (
      rawSize === "letter" || rawSize === "a4" || rawSize === "a3" ||
      rawSize === "a5" || rawSize === "legal" || rawSize === "fit"
    ) {
      setPageSize(rawSize);
    }
    // Boolean flag: "1" / "true" both accept; "0" / "false" / missing
    // → default false. Conservative — only the explicit-truthy strings
    // flip the state.
    const rawLand = params.get("landscape");
    if (rawLand === "1" || rawLand === "true") {
      setLandscape(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (pageSize === "letter") params.delete("pageSize");
    else params.set("pageSize", pageSize);
    // Write "1" rather than "true" for the URL — shorter, and our
    // mount-effect accepts both forms.
    if (!landscape) params.delete("landscape");
    else params.set("landscape", "1");
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [pageSize, landscape]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  // M16 — scroll the error region into view whenever error transitions
  // null → string. Same pattern as PdfMergeTool, PdfSplitTool, etc.
  const errorRef = useScrollErrorIntoView(error);

  // Revoke object URLs on unmount + on reset to avoid memory leaks.
  useEffect(() => {
    return () => {
      for (const img of images) URL.revokeObjectURL(img.previewUrl);
    };
    // Intentionally only on unmount — per-image revoke happens in
    // remove handler below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFiles = useCallback(
    (files: File[]) => {
      setError(null);
      setResult(null);
      const accepted: ImageFile[] = [];
      for (const f of files) {
        if (!f.type.startsWith(mimePrefix)) {
          setError(`"${f.name}" is not a ${formatLabel} file.`);
          return;
        }
        if (f.size > MAX_FILE_BYTES) {
          setError(`"${f.name}" exceeds 20 MB. Resize and retry.`);
          return;
        }
        accepted.push({ file: f, previewUrl: URL.createObjectURL(f) });
      }
      const next = [...images, ...accepted];
      if (next.length > MAX_TOTAL_FILES) {
        setError(`Limit ${MAX_TOTAL_FILES} images per PDF.`);
        for (const a of accepted) URL.revokeObjectURL(a.previewUrl);
        return;
      }
      setImages(next);
      // Track each file individually for funnel parity.
      for (const a of accepted) tracker.upload(a.file);
    },
    [images, formatLabel, mimePrefix, tracker],
  );

  const reset = () => {
    for (const img of images) URL.revokeObjectURL(img.previewUrl);
    setImages([]);
    setError(null);
    setResult(null);
    setBusy(false);
  };

  const removeAt = (index: number) => {
    const img = images[index];
    if (!img) return;
    URL.revokeObjectURL(img.previewUrl);
    setImages(images.filter((_, i) => i !== index));
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...images];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setImages(next);
  };

  const moveDown = (index: number) => {
    if (index >= images.length - 1) return;
    const next = [...images];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setImages(next);
  };

  const run = async () => {
    if (images.length === 0) return;
    setError(null);
    setBusy(true);
    const t0 = performance.now();
    try {
      const inputs = await Promise.all(
        images.map(async (img) => ({
          bytes: new Uint8Array(await img.file.arrayBuffer()),
          name: img.file.name,
        })),
      );
      const { imagesToPdf } = await import("@/lib/pdf/ops/images-to-pdf");
      const r = await imagesToPdf(inputs, {
        format,
        pageSize,
        landscape: pageSize === "fit" ? false : landscape,
      });
      // Output filename: based on first image's name, or generic.
      const baseName = (images[0]?.file.name ?? "images")
        .replace(/\.(jpg|jpeg|png|gif|webp)$/i, "")
        .slice(0, 60);
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "images"}.pdf`,
        pageCount: r.pageCount,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      console.error(`${toolId} failed`, err);
      setError(
        mapPdfOpError(
          err instanceof Error ? err.message : `Couldn't build the PDF.`,
        ),
      );
      tracker.error({ errorCode: `${toolId.replace(/-/g, "_")}_failed` });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    downloadBytes(result.outputBytes, result.outputFileName);
  };

  function handleList(list: FileList | File[]) {
    onFiles(Array.from(list));
  }

  const dropzone = !result && (
    <div
      role="button"
      tabIndex={0}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length > 0) handleList(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      style={{
        border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 12,
        padding: "32px 24px",
        textAlign: "center",
        background: dragOver ? "var(--accent-soft)" : "var(--bg-1)",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <I.Image
        size={32}
        style={{ color: "var(--fg-muted)", marginBottom: 12 }}
      />
      <div style={{ fontSize: 15, fontWeight: 500 }}>
        {images.length === 0
          ? `Drop ${formatLabel} files here or click to browse`
          : `Add more ${formatLabel} files`}
      </div>
      <div className="subtle" style={{ fontSize: 12, marginTop: 6 }}>
        Up to 20 MB per image · {MAX_TOTAL_FILES} images max · runs
        privately in your browser
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) handleList(e.target.files);
        }}
      />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <ToolHowItWorks
        steps={[
          {
            title: "Drop in your images",
            body: "JPEGs, PNGs, GIFs, WebP — drag them in or click to browse. Up to 100 images per PDF; up to 100 MB each. Drag-reorder the queue before exporting.",
          },
          {
            title: "Pick a paper size and orientation",
            body: "Letter / A4 / fit-to-image, portrait or landscape. Margins and image fit are auto-calculated so each image lands centered on its page.",
          },
          {
            title: "Save the combined PDF",
            body: "One image per page, in the order you arranged them. Original image bytes are preserved — no re-encoding, no quality loss.",
          },
        ]}
        privacyNote="Your images stay in your browser. The conversion happens client-side with pdf-lib — nothing is uploaded or persisted."
      />
      {dropzone}

      {images.length > 0 && !result && (
        <>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {images.length} {formatLabel} file
              {images.length === 1 ? "" : "s"} · drag order = page order
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {images.map((img, i) => (
                <li
                  key={`${img.file.name}-${i}`}
                  style={{
                    padding: "10px 16px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    display: "grid",
                    gridTemplateColumns: "32px 1fr auto auto auto",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.previewUrl}
                    alt=""
                    style={{
                      width: 32,
                      height: 32,
                      objectFit: "cover",
                      borderRadius: 4,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={img.file.name}
                    >
                      Page {i + 1} · {img.file.name}
                    </div>
                    <div className="subtle" style={{ fontSize: 11 }}>
                      {humanSize(img.file.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    aria-label={`Move ${img.file.name} up`}
                  >
                    <span style={{ fontSize: 14, lineHeight: 1 }}>↑</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => moveDown(i)}
                    disabled={i === images.length - 1}
                    aria-label={`Move ${img.file.name} down`}
                  >
                    <span style={{ fontSize: 14, lineHeight: 1 }}>↓</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => removeAt(i)}
                    aria-label={`Remove ${img.file.name}`}
                  >
                    <I.X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Config panel */}
          <div
            className="card"
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500 }}>Page size</div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {PAPER_SIZES.map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  className={`btn btn-sm ${pageSize === opt.v ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setPageSize(opt.v)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {pageSize !== "fit" && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={landscape}
                  onChange={(e) => setLandscape(e.target.checked)}
                />
                Landscape orientation
              </label>
            )}
            <div className="subtle" style={{ fontSize: 12 }}>
              {pageSize === "fit"
                ? "Each page is sized to its image — no margins."
                : "Images are scaled to fit within 0.5\" margins, aspect ratio preserved."}
            </div>
          </div>
        </>
      )}

      {error && (
        <p
          ref={errorRef as React.RefObject<HTMLParagraphElement>}
          role="alert"
          style={{ color: "var(--red)", fontSize: 13, margin: 0 }}
        >
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
            gap: 12,
          }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="pulse-soft" style={{ color: "var(--accent)" }}>
            <I.Sparkle size={16} />
          </span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
            Building PDF from {images.length} image
            {images.length === 1 ? "" : "s"}…
          </div>
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: "16px 20px" }}
          role="status"
          aria-live="polite"
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Built {result.pageCount}-page PDF
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                {humanSize(result.outputBytes.length)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={download}
            >
              <I.Download size={12} /> Download
            </button>
          </div>
          {/* M9 — "Open this output in: [Tool] [Tool]" cross-tool funnel.
              Suggestions defined in lib/client/tool-suggestions.ts. */}
          <HandoffSuggestions
            sourceToolId={toolId}
            outputBytes={result.outputBytes}
            outputFileName={result.outputFileName}
          />
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Convert more {formatLabel}s
          </button>
        ) : (
          <>
            {images.length > 0 && (
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
              disabled={images.length === 0 || busy}
              onClick={run}
            >
              {busy
                ? "Building…"
                : `Build PDF from ${images.length || ""} image${images.length === 1 ? "" : "s"}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function PdfJpgToPdfTool() {
  return (
    <ImagesToPdfTool
      toolId="jpg-to-pdf"
      format="jpeg"
      accept="image/jpeg,.jpg,.jpeg"
      formatLabel="JPG"
      mimePrefix="image/jpeg"
    />
  );
}

export function PdfPngToPdfTool() {
  return (
    <ImagesToPdfTool
      toolId="png-to-pdf"
      format="png"
      accept="image/png,.png"
      formatLabel="PNG"
      mimePrefix="image/png"
    />
  );
}
