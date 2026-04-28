"use client";

// components/tools/PdfRedactTool.tsx
//
// Tier 6 (2026-04-28): fourth visual-editor consumer of PageEditorTool.
// Drag to add an opaque redaction rectangle over sensitive content;
// multiple redactions per session. Same shape as Highlight but with
// solid color (no opacity slider) and an upfront honest-scope warning
// about what this can and can't do.

import { useState, useRef } from "react";
import {
  PageEditorTool,
  type PageEditorEditorProps,
  type PageEditorConfigProps,
  type PageEditorResult,
} from "./PageEditorTool";

interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RedactState {
  rects: PixelRect[];
  color: string;
}

const INITIAL_STATE: RedactState = {
  rects: [],
  color: "#000000",
};

const COLOR_SWATCHES: Array<{ value: string; label: string }> = [
  { value: "#000000", label: "Black" },
  { value: "#FFFFFF", label: "White (erase)" },
  { value: "#808080", label: "Gray" },
];

export function PdfRedactTool() {
  return (
    <PageEditorTool<RedactState>
      toolId="redact-free"
      toolGroup="Security"
      dropPrompt="Drop a PDF to redact"
      busyLabel="Applying redactions…"
      successCta="Redact another PDF"
      errorCode="redact_failed"
      initialState={INITIAL_STATE}
      disabledReason={(state) => {
        const real = state.rects.filter((r) => r.w >= 8 && r.h >= 8);
        if (real.length === 0) return "Drag to add a redaction box";
        return null;
      }}
      applyLabel={(state) => {
        const real = state.rects.filter((r) => r.w >= 8 && r.h >= 8);
        return `Apply ${real.length} redaction${real.length === 1 ? "" : "s"}`;
      }}
      apply={async (bytes, file, state, render) => {
        const real = state.rects.filter((r) => r.w >= 8 && r.h >= 8);
        if (real.length === 0) {
          throw new Error("No valid redaction rectangles to apply.");
        }
        const pxToPt = (px: number) => px / render.renderScale;
        const rectsPt = real.map((r) => ({
          x: pxToPt(r.x),
          y: pxToPt(render.pxHeight - r.y - r.h),
          width: pxToPt(r.w),
          height: pxToPt(r.h),
        }));
        const { redactPdf } = await import("@/lib/pdf/ops/redact");
        const r = await redactPdf(bytes, {
          rects: rectsPt,
          color: state.color,
          pageIndex: render.pageIndex,
        });
        const baseName = file.name.replace(/\.pdf$/i, "");
        const result: PageEditorResult = {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-redacted.pdf`,
          successHeadline: `Applied ${r.redactedRectCount} redaction${r.redactedRectCount === 1 ? "" : "s"} to page ${render.pageIndex + 1}`,
          successDetail: `Output: ${formatSize(r.bytes.length)}. Visual cover only — see FAQ on full destruction.`,
        };
        return result;
      }}
      configPanel={RedactConfigPanel}
      editor={RedactEditorOverlay}
    />
  );
}

function RedactConfigPanel({
  state,
  setState,
  busy,
}: PageEditorConfigProps<RedactState>) {
  const realRects = state.rects.filter((r) => r.w >= 8 && r.h >= 8);
  return (
    <div
      className="card"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
    >
      {/*
       * Honest-scope warning. PDF redaction is one of those things
       * users assume works one way (destroys content) when in reality
       * pdf-lib drawRectangle just covers it. Surfacing the limitation
       * upfront prevents misuse on high-stakes content.
       */}
      <div
        style={{
          padding: 12,
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: 6,
          fontSize: 12,
          color: "var(--fg)",
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: "var(--red, #ef4444)" }}>
          Visual redaction only.
        </strong>{" "}
        This covers content with an opaque rectangle but does NOT destroy
        the underlying text/images. Anyone with PDF tooling can recover
        what&rsquo;s under the box. For court filings, FOIA releases, or
        healthcare records, use Adobe Acrobat&rsquo;s redaction feature or a
        server-side qpdf workflow. Fine for low-stakes uses (covering a
        name on a printout, hiding a price on a screenshot).
      </div>

      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <div style={{ fontSize: 13 }}>
          {realRects.length === 0
            ? "Drag a rectangle on the page to redact. Drag again for more."
            : `${realRects.length} redaction${realRects.length === 1 ? "" : "s"} on page 1`}
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setState((s) => ({ ...s, rects: [] }))}
          disabled={busy || state.rects.length === 0}
        >
          Clear all
        </button>
      </div>

      <div style={{ fontSize: 13, fontWeight: 500 }}>Cover color</div>
      <div className="row" style={{ gap: 6 }}>
        {COLOR_SWATCHES.map((sw) => (
          <button
            key={sw.value}
            type="button"
            onClick={() => setState((s) => ({ ...s, color: sw.value }))}
            disabled={busy}
            aria-label={sw.label}
            aria-pressed={state.color === sw.value}
            title={sw.label}
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              border:
                state.color === sw.value
                  ? "2px solid var(--accent)"
                  : "1px solid var(--border)",
              background: sw.value,
              cursor: busy ? "default" : "pointer",
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function RedactEditorOverlay({
  pageRender,
  state,
  setState,
  busy,
}: PageEditorEditorProps<RedactState>) {
  const [drawing, setDrawing] = useState<{ startX: number; startY: number } | null>(
    null,
  );
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const pointerToPx = (e: React.PointerEvent): { x: number; y: number } => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;
    const xPx = (xCss / rect.width) * pageRender.pxWidth;
    const yPx = (yCss / rect.height) * pageRender.pxHeight;
    return {
      x: Math.max(0, Math.min(xPx, pageRender.pxWidth)),
      y: Math.max(0, Math.min(yPx, pageRender.pxHeight)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy) return;
    const { x, y } = pointerToPx(e);
    setDrawing({ startX: x, startY: y });
    setState((s) => ({ ...s, rects: [...s.rects, { x, y, w: 0, h: 0 }] }));
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const { x, y } = pointerToPx(e);
    const x0 = Math.min(drawing.startX, x);
    const y0 = Math.min(drawing.startY, y);
    const w = Math.abs(x - drawing.startX);
    const h = Math.abs(y - drawing.startY);
    setState((s) => {
      if (s.rects.length === 0) return s;
      const next = s.rects.slice(0, -1);
      next.push({ x: x0, y: y0, w, h });
      return { ...s, rects: next };
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawing) return;
    setDrawing(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setState((s) => {
      if (s.rects.length === 0) return s;
      const last = s.rects[s.rects.length - 1];
      if (last.w < 8 || last.h < 8) {
        return { ...s, rects: s.rects.slice(0, -1) };
      }
      return s;
    });
  };

  return (
    <div
      ref={overlayRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${pageRender.pxWidth} / ${pageRender.pxHeight}`,
        cursor: busy ? "default" : "crosshair",
        background: "var(--bg-2)",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--border)",
        touchAction: "none",
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
      {state.rects.map((r, i) => {
        const left = (r.x / pageRender.pxWidth) * 100;
        const top = (r.y / pageRender.pxHeight) * 100;
        const width = (r.w / pageRender.pxWidth) * 100;
        const height = (r.h / pageRender.pxHeight) * 100;
        return (
          <div
            key={i}
            aria-hidden="true"
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              background: state.color,
              opacity: 1,
              pointerEvents: "none",
              border:
                i === state.rects.length - 1 && drawing
                  ? "1px solid rgba(255,255,255,0.6)"
                  : "none",
            }}
          />
        );
      })}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
