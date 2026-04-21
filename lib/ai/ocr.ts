// OCR helper — Phase 5.4.
//
// Extracts text from a scanned or image-only PDF by sending each page
// through the provider's native PDF-vision path (a `DocumentBlock` in
// our portable content-block union). No local rasterization, no native
// canvas binary — Anthropic's API renders the page internally and
// performs vision OCR.
//
// Architecture:
//
//   - Input: the raw PDF bytes, its extracted page count, and the
//     caller-facing filename.
//   - We split the PDF page-by-page with `pdf-lib` and send one
//     `provider.chat()` call per page. Per-page calls avoid the terminal
//     output-token cap (a 50-page transcription doesn't fit in 4096
//     tokens) and keep each prompt short enough for low-latency
//     responses.
//   - Outputs are stitched with `## Page N` headers. `[?]` markers in the
//     model output signal low-confidence characters.
//   - Token usage sums across pages — the caller records the total on
//     `ai_outputs.meta` just like summarize.
//   - Hard cap: MAX_OCR_PAGES (50). Requests above the cap transcribe
//     the first 50 pages and return `wasTruncated = true` so the route
//     handler can surface the warning without failing the whole run.
//
// Why not rasterize locally:
//
//   - Server-side rasterization needs a Node canvas binary
//     (`@napi-rs/canvas`, `canvas`, `sharp` + pdfjs, etc). All three
//     add ~15-25MB native deps that conflict with the Hostinger
//     zero-native-dep deploy target we committed to in Phase 3.
//   - Anthropic's document content block handles rasterization + vision
//     inside the model call — we get equivalent quality for free.
//   - Provider portability: if we later add an OpenAI Files-API path,
//     the OCR helper doesn't need rasterization either; each adapter
//     exposes its own pdfInput route.
//
// Provider selection:
//
//   - `router.route("ocr", { preferredId })` — the per-op router (Task
//     #21) walks the ocr routing ladder (`gemini → anthropic` by
//     default) and returns the first configured provider whose
//     `capabilities.pdfInput` is true. OpenAI's adapter rejects document
//     blocks with UnsupportedCapabilityError (we don't use its Files
//     API yet), so the router skips it for this op even though it's in
//     the general registry.
//   - If no such provider is configured, the router throws
//     `NoRoutableProviderError`; we map that to `NoOcrProviderConfiguredError`
//     to preserve the existing 503 surface in the route handler.

import "server-only";

import { PDFDocument } from "pdf-lib";

import { capForOp } from "./output-caps";
import type { ModerationResult } from "./output-moderation";
import { assertOutputSafe, moderateOutput } from "./output-moderation";
import type { AIProvider } from "./provider";
import { buildSafetyPreamble } from "./prompt-safety";
import { NoRoutableProviderError, route } from "./router";
import type {
  AIProviderId,
  ContentBlock,
  DocumentBlock,
  TokenUsage,
} from "./types";

/** Hard cap on pages per OCR call. See file header for rationale. */
export const MAX_OCR_PAGES = 50;

// Per-page output-token cap is centralized in ./output-caps
// (OP_OUTPUT_CAP_TABLE.ocr.default = 1500). Task #11 moved it out of this
// file so every op shares one source of truth and one hard ceiling. ~1500
// tokens ≈ 5–6k chars of text — enough for a dense letter-size page plus
// markdown overhead. Used below via `capForOp("ocr")`.

export interface OcrInput {
  /** Raw PDF bytes. */
  pdfBytes: Uint8Array;
  /** Total pages in the PDF (from `extractPdfText` or pdf-lib peek). */
  pageCount: number;
  /** Caller-facing filename; shown to the model and persisted in meta. */
  filename?: string;
  /** Optional provider override — registry honors if it has `pdfInput`. */
  preferredProvider?: AIProviderId;
}

