// Redaction helper — Phase 5.6.
//
// The user uploads a PDF. We:
//
//   1. Extract text *with positions* via pdfjs-dist — so we know where
//      every run sits in PDF user space. (The existing `extractPdfText`
//      helper strips positions to keep the LLM prompt small, so this
//      helper duplicates a leaner version of that extraction.)
//
//   2. Ship the flat text to the model and ask it to return a strict
//      JSON envelope listing every span of PII it would redact in a
//      production handoff — emails, phone numbers, SSNs, addresses,
//      person names, account numbers, API keys, etc. The envelope
//      format is identical to `lib/ai/table.ts` — we reuse the same
//      parse-with-fence-strip-and-TableParseError-style guard.
//
//   3. For each returned span, do whitespace-tolerant substring matching
//      against the concatenated per-page text so a name like "John
//      Smith" still matches when pdfjs emitted it as ["John ", "Smith"].
//      Every item the match overlaps gets a black rectangle drawn over
//      it in pdf-lib.
//
//   4. Save the redacted PDF and build a human-readable markdown
//      summary (categories + counts + per-finding reason) that the
//      route persists into `ai_outputs.content_md`.
//
// IMPORTANT: like every browser-accessible PDF redactor, we draw a
// visible overlay on the page. We do NOT strip the underlying text
// objects from the content stream, so determined users can still
// select-and-copy the redacted text. The UI surfaces this caveat next
// to the download button — users handling truly sensitive documents
// should print-to-PDF after downloading. A content-stream-stripping
// "true redaction" pass is a v2 item and will share this same JSON
// envelope contract.
//
// Design mirrors summarize / rewrite / table:
//   - Non-streaming `chat()` with a JSON-in-markdown parsing contract.
//   - 240k char input budget + truncation flag.
//   - 2400 output-token cap — a PII list is normally a couple of
//     hundred tokens even on a 100-page document, so this is generous.
//   - Throws on provider error / malformed JSON → route handler
//     catches + refunds.

import "server-only";

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, rgb } from "pdf-lib";

import { capForOp } from "./output-caps";
import type { ModerationResult } from "./output-moderation";
import { assertOutputSafe, moderateOutput } from "./output-moderation";
import type { AIProvider } from "./provider";
import { buildSafetyPreamble, wrapUntrustedInput } from "./prompt-safety";
import { NoRoutableProviderError, route } from "./router";
import type { AIProviderId, TokenUsage } from "./types";

// --- types ------------------------------------------------------------

/** 12 buckets that cover the vast majority of PII in business docs. */
export type PiiCategory =
  | "EMAIL"
  | "PHONE"
  | "SSN"
  | "CREDIT_CARD"
  | "ADDRESS"
  | "PERSON_NAME"
  | "DATE_OF_BIRTH"
  | "PASSPORT"
  | "DRIVER_LICENSE"
  | "IP_ADDRESS"
  | "API_KEY"
  | "BANK_ACCOUNT"
  | "OTHER";

const VALID_CATEGORIES: ReadonlySet<PiiCategory> = new Set<PiiCategory>([
  "EMAIL",
  "PHONE",
  "SSN",
  "CREDIT_CARD",
  "ADDRESS",
  "PERSON_NAME",
  "DATE_OF_BIRTH",
  "PASSPORT",
  "DRIVER_LICENSE",
  "IP_ADDRESS",
  "API_KEY",
  "BANK_ACCOUNT",
  "OTHER",
]);

export interface RedactInput {
  /** Raw PDF bytes. The route handler already cap-checks size. */
  pdfBytes: Uint8Array;
  /** Shown to the model in the system prompt; helpful for context. */
  filename?: string;
  /** Optional provider override, honored if configured. */
  preferredProvider?: AIProviderId;
}

/**
 * One PII span the model wanted to redact, with the pages we actually
 * drew a black rectangle on.
 */
export interface RedactFinding {
  category: PiiCategory;
  /** Exact substring the model returned. */
  text: string;
  /** Short justification from the model ("Company-assigned email.") */
  reason: string;
  /** 1-indexed pages where at least one rectangle was drawn. */
  pagesRedacted: number[];
  /** Total number of rectangles drawn for this finding. */
  occurrences: number;
}

