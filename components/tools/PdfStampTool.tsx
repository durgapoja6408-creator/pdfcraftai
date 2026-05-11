"use client";

// components/tools/PdfStampTool.tsx
// Tier 5 (2026-04-28): text watermark / stamp on every page.
//
// 2026-04-28 (#189): live WYSIWYG preview of page 1 with the
// watermark text rendered in CSS at the configured position,
// rotation, opacity, color, font size. The preview is positioned
// using the same math as lib/pdf/ops/stamp.ts so what users see is
// what they get. Re-renders only when the FILE bytes change; config
// changes update the overlay instantly without re-rasterizing.

import { useEffect, useMemo, useState, useCallback } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { downloadBytes } from "@/lib/client/download";
import { useTrackToolView } from "./useToolTracking";
import { useFirstPagePreview } from "./useFirstPagePreview";
import type { StampPosition } from "@/lib/pdf/ops/stamp";
import { ToolHowItWorks } from "./ToolHowItWorks";

interface ResultState {
  outputBytes: Uint8Array;
  outputFileName: string;
  pageCount: number;
}

export function PdfStampTool() {
  const tracker = useTrackToolView("stamp-pdf", "Edit");
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [text, setText] = useState("DRAFT");
  const [position, setPosition] = useState<StampPosition>("diagonal");
  const [opacity, setOpacity] = useState(30);
  const [fontSize, setFontSize] = useState<number | "">("");
  const [color, setColor] = useState("#888888");

  // 2026-05-11 (item #17 sweep batch 11) — URL permalink state sync.
  // 3-param shape: position (4 literals) + opacity (0..100 number) +
  // fontSize (number | "" with empty-string sentinel for auto-size).
  // `text` and `color` are NOT synced — `text` is user content not
  // config ("CONFIDENTIAL" doesn't belong in a shared template link);
  // `color` is a hex string with quirks (#888 vs #888888) better
  // synced in a follow-up if needed.
  //
  // fontSize sentinel handling: empty string "" means auto-size based
  // on position. URL omits the param entirely in that case. Bounds
  // 8..400 — stamps span tiny overlay to giant diagonal banner.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawPos = params.get("position");
    if (
      rawPos === "diagonal" || rawPos === "center" ||
      rawPos === "top-center" || rawPos === "bottom-center"
    ) setPosition(rawPos);
    const rawOp = params.get("opacity");
    if (rawOp) {
      const n = parseInt(rawOp, 10);
      if (Number.isFinite(n) && n >= 0 && n <= 100) {
        setOpacity(n);
      }
    }
    const rawSize = params.get("fontSize");
    if (rawSize) {
      const n = parseInt(rawSize, 10);
      // 8..400 — much wider than body-copy tools (TextToPdf 4..72)
      // because stamps render as full-page diagonal banners.
      if (Number.isFinite(n) && n >= 8 && n <= 400) {
        setFontSize(n);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (position === "diagonal") params.delete("position");
    else params.set("position", position);
    if (opacity === 30) params.delete("opacity");
    else params.set("opacity", String(opacity));
    // Empty-string sentinel (auto) and 0 are both omitted —
    // anything else is the user's numeric override.
    if (fontSize === "" || fontSize === 0) params.delete("fontSize");
    else params.set("fontSize", String(fontSize));
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [position, opacity, fontSize]);

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

  // Surface preview errors (rare — usually corrupt or encrypted PDFs).
  useEffect(() => {
    if (preview.error) setError(preview.error);
  }, [preview.error]);

  const run = async () => {
    if (!file || !pdfBytes) return;
    if (!text.trim()) {
      setError("Type the watermark text first.");
      return;
    }
    setError(null);
    setBusy(true);
    const t0 = performance.now();
    try {
      const { stampPdf } = await import("@/lib/pdf/ops/stamp");
      const r = await stampPdf(pdfBytes, {
        text: text.trim(),
        position,
        opacity: opacity / 100,
        fontSize:
          typeof fontSize === "number" && fontSize > 0 ? fontSize : undefined,
        color,
      });
      const baseName = file.name.replace(/\.pdf$/i, "");
      setResult({
        outputBytes: r.bytes,
        outputFileName: `${baseName || "document"}-watermarked.pdf`,
        pageCount: r.pageCount,
      });
      tracker.success({
        creditCost: 0,
        pageCount: r.pageCount,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stamp the PDF.");
      tracker.error({ errorCode: "stamp_failed" });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    downloadBytes(result.outputBytes, result.outputFileName);
  };

  const truncate = (s: string, max = 38) =>
    s.length <= max ? s : `${s.slice(0, max - 1)}…`;

  // Effective font size in PDF points. Mirrors the op's logic.
  const effectiveFontSize = useMemo(() => {
    if (typeof fontSize === "number" && fontSize > 0) return fontSize;
    return position === "diagonal" ? 60 : 36;
  }, [fontSize, position]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Item #8 sweep batch 4 — inline ToolHowItWorks explainer. */}
      <ToolHowItWorks
        steps={[
          {
            title: "Drop a PDF",
            body:
              "Up to 100 MB. The first-page preview renders so you can position and tune the watermark before applying.",
          },
          {
            title: "Pick the watermark",
            body:
              "Type the text (DRAFT, CONFIDENTIAL, your name, etc.), pick a position (diagonal banner / center / top / bottom), and tune opacity and font size. The preview updates live.",
          },
          {
            title: "Apply and download",
            body:
              "pdf-lib renders the text on every page at the chosen anchor and opacity. The watermark sits ON TOP of existing content — for content-aware backgrounds you'd want a different tool.",
          },
        ]}
        privacyNote="Watermarking runs entirely in your browser via pdf-lib — files never leave your machine. We can't see what you watermark."
      />
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt="Drop a PDF to add a watermark"
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
          {/* Live preview */}
          <StampPreview
            preview={preview.preview}
            rendering={preview.rendering}
            text={text}
            position={position}
            opacity={opacity / 100}
            color={color}
            fontSizePt={effectiveFontSize}
          />

          <label
            style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}
          >
            <span>Watermark text</span>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={80}
              placeholder="e.g. DRAFT, CONFIDENTIAL, your company name"
              style={{
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: "var(--bg-1)",
                color: "var(--fg)",
              }}
            />
          </label>

          <div style={{ fontSize: 13, fontWeight: 500 }}>Position</div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {(
              [
                { v: "diagonal", label: "Diagonal" },
                { v: "center", label: "Center" },
                { v: "top-center", label: "Top" },
                { v: "bottom-center", label: "Bottom" },
              ] as Array<{ v: StampPosition; label: string }>
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

          <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
            >
              <span>Opacity</span>
              <input
                type="range"
                min={5}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                style={{ width: 120 }}
              />
              <span
                className="subtle"
                style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", minWidth: 36 }}
              >
                {opacity}%
              </span>
            </label>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
            >
              <span>Color</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{
                  width: 36,
                  height: 28,
                  padding: 0,
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                }}
              />
            </label>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
            >
              <span>Font size</span>
              <input
                type="number"
                min={8}
                max={200}
                value={fontSize}
                onChange={(e) =>
                  setFontSize(e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="auto"
                style={{
                  width: 80,
                  padding: "4px 8px",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  background: "var(--bg-1)",
                  color: "var(--fg)",
                }}
              />
              <span className="subtle" style={{ fontSize: 11 }}>
                pt
              </span>
            </label>
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
          style={{ padding: 16, background: "var(--bg-1)", display: "flex", gap: 12 }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="pulse-soft" style={{ color: "var(--accent)" }}>
            <I.Sparkle size={16} />
          </span>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
            Adding watermark…
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
                Watermarked {result.pageCount} page
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
            Watermark another PDF
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
              disabled={!file || busy || !text.trim()}
              onClick={run}
            >
              {busy ? "Stamping…" : "Add watermark"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface StampPreviewProps {
  preview: ReturnType<typeof useFirstPagePreview>["preview"];
  rendering: boolean;
  text: string;
  position: StampPosition;
  opacity: number; // 0-1
  color: string;
  fontSizePt: number;
}

/**
 * Renders the stamped page-1 preview. The watermark is laid down as
 * CSS-positioned text using fontSizePt-as-CSS-pixels mapped to the
 * preview's pt frame, so the on-screen glyph proportions match the
 * output. The position math mirrors lib/pdf/ops/stamp.ts:
 *   - diagonal: rotated 45° around the page center
 *   - center / top / bottom: as you'd expect
 */
function StampPreview({
  preview,
  rendering,
  text,
  position,
  opacity,
  color,
  fontSizePt,
}: StampPreviewProps) {
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

  // Convert font size from points to a CSS percentage of the page so
  // it scales with the responsive preview width.
  const fontPct = (fontSizePt / preview.ptHeight) * 100;

  // Anchor styling: the wrapper occupies the full preview; we place
  // an absolutely-positioned <span> at the watermark anchor.
  const overlayStyle: React.CSSProperties = {
    position: "absolute",
    fontWeight: 700,
    fontSize: `${fontPct}cqh`, // container-query height %
    lineHeight: 1,
    color,
    opacity,
    pointerEvents: "none",
    fontFamily:
      "Helvetica, 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif",
    whiteSpace: "nowrap",
    userSelect: "none",
  };
  let positioned: React.CSSProperties = {};
  switch (position) {
    case "diagonal":
      positioned = {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%) rotate(-45deg)",
        transformOrigin: "center center",
      };
      break;
    case "center":
      positioned = {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      };
      break;
    case "top-center":
      // Op uses y = ph - 60 - th, i.e. ~60pt + textHeight from top.
      positioned = {
        left: "50%",
        top: `${(60 / preview.ptHeight) * 100}%`,
        transform: "translateX(-50%)",
      };
      break;
    case "bottom-center":
      // Op uses y = 60 (60pt above page bottom). Account for line
      // height so the glyph sits at the same height as the output.
      positioned = {
        left: "50%",
        bottom: `${((60 - fontSizePt * 0.2) / preview.ptHeight) * 100}%`,
        transform: "translateX(-50%)",
      };
      break;
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
      {text.trim() && (
        <span style={{ ...overlayStyle, ...positioned }}>{text}</span>
      )}
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
          Stamps on all {preview.pageCount} pages
        </div>
      )}
    </div>
  );
}
