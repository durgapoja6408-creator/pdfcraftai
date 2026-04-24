"use client";

// MarkdownToPdfTool — Tier 1 §1.3 P1.
//
// Paste (or upload) Markdown → get an A4 PDF back. Pure pdf-lib,
// no new npm deps — the Markdown parser is a minimal inline
// implementation covering the 90% subset:
//   - Headers (# ## ###)
//   - Paragraphs with inline **bold**, *italic* or _italic_, `code`
//   - Unordered lists (- or *)
//   - Ordered lists (1. 2. 3.)
//   - Code blocks (``` fenced)
//   - Blockquotes (>)
//   - Horizontal rules (---)
//   - Links [text](url) — rendered as blue text, no live hyperlink
//     (true /Link annotations would require more work for v1)
//
// Not supported in v1, honest FAQ call-out:
//   - Tables (pipe syntax) — layout is non-trivial across column
//     widths, deferred.
//   - Images ( ![]() ) — would need user-side image resolution,
//     deferred. Users who need images should use the Add Text
//     Box + Image Watermark tools to compose.
//   - HTML passthrough — markdown with embedded <html> gets
//     rendered literally.
//
// Page setup: A4 (595×842 pt), 1-inch margins (72 pt), Helvetica
// 11 pt body with Helvetica-Bold for headers and Courier 10 pt
// for code. Auto-paginate when y < margin — new page, continue.

import { useState, useCallback } from "react";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import {
  deriveOutputName,
  downloadBytes,
  humanSize,
  sha256HexOfBytes,
} from "@/lib/client/pdf-utils";
import { logToolResultAction } from "@/lib/tool-result-actions";

// ── Inline Markdown parser (minimal) ────────────────────────────────
//
// Emits a flat list of block tokens. Each block either has `lines`
// (array of inline-formatted spans) or is a special type like
// `code`, `hr`, or a list block.

type InlineSpan =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; value: string; href: string };

type Block =
  | { type: "heading"; level: 1 | 2 | 3; spans: InlineSpan[] }
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "list"; ordered: boolean; items: InlineSpan[][] }
  | { type: "quote"; spans: InlineSpan[] }
  | { type: "code"; text: string }
  | { type: "hr" };