/**
 * The model returned a finding but we couldn't locate its exact text in
 * the PDF (whitespace/Unicode mismatch, or the model hallucinated it).
 * Surfaced to the user so they know coverage isn't 100%.
 */
export interface UnmatchedFinding {
  category: PiiCategory;
  text: string;
  reason: string;
}

export interface RedactResult {
  /** Bytes of the PDF with black rectangles drawn over every match. */
  pdfBytes: Uint8Array;
  /** Filename suggestion for the redacted PDF download. */
  redactedPdfFilename: string;
  /** Markdown body the route persists to `ai_outputs.content_md`. */
  markdown: string;
  /** Matched findings, one per span-the-model-named. */
  findings: RedactFinding[];
  /** Findings the model named but we couldn't locate in the text. */
  unmatched: UnmatchedFinding[];
  pageCount: number;
  ocrCandidatePages: number[];
  providerId: AIProviderId;
  model: string;
  usage: TokenUsage;
  wasTruncated: boolean;
  /**
   * Task #28: output moderation verdict on the SUMMARY markdown.
   * Redact's PDF output is deterministic (black rectangles over
   * located spans) so no text leak is possible there — but the
   * summary markdown can echo category names and counts, and we
   * moderate it for completeness.
   */
  moderation: ModerationResult;
}

export class NoAIProviderConfiguredError extends Error {
  constructor() {
    super("No AI provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
    this.name = "NoAIProviderConfiguredError";
  }
}

/**
 * Thrown when the model returns JSON we can't parse as the expected
 * envelope. The route handler surfaces this as 502 redact_parse_failed
 * after refunding credits.
 */
export class RedactParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedactParseError";
  }
}

// --- constants --------------------------------------------------------

/** Same context budget as summarize / rewrite / table. */
const REDACT_CHAR_BUDGET = 240_000;

// Output-token cap is centralized in ./output-caps
// (OP_OUTPUT_CAP_TABLE.redact.default = 2400). Task #11 moved it out of
// this file so every op shares one source of truth and one hard ceiling.
// Sized for a densely PII-populated page (~50-80 spans with text +
// reason). Used below via `capForOp("redact")`.

/** Char threshold below which we flag a page as OCR-candidate. */
const OCR_CANDIDATE_CHAR_THRESHOLD = 20;

// --- pdfjs worker bootstrap (mirrors lib/ai/pdf-extract.ts) -----------

let workerConfigured = false;
function ensureWorkerConfigured(): void {
  if (workerConfigured) return;
  workerConfigured = true;
  const gw = (pdfjs as typeof pdfjs & { GlobalWorkerOptions: { workerSrc: string } })
    .GlobalWorkerOptions;
  try {
    const req = createRequire(import.meta.url);
    const workerPath = req.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    gw.workerSrc = pathToFileURL(workerPath).href;
  } catch {
    // Fall back to pdfjs's relative default; next.config.mjs's
    // outputFileTracingIncludes handles the copy.
  }
}

// --- orchestrator -----------------------------------------------------

