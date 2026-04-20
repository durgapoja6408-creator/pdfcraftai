// Server-side PDF → Office conversion.
//
// Why server-side, not client-side like merge/split/rotate?
//   - Reliable text extraction needs pdfjs-dist, and pdfjs's worker is a
//     non-trivial bundling dance under Next.js + a tight CSP. Doing it
//     server-side reuses the same extractor `/api/ai/chat` already runs
//     against (`lib/ai/pdf-extract.ts`), which we know works.
//   - The `docx` library is ~170 KB gzipped. Loading it into every
//     visitor's bundle (most of whom never click this tool) hurts our
//     home-page perf budget. Keeping it server-side keeps the client
//     bundle lean.
//
// Privacy posture: bytes are processed in-memory in this Node process
// and never written to disk. The output blob is streamed back in the
// response — no copy is retained. The `/tool/pdf-to-office` runner
// page surfaces this in the reassurance row.
//
// Output formats supported in v1:
//   - "docx" — one Word section per PDF page; paragraph per text run.
//   - "txt"  — plain UTF-8 with `\f` between pages (matches the
//              extractor's separator).
//
// Excel + PowerPoint are intentionally NOT in v1. Mapping unstructured
// PDF text to a tabular sheet (Excel) or a slide-per-page deck without
// layout heuristics produces output users hate. We'll add them when we
// have a real layout-extraction pass; until then, surfacing "coming
// soon" in the UI is more honest than shipping garbage.

import "server-only";

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  PageBreak,
} from "docx";

import { extractPdfText, type ExtractedPdf } from "@/lib/ai/pdf-extract";

export type PdfToOfficeFormat = "docx" | "txt";

export interface PdfToOfficeResult {
  /** Final converted bytes, ready to stream back. */
  bytes: Uint8Array;
  /** Suggested download filename. */
  filename: string;
  /** MIME type for the response Content-Type header. */
  contentType: string;
  /** Number of PDF pages we walked. */
  pageCount: number;
  /** Pages where pdfjs returned <20 chars (likely scanned). */
  ocrCandidatePages: number[];
}

/**
 * Convert raw PDF bytes to an Office-compatible (or plain text) blob.
 *
 * Throws on malformed PDFs — caller should map that to a 400. Throws
 * on empty extraction (no text on any page) — caller should map that
 * to a 422 with `error: "no_extractable_text"` + an OCR nudge.
 */
export async function convertPdfToOffice(
  source: Uint8Array,
  format: PdfToOfficeFormat,
  originalFilename: string,
): Promise<PdfToOfficeResult> {
  const extracted = await extractPdfText(source);
  assertHasSomeText(extracted);

  const baseName = stripExtension(originalFilename || "document");

  if (format === "txt") {
    const text = extracted.fullText;
    return {
      bytes: new TextEncoder().encode(text),
      filename: `${baseName}.txt`,
      contentType: "text/plain; charset=utf-8",
      pageCount: extracted.pageCount,
      ocrCandidatePages: extracted.ocrCandidatePages,
    };
  }

  // format === "docx"
  const docxBytes = await renderDocx(extracted, baseName);
  return {
    bytes: docxBytes,
    filename: `${baseName}.docx`,
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pageCount: extracted.pageCount,
    ocrCandidatePages: extracted.ocrCandidatePages,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function assertHasSomeText(extracted: ExtractedPdf): void {
  // If literally every page came back below the OCR threshold, the
  // input is almost certainly a scan. Bail before we hand the user a
  // ten-page Word doc full of empty paragraphs.
  if (extracted.ocrCandidatePages.length === extracted.pageCount) {
    const err = new Error(
      "This PDF appears to be a scan with no extractable text. Try the OCR tool first.",
    );
    (err as Error & { code?: string }).code = "no_extractable_text";
    throw err;
  }
}

function stripExtension(name: string): string {
  return name.replace(/\.(pdf|PDF)$/u, "").slice(0, 200) || "document";
}

/**
 * Render the extracted text as a Word document.
 *
 * Layout strategy:
 *   - Title paragraph at the top with the source filename.
 *   - One Heading 1 per PDF page ("Page N").
 *   - Each line of extracted text becomes a paragraph. We split on
 *     newlines (pdfjs already inserts `\n` at hasEOL boundaries) so
 *     paragraph breaks roughly survive.
 *   - A page break is inserted at the END of every page except the
 *     last, so the Word document paginates the same way as the PDF.
 *   - Pages flagged by `likelyNeedsOcr` get a placeholder paragraph
 *     so the user knows we couldn't read that page (vs. silently
 *     dropping it, which would be confusing).
 *
 * Output uses Calibri 11pt — Word's default since 2007, which makes
 * the document feel "native" when opened.
 */
async function renderDocx(extracted: ExtractedPdf, title: string): Promise<Uint8Array> {
  const children: Paragraph[] = [];

  // Title block
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: title, bold: true, size: 36 })], // 18pt
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Converted from PDF · ${extracted.pageCount} page${extracted.pageCount === 1 ? "" : "s"}`,
          italics: true,
          size: 18, // 9pt
          color: "666666",
        }),
      ],
    }),
  );

  for (let i = 0; i < extracted.pages.length; i++) {
    const page = extracted.pages[i]!;
    const isLast = i === extracted.pages.length - 1;

    // Heading per page
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: `Page ${page.pageNumber}`, bold: true })],
      }),
    );

    if (page.likelyNeedsOcr) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text:
                "[No extractable text on this page. The page may be a scan — run the OCR tool to recover the text.]",
              italics: true,
              color: "888888",
              size: 20, // 10pt
            }),
          ],
        }),
      );
    } else {
      // Each newline-separated chunk becomes a paragraph. We keep
      // empty lines as visual spacing.
      const lines = page.text.split("\n");
      for (const line of lines) {
        const text = line.trim();
        if (text) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text, size: 22 })], // 11pt
            }),
          );
        } else {
          // Preserve blank lines as a minimal spacer.
          children.push(new Paragraph({ children: [new TextRun("")] }));
        }
      }
    }

    if (!isLast) {
      // Page break so the Word doc paginates like the PDF. PageBreak
      // must be inside a Paragraph — putting it bare is invalid OOXML.
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  const doc = new Document({
    creator: "pdfcraft.ai",
    title,
    description: `Converted from PDF (${extracted.pageCount} pages) by pdfcraft.ai`,
    styles: {
      default: {
        document: {
          run: {
            font: "Calibri",
            size: 22, // 11pt
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            // US Letter, 1-inch margins. docx-js defaults to A4 — we
            // override here so US users don't get an unexpected paper
            // size in Word/Pages.
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  // Packer.toBuffer returns a Node Buffer in this runtime. Convert to
  // Uint8Array so the caller can hand it to NextResponse without
  // worrying about Buffer vs. ArrayBuffer semantics.
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}