export interface OcrResult {
  /**
   * Full markdown output, pages joined with `## Page N` headers.
   * Persisted to `ai_outputs.content_md`.
   */
  markdown: string;
  providerId: AIProviderId;
  model: string;
  /** Summed across per-page calls. */
  usage: TokenUsage;
  /** Pages actually transcribed — `min(pageCount, MAX_OCR_PAGES)`. */
  processedPageCount: number;
  /** True when the source exceeded MAX_OCR_PAGES and was clipped. */
  wasTruncated: boolean;
  /**
   * Task #28: output moderation verdict on the FINAL joined markdown.
   * We deliberately moderate once at the end rather than per-page
   * because (a) per-page would 10x the regex cost on a 50-page doc
   * and (b) findings that span page boundaries (a redacted address
   * broken across a page break) would be missed.
   */
  moderation: ModerationResult;
}

export class NoOcrProviderConfiguredError extends Error {
  constructor() {
    super(
      "No AI provider with pdfInput capability is configured. OCR needs a " +
        "provider that accepts PDF document content blocks (e.g. Anthropic)."
    );
    this.name = "NoOcrProviderConfiguredError";
  }
}

/**
 * Run OCR over a PDF. Returns markdown with `## Page N` headers and
 * per-page bodies. The route handler is responsible for persisting
 * and for credit ledger bookkeeping.
 */
