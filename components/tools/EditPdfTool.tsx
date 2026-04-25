"use client";

// EditPdfTool — Tier 1 §1.5 P0 (v1 text-only).
//
// Click a text run on a rendered page, type its replacement, apply.
// This is a FIRST-CUT Edit PDF — deliberately scoped to text only
// (no image edit, no layout reflow, no structural changes) to ship
// an honest-small v1 that closes the "Edit PDF" keyword without
// overpromising.
//
// How it works end-to-end:
//   1. pdfjs renders each page to canvas at RENDER_SCALE.
//   2. pdfjs `getTextContent()` returns every text-showing run on
//      the page as a `TextItem` with its transform matrix, width,
//      height, and font reference.
//   3. We overlay each item as a clickable <button> at its
//      canvas-space bounds so users can pick what to edit.
//   4. On click → inline editor with old text + new-text input.
//   5. On "Apply", pdf-lib loads the PDF. For each edit:
//        a. draw an opaque WHITE rectangle over the original
//           text's bounding box (covers the old glyphs).
//        b. embed the correct standard font (best-effort match
//           from the pdfjs font name — see STANDARD_FONT_MAP).
//        c. drawText at the same (x, y) with the same size.
//   6. Save + download.
//
// Honest limitations, surfaced in the UI + FAQ:
//   - White-background-only. The cover rectangle is white; on
//     coloured or textured backgrounds the rectangle will be
//     visible. For coloured backgrounds, users should redact
//     first, then Add Text Box — this tool assumes standard
//     white letter/A4 content.
//   - Non-standard fonts fall back to Helvetica. pdf-lib's
//     StandardFonts cover Helvetica/Times/Courier/Symbol/
//     ZapfDingbats in their plain/bold/italic/bold-italic
//     variants. A document using Roboto or an embedded custom
//     font will render replacements in Helvetica. The editor
//     surfaces a chip when this fallback will happen so users
//     aren't surprised.
//   - No reflow. If the new text is LONGER than the original,
//     it may overflow into adjacent content. The editor shows a
//     live character-count warning when the new text exceeds
//     the original's width.
//   - One run at a time. pdfjs splits text into many small
//     runs (roughly per-line or per-word). Editing "Hello
//     World" might require two clicks if they're in separate
//     runs — the list below the canvas makes this explicit.

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import {
  deriveOutputName,
  downloadBytes,
  humanSize,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";
import { useTrackToolView } from "./useToolTracking";

const RENDER_SCALE = 1.5;

type TextRun = {
  id: string;
  pageIndex: number;
  originalText: string;
  xPdf: number;
  yPdf: number;
  widthPt: number;
  heightPt: number;
  fontSize: number;
  fontName: string;
};

type Edit = {
  run: TextRun;
  newText: string;
};

type Loaded = {
  file: File;
  buffer: ArrayBuffer;
  pageSizes: Array<{ widthPt: number; heightPt: number }>;
};

// pdf-lib StandardFonts covers only the 14 PDF standard fonts. Any
// document using a non-standard or embedded font will fall back to
// Helvetica at draw time — we surface that to the user rather than
// silently substituting.
function mapToStandardFont(pdfjsFontName: string): {
  font: StandardFonts;
  fallback: boolean;
} {
  const name = pdfjsFontName ?? "";
  const lower = name.toLowerCase();

  // Direct standard-name matches first.
  const direct: Record<string, StandardFonts> = {
    "Helvetica": StandardFonts.Helvetica,
    "Helvetica-Bold": StandardFonts.HelveticaBold,
    "Helvetica-Oblique": StandardFonts.HelveticaOblique,
    "Helvetica-BoldOblique": StandardFonts.HelveticaBoldOblique,
    "Times-Roman": StandardFonts.TimesRoman,
    "Times-Bold": StandardFonts.TimesRomanBold,
    "Times-Italic": StandardFonts.TimesRomanItalic,
    "Times-BoldItalic": StandardFonts.TimesRomanBoldItalic,
    "Courier": StandardFonts.Courier,
    "Courier-Bold": StandardFonts.CourierBold,
    "Courier-Oblique": StandardFonts.CourierOblique,
    "Courier-BoldOblique": StandardFonts.CourierBoldOblique,
    "Symbol": StandardFonts.Symbol,
    "ZapfDingbats": StandardFonts.ZapfDingbats,
  };
  if (direct[name]) return { font: direct[name], fallback: false };

  const bold = /bold|black|heavy/.test(lower);
  const italic = /italic|oblique/.test(lower);
  if (/times|serif/.test(lower)) {
    if (bold && italic) return { font: StandardFonts.TimesRomanBoldItalic, fallback: false };
    if (bold) return { font: StandardFonts.TimesRomanBold, fallback: false };
    if (italic) return { font: StandardFonts.TimesRomanItalic, fallback: false };
    return { font: StandardFonts.TimesRoman, fallback: false };
  }
  if (/courier|mono/.test(lower)) {
    if (bold && italic) return { font: StandardFonts.CourierBoldOblique, fallback: false };
    if (bold) return { font: StandardFonts.CourierBold, fallback: false };
    if (italic) return { font: StandardFonts.CourierOblique, fallback: false };
    return { font: StandardFonts.Courier, fallback: false };
  }
  // Everything else → Helvetica family with style preserved where
  // we can guess, flagged as a fallback.
  if (bold && italic) return { font: StandardFonts.HelveticaBoldOblique, fallback: true };
  if (bold) return { font: StandardFonts.HelveticaBold, fallback: true };
  if (italic) return { font: StandardFonts.HelveticaOblique, fallback: true };
  return { font: StandardFonts.Helvetica, fallback: true };
}

export function EditPdfTool() {
  useTrackToolView("edit-pdf", "Edit");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [runs, setRuns] = useState<TextRun[]>([]); // current page only
  const [edits, setEdits] = useState<Edit[]>([]);
  const [activeRun, setActiveRun] = useState<TextRun | null>(null);
  const [draftText, setDraftText] = useState("");
  const [busy, setBusy] = useState(false);
  const [renderBusy, setRenderBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    name: string;
    size: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const onFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setEdits([]);
    setPageIndex(0);
    setActiveRun(null);
    setBusy(true);
    try {
      const buffer = await f.arrayBuffer();
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pages = doc.getPages();
      if (pages.length === 0) throw new Error("PDF has no pages.");
      setLoaded({
        file: f,
        buffer,
        pageSizes: pages.map((p) => ({
          widthPt: p.getWidth(),
          heightPt: p.getHeight(),
        })),
      });
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && /encrypted|password/i.test(err.message)
          ? "This PDF is password-protected. Unlock it first."
          : "Couldn't read that PDF. It may be corrupt."
      );
      setLoaded(null);
    } finally {
      setBusy(false);
    }
  }, []);

  // Render current page + extract its text runs on every page change.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const render = async () => {
      setRenderBusy(true);
      setActiveRun(null);
      renderTaskRef.current?.cancel();
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs-worker.min.mjs";
        }
        const src = await pdfjs.getDocument({ data: loaded.buffer.slice(0) }).promise;
        if (cancelled) return;
        const page = await src.getPage(pageIndex + 1);
        if (cancelled) return;

        // Render to canvas.
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;
        setCanvasSize({ w: viewport.width, h: viewport.height });

        // Extract text runs.
        const content = await page.getTextContent();
        if (cancelled) return;
        const styles = (content as { styles?: Record<string, { fontFamily?: string }> })
          .styles ?? {};
        const list: TextRun[] = [];
        for (const item of content.items) {
          if (!("str" in item) || typeof item.str !== "string") continue;
          if (!item.str.trim()) continue;
          const t = (item as { transform?: number[] }).transform ?? [];
          const w = (item as { width?: number }).width ?? 0;
          const h = (item as { height?: number }).height ?? 0;
          const [, , , d = 0, e = 0, f = 0] = t;
          // Font size ≈ d (the y-scale of the transform) for
          // upright text. Some rotated text uses a different
          // layout; we fall back to h when d is zero.
          const fontSize = Math.abs(d) || h || 12;
          const fontRef = (item as { fontName?: string }).fontName ?? "";
          const fontName = styles[fontRef]?.fontFamily ?? fontRef;
          list.push({
            id: Math.random().toString(36).slice(2, 12),
            pageIndex,
            originalText: item.str,
            xPdf: e,
            yPdf: f,
            widthPt: w,
            heightPt: fontSize,
            fontSize,
            fontName,
          });
        }
        setRuns(list);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (!/cancelled|Worker was destroyed/i.test(msg)) {
          console.error("page render failed:", err);
          setError("Couldn't render this page.");
        }
      } finally {
        if (!cancelled) setRenderBusy(false);
      }
    };
    render();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [loaded, pageIndex]);

  const reset = () => {
    setLoaded(null);
    setEdits([]);
    setRuns([]);
    setPageIndex(0);
    setActiveRun(null);
    setError(null);
    setResult(null);
  };

  const onRunClick = (run: TextRun) => {
    setActiveRun(run);
    const existing = edits.find((e) => e.run.id === run.id);
    setDraftText(existing?.newText ?? run.originalText);
  };

  const saveEdit = () => {
    if (!activeRun) return;
    if (draftText === activeRun.originalText) {
      setEdits((prev) => prev.filter((e) => e.run.id !== activeRun.id));
    } else {
      setEdits((prev) => {
        const filtered = prev.filter((e) => e.run.id !== activeRun.id);
        return [...filtered, { run: activeRun, newText: draftText }];
      });
    }
    setActiveRun(null);
    setDraftText("");
  };

  const cancelEdit = () => {
    setActiveRun(null);
    setDraftText("");
  };

  const removeEdit = (id: string) => {
    setEdits((prev) => prev.filter((e) => e.run.id !== id));
  };

  const apply = async () => {
    if (!loaded) return;
    if (edits.length === 0) {
      setError("Click a text run on the page and type a replacement first.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const doc = await PDFDocument.load(loaded.buffer.slice(0), {
        ignoreEncryption: true,
      });

      // Embed each unique font once — pdf-lib dedupes at the
      // resource-dict level anyway, but caching avoids re-walking
      // the StandardFonts map for every edit.
      const fontCache = new Map<StandardFonts, Awaited<ReturnType<typeof doc.embedFont>>>();
      const loadFont = async (std: StandardFonts) => {
        const cached = fontCache.get(std);
        if (cached) return cached;
        const embedded = await doc.embedFont(std);
        fontCache.set(std, embedded);
        return embedded;
      };

      for (const edit of edits) {
        const page = doc.getPage(edit.run.pageIndex);
        // Cover original text with an opaque white rectangle. A
        // small vertical pad (20% of fontSize) so tall glyphs like
        // 'h' and descenders don't peek at the edge.
        const pad = edit.run.fontSize * 0.2;
        page.drawRectangle({
          x: edit.run.xPdf - 1,
          y: edit.run.yPdf - pad,
          width: edit.run.widthPt + 2,
          height: edit.run.fontSize + pad * 2,
          color: rgb(1, 1, 1),
          opacity: 1,
          borderWidth: 0,
        });

        const mapped = mapToStandardFont(edit.run.fontName);
        const font = await loadFont(mapped.font);
        page.drawText(edit.newText, {
          x: edit.run.xPdf,
          y: edit.run.yPdf,
          size: edit.run.fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      }

      const bytes = await doc.save({
        useObjectStreams: true,
        updateFieldAppearances: false,
      });
      const name = deriveOutputName(loaded.file.name, "-edited");
      setResult({ bytes, name, size: bytes.length });

      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "edit-pdf",
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
      setError(err instanceof Error ? err.message : "Edit failed.");
    } finally {
      setBusy(false);
    }
  };

  const currentPageEdits = useMemo(
    () => edits.filter((e) => e.run.pageIndex === pageIndex),
    [edits, pageIndex]
  );

  // Convert a run's PDF bounds to CSS % over the canvas container.
  const boundsPct = (run: TextRun) => {
    if (!canvasSize || !loaded) return null;
    const pageW = canvasSize.w / RENDER_SCALE;
    const pageH = canvasSize.h / RENDER_SCALE;
    const leftPct = (run.xPdf / pageW) * 100;
    const widthPct = (run.widthPt / pageW) * 100;
    const topPct = ((pageH - run.yPdf - run.fontSize) / pageH) * 100;
    const heightPct = (run.fontSize / pageH) * 100;
    return { leftPct, topPct, widthPct, heightPct };
  };

  const activeMapping = activeRun ? mapToStandardFont(activeRun.fontName) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!loaded ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to edit text"
        />
      ) : (
        <>
          <div
            className="card"
            style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}
          >
            <span style={{ color: "var(--fg-subtle)" }}>
              <I.File size={18} />
            </span>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div
                title={loaded.file.name}
                style={{
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {loaded.file.name}
              </div>
              <div className="subtle" style={{ fontSize: 12 }}>
                {humanSize(loaded.file.size)} · {loaded.pageSizes.length} page
                {loaded.pageSizes.length === 1 ? "" : "s"} · {edits.length} edit
                {edits.length === 1 ? "" : "s"} staged
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

          <div
            className="card"
            style={{
              padding: 12,
              background: "var(--bg-2)",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <strong>How it works:</strong> Click any text on the page below
            to edit it. Original text is covered with a white rectangle and
            your replacement is drawn at the same position with a matched
            standard font. Works best on white-background documents using
            Helvetica / Times / Courier. Non-standard fonts fall back to
            Helvetica — flagged when that will happen.
          </div>

          <div
            className="card"
            style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div
              className="row"
              style={{ justifyContent: "space-between", gap: 10, alignItems: "center" }}
            >
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || pageIndex === 0}
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              >
                <I.ArrowLeft size={14} />
                <span>Prev</span>
              </button>
              <div
                className="mono"
                style={{ fontSize: 13, color: "var(--fg-subtle)" }}
              >
                Page {pageIndex + 1} / {loaded.pageSizes.length} · {runs.length} text run
                {runs.length === 1 ? "" : "s"}
                {renderBusy ? " · rendering…" : ""}
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || pageIndex >= loaded.pageSizes.length - 1}
                onClick={() =>
                  setPageIndex((p) => Math.min(loaded.pageSizes.length - 1, p + 1))
                }
              >
                <span>Next</span>
                <I.ArrowRight size={14} />
              </button>
            </div>

            <div
              style={{
                position: "relative",
                width: "100%",
                overflow: "auto",
                background: "var(--bg-2)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                padding: 12,
              }}
            >
              <div
                style={{
                  position: "relative",
                  margin: "0 auto",
                  width: canvasSize ? canvasSize.w : undefined,
                  maxWidth: "100%",
                }}
              >
                <canvas
                  ref={canvasRef}
                  style={{
                    display: "block",
                    width: "100%",
                    maxWidth: canvasSize ? canvasSize.w : undefined,
                    height: "auto",
                    background: "var(--bg-1)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    userSelect: "none",
                  }}
                />
                {canvasSize &&
                  runs.map((r) => {
                    const b = boundsPct(r);
                    if (!b) return null;
                    const edited = currentPageEdits.find((e) => e.run.id === r.id);
                    const isActive = activeRun?.id === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onRunClick(r)}
                        disabled={busy}
                        aria-label={`Edit text: ${r.originalText.slice(0, 40)}`}
                        style={{
                          position: "absolute",
                          left: `${b.leftPct}%`,
                          top: `${b.topPct}%`,
                          width: `${b.widthPct}%`,
                          height: `${b.heightPct}%`,
                          minHeight: 8,
                          border: isActive
                            ? "2px solid var(--accent)"
                            : edited
                              ? "2px solid var(--green, #0a7a2a)"
                              : "1px dashed transparent",
                          background: isActive
                            ? "color-mix(in oklab, var(--accent) 15%, transparent)"
                            : edited
                              ? "color-mix(in oklab, var(--green, #0a7a2a) 12%, transparent)"
                              : "transparent",
                          cursor: busy ? "default" : "pointer",
                          padding: 0,
                          transition: "background 0.1s, border 0.1s",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive && !edited) {
                            (e.currentTarget as HTMLButtonElement).style.background =
                              "color-mix(in oklab, var(--accent) 8%, transparent)";
                            (e.currentTarget as HTMLButtonElement).style.border =
                              "1px dashed var(--accent)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive && !edited) {
                            (e.currentTarget as HTMLButtonElement).style.background =
                              "transparent";
                            (e.currentTarget as HTMLButtonElement).style.border =
                              "1px dashed transparent";
                          }
                        }}
                      />
                    );
                  })}
              </div>
            </div>
          </div>

          {activeRun && (
            <div
              className="card"
              style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div
                style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)" }}
              >
                EDITING TEXT RUN
              </div>
              <div
                style={{
                  padding: "6px 10px",
                  background: "var(--bg-2)",
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                  wordBreak: "break-word",
                }}
              >
                Original: <strong>{activeRun.originalText}</strong>
              </div>
              <div
                className="subtle"
                style={{ fontSize: 11, display: "flex", gap: 12, flexWrap: "wrap" }}
              >
                <span>
                  Font: <code>{activeRun.fontName || "unknown"}</code>
                </span>
                <span>
                  Size: {Math.round(activeRun.fontSize)} pt
                </span>
                {activeMapping?.fallback && (
                  <span
                    style={{
                      padding: "2px 6px",
                      background: "var(--yellow-soft, #fef3c7)",
                      color: "var(--yellow-dark, #92400e)",
                      borderRadius: 3,
                    }}
                  >
                    ⚠ non-standard font — will render in Helvetica
                  </span>
                )}
              </div>
              <input
                type="text"
                value={draftText}
                autoFocus
                onChange={(e) => setDraftText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border-strong)",
                  background: "var(--bg-1)",
                  color: "var(--fg)",
                  fontSize: 14,
                }}
              />
              {draftText.length > activeRun.originalText.length * 1.4 && (
                <div style={{ fontSize: 11, color: "var(--red)" }}>
                  ⚠ Replacement is longer than the original — may overflow adjacent
                  content.
                </div>
              )}
              <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={saveEdit}>
                  Save edit
                </button>
              </div>
            </div>
          )}

          {edits.length > 0 && (
            <div className="card" style={{ padding: "12px 16px" }}>
              <div
                style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)", marginBottom: 8 }}
              >
                STAGED EDITS ({edits.length})
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                {edits.map((e) => (
                  <li
                    key={e.run.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: "6px 10px",
                      background: e.run.pageIndex === pageIndex ? "var(--accent-soft)" : "var(--bg-1)",
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >
                    <span
                      className="mono"
                      style={{ color: "var(--fg-subtle)", width: 50, flexShrink: 0 }}
                    >
                      p.{e.run.pageIndex + 1}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <s style={{ color: "var(--fg-subtle)" }}>{e.run.originalText}</s>{" "}
                      → <strong>{e.newText}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeEdit(e.run.id)}
                      className="btn btn-sm btn-ghost"
                      disabled={busy}
                      aria-label="Remove edit"
                    >
                      <I.X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
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
                {edits.length} edit{edits.length === 1 ? "" : "s"} applied
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
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
        {loaded && (
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
          disabled={!loaded || busy || edits.length === 0}
          onClick={apply}
        >
          {busy ? "Applying…" : `Apply (${edits.length})`}
        </button>
      </div>
    </div>
  );
}
