// Compare helper — Phase 5.3.
//
// Takes the extracted text of two PDFs (A = original, B = revised) and
// returns a markdown redline with AI severity classification. Output is
// a single structured document suitable for a legal or contract reviewer
// skimming for what actually changed.
//
// Design notes
//
//   - No chunking at v1. The failure mode for compare is "the two docs
//     are long" — but chunking a diff means aligning chunks across both
//     sides, which is a nontrivial problem (paragraph insertions drift
//     the alignment). v1 truncates at COMPARE_COMBINED_CHAR_BUDGET and
//     surfaces `wasTruncated`. We'll revisit when real usage tells us
//     which docs people are actually trying to diff.
//
//   - Uniform truncation. We don't preferentially keep the longer side;
//     each side is capped at COMPARE_SIDE_CHAR_BUDGET (half of the
//     combined budget). This keeps both sides visible to the model even
//     when one side is dramatically longer — otherwise the diff of a
//     6-page replacement against a 40-page original would see nothing
//     from the original past page 7, and miss every removed section.
//
//   - Output is markdown, not JSON. Same reasoning as summarize/translate:
//     LLMs produce reliable markdown; a structured-JSON schema with
//     nested arrays of diffs is where parse failures live. If we later
//     need structured data (e.g. to power a side-by-side UI), a heading
//     walker on the markdown is a one-way door.
//
//   - Severity taxonomy baked into the prompt:
//       BREAKING  — meaning reversed, obligation added, rights removed
//       MATERIAL  — numbers changed, scope changed, timing changed
//       MINOR     — wording tightened, clarifying additions, reorderings
//       COSMETIC  — typos, formatting, pure style
//     Reviewers pay for severity signal — it's literally the reason this
//     tool exists over a text diff. Pin the taxonomy in the prompt and
//     document it in architecture.md so consumers can rely on it.
//
//   - Non-streaming chat(). Compare is single-shot; the user waits on a
//     spinner. No reason to stream.
//
//   - Throws on provider error. Route handler catches, refunds, returns
//     502 (or 503 for NoAIProviderConfiguredError). Keeps the helper's
//     return type narrow.

import "server-only";

import { capForOp } from "./output-caps";
import type { ModerationResult } from "./output-moderation";
import { assertOutputSafe, moderateOutput } from "./output-moderation";
import type { AIProvider } from "./provider";
import { buildSafetyPreamble, wrapUntrustedInput } from "./prompt-safety";
import { NoRoutableProviderError, route } from "./router";
import type { AIProviderId, TokenUsage } from "./types";

export interface CompareSideInput {
  /** Extracted text, pages joined with `\f`. */
  text: string;
  pageCount: number;
  /** Filename without extension is fine — shown to the model for labeling. */
  filename?: string;
}

export interface CompareInput {
  /** The "before" document. Shown to the model as A. */
  original: CompareSideInput;
  /** The "after" document. Shown to the model as B. */
  revised: CompareSideInput;
  /**
   * Pages in EITHER doc that extractPdfText flagged as image-only. Keeps
   * the model from hallucinating about them.
   */
  ocrCandidatePagesOriginal?: number[];
  ocrCandidatePagesRevised?: number[];
  preferredProvider?: AIProviderId;
}

export interface CompareResult {
  /** Markdown body the UI renders and we persist to `ai_outputs`. */
  markdown: string;
  providerId: AIProviderId;
  model: string;
  usage: TokenUsage;
  /** True if either side had to be truncated before sending to the model. */
  wasTruncated: boolean;
  /** Per-side post-truncation char count — useful for the preview/meta. */
  originalChars: number;
  revisedChars: number;
  /** Task #28: output moderation verdict on the diff markdown. */
  moderation: ModerationResult;
}

/**
 * Thrown when no provider is configured. Route handler catches and
 * returns 503.
 */
