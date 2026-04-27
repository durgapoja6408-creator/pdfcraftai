// lib/pdf/ops/search-text.ts
//
// Build 2 Wave 3 (2026-04-27): full-text search across a PDF using
// the existing extractPagesText() op. No new PDFium calls — this is
// pure JS string matching over the per-page text we already
// extract.
//
// Returns matches with surrounding context so the UI can highlight
// the match and show enough surrounding words for the result to
// make sense without opening the source PDF.

"use client";

import { extractPagesText } from "./text-export";

export interface SearchMatch {
  /** 1-based page number where the match was found. */
  pageNumber: number;
  /** Char index of the match start within the page text. */
  startInPage: number;
  /** Match string exactly as it appeared in the PDF. */
  match: string;
  /** Context window: ~50 chars before the match. */
  beforeContext: string;
  /** Context window: ~50 chars after the match. */
  afterContext: string;
}

export interface SearchOptions {
  /** Case-sensitive matching. Default false (case-insensitive). */
  caseSensitive?: boolean;
  /** Whole-word matching only (\bword\b). Default false. */
  wholeWord?: boolean;
  /** Cap the total number of matches returned. Default 200 — beyond this
   *  the UI gets unwieldy and the user should refine their query. */
  maxMatches?: number;
}

export interface SearchResult {
  matches: SearchMatch[];
  /** Number of pages with at least one match. */
  pagesWithMatches: number;
  /** Total pages searched. */
  totalPages: number;
  /** True if we hit the maxMatches cap and stopped early. */
  truncated: boolean;
}

const CONTEXT_RADIUS = 50;

/**
 * Search for a query string across every page of the PDF.
 *
 * The search is sequential over pages but yields between pages so
 * very long PDFs stay responsive. Empty query returns no matches.
 */
export async function searchPdfText(
  bytes: Uint8Array,
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const { caseSensitive = false, wholeWord = false, maxMatches = 200 } = options;
  const matches: SearchMatch[] = [];
  const trimmed = query.trim();
  if (!trimmed) {
    return { matches, pagesWithMatches: 0, totalPages: 0, truncated: false };
  }

  const pages = await extractPagesText(bytes);
  const totalPages = pages.length;
  const pagesWith = new Set<number>();

  // Build the regex once. Escape special chars in the query so the
  // user's input is treated as a literal string, not a pattern.
  const escapedQuery = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = wholeWord ? `\\b${escapedQuery}\\b` : escapedQuery;
  const flags = caseSensitive ? "g" : "gi";
  let truncated = false;

  outer: for (let i = 0; i < pages.length; i++) {
    const text = pages[i];
    if (!text) continue;
    // New regex per page so lastIndex doesn't carry across.
    const re = new RegExp(pattern, flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const matchStr = m[0];
      // Empty match (regex bug guard) — advance to avoid infinite loop.
      if (matchStr.length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const before = text
        .slice(Math.max(0, start - CONTEXT_RADIUS), start)
        .replace(/\s+/g, " ");
      const after = text
        .slice(start + matchStr.length, start + matchStr.length + CONTEXT_RADIUS)
        .replace(/\s+/g, " ");
      matches.push({
        pageNumber: i + 1,
        startInPage: start,
        match: matchStr,
        beforeContext: before,
        afterContext: after,
      });
      pagesWith.add(i + 1);
      if (matches.length >= maxMatches) {
        truncated = true;
        break outer;
      }
    }
  }

  return {
    matches,
    pagesWithMatches: pagesWith.size,
    totalPages,
    truncated,
  };
}
