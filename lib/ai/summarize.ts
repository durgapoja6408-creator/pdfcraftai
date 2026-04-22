// Summarize helper — Phase 5.1.
//
// Takes extracted PDF text and returns a markdown summary. Depth controls
// how much output the caller wants:
//
//   - "tldr"     — one paragraph, ~3 sentences. Cheapest, fastest.
//   - "standard" — TL;DR + Key Points + section-by-section summary.
//                  Default. What most users want.
//   - "detailed" — Standard output plus "Notable Quotes" and
//                  "Open Questions" sections. Useful for research reading.
//
// Design notes:
//
//   - Output is plain markdown. LLMs produce reliable markdown; asking for
//     JSON adds a parse step that fails ~1% of the time and leaks provider-
//     specific quirks (trailing commas, code fences around the JSON).
//     If we later need structured data, parse the markdown with a simple
//     heading extractor — that's a one-way door that's easy to add.
//
//   - Chunking is NOT done here. We truncate to SUMMARIZE_CHAR_BUDGET and
//     note the truncation in the prompt so the model knows the source was
//     cut. Map-reduce chunking lands in Phase 5.2 if real users hit long-
//     doc limits. For now, 240k chars = ~60k tokens = well inside the
//     smallest model window we target.
//
//   - We use the non-streaming `chat()` entry point. Summaries are short
//     (~500-2000 tokens) and users see a spinner, not a token-by-token
//     stream. Simpler code path.
//
//   - Throws on provider error (unlike streamChat which emits an error
//     chunk). The /api/ai/summarize route handler catches, refunds, and
//     surfaces to the client. Keeps the helper's return type narrow.

import "server-only";

import { capForOp } from "./output-caps";
import type { ModerationResult } from "./output-moderation";
import { assertOutputSafe, moderateOutput } from "./output-moderation";
import type { AIProvider } from "./provider";
import { buildSafetyPreamble, wrapUntrustedInput } from "./prompt-safety";
import { NoRoutableProviderError, route } from "./router";
import type { AIProviderId, StopReason, TokenUsage } from "./types";

/** How much summary the caller wants. */
export type SummarizeDepth = "tldr" | "standard" | "detailed";

export interface SummarizeInput {
  /** Extracted PDF text, pages joined with `\f`. */
  text: string;
  pageCount: number;
  /** Shown to the model in the system prompt; helpful for titling. */
  filename?: string;
  depth: SummarizeDepth;
  /**
   * Pages with <20 chars of text, flagged by `extractPdfText`. If non-empty
   * we tell the model up front so it doesn't hallucinate about them.
   */
  ocrCandidatePages?: number[];
  /**
   * Optional provider override. When set and configured, the registry
   * honors it; otherwise picks the first configured provider that
   * supports `chat()`. Every configured provider supports `chat()` — it's
   * the universal entry point.
   */
  preferredProvider?: AIProviderId;
}

export interface SummarizeResult {
  /** Markdown body the UI renders and we persist to `ai_outputs`. */
  markdown: string;
  providerId: AIProviderId;
  model: string;
  usage: TokenUsage;
  /** True if the source text was truncated before sending to the model. */
  wasTruncated: boolean;
  /**
   * Task #11: provider's terminal `stop_reason`. "end_turn" when the
   * model terminated naturally, "max_tokens" when the response hit the
   * output cap, "stop_sequence" on an explicit stop, etc. Route
   * handlers forward this to `recordAiUsage` so the truncation-rate
   * dashboard can flag ops that bump against their cap.
   */
  stopReason: StopReason;
  /**
   * Task #28: output moderation verdict. `severity === "none"` on a
   * clean response; higher severities attach findings for the route
   * handler to log into `ai_usage.meta`. A `critical` finding throws
   * `OutputModerationBlockedError` from inside this helper before it
   * ever returns, so callers observing `moderation` see severities
   * `none | low | medium | high`.
   */
  moderation: ModerationResult;
}

/**
 * Thrown when no provider is configured. The route handler catches this
 * and returns 503 to the client — the user should be told "the site admin
 * hasn't set up an AI key yet", not "your request broke".
 */
