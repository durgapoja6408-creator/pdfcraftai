// lib/pdf/ops/split.ts
//
// Build 2 Wave 9 (2026-04-27): split a PDF into multiple PDFs.
//
// Three modes:
//   - "every"   → one output per page (1.pdf, 2.pdf, ...)
//   - "range"   → user-supplied 1-based ranges, comma-separated
//                 ("1-5,9-12") — one output per range
//   - "size"    → split into chunks of N pages each
//
// Returns an array of { name, bytes } so the runner can either
// download a single file directly or zip them via JSZip.

import { PDFDocument } from "pdf-lib";
import { copyPagesIntoNewDoc, parsePageRange } from "./pdf-lib-helpers";

export type SplitMode = "every" | "range" | "size";

export interface SplitOptions {
  mode: SplitMode;
  /** Required when mode === "range". 1-based, e.g. "1-5,8,10-12". */
  ranges?: string;
  /** Required when mode === "size". Pages per chunk, ≥ 1. */
  chunkSize?: number;
}

export interface SplitOutput {
  /** Filename suggestion — caller may further customize. */
  name: string;
  /** Serialized PDF bytes. */
  bytes: Uint8Array;
  /** 1-based page numbers from the source contained in this output. */
  pageNumbers: number[];
}

export interface SplitResult {
  outputs: SplitOutput[];
  /** Source page count, for display. */
  sourcePageCount: number;
}

export async function splitPdf(
  bytes: Uint8Array,
  opts: SplitOptions,
): Promise<SplitResult> {
  const src = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const pageCount = src.getPageCount();
  if (pageCount === 0) {
    throw new Error("This PDF has no pages.");
  }

  // Determine chunks of 0-based page indices, one chunk per output.
  const chunks: number[][] = [];

  if (opts.mode === "every") {
    for (let i = 0; i < pageCount; i++) chunks.push([i]);
  } else if (opts.mode === "size") {
    const size = Math.max(1, Math.floor(opts.chunkSize ?? 1));
    for (let i = 0; i < pageCount; i += size) {
      const end = Math.min(i + size, pageCount);
      const arr: number[] = [];
      for (let j = i; j < end; j++) arr.push(j);
      chunks.push(arr);
    }
  } else if (opts.mode === "range") {
    const expr = (opts.ranges ?? "").trim();
    if (!expr) {
      throw new Error("Type page ranges like 1-3, 5, 8-10.");
    }
    // Each comma-separated chunk becomes one output.
    const parts = expr.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) {
      throw new Error("No ranges given.");
    }
    for (const part of parts) {
      const parsed = parsePageRange(part, pageCount);
      if (parsed.indices.length === 0) {
        throw new Error(`Range "${part}" is empty.`);
      }
      chunks.push(parsed.indices);
    }
  } else {
    throw new Error(`Unknown split mode: ${String(opts.mode)}`);
  }

  // Build one output PDF per chunk.
  const outputs: SplitOutput[] = [];
  for (const indices of chunks) {
    const newDoc = await copyPagesIntoNewDoc(src, indices);
    const out = await newDoc.save({ useObjectStreams: true });
    const pageNumbers = indices.map((i) => i + 1);
    const name =
      pageNumbers.length === 1
        ? `page-${pageNumbers[0]}.pdf`
        : `pages-${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]}.pdf`;
    outputs.push({ name, bytes: out, pageNumbers });
  }

  return { outputs, sourcePageCount: pageCount };
}
