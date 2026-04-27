// lib/pdf/ops/merge.ts
//
// Build 2 Wave 9 (2026-04-27): merge multiple PDFs into one. Pure
// pdf-lib — runs in the browser, never uploads bytes.
//
// Output preserves page ordering as caller-provided. We DO NOT copy
// metadata across (the merged doc is a derivative; setting Title /
// Author on the output is the caller's job — Wave 9 keeps it empty).

import { PDFDocument } from "pdf-lib";

export interface MergeInput {
  /** Display name for the source — used in error messages only. */
  name: string;
  /** Raw bytes of the source PDF. */
  bytes: Uint8Array;
}

export interface MergeResult {
  /** Serialized PDF bytes, ready to download. */
  bytes: Uint8Array;
  /** Total page count of the merged document. */
  pageCount: number;
  /** Per-source breakdown so callers can show "47 pages from 3 files". */
  sources: Array<{ name: string; pageCount: number }>;
}

export async function mergePdfs(inputs: MergeInput[]): Promise<MergeResult> {
  if (inputs.length === 0) {
    throw new Error("Drop at least two PDFs to merge.");
  }
  const out = await PDFDocument.create();
  const sources: MergeResult["sources"] = [];
  for (const inp of inputs) {
    let src: PDFDocument;
    try {
      src = await PDFDocument.load(inp.bytes, {
        ignoreEncryption: false,
        updateMetadata: false,
      });
    } catch (err) {
      // Surface which file caused the load to fail — the runner shows
      // the message verbatim.
      const reason =
        err instanceof Error ? err.message : "Could not parse the file.";
      throw new Error(`"${inp.name}" — ${reason}`);
    }
    const indices: number[] = [];
    const n = src.getPageCount();
    for (let i = 0; i < n; i++) indices.push(i);
    const copied = await out.copyPages(src, indices);
    for (const p of copied) out.addPage(p);
    sources.push({ name: inp.name, pageCount: n });
  }
  const bytes = await out.save({ useObjectStreams: true });
  return {
    bytes,
    pageCount: out.getPageCount(),
    sources,
  };
}
