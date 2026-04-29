"use client";

// components/tools/PdfPageNumbersTool.tsx
// Tier 3 (2026-04-28): add page numbers. Position + format pickers
// before apply. pdf-lib's drawText handles the overlay.
//
// 2026-04-28 (#189): live page-1 preview shows the formatted page
// number at the configured position + font size, so users can
// confirm placement before committing. Re-renders only when file
// bytes change; config tweaks update the overlay instantly.

import { useEffect, useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { suffixedFilename } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import { useFirstPagePreview } from "./useFirstPagePreview";
import type { Position, NumberFormat } from "@/lib/pdf/ops/page-numbers";

interface ResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  numberedCount: number;
  pageCount: number;
}

export function PdfPageNumbersTool() {
  const tracker = useTrackToolView("page-numbers", "Edit");
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [position, setPosition] = useState<Position>("bottom-center");
  const [format, setFormat] = useState<NumberFormat>("1 of N");
  const [fontSize, setFontSize] = useState<number>(11);

  const preview = useFirstPagePreview(pdfBytes);

  const onFiles = useCallback(
    async (files: File[]) => {
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
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        setPdfBytes(bytes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not read file.");
      }
    },
    [tracker],
  );

  const reset = useCallback(() => {
    setFile(null);
    setPdfBytes(null);
    setError(null);
    setResult(null);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (preview.error) setError(preview.error);
  }, [preview.error]);

  const run = async () => {
    if (!file || !pdfBytes) return;
    setError(null);
    setBusy(true);
    const t0 = performance.now();
    try {
      const { addPageNumbers } = await import("@/lib/pdf/ops/page-numbers");
      const r = await addPageNumbers(pdfBytes, {
        position,
        format,
        fontSize,
      });
      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "document"}-numbered.pdf`,
        numberedCount: r.numberedCount,
        pageCount: r.pageCount,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.numberedCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not add page numbers.";
      setError(msg);
      tracker.error({ errorCode: "page_numbers_failed" });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([result.outputBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = suffixedFilename(result.outputFileName);
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const truncate = (s: string, max = 38) =>
    s.length <= max ? s : `${s.slice(0, max - 1)}…`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to add page numbers"
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
                {preview.preview && ` · ${preview.preview.pageCount} page${preview.preview.pageCount === 1 ? "" : "s"}`}
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

      {file && !result && (
        <div
          className="card"
          style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
        >
          <PageNumberPreview
            preview={preview.preview}
            rendering={preview.rendering}
            position={position}
            format={format}
            fontSizePt={fontSize}
          />

          <div style={{ fontSize: 13, fontWeight: 500 }}>Position</div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {(
              [
                { v: "bottom-center", label: "Bottom center" },
                { v: "bottom-right", label: "Bottom right" },
                { v: "bottom-left", label: "Bottom left" },
                { v: "top-center", label: "Top center" },
                { v: "top-right", label: "Top right" },
                { v: "top-left", label: "Top left" },
              ] as Array<{ v: Position; label: string }>
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                className={`btn btn-sm ${position === opt.v ? "btn-primary" : "btn-outline"}`}
                onClick={() => setPosition(opt.v)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>
            Format
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {(
              [
                { v: "1", label: "1, 2, 3" },
                { v: "1 of N", label: "1 of N" },
                { v: "Page 1", label: "Page 1" },
                { v: "Page 1 of N", label: "Page 1 of N" },
              ] as Array<{ v: NumberFormat; label: string }>
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                className={`btn btn-sm ${format === opt.v ? "btn-primary" : "btn-outline"}`}
                onClick={() => setFormat(opt.v)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <label
            style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}
          >
            <span>Font size</span>
            <input
              type="number"
              min={6}
              max={48}
              value={fontSize}
              onChange={(e) =>
                setFontSize(Math.max(6, Math.min(48, Number(e.target.value) || 11)))
              }
              style={{
                width: 80,
                padding: "6px 10px",
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: "var(--bg-1)",
                color: "var(--fg)",
              }}
            />
            <span className="subtle" style={{ fontSize: 11 }}>
              points (default 11)
            </span>
          </label>
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
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
            Adding page numbers…
          </div>
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: "16px 20px" }}
          role="status"
          aria-live="polite"
          aria-label={`Numbered ${result.numberedCount} pages`}
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
                Numbered {result.numberedCount} of {result.pageCount} page
                {result.pageCount === 1 ? "" : "s"}
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                Output: {humanSize(result.outputBytes.length)}
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
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            Number another PDF
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
              {busy ? "Adding…" : "Add page numbers"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface PageNumberPreviewProps {
  preview: ReturnType<typeof useFirstPagePreview>["preview"];
  rendering: boolean;
  position: Position;
  format: NumberFormat;
  fontSizePt: number;
}

/**
 * Page-1 preview with the formatted page number CSS-positioned at
 * the configured corner. Format math mirrors lib/pdf/ops/page-numbers.ts.
 */
function PageNumberPreview({
  preview,
  rendering,
  position,
  format,
  fontSizePt,
}: PageNumberPreviewProps) {
  if (rendering && !preview) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "8.5 / 11",
          background: "var(--bg-2)",
          borderRadius: 8,
          border: "1px solid var(--border)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <span className="subtle" style={{ fontSize: 12 }}>
          Rendering preview…
        </span>
      </div>
    );
  }
  if (!preview) return null;

  // Op uses startNumber=1 by default; preview the page-1 case.
  const sampleText = formatNumber(format, 1, preview.pageCount);
  const fontPctOfHeight = (fontSizePt / preview.ptHeight) * 100;
  const marginPct = (28 / preview.ptHeight) * 100; // op default margin = 28 pt

  const overlayStyle: React.CSSProperties = {
    position: "absolute",
    fontWeight: 400,
    fontSize: `${fontPctOfHeight}cqh`,
    lineHeight: 1,
    color: "#000",
    pointerEvents: "none",
    fontFamily:
      "Helvetica, 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif",
    whiteSpace: "nowrap",
    userSelect: "none",
  };

  let positioned: React.CSSProperties = {};
  const isBottom = position.startsWith("bottom-");
  // Op math: y = isBottom ? margin : height - margin - fontSize.
  // CSS top from page top: bottom case = ptHeight - margin - fontSize.
  // Express both via top/bottom with an aligned baseline.
  if (isBottom) {
    positioned = { bottom: `${marginPct}%` };
  } else {
    positioned = { top: `${marginPct}%` };
  }
  if (position.endsWith("-center")) {
    positioned = {
      ...positioned,
      left: "50%",
      transform: "translateX(-50%)",
    };
  } else if (position.endsWith("-right")) {
    positioned = {
      ...positioned,
      right: `${(28 / preview.ptWidth) * 100}%`,
    };
  } else {
    positioned = {
      ...positioned,
      left: `${(28 / preview.ptWidth) * 100}%`,
    };
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${preview.pxWidth} / ${preview.pxHeight}`,
        background: "var(--bg-2)",
        borderRadius: 8,
        border: "1px solid var(--border)",
        overflow: "hidden",
        containerType: "size",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview.url}
        alt={`Page 1 preview${preview.pageCount > 1 ? ` (1 of ${preview.pageCount})` : ""}`}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />
      <span style={{ ...overlayStyle, ...positioned }}>{sampleText}</span>
      {preview.pageCount > 1 && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            padding: "4px 10px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.6)",
            color: "white",
            fontSize: 11,
            fontWeight: 500,
            pointerEvents: "none",
          }}
        >
          Numbers all {preview.pageCount} pages
        </div>
      )}
    </div>
  );
}

function formatNumber(format: NumberFormat, n: number, total: number): string {
  switch (format) {
    case "1":
      return String(n);
    case "1 of N":
      return `${n} of ${total}`;
    case "Page 1":
      return `Page ${n}`;
    case "Page 1 of N":
      return `Page ${n} of ${total}`;
  }
}
