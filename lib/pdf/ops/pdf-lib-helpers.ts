// lib/pdf/ops/pdf-lib-helpers.ts
//
// Build 2 Wave 9 (2026-04-27): shared helpers for the pdf-lib-backed
// writable tools (merge, split, rotate, encrypt, unlock). Centralizes
// the common load-bytes / build-output flow so each op file stays
// focused on the actual transformation.
//
// Pattern matches standards-helpers.ts — every helper is defensive,
// returns structured results rather than throwing where possible, and
// has zero React / Next coupling so the ops layer can be reused by
// any future UI surface.

import { PDFDocument, type PDFEmbeddedPage } from "pdf-lib";

export interface LoadOptions {
  /** Pass `true` if the caller expects the file to be encrypted. */
  ignoreEncryption?: boolean;
}

/**
 * Load a PDF from raw bytes with the typical defaults for client-side
 * tools. By default we DO NOT update existing metadata (keeps the
 * output byte-for-byte closer to the original) and we surface
 * encryption as a thrown EncryptedPDFError so callers can re-prompt
 * for a password.
 */
export async function loadPdf(
  bytes: Uint8Array | ArrayBuffer,
  opts: LoadOptions = {},
): Promise<PDFDocument> {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return PDFDocument.load(buf, {
    ignoreEncryption: !!opts.ignoreEncryption,
    updateMetadata: false,
  });
}

/**
 * Strip the `.pdf` extension from a filename, replacing trailing
 * whitespace and reserved Windows characters that can break downloads.
 *
 *  ` Annual Report.pdf ` → "Annual_Report"
 *  "report:final.PDF"    → "report_final"
 */
export function safeBaseName(fileName: string): string {
  return (
    fileName
      .trim()
      .replace(/\.pdf$/i, "")
      // replace reserved chars + whitespace runs with single underscore
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "document"
  );
}

/**
 * Build a Blob + object URL pair the calling component can hand to
 * `<a download>`. Caller is responsible for revoking the URL after
 * the click — wrap in try/finally with `URL.revokeObjectURL(url)`.
 */
export function pdfBytesToDownload(bytes: Uint8Array): {
  blob: Blob;
  url: string;
} {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  return { blob, url };
}

/**
 * Trigger a browser download for the given bytes. Returns once the
 * click has fired so the caller can update UI immediately.
 *
 * Always revokes the object URL — callers don't need to.
 */
export function triggerPdfDownload(bytes: Uint8Array, fileName: string): void {
  const { url } = pdfBytesToDownload(bytes);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Defer revoke so Safari has a chance to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Parse a 1-based page-range expression into a sorted, de-duplicated
 * array of 0-based page indices.
 *
 *   "1,3,5-7,12" → [0, 2, 4, 5, 6, 11]
 *   "  "          → []  (empty / all whitespace returns empty)
 *   "1-3, 8-"     → throws "Open-ended range"
 *
 * Used by Split + page-pick variants. Caller validates against
 * pageCount and surfaces friendly errors.
 */
export interface ParsedRange {
  /** 0-based page indices, sorted ascending, deduplicated. */
  indices: number[];
  /** True if the user asked for everything (e.g. "all"). */
  all: boolean;
}

export function parsePageRange(
  expr: string,
  pageCount: number,
): ParsedRange {
  const cleaned = expr.trim().toLowerCase();
  if (!cleaned || cleaned === "all" || cleaned === "*") {
    const indices: number[] = [];
    for (let i = 0; i < pageCount; i++) indices.push(i);
    return { indices, all: true };
  }
  const seen = new Set<number>();
  const parts = cleaned.split(/[\s,]+/).filter(Boolean);
  for (const p of parts) {
    if (p.includes("-")) {
      const [a, b] = p.split("-");
      if (!a || !b) {
        throw new Error(`Open-ended range "${p}"`);
      }
      const lo = Number.parseInt(a, 10);
      const hi = Number.parseInt(b, 10);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
        throw new Error(`Bad range "${p}"`);
      }
      if (lo < 1 || hi < 1 || lo > pageCount || hi > pageCount) {
        throw new Error(
          `Range "${p}" is outside 1–${pageCount}`,
        );
      }
      const [from, to] = lo <= hi ? [lo, hi] : [hi, lo];
      for (let i = from; i <= to; i++) seen.add(i - 1);
    } else {
      const n = Number.parseInt(p, 10);
      if (!Number.isFinite(n)) {
        throw new Error(`Not a page number: "${p}"`);
      }
      if (n < 1 || n > pageCount) {
        throw new Error(`Page ${n} is outside 1–${pageCount}`);
      }
      seen.add(n - 1);
    }
  }
  const indices = Array.from(seen).sort((a, b) => a - b);
  return { indices, all: indices.length === pageCount };
}

/**
 * Copy a slice of pages from a source PDF into a new (empty) PDF.
 * Returns the new document — caller calls `.save()` to serialize.
 *
 * Used by Split (per-range) and Merge (per-input) flows.
 */
export async function copyPagesIntoNewDoc(
  src: PDFDocument,
  pageIndices: number[],
): Promise<PDFDocument> {
  const out = await PDFDocument.create();
  // Don't copy across metadata — the output is a derivative.
  const copied = await out.copyPages(src, pageIndices);
  for (const p of copied) out.addPage(p);
  return out;
}

/** Avoid an unused-import warning if a future op needs PDFEmbeddedPage. */
export type { PDFEmbeddedPage };
