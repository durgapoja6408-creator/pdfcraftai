"use client";

// components/tools/PdfImageWatermarkTool.tsx
//
// Tier 5 (2026-04-28): image watermark / logo overlay.
//
// v1 (commit 162): config-only — 3x3 position preset grid + opacity
// + scale. Worked but blind: users couldn't see where the logo would
// land until after applying.
//
// v2 (2026-04-28, this ship): ported to PageEditorTool with visual
// click-to-place. Single-page mode (multiPage: false) — the user
// picks one position on the page-1 preview and the watermark stamps
// at that same coordinate on EVERY page (doc-wide semantics
// preserved). The 3x3 preset grid is still available as a fallback
// when no custom click is set, and "Reset to preset" clears the
// click. Live preview ghost shows opacity + scale before apply.
//
// Why single-page over per-page: the canonical watermark use case is
// a logo in the same spot on every page (corporate doc, manuscript,
// etc). Per-page-different positions is rare; if it shows up later,
// the multiPage branch is a small refactor.

import { useEffect, useRef } from "react";
import { I } from "@/components/icons/Icons";
import {
  PageEditorTool,
  type PageEditorEditorProps,
  type PageEditorConfigProps,
  type PageEditorResult,
} from "./PageEditorTool";
import { humanSize } from "@/lib/client/pdf-utils";
import type { ImagePosition } from "@/lib/pdf/ops/image-watermark";

interface PickedImage {
  fileName: string;
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  /** Object URL for preview. */
  previewUrl: string;
  /** Natural pixel dimensions (used to preserve aspect ratio). */
  naturalWidth: number;
  naturalHeight: number;
}

interface WatermarkState {
  image: PickedImage | null;
  /**
   * Custom click position in IMAGE PIXEL coords (top-left origin,
   * relative to rendered page). null = use the `position` preset.
   * The pixel value is converted to PDF points (bottom-left origin)
   * before being handed to imageWatermarkPdf.
   */
  posPx: { x: number; y: number } | null;
  /** Fallback preset when posPx is null. */
  position: ImagePosition;
  /** Image width as a fraction of page width (0.05 – 1.0). */
  scale: number;
  /** 0–1. */
  opacity: number;
}

const INITIAL_STATE: WatermarkState = {
  image: null,
  posPx: null,
  position: "bottom-right",
  scale: 0.25,
  opacity: 0.5,
};

const POSITIONS: Array<{ v: ImagePosition; label: string }> = [
  { v: "top-left", label: "↖" },
  { v: "top-center", label: "↑" },
  { v: "top-right", label: "↗" },
  { v: "center-left", label: "←" },
  { v: "center", label: "·" },
  { v: "center-right", label: "→" },
  { v: "bottom-left", label: "↙" },
  { v: "bottom-center", label: "↓" },
  { v: "bottom-right", label: "↘" },
];

