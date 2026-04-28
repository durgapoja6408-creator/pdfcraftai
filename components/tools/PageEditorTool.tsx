"use client";

// components/tools/PageEditorTool.tsx
//
// Tier 6 (2026-04-28): shared base for tools that ask the user to
// interact with a rendered page (visual editors). Extracted from
// PdfCropTool after it shipped — Crop validated the scaffolding
// against one concrete instance, and Add Text Box becomes the second
// consumer in the same commit.
//
// What this base owns:
//   • file drop + PDF / size validation
//   • PDFium render of page 1 to a JPEG preview at configurable scale
//   • stage management (idle / rendering / ready / applying)
//   • busy + error + result cards with proper aria
//   • GA4 funnel (tracker.upload / success / error)
//   • Apply / Reset buttons + repeat-use CTA
//   • download trigger
//
// What consumers plug in via slots:
//   • initialState — the shape they want to track (cropPx, textBoxes, ...)
//   • configPanel  — optional UI between file card and page (text input,
//                    sliders, color picker, etc.)
//   • editor       — interactive overlay rendered on top of the page
//                    image. Receives pageRender + state + setState.
//   • apply        — the op fn that turns state into bytes
//
// Pattern matches PageGridTool — slot-based, generic over state type.

import { useState, useCallback, useEffect } from "react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useTrackToolView } from "./useToolTracking";
import type { ToolGroup } from "@/lib/tools";

export interface PageRender {
  /** Object URL for the rendered page JPEG. */
  url: string;
  /** Rendered image pixel width. */
  pxWidth: number;
  /** Rendered image pixel height. */
  pxHeight: number;
  /** Source PDF page width in user-space points. */
  ptWidth: number;
  /** Source PDF page height in user-space points. */
  ptHeight: number;
  /** The render-scale that was used (pixel = point × renderScale). */
  renderScale: number;
  /** 0-based index of the currently rendered page. */
  pageIndex: number;
  /** Total page count of the source PDF. */
  pageCount: number;
}

export interface PageEditorResult {
  outputBytes: Uint8Array;
  outputFileName: string;
  /** Headline shown on the success card. */
  successHeadline: string;
  /** Smaller subtle line below the headline. */
  successDetail: string;
}

export interface PageEditorEditorProps<TState> {
  pageRender: PageRender;
  state: TState;
  setState: React.Dispatch<React.SetStateAction<TState>>;
  /** True while the apply op is running. */
  busy: boolean;
}

export interface PageEditorConfigProps<TState> {
  state: TState;
  setState: React.Dispatch<React.SetStateAction<TState>>;
  busy: boolean;
}

export interface PageEditorToolProps<TState> {
  toolId: string;
  toolGroup: ToolGroup;
  dropPrompt: string;
  dropHint?: string;
  /** PDFium render scale for the page preview. Default 1.5. */
  renderScale?: number;
  /** Spinner label during apply. */
  busyLabel: string;
  /** Apply button label — string OR fn(state, render) → string. */
  applyLabel: string | ((state: TState, render: PageRender) => string);
  /** Repeat-use CTA after success. */
  successCta: string;
  /** Tracker error code on failure. */
  errorCode: string;
  /** Initial editor state. */
  initialState: TState;
  /**
   * If set, the Apply button is disabled and shows the returned label
   * instead. Returning null = enabled.
   */
  disabledReason?: (state: TState, render: PageRender) => string | null;
  /** The actual op. */
  apply: (
    bytes: Uint8Array,
    file: File,
    state: TState,
    render: PageRender,
  ) => Promise<PageEditorResult>;
  /** Optional config panel between file card and page editor. */
  configPanel?: React.FC<PageEditorConfigProps<TState>>;
  /** Interactive overlay component. */
  editor: React.FC<PageEditorEditorProps<TState>>;
}

type Stage = "idle" | "rendering" | "ready" | "applying";

