// lib/pdf/ops/markdown-to-pdf.ts
//
// 2026-05-01 Tier 1: convert markdown text to a paginated, styled
// PDF. Text-to-pdf treats markdown as literal characters; this tool
// parses the markdown structure and renders with appropriate
// typography (heading sizes, monospace code blocks, list bullets,
// bold/italic inline runs).
//
// Why no `marked` / `markdown-it` dependency: those parse to HTML,
// and we'd then need a separate HTML-to-PDF rail. A tiny block-level
// parser scoped to common markdown features fits the
// 80/20 use case (headings, paragraphs, lists, code blocks, blockquotes,
// inline bold/italic/code) without adding 30KB+ of bundle weight.
// The parser is deliberately conservative — it doesn't attempt to
// handle nested lists, tables, footnotes, or HTML passthrough. Users
// who need those should render via a markdown CMS first.
//
// Layout model: linear flow on a single column. Each block consumes
// a measured height; if the next block doesn't fit on the current
// page, advance to a new page. Inline runs handle word-wrap.

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export type MarkdownPaperSize = "letter" | "a4";

const PAPER: Record<
  MarkdownPaperSize,
  { width: number; height: number }
> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595, height: 842 },
};

export interface MarkdownToPdfOptions {
  paperSize: MarkdownPaperSize;
  /** Body font size in points. Default 11. Range 8-18. */
  fontSize?: number;
}

export interface MarkdownToPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  /** Number of markdown blocks parsed (paragraphs / headings / etc.). */
  blockCount: number;
}

// ---------------------------------------------------------------
// Block-level markdown parser. Splits source into typed blocks.
// ---------------------------------------------------------------

type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; text: string; language?: string }
  | { type: "list"; items: string[]; ordered: boolean }
  | { type: "blockquote"; text: string }
  | { type: "hr" };

function parseMarkdown(src: string): Block[] {
  // Normalize line endings and split into lines.
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Skip blank lines.
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }
    // Horizontal rule.
    if (/^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }
    // ATX heading.
    const headingMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: headingMatch[2],
      });
      i++;
      continue;
    }
    // Fenced code block.
    const fenceOpen = /^\s*```(.*)$/.exec(line);
    if (fenceOpen) {
      const lang = fenceOpen[1].trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      // Skip closing fence (or EOF).
      if (i < lines.length) i++;
      blocks.push({
        type: "code",
        text: codeLines.join("\n"),
        language: lang,
      });
      continue;
    }
    // Blockquote.
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "blockquote",
        text: quoteLines.join(" ").trim(),
      });
      continue;
    }
    // List (unordered or ordered).
    const ulMatch = /^\s*[-*+]\s+(.+)$/.exec(line);
    const olMatch = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ulMatch || olMatch) {
      const ordered = !!olMatch;
      const items: string[] = [];
      while (i < lines.length) {
        const next = lines[i];
        const m = ordered
          ? /^\s*\d+[.)]\s+(.+)$/.exec(next)
          : /^\s*[-*+]\s+(.+)$/.exec(next);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ type: "list", items, ordered });
      continue;
    }
    // Paragraph — gather consecutive non-empty non-special lines.
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !/^>/.test(lines[i]) &&
      !/^\s*[-*+]\s/.test(lines[i]) &&
      !/^\s*\d+[.)]\s/.test(lines[i]) &&
      !/^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({
        type: "paragraph",
        text: paraLines.join(" ").trim(),
      });
    }
  }
  return blocks;
}

// ---------------------------------------------------------------
// Inline parser — splits a paragraph string into runs with
// formatting flags. Handles **bold**, *italic*, `code`, and
// [text](url). Conservative on edge cases — no nesting beyond
// bold inside italic.
// ---------------------------------------------------------------

interface InlineRun {
  text: string;
  bold: boolean;
  italic: boolean;
  mono: boolean;
}

function parseInline(src: string): InlineRun[] {
  const out: InlineRun[] = [];
  let i = 0;
  let bold = false;
  let italic = false;
  let buf = "";

  function flush() {
    if (buf.length === 0) return;
    out.push({ text: buf, bold, italic, mono: false });
    buf = "";
  }

  while (i < src.length) {
    // Inline code.
    if (src[i] === "`") {
      flush();
      const end = src.indexOf("`", i + 1);
      if (end < 0) {
        // unterminated — treat as literal
        buf += src[i];
        i++;
        continue;
      }
      out.push({
        text: src.slice(i + 1, end),
        bold,
        italic,
        mono: true,
      });
      i = end + 1;
      continue;
    }
    // Bold (**...**).
    if (src[i] === "*" && src[i + 1] === "*") {
      flush();
      bold = !bold;
      i += 2;
      continue;
    }
    // Italic (*...*) — only if NOT immediately followed by another *.
    if (src[i] === "*" && src[i + 1] !== "*") {
      flush();
      italic = !italic;
      i++;
      continue;
    }
    // Markdown link [text](url) — render text only (PDF links would
    // need a dedicated runs type; out of scope for this batch).
    if (src[i] === "[") {
      const closeBracket = src.indexOf("]", i + 1);
      const openParen = closeBracket >= 0 ? src.indexOf("(", closeBracket) : -1;
      const closeParen = openParen >= 0 ? src.indexOf(")", openParen) : -1;
      if (
        closeBracket >= 0 &&
        openParen === closeBracket + 1 &&
        closeParen >= 0
      ) {
        const linkText = src.slice(i + 1, closeBracket);
        // Render link text in italic to hint at the link visually.
        flush();
        out.push({
          text: linkText,
          bold,
          italic: true,
          mono: false,
        });
        i = closeParen + 1;
        continue;
      }
    }
    buf += src[i];
    i++;
  }
  flush();
  return out;
}

