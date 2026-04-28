"use client";

// components/tools/useVirtualGrid.ts
//
// Window-scroll-driven virtualization for large auto-fill grids
// (PDF thumbnail tools at 500+ pages). Below VIRTUALIZE_THRESHOLD
// items the hook returns "render everything" so small grids stay
// dirt simple. Above the threshold, only items in the visible row
// range plus an overscan buffer are rendered.
//
// Why window-scroll instead of a custom scroll container: the tool
// pages are single-flow vertical layouts where the BODY scrolls.
// Wrapping the grid in its own scroll container would break the
// natural reading flow and add a nested scrollbar. Window-scroll +
// getBoundingClientRect on the grid container gets us the same
// virtualization payoff without the UX wart.
//
// Sizing strategy: the grid uses CSS auto-fill with a min column
// width. We measure the actual container width via ResizeObserver
// and compute columnsPerRow from `floor((containerWidth + gap) /
// (minColWidth + gap))`. Row height = item width × itemAspectRatio
// + bottomLabelHeight + gap. The container height is set to
// `rowCount * rowHeight - gap` so scroll geometry matches a fully-
// rendered grid.
//
// Output shape lets the consumer slot virtualization in with three
// lines of change:
//   <div style={{ position: "relative", height }}>           ←
//     <div style={{ position: "absolute", top, left:0, right:0 }}> ←
//       {items.slice(start, end).map(...)}                          ←
//     </div>
//   </div>

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * If itemCount falls below this threshold, the hook returns
 * "render all items" — virtualization adds enough complexity that
 * we'd rather skip it for small grids where it doesn't matter.
 *
 * 80 is roughly 4 rows × 20 cols — a desktop user who fills their
 * viewport with thumbnails. Below this, scrolling never reveals
 * new content, so virtualizing buys nothing.
 */
const VIRTUALIZE_THRESHOLD = 80;

/** Rows above + below the visible window we still render. */
const OVERSCAN_ROWS = 2;

export interface VirtualGridOptions {
  /** Total number of items in the grid. */
  itemCount: number;
  /** CSS auto-fill `minmax(<minColWidth>px, 1fr)`. */
  minColWidth: number;
  /** Gap between items in CSS pixels (must match the consumer's `gap`). */
  gap: number;
  /**
   * Aspect ratio used for each thumbnail TILE (e.g. 1.0 for square,
   * page width / page height for variable aspects). When the grid
   * has mixed-aspect items, pass the tallest expected ratio so the
   * row height accommodates the worst case.
   */
  itemAspectRatio: number;
  /**
   * Extra pixels added BELOW the thumbnail (label + footer chip).
   * If a tile renders a "Page N · Selected" footer, count its
   * height + padding here so row height stays accurate.
   */
  itemFooterHeight: number;
}

export interface VirtualGridResult {
  /** True if virtualization is active. False = render all items. */
  virtualized: boolean;
  /** Inclusive start index of items to render. */
  startIndex: number;
  /** Exclusive end index of items to render. */
  endIndex: number;
  /** Total scroll-height in CSS px the wrapper should occupy. */
  totalHeight: number;
  /** CSS top offset for the rendered slice (in CSS px). */
  offsetTop: number;
  /** Computed columns per row given current container width. */
  columnsPerRow: number;
  /** Computed row height in CSS px. */
  rowHeight: number;
  /**
   * Ref to attach to the wrapper element (the one with `position:
   * relative; height: totalHeight`). Used by the hook to measure
   * width via ResizeObserver and document-relative top via
   * getBoundingClientRect.
   */
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
}

export function useVirtualGrid(opts: VirtualGridOptions): VirtualGridResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [viewportH, setViewportH] = useState(
    typeof window === "undefined" ? 800 : window.innerHeight,
  );
  const [containerTop, setContainerTop] = useState(0);

  // Measure the container's width and document-relative top.
  // ResizeObserver covers width; getBoundingClientRect on every
  // scroll tick covers top (cheaper than wiring an IntersectionObserver
  // tree and accurate enough for our 60fps target).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerWidth(rect.width);
      // Document-relative top = current viewport-relative top + scrollY
      setContainerTop(rect.top + window.scrollY);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [opts.itemCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => {
      setScrollY(window.scrollY);
      // Re-measure container top in case layout shifted (e.g. an
      // image above us loaded and pushed us down).
      const el = containerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        setContainerTop(rect.top + window.scrollY);
      }
    };
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return useMemo(() => {
    const { itemCount, minColWidth, gap, itemAspectRatio, itemFooterHeight } =
      opts;

    // Below the threshold, skip all the math — render everything.
    if (itemCount < VIRTUALIZE_THRESHOLD) {
      return {
        virtualized: false,
        startIndex: 0,
        endIndex: itemCount,
        totalHeight: 0,
        offsetTop: 0,
        columnsPerRow: 1,
        rowHeight: 0,
        containerRef,
      };
    }

    // First measurement hasn't happened yet — render the first
    // OVERSCAN window so SSR / initial paint isn't blank.
    if (containerWidth <= 0) {
      return {
        virtualized: true,
        startIndex: 0,
        endIndex: Math.min(itemCount, OVERSCAN_ROWS * 4 * 4), // 4-col × 4-row guess
        totalHeight: 0,
        offsetTop: 0,
        columnsPerRow: 4,
        rowHeight: 240,
        containerRef,
      };
    }

    // Mirror CSS `repeat(auto-fill, minmax(<minColWidth>px, 1fr))`:
    //   columnsPerRow = floor((containerWidth + gap) / (minColWidth + gap))
    const cols = Math.max(
      1,
      Math.floor((containerWidth + gap) / (minColWidth + gap)),
    );
    // Each tile's CSS width:
    //   colW = (containerWidth - (cols - 1) * gap) / cols
    const colW = (containerWidth - (cols - 1) * gap) / cols;
    const tileH = colW * itemAspectRatio + itemFooterHeight;
    const rowH = tileH + gap;

    const rowCount = Math.ceil(itemCount / cols);
    const totalH = rowCount * rowH - gap;

    // Window of visible rows. `viewportTop` and `viewportBottom`
    // are in CONTAINER-relative coordinates (subtract container top
    // from window scrollY).
    const viewportTopInContainer = scrollY - containerTop;
    const viewportBottomInContainer = viewportTopInContainer + viewportH;

    let startRow = Math.floor(viewportTopInContainer / rowH) - OVERSCAN_ROWS;
    let endRow = Math.ceil(viewportBottomInContainer / rowH) + OVERSCAN_ROWS;
    startRow = Math.max(0, startRow);
    endRow = Math.min(rowCount, endRow);

    const startIndex = startRow * cols;
    const endIndex = Math.min(itemCount, endRow * cols);
    const offsetTop = startRow * rowH;

    return {
      virtualized: true,
      startIndex,
      endIndex,
      totalHeight: totalH,
      offsetTop,
      columnsPerRow: cols,
      rowHeight: rowH,
      containerRef,
    };
  }, [
    opts,
    containerWidth,
    scrollY,
    viewportH,
    containerTop,
  ]);
}
