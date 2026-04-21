// Generate helper — Phase 5.6. Takes a plain-text prompt from the user
// and produces a professional-looking PDF.
//
// Two-stage pipeline:
//
//   1. Markdown drafting. We ask the model for a clean markdown document
//      given the prompt, doc type, length and tone. No fences, no
//      preamble — raw markdown only. Token budget scales with the
//      user's chosen length (short ~800, medium ~2000, long ~4500).
//
//   2. PDF layout. We take the returned markdown and render it onto
//      US-Letter pages via pdf-lib. A lightweight layout pass handles:
//         - H1 / H2 / H3 headings (font-weight + size ramp)
//         - Paragraphs with word-wrap + hanging indent control
//         - Unordered lists (`- ` / `* `) and ordered lists (`1. `)
//         - Horizontal rules (`---`)
//         - Bold (`**...**`) and italic (`_..._` / `*...*`) inline spans
//      A cover title line is inserted if the user supplied a `title` and
//      the first line of markdown isn't already an H1.
//
// Deliberately NOT supported in v1 (ship small, expand later):
//   - Tables → too much layout code; a paragraph fallback is fine for v1
//   - Images / code blocks / blockquotes
//   - Inline links (rendered as plain text; no clickable annotations)
//   - Nested lists beyond depth 2 (we clamp)
//
// Security posture: the rendered PDF contains only the user's prompt +
// the model's output. No embedded metadata from the session beyond the
// `Title` PDF metadata field (set to the supplied doc title or "Generated
// document"). Author/producer left to pdf-lib defaults.

import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { capForOp } from "./output-caps";
import type { ModerationResult } from "./output-moderation";
import { assertOutputSafe, moderateOutput } from "./output-moderation";
import type { AIProvider } from "./provider";
import { buildSafetyPreamble, wrapUntrustedInput } from "./prompt-safety";
import { selectProvider } from "./registry";
import type { AIProviderId, TokenUsage } from "./types";

/** Doc types the UI exposes. Controls the system-prompt framing only. */
export type GenerateDocType =
  | "memo"
  | "report"
  | "brief"
  | "letter"
  | "blog"
  | "outline"
  | "other";

/** Output length target. Maps to a max-tokens cap on the model side. */
export type GenerateLength = "short" | "medium" | "long";

/** Writing voice. */
export type GenerateTone = "neutral" | "formal" | "casual" | "technical";

export interface GenerateInput {
  /** The user's prompt — what they want us to write. Required. */
  prompt: string;
  /** Optional doc-type framing — mapped to a system-prompt snippet. */
  docType?: GenerateDocType;
  /** Output length target. Defaults to "medium". */
  length?: GenerateLength;
  /** Writing voice. Defaults to "neutral". */
  tone?: GenerateTone;
  /**
   * Optional title for the generated doc. Used in the PDF metadata and
   * inserted as an H1 at the top of the first page if the model's output
   * doesn't already start with one.
   */
  title?: string;
  /** Optional provider override, honored if configured. */
  preferredProvider?: AIProviderId;
}

export interface GenerateResult {
  /** Rendered PDF bytes. Route base64-encodes these for transport. */
  pdfBytes: Uint8Array;
  /** Suggested filename — based on `title` or falls back to "Generated document". */
  pdfFilename: string;
  /** The markdown we got from the model. Persisted to ai_outputs. */
  markdown: string;
  /** Total pages in the rendered PDF. */
  pageCount: number;
  providerId: AIProviderId;
  model: string;
  usage: TokenUsage;
  /** True if the model's max-tokens was hit (output probably truncated). */
  wasTruncated: boolean;
  /**
   * Task #28: output moderation verdict on the generated markdown.
   * We moderate the MARKDOWN (not the rendered PDF bytes) because
   * the PDF is a deterministic render of the markdown — any leak
   * originates in the model text, and moderating here lets us block
   * BEFORE the (expensive) pdf-lib render pass runs.
   */
  moderation: ModerationResult;
}

/**
 * Thrown when no AI provider is configured. Same pattern as the other
 * helpers; the route handler catches this and returns 503.
 */
