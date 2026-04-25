"use client";

import { useEffect, useState } from "react";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  downloadBytes,
  humanSize,
  sha256HexOfBytes,
  deriveOutputName,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";
import { useTrackToolView } from "./useToolTracking";

type Mode = "numbers" | "watermark";
type Position =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";
type Format = "1" | "1 / N" | "Page 1" | "Page 1 of N";

const PAGE_NUMBER_FORMATS: Format[] = ["1", "1 / N", "Page 1", "Page 1 of N"];
const POSITIONS: Array<{ id: Position; label: string }> = [
  { id: "top-left", label: "Top L" },
  { id: "top-center", label: "Top C" },
  { id: "top-right", label: "Top R" },
  { id: "bottom-left", label: "Bot L" },
  { id: "bottom-center", label: "Bot C" },
  { id: "bottom-right", label: "Bot R" },
];

export function PageNumbersTool() {
  useTrackToolView("page-numbers", "Edit");
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("numbers");
  const [format, setFormat] = useState<Format>("Page 1 of N");
  const [position, setPosition] = useState<Position>("bottom-center");
  const [watermarkText, setWatermarkText] = useState("DRAFT");
  const [opacity, setOpacity] = useState(0.25);
  const [fontSize, setFontSize] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
    pages: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPageCount(null);
    setResult(null);
    setError(null);
    if (!file) return;
    (async () => {
      try {
        const doc = await PDFDocument.load(await file.arrayBuffer(), {
          ignoreEncryption: true,
        });
        if (cancelled) return;
        setPageCount(doc.getPageCount());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not read the PDF.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const reset = () => {
    setFile(null);
    setPageCount(null);
    setError(null);
    setResult(null);
    setMode("numbers");
    setFormat("Page 1 of N");
    setPosition("bottom-center");
    setWatermarkText("DRAFT");
    setOpacity(0.25);
    setFontSize(12);
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const doc = await PDFDocument.load(await file.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const pages = doc.getPages();
      const total = pages.length;
      if (total === 0) throw new Error("PDF has no pages.");

      if (mode === "numbers") {
        const font = await doc.embedFont(StandardFonts.Helvetica);
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i]!;
          const text = renderPageNumberText(format, i + 1, total);
          drawLabel({ page, font, text, size: fontSize, position, opacity: 1 });
        }
      } else {
        if (!watermarkText.trim()) throw new Error("Enter watermark text.");
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        for (const page of pages) {
          drawWatermark({ page, font, text: watermarkText.trim(), opacity });
        }
      }

      const bytes = await doc.save({ useObjectStreams: true });
      const suffix = mode === "numbers" ? "-page-numbers" : "-watermarked";
      const name = deriveOutputName(file.name, suffix);
      setResult({ bytes, name, size: bytes.length, pages: total });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "page-numbers",
          name,
          mime: "application/pdf",
          sizeBytes: bytes.length,
          sha256,
        });
      } catch (logErr) {
        console.warn("logToolResult failed (non-fatal):", logErr);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone onFiles={(files) => setFile(files[0] ?? null)} />
      ) : (
        <>
          <div
            className="card"
            style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}
          >
            <span style={{ color: "var(--fg-subtle)" }}>
              <I.File size={16} />
            </span>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div
                title={file.name}
                style={{
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {file.name}
              </div>
              <div className="subtle" style={{ fontSize: 12 }}>
                {humanSize(file.size)}
                {pageCount != null && ` · ${pageCount} pages`}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              aria-label="Remove"
              disabled={busy}
              onClick={reset}
              style={{ padding: 6, color: "var(--fg-subtle)" }}
            >
              <I.X size={14} />
            </button>
          </div>

          <div>
            <label
              className="subtle"
              style={{ fontSize: 12, display: "block", marginBottom: 6 }}
            >
              Mode
            </label>
            <div className="row" style={{ gap: 8 }}>
              <ModeButton
                active={mode === "numbers"}
                disabled={busy}
                onClick={() => setMode("numbers")}
                label="Page numbers"
              />
              <ModeButton
                active={mode === "watermark"}
                disabled={busy}
                onClick={() => setMode("watermark")}
                label="Watermark"
              />
            </div>
          </div>

          {mode === "numbers" ? (
            <>
              <div>
                <label
                  className="subtle"
                  style={{ fontSize: 12, display: "block", marginBottom: 6 }}
                >
                  Format
                </label>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {PAGE_NUMBER_FORMATS.map((f) => (
                    <ChipButton
                      key={f}
                      active={format === f}
                      disabled={busy}
                      onClick={() => setFormat(f)}
                      label={f}
                    />
                  ))}
                </div>
              </div>

              <PositionPicker
                position={position}
                disabled={busy}
                onChange={setPosition}
              />

              <SliderRow
                label={`Font size: ${fontSize}pt`}
                min={8}
                max={24}
                step={1}
                value={fontSize}
                disabled={busy}
                onChange={setFontSize}
              />
            </>
          ) : (
            <>
              <div>
                <label
                  className="subtle"
                  style={{ fontSize: 12, display: "block", marginBottom: 6 }}
                >
                  Watermark text
                </label>
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  maxLength={40}
                  disabled={busy}
                  placeholder="DRAFT"
                  spellCheck={false}
                  className="input"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 14,
                    background: "var(--bg-1)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    color: "var(--fg)",
                  }}
                />
              </div>
              <SliderRow
                label={`Opacity: ${Math.round(opacity * 100)}%`}
                min={0.05}
                max={0.6}
                step={0.05}
                value={opacity}
                disabled={busy}
                onChange={setOpacity}
              />
              <p className="subtle" style={{ fontSize: 12 }}>
                Watermark is drawn diagonally across the center of every page.
              </p>
            </>
          )}
        </>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red, #ef4444)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {result && (
        <div
          className="card"
          style={{
            padding: 20,
            borderColor: "var(--accent)",
            background: "var(--accent-soft)",
          }}
        >
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--accent)",
                color: "var(--bg-1)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 2 }}>
                {mode === "numbers" ? "Page numbers added" : "Watermark applied"}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {result.pages} pages · {humanSize(result.size)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => downloadBytes(result.bytes, result.name)}
            >
              <I.Download size={14} />
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {file && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>
            Reset
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !file || !pageCount}
          onClick={run}
        >
          {busy
            ? mode === "numbers"
              ? "Adding numbers…"
              : "Applying watermark…"
            : mode === "numbers"
              ? "Add page numbers"
              : "Apply watermark"}
        </button>
      </div>
    </div>
  );
}

