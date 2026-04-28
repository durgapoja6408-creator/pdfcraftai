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

/**
 * Snapshot of the page-render dimensions captured at edit time —
 * needed by multi-page apply callbacks because rect coords are stored
 * in image-pixel space against the page's pxHeight + renderScale, and
 * those differ per page on PDFs with mixed orientations / sizes.
 */
export interface PageDims {
  pxWidth: number;
  pxHeight: number;
  ptWidth: number;
  ptHeight: number;
  renderScale: number;
}

export interface PageEditEntry<TState> {
  pageIndex: number;
  state: TState;
  dims: PageDims;
}

interface PageEditorBaseProps<TState> {
  toolId: string;
  toolGroup: ToolGroup;
  dropPrompt: string;
  dropHint?: string;
  /** PDFium render scale for the page preview. Default 1.5. */
  renderScale?: number;
  /** Spinner label during apply. */
  busyLabel: string;
  /** Repeat-use CTA after success. */
  successCta: string;
  /** Tracker error code on failure. */
  errorCode: string;
  /** Initial editor state. */
  initialState: TState;
  /** Optional config panel between file card and page editor. */
  configPanel?: React.FC<PageEditorConfigProps<TState>>;
  /** Interactive overlay component. */
  editor: React.FC<PageEditorEditorProps<TState>>;
}

interface SinglePageProps<TState> extends PageEditorBaseProps<TState> {
  /** Single-page mode: apply receives the current page's state only. */
  multiPage?: false;
  applyLabel: string | ((state: TState, render: PageRender) => string);
  disabledReason?: (state: TState, render: PageRender) => string | null;
  apply: (
    bytes: Uint8Array,
    file: File,
    state: TState,
    render: PageRender,
  ) => Promise<PageEditorResult>;
}

interface MultiPageProps<TState> extends PageEditorBaseProps<TState> {
  /**
   * Multi-page mode: state is persisted per page. Apply receives every
   * page that has non-default state. Consumers iterate, calling their
   * op once per page (chaining bytes through). The page navigator UI
   * surfaces "N pages edited" so users know other pages still have
   * pending work.
   */
  multiPage: true;
  /**
   * Predicate to detect "this page has real edits" — used to decide
   * which pages roll into the Map passed to apply, and to drive the
   * "N pages edited" counter. Default: `state !== initialState` by
   * reference. Most consumers want a deeper check (rect-array length
   * etc.).
   */
  hasEdits?: (state: TState) => boolean;
  /**
   * Clear the per-page CONTENT fields (rects, strokes, click position)
   * while preserving the GLOBAL CONFIG fields (color, opacity, image,
   * pen width, scale). Called when navigating to a page that has no
   * stashed entry yet — without this hook we'd reset to initialState
   * and the user's color picker / opacity slider / signature image
   * would silently revert on every navigation, which is hostile UX.
   *
   * Examples:
   *   Highlight:  (s) => ({ ...s, rects: [] })
   *   Sign:       (s) => ({ ...s, posPx: null })
   *   Free Draw:  (s) => ({ ...s, strokes: [] })
   *
   * Default: returns initialState (back-compat, but will reset config).
   */
  resetPageContent?: (state: TState) => TState;
  applyLabel:
    | string
    | ((entries: PageEditEntry<TState>[], current: PageRender) => string);
  disabledReason?: (
    entries: PageEditEntry<TState>[],
    current: PageRender,
  ) => string | null;
  apply: (
    bytes: Uint8Array,
    file: File,
    entries: PageEditEntry<TState>[],
    current: PageRender,
  ) => Promise<PageEditorResult>;
}