// ---------------------------------------------------------------
// PDF rendering pass.
// ---------------------------------------------------------------

const HEADING_SIZE_MULTIPLIER: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 2.0,
  2: 1.6,
  3: 1.3,
  4: 1.15,
  5: 1.05,
  6: 1.0,
};

const MARGIN = 56; // 0.78"
const LINE_HEIGHT_MULTIPLIER = 1.4;
const PARAGRAPH_GAP = 8;
const BLOCK_GAP = 14;
const HEADING_TOP_GAP = 16;

interface RenderState {
  doc: PDFDocument;
  fonts: {
    body: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
    boldItalic: PDFFont;
    mono: PDFFont;
  };
  paperW: number;
  paperH: number;
  baseSize: number;
  page: ReturnType<PDFDocument["addPage"]>;
  cursorY: number;
  pageCount: number;
}

function fontFor(state: RenderState, run: InlineRun): PDFFont {
  if (run.mono) return state.fonts.mono;
  if (run.bold && run.italic) return state.fonts.boldItalic;
  if (run.bold) return state.fonts.bold;
  if (run.italic) return state.fonts.italic;
  return state.fonts.body;
}

function newPage(state: RenderState): void {
  state.page = state.doc.addPage([state.paperW, state.paperH]);
  state.cursorY = state.paperH - MARGIN;
  state.pageCount += 1;
}

function ensureSpace(state: RenderState, needed: number): void {
  if (state.cursorY - needed < MARGIN) {
    newPage(state);
  }
}

/** Measure how many runs fit on a single line of width `maxWidth`,
 *  splitting words at whitespace. Returns the runs that fit + the
 *  remainder. */
