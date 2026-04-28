"use client";

// components/tools/PdfAddLinksTool.tsx
//
// Tier 6 (2026-04-28): seventh and final visual editor on
// PageEditorTool. Drag a rectangle on the page, type a URL, click
// "Save link" to commit. Repeat for additional links. Apply stamps
// every saved link as a /Link annotation via the add-links op.
//
// 2026-04-28 (Task #171): now multi-page. Iterate entries, chain bytes
// through addLinksPdf op once per page.
//
// Two-phase interaction (drag then type) is more involved than the
// other visual editors but matches user expectation: a hyperlink
// connects a region to a URL, and you can&rsquo;t infer the URL from the
// region.

import { useRef, useState } from "react";
import { I } from "@/components/icons/Icons";
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

interface SavedLink {
  rect: PixelRect;
  url: string;
}

interface AddLinksState {
  /** Committed links — these get applied on save. */
  saved: SavedLink[];
  /** Rect being drawn / edited but not yet saved. */
  pending: { rect: PixelRect; url: string } | null;
}

const INITIAL_STATE: AddLinksState = {
  saved: [],
  pending: null,
};

export function PdfAddLinksTool() {
  return (
    <PageEditorTool<AddLinksState>
      toolId="add-links"
      toolGroup="Edit"
      dropPrompt="Drop a PDF to add hyperlinks"
      busyLabel="Saving links…"
      successCta="Add links to another PDF"
      errorCode="add_links_failed"
      initialState={INITIAL_STATE}
      multiPage={true}
      hasEdits={(s) => s.saved.length > 0}
      resetPageContent={(s) => ({ ...s, saved: [], pending: null })}
      disabledReason={(entries) => {
        const total = entries.reduce((n, e) => n + e.state.saved.length, 0);
        if (total === 0) return "Save at least one link";
        return null;
      }}
      applyLabel={(entries) => {
        const total = entries.reduce((n, e) => n + e.state.saved.length, 0);
        const pages = entries.length;
        if (pages <= 1) {
          return `Apply ${total} link${total === 1 ? "" : "s"}`;
        }
        return `Apply ${total} link${total === 1 ? "" : "s"} on ${pages} pages`;
      }}
      apply={async (bytes, file, entries) => {
        if (entries.length === 0) {
          throw new Error("No saved links to apply.");
        }
        const { addLinksPdf } = await import("@/lib/pdf/ops/add-links");
        let currentBytes = bytes;
        let totalLinks = 0;
        let totalPages = 0;
        const editedPageNumbers: number[] = [];
        let lastPageCount = 0;
        for (const entry of entries) {
          if (entry.state.saved.length === 0) continue;
          const pxToPt = (px: number) => px / entry.dims.renderScale;
          const links = entry.state.saved.map((s) => ({
            x: pxToPt(s.rect.x),
            y: pxToPt(entry.dims.pxHeight - s.rect.y - s.rect.h),
            width: pxToPt(s.rect.w),
            height: pxToPt(s.rect.h),
            url: s.url,
          }));
          const r = await addLinksPdf(currentBytes, {
            links,
            pageIndex: entry.pageIndex,
          });
          currentBytes = r.bytes;
          totalLinks += r.linkCount;
          totalPages += 1;
          editedPageNumbers.push(entry.pageIndex + 1);
          lastPageCount = r.pageCount;
        }
        const baseName = file.name.replace(/\.pdf$/i, "");
        const headline =
          totalPages === 1
            ? `Added ${totalLinks} hyperlink${totalLinks === 1 ? "" : "s"} to page ${editedPageNumbers[0]}`
            : `Added ${totalLinks} hyperlink${totalLinks === 1 ? "" : "s"} across ${totalPages} pages`;
        const detailPages =
          totalPages > 1 ? ` · pages ${editedPageNumbers.join(", ")}` : "";
        const result: PageEditorResult = {
          outputBytes: currentBytes,
          outputFileName: `${baseName || "document"}-linked.pdf`,
          successHeadline: headline,
          successDetail: `Output: ${formatSize(currentBytes.length)} · ${lastPageCount} page${lastPageCount === 1 ? "" : "s"} total${detailPages}`,
        };
        return result;
      }}
      configPanel={LinksConfigPanel}
      editor={LinksEditorOverlay}
    />
  );
}