export class NoAIProviderConfiguredError extends Error {
  constructor() {
    super("No AI provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
    this.name = "NoAIProviderConfiguredError";
  }
}

/** Char budget. See file header for why 240k. */
export const SUMMARIZE_CHAR_BUDGET = 240_000;

/**
 * OpenAI model we route batch submissions through. Intentionally
 * hardcoded (not read from the router) because batch uses the REST
 * `/v1/chat/completions` endpoint directly without the streaming
 * abstraction, so the realtime ROUTING_POLICY isn't relevant.
 *
 * gpt-4o-mini is the cheapest text model in our rate card ($0.15 /
 * $0.60 per Mtok → $0.075 / $0.30 after the batch 50% discount) and
 * has produced quality-equivalent summaries to haiku/flash in our
 * side-by-side checks.
 */
const BATCH_MODEL_SUMMARIZE = "gpt-4o-mini";

// Token caps per depth are centralized in ./output-caps
// (OP_OUTPUT_CAP_TABLE.summarize). Task #11 moved them out of this file so
// every op + variant shares one source of truth and one hard ceiling.
// Callers use `capForOp("summarize", depth)` below.

export async function summarizePdf(input: SummarizeInput): Promise<SummarizeResult> {
  let provider: AIProvider;
  try {
    provider = await route("summarize", { preferredId: input.preferredProvider });
  } catch (err) {
    if (err instanceof NoRoutableProviderError) {
      throw new NoAIProviderConfiguredError();
    }
    throw err;
  }

  const { truncatedText, wasTruncated } = truncateForContext(input.text);

  const systemPrompt = buildSystemPrompt({
    filename: input.filename,
    pageCount: input.pageCount,
    depth: input.depth,
    ocrCandidatePages: input.ocrCandidatePages ?? [],
    wasTruncated,
  });

  const userPrompt = buildUserPrompt({
    depth: input.depth,
    text: truncatedText,
  });

  const result = await runChat(provider, {
    systemPrompt,
    userPrompt,
    maxTokens: capForOp("summarize", input.depth),
  });

  const markdown = postProcessMarkdown(result.text, input.depth);

  // Task #28: output moderation. Scan the post-processed markdown (the
  // exact bytes we're about to persist to ai_outputs) for PII leaks,
  // credential-shaped strings, and jailbreak echoes. `assertOutputSafe`
  // throws on critical severity — the route handler catches + refunds.
  const moderation = moderateOutput(markdown, { op: "summarize" });
  assertOutputSafe(moderation, "summarize");

  return {
    markdown,
    providerId: result.providerId,
    model: result.model,
    usage: result.usage,
    wasTruncated,
    // Task #11: forward the terminal stop_reason so the route handler
    // can persist it onto the ai_usage row and feed the per-op
    // truncation-rate dashboard.
    stopReason: result.stopReason,
    moderation,
  };
}

// --- prompt builders --------------------------------------------------

function buildSystemPrompt(opts: {
  filename?: string;
  pageCount: number;
  depth: SummarizeDepth;
  ocrCandidatePages: number[];
  wasTruncated: boolean;
}): string {
  const title = opts.filename ? `"${opts.filename}"` : "an untitled PDF";
  const ocr = opts.ocrCandidatePages.length
    ? `\nPages ${opts.ocrCandidatePages.join(", ")} appear to be scanned ` +
      "images with minimal extractable text — do not speculate about their contents.\n"
    : "";
  const truncation = opts.wasTruncated
    ? "\nThe extracted text was truncated to fit your context. If the document " +
      "clearly continues past the excerpt, note this explicitly at the end of the summary.\n"
    : "";

  const depthLine = (() => {
    switch (opts.depth) {
      case "tldr":
        return "Produce a tight one-paragraph TL;DR (3 sentences max).";
      case "standard":
        return (
          "Produce a structured summary with these sections (in order, using " +
          "exactly these H2 headers): ## TL;DR, ## Key Points, ## Section Summaries. " +
          "TL;DR is one paragraph. Key Points is 4–8 concise bullets. Section " +
          "Summaries cover the main parts of the document with H3 headers for each."
        );
      case "detailed":
        return (
          "Produce a detailed structured summary with these H2 sections in order: " +
          "## TL;DR, ## Key Points, ## Section Summaries, ## Notable Quotes, ## Open Questions. " +
          "TL;DR is one paragraph. Key Points is 6–10 bullets. Section Summaries " +
          "covers every major section with H3 headers. Notable Quotes contains 2–5 " +
          "verbatim quotes (use > blockquote syntax) cited by page. Open Questions " +
          "lists what the document does not answer that a careful reader would want to know."
        );
    }
  })();

  // Task #26: prepend the safety preamble so the model treats the
  // wrapped PDF text as data, not instructions. See prompt-safety.ts.
  //
  // Fidelity + tone block (Tier 4, 2026-04-21): in QA we observed two
  // recurring regressions on summaries — (a) invented precision, where
  // the model turned "several hundred" into "roughly 450", and (b)
  // subjective verdicts like "critically important" or "remarkable"
  // that weren't in the source. The explicit "only if the source uses
  // that exact word" clause catches both. The "No preamble / postamble"
  // line cuts 20-40 wasted output tokens per call on models that love
  // to say "Here's your summary:".
  return (
    `${buildSafetyPreamble("summarize")}\n\n` +
    `You are the PDFCraft AI summarizer. The user has attached ${title} ` +
    `(${opts.pageCount} page${opts.pageCount === 1 ? "" : "s"}). ` +
    `Pages are delimited by \\f in the source text.\n\n` +
    depthLine +
    "\n\nFidelity rules:\n" +
    "- Ground every claim in the document. Do NOT invent facts, numbers, " +
    "dates, or quotes. Preserve numeric precision exactly — if the source " +
    "says \"several hundred\", your summary says \"several hundred\", not " +
    "\"about 450\".\n" +
    "- Cite page numbers (e.g. \"[p. 3]\") whenever you reference a " +
    "specific passage, fact, or quote.\n" +
    "- Plain neutral prose — no marketing language, no editorializing, no " +
    "value judgments. Do not use superlatives (\"critical\", \"remarkable\", " +
    "\"crucial\", \"vital\") unless the source uses that exact word.\n" +
    "- No preamble (\"Here is your summary:\") and no postamble. Return " +
    "the summary markdown directly." +
    ocr +
    truncation
  );
}

function buildUserPrompt(opts: { depth: SummarizeDepth; text: string }): string {
  const verb = opts.depth === "tldr" ? "Summarize" : "Summarize in full per the instructions above";
  // Task #26: wrap untrusted PDF text in sentinel tags. See prompt-safety.ts.
  return (
    `${verb}. The document text follows inside the untrusted_input tag.\n\n` +
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
  stopReason: StopReason;
}> {
  const result = await provider.chat({
    systemPrompt: opts.systemPrompt,
    messages: [{ role: "user", content: opts.userPrompt }],
    maxTokens: opts.maxTokens,
    // 0.2 — mildly creative prose, deterministic-ish structure. Higher
    // drifts off the requested sections; lower reads like a template.
    temperature: 0.2,
    // Task #10: Anthropic prompt caching. The summarize system prompt is
    // stable across every call at a given depth — buildSafetyPreamble +
    // fidelity rules + depth line add up to a repeatable prefix. Setting
    // this hints Anthropic to attach a 5-minute ephemeral cache breakpoint.
    // Non-Anthropic adapters ignore the flag. If the prefix is below the
    // ~1024/~2048 token minimum, Anthropic silently skips with no error
    // — we eat zero overhead on misses, so this is safe-on.
    cacheSystemPrompt: true,
  });
  if (result.stopReason === "error") {
    // Adapters should emit error chunks from streamChat and wrap .chat()
    // around streamChat — so .chat() throws on error, not returns stop
    // reason "error". Defensive branch either way.
    throw new Error("AI provider returned an error stop reason");
  }
  return {
    text: result.text,
    providerId: result.providerId,
    model: result.model,
    usage: result.usage,
    // Task #11: propagate terminal stop_reason up the call chain.
    // Typically "end_turn" or "max_tokens"; the summarize result type
    // exposes it so /api/ai/summarize can persist into ai_usage.
    stopReason: result.stopReason,
  };
}

// --- helpers ----------------------------------------------------------

function truncateForContext(text: string): {
  truncatedText: string;
  wasTruncated: boolean;
} {
  if (text.length <= SUMMARIZE_CHAR_BUDGET) {
    return { truncatedText: text, wasTruncated: false };
  }
  return {
    truncatedText: text.slice(0, SUMMARIZE_CHAR_BUDGET),
    wasTruncated: true,
  };
}

/**
 * Adapters sometimes wrap the whole response in a ```markdown fence
 * ("here's your summary:\n```markdown\n...\n```"). Strip those so the
 * saved file isn't a code block inside a code block.
 */
function postProcessMarkdown(text: string, depth: SummarizeDepth): string {
  let cleaned = text.trim();

  // Strip a surrounding ```markdown ... ``` fence if present.
  const fenceMatch = cleaned.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/);
  if (fenceMatch) cleaned = fenceMatch[1]!.trim();

  // For tldr we prepend a title so the saved file reads cleanly out of
  // context ("opened the file, what is this?"). For structured depths
  // the model already includes headings.
  if (depth === "tldr" && !/^#\s/m.test(cleaned)) {
    cleaned = `## TL;DR\n\n${cleaned}`;
  }

  return cleaned;
}

// --- batch mode (Task #13) -------------------------------------------

/**
 * Build the single `BatchRequest` for a summarize submission. The caller
 * (/api/ai/summarize in batch mode) passes it to `submitBatch` and
 * persists the `opPayload` so that when the batch completes the
 * polling route can rebuild a `SummarizeResult`-shaped payload without
 * needing the original PDF bytes.
 */
export function buildSummarizeBatchRequest(input: {
  text: string;
  pageCount: number;
  filename?: string;
  depth: SummarizeDepth;
  ocrCandidatePages?: number[];
  customId: string;
}): {
  request: import("./adapters/openai-batch").BatchRequest;
  model: string;
  wasTruncated: boolean;
  truncatedCharCount: number;
} {
  const { truncatedText, wasTruncated } = truncateForContext(input.text);
  const systemPrompt = buildSystemPrompt({
    filename: input.filename,
    pageCount: input.pageCount,
    depth: input.depth,
    ocrCandidatePages: input.ocrCandidatePages ?? [],
    wasTruncated,
  });
  const userPrompt = buildUserPrompt({
    depth: input.depth,
    text: truncatedText,
  });
  return {
    request: {
      customId: input.customId,
      model: BATCH_MODEL_SUMMARIZE,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: capForOp("summarize", input.depth),
      temperature: 0.2,
    },
    model: BATCH_MODEL_SUMMARIZE,
    wasTruncated,
    truncatedCharCount: truncatedText.length,
  };
}

/**
 * Transform a single batch result line back into the same shape a
 * realtime `summarizePdf()` call would have returned. Moderation runs
 * exactly as it does in realtime — if a `critical` finding surfaces,
 * the thrown error bubbles up to the polling route which marks the
 * batch as finalized-with-error and refunds credits.
 */
export function finalizeSummarizeBatchResult(input: {
  line: import("./adapters/openai-batch").BatchResultLine;
  depth: SummarizeDepth;
  wasTruncated: boolean;
}): SummarizeResult {
  const { line } = input;
  const markdown = postProcessMarkdown(line.content, input.depth);

  const moderation = moderateOutput(markdown, { op: "summarize" });
  assertOutputSafe(moderation, "summarize");

  // Map OpenAI's `finish_reason` to our StopReason union (see types.ts).
  // Our union is {end_turn, max_tokens, stop_sequence, tool_use, error};
  // OpenAI's {stop, length, content_filter, tool_calls, other} maps as
  // follows. content_filter would never make it here because moderation
  // runs BEFORE this function and throws on severity=critical, but we
  // keep a defensive mapping in case the model self-filters.
  const stopReason: StopReason =
    line.stopReason === "length"
      ? "max_tokens"
      : line.stopReason === "tool_calls"
        ? "tool_use"
        : line.stopReason === "content_filter"
          ? "error"
          : "end_turn";

  return {
    markdown,
    providerId: "openai",
    model: line.model || BATCH_MODEL_SUMMARIZE,
    usage: {
      inputTokens: line.usage.inputTokens,
      outputTokens: line.usage.outputTokens,
    },
    wasTruncated: input.wasTruncated,
    stopReason,
    moderation,
  };
}
