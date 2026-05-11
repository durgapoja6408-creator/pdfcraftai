"use client";

// components/tools/PdfAddTextBoxTool.tsx
//
// Tier 6 (2026-04-28): second consumer of PageEditorTool. Click on
// page 1 to place a text marker, type the label, pick font size +
// color, apply to every page. Validates the visual-editor abstraction
// across two concrete tools.

import { useRef } from "react";
import {
  PageEditorTool,
  type PageEditorEditorProps,
  type PageEditorConfigProps,
  type PageEditorResult,
} from "./PageEditorTool";
import { ToolHowItWorks } from "./ToolHowItWorks";

interface TextBoxState {
  text: string;
  /** Position in IMAGE PIXEL coordinates (top-left origin). null = not yet placed. */
  posPx: { x: number; y: number } | null;
  fontSize: number;
  color: string;
}

const INITIAL_STATE: TextBoxState = {
  text: "",
  posPx: null,
  fontSize: 14,
  color: "#000000",
};

export function PdfAddTextBoxTool() {
  return (
    <PageEditorTool<TextBoxState>
      toolId="add-text-box"
      toolGroup="Edit"
      dropPrompt="Drop a PDF to add a text box"
      busyLabel="Adding text…"
      successCta="Add text to another PDF"
      errorCode="add_text_box_failed"
      howItWorks={
        <ToolHowItWorks
          steps={[
            {
              title: "Drop a PDF",
              body:
                "Up to 100 MB. The first page renders so you can place text visually.",
            },
            {
              title: "Type and click to place",
              body:
                "Enter the text and font settings, then click on the page where you want it to land. A live preview shows the placement before you commit.",
            },
            {
              title: "Apply and download",
              body:
                "pdf-lib draws the text as a new layer on top of existing page content. Single-page placement — for repeating text on every page, use the Watermark tool.",
            },
          ]}
          privacyNote="Text-box placement runs entirely in your browser via pdf-lib — files never leave your machine."
        />
      }
      initialState={INITIAL_STATE}
      disabledReason={(state) => {
        if (!state.text.trim()) return "Type your text first";
        if (!state.posPx) return "Click on the page to place it";
        return null;
      }}
      applyLabel="Add text to all pages"
      apply={async (bytes, file, state, render) => {
        if (!state.posPx || !state.text.trim()) {
          throw new Error("Type text and click a position first.");
        }
        // Convert image-pixel (top-left) to PDF user-space (bottom-left).
        const xPt = state.posPx.x / render.renderScale;
        // PDF text origin is the BASELINE, not the top — drawText positions
        // the bottom-left of the first glyph at (x, y). To make the click
        // position feel like the TOP-LEFT of the text, subtract the font
        // size from the y after flipping.
        const yPxFromTop = state.posPx.y;
        const yPxFromBottom = render.pxHeight - yPxFromTop - state.fontSize * render.renderScale;
        const yPt = yPxFromBottom / render.renderScale;
        const { addTextBoxPdf } = await import("@/lib/pdf/ops/add-text-box");
        const r = await addTextBoxPdf(bytes, {
          text: state.text.trim(),
          x: xPt,
          y: yPt,
          fontSize: state.fontSize,
          color: state.color,
        });
        const baseName = file.name.replace(/\.pdf$/i, "");
        const result: PageEditorResult = {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-text.pdf`,
          successHeadline: `Added text to ${r.pageCount} page${r.pageCount === 1 ? "" : "s"}`,
          successDetail: `Output: ${formatSize(r.bytes.length)}`,
        };
        return result;
      }}
      configPanel={TextConfigPanel}
      editor={TextEditorOverlay}
    />
  );
}

function TextConfigPanel({
  state,
  setState,
  busy,
}: PageEditorConfigProps<TextBoxState>) {
  return (
    <div
      className="card"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
    >
      <label
        style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}
      >
        <span>Text</span>
        <input
          type="text"
          value={state.text}
          onChange={(e) => setState((s) => ({ ...s, text: e.target.value }))}
          maxLength={200}
          disabled={busy}
          placeholder="Type the text to stamp on every page"
          style={{
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "var(--bg-1)",
            color: "var(--fg)",
          }}
        />
      </label>
      <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
        >
          <span>Font size</span>
          <input
            type="number"
            min={6}
            max={72}
            value={state.fontSize}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                fontSize: Math.max(6, Math.min(72, Number(e.target.value) || 14)),
              }))
            }
            disabled={busy}
            style={{
              width: 72,
              padding: "4px 8px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--bg-1)",
              color: "var(--fg)",
            }}
          />
          <span className="subtle" style={{ fontSize: 11 }}>pt</span>
        </label>
        <label
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
        >
          <span>Color</span>
          <input
            type="color"
            value={state.color}
            onChange={(e) => setState((s) => ({ ...s, color: e.target.value }))}
            disabled={busy}
            style={{
              width: 36,
              height: 28,
              padding: 0,
              border: "1px solid var(--border)",
              borderRadius: 4,
            }}
          />
        </label>
      </div>
      <div className="subtle" style={{ fontSize: 12 }}>
        {state.posPx
          ? "Position locked. Click anywhere on the page to move it."
          : "Click anywhere on the page below to place the text."}
      </div>
    </div>
  );
}

function TextEditorOverlay({
  pageRender,
  state,
  setState,
  busy,
}: PageEditorEditorProps<TextBoxState>) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const onClick = (e: React.MouseEvent) => {
    if (busy) return;
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;
    const xPx = (xCss / rect.width) * pageRender.pxWidth;
    const yPx = (yCss / rect.height) * pageRender.pxHeight;
    setState((s) => ({ ...s, posPx: { x: xPx, y: yPx } }));
  };

  // Convert image-pixel position to overlay-percentage for rendering
  // the marker.
  const markerLeftPct = state.posPx
    ? (state.posPx.x / pageRender.pxWidth) * 100
    : 0;
  const markerTopPct = state.posPx
    ? (state.posPx.y / pageRender.pxHeight) * 100
    : 0;
  const fontSizePct = (state.fontSize * pageRender.renderScale / pageRender.pxWidth) * 100;

  return (
    <div
      ref={overlayRef}
      onClick={onClick}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${pageRender.pxWidth} / ${pageRender.pxHeight}`,
        cursor: busy ? "default" : "crosshair",
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
      {state.posPx && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${markerLeftPct}%`,
            top: `${markerTopPct}%`,
            color: state.color,
            fontFamily: "Helvetica, Arial, sans-serif",
            fontSize: `${fontSizePct}vw`,
            // Cap the displayed font-size to a reasonable px range so it
            // doesn't get tiny on small viewports — the apply will use
            // the actual fontSize prop in PDF units anyway.
            lineHeight: 1,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            // Subtle outline so the marker stays visible against any
            // background.
            textShadow:
              "0 0 2px rgba(255,255,255,0.7), 0 0 1px rgba(255,255,255,0.7)",
          }}
        >
          {state.text || "Your text"}
        </div>
      )}
      {!state.posPx && (
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
            Click to place text
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