export type PageEditorToolProps<TState> =
  | SinglePageProps<TState>
  | MultiPageProps<TState>;

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
  /**
   * Multi-page mode only: per-page state map. Keyed by 0-based
   * pageIndex. When the user navigates away from a page, we snapshot
   * the current state into this map (alongside the dims used to
   * produce it, since pxHeight / renderScale can differ across pages
   * on mixed-orientation docs). On navigate-back, we restore from
   * this map.
   *
   * Persisted across the whole session (file load → apply). Cleared
   * on reset or new file.
   */
  const [pageStates, setPageStates] = useState<Map<number, PageEditEntry<TState>>>(
    () => new Map(),
  );

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
        setPageStates(new Map());
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
   * Navigate to a different page.
   *
   * Multi-page mode: snapshot the OUTGOING page's state into pageStates
   * (if it has real edits), then restore the INCOMING page's state from
   * pageStates (or initialState if untouched). This is the "state
   * persistence across pages" promise — a user can highlight on page 1,
   * jump to page 4, highlight there too, then click Apply once and have
   * both runs land in a single output.
   *
   * Single-page mode (multiPage=false): just reset to initialState. No
   * map mutation. Crop / Add Text Box behavior unchanged.
   */
  const goToPage = useCallback(
    async (newIndex: number) => {
      if (!pdfBytes || !render) return;
      if (newIndex === render.pageIndex) return;
      if (newIndex < 0 || newIndex >= render.pageCount) return;
      setStage("rendering");
      try {
        const oldUrl = render.url;
        // Snapshot current page's state into the map BEFORE re-rendering.
        if (props.multiPage) {
          const hasEdits = props.hasEdits ?? ((s: TState) => s !== props.initialState);
          setPageStates((prev) => {
            const next = new Map(prev);
            if (hasEdits(state)) {
              next.set(render.pageIndex, {
                pageIndex: render.pageIndex,
                state,
                dims: {
                  pxWidth: render.pxWidth,
                  pxHeight: render.pxHeight,
                  ptWidth: render.ptWidth,
                  ptHeight: render.ptHeight,
                  renderScale: render.renderScale,
                },
              });
            } else {
              // No edits → drop any prior entry for this page so the
              // map doesn't lie about edit count.
              next.delete(render.pageIndex);
            }
            return next;
          });
        }
        const newRender = await renderSinglePage(
          pdfBytes,
          newIndex,
          render.pageCount,
        );
        URL.revokeObjectURL(oldUrl);
        setRender(newRender);
        // Restore the destination page's state from the map (if any),
        // otherwise carry global config forward but clear content via
        // resetPageContent (preserves color/opacity/image/etc).
        if (props.multiPage) {
          const restored = pageStates.get(newIndex);
          if (restored) {
            setState(restored.state);
          } else if (props.resetPageContent) {
            setState(props.resetPageContent(state));
          } else {
            setState(props.initialState);
          }
        } else {
          setState(props.initialState);
        }
        setStage("ready");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not render page.";
        setError(msg);
        setStage("ready");
      }
    },
    [pdfBytes, render, renderSinglePage, props, state, pageStates],
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
    setPageStates(new Map());
  };

  /**
   * Build the full list of edited pages for multi-page apply, merging
   * the current page's in-flight state (if it has real edits) on top
   * of the snapshot map. The current page's snapshot in pageStates may
   * be stale — the user has been editing since the last navigation —
   * so we always prefer the live state for the current pageIndex.
   */
  const buildMultiPageEntries = (): PageEditEntry<TState>[] => {
    if (!props.multiPage || !render) return [];
    const hasEdits = props.hasEdits ?? ((s: TState) => s !== props.initialState);
    const entries: PageEditEntry<TState>[] = [];
    for (const [pageIndex, entry] of pageStates) {
      if (pageIndex === render.pageIndex) continue; // current page handled below
      if (hasEdits(entry.state)) entries.push(entry);
    }
    if (hasEdits(state)) {
      entries.push({
        pageIndex: render.pageIndex,
        state,
        dims: {
          pxWidth: render.pxWidth,
          pxHeight: render.pxHeight,
          ptWidth: render.ptWidth,
          ptHeight: render.ptHeight,
          renderScale: render.renderScale,
        },
      });
    }
    entries.sort((a, b) => a.pageIndex - b.pageIndex);
    return entries;
  };

  const apply = async () => {
    if (!pdfBytes || !file || !render) return;
    setError(null);
    setStage("applying");
    const t0 = performance.now();
    try {
      let r: PageEditorResult;
      if (props.multiPage) {
        const entries = buildMultiPageEntries();
        r = await props.apply(pdfBytes, file, entries, render);
      } else {
        r = await props.apply(pdfBytes, file, state, render);
      }
      setResult(r);
      setStage("ready");
      tracker.success({
        creditCost: 0,
        pageCount: props.multiPage
          ? Math.max(1, buildMultiPageEntries().length)
          : 1,
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
  // Disabled-reason and applyLabel branch by mode. In multi-page mode
  // both callbacks see the FULL picture (every page with edits), not
  // just the current page — that's what unlocks "Apply 5 highlights
  // across 3 pages" labels.
  let disabledLabel: string | null = null;
  let applyButtonLabel: string;
  if (busy) {
    applyButtonLabel = props.busyLabel;
  } else if (render && props.multiPage) {
    const entries = buildMultiPageEntries();
    disabledLabel = props.disabledReason?.(entries, render) ?? null;
    applyButtonLabel =
      disabledLabel ??
      (typeof props.applyLabel === "function"
        ? props.applyLabel(entries, render)
        : (props.applyLabel as string));
  } else if (render && !props.multiPage) {
    disabledLabel = props.disabledReason?.(state, render) ?? null;
    applyButtonLabel =
      disabledLabel ??
      (typeof props.applyLabel === "function"
        ? props.applyLabel(state, render)
        : (props.applyLabel as string));
  } else {
    applyButtonLabel =
      typeof props.applyLabel === "string" ? props.applyLabel : "Apply";
  }

  // Count of OTHER pages (excluding current) that have stashed edits —
  // shown next to the page navigator so the user knows their work on
  // page 2 didn't evaporate when they jumped to page 5.
  const otherEditedPageCount = (() => {
    if (!props.multiPage || !render) return 0;
    const hasEdits = props.hasEdits ?? ((s: TState) => s !== props.initialState);
    let n = 0;
    for (const [pageIndex, entry] of pageStates) {
      if (pageIndex === render.pageIndex) continue;
      if (hasEdits(entry.state)) n++;
    }
    return n;
  })();

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
          {/* Page navigator — only shown for multi-page docs. In
              multiPage mode, edits on the outgoing page are stashed
              into pageStates, so jumping around doesn't lose work
              (the "N other pages edited" pill makes that visible). */}
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
                flexWrap: "wrap",
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
              {props.multiPage && otherEditedPageCount > 0 && (
                <span
                  aria-live="polite"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: "rgba(59, 130, 246, 0.12)",
                    border: "1px solid rgba(59, 130, 246, 0.35)",
                    color: "var(--accent, #3b82f6)",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                  title="Edits on other pages will be applied when you click Apply"
                >
                  <I.Edit size={11} />
                  {otherEditedPageCount} other{" "}
                  {otherEditedPageCount === 1 ? "page" : "pages"} edited
                </span>
              )}
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