export class NoAIProviderConfiguredError extends Error {
  constructor() {
    super("No AI provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
    this.name = "NoAIProviderConfiguredError";
  }
}

/**
 * Cap on the user prompt size. Generous — 8000 chars ≈ 2k tokens — is
 * enough for a multi-paragraph brief but small enough to keep the
 * system+user prompt well inside every provider's context window. This
 * is NOT the output cap (which lives in lib/ai/output-caps.ts); this is
 * the input cap to keep abusive payloads out of the model call.
 */
const PROMPT_CHAR_BUDGET = 8_000;

// Per-length output-token caps are centralized in ./output-caps
// (OP_OUTPUT_CAP_TABLE.generate). Task #11 moved them out of this file so
// every op + variant shares one source of truth and one hard ceiling.
// The short/medium/long values (900 / 2200 / 4600) are preserved there.
// If the user needs more than 4600 tokens they should split the request
// into multiple sections. Callers use `capForOp("generate", length)` below.

// --- public entry -----------------------------------------------------

export async function generatePdf(input: GenerateInput): Promise<GenerateResult> {
  const provider = await selectProvider({
    capabilityNeeded: "streaming",
    preferredId: input.preferredProvider,
  });
  if (!provider) throw new NoAIProviderConfiguredError();

  const length = input.length ?? "medium";
  const tone = input.tone ?? "neutral";
  const docType = input.docType ?? "other";

  const prompt = (input.prompt ?? "").slice(0, PROMPT_CHAR_BUDGET);

  const systemPrompt = buildSystemPrompt({ docType, length, tone, title: input.title });
  const userPrompt = buildUserPrompt({ prompt });

  const chat = await runChat(provider, {
    systemPrompt,
    userPrompt,
    maxTokens: capForOp("generate", length),
  });

  const markdown = postProcessMarkdown(chat.text);

  // Ensure an H1 at the top. If the user provided a title and the
  // generated markdown doesn't start with `#`, prepend the title.
  const normalizedMd = ensureLeadingH1(markdown, input.title);

  // Task #28: moderate the generated markdown BEFORE the pdf render.
  // A critical finding throws → we skip the render and refund via the
  // route handler. Moderating before render also keeps a leaked key
  // from being baked into PDF bytes we'd then have to regenerate.
  const moderation = moderateOutput(normalizedMd, { op: "generate" });
  assertOutputSafe(moderation, "generate");

  const renderTitle = input.title?.trim() || extractFirstHeading(normalizedMd) || "Generated document";
  const pdfBytes = await renderMarkdownToPdf({
    markdown: normalizedMd,
    title: renderTitle,
  });

  // Read page count back from the rendered document. Cheap — we're
  // about to hand these bytes off anyway.
  const loaded = await PDFDocument.load(pdfBytes);
  const pageCount = loaded.getPageCount();

  return {
    pdfBytes,
    pdfFilename: derivePdfFilename(renderTitle),
    markdown: normalizedMd,
    pageCount,
    providerId: chat.providerId,
    model: chat.model,
    usage: chat.usage,
    wasTruncated: chat.wasTruncated,
    moderation,
  };
}

// --- prompt builders --------------------------------------------------

function buildSystemPrompt(opts: {
  docType: GenerateDocType;
  length: GenerateLength;
  tone: GenerateTone;
  title?: string;
}): string {
  const docFrame = (() => {
    switch (opts.docType) {
      case "memo":
        return "Produce an internal memo: short TL;DR at top, then supporting sections with clear H2 headings.";
      case "report":
        return "Produce a polished report with an executive summary, body sections with H2 headings, and a brief conclusion or recommendations section.";
      case "brief":
        return "Produce a tight brief: 1–2 sentence summary, 3–5 concise sections, no filler. No H3 subheadings.";
      case "letter":
        return "Produce a business letter. Start with a short opening paragraph addressing the reader, 2–4 body paragraphs, and a brief closing. No H2/H3 headings in the body — use paragraph flow instead.";
      case "blog":
        return "Produce a blog post with an engaging H1 title, a hook paragraph, 3–5 body sections with H2 headings, and a short closing. Write in an approachable voice.";
      case "outline":
        return "Produce a structured outline: H1 title, then H2 sections, each followed by 3–5 bulleted points. Do not write paragraphs — outlines are bullets only.";
      case "other":
      default:
        return "Produce a well-structured document. Pick an appropriate format for the request: headings where useful, paragraphs for narrative, bullets for lists.";
    }
  })();

  const toneLine = (() => {
    switch (opts.tone) {
      case "formal":
        return "Tone: formal and professional. Active voice. No contractions.";
      case "casual":
        return "Tone: conversational and approachable. Contractions allowed. Keep it accurate.";
      case "technical":
        return "Tone: technical and precise. Use domain terms accurately. Define acronyms inline on first use.";
      case "neutral":
      default:
        return "Tone: clear and neutral. Professional, not stiff.";
    }
  })();

  const lengthLine = (() => {
    switch (opts.length) {
      case "short":
        return "Length: ~300–500 words. Keep it tight.";
      case "long":
        return "Length: ~1500–3000 words. Use enough sections to cover the topic thoroughly.";
      case "medium":
      default:
        return "Length: ~800–1200 words. Enough to be substantive, not padded.";
    }
  })();

  const titleLine = opts.title?.trim()
    ? `The document title is "${opts.title.trim()}". Begin with this as an H1 (# ${opts.title.trim()}).`
    : "Begin with an H1 heading (#) that names the document.";

  // Task #26: prepend safety preamble so the model treats the wrapped
  // user prompt as untrusted data. See lib/ai/prompt-safety.ts.
  return [
    buildSafetyPreamble("generate"),
    "",
    "You are the PDFCraft AI document generator. The user will send a prompt describing what they want written. Produce the document in clean markdown.",
    "",
    docFrame,
    toneLine,
    lengthLine,
    titleLine,
    "",
    "Markdown rules:",
    "- One H1 at the top (use `# Title`). Use H2 (`## Section`) for main sections and H3 (`### Subsection`) sparingly for subsections.",
    "- Paragraphs separated by blank lines.",
    "- Bulleted lists use `- ` at the start of each line. Numbered lists use `1. ` / `2. ` etc.",
    "- Horizontal rules use `---` on their own line.",
    "- Bold with `**text**`, italics with `*text*`.",
    "- Do NOT use code fences, blockquotes, tables, or inline links — these are not rendered.",
    "- Do NOT wrap your entire response in a fence (```markdown). Return raw markdown only.",
    "- Do NOT add a preamble (\"Here is the document:\"). Start with the H1.",
  ].join("\n");
}

function buildUserPrompt(opts: { prompt: string }): string {
  // Task #26: wrap the user's free-form prompt in sentinel tags so the
  // model treats its contents strictly as subject-matter, not as
  // instructions that could override the system prompt.
  return (
    `Write the document per the system instructions. The user's prompt is inside the untrusted_input tag.\n\n` +
    wrapUntrustedInput(opts.prompt, { sourceLabel: "user_prompt" })
  );
}

// --- adapter invocation -----------------------------------------------

async function runChat(
  provider: AIProvider,
  opts: { systemPrompt: string; userPrompt: string; maxTokens: number }
): Promise<{
  text: string;
  providerId: AIProviderId;
  model: string;
  usage: TokenUsage;
  wasTruncated: boolean;
}> {
  const result = await provider.chat({
    systemPrompt: opts.systemPrompt,
    messages: [{ role: "user", content: opts.userPrompt }],
    maxTokens: opts.maxTokens,
    // 0.4 — a notch above rewrite's 0.3. Document generation benefits
    // from a little variety so successive runs don't feel like templates.
    temperature: 0.4,
    // Task #10: Anthropic prompt caching. Generate's system prompt is
    // long and depth-parameterised but STABLE per depth, and most calls
    // in a given hour share a depth — perfect cache target. Non-Anthropic
    // adapters ignore the flag.
    cacheSystemPrompt: true,
  });
  if (result.stopReason === "error") {
    throw new Error("AI provider returned an error stop reason");
  }
  // Some adapters surface `max_tokens` as stopReason="max_tokens" or
  // "length"; treat both as truncation. "end_turn" / "stop" are clean.
  const stop = String(result.stopReason ?? "").toLowerCase();
  const wasTruncated = stop === "max_tokens" || stop === "length";
  return {
    text: result.text,
    providerId: result.providerId,
    model: result.model,
    usage: result.usage,
    wasTruncated,
  };
}

// --- markdown hygiene -------------------------------------------------

function postProcessMarkdown(text: string): string {
  const cleaned = text.trim();
  const fenceMatch = cleaned.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/);
  if (fenceMatch) return fenceMatch[1]!.trim();
  return cleaned;
}

