"use client";

// components/tools/PdfSignTool.tsx
//
// Tier 6 (2026-04-28): fifth visual editor on PageEditorTool. Hybrid
// of Add Text Box (click-to-place) and Image Watermark (image upload):
// drop a PDF + signature image, click on page 1 to place the
// signature, adjust size with a slider, apply.
//
// HONEST SCOPE: visual signing only — not cryptographic e-sign. The
// config panel surfaces this upfront so users with binding-signature
// needs route to DocuSign / Adobe Sign instead.

import { useEffect, useRef, useState } from "react";
import { I } from "@/components/icons/Icons";
import {
  PageEditorTool,
  type PageEditorEditorProps,
  type PageEditorConfigProps,
  type PageEditorResult,
} from "./PageEditorTool";
import { humanSize } from "@/lib/client/pdf-utils";

interface PickedImage {
  fileName: string;
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  /** Object URL for preview. */
  previewUrl: string;
  /** Natural pixel dimensions of the image. */
  naturalWidth: number;
  naturalHeight: number;
}

interface SignState {
  image: PickedImage | null;
  /** Click position in IMAGE PIXEL coords (top-left origin). null = not yet placed. */
  posPx: { x: number; y: number } | null;
  /** Signature width as a fraction of page width (0–1). Default 0.25. */
  scale: number;
}

const INITIAL_STATE: SignState = {
  image: null,
  posPx: null,
  scale: 0.25,
};

export function PdfSignTool() {
  return (
    <PageEditorTool<SignState>
      toolId="sign-pdf-free"
      toolGroup="Edit"
      dropPrompt="Drop a PDF to sign"
      busyLabel="Placing signature…"
      successCta="Sign another PDF"
      errorCode="sign_failed"
      initialState={INITIAL_STATE}
      disabledReason={(state) => {
        if (!state.image) return "Pick a signature image";
        if (!state.posPx) return "Click on the page to place it";
        return null;
      }}
      applyLabel="Place signature & save"
      apply={async (bytes, file, state, render) => {
        if (!state.image || !state.posPx) {
          throw new Error("Need both an image and a click position.");
        }
        // Convert image-pixel (top-left) to PDF user-space (bottom-left).
        // The click is treated as the TOP-LEFT corner of the placed
        // signature for click-where-you-want-it-to-appear semantics.
        const widthPt = state.scale * render.ptWidth;
        const heightPt =
          widthPt * (state.image.naturalHeight / state.image.naturalWidth);
        const xPt = state.posPx.x / render.renderScale;
        const yPxFromTop = state.posPx.y;
        const yPxFromBottom =
          render.pxHeight - yPxFromTop - heightPt * render.renderScale;
        const yPt = yPxFromBottom / render.renderScale;
        const { signPdf } = await import("@/lib/pdf/ops/sign");
        const r = await signPdf(bytes, {
          imageBytes: state.image.bytes,
          imageMime: state.image.mime,
          x: xPt,
          y: yPt,
          width: widthPt,
          pageIndex: render.pageIndex,
        });
        const baseName = file.name.replace(/\.pdf$/i, "");
        const result: PageEditorResult = {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-signed.pdf`,
          successHeadline: `Signature placed on page ${render.pageIndex + 1}`,
          successDetail: `Output: ${formatSize(r.bytes.length)} · ${r.pageCount} page${r.pageCount === 1 ? "" : "s"} total`,
        };
        return result;
      }}
      configPanel={SignConfigPanel}
      editor={SignEditorOverlay}
    />
  );
}

function SignConfigPanel({
  state,
  setState,
  busy,
}: PageEditorConfigProps<SignState>) {
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
      alert("Signature image over 10 MB — try a smaller one.");
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
      alert("Signature must be a PNG or JPG.");
      return;
    }
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      // Get natural dimensions via a temporary Image() so we can
      // preserve aspect ratio when scaling.
      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image failed to load"));
      });
      // Revoke prior image URL if present.
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
      console.error("sign image read failed", err);
      alert("Could not read the image.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeImage = () => {
    if (state.image?.previewUrl) URL.revokeObjectURL(state.image.previewUrl);
    setState((s) => ({ ...s, image: null }));
  };

  return (
    <div
      className="card"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div
        style={{
          padding: 12,
          background: "rgba(245, 158, 11, 0.08)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: 6,
          fontSize: 12,
          color: "var(--fg)",
          lineHeight: 1.5,
        }}
      >
        <strong>Visual signature only.</strong> This places a signature
        image on the page — it&rsquo;s not a cryptographic e-signature. There&rsquo;s
        no signing certificate, no integrity binding, no signer identity.
        For binding contracts, use DocuSign, Adobe Sign, or HelloSign.
      </div>

      <div style={{ fontSize: 13, fontWeight: 500 }}>Signature image</div>
      {state.image ? (
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          <div
            style={{
              width: 80,
              height: 50,
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
            aria-label="Remove signature image"
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

      <label
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
      >
        <span>Size</span>
        <input
          type="range"
          min={5}
          max={60}
          value={Math.round(state.scale * 100)}
          onChange={(e) =>
            setState((s) => ({ ...s, scale: Number(e.target.value) / 100 }))
          }
          disabled={busy}
          style={{ width: 140 }}
        />
        <span
          className="subtle"
          style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", minWidth: 60 }}
        >
          {Math.round(state.scale * 100)}% of page
        </span>
      </label>

      <div className="subtle" style={{ fontSize: 12 }}>
        {!state.image
          ? "Pick a signature image to start."
          : state.posPx
            ? "Click anywhere on the page to move it."
            : "Click anywhere on the page to place the signature."}
      </div>
    </div>
  );
}

function SignEditorOverlay({
  pageRender,
  state,
  setState,
  busy,
}: PageEditorEditorProps<SignState>) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const onClick = (e: React.MouseEvent) => {
    if (busy || !state.image) return;
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;
    const xPx = (xCss / rect.width) * pageRender.pxWidth;
    const yPx = (yCss / rect.height) * pageRender.pxHeight;
    setState((s) => ({ ...s, posPx: { x: xPx, y: yPx } }));
  };

  // Compute marker dimensions in image-pixel coordinates so the
  // preview matches what the apply will produce.
  const markerWidthPct = state.scale * 100; // % of page width
  const markerHeightPct = state.image
    ? markerWidthPct *
      (state.image.naturalHeight / state.image.naturalWidth) *
      (pageRender.pxWidth / pageRender.pxHeight)
    : 0;
  const markerLeftPct = state.posPx
    ? (state.posPx.x / pageRender.pxWidth) * 100
    : 0;
  const markerTopPct = state.posPx
    ? (state.posPx.y / pageRender.pxHeight) * 100
    : 0;

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
        alt="Page 1 preview"
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />
      {state.image && state.posPx && (
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
            pointerEvents: "none",
            // Subtle drop shadow so the signature stands out against
            // any page background (light or dark).
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))",
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
            Pick a signature image first
          </div>
        </div>
      )}
      {state.image && !state.posPx && (
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
            Click to place signature
          </div>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