function wrapInlineRuns(
  runs: InlineRun[],
  fontSize: number,
  maxWidth: number,
  state: RenderState,
): Array<InlineRun[]> {
  const lines: Array<InlineRun[]> = [];
  let currentLine: InlineRun[] = [];
  let currentWidth = 0;
  for (const run of runs) {
    const f = fontFor(state, run);
    const words = run.text.split(/(\s+)/); // keep whitespace tokens
    let buf = "";
    for (const word of words) {
      const candidate = buf + word;
      const w = f.widthOfTextAtSize(candidate, fontSize);
      if (currentWidth + w > maxWidth && (buf.length > 0 || currentLine.length > 0)) {
        // Push the buffered word fragment as a run, then start a new line.
        if (buf.length > 0) {
          currentLine.push({ ...run, text: buf });
        }
        lines.push(currentLine);
        currentLine = [];
        currentWidth = 0;
        buf = word.replace(/^\s+/, ""); // drop leading whitespace at line start
      } else {
        buf = candidate;
      }
    }
    if (buf.length > 0) {
      const w = f.widthOfTextAtSize(buf, fontSize);
      currentLine.push({ ...run, text: buf });
      currentWidth += w;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);
  return lines;
}

function drawInlineLine(
  state: RenderState,
  runs: InlineRun[],
  fontSize: number,
  x: number,
  y: number,
): void {
  let cursorX = x;
  for (const run of runs) {
    const f = fontFor(state, run);
    state.page.drawText(run.text, {
      x: cursorX,
      y,
      size: fontSize,
      font: f,
      color: rgb(0, 0, 0),
    });
    cursorX += f.widthOfTextAtSize(run.text, fontSize);
  }
}

function renderParagraph(
  state: RenderState,
  text: string,
  fontSize: number,
): void {
  const runs = parseInline(text);
  const maxWidth = state.paperW - 2 * MARGIN;
  const lines = wrapInlineRuns(runs, fontSize, maxWidth, state);
  const lineHeight = fontSize * LINE_HEIGHT_MULTIPLIER;
  for (const line of lines) {
    ensureSpace(state, lineHeight);
    state.cursorY -= lineHeight;
    drawInlineLine(state, line, fontSize, MARGIN, state.cursorY);
  }
}

function renderHeading(
  state: RenderState,
  level: 1 | 2 | 3 | 4 | 5 | 6,
  text: string,
): void {
  const size = state.baseSize * HEADING_SIZE_MULTIPLIER[level];
  // Heading is always bold, never wrapped via inline runs (heading
  // text rarely needs nested formatting; markdown allows it but
  // simpler is fine here).
  const lineHeight = size * LINE_HEIGHT_MULTIPLIER;
  ensureSpace(state, lineHeight + HEADING_TOP_GAP);
  state.cursorY -= HEADING_TOP_GAP;
  // Wrap the heading too — long H1s shouldn't bleed off page.
  const runs: InlineRun[] = [
    { text, bold: true, italic: false, mono: false },
  ];
  const maxWidth = state.paperW - 2 * MARGIN;
  const lines = wrapInlineRuns(runs, size, maxWidth, state);
  for (const line of lines) {
    ensureSpace(state, lineHeight);
    state.cursorY -= lineHeight;
    drawInlineLine(state, line, size, MARGIN, state.cursorY);
  }
}

function renderCodeBlock(state: RenderState, text: string, size: number): void {
  const codeSize = size * 0.92;
  const lineHeight = codeSize * 1.3;
  const padding = 8;
  const lines = text.split("\n");
  const blockHeight = lineHeight * lines.length + padding * 2;
  ensureSpace(state, blockHeight);
  // Faint background.
  state.cursorY -= padding;
  state.page.drawRectangle({
    x: MARGIN - 6,
    y: state.cursorY - lineHeight * (lines.length - 1) - padding,
    width: state.paperW - 2 * MARGIN + 12,
    height: blockHeight,
    color: rgb(0.96, 0.96, 0.97),
  });
  for (const line of lines) {
    state.cursorY -= lineHeight;
    state.page.drawText(line || " ", {
      x: MARGIN,
      y: state.cursorY,
      size: codeSize,
      font: state.fonts.mono,
      color: rgb(0.1, 0.1, 0.15),
    });
  }
  state.cursorY -= padding;
}

function renderList(
  state: RenderState,
  items: string[],
  ordered: boolean,
  size: number,
): void {
  const lineHeight = size * LINE_HEIGHT_MULTIPLIER;
  const indent = 18;
  for (let idx = 0; idx < items.length; idx++) {
    const bullet = ordered ? `${idx + 1}.` : "•";
    const runs = parseInline(items[idx]);
    const maxWidth = state.paperW - 2 * MARGIN - indent;
    const lines = wrapInlineRuns(runs, size, maxWidth, state);
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      ensureSpace(state, lineHeight);
      state.cursorY -= lineHeight;
      if (lineIdx === 0) {
        state.page.drawText(bullet, {
          x: MARGIN,
          y: state.cursorY,
          size,
          font: state.fonts.body,
          color: rgb(0, 0, 0),
        });
      }
      drawInlineLine(state, lines[lineIdx], size, MARGIN + indent, state.cursorY);
    }
  }
}