function ensureLeadingH1(md: string, title?: string): string {
  const trimmed = md.trimStart();
  if (trimmed.startsWith("# ")) return md;
  if (!title?.trim()) return md;
  return `# ${title.trim()}\n\n${md}`;
}

function extractFirstHeading(md: string): string | null {
  const lines = md.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^#{1,3}\s+(.+)$/);
    if (m) return m[1]!.trim();
  }
  return null;
}

function derivePdfFilename(title: string): string {
  const safe = title
    .replace(/[\\/:"*?<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const base = safe || "Generated document";
  return `${base}.pdf`;
}

// --- pdf-lib markdown renderer ---------------------------------------
//
// A deliberately small layout pass. The goal is "readable, professional
// PDF" not "pixel-perfect typography." We use the 14 standard base fonts
// (Helvetica + Bold + Oblique) so we don't need to embed a font file,
// and we lay out onto US-Letter at 1" margins.

type MdBlock =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "para"; text: string }
  | { kind: "ulist"; items: string[] }
  | { kind: "olist"; items: string[] }
  | { kind: "hr" };

type InlineSpan = { text: string; bold: boolean; italic: boolean };

interface LayoutCtx {
  doc: PDFDocument;
  regular: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  italic: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  boldItalic: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  pageWidth: number;
  pageHeight: number;
  marginX: number;
  marginY: number;
  contentWidth: number;
  /** Current page + cursor y (in pts; y grows upward from bottom-left). */
  page: ReturnType<PDFDocument["addPage"]>;
  cursorY: number;
}

async function renderMarkdownToPdf(opts: {
  markdown: string;
  title: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title);
  doc.setProducer("pdfcraft ai");
  doc.setCreator("pdfcraft ai");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

  // US-Letter, 1" margins. 612 x 792 pts; 72 pts = 1 inch.
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 72;
  const marginY = 72;
  const contentWidth = pageWidth - marginX * 2;

  const page = doc.addPage([pageWidth, pageHeight]);
  const ctx: LayoutCtx = {
    doc,
    regular,
    bold,
    italic,
    boldItalic,
    pageWidth,
    pageHeight,
    marginX,
    marginY,
    contentWidth,
    page,
    cursorY: pageHeight - marginY,
  };

  const blocks = parseMarkdown(opts.markdown);
  for (const block of blocks) {
    layoutBlock(ctx, block);
  }

  return doc.save();
}

// --- markdown parser -------------------------------------------------
//
// Intentionally minimal — regex pass over lines, grouped into blocks.
// Handles everything the system prompt is allowed to emit. Robust
// against the model occasionally inserting unexpected constructs:
// anything unrecognized falls through as a paragraph.

function parseMarkdown(md: string): MdBlock[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]!;
    const line = raw.trimEnd();

    // Blank line — skip.
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^---+\s*$/.test(line) || /^\*\*\*+\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    // Headings.
    const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      const levelRaw = hMatch[1]!.length;
      const level = Math.min(levelRaw, 3) as 1 | 2 | 3; // clamp H4+ to H3
      const text = hMatch[2]!.trim();
      blocks.push({ kind: level === 1 ? "h1" : level === 2 ? "h2" : "h3", text });
      i++;
      continue;
    }

    // Unordered list — consume consecutive `- ` or `* ` lines.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*[-*]\s+/, "").trim());
        i++;
      }
      blocks.push({ kind: "ulist", items });
      continue;
    }

    // Ordered list — consume consecutive `N. ` lines.
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*\d+[.)]\s+/, "").trim());
        i++;
      }
      blocks.push({ kind: "olist", items });
      continue;
    }

    // Default: paragraph. Consume contiguous non-blank / non-block
    // starting lines.
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i]!;
      if (next.trim() === "") break;
      if (/^(#{1,6})\s+/.test(next)) break;
      if (/^---+\s*$/.test(next) || /^\*\*\*+\s*$/.test(next)) break;
      if (/^\s*[-*]\s+/.test(next)) break;
      if (/^\s*\d+[.)]\s+/.test(next)) break;
      paraLines.push(next.trimEnd());
      i++;
    }
    blocks.push({ kind: "para", text: paraLines.join(" ") });
  }

  return blocks;
}