export async function redactPdf(input: RedactInput): Promise<RedactResult> {
  // Task #21: route through the AI router. "redact" → openai primary.
  // PII enumeration is a structured-output JSON task where gpt-4o-mini
  // is 4-8× cheaper than haiku at comparable recall. See
  // COST_MATRIX_3PROVIDER.md §2 / M2.
  let provider: AIProvider;
  try {
    provider = await route("redact", { preferredId: input.preferredProvider });
  } catch (err) {
    if (err instanceof NoRoutableProviderError) {
      throw new NoAIProviderConfiguredError();
    }
    throw err;
  }

  // 1. Positioned extraction — per-page text items with PDF-space rects.
  const extraction = await extractPositionedText(input.pdfBytes);

  // 2. Ask the model for PII spans.
  const { truncatedText, wasTruncated } = truncateForContext(
    extraction.fullText
  );
  const systemPrompt = buildSystemPrompt({
    filename: input.filename,
    pageCount: extraction.pageCount,
    ocrCandidatePages: extraction.ocrCandidatePages,
    wasTruncated,
  });
  const userPrompt = buildUserPrompt({ text: truncatedText });

  const chat = await runChat(provider, {
    systemPrompt,
    userPrompt,
    maxTokens: capForOp("redact"),
  });

  const rawFindings = parseFindingsFromResponse(chat.text);

  // 3. Locate each finding's spans across the extracted items.
  const located = locateFindings(rawFindings, extraction.pages);

  // 4. Draw the redactions.
  const pdfBytes = await drawRedactions(input.pdfBytes, located.rects);

  // 5. Build a markdown summary for ai_outputs.content_md.
  const markdown = renderSummary({
    filename: input.filename,
    pageCount: extraction.pageCount,
    findings: located.findings,
    unmatched: located.unmatched,
    ocrCandidatePages: extraction.ocrCandidatePages,
    wasTruncated,
  });

  // Task #28: moderate the summary markdown. The redacted PDF itself
  // can't leak — it has rectangles over the matched spans — but the
  // summary text names categories and counts, and a malicious doc
  // could cause the model to echo names/emails verbatim in the
  // reason field. Critical findings refund + 502.
  const moderation = moderateOutput(markdown, { op: "redact" });
  assertOutputSafe(moderation, "redact");

  return {
    pdfBytes,
    redactedPdfFilename: deriveRedactedFilename(input.filename),
    markdown,
    findings: located.findings,
    unmatched: located.unmatched,
    pageCount: extraction.pageCount,
    ocrCandidatePages: extraction.ocrCandidatePages,
    providerId: chat.providerId,
    model: chat.model,
    usage: chat.usage,
    wasTruncated,
    moderation,
  };
}

// --- prompt builders --------------------------------------------------

function buildSystemPrompt(opts: {
  filename?: string;
  pageCount: number;
  ocrCandidatePages: number[];
  wasTruncated: boolean;
}): string {
  const title = opts.filename ? `"${opts.filename}"` : "an untitled PDF";
  const ocr = opts.ocrCandidatePages.length
    ? `\nPages ${opts.ocrCandidatePages.join(", ")} appear to be scanned ` +
      "images with minimal extractable text — do not invent findings for them.\n"
    : "";
  const truncation = opts.wasTruncated
    ? "\nThe source text was truncated to fit your context. PII appearing " +
      "after the truncation point will not be redacted — the route flags " +
      "this to the user.\n"
    : "";

  // Task #26: prepend safety preamble. See lib/ai/prompt-safety.ts.
  return (
    `${buildSafetyPreamble("redact")}\n\n` +
    `You are the PDFCraft AI redactor. The user has attached ${title} ` +
    `(${opts.pageCount} page${opts.pageCount === 1 ? "" : "s"}). ` +
    `Pages are delimited by \\f in the source text.\n\n` +
    "Your job: identify every span of personally identifiable or sensitive " +
    "information that a professional redactor would black out before this " +
    "document left the organisation. Return the full list in a strict JSON " +
    "envelope.\n\n" +
    "Categories to look for:\n" +
    "- EMAIL           — email addresses\n" +
    "- PHONE           — phone and fax numbers\n" +
    "- SSN             — US social security numbers\n" +
    "- CREDIT_CARD     — 13-19 digit card numbers\n" +
    "- ADDRESS         — street addresses (not city/state alone)\n" +
    "- PERSON_NAME     — full names of natural persons\n" +
    "- DATE_OF_BIRTH   — DOB spans, not arbitrary dates\n" +
    "- PASSPORT        — passport numbers\n" +
    "- DRIVER_LICENSE  — driver license numbers\n" +
    "- IP_ADDRESS      — IPv4 / IPv6 addresses\n" +
    "- API_KEY         — API keys, access tokens, secrets, private keys\n" +
    "- BANK_ACCOUNT    — bank account / routing / IBAN numbers\n" +
    "- OTHER           — anything else a redactor would black out\n\n" +
    "Rules:\n" +
    "- Return the exact substring as it appears in the source text. " +
    "Do NOT normalize, re-format, or paraphrase — the downstream locator " +
    "does whitespace-tolerant matching but cannot recover from arbitrary " +
    "rewrites. For a phone number emitted as `(415) 555-1234`, return " +
    "exactly `(415) 555-1234`.\n" +
    "- Do NOT return generic tokens like `John` or `Acme Corp` — only " +
    "include a span if it is concretely identifying.\n" +
    "- Company names, product names, generic titles (CEO, VP), and public " +
    "officials acting in official capacity are NOT PII — skip them.\n" +
    "- Return each distinct span once, even if it appears on multiple " +
    "pages. The locator will find every occurrence.\n" +
    "- `reason` is a short (≤12 words) justification in sentence case.\n" +
    "- Nothing to redact? Return `{ \"findings\": [] }`.\n\n" +
    "Output format — return ONLY this JSON, no preamble, no code fence:\n" +
    "{\n" +
    '  "findings": [\n' +
    "    {\n" +
    '      "category": "EMAIL" | "PHONE" | ... | "OTHER",\n' +
    '      "text": "exact span as it appears in the source",\n' +
    '      "reason": "Short justification"\n' +
    "    }\n" +
    "  ]\n" +
    "}\n\n" +
    "Before responding: mentally verify the JSON parses. Escape embedded " +
    "double-quotes in `text` and `reason` (`\\\"`) and any literal newlines " +
    "(`\\\\n`). A malformed response fails the extraction and the user has " +
    "to retry — avoid that." +
    ocr +
    truncation
  );
}