export async function ocrPdf(input: OcrInput): Promise<OcrResult> {
  let provider: AIProvider;
  try {
    provider = await route("ocr", { preferredId: input.preferredProvider });
  } catch (err) {
    if (err instanceof NoRoutableProviderError) {
      throw new NoOcrProviderConfiguredError();
    }
    throw err;
  }

  const processedPageCount = Math.min(input.pageCount, MAX_OCR_PAGES);
  const wasTruncated = input.pageCount > MAX_OCR_PAGES;

  // Load once, slice per page. pdf-lib's copyPages is cheap relative
  // to the network call we're about to make per page.
  const src = await PDFDocument.load(input.pdfBytes);

  const pageMarkdowns: string[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let chosenModel = provider.defaultModel;

  for (let i = 0; i < processedPageCount; i++) {
    const pageNumber = i + 1;
    const singlePageBytes = await extractSinglePage(src, i);

    const result = await runPageOcr(provider, {
      pdfBytes: singlePageBytes,
      pageNumber,
      totalPageCount: input.pageCount,
      filename: input.filename,
    });

    pageMarkdowns.push(formatPageMarkdown(pageNumber, result.text));
    totalInput += result.usage.inputTokens;
    totalOutput += result.usage.outputTokens;
    chosenModel = result.model;
  }

  const markdown = pageMarkdowns.join("\n\n");

  // Task #28: moderate the FINAL joined markdown. OCR is the op most
  // likely to echo verbatim PII from a scanned document (IDs, phone
  // numbers, SSNs on tax forms). Critical findings refund + 502.
  const moderation = moderateOutput(markdown, { op: "ocr" });
  assertOutputSafe(moderation, "ocr");

  return {
    markdown,
    providerId: provider.id,
    model: chosenModel,
    usage: { inputTokens: totalInput, outputTokens: totalOutput },
    processedPageCount,
    wasTruncated,
    moderation,
  };
}

// --- per-page plumbing ------------------------------------------------

async function extractSinglePage(
  src: PDFDocument,
  zeroIndexedPage: number
): Promise<Uint8Array> {
  // Fresh doc per page — we want a clean, minimal PDF byte payload to
  // keep the network call under Anthropic's per-request size budget
  // (32MB today). Copying one page typically lands under 1MB even for
  // high-DPI scans.
  const single = await PDFDocument.create();
  const [copied] = await single.copyPages(src, [zeroIndexedPage]);
  single.addPage(copied);
  return single.save();
}

async function runPageOcr(
  provider: AIProvider,
  opts: {
    pdfBytes: Uint8Array;
    pageNumber: number;
    totalPageCount: number;
    filename?: string;
  }
): Promise<{ text: string; usage: TokenUsage; model: string }> {
  const systemPrompt = buildSystemPrompt({
    pageNumber: opts.pageNumber,
    totalPageCount: opts.totalPageCount,
    filename: opts.filename,
  });

  const docBlock: DocumentBlock = {
    type: "document",
    mediaType: "application/pdf",
    data: toBase64(opts.pdfBytes),
    ...(opts.filename ? { name: `${opts.filename} (page ${opts.pageNumber})` } : {}),
  };

  const userContent: ContentBlock[] = [
    docBlock,
    {
      type: "text",
      text:
        "Transcribe the page. Use markdown: `#`/`##` for headings, `-` for " +
        "bullets, markdown tables for tables, `> ` for quotes. Preserve " +
        "reading order. Mark characters you cannot read confidently with " +
        "`[?]`. Output ONLY the transcribed markdown — no preamble, no " +
        "closing comment, no ```markdown fence.",
    },
  ];

  const result = await provider.chat({
    systemPrompt,
    messages: [{ role: "user", content: userContent }],
    maxTokens: capForOp("ocr"),
    // Temperature 0 — OCR is transcription, not generation. Any drift
    // from the image is wrong by definition.
    temperature: 0,
  });
  if (result.stopReason === "error") {
    // Defensive — .chat() throws on error chunks. Same belt-and-braces
    // branch as summarize.ts.
    throw new Error(`OCR page ${opts.pageNumber}: provider returned error stop reason`);
  }
  return {
    text: postProcessPageText(result.text),
    usage: result.usage,
    model: result.model,
  };
}

// --- prompt builder ---------------------------------------------------

function buildSystemPrompt(opts: {
  pageNumber: number;
  totalPageCount: number;
  filename?: string;
}): string {
  const title = opts.filename ? `"${opts.filename}"` : "an untitled PDF";
  // Task #26: prepend safety preamble. OCR is uniquely vulnerable —
  // the PDF image can contain instructions visually rendered into it
  // that the model will OCR and then be tempted to follow. See
  // lib/ai/prompt-safety.ts.
  return (
    `${buildSafetyPreamble("ocr")}\n\n` +
    `You are the PDFCraft AI OCR engine. The user has attached one page ` +
    `from ${title} (page ${opts.pageNumber} of ${opts.totalPageCount}). ` +
    `Your job is to transcribe the visible text into clean markdown.\n\n` +
    `Rules:\n` +
    `- Do not paraphrase. Produce the exact text on the page.\n` +
    `- Preserve headings, lists, tables, and block quotes using markdown.\n` +
    `- Use \`[?]\` for illegible characters or short runs you cannot read.\n` +
    `- If the page is blank or contains only images with no readable text, ` +
    `output the single line \`_(no readable text on this page)_\`.\n` +
    `- Do not invent content. If you are not sure a character was there, ` +
    `mark it \`[?]\` instead of guessing.\n` +
    `- Output markdown body only. No "Page N" header — the caller adds it.`
  );
}

// --- post-processing --------------------------------------------------

function formatPageMarkdown(pageNumber: number, body: string): string {
  const trimmed = body.trim();
  const cleanBody = trimmed.length > 0 ? trimmed : "_(no readable text on this page)_";
  return `## Page ${pageNumber}\n\n${cleanBody}`;
}

/**
 * Strip the occasional ```markdown fence the model adds despite the
 * "no fence" instruction. Mirror of summarize.ts' postProcessMarkdown
 * minus the depth-specific TL;DR title.
 */
function postProcessPageText(text: string): string {
  let cleaned = text.trim();
  const fence = cleaned.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/);
  if (fence) cleaned = fence[1]!.trim();
  return cleaned;
}

// --- base64 ------------------------------------------------------------

/**
 * Node Buffer is available in the Next.js Node runtime, which every
 * `/api/ai/*` route runs in. If we ever add an Edge-runtime caller
 * this needs a Uint8Array → base64 polyfill.
 */
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
