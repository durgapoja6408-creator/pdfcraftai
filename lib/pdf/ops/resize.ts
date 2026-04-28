// lib/pdf/ops/resize.ts
//
// Tier 5 (2026-04-28): resize / scale every page to a target page
// size. Content is scaled to fit, preserving aspect ratio.
//
// pdf-lib approach: embed each source page as a PDFEmbeddedPage, then
// drawPage() onto a new page sized to the target. The largest scale
// that keeps the source within the target is used; the result is
// centered with white margins where the aspect ratios differ.

import { PDFDocument } from "pdf-lib";

export type PaperSize = "letter" | "legal" | "a4" | "a3" | "a5";

/** Target dimensions in PDF points (72 dpi). */
const PAPER: Record<PaperSize, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  legal: { width: 612, height: 1008 },
  a4: { width: 595, height: 842 },
  a3: { width: 842, height: 1191 },
  a5: { width: 420, height: 595 },
};

export interface ResizeOptions {
  size: PaperSize;
  /** Force landscape orientation regardless of source. Default false. */
  landscape?: boolean;
}

export interface ResizeResult {
  bytes: Uint8Array;
  pageCount: number;
  /** Final page dimensions in PDF points. */
  width: number;
  height: number;
}

export async function resizePdf(
  bytes: Uint8Array,
  opts: ResizeOptions,
): Promise<ResizeResult> {
  const src = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const sourceCount = src.getPageCount();
  if (sourceCount === 0) throw new Error("This PDF has no pages.");

  let { width: targetW, height: targetH } = PAPER[opts.size];
  if (opts.landscape) {
    [targetW, targetH] = [targetH, targetW];
  }

  const out = await PDFDocument.create();
  const indices: number[] = [];
  for (let i = 0; i < sourceCount; i++) indices.push(i);
  const embedded = await out.embedPdf(src, indices);

  for (const emb of embedded) {
    const dims = emb.size();
    const scale = Math.min(targetW / dims.width, targetH / dims.height);
    const drawW = dims.width * scale;
    const drawH = dims.height * scale;
    const x = (targetW - drawW) / 2;
    const y = (targetH - drawH) / 2;
    const page = out.addPage([targetW, targetH]);
    page.drawPage(emb, { x, y, width: drawW, height: drawH });
  }

  const outBytes = await out.save({ useObjectStreams: true });
  return {
    bytes: outBytes,
    pageCount: out.getPageCount(),
    width: targetW,
    height: targetH,
  };
}