// --- inline parser ---------------------------------------------------
//
// Single left-to-right scan producing `InlineSpan[]`. Supports:
//
//   **bold**, __bold__, *italic*, _italic_
//
// Nesting is handled cheaply — bold-italic (`***text***` or `**_text_**`)
// works because we track both states independently. Unterminated markers
// are rendered as literal characters, which is the lesser of two evils
// (losing chars is worse than a stray `*` showing up).

function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let bold = false;
  let italic = false;
  let buffer = "";

  const flush = () => {
    if (buffer.length > 0) {
      spans.push({ text: buffer, bold, italic });
      buffer = "";
    }
  };

  let i = 0;
  while (i < text.length) {
    // **bold** or __bold__
    if (
      (text.startsWith("**", i) || text.startsWith("__", i)) &&
      // Don't treat `**` as bold if it's actually closing a bolditalic
      // that also uses `*` — the cheapest heuristic is: peek ahead for a
      // matching marker. If there isn't one, fall through as literal.
      hasClosingMarker(text, i, text.slice(i, i + 2))
    ) {
      flush();
      bold = !bold;
      i += 2;
      continue;
    }
    // *italic* or _italic_
    if (
      (text[i] === "*" || text[i] === "_") &&
      // Don't treat `*` as italic when it's actually part of `**`.
      !(text[i] === "*" && text[i + 1] === "*") &&
      !(text[i] === "_" && text[i + 1] === "_") &&
      hasClosingMarker(text, i, text[i]!)
    ) {
      flush();
      italic = !italic;
      i += 1;
      continue;
    }
    buffer += text[i]!;
    i++;
  }
  flush();
  return spans;
}

