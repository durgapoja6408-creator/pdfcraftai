// lib/pdf/ops/csv-to-pdf.ts
//
// 2026-05-01 Tier 2: render CSV data as a paginated PDF table.
//
// Distinct from text-to-pdf (which monospaces the input but doesn't
// align columns) — this tool parses the CSV with proper RFC 4180
// quoting, computes column widths from content, and lays out a real
// table with header row + data rows + repeat-on-each-page header.
//
// Pure pdf-lib + StandardFonts (Helvetica / HelveticaBold for headers).
// Output is searchable + selectable.

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export type CsvPaperSize = "letter" | "a4" | "letter-landscape" | "a4-landscape";

const PAPER: Record<
  CsvPaperSize,
  { width: number; height: number }
> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595, height: 842 },
  "letter-landscape": { width: 792, height: 612 },
  "a4-landscape": { width: 842, height: 595 },
};

export interface CsvToPdfOptions {
  paperSize: CsvPaperSize;
  /** Treat first row as a styled header. Default true. */
  hasHeader?: boolean;
  /** Body font size in points. Default 10. */
  fontSize?: number;
  /** Field delimiter. Default ",". Use "\t" for TSV. */
  delimiter?: string;
}

export interface CsvToPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  /** Number of data rows rendered (excluding header). */
  rowCount: number;
  /** Number of columns. */
  columnCount: number;
}

// ---------------------------------------------------------------
// RFC 4180 CSV parser. Handles quoted fields, escaped quotes
// (""), embedded delimiters, embedded newlines.
// ---------------------------------------------------------------

function parseCsv(src: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"' && field === "") {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        row.push(field);
        field = "";
        i++;
      } else if (ch === "\n" || ch === "\r") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        // CRLF — skip the LF after CR.
        if (ch === "\r" && src[i + 1] === "\n") i += 2;
        else i++;
      } else {
        field += ch;
        i++;
      }
    }
  }
  // Flush any trailing field/row that wasn't terminated by a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully empty trailing rows (common in files that end with "\n").
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === "")) {
    rows.pop();
  }
  return rows;
}

// ---------------------------------------------------------------
// Column-width allocation. Measures each cell, then squashes columns
// proportionally if total exceeds available width.
// ---------------------------------------------------------------

const MARGIN = 36; // 0.5"
const ROW_PADDING_X = 6;
const ROW_PADDING_Y = 4;
const HEADER_BG_GRAY = 0.92;
const ROW_BORDER_GRAY = 0.85;

function computeColumnWidths(
  rows: string[][],
  font: PDFFont,
  fontSize: number,
  availableWidth: number,
): number[] {
  const colCount = Math.max(...rows.map((r) => r.length));
  const widths = new Array(colCount).fill(0);
  for (const r of rows) {
    for (let c = 0; c < r.length; c++) {
      // Truncate long cells when measuring (so a single huge cell
      // doesn't dominate column allocation). 60-char preview is fine.
      const sample = r[c].slice(0, 60);
      const w = font.widthOfTextAtSize(sample, fontSize) + ROW_PADDING_X * 2;
      if (w > widths[c]) widths[c] = w;
    }
  }
  // Squash if total too wide.
  const total = widths.reduce((a, b) => a + b, 0);
  if (total > availableWidth) {
    const scale = availableWidth / total;
    for (let c = 0; c < colCount; c++) {
      widths[c] = Math.max(40, widths[c] * scale);
    }
  }
  // If under-using width, distribute extra space evenly.
  const total2 = widths.reduce((a, b) => a + b, 0);
  if (total2 < availableWidth) {
    const extra = (availableWidth - total2) / colCount;
    for (let c = 0; c < colCount; c++) widths[c] += extra;
  }
  return widths;
}

function truncateToWidth(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
  // Binary search for the longest fitting prefix + ellipsis.
  let lo = 0;
  let hi = text.length;
  const ellipsis = "…";
  const ellW = font.widthOfTextAtSize(ellipsis, fontSize);
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const t = text.slice(0, mid) + ellipsis;
    if (font.widthOfTextAtSize(t, fontSize) <= maxWidth - 2) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + (lo > 0 ? ellipsis : "");
}