/* ----- Rendering helpers ----- */

function renderPageNumberText(format: Format, n: number, total: number): string {
  switch (format) {
    case "1":
      return String(n);
    case "1 / N":
      return `${n} / ${total}`;
    case "Page 1":
      return `Page ${n}`;
    case "Page 1 of N":
      return `Page ${n} of ${total}`;
  }
}

type PageLike = ReturnType<PDFDocument["getPages"]>[number];
type FontLike = Awaited<ReturnType<PDFDocument["embedFont"]>>;

function drawLabel({
  page,
  font,
  text,
  size,
  position,
  opacity,
}: {
  page: PageLike;
  font: FontLike;
  text: string;
  size: number;
  position: Position;
  opacity: number;
}) {
  const { width, height } = page.getSize();
  const margin = 28;
  const textWidth = font.widthOfTextAtSize(text, size);

  let x = margin;
  let y = margin;
  if (position.endsWith("center")) x = (width - textWidth) / 2;
  if (position.endsWith("right")) x = width - textWidth - margin;
  if (position.startsWith("top")) y = height - margin - size;

  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: rgb(0.2, 0.2, 0.2),
    opacity,
  });
}

function drawWatermark({
  page,
  font,
  text,
  opacity,
}: {
  page: PageLike;
  font: FontLike;
  text: string;
  opacity: number;
}) {
  const { width, height } = page.getSize();
  // Scale font to roughly fit the page diagonal.
  const size = Math.min(width, height) * 0.18;
  const textWidth = font.widthOfTextAtSize(text, size);

  page.drawText(text, {
    x: (width - textWidth * Math.cos((45 * Math.PI) / 180)) / 2,
    y: height / 2 - size / 2,
    size,
    font,
    color: rgb(0.45, 0.45, 0.45),
    opacity,
    rotate: degrees(45),
  });
}

/* ----- Small UI helpers ----- */

function ModeButton({
  active,
  onClick,
  disabled,
  label,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 14px",
        fontSize: 13,
        borderRadius: "var(--radius-sm)",
        background: active ? "var(--accent-soft)" : "var(--bg-2)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        color: active ? "var(--accent)" : "var(--fg-muted)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {label}
    </button>
  );
}

function ChipButton({
  active,
  onClick,
  disabled,
  label,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 12px",
        fontSize: 12,
        borderRadius: "var(--radius-sm)",
        background: active ? "var(--accent-soft)" : "var(--bg-2)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        color: active ? "var(--accent)" : "var(--fg-muted)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontFamily: "var(--font-geist-mono, monospace)",
      }}
    >
      {label}
    </button>
  );
}

function PositionPicker({
  position,
  disabled,
  onChange,
}: {
  position: Position;
  disabled: boolean;
  onChange: (p: Position) => void;
}) {
  return (
    <div>
      <label className="subtle" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
        Position
      </label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(60px, 1fr))",
          gap: 8,
          maxWidth: 320,
        }}
      >
        {POSITIONS.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(p.id)}
            style={{
              padding: "8px 0",
              fontSize: 12,
              borderRadius: "var(--radius-sm)",
              background: position === p.id ? "var(--accent-soft)" : "var(--bg-2)",
              border: `1px solid ${position === p.id ? "var(--accent)" : "var(--border)"}`,
              color: position === p.id ? "var(--accent)" : "var(--fg-muted)",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.55 : 1,
              fontFamily: "var(--font-geist-mono, monospace)",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <label
        className="subtle"
        style={{ fontSize: 12, display: "block", marginBottom: 6 }}
      >
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", maxWidth: 320 }}
      />
    </div>
  );
}