function hasClosingMarker(text: string, from: number, marker: string): boolean {
  const next = text.indexOf(marker, from + marker.length);
  return next !== -1;
}

// --- layout ----------------------------------------------------------

function layoutBlock(ctx: LayoutCtx, block: MdBlock) {
  switch (block.kind) {
    case "h1":
      drawHeading(ctx, block.text, 24, 12, 20);
      break;
    case "h2":
      drawHeading(ctx, block.text, 18, 10, 14);
      break;
    case "h3":
      drawHeading(ctx, block.text, 14, 8, 10);
      break;
    case "para":
      drawParagraph(ctx, block.text);
      break;
    case "ulist":
      drawList(ctx, block.items, (_n) => "\u2022");
      break;
    case "olist":
      drawList(ctx, block.items, (n) => `${n + 1}.`);
      break;
    case "hr":
      drawHr(ctx);
      break;
  }
}

function drawHeading(
  ctx: LayoutCtx,
  text: string,
  size: number,
  gapAfter: number,
  gapBefore: number
) {
  // Gap before (slightly smaller than the gap after to anchor the
  // heading visually to its body).
  ctx.cursorY -= gapBefore;
  // Word-wrap via the bold font.
  const lines = wrapText(text, ctx.bold, size, ctx.contentWidth);
  for (const line of lines) {
    ensureSpace(ctx, size + 4);
    ctx.page.drawText(line, {
      x: ctx.marginX,
      y: ctx.cursorY - size,
      size,
      font: ctx.bold,
      color: rgb(0.1, 0.1, 0.12),
    });
    ctx.cursorY -= size + 4;
  }
  ctx.cursorY -= gapAfter;
}

function drawParagraph(ctx: LayoutCtx, text: string) {
  const size = 11;
  const lineHeight = 16;
  const spans = parseInline(text);

  // Wrap the inline spans into per-line span arrays.
  const wrappedLines = wrapInlineSpans(ctx, spans, size, ctx.contentWidth);

  for (const line of wrappedLines) {
    ensureSpace(ctx, lineHeight);
    let x = ctx.marginX;
    for (const span of line) {
      const font = pickFont(ctx, span.bold, span.italic);
      if (span.text.length === 0) continue;
      ctx.page.drawText(span.text, {
        x,
        y: ctx.cursorY - size,
        size,
        font,
        color: rgb(0.16, 0.17, 0.19),
      });
      x += font.widthOfTextAtSize(span.text, size);
    }
    ctx.cursorY -= lineHeight;
  }
  // Inter-paragraph gap.
  ctx.cursorY -= 6;
}

