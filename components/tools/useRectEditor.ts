"use client";

// components/tools/useRectEditor.ts
//
// G8 (#193, 2026-04-28): shared hook for the rect-editing pattern
// used across the visual editors (Highlight, Redact, Add Hyperlinks
// today; Add Text Box, Sign, Crop in a follow-up).
//
// Each of those tools today carries ~250 LOC of near-identical
// movingRef / resizingRef / applyMove / applyResize / hitTest plumbing.
// This hook owns that plumbing once. Consumers pass:
//   - the array of rects (from their own state)
//   - a setter that accepts (rects[]) → newRects[]
//   - the page bounds (pxWidth, pxHeight) to clamp deltas
//
// Returns a small set of pointer handlers + visual state flags
// that the consumer wires onto its rect <div>s and resize handles.
//
// EXPLICITLY NOT INCLUDED (yet) in this initial extraction:
//   - The DRAW behavior (creating a new rect by drag). That stays
//     in the consumer because each tool wants different validation
//     (Highlight allows zero-area, Redact rejects them, Add Hyperlinks
//     requires a URL prompt before the rect is "real").
//   - The DELETE chip. Each tool already has a different visual
//     treatment (small X for Highlight/Redact, list-panel for Add
//     Hyperlinks). Not worth abstracting.
//
// THE HOOK OWNS:
//   - move (translate the whole rect by absolute delta from
//     pointerdown's "where you grabbed it" point)
//   - resize (NW/NE/SW/SE corner handles, with min size + page bounds
//     clamp + corner-anchor logic when shrinking)
//
// Aspirationally: also extract hit-testing, but the three current
// consumers don't need it (they use the rect element's own
// pointerdown to start a move/resize, not a "click on canvas to
// hit-test against existing rects" flow). When the Crop / Add Text
// Box / Sign tools land in v2 (G5), they'll need it — at which
// point this hook gains a `hitTest(p, slack)` helper.
//
// USAGE EXAMPLE (migrating PdfHighlightTool / PdfRedactTool /
// PdfAddLinksTool — see docs/NEXT_SESSION.md for the step-by-step
// recipe):
//
//   import { useRectEditor } from "./useRectEditor";
//
//   function MyEditor({ pageRender, state, setState }) {
//     // Wrap the rect-array setter so the hook can call it cleanly.
//     const editor = useRectEditor(
//       state.rects,
//       (rects) => setState((s) => ({ ...s, rects })),
//       { pxWidth: pageRender.pxWidth, pxHeight: pageRender.pxHeight },
//     );
//
//     return (
//       <div data-rect-overlay="true" style={{ position: "relative" }}>
//         <img src={pageRender.url} />
//         {state.rects.map((r, i) => (
//           <div key={i}
//             onPointerDown={(e) => editor.onRectPointerDown(e, i)}
//             onPointerMove={editor.onRectPointerMove}
//             onPointerUp={editor.onRectPointerUp}
//             onPointerCancel={editor.onRectPointerUp}
//             style={{
//               position: "absolute",
//               left: r.x, top: r.y, width: r.w, height: r.h,
//               outline: editor.movingIndex === i ? "2px solid blue" : "1px solid gray",
//               cursor: editor.movingIndex === i ? "grabbing" : "grab",
//             }}
//           >
//             {(["nw","ne","sw","se"] as const).map((corner) => (
//               <div key={corner}
//                 onPointerDown={(e) => editor.onResizeHandlePointerDown(e, i, corner)}
//                 onPointerMove={editor.onResizeHandlePointerMove}
//                 onPointerUp={editor.onResizeHandlePointerUp}
//                 onPointerCancel={editor.onResizeHandlePointerUp}
//                 style={{
//                   position: "absolute",
//                   width: 24, height: 24,
//                   ...(corner === "nw" && { top: -12, left: -12, cursor: "nwse-resize" }),
//                   ...(corner === "ne" && { top: -12, right: -12, cursor: "nesw-resize" }),
//                   ...(corner === "sw" && { bottom: -12, left: -12, cursor: "nesw-resize" }),
//                   ...(corner === "se" && { bottom: -12, right: -12, cursor: "nwse-resize" }),
//                 }}
//               />
//             ))}
//           </div>
//         ))}
//       </div>
//     );
//   }
//
// CRITICAL: the OUTER overlay wrapper MUST have `data-rect-overlay="true"`.
// The hook walks up from event.currentTarget to find the overlay's
// bounding rect for pixel-coord conversion. Without that attribute,
// move/resize will silently do nothing.

