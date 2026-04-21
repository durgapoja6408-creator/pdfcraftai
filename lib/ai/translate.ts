// Translate helper — Phase 5.2.
//
// Takes extracted PDF text and returns a markdown translation in the
// target language. Translation is inherently map-reduce friendly —
// pieces of a document translate independently — so we actually DO
// chunk here (unlike summarize, where truncation was good enough for
// v1). That lets us handle long documents without blowing the model
// context window.
//
// Design notes:
//
//   - Input chunking is paragraph-preserving. We split on `\n\n`,
//     then pack paragraphs into chunks until TRANSLATE_CHUNK_CHAR_BUDGET
//     fills. A paragraph that's itself larger than the budget is emitted
//     as a single chunk — we don't hard-slice mid-sentence because that
//     wrecks translation quality.
//
//   - Page markers (`\f`) are preserved verbatim inside chunks. The
//     system prompt instructs the model to keep them in place so the
//     preview page can still attribute quotes to pages. `[p. N]` markers
//     (which the model inserts) are similarly preserved.
//
//   - Output format is markdown. Some languages (Chinese, Arabic, Hindi)
//     have different punctuation + spacing conventions; we let the model
//     handle those rather than post-processing. Trust the model, trust
//     your audience.
//
//   - We use the non-streaming `chat()` per chunk. Translation is a
//     batch workload — users tolerate a 10s spinner on a 20-page doc.
//     Streaming would need a client-side assembler (append deltas per
//     chunk, interleave chunk boundaries), not worth the complexity.
//
//   - Temperature is 0.1 (lower than summarize's 0.2). Translation
//     should be deterministic-ish — creativity here reads as either
//     paraphrase drift or outright mistranslation.
//
//   - We throw on chunk errors. If chunk 7 of 12 fails, we fail the
//     whole operation. The route handler refunds. Partial translations
//     are worse than no translation: users can't tell which parts are
//     missing without comparing to the source side-by-side.

import "server-only";

import type { ModerationResult } from "./output-moderation";
import { assertOutputSafe, moderateOutput } from "./output-moderation";
import type { AIProvider } from "./provider";
import { buildSafetyPreamble, wrapUntrustedInput } from "./prompt-safety";
import { NoRoutableProviderError, route } from "./router";
import type { AIProviderId, TokenUsage } from "./types";

// Re-export the curated language catalog from a non-server-only module
// so both this file (route handler dep) and the client picker
// (TranslatePdfTool) can share it. See `lib/ai/translate-langs.ts` for
// the actual list.
export {
  COMMON_TARGET_LANGUAGES,
  type CommonTargetLanguageCode,
} from "./translate-langs";

export interface TranslateInput {
  /** Extracted PDF text, pages joined with `\f`. */
  text: string;
  pageCount: number;
  /** Shown to the model in the system prompt — helps preserve proper nouns. */
  filename?: string;
  /**
   * Target language code. BCP-47-ish (`en`, `pt-BR`, `zh-Hant`). The
   * route validates before calling us; we pass it to the model in the
   * system prompt verbatim. Model knows the code → language mapping.
   */
  targetLang: string;
  /**
   * Optional human-readable label used in prompts when set. Improves
   * translation quality for edge cases like "pt-BR" → "Brazilian
   * Portuguese" (vs. European). The route derives this from
   * COMMON_TARGET_LANGUAGES when matched.
   */
  targetLangLabel?: string;
  /** Pages with <20 chars of text, propagated from extractPdfText. */
  ocrCandidatePages?: number[];
  /** Optional provider override. */
  preferredProvider?: AIProviderId;
}

export interface TranslateResult {
  /** Full translated markdown. */
  markdown: string;
  providerId: AIProviderId;
  model: string;
  /** Summed usage across all chunks. */
  usage: TokenUsage;
  /** Number of chunks sent to the model. 1 for short docs. */
  chunkCount: number;
  /** True if input was split into >1 chunks (i.e. map-reduce path). */
  wasChunked: boolean;
  /** True if we hit the hard upper bound on total input size. */
  wasTruncated: boolean;
  /** Task #28: output moderation verdict on the joined translation. */
  moderation: ModerationResult;
}

/**
 * Thrown when no provider is configured. Same shape as summarize's —
 * the route handler maps to 503.
 */
