// Rewrite helper — Phase 5.6.
//
// Takes extracted PDF text and returns the rewritten text as markdown.
// The `mode` controls the transform:
//
//   - "simplify"  — plain-English rewrite, 8th-grade reading level,
//                   short sentences, no jargon. Best for legalese,
//                   policy docs, or engineering whitepapers you want
//                   to share with non-technical readers.
//   - "formal"    — tightened, professional tone, active voice, no
//                   contractions. Good for turning rough drafts into
//                   polished memos.
//   - "casual"    — conversational tone, contractions allowed, warmer
//                   voice. Good for internal-use docs becoming customer-
//                   facing emails.
//   - "concise"   — compress to ~60% of the source length without
//                   losing substance. Good for long-winded reports.
//   - "expand"    — elaborate the source with examples + context.
//                   Good for rough outlines becoming full drafts.
//
// Design mirrors summarize.ts:
//   - Non-streaming `chat()` entry point.
//   - Character budget + truncation on the input side.
//   - Token cap per mode on the output side.
//   - Returns markdown; the route persists it to ai_outputs.
//   - Throws on provider error (the route handler catches + refunds).

import "server-only";

import { capForOp } from "./output-caps";
import type { ModerationResult } from "./output-moderation";
import { assertOutputSafe, moderateOutput } from "./output-moderation";
import type { AIProvider } from "./provider";
import { buildSafetyPreamble, wrapUntrustedInput } from "./prompt-safety";
import { NoRoutableProviderError, route } from "./router";
import type { AIProviderId, TokenUsage } from "./types";

/** Rewrite mode. Keep in sync with VALID_MODES in the route handler. */
export type RewriteMode = "simplify" | "formal" | "casual" | "concise" | "expand";

export interface RewriteInput {
  /** Extracted PDF text, pages joined with `\f`. */
  text: string;
  pageCount: number;
  /** Shown to the model in the system prompt; helpful for titling. */
  filename?: string;
  mode: RewriteMode;
  /** Pages with <20 chars of text, from extractPdfText. */
  ocrCandidatePages?: number[];
  /** Optional provider override, honored if configured. */
  preferredProvider?: AIProviderId;
}

export interface RewriteResult {
  /** Markdown body the UI renders and we persist to ai_outputs. */
  markdown: string;
  providerId: AIProviderId;
  model: string;
  usage: TokenUsage;
  /** True if the source text was truncated before the model call. */
  wasTruncated: boolean;
  /** Task #28: output moderation verdict on the rewritten markdown. */
  moderation: ModerationResult;
}

/**
 * Thrown when no provider is configured. The route handler catches this
 * and returns 503. Same error class pattern as summarize.ts so the
 * catch block is a one-liner.
 */
export class NoAIProviderConfiguredError extends Error {
  constructor() {
    super("No AI provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
    this.name = "NoAIProviderConfiguredError";
  }
}

/**
 * 240k chars ≈ 60k tokens — comfortably inside every provider we target.
 * Matches summarize.ts. Going higher risks 429s on Claude's cheaper tiers.
 */
const REWRITE_CHAR_BUDGET = 240_000;

// Output-token caps per mode are centralized in ./output-caps
// (OP_OUTPUT_CAP_TABLE.rewrite). Task #11 moved them out of this file so
// every op + variant shares one source of truth and one hard ceiling.
// The 2026-04-21 Tier 4 values (simplify/formal/casual = 2000, concise =
// 1600, expand = 4000) are preserved there. Callers use
// `capForOp("rewrite", mode)` below.

export async function rewritePdf(input: RewriteInput): Promise<RewriteResult> {
  // Task #21: route through the AI router so the op-specific routing
  // policy (rewrite → openai primary — MASTER_PLAN §7 gate #6) wins
  // unless the caller pinned a provider via `preferredProvider`. The
  // router also enforces the required capability ("streaming") and
  // throws `NoRoutableProviderError` if no configured provider can
  // service the op — we translate that to `NoAIProviderConfiguredError`
  // so the route handler's existing 503 branch lights up unchanged.
  let provider: AIProvider;
  try {
    provider = await route("rewrite", { preferredId: input.preferredProvider });
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
    mode: input.mode,
    ocrCandidatePages: input.ocrCandidatePages ?? [],
    wasTruncated,
  });

  const userPrompt = buildUserPrompt({
    mode: input.mode,
    text: truncatedText,
  });

  const result = await runChat(provider, {
    systemPrompt,
    userPrompt,
    maxTokens: capForOp("rewrite", input.mode),
  });

  const markdown = postProcessMarkdown(result.text);

  // Task #28: output moderation. Rewrites echo the source closely so
  // any PII or credential in the source is very likely to appear in
  // the output. Critical findings refund + 502 via the route handler.
  const moderation = moderateOutput(markdown, { op: "rewrite" });
  assertOutputSafe(moderation, "rewrite");

  return {
    markdown,
    providerId: result.providerId,
    model: result.model,
    usage: result.usage,
    wasTruncated,
    moderation,
  };
}

// --- prompt builders --------------------------------------------------

