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
import { ToolHowItWorks } from "./ToolHowItWorks";

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
      howItWorks={
        <ToolHowItWorks
          steps={[
            {
              title: "Drop a PDF",
              body:
                "Up to 100 MB. The page renders as a visual editor for drawing link regions.",
            },
            {
              title: "Drag to draw a link region",
              body:
                "Click and drag on the page to create a hyperlink rectangle, then paste the destination URL. The visible region shows a chip preview of the URL. Drag corners to resize, X to remove.",
            },
            {
              title: "Apply and download",
              body:
                "pdf-lib stamps clickable /Link annotations on the chosen pages. Output works in Adobe Acrobat, Chrome PDF viewer, and Preview.app — all the major renderers.",
            },
          ]}
          privacyNote="Link creation runs entirely in your browser via pdf-lib — files and URLs never leave your machine."
        />
      }
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
  pageRender,
}: PageEditorConfigProps<AddLinksState>) {
  const currentPage = pageRender.pageIndex + 1;
  const pageCount = pageRender.pageCount;
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
            : pageCount > 1
              ? `${state.saved.length} link${state.saved.length === 1 ? "" : "s"} saved on page ${currentPage}. Drag to reposition, drag a corner to resize, or drag empty space for another.`
              : `${state.saved.length} link${state.saved.length === 1 ? "" : "s"} saved. Drag to reposition, drag a corner to resize, or drag empty space for another.`}
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
            // M12 (#193, 2026-04-29): on mobile, the soft keyboard can occlude
            // the URL input — the pending-link card lives below the page
            // canvas, which on a small screen often sits below the fold once
            // the keyboard takes ~40% of the viewport. Scroll the input into
            // view (centered) on focus so it stays visible above the keyboard.
            //
            // The 280ms delay matches typical mobile keyboard animation time
            // (iOS ~250ms, Android 200-300ms) — scrolling immediately can
            // land on a position that's wrong once the keyboard finishes
            // expanding the viewport. autoFocus also fires this callback
            // on first mount, so it covers both the auto-focus case and any
            // subsequent user-tap re-focus.
            onFocus={(e) => {
              const target = e.currentTarget;
              setTimeout(() => {
                target.scrollIntoView({ block: "center", behavior: "smooth" });
              }, 280);
            }}
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
            {pageCount > 1
              ? `Saved links on page ${currentPage} (${state.saved.length})`
              : `Saved links (${state.saved.length})`}
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

  // Drag-to-reposition state for saved rects (#180). When the user
  // pointer-downs on a saved rect, we capture the pointer offset
  // inside the rect so subsequent pointermoves update the rect's
  // top-left in pixel space without snapping the cursor to the
  // rect corner. Using a ref instead of useState because we mutate
  // it on every pointermove and don't want React reconciliation
  // overhead in the move loop.
  const movingRef = useRef<{
    index: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [movingIndex, setMovingIndex] = useState<number | null>(null);

  // Resize state for saved rects (#181). Same ref-vs-state split as
  // moving — ref drives the per-pointermove math, useState only for
  // visual amplification (active-handle highlight). Snapshots the
  // ORIGINAL rect at pointerdown so we can do absolute math from the
  // pointer's current position relative to the original origin,
  // avoiding accumulation drift.
  type ResizeCorner = "nw" | "ne" | "sw" | "se";
  const resizingRef = useRef<{
    index: number;
    corner: ResizeCorner;
    originX: number;
    originY: number;
    origRect: PixelRect;
  } | null>(null);
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);

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
    // Resize takes priority over both move and draw.
    if (resizingRef.current) {
      applyResize(e);
      return;
    }
    // Saved-rect move takes priority — when movingRef is active, we
    // skip the drawing-new-rect path entirely. (movingRef gets set
    // by the saved-rect's own onPointerDown, which stopPropagations,
    // so the parent shouldn't even see the down event in normal
    // flow — but we guard here against React event-ordering races.)
    if (movingRef.current) {
      const { x, y } = pointerToPx(e);
      const { index, offsetX, offsetY } = movingRef.current;
      setState((s) => {
        if (index < 0 || index >= s.saved.length) return s;
        const target = s.saved[index];
        const newX = Math.max(
          0,
          Math.min(pageRender.pxWidth - target.rect.w, x - offsetX),
        );
        const newY = Math.max(
          0,
          Math.min(pageRender.pxHeight - target.rect.h, y - offsetY),
        );
        const next = [...s.saved];
        next[index] = {
          ...target,
          rect: { ...target.rect, x: newX, y: newY },
        };
        return { ...s, saved: next };
      });
      return;
    }
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
    if (resizingRef.current) {
      resizingRef.current = null;
      setResizingIndex(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      return;
    }
    if (movingRef.current) {
      movingRef.current = null;
      setMovingIndex(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      return;
    }
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

  // Saved-rect drag start. Calculates the pointer offset inside the
  // rect so subsequent moves preserve the grab point — without this,
  // the rect would snap to have its top-left under the cursor every
  // time. stopPropagation prevents the parent overlay's
  // onPointerDown from firing (which would start a new draw).
  const onSavedRectPointerDown = (e: React.PointerEvent, index: number) => {
    if (busy) return;
    e.stopPropagation();
    const { x, y } = pointerToPx(e);
    const target = state.saved[index];
    if (!target) return;
    movingRef.current = {
      index,
      offsetX: x - target.rect.x,
      offsetY: y - target.rect.y,
    };
    setMovingIndex(index);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // Forwarded pointermove on the saved rect — same logic as the
  // overlay's onPointerMove move-branch, but separate handler is
  // needed because pointer capture binds events to the rect element
  // (not the overlay).
  const onSavedRectPointerMove = (e: React.PointerEvent) => {
    if (!movingRef.current) return;
    const { x, y } = pointerToPx(e);
    const { index, offsetX, offsetY } = movingRef.current;
    setState((s) => {
      if (index < 0 || index >= s.saved.length) return s;
      const target = s.saved[index];
      const newX = Math.max(
        0,
        Math.min(pageRender.pxWidth - target.rect.w, x - offsetX),
      );
      const newY = Math.max(
        0,
        Math.min(pageRender.pxHeight - target.rect.h, y - offsetY),
      );
      const next = [...s.saved];
      next[index] = {
        ...target,
        rect: { ...target.rect, x: newX, y: newY },
      };
      return { ...s, saved: next };
    });
  };

  const onSavedRectPointerUp = (e: React.PointerEvent) => {
    if (!movingRef.current) return;
    movingRef.current = null;
    setMovingIndex(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Resize math, shared between resize-handle pointermove and the
  // overlay's onPointerMove fallback path. Pulled into its own fn
  // because the body is non-trivial — corner-aware delta math + min
  // size clamp + page-bounds clamp.
  const applyResize = (e: React.PointerEvent) => {
    if (!resizingRef.current) return;
    const { x: px, y: py } = pointerToPx(e);
    const { index, corner, originX, originY, origRect } = resizingRef.current;
    const dx = px - originX;
    const dy = py - originY;
    let newX = origRect.x;
    let newY = origRect.y;
    let newW = origRect.w;
    let newH = origRect.h;
    // Western corners (NW, SW): dragging right shrinks width AND
    // moves the rect right; dragging left grows width AND moves the
    // rect left. (the rect's right edge stays anchored.)
    if (corner === "nw" || corner === "sw") {
      newX = origRect.x + dx;
      newW = origRect.w - dx;
    }
    // Eastern corners (NE, SE): width grows/shrinks from the right;
    // x stays anchored.
    if (corner === "ne" || corner === "se") {
      newW = origRect.w + dx;
    }
    // Northern corners (NW, NE): bottom edge stays anchored, top
    // edge moves with pointer.
    if (corner === "nw" || corner === "ne") {
      newY = origRect.y + dy;
      newH = origRect.h - dy;
    }
    // Southern corners (SW, SE): top stays anchored, bottom moves.
    if (corner === "sw" || corner === "se") {
      newH = origRect.h + dy;
    }
    // Min-size clamp (8×8 to match the drag-to-add discard
    // threshold). When clamping a western/northern corner, also
    // anchor the opposite edge so the rect doesn't drift sideways
    // when shrunk past minimum.
    const MIN = 8;
    if (newW < MIN) {
      if (corner === "nw" || corner === "sw") {
        newX = origRect.x + origRect.w - MIN;
      }
      newW = MIN;
    }
    if (newH < MIN) {
      if (corner === "nw" || corner === "ne") {
        newY = origRect.y + origRect.h - MIN;
      }
      newH = MIN;
    }
    // Page-bounds clamp.
    if (newX < 0) {
      newW += newX;
      newX = 0;
    }
    if (newY < 0) {
      newH += newY;
      newY = 0;
    }
    if (newX + newW > pageRender.pxWidth) {
      newW = pageRender.pxWidth - newX;
    }
    if (newY + newH > pageRender.pxHeight) {
      newH = pageRender.pxHeight - newY;
    }
    setState((s) => {
      if (index < 0 || index >= s.saved.length) return s;
      const next = [...s.saved];
      next[index] = {
        ...next[index],
        rect: { x: newX, y: newY, w: newW, h: newH },
      };
      return { ...s, saved: next };
    });
  };

  // Resize handle pointer-down. Snapshot the original rect so all
  // subsequent move math is absolute (delta from origin) rather than
  // incremental — incremental would drift due to clamping.
  const onResizeHandlePointerDown = (
    e: React.PointerEvent,
    index: number,
    corner: ResizeCorner,
  ) => {
    if (busy) return;
    e.stopPropagation();
    const { x, y } = pointerToPx(e);
    const target = state.saved[index];
    if (!target) return;
    resizingRef.current = {
      index,
      corner,
      originX: x,
      originY: y,
      origRect: { ...target.rect },
    };
    setResizingIndex(index);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onResizeHandlePointerMove = (e: React.PointerEvent) => {
    if (!resizingRef.current) return;
    applyResize(e);
  };

  const onResizeHandlePointerUp = (e: React.PointerEvent) => {
    if (!resizingRef.current) return;
    resizingRef.current = null;
    setResizingIndex(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
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
        touchAction: "pinch-zoom",
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
      {/* Saved links — visible blue rects with URL labels.
          2026-04-28 (#178): bumped fill opacity from 12% → 22% +
          added a 4px hatch inset so the rect reads against busy
          backgrounds (forms, scanned pages). Original 12% was
          effectively invisible on cream/red form backgrounds. The
          URL label sits in the top-left of the rect so users can
          eyeball-verify each saved link's destination without
          consulting the side panel. */}
      {state.saved.map((s, i) => {
        const left = (s.rect.x / pageRender.pxWidth) * 100;
        const top = (s.rect.y / pageRender.pxHeight) * 100;
        const width = (s.rect.w / pageRender.pxWidth) * 100;
        const height = (s.rect.h / pageRender.pxHeight) * 100;
        const isMoving = movingIndex === i;
        const isResizing = resizingIndex === i;
        const isActive = isMoving || isResizing;
        // 4 corners with their CSS positioning offsets and resize cursors.
        // top: -12 / left: -12 etc. centers the 24×24 hit area on the
        // rect corner; the visible 10×10 indicator inside the handle
        // is centered on the same point. NW+SE share nwse-resize
        // cursor (diagonal one way), NE+SW share nesw-resize.
        const corners: Array<{
          corner: ResizeCorner;
          style: React.CSSProperties;
          cursor: string;
        }> = [
          { corner: "nw", style: { top: -12, left: -12 }, cursor: "nwse-resize" },
          { corner: "ne", style: { top: -12, right: -12 }, cursor: "nesw-resize" },
          { corner: "sw", style: { bottom: -12, left: -12 }, cursor: "nesw-resize" },
          { corner: "se", style: { bottom: -12, right: -12 }, cursor: "nwse-resize" },
        ];
        return (
          <div
            key={i}
            // 2026-04-28 (#180): saved rects are draggable. pointerEvents:
            // auto + onPointerDown wires up the move; the overlay's parent
            // pointerdown is stopPropagation'd so it doesn't kick off a
            // new draw on top of the rect.
            // 2026-04-28 (#181): rects are also resizable via 4 corner
            // handles rendered inside this div. Removed overflow:hidden
            // so the handles (which extend 12px outside the rect) stay
            // visible at any rect position. The URL chip retains its
            // own overflow:hidden + textOverflow:ellipsis so long URLs
            // still truncate cleanly.
            onPointerDown={(e) => onSavedRectPointerDown(e, i)}
            onPointerMove={onSavedRectPointerMove}
            onPointerUp={onSavedRectPointerUp}
            onPointerCancel={onSavedRectPointerUp}
            role="button"
            tabIndex={busy ? -1 : 0}
            aria-label={`Hyperlink to ${s.url} — drag to reposition, drag corner handles to resize`}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              background: isActive
                ? "rgba(29, 78, 216, 0.34)"
                : "rgba(29, 78, 216, 0.22)",
              border: "2px solid rgb(29, 78, 216)",
              boxShadow: isActive
                ? "0 4px 12px rgba(29, 78, 216, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.4)"
                : "inset 0 0 0 1px rgba(255, 255, 255, 0.4)",
              pointerEvents: busy ? "none" : "auto",
              cursor: busy
                ? "default"
                : isMoving
                  ? "grabbing"
                  : isResizing
                    ? "default"
                    : "move",
              touchAction: "pinch-zoom",
              userSelect: "none",
              transition: isActive ? "none" : "box-shadow 0.15s ease",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                background: "rgb(29, 78, 216)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 500,
                padding: "2px 6px",
                borderBottomRightRadius: 4,
                fontFamily: "var(--mono, monospace)",
                whiteSpace: "nowrap",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                pointerEvents: "none",
              }}
            >
              {s.url}
            </span>
            {/* Corner resize handles. Rendered AFTER the URL chip so
                they stack on top in the small case where the chip
                covers the corner area. Each handle is a 24×24 hit
                area with a 10×10 visible indicator centered on the
                corner — touch-friendly and visible without being
                visually heavy. */}
            {!busy &&
              corners.map(({ corner, style, cursor }) => (
                <button
                  key={corner}
                  type="button"
                  onPointerDown={(e) =>
                    onResizeHandlePointerDown(e, i, corner)
                  }
                  onPointerMove={onResizeHandlePointerMove}
                  onPointerUp={onResizeHandlePointerUp}
                  onPointerCancel={onResizeHandlePointerUp}
                  aria-label={`Resize ${corner.toUpperCase()} corner`}
                  style={{
                    position: "absolute",
                    ...style,
                    width: 24,
                    height: 24,
                    padding: 0,
                    background: "transparent",
                    border: "none",
                    cursor,
                    pointerEvents: "auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    touchAction: "pinch-zoom",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: "#fff",
                      border: "2px solid rgb(29, 78, 216)",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.25)",
                    }}
                  />
                </button>
              ))}
          </div>
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