function buildUserPrompt(opts: { text: string }): string {
  // Task #26: wrap untrusted PDF text in sentinel tags.
  return (
    "Identify every PII span in the document inside the untrusted_input tag. Return the JSON " +
    "envelope.\n\n" +
    wrapUntrustedInput(opts.text, { sourceLabel: "pdf_text" })
  );
}

// --- adapter invocation ----------------------------------------------

async function runChat(
  provider: AIProvider,
  opts: { systemPrompt: string; userPrompt: string; maxTokens: number }
): Promise<{
  text: string;
  providerId: AIProviderId;
  model: string;
  usage: TokenUsage;
}> {
  const result = await provider.chat({
    systemPrompt: opts.systemPrompt,
    messages: [{ role: "user", content: opts.userPrompt }],
    maxTokens: opts.maxTokens,
    // 0.1 — deterministic structured JSON output. Same temp as table.ts.
    temperature: 0.1,
  });
  if (result.stopReason === "error") {
    throw new Error("AI provider returned an error stop reason");
  }
  return {
    text: result.text,
    providerId: result.providerId,
    model: result.model,
    usage: result.usage,
  };
}

// --- response parsing -------------------------------------------------

interface ModelFinding {
  category: PiiCategory;
  text: string;
  reason: string;
}

function parseFindingsFromResponse(raw: string): ModelFinding[] {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\n([\s\S]*)\n```$/);
  const jsonText = fenced ? fenced[1]!.trim() : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new RedactParseError(
      `Model did not return valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const arr = (parsed as { findings?: unknown })?.findings;
  if (!Array.isArray(arr)) {
    throw new RedactParseError("Model JSON missing `findings` array");
  }

  const out: ModelFinding[] = [];
  arr.forEach((raw, idx) => {
    if (!raw || typeof raw !== "object") {
      throw new RedactParseError(`findings[${idx}] is not an object`);
    }
    const o = raw as Record<string, unknown>;
    const rawCat = typeof o.category === "string" ? o.category.trim().toUpperCase() : "";
    const text = typeof o.text === "string" ? o.text : "";
    const reason =
      typeof o.reason === "string" && o.reason.trim()
        ? o.reason.trim()
        : "Flagged as PII";
    if (!text.trim()) return; // silently skip empty-text findings
    const category: PiiCategory = VALID_CATEGORIES.has(rawCat as PiiCategory)
      ? (rawCat as PiiCategory)
      : "OTHER";
    out.push({ category, text, reason });
  });
  return out;
}

// --- positioned extraction -------------------------------------------

interface PositionedItem {
  /** Original text run. */
  str: string;
  /** PDF user-space x of the run's left edge. */
  x: number;
  /** PDF user-space y of the baseline. */
  y: number;
  /** Width in PDF user-space units. */
  w: number;
  /** Height (ascent above baseline) in PDF user-space units. */
  h: number;
}

interface PositionedPage {
  pageNumber: number;
  width: number;
  height: number;
  items: PositionedItem[];
  /** Joined text with single space between items. */
  combined: string;
  /**
   * Map from char index in `combined` to index in `items`. Whitespace
   * inserted between items maps to `-1`.
   */
  charMap: number[];
  likelyNeedsOcr: boolean;
}