import { useRef, useState } from "react";

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ResizeCorner = "nw" | "ne" | "sw" | "se";

export interface RectEditorBounds {
  /** Page width in image-pixel coordinates (rendered scale). */
  pxWidth: number;
  /** Page height in image-pixel coordinates (rendered scale). */
  pxHeight: number;
  /** Min rect size in pixels. Default 8. */
  minSize?: number;
}

export interface UseRectEditorReturn {
  /** True while a move is in progress, indexed at the moving rect. */
  movingIndex: number | null;
  /** True while a resize is in progress, indexed at the resizing rect. */
  resizingIndex: number | null;
  /**
   * Pointer handlers for the rect's outer container. Wire to the
   * rect <div> that's drawn over the page preview:
   *   onPointerDown={(e) => onRectPointerDown(e, rectIndex)}
   *   onPointerMove={onRectPointerMove}
   *   onPointerUp={onRectPointerUp}
   *   onPointerCancel={onRectPointerUp}
   */
  onRectPointerDown: (e: React.PointerEvent, index: number) => void;
  onRectPointerMove: (e: React.PointerEvent) => void;
  onRectPointerUp: (e: React.PointerEvent) => void;
  /**
   * Pointer handlers for the corner resize handles. Wire to each
   * of the 4 NW/NE/SW/SE handle <div>s inside the rect:
   *   onPointerDown={(e) => onResizeHandlePointerDown(e, rectIndex, "nw")}
   */
  onResizeHandlePointerDown: (
    e: React.PointerEvent,
    index: number,
    corner: ResizeCorner,
  ) => void;
  onResizeHandlePointerMove: (e: React.PointerEvent) => void;
  onResizeHandlePointerUp: (e: React.PointerEvent) => void;
}

/**
 * Compute the click point in PIXEL coords relative to the overlay
 * element. The consumer's overlay should pass its bounding rect via
 * the elem ref OR via the closest("[data-rect-overlay]") query.
 *
 * For now we infer it from the pointerdown's currentTarget — every
 * rect <div> in the visual editors lives directly inside a single
 * overlay container that holds the page preview, so walking up to
 * the parent gets us the right rect.
 */
function clientToOverlayPx(
  e: React.PointerEvent,
  bounds: RectEditorBounds,
  overlayEl: Element | null,
): { x: number; y: number } | null {
  if (!overlayEl) return null;
  const rect = overlayEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const xCss = e.clientX - rect.left;
  const yCss = e.clientY - rect.top;
  return {
    x: (xCss / rect.width) * bounds.pxWidth,
    y: (yCss / rect.height) * bounds.pxHeight,
  };
}

/**
 * Find the closest ancestor element with data-rect-overlay="true".
 * The consumer marks its overlay container with that attribute.
 */
function findOverlay(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest('[data-rect-overlay="true"]');
}