export function PdfImageWatermarkTool() {
  return (
    <PageEditorTool<WatermarkState>
      toolId="image-watermark"
      toolGroup="Edit"
      dropPrompt="Drop a PDF to watermark"
      busyLabel="Stamping watermark…"
      successCta="Watermark another PDF"
      errorCode="image_watermark_failed"
      initialState={INITIAL_STATE}
      multiPage={false}
      applyLabel={(state) =>
        !state.image ? "Pick an image first" : "Apply watermark to all pages"
      }
      disabledReason={(state) =>
        !state.image ? "Pick a watermark image" : null
      }
      apply={async (bytes, file, state) => {
        if (!state.image) {
          throw new Error("Pick a watermark image first.");
        }
        const { imageWatermarkPdf } = await import(
          "@/lib/pdf/ops/image-watermark"
        );

        // state.posPx is stored in PDF POINTS (bottom-left origin)
        // by the editor's onClick — already accounts for renderScale
        // and uses the watermark's bottom-left as the anchor (with
        // click landing at the watermark's center). The op clamps
        // per-page so mixed-orientation docs stay on-page.
        const customPositionPt = state.posPx ?? undefined;

        const r = await imageWatermarkPdf(bytes, {
          imageBytes: state.image.bytes,
          imageMime: state.image.mime,
          position: state.position,
          opacity: state.opacity,
          widthScale: state.scale,
          customPositionPt,
        });

        const baseName = file.name.replace(/\.pdf$/i, "");
        const headline = state.posPx
          ? `Watermarked ${r.pageCount} page${r.pageCount === 1 ? "" : "s"} at custom position`
          : `Watermarked ${r.pageCount} page${r.pageCount === 1 ? "" : "s"} (${humanizePosition(state.position)})`;
        const result: PageEditorResult = {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-watermarked.pdf`,
          successHeadline: headline,
          successDetail: `Output: ${humanSize(r.bytes.length)} · ${Math.round(state.scale * 100)}% size · ${Math.round(state.opacity * 100)}% opacity`,
        };
        return result;
      }}
      configPanel={WatermarkConfigPanel}
      editor={WatermarkEditorOverlay}
    />
  );
}

function humanizePosition(p: ImagePosition): string {
  return p.replace(/-/g, " ");
}

function WatermarkConfigPanel({
  state,
  setState,
  busy,
}: PageEditorConfigProps<WatermarkState>) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (state.image?.previewUrl) URL.revokeObjectURL(state.image.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      alert("Watermark image over 10 MB — try a smaller one.");
      return;
    }
    const lower = f.name.toLowerCase();
    let mime: "image/png" | "image/jpeg";
    if (f.type === "image/png" || lower.endsWith(".png")) mime = "image/png";
    else if (
      f.type === "image/jpeg" ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg")
    )
      mime = "image/jpeg";
    else {
      alert("Watermark must be a PNG or JPG.");
      return;
    }
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image failed to load"));
      });
      if (state.image?.previewUrl) URL.revokeObjectURL(state.image.previewUrl);
      setState((s) => ({
        ...s,
        image: {
          fileName: f.name,
          bytes,
          mime,
          previewUrl: url,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        },
      }));
    } catch (err) {
      console.error("watermark image read failed", err);
      alert("Could not read the image.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeImage = () => {
    if (state.image?.previewUrl) URL.revokeObjectURL(state.image.previewUrl);
    setState((s) => ({ ...s, image: null, posPx: null }));
  };

  const resetToPreset = () => {
    setState((s) => ({ ...s, posPx: null }));
  };

  return (
    <div
      className="card"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div style={{ fontSize: 13, fontWeight: 500 }}>Watermark image</div>
      {state.image ? (
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 6,
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
              overflow: "hidden",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.image.previewUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
            <div style={{ fontWeight: 500 }}>{state.image.fileName}</div>
            <div className="subtle">
              {state.image.naturalWidth}×{state.image.naturalHeight} ·{" "}
              {humanSize(state.image.bytes.length)} ·{" "}
              {state.image.mime.replace("image/", "")}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={removeImage}
            disabled={busy}
            aria-label="Remove watermark image"
          >
            <I.X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => inputRef.current?.click()}
          style={{ alignSelf: "flex-start" }}
        >
          <I.Image size={14} /> Choose PNG or JPG
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={onPick}
        style={{ display: "none" }}
      />

      {/* Position picker — only shown when no custom click is set */}
      {state.posPx ? (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            background: "var(--accent-soft)",
            border: "1px solid var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            fontSize: 12,
          }}
        >
          <span>
            <strong>Custom position set.</strong> Watermark will stamp at the
            spot you clicked.
          </span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={resetToPreset}
            disabled={busy}
            style={{ flexShrink: 0 }}
          >
            Reset to preset
          </button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>
            Position preset
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 44px)",
              gap: 4,
              alignSelf: "flex-start",
            }}
            role="radiogroup"
            aria-label="Watermark position"
          >
            {POSITIONS.map((opt) => (
              <button
                key={opt.v}
                type="button"
                role="radio"
                aria-checked={state.position === opt.v}
                onClick={() =>
                  setState((s) => ({ ...s, position: opt.v }))
                }
                disabled={busy}
                title={opt.v.replace(/-/g, " ")}
                style={{
                  height: 44,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 6,
                  border:
                    state.position === opt.v
                      ? "2px solid var(--accent)"
                      : "1px solid var(--border)",
                  background:
                    state.position === opt.v
                      ? "var(--accent-soft)"
                      : "var(--bg-1)",
                  color:
                    state.position === opt.v
                      ? "var(--accent)"
                      : "var(--fg-muted)",
                  cursor: busy ? "default" : "pointer",
                  fontSize: 16,
                  font: "inherit",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Opacity + scale */}
      <div
        className="row"
        style={{ gap: 16, flexWrap: "wrap", alignItems: "center" }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
          }}
        >
          <span>Opacity</span>
          <input
            type="range"
            min={5}
            max={100}
            value={Math.round(state.opacity * 100)}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                opacity: Number(e.target.value) / 100,
              }))
            }
            disabled={busy}
            style={{ width: 120 }}
          />
          <span
            className="subtle"
            style={{
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
              minWidth: 36,
            }}
          >
            {Math.round(state.opacity * 100)}%
          </span>
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
          }}
        >
          <span>Size</span>
          <input
            type="range"
            min={5}
            max={100}
            value={Math.round(state.scale * 100)}
            onChange={(e) =>
              setState((s) => ({ ...s, scale: Number(e.target.value) / 100 }))
            }
            disabled={busy}
            style={{ width: 120 }}
          />
          <span
            className="subtle"
            style={{
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
              minWidth: 56,
            }}
          >
            {Math.round(state.scale * 100)}% of page
          </span>
        </label>
      </div>

      <div className="subtle" style={{ fontSize: 12 }}>
        {!state.image
          ? "Pick a watermark image to start."
          : state.posPx
            ? "Click anywhere on the page to move it. Stamps on every page at the same spot."
            : "Click anywhere on the page for a custom position, or pick a preset above. Stamps on every page."}
      </div>
    </div>
  );
}

function WatermarkEditorOverlay({
  pageRender,
  state,
  setState,
  busy,
}: PageEditorEditorProps<WatermarkState>) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const onClick = (e: React.MouseEvent) => {
    if (busy || !state.image) return;
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;
    // Click in CSS pixels → convert to RENDERED pixel coords →
    // convert to PDF points (bottom-left origin).
    const xPx = (xCss / rect.width) * pageRender.pxWidth;
    const yPx = (yCss / rect.height) * pageRender.pxHeight;
    // Anchor: drawImage uses BOTTOM-LEFT corner, so the click point
    // becomes the image's bottom-left. We compute the watermark size
    // in points, then place its bottom-left at (xPt, ptHeight - yPx_pt).
    // But to keep the on-page preview match the apply output, we
    // store the click's bottom-left position in PT here so apply
    // can pass it straight through.
    const widthPt = state.scale * pageRender.ptWidth;
    const heightPt = state.image
      ? widthPt * (state.image.naturalHeight / state.image.naturalWidth)
      : 0;
    const xPt = xPx / pageRender.renderScale;
    const yTopPt = yPx / pageRender.renderScale; // distance from page top
    // Bottom-left anchor: shift up so the CLICK lands at the CENTER
    // of the watermark, which feels natural ("place it here").
    const xPtBL = xPt - widthPt / 2;
    const yPtBL = pageRender.ptHeight - yTopPt - heightPt / 2;
    setState((s) => ({ ...s, posPx: { x: xPtBL, y: yPtBL } }));
  };

  // Compute marker dims in % of page for the live ghost.
  const markerWidthPct = state.scale * 100;
  const markerHeightPct = state.image
    ? markerWidthPct *
      (state.image.naturalHeight / state.image.naturalWidth) *
      (pageRender.pxWidth / pageRender.pxHeight)
    : 0;

  // Resolve the marker's position. If user clicked, posPx holds the
  // BOTTOM-LEFT corner in PDF points → convert back to CSS-% for the
  // overlay (top-left origin).
  let markerLeftPct: number | null = null;
  let markerTopPct: number | null = null;
  if (state.image) {
    if (state.posPx) {
      markerLeftPct = (state.posPx.x / pageRender.ptWidth) * 100;
      // Convert PT bottom-left to CSS top-left:
      // CSS-top = page top - (posPx.y in points + heightPt)
      const heightPct =
        markerWidthPct *
        (state.image.naturalHeight / state.image.naturalWidth) *
        (pageRender.pxWidth / pageRender.pxHeight);
      const topPctFromBottom =
        (state.posPx.y / pageRender.ptHeight) * 100 + heightPct;
      markerTopPct = 100 - topPctFromBottom;
    } else {
      // Mirror the preset math from the op (same units, 0-100%).
      const marginPct = (28 / pageRender.ptWidth) * 100; // ~ same on both axes since margin is 28pt
      const marginPctY = (28 / pageRender.ptHeight) * 100;
      const heightPct = markerHeightPct;
      if (state.position.endsWith("-left")) markerLeftPct = marginPct;
      else if (state.position.endsWith("-right"))
        markerLeftPct = 100 - markerWidthPct - marginPct;
      else markerLeftPct = (100 - markerWidthPct) / 2;

      if (state.position.startsWith("top-")) markerTopPct = marginPctY;
      else if (state.position.startsWith("bottom-"))
        markerTopPct = 100 - heightPct - marginPctY;
      else markerTopPct = (100 - heightPct) / 2;
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={onClick}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${pageRender.pxWidth} / ${pageRender.pxHeight}`,
        cursor: busy || !state.image ? "default" : "crosshair",
        background: "var(--bg-2)",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--border)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pageRender.url}
        alt={`Page ${pageRender.pageIndex + 1} preview`}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />
      {state.image && markerLeftPct !== null && markerTopPct !== null && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={state.image.previewUrl}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${markerLeftPct}%`,
            top: `${markerTopPct}%`,
            width: `${markerWidthPct}%`,
            height: `${markerHeightPct}%`,
            opacity: state.opacity,
            pointerEvents: "none",
            // Subtle outline so the ghost is distinguishable from the
            // page even when opacity is high.
            outline: state.posPx
              ? "1px dashed rgba(37, 99, 235, 0.7)"
              : "1px dashed rgba(0, 0, 0, 0.3)",
            outlineOffset: -1,
          }}
        />
      )}
      {!state.image && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              background: "rgba(0,0,0,0.6)",
              color: "white",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Pick a watermark image first
          </div>
        </div>
      )}
      {pageRender.pageCount > 1 && (
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
          Stamps on all {pageRender.pageCount} pages
        </div>
      )}
    </div>
  );
}