interface PositionedExtraction {
  pageCount: number;
  pages: PositionedPage[];
  fullText: string;
  ocrCandidatePages: number[];
}

async function extractPositionedText(
  bytes: Uint8Array
): Promise<PositionedExtraction> {
  ensureWorkerConfigured();

  // 2026-05-12 — defensive copy. pdfjs-dist's getDocument({data})
  // takes ownership of the Uint8Array under the hood (it can be
  // detached to the worker). The same `pdfBytes` is loaded by
  // pdf-lib upstream in the route handler — pdf-lib's load may
  // not detach but pdfjs's does, and either way passing the same
  // Uint8Array to two different libraries in sequence is brittle.
  // E2E (2026-05-12) caught "No PDF header found at offset=0" on
  // sample.pdf even though the bytes were valid coming in.
  const bytesCopy = new Uint8Array(bytes);
  const loadingTask = (
    pdfjs as typeof pdfjs & {
      getDocument: (opts: unknown) => { promise: Promise<PdfDocumentLike> };
    }
  ).getDocument({
    data: bytesCopy,
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
  });

  const doc = await loadingTask.promise;
  const pageCount = doc.numPages;
  const pages: PositionedPage[] = [];
  const ocrCandidatePages: number[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    try {
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PositionedItem[] = [];
      let combined = "";
      const charMap: number[] = [];

      for (const raw of content.items as unknown[]) {
        const item = raw as {
          str?: string;
          width?: number;
          height?: number;
          transform?: number[];
          hasEOL?: boolean;
        };
        if (typeof item.str !== "string" || item.str.length === 0) continue;
        const t = item.transform;
        if (!Array.isArray(t) || t.length < 6) continue;
        const x = Number(t[4]);
        const y = Number(t[5]);
        const h = Math.max(Number(item.height ?? 0), Math.abs(Number(t[3] ?? 0)));
        const w = Math.max(Number(item.width ?? 0), 0);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

        const itemIdx = items.length;
        items.push({ str: item.str, x, y, w, h });

        // Append to combined + charMap so later substring search can
        // recover which items a match spans.
        for (const _ch of item.str) {
          combined += _ch;
          charMap.push(itemIdx);
        }
        combined += " ";
        charMap.push(-1);
      }

      const trimmed = combined.trim();
      const likelyNeedsOcr = trimmed.length < OCR_CANDIDATE_CHAR_THRESHOLD;
      if (likelyNeedsOcr) ocrCandidatePages.push(i);

      pages.push({
        pageNumber: i,
        width: viewport.width,
        height: viewport.height,
        items,
        combined,
        charMap,
        likelyNeedsOcr,
      });
    } finally {
      page.cleanup();
    }
  }

  await doc.cleanup();
  await doc.destroy();

  // Full-text for the LLM: pages joined with \f like extractPdfText.
  const fullText = pages.map((p) => p.combined.trim()).join("\f");

  return { pageCount, pages, fullText, ocrCandidatePages };
}

interface PdfDocumentLike {
  numPages: number;
  getPage(n: number): Promise<PdfPageLike>;
  cleanup(): Promise<void>;
  destroy(): Promise<void>;
}
interface PdfPageLike {
  getViewport(opts: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: unknown[] }>;
  cleanup(): void;
}

// --- finding locator --------------------------------------------------

