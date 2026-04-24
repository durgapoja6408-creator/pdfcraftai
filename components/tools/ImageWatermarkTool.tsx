"use client";

// ImageWatermarkTool — Tier 1 §1.5 P0.
//
// Stamp a logo or image watermark onto every page (or a subset) of a
// PDF. Pure client-side pdf-lib: `doc.embedPng()` / `embedJpg()` to
// register the image in the resource dictionary, then
// `page.drawImage(img, { x, y, width, height, opacity })` for each
// target page. No canvas UI — position is chosen via a 3×3 grid.
//
// Why image watermarks separate from PageNumbersTool: the existing
// "Page Numbers & Watermark" tool handles text headers/footers/
// watermarks only. Image watermarks need a separate upload slot, a
// different set of controls (scale + opacity vs font/size/color), and
// different SEO terms ("add logo to pdf" vs "add watermark text").
// Bundling them would bloat PageNumbersTool (already 598 lines) and
// confuse the runner UI.
//
// Layer caveat (surfaced honestly in UI): `drawImage` always draws on
// top of existing content. True "behind the text" watermarking would
// require content-stream surgery (prepending our image op to each
// page's stream), which pdf-lib doesn't expose. The fix is opacity —
// a 20–30% watermark reads as subtle background even when drawn on
// top, which matches what iLovePDF / Smallpdf / Adobe do in practice.
//
// File formats: PNG (including transparency), JPEG. GIF is out —
// pdf-lib doesn't support GIF, and we don't want to pull in a
// GIF-to-PNG shim just for a rare request.

import { useState, useCallback } from "react";
import { PDFDocument } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  deriveOutputName,
  downloadBytes,
  humanSize,
  parsePageRanges,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";

type Position =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

type Loaded = {
  file: File;
  pageCount: number;
  firstWidth: number;
  firstHeight: number;
};

type LoadedImage = {
  file: File;
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  width: number;
  height: number;
  previewDataUrl: string;
};