function drawList(
  ctx: LayoutCtx,
  items: string[],
  marker: (index: number) => string
) {
  const size = 11;
  const lineHeight = 16;
  const bulletIndent = 14;
  const textIndent = 28;

  items.forEach((item, idx) => {
    const spans = parseInline(item);
    const wrappedLines = wrapInlineSpans(
      ctx,
      spans,
      size,
      ctx.contentWidth - textIndent
    );

    wrappedLines.forEach((line, lineIdx) => {
      ensureSpace(ctx, lineHeight);
      if (lineIdx === 0) {
        // Draw the bullet / number on the first line.
        ctx.page.drawText(marker(idx), {
          x: ctx.marginX + bulletIndent,
          y: ctx.cursorY - size,
          size,
          font: ctx.regular,
          color: rgb(0.3, 0.3, 0.34),
        });
      }
      let x = ctx.marginX + textIndent;
      for (const span of line) {
        if (span.text.length === 0) continue;
        const font = pickFont(ctx, span.bold, span.italic);
        ctx.page.drawText(span.text, {
          x,
          y: ctx.cursorY - size,
          size,
          font,
          color: rgb(0.16, 0.17, 0.19),
        });
        x += font.widthOfTextAtSize(span.text, size);
      }
      ctx.cursorY -= lineHeight;
    });
    // Tiny inter-item gap.
    ctx.cursorY -= 2;
  });
  // Post-list gap.
  ctx.cursorY -= 6;
}

function drawHr(ctx: LayoutCtx) {
  ensureSpace(ctx, 12);
  ctx.cursorY -= 6;
  ctx.page.drawLine({
    start: { x: ctx.marginX, y: ctx.cursorY },
    end: { x: ctx.marginX + ctx.contentWidth, y: ctx.cursorY },
    thickness: 0.5,
    color: rgb(0.78, 0.79, 0.82),
  });
  ctx.cursorY -= 12;
}

// --- wrapping --------------------------------------------------------

function wrapText(
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  size: number,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const tentative = current.length === 0 ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(tentative, size) > maxWidth && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = tentative;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * Wrap inline spans (bold/italic mixes) onto lines that fit within
 * `maxWidth`. Each output line is itself a span array. Words that blow
 * through the width on their own are allowed to overflow (rare — mostly
 * URLs); a proper soft-break implementation is overkill for v1.
 */
function wrapInlineSpans(
  ctx: LayoutCtx,
  spans: InlineSpan[],
  size: number,
  maxWidth: number
): InlineSpan[][] {
  const lines: InlineSpan[][] = [];
  let currentLine: InlineSpan[] = [];
  let currentWidth = 0;

  for (const span of spans) {
    const font = pickFont(ctx, span.bold, span.italic);
    const words = span.text.split(/(\s+)/); // keep whitespace tokens
    for (const word of words) {
      if (word.length === 0) continue;
      const w = font.widthOfTextAtSize(word, size);
      if (currentWidth + w > maxWidth && currentLine.length > 0) {
        // Flush current line, start a new one (trimming any trailing
        // whitespace-only span).
        const trimmed = trimTrailingWhitespace(currentLine);
        lines.push(trimmed);
        currentLine = [];
        currentWidth = 0;
        // Don't start a new line with pure whitespace.
        if (/^\s+$/.test(word)) continue;
      }
      // Append to current line. Merge into the last span if same
      // bold/italic combo to minimize drawText calls.
      const last = currentLine[currentLine.length - 1];
      if (last && last.bold === span.bold && last.italic === span.italic) {
        last.text += word;
      } else {
        currentLine.push({ text: word, bold: span.bold, italic: span.italic });
      }
      currentWidth += w;
    }
  }
  if (currentLine.length > 0) {
    lines.push(trimTrailingWhitespace(currentLine));
  }
  return lines;
}

function trimTrailingWhitespace(line: InlineSpan[]): InlineSpan[] {
  if (line.length === 0) return line;
  const last = line[line.length - 1]!;
  const trimmed = last.text.replace(/\s+$/, "");
  if (trimmed === last.text) return line;
  if (trimmed.length === 0) {
    return line.slice(0, -1);
  }
  return [...line.slice(0, -1), { ...last, text: trimmed }];
}

function pickFont(
  ctx: LayoutCtx,
  bold: boolean,
  italic: boolean
): Awaited<ReturnType<PDFDocument["embedFont"]>> {
  if (bold && italic) return ctx.boldItalic;
  if (bold) return ctx.bold;
  if (italic) return ctx.italic;
  return ctx.regular;
}

// --- pagination ------------------------------------------------------

function ensureSpace(ctx: LayoutCtx, needed: number) {
  if (ctx.cursorY - needed >= ctx.marginY) return;
  // New page.
  ctx.page = ctx.doc.addPage([ctx.pageWidth, ctx.pageHeight]);
  ctx.cursorY = ctx.pageHeight - ctx.marginY;
}