interface Rect {
  pageNumber: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

function locateFindings(
  rawFindings: ModelFinding[],
  pages: PositionedPage[]
): {
  findings: RedactFinding[];
  unmatched: UnmatchedFinding[];
  rects: Rect[];
} {
  const findings: RedactFinding[] = [];
  const unmatched: UnmatchedFinding[] = [];
  const rects: Rect[] = [];

  for (const f of rawFindings) {
    const needleRaw = f.text.trim();
    if (!needleRaw) {
      unmatched.push({ category: f.category, text: f.text, reason: f.reason });
      continue;
    }

    const needleCompressed = compressForMatch(needleRaw);
    if (!needleCompressed) {
      unmatched.push({ category: f.category, text: f.text, reason: f.reason });
      continue;
    }

    const pagesRedacted = new Set<number>();
    let occurrences = 0;

    for (const page of pages) {
      const matches = findAllWhitespaceTolerant(
        page.combined,
        needleCompressed
      );
      if (!matches.length) continue;

      for (const m of matches) {
        const spannedItemIdx = new Set<number>();
        for (let i = m.start; i <= m.end; i++) {
          const idx = page.charMap[i];
          if (idx != null && idx >= 0) spannedItemIdx.add(idx);
        }
        if (spannedItemIdx.size === 0) continue;
        for (const idx of spannedItemIdx) {
          const item = page.items[idx]!;
          rects.push({
            pageNumber: page.pageNumber,
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
          });
        }
        pagesRedacted.add(page.pageNumber);
        occurrences++;
      }
    }

    if (occurrences === 0) {
      unmatched.push({ category: f.category, text: f.text, reason: f.reason });
    } else {
      findings.push({
        category: f.category,
        text: f.text,
        reason: f.reason,
        pagesRedacted: [...pagesRedacted].sort((a, b) => a - b),
        occurrences,
      });
    }
  }

  return { findings, unmatched, rects };
}

/**
 * Lowercase + strip all whitespace. Used to normalize the needle so
 * findings like "John  Smith" match "John Smith" and vice versa.
 */
function compressForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

/**
 * Whitespace-tolerant substring search. Returns every match's
 * [start, end] character span in the ORIGINAL `haystack` string.
 *
 * Algorithm: build a "compressed" version of `haystack` (lowercase, no
 * whitespace) alongside an index array mapping each compressed char
 * back to its original position. Then plain `indexOf` on the compressed
 * form, map endpoints back. Handles multi-match.
 */
function findAllWhitespaceTolerant(
  haystack: string,
  needleCompressed: string
): { start: number; end: number }[] {
  if (!needleCompressed) return [];

  const lower = haystack.toLowerCase();
  let compressed = "";
  const toOriginal: number[] = [];
  for (let i = 0; i < lower.length; i++) {
    const ch = lower.charCodeAt(i);
    // Keep non-whitespace. Treat standard ASCII whitespace + non-breaking
    // space + form-feed as whitespace.
    const isWs =
      ch === 0x20 ||
      ch === 0x09 ||
      ch === 0x0a ||
      ch === 0x0b ||
      ch === 0x0c ||
      ch === 0x0d ||
      ch === 0xa0;
    if (isWs) continue;
    compressed += lower[i];
    toOriginal.push(i);
  }

  const matches: { start: number; end: number }[] = [];
  let idx = 0;
  while (idx <= compressed.length - needleCompressed.length) {
    const pos = compressed.indexOf(needleCompressed, idx);
    if (pos < 0) break;
    const endPos = pos + needleCompressed.length - 1;
    const start = toOriginal[pos];
    const end = toOriginal[endPos];
    if (start == null || end == null) break;
    matches.push({ start, end });
    idx = pos + 1;
  }
  return matches;
}

// --- pdf-lib drawing --------------------------------------------------

async function drawRedactions(
  pdfBytes: Uint8Array,
  rects: Rect[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const black = rgb(0, 0, 0);

  // Group rects by page.
  const byPage = new Map<number, Rect[]>();
  for (const r of rects) {
    const arr = byPage.get(r.pageNumber) ?? [];
    arr.push(r);
    byPage.set(r.pageNumber, arr);
  }

  for (const [pageNumber, pageRects] of byPage) {
    const pageIdx = pageNumber - 1;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;
    const page = pages[pageIdx]!;
    for (const r of pageRects) {
      // Over-draw by ~2px on each side. pdfjs reports baseline y, but
      // descenders drop a few units below; the extra pad keeps the tails
      // of `g`, `y`, `p` etc. under the box.
      page.drawRectangle({
        x: r.x - 1,
        y: r.y - 2,
        width: r.w + 2,
        height: r.h + 4,
        color: black,
        opacity: 1,
      });
    }
  }

  return doc.save();
}

// --- markdown summary --------------------------------------------------

function renderSummary(opts: {
  filename?: string;
  pageCount: number;
  findings: RedactFinding[];
  unmatched: UnmatchedFinding[];
  ocrCandidatePages: number[];
  wasTruncated: boolean;
}): string {
  const title = opts.filename
    ? `# Redaction report — ${opts.filename}\n`
    : "# Redaction report\n";

  const totalRects = opts.findings.reduce((acc, f) => acc + f.occurrences, 0);
  const categories = new Map<PiiCategory, number>();
  for (const f of opts.findings) {
    categories.set(f.category, (categories.get(f.category) ?? 0) + f.occurrences);
  }

  const parts: string[] = [title];
  parts.push(
    `We drew **${totalRects}** black rectangle${totalRects === 1 ? "" : "s"} ` +
      `across **${opts.pageCount}** page${opts.pageCount === 1 ? "" : "s"}, ` +
      `covering **${opts.findings.length}** distinct PII span${opts.findings.length === 1 ? "" : "s"}.\n`
  );

  if (opts.wasTruncated) {
    parts.push(
      "_Note: the source was truncated to fit the AI context. PII past the " +
        "truncation point was not redacted._\n"
    );
  }
  if (opts.ocrCandidatePages.length > 0) {
    parts.push(
      `_Note: page${opts.ocrCandidatePages.length === 1 ? "" : "s"} ` +
        `${opts.ocrCandidatePages.join(", ")} appear${opts.ocrCandidatePages.length === 1 ? "s" : ""} ` +
        "to be scanned — no text was extractable, so nothing was redacted " +
        "on them. Run OCR first, then re-redact._\n"
    );
  }

  // Categories summary.
  if (categories.size > 0) {
    parts.push("\n## By category\n");
    parts.push("| Category | Occurrences |");
    parts.push("| --- | --- |");
    [...categories.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, n]) => {
        parts.push(`| ${cat} | ${n} |`);
      });
  }

