"use client";

// components/tools/usePdfThumbnails.ts
//
// 2026-04-28 (Task #172): shared thumbnail-rendering hook extracted
// from PageGridTool / PdfSortPagesTool / PdfSplitTool. All three did
// the same thing: import rasterizePdf, call with format=jpeg
// scale=0.5 quality=0.7, map results to {pageNumber, thumbnailUrl,
// width, height}, and revoke the object URLs on unmount. Three
// near-identical 25-line blocks → one 50-line hook → consumers shed
// boilerplate AND get consistent revoke-on-reset behavior for free.
//
// Scope: "all pages of ONE PDF as thumbnail array". NOT used by
// PdfMergeTool (that renders one page each across MANY files,
// different shape). PageEditorTool uses rasterize-page.ts
// (single-page on-demand) and doesn't need this hook.
//
// Why a hook, not a component: thumbnails are state owned by the
// consumer (PageGridTool needs to layer selection/drag/click
// handlers on top), so we can't push the entire UI into a
// component. A hook gives consumers the rendering + URL lifecycle
// while leaving them free to compose their own thumbnail UI.

import { useCallback, useEffect, useRef, useState } from "react";

export interface PdfThumbnail {
  /** 1-based page number — matches what users see in the PDF. */
  pageNumber: number;
  /** Object URL for the rendered JPEG. Revoke on unmount/reset. */
  thumbnailUrl: string;
  /** Rendered image dimensions in CSS pixels. */
  width: number;
  height: number;
}

export interface UsePdfThumbnailsOptions {
  /** Render scale relative to PDF natural size. Default 0.5. */
  scale?: number;
  /** JPEG quality 0–1. Default 0.7. */
  quality?: number;
}

export interface UsePdfThumbnailsResult {
  /** Most recent thumbnail array. Empty before render() resolves. */
  thumbnails: PdfThumbnail[];
  /** True between render() invocation and resolution. */
  rendering: boolean;
  /** Streaming progress — useful for "Rendering page X of N" UIs. */
  progress: { done: number; total: number };
  /** Error message from the last render attempt, or null. */
  error: string | null;
  /**
   * Render thumbnails for the given PDF bytes. Resolves with the
   * array; also pushes into the hook's `thumbnails` state. Throws on
   * parse failure (consumer can catch + show an error UI).
   */
  render: (bytes: Uint8Array) => Promise<PdfThumbnail[]>;
  /**
   * Clear thumbnails and revoke all object URLs. Call this on file
   * change or when the consumer resets its own state.
   */
  reset: () => void;
}

export function usePdfThumbnails(
  opts: UsePdfThumbnailsOptions = {},
): UsePdfThumbnailsResult {
  const scale = opts.scale ?? 0.5;
  const quality = opts.quality ?? 0.7;

  const [thumbnails, setThumbnails] = useState<PdfThumbnail[]>([]);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  // Mirror the latest thumbnails array in a ref so the unmount
  // cleanup effect can revoke without taking `thumbnails` as a
  // dep (which would re-fire the cleanup on every render).
  const thumbsRef = useRef<PdfThumbnail[]>([]);
  thumbsRef.current = thumbnails;

  useEffect(() => {
    return () => {
      thumbsRef.current.forEach((t) => URL.revokeObjectURL(t.thumbnailUrl));
    };
  }, []);

  const reset = useCallback(() => {
    thumbsRef.current.forEach((t) => URL.revokeObjectURL(t.thumbnailUrl));
    setThumbnails([]);
    setProgress({ done: 0, total: 0 });
    setError(null);
  }, []);

  const render = useCallback(
    async (bytes: Uint8Array): Promise<PdfThumbnail[]> => {
      // Revoke prior batch BEFORE replacing — otherwise blob URLs
      // pile up across multiple file drops.
      thumbsRef.current.forEach((t) => URL.revokeObjectURL(t.thumbnailUrl));
      setThumbnails([]);
      setError(null);
      setRendering(true);
      setProgress({ done: 0, total: 0 });

      // Live-streaming buffer. We push to state as each page lands so
      // huge PDFs paint thumbnails progressively instead of staring
      // at a spinner for 40 seconds. Final return value mirrors this
      // buffer so consumers that await render() get the full array
      // (Sort needs the .map((t,i) => ...sourceIndex) at the end).
      const collected: PdfThumbnail[] = [];

      try {
        const { rasterizePdf } = await import("@/lib/pdf/ops/rasterize");
        await rasterizePdf(bytes, {
          format: "jpeg",
          scale,
          quality,
          onProgress: (done, total) => setProgress({ done, total }),
          onPage: (page) => {
            const thumb: PdfThumbnail = {
              pageNumber: page.pageNumber,
              thumbnailUrl: URL.createObjectURL(
                new Blob([page.bytes], { type: "image/jpeg" }),
              ),
              width: page.width,
              height: page.height,
            };
            collected.push(thumb);
            // Functional update so back-to-back onPage calls compose
            // (otherwise stale closure on `thumbnails` would clobber).
            // We pass a fresh array so React detects the change — the
            // collected buffer is mutated in place by design.
            setThumbnails([...collected]);
          },
        });
        return collected;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not render thumbnails.";
        setError(msg);
        throw err;
      } finally {
        setRendering(false);
      }
    },
    [scale, quality],
  );

  return { thumbnails, rendering, progress, error, render, reset };
}