function LinksConfigPanel({
  state,
  setState,
  busy,
}: PageEditorConfigProps<AddLinksState>) {
  const saveLink = () => {
    if (!state.pending) return;
    const { rect, url } = state.pending;
    if (rect.w < 8 || rect.h < 8) return;
    if (!url.trim()) return;
    setState((s) => ({
      saved: [...s.saved, { rect, url: url.trim() }],
      pending: null,
    }));
  };

  const cancelPending = () => {
    setState((s) => ({ ...s, pending: null }));
  };

  const removeSaved = (idx: number) => {
    setState((s) => ({
      ...s,
      saved: s.saved.filter((_, i) => i !== idx),
    }));
  };

  const isValidUrl = (u: string) => {
    const t = u.trim();
    return /^(https?:|mailto:)/i.test(t);
  };

  return (
    <div
      className="card"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div style={{ fontSize: 13 }}>
        {state.saved.length === 0 && !state.pending
          ? "Drag a rectangle on the page to start. Then type a URL to link it to."
          : state.pending
            ? "Type the URL for the rectangle you just drew, then Save link."
            : `${state.saved.length} link${state.saved.length === 1 ? "" : "s"} saved. Drag to add another.`}
      </div>

      {state.pending && (
        <div
          style={{
            padding: 12,
            background: "var(--accent-soft)",
            border: "1px solid var(--accent)",
            borderRadius: 6,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500 }}>
            Pending link — type a URL and Save
          </div>
          <input
            type="url"
            value={state.pending.url}
            onChange={(e) =>
              setState((s) =>
                s.pending
                  ? { ...s, pending: { ...s.pending, url: e.target.value } }
                  : s,
              )
            }
            disabled={busy}
            placeholder="https://example.com"
            autoFocus
            style={{
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--bg-1)",
              color: "var(--fg)",
              fontFamily: "var(--mono, monospace)",
              fontSize: 13,
            }}
          />
          {state.pending.url.trim() && !isValidUrl(state.pending.url) && (
            <div className="subtle" style={{ fontSize: 11 }}>
              Heads up: URL should start with{" "}
              <code style={{ fontSize: 11 }}>https://</code>,{" "}
              <code style={{ fontSize: 11 }}>http://</code>, or{" "}
              <code style={{ fontSize: 11 }}>mailto:</code> to be clickable in
              most viewers.
            </div>
          )}
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={saveLink}
              disabled={
                busy ||
                !state.pending.url.trim() ||
                state.pending.rect.w < 8 ||
                state.pending.rect.h < 8
              }
            >
              <I.Check size={12} /> Save link
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={cancelPending}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {state.saved.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>
            Saved links ({state.saved.length})
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {state.saved.map((s, i) => (
              <li
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 8,
                  padding: "6px 10px",
                  background: "var(--bg-1)",
                  borderRadius: 4,
                  marginBottom: 4,
                  fontSize: 12,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--mono, monospace)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={s.url}
                  >
                    {s.url}
                  </div>
                  <div className="subtle" style={{ fontSize: 11 }}>
                    {Math.round(s.rect.w)}×{Math.round(s.rect.h)} px at (
                    {Math.round(s.rect.x)}, {Math.round(s.rect.y)})
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => removeSaved(i)}
                  disabled={busy}
                  aria-label={`Remove link to ${s.url}`}
                >
                  <I.X size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LinksEditorOverlay({
  pageRender,
  state,
  setState,
  busy,
}: PageEditorEditorProps<AddLinksState>) {
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
    // If there&rsquo;s already a pending link, drawing replaces it (user
    // is redrawing the rect before saving).
    const { x, y } = pointerToPx(e);
    setDrawing({ startX: x, startY: y });
    setState((s) => ({
      ...s,
      pending: { rect: { x, y, w: 0, h: 0 }, url: s.pending?.url ?? "" },
    }));
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const { x, y } = pointerToPx(e);
    const x0 = Math.min(drawing.startX, x);
    const y0 = Math.min(drawing.startY, y);
    const w = Math.abs(x - drawing.startX);
    const h = Math.abs(y - drawing.startY);
    setState((s) =>
      s.pending
        ? { ...s, pending: { ...s.pending, rect: { x: x0, y: y0, w, h } } }
        : s,
    );
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawing) return;
    setDrawing(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    // Drop tiny rects (stray clicks).
    setState((s) => {
      if (!s.pending) return s;
      if (s.pending.rect.w < 8 || s.pending.rect.h < 8) {
        return { ...s, pending: null };
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
      {/* Saved links — shown as faint blue rects with URL labels */}
      {state.saved.map((s, i) => {
        const left = (s.rect.x / pageRender.pxWidth) * 100;
        const top = (s.rect.y / pageRender.pxHeight) * 100;
        const width = (s.rect.w / pageRender.pxWidth) * 100;
        const height = (s.rect.h / pageRender.pxHeight) * 100;
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
              background: "rgba(29, 78, 216, 0.12)",
              border: "1.5px solid rgb(29, 78, 216)",
              pointerEvents: "none",
            }}
          />
        );
      })}
      {/* Pending rect — accent border, dashed if empty URL */}
      {state.pending && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${(state.pending.rect.x / pageRender.pxWidth) * 100}%`,
            top: `${(state.pending.rect.y / pageRender.pxHeight) * 100}%`,
            width: `${(state.pending.rect.w / pageRender.pxWidth) * 100}%`,
            height: `${(state.pending.rect.h / pageRender.pxHeight) * 100}%`,
            background: "rgba(245, 158, 11, 0.15)",
            border: state.pending.url.trim()
              ? "2px solid var(--accent)"
              : "2px dashed var(--accent)",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