export function ImageWatermarkTool() {
  const [pdf, setPdf] = useState<Loaded | null>(null);
  const [img, setImg] = useState<LoadedImage | null>(null);

  // Controls. Defaults chosen to produce a "legible but subtle"
  // bottom-right watermark on the first render — users can tune
  // from there without staring at a blank page.
  const [position, setPosition] = useState<Position>("bottom-right");
  const [scalePct, setScalePct] = useState<number>(20); // % of page min-dim
  const [opacityPct, setOpacityPct] = useState<number>(30);
  const [marginPt, setMarginPt] = useState<number>(24);
  const [pagesSpec, setPagesSpec] = useState<string>(""); // "" = all

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
    pagesTouched: number;
  } | null>(null);

  const onPdfFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const doc = await PDFDocument.load(await f.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const pages = doc.getPages();
      const first = pages[0];
      if (!first) throw new Error("PDF has no pages.");
      setPdf({
        file: f,
        pageCount: pages.length,
        firstWidth: first.getWidth(),
        firstHeight: first.getHeight(),
      });
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && /encrypted|password/i.test(err.message)
          ? "This PDF is password-protected. Unlock it first."
          : "Couldn't read that PDF. It may be corrupt."
      );
      setPdf(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const onImageFile = useCallback(async (f: File) => {
    setError(null);
    setResult(null);
    const lower = f.name.toLowerCase();
    let mime: "image/png" | "image/jpeg";
    if (f.type === "image/png" || lower.endsWith(".png")) {
      mime = "image/png";
    } else if (
      f.type === "image/jpeg" ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg")
    ) {
      mime = "image/jpeg";
    } else {
      setError("Image must be PNG or JPEG. GIF is not supported by PDF.");
      return;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());

    // Read the image's natural dimensions so we can surface a preview
    // and keep the aspect ratio correct at draw time. createImageBitmap
    // is the cheapest path here — it doesn't rely on HTMLImageElement
    // lifecycle quirks and works in workers too.
    let width = 0;
    let height = 0;
    let previewDataUrl = "";
    try {
      const blob = new Blob([bytes], { type: mime });
      const bitmap = await createImageBitmap(blob);
      width = bitmap.width;
      height = bitmap.height;
      bitmap.close();
      previewDataUrl = await blobToDataUrl(blob);
    } catch (err) {
      console.warn("image probe failed:", err);
      setError("Couldn't read that image. It may be corrupt.");
      return;
    }

    setImg({ file: f, bytes, mime, width, height, previewDataUrl });
  }, []);

  const reset = () => {
    setPdf(null);
    setImg(null);
    setResult(null);
    setError(null);
  };

  const run = async () => {
    if (!pdf || !img) return;

    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const doc = await PDFDocument.load(await pdf.file.arrayBuffer(), {
        ignoreEncryption: true,
      });
      const embedded =
        img.mime === "image/png"
          ? await doc.embedPng(img.bytes)
          : await doc.embedJpg(img.bytes);

      // Figure out which pages to touch.
      const totalPages = doc.getPageCount();
      let targetIndices: Set<number>;
      if (pagesSpec.trim().length === 0) {
        targetIndices = new Set(
          Array.from({ length: totalPages }, (_, i) => i + 1)
        );
      } else {
        try {
          const groups = parsePageRanges(pagesSpec.trim(), totalPages);
          targetIndices = new Set(groups.flat());
        } catch {
          throw new Error(
            `Invalid page spec. Use commas and dashes — e.g. "1, 3-5, 9".`
          );
        }
        if (targetIndices.size === 0) {
          throw new Error("Page spec matched no pages.");
        }
      }

      const opacity = Math.max(0, Math.min(1, opacityPct / 100));
      const scale = Math.max(0.01, Math.min(1, scalePct / 100));

      let pagesTouched = 0;
      for (let i = 0; i < totalPages; i++) {
        if (!targetIndices.has(i + 1)) continue;
        const page = doc.getPage(i);
        const pw = page.getWidth();
        const ph = page.getHeight();
        // Fit image to `scale * min(pw, ph)` on its longer side so the
        // watermark's visual weight stays consistent across portrait
        // and landscape pages. Aspect ratio preserved.
        const minDim = Math.min(pw, ph);
        const targetMax = minDim * scale;
        const aspect = img.width / img.height;
        let iw: number;
        let ih: number;
        if (aspect >= 1) {
          iw = targetMax;
          ih = targetMax / aspect;
        } else {
          ih = targetMax;
          iw = targetMax * aspect;
        }
        const { x, y } = placementXY(position, pw, ph, iw, ih, marginPt);
        page.drawImage(embedded, { x, y, width: iw, height: ih, opacity });
        pagesTouched += 1;
      }

      const bytes = await doc.save({ useObjectStreams: true });
      const name = deriveOutputName(pdf.file.name, "-watermarked");
      setResult({ bytes, name, size: bytes.length, pagesTouched });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "image-watermark",
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
      setError(err instanceof Error ? err.message : "Watermark failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!pdf ? (
        <ToolDropzone
          onFiles={onPdfFiles}
          disabled={busy}
          prompt="Drop a PDF to watermark"
        />
      ) : (
        <div
          className="card"
          style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}
        >
          <span style={{ color: "var(--fg-subtle)" }}>
            <I.File size={18} />
          </span>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div
              title={pdf.file.name}
              style={{
                fontSize: 14,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {pdf.file.name}
            </div>
            <div className="subtle" style={{ fontSize: 12 }}>
              {humanSize(pdf.file.size)} · {pdf.pageCount} page
              {pdf.pageCount === 1 ? "" : "s"} ·{" "}
              {Math.round(pdf.firstWidth)} × {Math.round(pdf.firstHeight)} pt
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={busy}
            onClick={reset}
            aria-label="Remove file"
          >
            <I.X size={14} />
          </button>
        </div>
      )}

      {pdf && (
        <div
          className="card"
          style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div>
            <div
              style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)", marginBottom: 6 }}
            >
              WATERMARK IMAGE (PNG or JPEG)
            </div>
            {img ? (
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  padding: 12,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--bg-1)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewDataUrl}
                  alt="Watermark preview"
                  style={{
                    width: 56,
                    height: 56,
                    objectFit: "contain",
                    background: "var(--bg-2)",
                    borderRadius: 4,
                  }}
                />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div
                    title={img.file.name}
                    style={{
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {img.file.name}
                  </div>
                  <div className="subtle" style={{ fontSize: 11 }}>
                    {img.width} × {img.height} px · {humanSize(img.file.size)} ·{" "}
                    {img.mime === "image/png" ? "PNG" : "JPEG"}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={busy}
                  onClick={() => setImg(null)}
                  aria-label="Remove image"
                >
                  <I.X size={14} />
                </button>
              </div>
            ) : (
              <label
                style={{
                  display: "block",
                  padding: 16,
                  border: "1px dashed var(--border-strong)",
                  borderRadius: "var(--radius)",
                  textAlign: "center",
                  fontSize: 13,
                  color: "var(--fg-subtle)",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Choose a PNG or JPEG…
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImageFile(f);
                  }}
                  style={{ display: "none" }}
                />
              </label>
            )}
          </div>

          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend
              style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)", marginBottom: 8 }}
            >
              POSITION
            </legend>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 4,
                maxWidth: 280,
              }}
            >
              {(
                [
                  "top-left",
                  "top-center",
                  "top-right",
                  "middle-left",
                  "middle-center",
                  "middle-right",
                  "bottom-left",
                  "bottom-center",
                  "bottom-right",
                ] as Position[]
              ).map((p) => {
                const selected = position === p;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={busy}
                    onClick={() => setPosition(p)}
                    aria-pressed={selected}
                    style={{
                      padding: "18px 10px",
                      border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                      background: selected ? "var(--accent-soft)" : "var(--bg-1)",
                      color: selected ? "var(--accent)" : "var(--fg-subtle)",
                      borderRadius: "var(--radius)",
                      cursor: busy ? "not-allowed" : "pointer",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                    }}
                  >
                    {p.replace("-", " ")}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <SliderRow
            label="SCALE"
            min={5}
            max={100}
            step={1}
            value={scalePct}
            onChange={setScalePct}
            suffix="% of page"
            disabled={busy}
          />
          <SliderRow
            label="OPACITY"
            min={10}
            max={100}
            step={5}
            value={opacityPct}
            onChange={setOpacityPct}
            suffix="%"
            disabled={busy}
          />
          <SliderRow
            label="MARGIN"
            min={0}
            max={96}
            step={4}
            value={marginPt}
            onChange={setMarginPt}
            suffix=" pt"
            disabled={busy}
          />

          <div>
            <label
              htmlFor="pages-spec"
              style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)", display: "block", marginBottom: 6 }}
            >
              PAGES (blank = all)
            </label>
            <input
              id="pages-spec"
              type="text"
              placeholder="e.g. 1, 3-5, 9 — blank means all pages"
              value={pagesSpec}
              disabled={busy}
              onChange={(e) => setPagesSpec(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border-strong)",
                background: "var(--bg-1)",
                color: "var(--fg)",
                fontSize: 14,
                fontFamily: "var(--font-mono), ui-monospace, monospace",
              }}
            />
          </div>

          <div className="subtle" style={{ fontSize: 12 }}>
            Image is drawn <strong style={{ color: "var(--fg)" }}>on top</strong> of existing page
            content with the chosen opacity. Subtle (20–30%) reads as a background stamp; 100% sits
            opaque.
          </div>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
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
                Watermark applied
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {result.pagesTouched} page{result.pagesTouched === 1 ? "" : "s"} ·{" "}
                {humanSize(result.size)}
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
        {pdf && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={reset}
          >
            Reset
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!pdf || !img || busy}
          onClick={run}
        >
          {busy ? "Applying…" : "Apply watermark"}
        </button>
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
  onChange,
  suffix,
  disabled,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  disabled: boolean;
}) {
  return (
    <div>
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 4 }}
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)" }}>
          {label}
        </span>
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}

function placementXY(
  pos: Position,
  pw: number,
  ph: number,
  iw: number,
  ih: number,
  margin: number
): { x: number; y: number } {
  // pdf-lib origin is bottom-left.
  let x: number;
  let y: number;
  if (pos.endsWith("left")) x = margin;
  else if (pos.endsWith("right")) x = pw - iw - margin;
  else x = (pw - iw) / 2;
  if (pos.startsWith("top")) y = ph - ih - margin;
  else if (pos.startsWith("bottom")) y = margin;
  else y = (ph - ih) / 2;
  return { x, y };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