export function useRectEditor<TRect extends PixelRect>(
  rects: TRect[],
  setRects: (next: TRect[]) => void,
  bounds: RectEditorBounds,
): UseRectEditorReturn {
  const minSize = bounds.minSize ?? 8;

  const movingRef = useRef<{
    index: number;
    originX: number;
    originY: number;
    origRect: PixelRect;
  } | null>(null);
  const [movingIndex, setMovingIndex] = useState<number | null>(null);

  const resizingRef = useRef<{
    index: number;
    corner: ResizeCorner;
    originX: number;
    originY: number;
    origRect: PixelRect;
  } | null>(null);
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);

  // ============== MOVE ==============

  const onRectPointerDown = (e: React.PointerEvent, index: number) => {
    if (index < 0 || index >= rects.length) return;
    const overlay = findOverlay(e.currentTarget);
    const p = clientToOverlayPx(e, bounds, overlay);
    if (!p) return;
    const r = rects[index];
    movingRef.current = {
      index,
      originX: p.x,
      originY: p.y,
      origRect: { x: r.x, y: r.y, w: r.w, h: r.h },
    };
    setMovingIndex(index);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore — older browsers / non-capturable target
    }
    e.stopPropagation();
  };

  const onRectPointerMove = (e: React.PointerEvent) => {
    if (!movingRef.current) return;
    const overlay = findOverlay(e.currentTarget);
    const p = clientToOverlayPx(e, bounds, overlay);
    if (!p) return;
    const dx = p.x - movingRef.current.originX;
    const dy = p.y - movingRef.current.originY;
    const orig = movingRef.current.origRect;
    // Clamp delta so the rect stays on-page.
    const clampedDx = Math.max(-orig.x, Math.min(bounds.pxWidth - orig.x - orig.w, dx));
    const clampedDy = Math.max(-orig.y, Math.min(bounds.pxHeight - orig.y - orig.h, dy));
    const idx = movingRef.current.index;
    const next = rects.slice();
    next[idx] = {
      ...next[idx],
      x: orig.x + clampedDx,
      y: orig.y + clampedDy,
    };
    setRects(next);
  };

  const onRectPointerUp = (e: React.PointerEvent) => {
    if (!movingRef.current) return;
    movingRef.current = null;
    setMovingIndex(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // ============== RESIZE ==============

  const onResizeHandlePointerDown = (
    e: React.PointerEvent,
    index: number,
    corner: ResizeCorner,
  ) => {
    if (index < 0 || index >= rects.length) return;
    const overlay = findOverlay(e.currentTarget);
    const p = clientToOverlayPx(e, bounds, overlay);
    if (!p) return;
    const r = rects[index];
    resizingRef.current = {
      index,
      corner,
      originX: p.x,
      originY: p.y,
      origRect: { x: r.x, y: r.y, w: r.w, h: r.h },
    };
    setResizingIndex(index);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    e.stopPropagation();
  };

  const onResizeHandlePointerMove = (e: React.PointerEvent) => {
    if (!resizingRef.current) return;
    const overlay = findOverlay(e.currentTarget);
    const p = clientToOverlayPx(e, bounds, overlay);
    if (!p) return;
    const orig = resizingRef.current.origRect;
    const corner = resizingRef.current.corner;
    const dx = p.x - resizingRef.current.originX;
    const dy = p.y - resizingRef.current.originY;
    let nx = orig.x;
    let ny = orig.y;
    let nw = orig.w;
    let nh = orig.h;
    // Each corner moves either the rect's anchor (NW/NE/SW corners
    // change x and/or y) or just the size (SE corner only). Logic:
    //   NW: x += dx, y += dy, w -= dx, h -= dy
    //   NE: y += dy, w += dx, h -= dy
    //   SW: x += dx, w -= dx, h += dy
    //   SE: w += dx, h += dy
    if (corner === "nw" || corner === "sw") {
      nx = orig.x + dx;
      nw = orig.w - dx;
    } else {
      nw = orig.w + dx;
    }
    if (corner === "nw" || corner === "ne") {
      ny = orig.y + dy;
      nh = orig.h - dy;
    } else {
      nh = orig.h + dy;
    }
    // Min-size clamp: if the new size would go below minSize, snap
    // to minSize and hold the opposite anchor in place. Keeps the
    // rect interactable even when the user drags way past the
    // minimum.
    if (nw < minSize) {
      if (corner === "nw" || corner === "sw") {
        nx = orig.x + orig.w - minSize;
      }
      nw = minSize;
    }
    if (nh < minSize) {
      if (corner === "nw" || corner === "ne") {
        ny = orig.y + orig.h - minSize;
      }
      nh = minSize;
    }
    // Page-bounds clamp.
    if (nx < 0) {
      nw += nx;
      nx = 0;
    }
    if (ny < 0) {
      nh += ny;
      ny = 0;
    }
    if (nx + nw > bounds.pxWidth) nw = bounds.pxWidth - nx;
    if (ny + nh > bounds.pxHeight) nh = bounds.pxHeight - ny;
    // Final min-size guard after page-bounds clamp.
    if (nw < minSize || nh < minSize) return;
    const idx = resizingRef.current.index;
    const next = rects.slice();
    next[idx] = { ...next[idx], x: nx, y: ny, w: nw, h: nh };
    setRects(next);
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

  return {
    movingIndex,
    resizingIndex,
    onRectPointerDown,
    onRectPointerMove,
    onRectPointerUp,
    onResizeHandlePointerDown,
    onResizeHandlePointerMove,
    onResizeHandlePointerUp,
  };
}