  // Detail list.
  if (opts.findings.length > 0) {
    parts.push("\n## Findings\n");
    parts.push("| # | Category | Text | Pages | Reason |");
    parts.push("| --- | --- | --- | --- | --- |");
    opts.findings.forEach((f, i) => {
      const text = escapeMdCell(f.text);
      const reason = escapeMdCell(f.reason);
      const pages = f.pagesRedacted.length
        ? f.pagesRedacted.join(", ")
        : "—";
      parts.push(`| ${i + 1} | ${f.category} | ${text} | ${pages} | ${reason} |`);
    });
  } else {
    parts.push("\n_No PII was identified in this document._\n");
  }

  if (opts.unmatched.length > 0) {
    parts.push("\n## Unmatched findings\n");
    parts.push(
      "The AI identified these spans but we couldn't locate their exact " +
        "text in the PDF — likely a whitespace/Unicode mismatch, or the " +
        "PII appears inside a rendered image. Review manually if needed.\n"
    );
    parts.push("| Category | Text | Reason |");
    parts.push("| --- | --- | --- |");
    opts.unmatched.forEach((u) => {
      parts.push(
        `| ${u.category} | ${escapeMdCell(u.text)} | ${escapeMdCell(u.reason)} |`
      );
    });
  }

  parts.push(
    "\n---\n\n" +
      "**Caveat:** the redaction is a visual overlay. The underlying text " +
      "objects are still present in the PDF's content stream and could be " +
      "recovered by selecting-and-copying or by text extraction. For " +
      "documents containing genuinely sensitive information, print the " +
      "redacted PDF to a new PDF (your OS's \"Print → Save as PDF\") — that " +
      "rasterises the content stream and guarantees the text underneath is " +
      "gone.\n"
  );

  return parts.join("\n") + "\n";
}

function escapeMdCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

// --- helpers ----------------------------------------------------------

function truncateForContext(text: string): {
  truncatedText: string;
  wasTruncated: boolean;
} {
  if (text.length <= REDACT_CHAR_BUDGET) {
    return { truncatedText: text, wasTruncated: false };
  }
  return {
    truncatedText: text.slice(0, REDACT_CHAR_BUDGET),
    wasTruncated: true,
  };
}

/**
 * "Quarterly Report.pdf" → "Quarterly Report — Redacted.pdf"
 * "draft"                → "draft — Redacted.pdf"
 */
function deriveRedactedFilename(source: string | undefined): string {
  const base = (source ?? "document").replace(/\.pdf$/i, "").trim() || "document";
  return `${base} — Redacted.pdf`;
}