function renderBlockquote(state: RenderState, text: string, size: number): void {
  const runs = parseInline(text);
  const indent = 16;
  const maxWidth = state.paperW - 2 * MARGIN - indent;
  const lines = wrapInlineRuns(runs, size, maxWidth, state);
  const lineHeight = size * LINE_HEIGHT_MULTIPLIER;
  const blockHeight = lineHeight * lines.length;
  ensureSpace(state, blockHeight);
  // Left border bar.
  const startY = state.cursorY;
  state.page.drawRectangle({
    x: MARGIN,
    y: startY - blockHeight,
    width: 3,
    height: blockHeight,
    color: rgb(0.7, 0.7, 0.75),
  });
  for (const line of lines) {
    state.cursorY -= lineHeight;
    drawInlineLine(state, line, size, MARGIN + indent, state.cursorY);
  }
}

function renderHr(state: RenderState): void {
  ensureSpace(state, 16);
  state.cursorY -= 8;
  state.page.drawLine({
    start: { x: MARGIN, y: state.cursorY },
    end: { x: state.paperW - MARGIN, y: state.cursorY },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.75),
  });
  state.cursorY -= 8;
}

/**
 * Convert a markdown source string to a paginated PDF.
 */
export async function markdownToPdf(
  src: string,
  opts: MarkdownToPdfOptions,
): Promise<MarkdownToPdfResult> {
  if (src.trim().length === 0) throw new Error("Markdown text is empty.");
  const fontSize = opts.fontSize ?? 11;

  const blocks = parseMarkdown(src);
  if (blocks.length === 0) throw new Error("No renderable content in input.");

  const doc = await PDFDocument.create();
  const fonts = {
    body: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    boldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const { width: paperW, height: paperH } = PAPER[opts.paperSize];
  const firstPage = doc.addPage([paperW, paperH]);
  const state: RenderState = {
    doc,
    fonts,
    paperW,
    paperH,
    baseSize: fontSize,
    page: firstPage,
    cursorY: paperH - MARGIN,
    pageCount: 1,
  };

  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi];
    switch (b.type) {
      case "heading":
        renderHeading(state, b.level, b.text);
        break;
      case "paragraph":
        renderParagraph(state, b.text, fontSize);
        break;
      case "code":
        renderCodeBlock(state, b.text, fontSize);
        break;
      case "list":
        renderList(state, b.items, b.ordered, fontSize);
        break;
      case "blockquote":
        renderBlockquote(state, b.text, fontSize);
        break;
      case "hr":
        renderHr(state);
        break;
    }
    // Inter-block gap (paragraphs slightly tighter than other blocks).
    state.cursorY -= b.type === "paragraph" ? PARAGRAPH_GAP : BLOCK_GAP;
  }

  const bytes = await doc.save({ useObjectStreams: false });
  return {
    bytes,
    pageCount: state.pageCount,
    blockCount: blocks.length,
  };
}
