"use client";

// components/tools/useFirstPagePreview.ts
//
// Tiny hook that renders page 1 of a PDF File once and exposes the
// resulting JPEG plus pt+px dimensions. Used by config-driven runner
// tools (Stamp, Page Numbers, etc) to show a live WYSIWYG preview as
// the user tweaks position / opacity / font-size — without porting
// the whole tool to PageEditorTool.
//
// Why not just reuse PageEditorTool: PageEditorTool is an interactive
// editor (click-to-place / drag-rect / pen) with state persistence.
// Stamp + Page Numbers don't need that — their config is global and
// applies doc-wide. They just want a visual confirmation, not an
// editor surface. This hook is the minimal lift to give them one.
//
// M25 (#193, 2026-04-29): module-level LRU cache keyed by a quick
// content-sample hash (first 1KB + last 1KB + size + scale). Two
// scenarios where this saves a 50–200ms PDFium render:
//   1. User navigates Highlight → Redact via the M9 handoff. Same
//      file, both tools render page 1 — second one hits cache.
//   2. User reaches the success card, clicks Reset, drops the same
//      file again to redo a config tweak. Cache hit.
// The cache stores the rendered JPEG bytes (~100–500KB at scale=1.5,
// much smaller than the source PDF) so cache hits build a fresh
// object URL from cached bytes — no rendering required. LRU bounded
// at 4 entries to cap memory at ~2MB max.

import { useEffect, useRef, useState } from "react";

// ──────────────────────────────────────────────────────────────────
// Sample hash + LRU cache (module-level — shared across all hook
// instances and across Next.js client-side route changes).
// ──────────────────────────────────────────────────────────────────

interface CachedRender {
  bytes: Uint8Array;
  pxWidth: number;
  pxHeight: number;
  pageCount: number;
}

const CACHE_MAX = 4;
const cache = new Map<string, CachedRender>();

/**
 * Compute a quick fingerprint of the PDF bytes. Samples the head and
 * tail (1KB each) and combines with the byte length. NOT a
 * cryptographic hash — collision-prone in adversarial settings, fine
 * for cache-key purposes where the only consequence of a collision
 * is showing a wrong preview that the user immediately notices.
 *
 * The byte length alone catches the common case (different files
 * almost always have different sizes); the head + tail samples catch
 * "two truncated copies of the same source" and similar near-misses.
 */
function sampleHash(bytes: Uint8Array, scale: number): string {
  const SAMPLE = 1024;
  const head = bytes.subarray(0, Math.min(SAMPLE, bytes.length));
  const tail = bytes.subarray(Math.max(0, bytes.length - SAMPLE));
  // Cheap mix: walk each sample as 32-bit words, fold into an int.
  let h = 0x811c9dc5; // FNV-1a basis
  for (let i = 0; i < head.length; i++) {
    h ^= head[i]!;
    h = Math.imul(h, 0x01000193);
  }
  for (let i = 0; i < tail.length; i++) {
    h ^= tail[i]!;
    h = Math.imul(h, 0x01000193);
  }
  // Include length and scale so different scales / different files of
  // the same length don't collide trivially.
  return `${bytes.length}:${scale}:${(h >>> 0).toString(16)}`;
}

/** LRU touch: re-insert to make this the most-recently-used entry. */
function lruTouch(key: string, value: CachedRender) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) {
    // Map iteration is insertion-order, so the first entry is the LRU.
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
}

export interface FirstPagePreview {
  url: string;
  pxWidth: number;
  pxHeight: number;
  ptWidth: number;
  ptHeight: number;
  renderScale: number;
  pageCount: number;
}

interface State {
  preview: FirstPagePreview | null;
  rendering: boolean;
  error: string | null;
}

/**
 * Renders page 1 of the supplied File (Uint8Array form) and returns
 * the preview metadata. Re-renders if the file ref changes; revokes
 * the prior object URL on unmount or new file.
 *
 * Pass `null` to clear (e.g. on reset).
 */
export function useFirstPagePreview(
  bytes: Uint8Array | null,
  renderScale = 1.5,
): State {
  const [state, setState] = useState<State>({
    preview: null,
    rendering: false,
    error: null,
  });
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!bytes) {
      // Cleanup the previous preview's object URL.
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = null;
      }
      setState({ preview: null, rendering: false, error: null });
      return;
    }

    // M25 (#193): cache check. If we've already rendered these bytes
    // at this scale, build a fresh URL from cached JPEG bytes and skip
    // the PDFium spin entirely.
    const key = sampleHash(bytes, renderScale);
    const cached = cache.get(key);
    if (cached) {
      const blob = new Blob([cached.bytes], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = url;
      lruTouch(key, cached);
      setState({
        preview: {
          url,
          pxWidth: cached.pxWidth,
          pxHeight: cached.pxHeight,
          ptWidth: cached.pxWidth / renderScale,
          ptHeight: cached.pxHeight / renderScale,
          renderScale,
          pageCount: cached.pageCount,
        },
        rendering: false,
        error: null,
      });
      return () => {
        cancelled = true;
      };
    }

    setState((s) => ({ ...s, rendering: true, error: null }));

    (async () => {
      try {
        const { withPdfDocument } = await import("@/lib/pdf/library");
        const pageCount = await withPdfDocument(bytes, async (doc) =>
          doc.getPageCount(),
        );
        if (pageCount === 0) {
          throw new Error("This PDF has no pages.");
        }
        const { renderPdfPage } = await import("@/lib/pdf/ops/rasterize-page");
        const rendered = await renderPdfPage(bytes, {
          pageIndex: 0,
          format: "jpeg",
          scale: renderScale,
          quality: 0.85,
        });
        if (cancelled) return;
        const blob = new Blob([rendered.bytes], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        // Revoke prior URL after we've successfully built the new one
        // (so the <img> never points at a freshly-revoked URL).
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = url;
        // M25: stash in the LRU cache for future hits.
        lruTouch(key, {
          bytes: rendered.bytes,
          pxWidth: rendered.width,
          pxHeight: rendered.height,
          pageCount,
        });
        setState({
          preview: {
            url,
            pxWidth: rendered.width,
            pxHeight: rendered.height,
            ptWidth: rendered.width / renderScale,
            ptHeight: rendered.height / renderScale,
            renderScale,
            pageCount,
          },
          rendering: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          preview: null,
          rendering: false,
          error: err instanceof Error ? err.message : "Could not render preview.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes, renderScale]);

  // Final cleanup on unmount.
  useEffect(() => {
    return () => {
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = null;
      }
    };
  }, []);

  return state;
}