export class NoAIProviderConfiguredError extends Error {
  constructor() {
    super("No AI provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
    this.name = "NoAIProviderConfiguredError";
  }
}

// --- budgets ----------------------------------------------------------

/**
 * Combined-char ceiling across both sides. ~100k tokens worst case —
 * comfortably inside every supported adapter. Exceed this and both sides
 * are independently truncated to SIDE budget.
 */
export const COMPARE_COMBINED_CHAR_BUDGET = 400_000;

/**
 * Per-side ceiling. Half of the combined budget. Truncating each side
 * independently keeps both ends of the diff visible — see file header.
 */
export const COMPARE_SIDE_CHAR_BUDGET = COMPARE_COMBINED_CHAR_BUDGET / 2;

// Output-token cap is centralized in ./output-caps
// (OP_OUTPUT_CAP_TABLE.compare.default = 4000). Task #11 moved it out of
// this file so every op shares one source of truth and one hard ceiling.
// Big enough for a thorough redline of a 30-page contract with 40+
// changes. Used below via `capForOp("compare")`.

// --- entry point ------------------------------------------------------

export async function comparePdfs(input: CompareInput): Promise<CompareResult> {
  let provider: AIProvider;
  try {
    provider = await route("compare", { preferredId: input.preferredProvider });
  } catch (err) {
    if (err instanceof NoRoutableProviderError) {
      throw new NoAIProviderConfiguredError();
    }
    throw err;
  }

  const {
    originalText,
    revisedText,
    wasTruncated,
  } = truncateSides(input.original.text, input.revised.text);

  const systemPrompt = buildSystemPrompt({
    original: input.original,
    revised: input.revised,
    ocrOriginal: input.ocrCandidatePagesOriginal ?? [],
    ocrRevised: input.ocrCandidatePagesRevised ?? [],
    wasTruncated,
  });

  const userPrompt = buildUserPrompt({ originalText, revisedText });

  const result = await runChat(provider, {
    systemPrompt,
    userPrompt,
    maxTokens: capForOp("compare"),
  });

  const markdown = postProcessMarkdown(result.text);

  // Task #28: output moderation on the diff markdown. Diffs can
  // surface the exact per-line contents of both documents — if
  // either side contained PII the model faithfully echoed, we catch
  // it here before the diff is persisted.
  const moderation = moderateOutput(markdown, { op: "compare" });
  assertOutputSafe(moderation, "compare");

  return {
    markdown,
    providerId: result.providerId,
    model: result.model,
    usage: result.usage,
    wasTruncated,
    originalChars: originalText.length,
    revisedChars: revisedText.length,
    moderation,
  };
}

// --- prompt builders --------------------------------------------------

function buildSystemPrompt(opts: {
  original: CompareSideInput;
  revised: CompareSideInput;
  ocrOriginal: number[];
  ocrRevised: number[];
  wasTruncated: boolean;
}): string {
  const nameA = opts.original.filename ?? "Document A";
  const nameB = opts.revised.filename ?? "Document B";
  const pagesA = opts.original.pageCount;
  const pagesB = opts.revised.pageCount;

  const ocrNote = ((): string => {
    const parts: string[] = [];
    if (opts.ocrOriginal.length) {
      parts.push(
        `In ${nameA}, pages ${opts.ocrOriginal.join(", ")} appear to be scanned images with minimal extractable text.`
      );
    }
    if (opts.ocrRevised.length) {
      parts.push(
        `In ${nameB}, pages ${opts.ocrRevised.join(", ")} appear to be scanned images with minimal extractable text.`
      );
    }
    if (!parts.length) return "";
    return (
      "\n" +
      parts.join(" ") +
      " Do not speculate about the content of those pages; note the gap if it affects a change.\n"
    );
  })();

  const truncationNote = opts.wasTruncated
    ? "\nOne or both documents were truncated to fit your context. If the diff " +
      "clearly depends on content past the excerpt, note this explicitly in the " +
      "Summary section.\n"
    : "";

  // Task #26: prepend safety preamble so the model treats both wrapped
  // documents as untrusted data. See lib/ai/prompt-safety.ts.
  return (
    `${buildSafetyPreamble("compare")}\n\n` +
    `You are the PDFCraft AI diff engine. The user has given you two PDFs to compare:\n` +
    `  A (original): "${nameA}" — ${pagesA} page${pagesA === 1 ? "" : "s"}\n` +
    `  B (revised):  "${nameB}" — ${pagesB} page${pagesB === 1 ? "" : "s"}\n\n` +
    `Pages are delimited by \\f in both source texts. Page numbers in ` +
    `citations refer to the page number WITHIN each document (e.g. "[A p. 3]" ` +
    `or "[B p. 5]").\n\n` +
    `Produce a markdown redline with these H2 sections, in order, using these ` +
    `exact headers:\n\n` +
    `## Summary\n` +
    `One paragraph: what kind of revision this is, and the overall severity ` +
    `(BREAKING, MATERIAL, MINOR, or COSMETIC — pick the highest present). ` +
    `End with a one-line change count bucket (e.g. "2 breaking, 5 material, ` +
    `8 minor, 3 cosmetic").\n\n` +
    `## Breaking Changes\n` +
    `Changes that reverse meaning, add obligations, remove rights, or flip a ` +
    `default. If none, say "None." and no more.\n\n` +
    `## Material Changes\n` +
    `Changes to numbers, dates, scope, deadlines, parties, or defined terms. ` +
    `If none, say "None." and no more.\n\n` +
    `## Minor Changes\n` +
    `Wording tightenings, clarifying additions, non-substantive restructurings. ` +
    `If none, say "None."\n\n` +
    `## Cosmetic Changes\n` +
    `Typos, formatting, whitespace, pure style. If none, say "None." You may ` +
    `summarize these in aggregate rather than listing every instance.\n\n` +
    `For each listed change, use this shape:\n\n` +
    `- **<short title>** — <one-sentence what-changed>.\n` +
    `  - A [A p. N]: > "<verbatim quote from A>"\n` +
    `  - B [B p. N]: > "<verbatim quote from B>"\n` +
    `  - <one-sentence why-it-matters>\n\n` +
    `Rules:\n` +
    `- Quote verbatim. Do not paraphrase inside the quote blocks.\n` +
    `- If a change only exists in A (deletion), omit the B block and label the ` +
    `  title with "(removed)".\n` +
    `- If a change only exists in B (addition), omit the A block and label the ` +
    `  title with "(added)".\n` +
    `- Do NOT list every formatting nit as its own bullet. Roll them up in the ` +
    `  Cosmetic section as prose.\n` +
    `- Do NOT editorialize. Neutral reviewer tone.\n` +
    `- Severity is a judgment about the legal/operational impact of the change, ` +
    `  not about the length of the edit.\n` +
    ocrNote +
    truncationNote
  );
}

function buildUserPrompt(opts: { originalText: string; revisedText: string }): string {
  // Task #26: wrap both untrusted documents in distinct sentinel tags.
  return (
    `Compare these two documents per the instructions above.\n\n` +
    `Document A (original):\n${wrapUntrustedInput(opts.originalText, { sourceLabel: "document_a_original" })}\n\n` +
    `Document B (revised):\n${wrapUntrustedInput(opts.revisedText, { sourceLabel: "document_b_revised" })}`
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
    // 0.1 — we want deterministic structure and faithful quoting. Any
    // higher and the model starts paraphrasing the verbatim blocks.
    temperature: 0.1,
    // Task #10: Anthropic prompt caching. Compare's system prompt is
    // stable across every call (safety preamble + structured-output spec
    // + fidelity rules). Non-Anthropic adapters ignore this flag.
    cacheSystemPrompt: true,
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

function truncateSides(
  originalRaw: string,
  revisedRaw: string
): { originalText: string; revisedText: string; wasTruncated: boolean } {
  const aTooLong = originalRaw.length > COMPARE_SIDE_CHAR_BUDGET;
  const bTooLong = revisedRaw.length > COMPARE_SIDE_CHAR_BUDGET;

  if (!aTooLong && !bTooLong) {
    return {
      originalText: originalRaw,
      revisedText: revisedRaw,
      wasTruncated: false,
    };
  }

  return {
    originalText: aTooLong ? originalRaw.slice(0, COMPARE_SIDE_CHAR_BUDGET) : originalRaw,
    revisedText: bTooLong ? revisedRaw.slice(0, COMPARE_SIDE_CHAR_BUDGET) : revisedRaw,
    wasTruncated: true,
  };
}

/**
 * Strip a surrounding ```markdown fence if the model wrapped its output.
 * Mirrors summarize's postProcessMarkdown — same observed behavior across
 * adapters.
 */
function postProcessMarkdown(text: string): string {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/);
  if (fenceMatch) cleaned = fenceMatch[1]!.trim();
  return cleaned;
}
