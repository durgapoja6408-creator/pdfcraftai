// lib/pdf/ops/n-up.ts
//
// Tier 5 (2026-04-28): N-up layout. Pack 2 or 4 source pages onto each
// output sheet. Useful for paper-saving prints, handouts, and reading
// many pages at once.
//
// pdf-lib pattern: embed each source page as a PDFEmbeddedPage, then
// drawPage() it onto a new output page at the right scale + offset.
// Output page size = source page size (so 2-up landscape printed on
// landscape paper or 4-up grid stays close to the original aspect).

import { PDFDocument } from "pdf-lib";

export type NUpLayout = "2" | "4";

export interface NUpOptions {
  layout: NUpLayout;
  /** Gap between cells in PDF points. Default 8. */
  gap?: number;
}

export interface NUpResult {
  bytes: Uint8Array;
  /** Pages in the output. */
  pageCount: number;
  /** Pages in the source. */
  sourcePageCount: number;
}

export async function nUpPdf(
  bytes: Uint8Array,
  opts: NUpOptions,
): Promise<NUpResult> {
  const src = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  const sourceCount = src.getPageCount();
  if (sourceCount === 0) throw new Error("This PDF has no pages.");

  const cells = opts.layout === "4" ? 4 : 2;
  const gap = opts.gap ?? 8;

  const out = await PDFDocument.create();
  const indices: number[] = [];
  for (let i = 0; i < sourceCount; i++) indices.push(i);
  // Embed all source pages once — pdf-lib will reuse the underlying
  // resources across multiple drawPage calls.
  const embedded = await out.embedPdf(src, indices);

  for (let pageIdx = 0; pageIdx < sourceCount; pageIdx += cells) {
    const slice = embedded.slice(pageIdx, pageIdx + cells);
    if (slice.length === 0) continue;

    // Use the FIRST source page's dimensions as the output page size.
    // Most PDFs have uniform pages; mixed-orientation docs will look
    // a bit irregular but still produce valid output.
    const ref = slice[0];
    const refDims = ref.size();
    const outW = refDims.width;
    const outH = refDims.height;
    const page = out.addPage([outW, outH]);

    if (cells === 2) {
      // Stack two cells vertically — top half + bottom half.
      const cellH = (outH - gap) / 2;
      const cellW = outW;
      slice.forEach((emb, i) => {
        const dims = emb.size();
        const scale = Math.min(cellW / dims.width, cellH / dims.height);
        const drawW = dims.width * scale;
        const drawH = dims.height * scale;
        const x = (cellW - drawW) / 2;
        // i=0 → top half, i=1 → bottom half
        const cellY = i === 0 ? cellH + gap : 0;
        const y = cellY + (cellH - drawH) / 2;
        page.drawPage(emb, { x, y, width: drawW, height: drawH });
      });
    } else {
      // 2×2 grid.
      const cellW = (outW - gap) / 2;
      const cellH = (outH - gap) / 2;
      const positions = [
        { col: 0, row: 0 }, // top-left
        { col: 1, row: 0 }, // top-right
        { col: 0, row: 1 }, // bottom-left
        { col: 1, row: 1 }, // bottom-right
      ];
      slice.forEach((emb, i) => {
        const pos = positions[i];
        const dims = emb.size();
        const scale = Math.min(cellW / dims.width, cellH / dims.height);
        const drawW = dims.width * scale;
        const drawH = dims.height * scale;
        // Cell base: row 0 = top (cellH + gap), row 1 = bottom (0).
        const cellX = pos.col * (cellW + gap);
        const cellY = pos.row === 0 ? cellH + gap : 0;
        const x = cellX + (cellW - drawW) / 2;
        const y = cellY + (cellH - drawH) / 2;
        page.drawPage(emb, { x, y, width: drawW, height: drawH });
      });
    }
  }

  const outBytes = await out.save({ useObjectStreams: true });
  return {
    bytes: outBytes,
    pageCount: out.getPageCount(),
    sourcePageCount: sourceCount,
  };
}
