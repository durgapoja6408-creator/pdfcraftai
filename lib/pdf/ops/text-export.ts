// lib/pdf/ops/text-export.ts
//
// Build 2 (2026-04-27): shared op for the three PDF text-export
// tools — PDF → Text, PDF → Markdown, PDF → HTML. All three call
// the same PDFium parse and the same per-page text extraction; they
// only differ in how the per-page strings get formatted into a
// final blob. Consolidating here avoids three near-duplicate
// components diverging on the engine call.
//
// Why three tools instead of one tool with a "format" dropdown:
// search intent. Users typing "PDF to TXT" want the exact tool
// they searched for, ideally with a URL slug that matches. iLovePDF
// and Smallpdf maintain separate tools for each format; we do too.
// The shared op layer is where DRY lives.
//
// Limitations honestly stated: PDFium's getText() returns the page
// as a flat string in reading order, with newlines between text
// runs. We don't recover document structure (headings, lists, etc.)
// from that — Markdown and HTML output is therefore "lightly
// structured plain text" not "fully reconstructed semantic HTML."
// Heading detection by font-size is on the roadmap; for now we
// surface this honestly in each tool's FAQ.

"use client";

import { withPdfDocument } from "../library";

/**
 * Extract plain text from every page of a PDF.
 *
 * Returns an array indexed by page number (1-based in display, 0-based here).
 * Caller decides whether to join with separators, wrap in HTML, or anything else.
 */
export async function extractPagesText(bytes: Uint8Array): Promise<string[]> {
  return withPdfDocument(bytes, async (doc) => {
    const pageCount = doc.getPageCount();
    const pages: string[] = [];
    for (let i = 0; i < pageCount; i++) {
      const p = doc.getPage(i);
      pages.push(p.getText() ?? "");
    }
    return pages;
  });
}

// ---- Formatters ---------------------------------------------------

/**
 * Plain-text format with page-break markers between pages. The
 * `--- Page N ---` separator is the de-facto convention used by
 * pdftotext, command-line tools, and downstream pipelines.
 */
export function formatAsText(pages: string[]): string {
  if (pages.length === 1) return pages[0].trim();
  return pages
    .map((text, i) => `--- Page ${i + 1} ---\n${text.trim()}`)
    .join("\n\n");
}

/**
 * Markdown format. Each page becomes a `## Page N` H2 header
 * followed by paragraphs. Paragraph splitting: collapse runs of
 * whitespace, split on double-newline.
 */
export function formatAsMarkdown(pages: string[]): string {
  return pages
    .map((text, i) => {
      const cleaned = text
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      // Escape Markdown special chars in the body. Lightweight pass
      // — we don't try to escape inside code blocks (none here).
      const body = cleaned
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .join("\n\n");
      return `## Page ${i + 1}\n\n${body}`;
    })
    .join("\n\n");
}

/**
 * HTML format. Wraps in a minimal HTML5 doc with safe encoding;
 * each page is a <section> with an <h2> header and <p> paragraphs.
 * No external CSS, no scripts, just structural markup so the
 * output is portable.
 */
export function formatAsHtml(pages: string[], title = "Extracted PDF text"): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const sections = pages
    .map((text, i) => {
      const cleaned = text
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      const paragraphs = cleaned
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `      <p>${escape(p).replace(/\n/g, "<br>")}</p>`)
        .join("\n");
      return `    <section>
      <h2>Page ${i + 1}</h2>
${paragraphs}
    </section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escape(title)}</title>
  </head>
  <body>
    <h1>${escape(title)}</h1>
${sections}
  </body>
</html>
`;
}