export function PageEditorTool<TState>(props: PageEditorToolProps<TState>) {
  const tracker = useTrackToolView(props.toolId, props.toolGroup);
  const renderScale = props.renderScale ?? 1.5;
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [render, setRender] = useState<PageRender | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PageEditorResult | null>(null);
  const [state, setState] = useState<TState>(props.initialState);

  useEffect(() => {
    return () => {
      if (render?.url) URL.revokeObjectURL(render.url);
    };
  }, [render]);

  /**
   * Render a single page of the loaded PDF as a JPEG and store it in
   * the render state. Used both on initial file drop (page 0) and on
   * page navigation.
   *
   * Renders ONLY the requested page — pdf-lib's rasterize-all
   * approach would be wasteful here since the editor only ever shows
   * one page. PDFium-on-demand is fast (50-200 ms per page on typical
   * docs) so navigation feels instant.
   */
  const renderSinglePage = useCallback(
    async (bytes: Uint8Array, pageIndex: number, pageCount: number) => {
      const { renderPdfPage } = await import("@/lib/pdf/ops/rasterize-page");
      const rendered = await renderPdfPage(bytes, {
        pageIndex,
        format: "jpeg",
        scale: renderScale,
        quality: 0.85,
      });
      const blob = new Blob([rendered.bytes], { type: "image/jpeg" });
      return {
        url: URL.createObjectURL(blob),
        pxWidth: rendered.width,
        pxHeight: rendered.height,
        ptWidth: rendered.width / renderScale,
        ptHeight: rendered.height / renderScale,
        renderScale,
        pageIndex,
        pageCount,
      } satisfies PageRender;
    },
    [renderScale],
  );

  const onFiles = useCallback(
    async (files: File[]) => {
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
      setStage("rendering");

      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        setPdfBytes(bytes);
        // Inspect for page count without rendering all pages — much
        // faster than rasterizing every page on a multi-page doc.
        const { withPdfDocument } = await import("@/lib/pdf/library");
        const pageCount = await withPdfDocument(bytes, async (doc) =>
          doc.getPageCount(),
        );
        if (pageCount === 0) throw new Error("This PDF has no pages.");
        const newRender = await renderSinglePage(bytes, 0, pageCount);
        setRender(newRender);
        setState(props.initialState);
        setStage("ready");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not parse PDF.";
        setError(msg);
        setStage("idle");
        tracker.error({ errorCode: `${props.errorCode}_render` });
      }
    },
    [tracker, props.errorCode, props.initialState, renderSinglePage],
  );

  /**
   * Navigate to a different page. Re-renders that page and resets
   * editor state to initialState (so per-page edits don't leak across
   * pages — most visual editors today are single-page in nature; v2
   * could add per-page state persistence).
   */
  const goToPage = useCallback(
    async (newIndex: number) => {
      if (!pdfBytes || !render) return;
      if (newIndex === render.pageIndex) return;
      if (newIndex < 0 || newIndex >= render.pageCount) return;
      setStage("rendering");
      try {
        const oldUrl = render.url;
        const newRender = await renderSinglePage(
          pdfBytes,
          newIndex,
          render.pageCount,
        );
        URL.revokeObjectURL(oldUrl);
        setRender(newRender);
        setState(props.initialState);
        setStage("ready");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not render page.";
        setError(msg);
        setStage("ready");
      }
    },
    [pdfBytes, render, renderSinglePage, props.initialState],
  );

  const reset = () => {
    if (render?.url) URL.revokeObjectURL(render.url);
    setFile(null);
    setPdfBytes(null);
    setRender(null);
    setError(null);
    setResult(null);
    setStage("idle");
    setState(props.initialState);
  };

  const apply = async () => {
    if (!pdfBytes || !file || !render) return;
    setError(null);
    setStage("applying");
    const t0 = performance.now();
    try {
      const r = await props.apply(pdfBytes, file, state, render);
      setResult(r);
      setStage("ready");
      tracker.success({
        creditCost: 0,
        pageCount: 1,
        processingMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not apply the operation.";
      setError(msg);
      setStage("ready");
      tracker.error({ errorCode: props.errorCode });
    }
  };

  const downloadResult = () => {
    if (!result) return;
    const blob = new Blob([result.outputBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = result.outputFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const truncate = (s: string, max = 38) =>
    s.length <= max ? s : `${s.slice(0, max - 1)}…`;

  const busy = stage === "rendering" || stage === "applying";
  const disabledLabel = render
    ? props.disabledReason?.(state, render) ?? null
    : null;
  const applyButtonLabel =
    busy
      ? props.busyLabel
      : disabledLabel ??
        (typeof props.applyLabel === "function" && render
          ? props.applyLabel(state, render)
          : (props.applyLabel as string));

  const ConfigPanel = props.configPanel;
  const EditorOverlay = props.editor;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          prompt={props.dropPrompt}
          hint={props.dropHint ?? "Up to 100 MB · runs privately in your browser"}
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
                {render
                  ? ` · ${Math.round(render.ptWidth)}×${Math.round(render.ptHeight)} pt`
                  : ""}
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

      {stage === "rendering" && (
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
            {render
              ? `Rendering page ${render.pageIndex + 1}…`
              : "Rendering page 1…"}
          </div>
        </div>
      )}

      {stage === "applying" && (
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
            {props.busyLabel}
          </div>
        </div>
      )}

      {render && stage === "ready" && !result && (
        <>
          {/* Page navigator — only shown for multi-page docs. Reset
              state on navigate so per-page edits don't leak; users
              with a multi-page workflow apply each page in turn. */}
          {render.pageCount > 1 && (
            <div
              className="card"
              style={{
                padding: "10px 14px",
                display: "flex",
                gap: 12,
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
              }}
            >
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => goToPage(render.pageIndex - 1)}
                disabled={busy || render.pageIndex === 0}
                aria-label="Previous page"
              >
                <I.ArrowLeft size={14} /> Prev
              </button>
              <span
                style={{
                  fontVariantNumeric: "tabular-nums",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span className="subtle">Page</span>
                <input
                  type="number"
                  min={1}
                  max={render.pageCount}
                  value={render.pageIndex + 1}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 1 && n <= render.pageCount) {
                      goToPage(n - 1);
                    }
                  }}
                  disabled={busy}
                  style={{
                    width: 60,
                    padding: "4px 8px",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    background: "var(--bg-1)",
                    color: "var(--fg)",
                    fontVariantNumeric: "tabular-nums",
                    textAlign: "center",
                  }}
                />
                <span className="subtle">of {render.pageCount}</span>
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => goToPage(render.pageIndex + 1)}
                disabled={busy || render.pageIndex >= render.pageCount - 1}
                aria-label="Next page"
              >
                Next <I.ArrowRight size={14} />
              </button>
            </div>
          )}
          {ConfigPanel && (
            <ConfigPanel state={state} setState={setState} busy={busy} />
          )}
          <div
            style={{
              maxWidth: 720,
              margin: "0 auto",
              width: "100%",
              userSelect: "none",
            }}
          >
            <EditorOverlay
              pageRender={render}
              state={state}
              setState={setState}
              busy={busy}
            />
          </div>
        </>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: "16px 20px" }}
          role="status"
          aria-live="polite"
          aria-label={result.successHeadline}
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
                {result.successHeadline}
              </div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 2 }}>
                {result.successDetail}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={downloadResult}
            >
              <I.Download size={12} /> Download
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        {result ? (
          <button type="button" className="btn btn-primary" onClick={reset}>
            {props.successCta}
          </button>
        ) : stage === "ready" && render ? (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={reset}
              disabled={busy}
            >
              Reset
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || disabledLabel !== null}
              onClick={apply}
            >
              {applyButtonLabel}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