// ---------------------------------------------------------------
// Render pass.
// ---------------------------------------------------------------

export async function csvToPdf(
  src: string,
  opts: CsvToPdfOptions,
): Promise<CsvToPdfResult> {
  const fontSize = opts.fontSize ?? 10;
  const hasHeader = opts.hasHeader ?? true;
  const delimiter = opts.delimiter ?? ",";

  const allRows = parseCsv(src, delimiter);
  if (allRows.length === 0) throw new Error("CSV is empty.");

  const headerRow = hasHeader ? allRows[0] : null;
  const dataRows = hasHeader ? allRows.slice(1) : allRows;
  const colCount = Math.max(...allRows.map((r) => r.length));
  if (colCount === 0) throw new Error("CSV has no columns.");

  const doc = await PDFDocument.create();
  const fontReg = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const { width: paperW, height: paperH } = PAPER[opts.paperSize];
  const availableWidth = paperW - 2 * MARGIN;
  const colWidths = computeColumnWidths(allRows, fontReg, fontSize, availableWidth);
  const rowHeight = fontSize + 2 * ROW_PADDING_Y;
  const headerHeight = rowHeight;

  let page = doc.addPage([paperW, paperH]);
  let pageCount = 1;
  let cursorY = paperH - MARGIN;

  function drawHeaderBand(yTop: number) {
    if (!headerRow) return;
    // Background fill.
    page.drawRectangle({
      x: MARGIN,
      y: yTop - headerHeight,
      width: availableWidth,
      height: headerHeight,
      color: rgb(HEADER_BG_GRAY, HEADER_BG_GRAY, HEADER_BG_GRAY),
    });
    let cx = MARGIN;
    for (let c = 0; c < colCount; c++) {
      const cell = headerRow[c] ?? "";
      const text = truncateToWidth(
        cell,
        fontBold,
        fontSize,
        colWidths[c] - 2 * ROW_PADDING_X,
      );
      page.drawText(text, {
        x: cx + ROW_PADDING_X,
        y: yTop - rowHeight + ROW_PADDING_Y,
        size: fontSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      cx += colWidths[c];
    }
  }

  function drawDataRow(row: string[], yTop: number) {
    let cx = MARGIN;
    for (let c = 0; c < colCount; c++) {
      const cell = row[c] ?? "";
      const text = truncateToWidth(
        cell,
        fontReg,
        fontSize,
        colWidths[c] - 2 * ROW_PADDING_X,
      );
      page.drawText(text, {
        x: cx + ROW_PADDING_X,
        y: yTop - rowHeight + ROW_PADDING_Y,
        size: fontSize,
        font: fontReg,
        color: rgb(0, 0, 0),
      });
      cx += colWidths[c];
    }
    // Bottom border.
    page.drawLine({
      start: { x: MARGIN, y: yTop - rowHeight },
      end: { x: MARGIN + availableWidth, y: yTop - rowHeight },
      thickness: 0.5,
      color: rgb(ROW_BORDER_GRAY, ROW_BORDER_GRAY, ROW_BORDER_GRAY),
    });
  }

  // Header on first page.
  drawHeaderBand(cursorY);
  cursorY -= headerHeight;

  for (const r of dataRows) {
    if (cursorY - rowHeight < MARGIN) {
      // New page; redraw header band so each page is self-contained.
      page = doc.addPage([paperW, paperH]);
      pageCount += 1;
      cursorY = paperH - MARGIN;
      drawHeaderBand(cursorY);
      cursorY -= headerHeight;
    }
    drawDataRow(r, cursorY);
    cursorY -= rowHeight;
  }

  const bytes = await doc.save({ useObjectStreams: false });
  return {
    bytes,
    pageCount,
    rowCount: dataRows.length,
    columnCount: colCount,
  };
}