export class NoAIProviderConfiguredError extends Error {
  constructor() {
    super("No AI provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
    this.name = "NoAIProviderConfiguredError";
  }
}

/**
 * Per-chunk char budget. ~20k chars ≈ ~5k input tokens, leaving headroom
 * for system prompt and the translated output (which can be up to ~1.5x
 * the source for verbose languages like German). Comfortably inside
 * every provider's 8k-context minimum.
 */
const TRANSLATE_CHUNK_CHAR_BUDGET = 20_000;

/**
 * Hard upper bound on total input. At our flat 5-credit price, a
 * million-char translation would cost us more than the credit revenue
 * covers on cheap providers. Users with genuinely huge documents can
 * split them in the merge tool first. Revisit if usage patterns show
 * many hits.
 */
const TRANSLATE_TOTAL_CHAR_CEILING = 600_000;

/**
 * Output tokens per chunk. Rough rule: 1 output token ≈ 3 input chars
 * for Latin-script languages. We add 30% slack for verbose targets
 * (German, Finnish) and cap to keep the cost bounded.
 *
 * Providers stop at natural sentence boundaries, so this is a ceiling,
 * not a target.
 */
function maxTokensForChunk(chunkCharCount: number): number {
  const base = Math.ceil(chunkCharCount / 3);
  const padded = Math.ceil(base * 1.3);
  // Ceiling of 6000 — above that, the response tends to summarize
  // rather than translate, which is the opposite of what we want.
  return Math.min(Math.max(padded, 400), 6000);
}

export async function translatePdf(input: TranslateInput): Promise<TranslateResult> {
  let provider: AIProvider;
  try {
    provider = await route("translate", { preferredId: input.preferredProvider });
  } catch (err) {
    if (err instanceof NoRoutableProviderError) {
      throw new NoAIProviderConfiguredError();
    }
    throw err;
  }

  const { text: boundedText, wasTruncated } = applyCeiling(input.text);
  const chunks = chunkText(boundedText);

  const chunkOutputs: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let providerIdUsed: AIProviderId | null = null;
  let modelUsed: string | null = null;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const systemPrompt = buildSystemPrompt({
      filename: input.filename,
      pageCount: input.pageCount,
      targetLang: input.targetLang,
      targetLangLabel: input.targetLangLabel,
      ocrCandidatePages: input.ocrCandidatePages ?? [],
      chunkIndex: i,
      chunkCount: chunks.length,
      wasTruncated,
    });
    const userPrompt = buildUserPrompt(chunk);

    const res = await runChat(provider, {
      systemPrompt,
      userPrompt,
      maxTokens: maxTokensForChunk(chunk.length),
    });

    chunkOutputs.push(postProcessChunk(res.text));
    totalInputTokens += res.usage.inputTokens;
    totalOutputTokens += res.usage.outputTokens;
    providerIdUsed = res.providerId;
    modelUsed = res.model;
  }

  // Non-null: the loop ran at least once. chunks.length >= 1 because
  // chunkText always returns at least one chunk (even for empty input).
  if (!providerIdUsed || !modelUsed) {
    throw new Error("translate: no chunks produced output (unreachable)");
  }

  const markdown = joinChunks(chunkOutputs);

  // Task #28: moderate the joined translation. Running per-chunk would
  // miss findings that straddle chunk boundaries (e.g. an API key split
  // across two paragraphs); the concatenated output is the canonical
  // surface the route handler will persist and return to the user.
  const moderation = moderateOutput(markdown, { op: "translate" });
  assertOutputSafe(moderation, "translate");

  return {
    markdown,
    providerId: providerIdUsed,
    model: modelUsed,
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    },
    chunkCount: chunks.length,
    wasChunked: chunks.length > 1,
    moderation,
    wasTruncated,
  };
}

// --- prompt builders --------------------------------------------------

function buildSystemPrompt(opts: {
  filename?: string;
  pageCount: number;
  targetLang: string;
  targetLangLabel?: string;
  ocrCandidatePages: number[];
  chunkIndex: number;
  chunkCount: number;
  wasTruncated: boolean;
}): string {
  const title = opts.filename ? `"${opts.filename}"` : "an untitled PDF";
  const langSpec = opts.targetLangLabel
    ? `${opts.targetLangLabel} (${opts.targetLang})`
    : opts.targetLang;

  const chunkNote =
    opts.chunkCount > 1
      ? `\nThis is chunk ${opts.chunkIndex + 1} of ${opts.chunkCount} from the ` +
        "same document. Translate only this chunk — do NOT add intros, summaries, " +
        "or transitions referring to other chunks. Maintain terminology consistency.\n"
      : "";

  const ocr = opts.ocrCandidatePages.length
    ? `\nPages ${opts.ocrCandidatePages.join(", ")} appear to be scanned images ` +
      "with minimal extractable text. If a page marker sits alone with no text, " +
      "leave the page marker in place and skip translation for that page.\n"
    : "";

  const truncation =
    opts.wasTruncated && opts.chunkIndex === opts.chunkCount - 1
      ? "\nThe source document was truncated to fit a size limit. If content " +
        "appears to be cut off at the end, note this in one short parenthetical " +
        "line after the final paragraph.\n"
      : "";

  // Task #26: prepend safety preamble. See lib/ai/prompt-safety.ts.
  //
  // Fidelity block (Tier 4, 2026-04-21): added explicit handling of
  // code identifiers that LOOK like translatable words (e.g.
  // `loadUser`, `getUserById`, `APIKey`, `OrderStatus`) — QA flagged
  // that gpt-4o-mini occasionally translated these on technical
  // documents, producing gibberish like `cargarUsuario` in Spanish.
  // The code_identifier regex hint anchors the rule concretely.
  return (
    `${buildSafetyPreamble("translate")}\n\n` +
    `You are the PDFCraft AI translator. Translate the provided text into ${langSpec}. ` +
    `The source is ${title} (${opts.pageCount} page${opts.pageCount === 1 ? "" : "s"}).\n\n` +
    "Rules:\n" +
    "- Translate faithfully. Do not summarize, explain, or editorialize.\n" +
    "- Preserve markdown structure: headings stay headings (same level), lists " +
    "stay lists, blockquotes stay blockquotes, code blocks stay verbatim.\n" +
    "- Preserve `\\f` page separators EXACTLY where they appear in the source — " +
    "they are page break markers.\n" +
    "- Preserve citation-style page references like `[p. 3]` verbatim.\n" +
    "- Preserve proper nouns, brand names, product names, URLs, email addresses, " +
    "and code identifiers unchanged. A token is a code identifier if it is " +
    "camelCase (`loadUser`, `getUserById`), PascalCase (`OrderStatus`), " +
    "SCREAMING_SNAKE_CASE (`API_KEY`, `MAX_RETRIES`), snake_case, kebab-case, " +
    "or is inside backticks — leave it as-is EVEN IF IT LOOKS LIKE A " +
    "TRANSLATABLE WORD.\n" +
    "- Numbers, dates, and units: convert formatting only if the target language " +
    "uses a different convention (e.g., decimal comma in German). Never change " +
    "the numeric value.\n" +
    "- Output only the translation. No preamble (\"Here is the translation:\"), " +
    "no trailing notes, no language labels." +
    chunkNote +
    ocr +
    truncation
  );
}