function parseInline(raw: string): InlineSpan[] {
  // Pass 1: code spans (greedy match to escape everything inside).
  // Pass 2: bold (**x** or __x__)
  // Pass 3: italic (*x* or _x_)
  // Pass 4: links [text](href)
  // Pass 5: plain text.
  // We implement as a single pass that recognises all four in any
  // order by scanning the string.
  const out: InlineSpan[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) {
      out.push({ kind: "text", value: buf });
      buf = "";
    }
  };
  while (i < raw.length) {
    const ch = raw[i];
    // Code span: `...`
    if (ch === "`") {
      const end = raw.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        out.push({ kind: "code", value: raw.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // Bold **...** or __...__
    if ((ch === "*" || ch === "_") && raw[i + 1] === ch) {
      const mark = ch + ch;
      const end = raw.indexOf(mark, i + 2);
      if (end !== -1) {
        flush();
        out.push({ kind: "bold", value: raw.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    // Italic *...* or _..._
    if (ch === "*" || ch === "_") {
      const end = raw.indexOf(ch, i + 1);
      // Avoid matching the same character later as bold boundary
      if (end !== -1 && raw[end + 1] !== ch) {
        flush();
        out.push({ kind: "italic", value: raw.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // Link [text](href)
    if (ch === "[") {
      const closeText = raw.indexOf("]", i + 1);
      if (closeText !== -1 && raw[closeText + 1] === "(") {
        const closeHref = raw.indexOf(")", closeText + 2);
        if (closeHref !== -1) {
          flush();
          out.push({
            kind: "link",
            value: raw.slice(i + 1, closeText),
            href: raw.slice(closeText + 2, closeHref),
          });
          i = closeHref + 1;
          continue;
        }
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line
    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: "code", text: buf.join("\n") });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading
    const h = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (h) {
      blocks.push({
        type: "heading",
        level: h[1].length as 1 | 2 | 3,
        spans: parseInline(h[2]),
      });
      i++;
      continue;
    }

    // Blockquote (consume consecutive > lines as one block)
    if (trimmed.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", spans: parseInline(buf.join(" ")) });
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: InlineSpan[][] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(parseInline(lines[i].trim().replace(/^[-*]\s+/, "")));
        i++;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: InlineSpan[][] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(parseInline(lines[i].trim().replace(/^\d+\.\s+/, "")));
        i++;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    // Paragraph (consume until blank line or block-starting line)
    const buf: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      const nt = next.trim();
      if (!nt) break;
      if (/^#{1,3}\s/.test(nt)) break;
      if (nt.startsWith("```")) break;
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(nt)) break;
      if (/^[-*]\s+/.test(nt)) break;
      if (/^\d+\.\s+/.test(nt)) break;
      if (nt.startsWith(">")) break;
      buf.push(next);
      i++;
    }
    blocks.push({ type: "paragraph", spans: parseInline(buf.join(" ")) });
  }

  return blocks;
}

// ── pdf-lib renderer ────────────────────────────────────────────────

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 72;
const LINE_W = PAGE_W - MARGIN * 2;

// Split a run of inline spans into lines that fit LINE_W. Each span
// is a piece with text + font choice — we measure glyph widths via
// `font.widthOfTextAtSize()`.
type LinePiece = { text: string; font: PDFFont; size: number; color: [number, number, number] };

function buildLines(
  spans: InlineSpan[],
  fonts: { regular: PDFFont; bold: PDFFont; italic: PDFFont; mono: PDFFont },
  size: number,
  baseColor: [number, number, number]
): LinePiece[][] {
  // Expand spans into words with their font.
  type Word = { text: string; font: PDFFont; size: number; color: [number, number, number] };
  const words: Word[] = [];
  const LINK_COLOR: [number, number, number] = [0.09, 0.47, 0.95];
  for (const s of spans) {
    let font: PDFFont = fonts.regular;
    let color = baseColor;
    let text = "";
    if (s.kind === "text") { font = fonts.regular; text = s.value; }
    else if (s.kind === "bold") { font = fonts.bold; text = s.value; }
    else if (s.kind === "italic") { font = fonts.italic; text = s.value; }
    else if (s.kind === "code") { font = fonts.mono; text = s.value; }
    else if (s.kind === "link") { font = fonts.regular; text = s.value; color = LINK_COLOR; }
    // Split on whitespace, keep trailing spaces via join.
    const parts = text.split(/(\s+)/);
    for (const p of parts) {
      if (p) words.push({ text: p, font, size, color });
    }
  }
  // Greedy wrap: accumulate a line until adding the next word
  // exceeds LINE_W. Measure with font.widthOfTextAtSize.
  const lines: LinePiece[][] = [];
  let current: LinePiece[] = [];
  let currentWidth = 0;
  for (const w of words) {
    const wWidth = w.font.widthOfTextAtSize(w.text, w.size);
    if (/^\s+$/.test(w.text)) {
      // Preserve inter-word space if we're mid-line.
      if (current.length > 0) {
        current.push(w);
        currentWidth += wWidth;
      }
      continue;
    }
    if (currentWidth + wWidth > LINE_W && current.length > 0) {
      // Drop trailing whitespace on the current line.
      while (current.length > 0 && /^\s+$/.test(current[current.length - 1].text)) {
        currentWidth -= current[current.length - 1].font.widthOfTextAtSize(
          current[current.length - 1].text,
          current[current.length - 1].size
        );
        current.pop();
      }
      lines.push(current);
      current = [];
      currentWidth = 0;
    }
    current.push(w);
    currentWidth += wWidth;
  }
  while (current.length > 0 && /^\s+$/.test(current[current.length - 1].text)) {
    current.pop();
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

async function renderMarkdown(md: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const fonts = { regular, bold, italic, mono };

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const DEFAULT_BODY_SIZE = 11;
  const LINE_HEIGHT = 1.35;
  const TEXT_BLACK: [number, number, number] = [0.05, 0.05, 0.05];
  const GREY: [number, number, number] = [0.45, 0.45, 0.45];

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  const ensureSpace = (h: number) => {
    if (y - h < MARGIN) newPage();
  };

  const writeLine = (pieces: LinePiece[], x: number, yPos: number) => {
    let cursor = x;
    for (const p of pieces) {
      if (!p.text) continue;
      page.drawText(p.text, {
        x: cursor,
        y: yPos,
        size: p.size,
        font: p.font,
        color: rgb(p.color[0], p.color[1], p.color[2]),
      });
      cursor += p.font.widthOfTextAtSize(p.text, p.size);
    }
  };

  const blocks = parseMarkdown(md);

  for (const block of blocks) {
    if (block.type === "heading") {
      const size = block.level === 1 ? 24 : block.level === 2 ? 18 : 14;
      const gapTop = block.level === 1 ? 16 : 12;
      const gapBottom = 8;
      ensureSpace(size + gapTop + gapBottom);
      y -= gapTop;
      const lines = buildLines(block.spans, { ...fonts, regular: bold }, size, TEXT_BLACK);
      for (const line of lines) {
        ensureSpace(size * LINE_HEIGHT);
        writeLine(line, MARGIN, y - size);
        y -= size * LINE_HEIGHT;
      }
      y -= gapBottom;
      continue;
    }

    if (block.type === "paragraph") {
      const lines = buildLines(block.spans, fonts, DEFAULT_BODY_SIZE, TEXT_BLACK);
      for (const line of lines) {
        ensureSpace(DEFAULT_BODY_SIZE * LINE_HEIGHT);
        writeLine(line, MARGIN, y - DEFAULT_BODY_SIZE);
        y -= DEFAULT_BODY_SIZE * LINE_HEIGHT;
      }
      y -= 8;
      continue;
    }

    if (block.type === "list") {
      for (let idx = 0; idx < block.items.length; idx++) {
        const bullet = block.ordered ? `${idx + 1}.` : "•";
        const indent = 18;
        const lines = buildLines(block.items[idx], fonts, DEFAULT_BODY_SIZE, TEXT_BLACK);
        for (let li = 0; li < lines.length; li++) {
          ensureSpace(DEFAULT_BODY_SIZE * LINE_HEIGHT);
          if (li === 0) {
            page.drawText(bullet, {
              x: MARGIN,
              y: y - DEFAULT_BODY_SIZE,
              size: DEFAULT_BODY_SIZE,
              font: regular,
              color: rgb(...TEXT_BLACK),
            });
          }
          writeLine(lines[li], MARGIN + indent, y - DEFAULT_BODY_SIZE);
          y -= DEFAULT_BODY_SIZE * LINE_HEIGHT;
        }
      }
      y -= 8;
      continue;
    }

    if (block.type === "quote") {
      const lines = buildLines(block.spans, { ...fonts, regular: italic }, DEFAULT_BODY_SIZE, GREY);
      for (const line of lines) {
        ensureSpace(DEFAULT_BODY_SIZE * LINE_HEIGHT);
        // Left indent bar
        page.drawRectangle({
          x: MARGIN,
          y: y - DEFAULT_BODY_SIZE,
          width: 3,
          height: DEFAULT_BODY_SIZE + 2,
          color: rgb(0.75, 0.75, 0.75),
        });
        writeLine(line, MARGIN + 12, y - DEFAULT_BODY_SIZE);
        y -= DEFAULT_BODY_SIZE * LINE_HEIGHT;
      }
      y -= 8;
      continue;
    }

    if (block.type === "code") {
      const size = 10;
      const lines = block.text.split("\n");
      const blockH = lines.length * size * LINE_HEIGHT + 12;
      ensureSpace(blockH + 12);
      // Background
      page.drawRectangle({
        x: MARGIN,
        y: y - blockH,
        width: LINE_W,
        height: blockH,
        color: rgb(0.96, 0.96, 0.98),
      });
      y -= 6;
      for (const l of lines) {
        ensureSpace(size * LINE_HEIGHT);
        page.drawText(l.replace(/\t/g, "    ").slice(0, 200), {
          x: MARGIN + 8,
          y: y - size,
          size,
          font: mono,
          color: rgb(...TEXT_BLACK),
        });
        y -= size * LINE_HEIGHT;
      }
      y -= 10;
      continue;
    }

    if (block.type === "hr") {
      ensureSpace(16);
      y -= 6;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_W - MARGIN, y },
        thickness: 0.75,
        color: rgb(0.78, 0.78, 0.78),
      });
      y -= 12;
      continue;
    }
  }

  return await doc.save({ useObjectStreams: true });
}

// ── UI ──────────────────────────────────────────────────────────────

const SAMPLE_MD = `# Project Report

This is a **sample** document rendered from *markdown*.

## Highlights

- Pure client-side rendering — \`pdf-lib\` + Helvetica + Courier.
- No new npm deps; minimal inline parser.
- Auto-pagination on A4 with 1-inch margins.

## Code sample

\`\`\`
function hello(name) {
  return "Hello, " + name;
}
\`\`\`

> Paste your own markdown on the left, hit Generate.

---

Generated with [pdfcraft ai](https://pdfcraftai.com).
`;

export function MarkdownToPdfTool() {
  const [src, setSrc] = useState<string>(SAMPLE_MD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ bytes: Uint8Array; name: string; size: number } | null>(null);

  const onUploadFile = async (f: File) => {
    setError(null);
    if (!/\.(md|markdown|txt)$/i.test(f.name)) {
      setError("Upload a .md, .markdown, or .txt file.");
      return;
    }
    const text = await f.text();
    setSrc(text);
  };

  const generate = useCallback(async () => {
    if (!src.trim()) {
      setError("Enter or paste some markdown first.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const bytes = await renderMarkdown(src);
      const name = deriveOutputName("document.md", "").replace(/\.md$/i, ".pdf");
      setResult({ bytes, name: name.endsWith(".pdf") ? name : `${name}.pdf`, size: bytes.length });
      try {
        const sha256 = await sha256HexOfBytes(bytes);
        await logToolResultAction({
          toolId: "markdown-to-pdf",
          name,
          mime: "application/pdf",
          sizeBytes: bytes.length,
          sha256,
        });
      } catch (logErr) {
        console.warn("logToolResult failed (non-fatal):", logErr);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Render failed.");
    } finally {
      setBusy(false);
    }
  }, [src]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        className="card"
        style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)" }}>
            MARKDOWN SOURCE
          </div>
          <div className="row" style={{ gap: 8 }}>
            <label className="btn btn-sm btn-ghost" style={{ cursor: "pointer" }}>
              <I.Upload size={12} />
              <span>Upload .md</span>
              <input
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadFile(f);
                }}
                style={{ display: "none" }}
              />
            </label>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setSrc(SAMPLE_MD)}
              disabled={busy}
            >
              Load sample
            </button>
          </div>
        </div>
        <textarea
          value={src}
          onChange={(e) => setSrc(e.target.value)}
          rows={18}
          disabled={busy}
          style={{
            width: "100%",
            padding: 12,
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            background: "var(--bg-1)",
            color: "var(--fg)",
            fontFamily: "var(--font-mono), ui-monospace, monospace",
            fontSize: 13,
            lineHeight: 1.5,
            resize: "vertical",
          }}
          placeholder="# Hello&#10;&#10;Paste your markdown here…"
        />
        <div className="subtle" style={{ fontSize: 11 }}>
          Supported: headers (# ## ###), paragraphs, **bold**, *italic*, `code`,
          fenced code blocks, lists (-/1.), quotes (&gt;), horizontal rules,
          [links](url). Tables and images not yet supported — on the v2 roadmap.
        </div>
      </div>

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {result && (
        <div className="card" style={{ padding: 20, borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--accent)",
                color: "var(--bg-1)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>PDF generated</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {result.name} · {humanSize(result.size)}
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => downloadBytes(result.bytes, result.name)}>
              <I.Download size={14} />
              <span>Download</span>
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !src.trim()}
          onClick={generate}
        >
          {busy ? "Rendering…" : "Generate PDF"}
        </button>
      </div>
    </div>
  );
}
