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

import type { AIProvider } from "./provider";
import { NoRoutableProviderError, route } from "./router";
import type { AIProviderId, TokenUsage } from "./types";

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
const SUMMARIZE_CHAR_BUDGET = 240_000;

/**
 * Token caps per depth. These are soft — providers may stop earlier at
 * natural boundaries. TL;DR intentionally caps low so a rambling model
 * gets cut before it writes a standard-length summary we'd have charged
 * more for.
 */
const MAX_TOKENS_BY_DEPTH: Record<SummarizeDepth, number> = {
  tldr: 300,
  standard: 1200,
  detailed: 2000,
};

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
    maxTokens: MAX_TOKENS_BY_DEPTH[input.depth],
  });

  return {
    markdown: postProcessMarkdown(result.text, input.depth),
    providerId: result.providerId,
    model: result.model,
    usage: result.usage,
    wasTruncated,
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

  return (
    `You are the PDFCraft AI summarizer. The user has attached ${title} ` +
    `(${opts.pageCount} page${opts.pageCount === 1 ? "" : "s"}). ` +
    `Pages are delimited by \\f in the source text.\n\n` +
    depthLine +
    "\n\nGround every claim in the document. Do not invent facts. Cite page " +
    "numbers (e.g. \"[p. 3]\") whenever you reference a specific passage. " +
    "Write in plain, neutral prose — no marketing language, no editorializing." +
    ocr +
    truncation
  );
}

function buildUserPrompt(opts: { depth: SummarizeDepth; text: string }): string {
  const verb = opts.depth === "tldr" ? "Summarize" : "Summarize in full per the instructions above";
  return `${verb}. The document text follows between the markers.\n\n===== BEGIN PDF TEXT =====\n${opts.text}\n===== END PDF TEXT =====`;
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
    // 0.2 — mildly creative prose, deterministic-ish structure. Higher
    // drifts off the requested sections; lower reads like a template.
    temperature: 0.2,
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
