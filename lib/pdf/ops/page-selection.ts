// lib/pdf/ops/page-selection.ts
//
// Tier 2 (2026-04-27): the page-selection ops behind the Extract Pages
// and Delete Pages tools. Both pivot on the same primitive — copy a
// subset of pages into a fresh PDF — and live in the same file because
// they are conceptually inverse (extract = keep selected; delete =
// keep everything except selected).
//
// Shared infrastructure: copyPagesIntoNewDoc from pdf-lib-helpers.

import { copyPagesIntoNewDoc, loadPdf } from "./pdf-lib-helpers";

export interface PageSelectionResult {
  bytes: Uint8Array;
  /** Number of pages in the OUTPUT PDF. */
  pageCount: number;
}

/**
 * Extract a subset of pages into a new PDF. Pages appear in the output
 * in the order specified by the input array — this matters for the
 * "build a 3-page summary from pages 7, 2, 14" workflow where the
 * selection order is meaningful.
 *
 * Defensively dedupes (the runner shouldn't pass dups, but the op is
 * defensive). Throws on empty selection or out-of-range indices.
 */
export async function extractPages(
  bytes: Uint8Array,
  indices: number[],
): Promise<PageSelectionResult> {
  if (indices.length === 0) {
    throw new Error("Pick at least one page to extract.");
  }
  const src = await loadPdf(bytes);
  const total = src.getPageCount();
  if (total === 0) {
    throw new Error("This PDF has no pages.");
  }
  const seen = new Set<number>();
  const ordered: number[] = [];
  for (const i of indices) {
    if (i < 0 || i >= total) {
      throw new Error(
        `Page ${i + 1} is outside the document (1-${total}).`,
      );
    }
    if (seen.has(i)) continue;
    seen.add(i);
    ordered.push(i);
  }
  const out = await copyPagesIntoNewDoc(src, ordered);
  const bytesOut = await out.save({ useObjectStreams: true });
  return { bytes: bytesOut, pageCount: out.getPageCount() };
}

/**
 * Reorder every page of a PDF into a new sequence. The newOrder array
 * must contain each 0-based source index exactly once, with length
 * equal to the source page count.
 *
 *   newOrder = [3, 0, 2, 1] on a 4-page PDF → output pages: 4, 1, 3, 2
 *
 * Lossless re-save: pdf-lib copies each page's content stream into
 * the new document in the requested order. Embedded fonts, images,
 * and annotations on each page survive. Cross-page bookmarks and
 * links that depended on the old page order will dangle (see FAQ).
 */
export async function reorderPages(
  bytes: Uint8Array,
  newOrder: number[],
): Promise<PageSelectionResult> {
  const src = await loadPdf(bytes);
  const total = src.getPageCount();
  if (total === 0) {
    throw new Error("This PDF has no pages.");
  }
  if (newOrder.length !== total) {
    throw new Error(
      `New order length (${newOrder.length}) doesn&rsquo;t match page count (${total}).`,
    );
  }
  // Verify the new order is a permutation: every index 0..total-1
  // appears exactly once. Anything else means a UI bug somewhere.
  const seen = new Set<number>();
  for (const i of newOrder) {
    if (!Number.isInteger(i) || i < 0 || i >= total) {
      throw new Error(`Page index ${i} is outside 0-${total - 1}.`);
    }
    if (seen.has(i)) {
      throw new Error(`Page ${i + 1} appears twice in the new order.`);
    }
    seen.add(i);
  }
  if (seen.size !== total) {
    throw new Error("New order is missing some pages.");
  }
  const out = await copyPagesIntoNewDoc(src, newOrder);
  const bytesOut = await out.save({ useObjectStreams: true });
  return { bytes: bytesOut, pageCount: out.getPageCount() };
}

/**
 * Delete (drop) a set of pages from a PDF, keeping everything else
 * in original order. Inverse of extractPages.
 *
 * Refuses to delete every page (the result would be invalid). Caller
 * should also enforce this in the UI for a friendlier error.
 */
export async function deletePages(
  bytes: Uint8Array,
  indicesToDelete: number[],
): Promise<PageSelectionResult> {
  const src = await loadPdf(bytes);
  const total = src.getPageCount();
  if (total === 0) {
    throw new Error("This PDF has no pages.");
  }
  const deleteSet = new Set<number>();
  for (const i of indicesToDelete) {
    if (i < 0 || i >= total) continue;
    deleteSet.add(i);
  }
  if (deleteSet.size === 0) {
    throw new Error("Pick at least one page to delete.");
  }
  if (deleteSet.size === total) {
    throw new Error(
      "Can&rsquo;t delete every page — the output would be empty.",
    );
  }
  const keep: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!deleteSet.has(i)) keep.push(i);
  }
  const out = await copyPagesIntoNewDoc(src, keep);
  const bytesOut = await out.save({ useObjectStreams: true });
  return { bytes: bytesOut, pageCount: out.getPageCount() };
}