function buildSystemPrompt(opts: {
  filename?: string;
  pageCount: number;
  mode: RewriteMode;
  ocrCandidatePages: number[];
  wasTruncated: boolean;
}): string {
  const title = opts.filename ? `"${opts.filename}"` : "an untitled PDF";
  const ocr = opts.ocrCandidatePages.length
    ? `\nPages ${opts.ocrCandidatePages.join(", ")} appear to be scanned ` +
      "images with minimal extractable text — skip them silently rather than " +
      "inventing content.\n"
    : "";
  const truncation = opts.wasTruncated
    ? "\nThe extracted text was truncated to fit your context. If the document " +
      "clearly continues past the excerpt, add a trailing `---` followed by a " +
      "single italicized note: *Source was truncated; this rewrite covers the " +
      "first portion only.*\n"
    : "";

  const modeLine = (() => {
    switch (opts.mode) {
      case "simplify":
        return (
          "Rewrite the document in plain English at an 8th-grade reading level. " +
          "Short sentences. No jargon. If you must use a technical term, define " +
          "it inline the first time it appears. Preserve section structure — " +
          "keep the same H2/H3 hierarchy the source implies."
        );
      case "formal":
        return (
          "Rewrite the document in a formal, professional register. Active voice. " +
          "No contractions. No colloquialisms. Tighten rambling sentences. " +
          "Preserve the source's section structure and factual content verbatim — " +
          "change tone and phrasing only, not meaning."
        );
      case "casual":
        return (
          "Rewrite the document in a conversational, approachable tone. " +
          "Contractions allowed. Second person (\"you\") where the source " +
          "addresses the reader. Keep technical accuracy — warmth does not " +
          "mean looseness with facts. Preserve section structure."
        );
      case "concise":
        return (
          "Rewrite the document at roughly 60% of the source length. Cut filler, " +
          "redundancy, and throat-clearing. Keep every substantive claim and " +
          "every section heading. Shorter sentences, tighter paragraphs."
        );
      case "expand":
        return (
          "Expand the document. For each substantive claim, add one or two " +
          "sentences of context or a brief illustrative example. Keep the source's " +
          "section structure and do not invent facts not grounded in the source — " +
          "examples should be generic, not fabricated specifics."
        );
    }
  })();

  // Task #26: prepend safety preamble so the model treats the wrapped
  // PDF text as untrusted data. See lib/ai/prompt-safety.ts.
  //
  // Fidelity block (Tier 4, 2026-04-21): rewrite echoes the source
  // closely, so hallucination here is especially costly — users trust
  // a rewrite to be the same doc in different words. The three rules
  // below (ground every claim, preserve proper nouns/technical terms
  // verbatim, never invent numbers or quotes) catch the three
  // regressions we saw in QA: invented statistics, paraphrased names,
  // and inserted "illustrative" quotes that were never in the source.
  return (
    `${buildSafetyPreamble("rewrite")}\n\n` +
    `You are the PDFCraft AI rewriter. The user has attached ${title} ` +
    `(${opts.pageCount} page${opts.pageCount === 1 ? "" : "s"}). ` +
    `Pages are delimited by \\f in the source text.\n\n` +
    modeLine +
    "\n\nFidelity rules (non-negotiable):\n" +
    "- Ground every substantive claim in the source. Do NOT invent facts, " +
    "statistics, quotes, or examples that aren't in the document.\n" +
    "- Preserve proper nouns, product names, organisation names, technical " +
    "terms, code identifiers, URLs, and email addresses verbatim — rewrite " +
    "means rephrase, not rename.\n" +
    "- Never change a number, date, currency amount, or unit. If the source " +
    "says \"12%\" your rewrite says \"12%\", not \"roughly a tenth\" or " +
    "\"about one-in-eight\".\n\n" +
    "Output format:\n" +
    "- Output is markdown. Do NOT wrap your response in a code fence " +
    "(```markdown). Do NOT add a preamble (\"Here is the rewritten document:\") " +
    "or postamble. Return the rewritten text directly, starting with the first " +
    "heading or paragraph of the rewrite." +
    ocr +
    truncation
  );
}

function buildUserPrompt(opts: { mode: RewriteMode; text: string }): string {
  // Task #26: wrap untrusted PDF text in sentinel tags.
  return (
    `Rewrite the document inside the untrusted_input tag in ${opts.mode} mode per the instructions.\n\n` +
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
    // 0.3 — slightly higher than summarize's 0.2 because a rewrite with
    // zero temperature reads like a template. Still low enough to stay
    // faithful to source facts.
    temperature: 0.3,
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

function truncateForContext(text: string): {
  truncatedText: string;
  wasTruncated: boolean;
} {
  if (text.length <= REWRITE_CHAR_BUDGET) {
    return { truncatedText: text, wasTruncated: false };
  }
  return {
    truncatedText: text.slice(0, REWRITE_CHAR_BUDGET),
    wasTruncated: true,
  };
}

/**
 * Some adapters wrap the whole response in a ```markdown fence. Strip it
 * so the saved file isn't a code block. Mirrors summarize.ts.
 */
function postProcessMarkdown(text: string): string {
  const cleaned = text.trim();
  const fenceMatch = cleaned.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/);
  if (fenceMatch) return fenceMatch[1]!.trim();
  return cleaned;
}