function buildUserPrompt(text: string): string {
  // Task #26: wrap untrusted source text in sentinel tags.
  return (
    `Translate the text inside the untrusted_input tag. Output the translation only.\n\n` +
    wrapUntrustedInput(text, { sourceLabel: "source_text" })
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
    // 0.1 — translation should be near-deterministic. Creativity here
    // reads as drift, not style.
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

// --- helpers ----------------------------------------------------------

function applyCeiling(text: string): { text: string; wasTruncated: boolean } {
  if (text.length <= TRANSLATE_TOTAL_CHAR_CEILING) {
    return { text, wasTruncated: false };
  }
  return {
    text: text.slice(0, TRANSLATE_TOTAL_CHAR_CEILING),
    wasTruncated: true,
  };
}

/**
 * Split on paragraph boundaries, pack into chunks up to
 * TRANSLATE_CHUNK_CHAR_BUDGET each. Paragraphs larger than the budget
 * are emitted as their own chunk (we don't slice mid-sentence).
 *
 * Always returns at least one chunk, even for empty input.
 */
export function chunkText(text: string): string[] {
  if (text.length === 0) return [""];

  // Split on paragraph boundaries. Keep `\f` attached to whatever
  // paragraph it prefixes — it's a page marker, not a standalone unit.
  const paragraphs = text.split(/\n\n+/);

  const chunks: string[] = [];
  let current = "";

  for (const p of paragraphs) {
    // Case 1: paragraph alone exceeds budget → flush current and emit
    // this paragraph as its own (oversized) chunk. The model handles
    // it fine; maxTokens scales with chunk length.
    if (p.length > TRANSLATE_CHUNK_CHAR_BUDGET) {
      if (current.length > 0) {
        chunks.push(current);
        current = "";
      }
      chunks.push(p);
      continue;
    }

    // Case 2: adding this paragraph would overflow → flush current
    // first, start new.
    const candidateLength = current.length === 0 ? p.length : current.length + 2 + p.length;
    if (candidateLength > TRANSLATE_CHUNK_CHAR_BUDGET && current.length > 0) {
      chunks.push(current);
      current = p;
      continue;
    }

    // Case 3: fits — append with paragraph separator.
    current = current.length === 0 ? p : `${current}\n\n${p}`;
  }

  if (current.length > 0) chunks.push(current);
  if (chunks.length === 0) chunks.push(""); // defensive: empty input

  return chunks;
}

function postProcessChunk(text: string): string {
  let cleaned = text.trim();

  // Strip surrounding ```markdown fence if the model wrapped the whole
  // response (some models do this when translation contains code).
  const fenceMatch = cleaned.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/);
  if (fenceMatch) cleaned = fenceMatch[1]!.trim();

  return cleaned;
}

/**
 * Join chunk outputs with a paragraph separator. Chunks were split on
 * `\n\n` boundaries, so rejoining with `\n\n` restores the paragraph
 * break that used to sit between them.
 *
 * If a chunk ends with `\f` (page marker) the join still works — the
 * `\f\n\n` sequence is legal and renders as a page break followed by
 * blank space.
 */
function joinChunks(chunks: string[]): string {
  return chunks.filter((c) => c.length > 0).join("\n\n");
}
