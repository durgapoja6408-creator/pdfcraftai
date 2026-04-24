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
import {
  RECORDING_ENABLED as PROMPT_RECORDING_ENABLED,
  resolvePromptVersion,
} from "./prompts/registry";
import type { AIProvider } from "./provider";
import { buildSafetyPreamble, wrapUntrustedInput } from "./prompt-safety";
import { NoRoutableProviderError, route } from "./router";
import type { AIProviderId, StopReason, TokenUsage } from "./types";

/** How much summary the caller wants. */
// Task #52 (2026-04-24): added three presentation-style variants —
// "key-points", "study-notes", "eli5" — each exposed as its own
// Tier 2 tool (ai-key-points / ai-study-notes / ai-eli5). They
// reuse the summarize pipeline end-to-end; only the depth-line
// prompt switch below differs. Pricing per catalog:
//   key-points  3 credits (§2.1 P0)
//   study-notes 8 credits (§2.4 P0 — longer output)
//   eli5        3 credits (§2.1 P1)
export type SummarizeDepth =
  | "tldr"
  | "standard"
  | "detailed"
  | "key-points"
  | "study-notes"
  | "eli5"
  // Task #53 additions:
  //   faq    §2.1 P1 — extract 6–10 likely Q&A pairs (5 credits)
  //   blog   §2.4 P1 — reformat content as a blog post (10 credits)
  | "faq"
  | "blog"
  // Task #54:
  //   readability   §2.5 P1 — Flesch score + complex-sentence flags (3c)
  //   entities      §2.7 P1 — people/places/orgs/dates (3c)
  //   social-thread §2.4 P2 — X/LinkedIn-style thread (5c)
  | "readability"
  | "entities"
  | "social-thread"
  // Task #55:
  //   condense       §2.6 P1 — tighten prose, 40-60% length (3c)
  //   expand         §2.6 P2 — elaborate each point (5c)
  //   tone-analyze   §2.5 P2 — voice + register analysis (3c)
  //   citations      §2.7 P2 — BibTeX + human-readable refs (5c)
  //   financials     §2.7 P1 — key numbers with context (5c)
  | "condense"
  | "expand"
  | "tone-analyze"
  | "citations"
  | "financials"
  // Task #56:
  //   sentiment   §2.5 P2 — document-level + section sentiment (3c)
  //   bias        §2.5 P3 — inclusive-language audit (5c)
  //   proofread   §2.6 P1 — error list with fixes (5c)
  | "sentiment"
  | "bias"
  | "proofread"
  // Task #57:
  //   newsletter   §2.4 P2 — email-newsletter format (8c)
  //   video-script §2.4 P2 — intro + segments + outro (10c)
  | "newsletter"
  | "video-script"
  // Task #58 — structured-output variants. The model returns JSON
  // inside a ```json code fence; the dedicated UI parses + renders.
  //   flashcards §2.4 P1 — 10-30 Q&A pairs (10c)
  //   quiz       §2.4 P1 — 6-12 MCQs with answer key (10c)
  | "flashcards"
  | "quiz"
  // Task #59:
  //   mindmap §2.4 P1 — hierarchical tree, rendered as
  //   collapsible nested outline (10c)
  | "mindmap"
  // Task #60:
  //   semantic-search §2.1 P1 — return passages relevant to a
  //   user-provided query. Route reads `query` form field and
  //   threads it through SummarizeInput. (2c per search)
  | "semantic-search"
  // Task #61 — first Tier 3 vertical wedges:
  //   ats-resume   §3.6 P0 — ATS compatibility report (10c)
  //   resume-parse §3.6 P0 — JSON resume → CSV export (~5c/resume)
  | "ats-resume"
  | "resume-parse";

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
  /**
   * Phase E / Task #26 — stable bucketing seed for prompt-variant A/B
   * routing. Typically the caller's authenticated userId. When undefined
   * the resolver coerces to empty string (all anonymous callers bucket
   * the same). Threaded through to `recordAiUsage` via the returned
   * `promptVersion` / `experimentId` fields on `SummarizeResult`.
   */
  userId?: string | null;
  /**
   * Task #60 — optional search query for `depth: "semantic-search"`.
   * Ignored by every other depth. When present the buildUserPrompt
   * branch wraps it and prepends a short instruction so the model
   * scopes its output to passages relevant to the query.
   */
  query?: string;
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
  /**
   * Phase E / Task #26 — prompt registry audit fields. `promptVersion`
   * is the PromptVersion.id that `resolvePromptVersion("summarize", …)`
   * returned for this call (e.g. "v1"); `experimentId` is the active
   * Experiment.id when the assignment was randomized, null when it was
   * deterministic (single-variant at 100%). Route handlers forward both
   * to `recordAiUsage` so the A/B rollup in `/admin/prompts` can slice
   * the cost + truncation-rate metrics by variant. When
   * `RECORDING_ENABLED` is false on the registry, both come back as
   * null regardless of resolver output — that's the kill switch to
   * flip off A/B recording without rolling back the migration.
   */
  promptVersion: string | null;
  experimentId: string | null;
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

  // Phase E / Task #26 — resolve the prompt variant for this call. At v1
  // ship the resolver returns {version:"v1", experimentId:null} for
  // every summarize call (one variant at 100% weight, no active
  // experiment). `buildSystemPrompt` branches on `version` so future
  // variants can swap the renderer without the call-site changing.
  // When RECORDING_ENABLED is false we still resolve (so the branch
  // stays consistent) but null out the audit strings so the DB columns
  // stay NULL — the kill switch.
  const resolved = resolvePromptVersion("summarize", input.userId);
  const promptVersion = PROMPT_RECORDING_ENABLED ? resolved.version : null;
  const experimentId = PROMPT_RECORDING_ENABLED ? resolved.experimentId : null;

  const systemPrompt = buildSystemPrompt({
    filename: input.filename,
    pageCount: input.pageCount,
    depth: input.depth,
    ocrCandidatePages: input.ocrCandidatePages ?? [],
    wasTruncated,
    promptVersion: resolved.version,
  });

  const userPrompt = buildUserPrompt({
    depth: input.depth,
    text: truncatedText,
    query: input.query,
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
    // Phase E / Task #26 — registry audit trail. Both are null when
    // RECORDING_ENABLED is false; otherwise version is always a non-
    // empty string and experimentId is null when the assignment was
    // deterministic (single-variant 100%) vs. the Experiment.id when
    // randomized.
    promptVersion,
    experimentId,
  };
}

// --- prompt builders --------------------------------------------------

function buildSystemPrompt(opts: {
  filename?: string;
  pageCount: number;
  depth: SummarizeDepth;
  ocrCandidatePages: number[];
  wasTruncated: boolean;
  /**
   * Phase E / Task #26 — the PromptVersion.id the resolver returned.
   * At v1 ship every summarize call resolves to "v1" and this renders
   * the existing prompt verbatim. When we ship a "v2-concise" variant
   * this function branches on `promptVersion` and returns the new
   * renderer's output; the call-site (summarizePdf) and the route
   * handler stay untouched.
   */
  promptVersion: string;
}): string {
  // v1 is the only registered variant today. Every id other than "v1"
  // also routes to the same renderer — if somebody edits the registry
  // to add "v2" WITHOUT adding a branch here, we want the fallback to
  // be "v1 behavior", not "undefined prompt" (which would either
  // throw or ship an empty system prompt that costs tokens for
  // garbage output). The registry + renderer must move together; the
  // admin page surfaces a red banner when an id without a renderer
  // branch ships, which is the intended operator feedback loop.
  if (opts.promptVersion !== "v1") {
    // Intentional fallthrough to v1. Document in the registry comment
    // above when adding a new id.
  }
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
      case "key-points":
        // §2.1 Key Points Extractor. No prose — just the bulleted core.
        // Dedicated tool because users who need a scannable insight
        // list shouldn't have to wade through TL;DR + section summaries.
        return (
          "Produce ONLY a bulleted list of the document's key points, under a " +
          "single `## Key Points` H2 header. Aim for 6–12 bullets. Each bullet " +
          "is one concrete claim or finding with a page citation. No prose, " +
          "no section summaries, no TL;DR, no headers other than the one H2."
        );
      case "study-notes":
        // §2.4 PDF → Study Notes. Structured for study/revision:
        // concept index, then per-concept explanation + takeaways.
        return (
          "Produce study notes structured for revision. Start with `## Overview` " +
          "(2–3 sentences situating the document). Then `## Key Concepts` as a " +
          "bulleted list (concept → one-line definition, page cited). Then for " +
          "each major concept add an H3 section under `## Detailed Notes` with: " +
          "the concept, a paragraph explaining it in study-guide voice, and a " +
          "`> Remember:` blockquote with the single takeaway a student should " +
          "memorise. End with `## Self-Check Questions` — 4–6 short-answer " +
          "questions a student can use to test recall, no answer key."
        );
      case "eli5":
        // §2.1 Explain Like I'm 5. Plain-language simplification while
        // retaining factual fidelity (the document's claims must survive
        // the simplification — no making up analogies that contradict
        // the source).
        return (
          "Explain this document as if to a smart 12-year-old. Use short " +
          "sentences and everyday vocabulary. No jargon, no corporate " +
          "register. You MAY use simple analogies from everyday life, but " +
          "only if the analogy preserves the source's factual claims — no " +
          "invented numbers, dates, or quotes even inside an analogy. Structure " +
          "as `## The Big Idea` (one paragraph), `## The Details` (4–8 short " +
          "bullets in plain language), `## Why It Matters` (one paragraph)."
        );
      case "faq":
        // §2.1 Generate FAQ. Extract the questions a careful reader
        // would actually ask, paired with answers grounded in the doc.
        return (
          "Generate a FAQ from this document. Infer 6–10 questions a " +
          "reader would realistically ask based on what the document " +
          "covers, then answer each using only information present in " +
          "the source (cite pages). Format as Markdown: a single `## FAQ` " +
          "H2, then for each pair an H3 with the question verbatim, " +
          "followed by a short-paragraph answer under it. Do NOT invent " +
          "questions the document doesn't actually address; if there's a " +
          "gap a reader would want filled, put that under a final " +
          "`### Not covered in this document` section listing the gaps."
        );
      case "blog":
        // §2.4 PDF → Blog Post. Reformat for a general audience with
        // a blog-appropriate structure. Fidelity rules still apply;
        // the blog post should not add opinions the source doesn't carry.
        return (
          "Reformat this document as a blog post for a general-audience " +
          "web reader. Structure: a compelling H1 title, one-paragraph " +
          "lede (the hook), 3–5 H2 sections that progress the narrative " +
          "(each with 2–4 paragraphs + relevant bullet lists where they " +
          "help), and a short conclusion under `## Wrapping up` or " +
          "similar. Tone: informed and direct; no corporate voice, no " +
          "click-bait. Preserve numeric precision and factual claims " +
          "from the source exactly; do not editorialise or add opinions " +
          "the document does not carry. Page citations optional but " +
          "encouraged when making specific claims."
        );
      case "readability":
        // §2.5 Readability Score + Suggestions. Heuristic-looking
        // output but computed by the model — Flesch-Kincaid,
        // average sentence length, jargon callouts, 3-5 concrete
        // edit suggestions.
        return (
          "Analyse this document for readability. Produce these H2 " +
          "sections in order: `## Scores` (bulleted: approximate " +
          "Flesch-Kincaid grade level, average sentence length in words, " +
          "average syllables per word — explain your estimate without " +
          "showing arithmetic). `## Complex Sentences` (3–5 verbatim " +
          "quotes with page citations where a sentence is long or " +
          "tangled, with a one-line gloss of why). `## Jargon` (5–10 " +
          "domain-specific terms used without definition, with the " +
          "word and where it first appears). `## Suggestions` (3–5 " +
          "concrete edit recommendations a writer could apply). Do " +
          "NOT rewrite the document — this tool analyses; Rewrite " +
          "does the actual revision."
        );
      case "entities":
        // §2.7 Extract Key Entities. People / places / organisations /
        // dates, each with page citations. Markdown tables so the
        // output flows cleanly into downstream spreadsheets.
        return (
          "Extract the named entities that appear in this document. " +
          "Output 4 H2 sections: `## People`, `## Organisations`, " +
          "`## Places`, `## Dates`. Under each, a Markdown table with " +
          "columns `Name | First Appearance | Notes`. \"First " +
          "Appearance\" is a page number. \"Notes\" is a one-line " +
          "description of the entity's role in the document (at most " +
          "12 words). Entities must be explicitly named in the source " +
          "— do not infer affiliations or coordinates. If a section " +
          "has no entities, render \"_None found._\" under its header."
        );
      case "social-thread":
        // §2.4 PDF → Social Thread. LinkedIn / X-thread style —
        // series of 5-10 short posts that together tell the doc's
        // story. Each post numbered and length-capped.
        return (
          "Reformat this document as a 5–10 post social-media thread " +
          "(LinkedIn / X style). Output as Markdown with one paragraph " +
          "per post, each prefixed `**Post N/M:**` where M is the total " +
          "count. Opening post MUST hook the reader with a specific " +
          "claim, question, or number from the document (not a generic " +
          "tease). Middle posts carry one idea each, at most ~240 " +
          "characters, written in a direct first-person-neutral voice " +
          "(neither corporate nor personal). Closing post summarises " +
          "the takeaway and invites replies. No emojis unless the " +
          "source used them. No hashtags."
        );
      case "condense":
        // §2.6 Shorten/Condense. Keep every claim and number, cut
        // redundancy and connective tissue. Aim for 40-60% of source
        // length. Output IS the condensed document, not a summary.
        return (
          "Rewrite this document in a shorter, tighter form. Preserve " +
          "every factual claim, number, quote, and heading — cut " +
          "redundancy, throat-clearing, connective tissue, and " +
          "repeated context. Target ~40–60% of the original length. " +
          "The output is the document itself, rewritten; NOT a " +
          "summary. Keep the original section structure (same H2 " +
          "headings) unless a section is entirely filler, in which " +
          "case merge it into the adjacent one. Plain neutral prose; " +
          "no meta-commentary about what you cut."
        );
      case "expand":
        // §2.6 Expand/Elaborate. Every bullet or terse claim gets a
        // full paragraph. Fidelity rule: no invented facts — if we
        // lack grounding to elaborate, note that rather than fabricate.
        return (
          "Rewrite this document in a fuller, more elaborated form. " +
          "Each terse bullet or claim becomes a full paragraph with " +
          "context, examples drawn from the source, and clarifying " +
          "detail. Preserve every factual claim verbatim. If a bullet " +
          "cannot be elaborated without inventing context the source " +
          "doesn't provide, leave it as-is or note that it needs more " +
          "source input. Target ~140–180% of original length. Same " +
          "section structure as the source. No filler or padding."
        );
      case "tone-analyze":
        // §2.5 Tone / Style Analyzer. Who's the voice, who's the
        // audience, what register, what adjectives would describe
        // the writing. Analysis, not rewrite.
        return (
          "Analyse this document's tone and writing style. Produce " +
          "these H2 sections in order: `## Voice` (one paragraph — " +
          "who the writer sounds like, what register, what tells you " +
          "this). `## Intended Audience` (one paragraph — who this " +
          "is written FOR, evidenced by word choice, assumed " +
          "background, references). `## Style Attributes` (bullet " +
          "list: 6–10 adjectives like 'formal', 'hedged', 'assertive', " +
          "'bureaucratic', each with a 1-line evidence snippet and " +
          "page cite). `## Observations` (3–5 bullets on anything " +
          "notable — inconsistent register, shifts mid-document, " +
          "tells that the document was committee-written, etc.). " +
          "Do NOT rewrite — this tool analyses."
        );
      case "citations":
        // §2.7 Extract Citations. Returns BibTeX + a human-readable
        // reference list. Works best on academic/research docs;
        // handles embedded references and reference-list sections.
        return (
          "Extract every citation or reference from this document. " +
          "Output two H2 sections: `## BibTeX` (a ```bibtex fenced " +
          "code block containing one BibTeX entry per reference — " +
          "pick appropriate entry types @article / @book / @inproceedings " +
          "/ @misc based on what's available; auto-generate citation " +
          "keys as firstAuthor+year+firstWord). `## Reference List` " +
          "(a numbered list matching the BibTeX order, formatted in " +
          "a readable author-year style). If the document is not a " +
          "research doc (no reference list and no inline citations), " +
          "render both sections with `_No citations found in this " +
          "document._` and explain in one line why (e.g. 'This " +
          "appears to be a product brochure')."
        );
      case "financials":
        // §2.7 Extract Key Financial Numbers. Tables of monetary
        // figures, percentages, ratios with currency, unit, and
        // context. Targets Indian finance docs (lakhs/crores) AND
        // international (millions/billions).
        return (
          "Extract the key financial numbers from this document. " +
          "Output a single Markdown table with columns `Metric | " +
          "Value | Unit | Period | Page`. Metric = what the number " +
          "measures (e.g. 'Revenue', 'EBITDA margin', 'Debt-to-equity'). " +
          "Value = the number as stated. Unit = currency code + scale " +
          "('INR crore', 'USD million', '%', 'x'). Period = the time " +
          "window if given (e.g. 'FY2025', 'Q2 2026', 'as of " +
          "2026-03-31'). Page = where it appears. Capture every " +
          "monetary figure, ratio, and percentage that has business " +
          "meaning — not page numbers or form-field IDs. If the " +
          "document contains no financial data, render " +
          "`_No financial figures found._` instead of the table."
        );
      case "sentiment":
        // §2.5 Sentiment Analysis. Overall + per-section sentiment
        // with evidence. Neutral default for factual docs; flags
        // shifts between sections explicitly.
        return (
          "Analyse the sentiment of this document. Produce an H2 " +
          "`## Overall Sentiment` (one sentence verdict: positive / " +
          "negative / neutral / mixed, plus a confidence word like " +
          "'clear' / 'leaning' / 'split'; one paragraph of evidence). " +
          "Then `## Per-Section Sentiment` as a table with columns " +
          "`Section | Sentiment | Evidence`. Section = the H-level " +
          "heading if present, otherwise a page range. Evidence = " +
          "one short quoted phrase that drives the verdict. End " +
          "with `## Notable Shifts` (bullets, or '_None._') — places " +
          "where sentiment changes across the doc."
        );
      case "bias":
        // §2.5 Bias / Inclusive Language. Flags gendered pronouns
        // w/o justification, outdated terminology, stereotyping,
        // passive/defensive diplomatic language. NOT a political
        // bias audit — structural / language-choice bias only.
        return (
          "Audit this document for inclusive-language and structural-" +
          "bias issues. Produce these H2 sections: `## Gendered " +
          "Language` (quotes of gendered pronouns, 'man-hours', " +
          "'chairman', etc. that could be neutralised, with " +
          "suggested replacements). `## Outdated Terminology` " +
          "(terms that have modern replacements — e.g. 'blacklist'/" +
          "'whitelist' → 'blocklist'/'allowlist'). `## Stereotyping " +
          "or Generalisations` (claims that treat a group as " +
          "monolithic). `## Accessibility Language` (references to " +
          "disability, age, etc. that could use person-first " +
          "framing). `## Suggestions` (3–5 concrete edit actions). " +
          "This is not a political-bias audit — focus on language " +
          "choices. If the document is clean on a category, render " +
          "'_None found._' under that header rather than fabricating " +
          "issues."
        );
      case "proofread":
        // §2.6 Proofread. Error list (not a rewrite) with location,
        // type, and fix. Dedicated tool because users who want
        // errors flagged don't want the document silently rewritten.
        return (
          "Proofread this document. Produce a single Markdown table " +
          "with columns `Page | Error | Type | Suggested Fix`. Error " +
          "= a short verbatim quote of the problematic text. Type " +
          "= one of: 'spelling', 'grammar', 'punctuation', " +
          "'agreement', 'word choice', 'capitalisation', 'style'. " +
          "Suggested Fix = the corrected phrasing. Capture genuine " +
          "errors only — don't flag stylistic choices you simply " +
          "disagree with (e.g. Oxford comma preferences) unless " +
          "they cause actual ambiguity. If no errors found, render " +
          "'_No errors detected._' and add one line of caveat that " +
          "proofreading is not perfect — encourage a human review " +
          "for critical work."
        );
      case "newsletter":
        // §2.4 PDF → Email Newsletter. Format for a curated email.
        // Subject line + pre-header + headed sections + CTAs.
        // Opinions preserved from source, no editorialising.
        return (
          "Reformat this document as an email newsletter. Start " +
          "with `## Subject Line` (one H2, value is a single line " +
          "under 60 characters). Then `## Preheader` (one line, " +
          "~90 chars, that complements the subject). Then the " +
          "email body as Markdown: opening paragraph (hook + what " +
          "the reader will get in ~3 sentences), 3–5 numbered " +
          "sections each with a bolded headline and 1–2 paragraphs " +
          "of content, a `## Read more` section linking to the " +
          "source or related material (use placeholder `[your " +
          "link here]` since we don't know where this will be " +
          "published), and a short sign-off. Voice: direct, " +
          "informed, not salesy. Preserve factual claims exactly; " +
          "no invented statistics."
        );
      case "video-script":
        // §2.4 PDF → Video Script. Talking-head style with
        // intro/segments/outro. Time cues per segment.
        return (
          "Reformat this document as a talking-head video script. " +
          "Structure: `## Opening (0:00–0:30)` — the hook, stated " +
          "as a direct statement to the viewer. `## Segment 1 " +
          "(0:30–2:00)`, `## Segment 2 (2:00–3:30)`, etc. — 3–5 " +
          "segments of ~90 seconds each, each covering one core " +
          "idea with an H3 title and the spoken-word script below. " +
          "`## Closing (final 30s)` — takeaway + soft CTA (e.g. " +
          "'read the full document', 'subscribe'). Bracket " +
          "stage-direction cues `[cut to slide]`, `[B-roll: … ]` " +
          "where useful. Conversational register — contractions " +
          "fine, but no filler words. Preserve factual claims " +
          "verbatim; no invented quotes or statistics even in the " +
          "narrator's voice."
        );
      case "flashcards":
        // §2.4 Flashcards (Anki). JSON-in-fence output so the
        // dedicated UI can parse + render + export as Anki CSV.
        return (
          "Generate study flashcards from this document. Output " +
          "ONLY a ```json fenced code block containing an array of " +
          "10–30 objects, each shaped {\"q\": \"question string\", " +
          "\"a\": \"answer string\", \"page\": integer}. Questions " +
          "test single facts or concepts ideal for active recall. " +
          "Answers are concise (one sentence or fragment) and " +
          "grounded in the source. Do not include any other " +
          "commentary, preamble, or postamble — just the code " +
          "fence. The UI parses the JSON and offers Anki-CSV export."
        );
      case "quiz":
        // §2.4 Quiz / MCQ. JSON-in-fence output for rendering
        // as an interactive quiz with answer reveals.
        return (
          "Generate a multiple-choice quiz from this document. " +
          "Output ONLY a ```json fenced code block containing an " +
          "array of 6–12 objects, each shaped {\"question\": " +
          "\"question string\", \"options\": [\"A…\", \"B…\", " +
          "\"C…\", \"D…\"] (exactly 4 options), \"correct\": 0–3 " +
          "(zero-based index of the correct option), \"explanation\": " +
          "\"one sentence why this is correct, with page ref\", " +
          "\"page\": integer}. Distractors must be plausible " +
          "(not obviously wrong) and not too similar to the correct " +
          "answer. No preamble or postamble."
        );
      case "mindmap":
        // §2.4 Mind Map. JSON tree output. UI renders as a
        // nested collapsible outline with indentation.
        return (
          "Produce a mind map of this document as a hierarchical " +
          "tree. Output ONLY a ```json fenced code block containing " +
          "a single object shaped {\"root\": \"document title or " +
          "central topic\", \"branches\": [{\"label\": \"string\", " +
          "\"children\": [{\"label\": \"string\", \"children\": " +
          "[...]}]}]}. Branches are the document's top-level " +
          "sections or themes (4–8). Children drill into each. " +
          "Labels are SHORT — 2–8 words each. Nest up to 3 levels " +
          "deep. Each leaf-level label should be a concrete claim " +
          "or concept. If a node has no children, omit the " +
          "`children` key or use an empty array."
        );
      case "semantic-search":
        // §2.1 Semantic Search. Returns JSON list of relevant
        // passages. The user's query is passed via the user-turn
        // as <search_query>…</search_query> — see buildUserPrompt.
        return (
          "Return the passages from this document that are most " +
          "relevant to the user's search query (provided in the " +
          "user turn). Output ONLY a ```json fenced code block " +
          "containing an array of 3–8 objects, each shaped " +
          "{\"passage\": \"verbatim quote from the document, " +
          "1-3 sentences\", \"page\": integer, \"relevance\": " +
          "\"one line explaining why this matches the query\"}. " +
          "Order by relevance (most relevant first). Only return " +
          "passages that genuinely match — if the document " +
          "doesn't address the query at all, return an empty " +
          "array `[]`. Do NOT paraphrase the source; the passage " +
          "field must be a verbatim quote."
        );
      case "ats-resume":
        // §3.6 ATS Resume Optimizer. Treat the document as a
        // resume, produce an ATS-compatibility report + fixes.
        return (
          "Analyse this document as a resume for ATS (Applicant " +
          "Tracking System) compatibility and general recruiter " +
          "appeal. Produce these H2 sections in order: " +
          "`## ATS Score` (bulleted: compatibility rating Low / " +
          "Medium / High + one-line reason per category — " +
          "Parseability, Keyword Density, Section Headings, " +
          "Formatting). `## Critical Fixes` (3–5 bullets of " +
          "must-fix issues with specific quoted text + suggested " +
          "change). `## Keyword Gaps` (10 skills/keywords likely " +
          "missing for the target roles inferred from the doc — " +
          "if you can't infer a role, say so rather than guess). " +
          "`## Format Issues` (tables, columns, headers/footers, " +
          "graphics that break ATS parsing). `## Suggested " +
          "Summary` (2–3 sentence revised professional summary in " +
          "standard ATS-friendly prose based on the resume's " +
          "actual content). Be specific — cite line/section, " +
          "don't just say 'improve formatting'."
        );
      case "resume-parse":
        // §3.6 Resume Parser. Structured JSON extraction for
        // bulk recruiter workflows / HR CRM import.
        return (
          "Parse this resume into structured JSON. Output ONLY a " +
          "```json fenced code block containing a single object " +
          "shaped {\"name\": string, \"email\": string|null, " +
          "\"phone\": string|null, \"location\": string|null, " +
          "\"summary\": string|null, \"experience\": " +
          "[{\"title\": string, \"company\": string, " +
          "\"start\": string|null, \"end\": string|null, " +
          "\"bullets\": [string]}], \"education\": " +
          "[{\"degree\": string, \"institution\": string, " +
          "\"year\": string|null}], \"skills\": [string], " +
          "\"links\": [string]}. Preserve the applicant's " +
          "wording for bullets verbatim; don't paraphrase. Omit " +
          "or null fields that aren't in the source. Do NOT " +
          "invent details."
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

function buildUserPrompt(opts: {
  depth: SummarizeDepth;
  text: string;
  query?: string;
}): string {
  // Kept per-depth so the "verb" in the user turn matches what the
  // system prompt's depthLine actually asked for. Drift here →
  // doubled instructions / conflicted outputs.
  const verb = (() => {
    switch (opts.depth) {
      case "tldr":
        return "Summarize";
      case "key-points":
        return "Extract the key points";
      case "study-notes":
        return "Produce study notes";
      case "eli5":
        return "Explain this";
      case "faq":
        return "Generate the FAQ";
      case "blog":
        return "Reformat this as a blog post";
      case "readability":
        return "Analyse the readability";
      case "entities":
        return "Extract the named entities";
      case "social-thread":
        return "Turn this into a social thread";
      case "condense":
        return "Rewrite this shorter";
      case "expand":
        return "Rewrite this expanded";
      case "tone-analyze":
        return "Analyse the tone and style";
      case "citations":
        return "Extract the citations";
      case "financials":
        return "Extract the financial numbers";
      case "sentiment":
        return "Analyse the sentiment";
      case "bias":
        return "Audit for bias + inclusive language";
      case "proofread":
        return "Proofread this";
      case "newsletter":
        return "Reformat as a newsletter";
      case "video-script":
        return "Turn this into a video script";
      case "flashcards":
        return "Generate flashcards";
      case "quiz":
        return "Generate a multiple-choice quiz";
      case "mindmap":
        return "Build a mind map";
      case "semantic-search":
        return "Return the relevant passages for this query";
      case "ats-resume":
        return "Audit this resume for ATS compatibility";
      case "resume-parse":
        return "Parse this resume into structured JSON";
      case "standard":
      case "detailed":
      default:
        return "Summarize in full per the instructions above";
    }
  })();
  // Task #60: for semantic-search, prepend the user's query to the
  // user turn. Wrapped in a clearly-labelled section so the model
  // doesn't confuse the query for document text.
  if (opts.depth === "semantic-search" && opts.query) {
    return (
      `${verb}. The user's query follows inside the search_query tag, ` +
      `and the document text follows inside the untrusted_input tag.\n\n` +
      `<search_query>\n${opts.query.slice(0, 500)}\n</search_query>\n\n` +
      wrapUntrustedInput(opts.text, { sourceLabel: "pdf_text" })
    );
  }
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
  /**
   * Phase E / Task #26 — stable bucketing seed. Same semantics as
   * SummarizeInput.userId. Batch submissions carry the submitting
   * user's id so the resolved variant matches what a realtime call
   * would have produced for the same user.
   */
  userId?: string | null;
}): {
  request: import("./adapters/openai-batch").BatchRequest;
  model: string;
  wasTruncated: boolean;
  truncatedCharCount: number;
  promptVersion: string | null;
  experimentId: string | null;
} {
  const { truncatedText, wasTruncated } = truncateForContext(input.text);
  const resolved = resolvePromptVersion("summarize", input.userId);
  const systemPrompt = buildSystemPrompt({
    filename: input.filename,
    pageCount: input.pageCount,
    depth: input.depth,
    ocrCandidatePages: input.ocrCandidatePages ?? [],
    wasTruncated,
    promptVersion: resolved.version,
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
    // Phase E / Task #26 — forward so the polling route can stamp the
    // final ai_usage row with the same variant the batch actually
    // executed under (the system prompt above is built for that
    // variant). Nulled when RECORDING_ENABLED is off.
    promptVersion: PROMPT_RECORDING_ENABLED ? resolved.version : null,
    experimentId: PROMPT_RECORDING_ENABLED ? resolved.experimentId : null,
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
  /**
   * Phase E / Task #26 — the prompt variant the batch submission was
   * queued under. Captured at submit time (buildSummarizeBatchRequest)
   * and persisted on the batch record, then passed back here so the
   * finalized `ai_usage` row carries the SAME variant id, not a freshly-
   * resolved one (the registry could have been re-weighted between
   * submit + finalize, days or even weeks apart for large batches).
   */
  promptVersion?: string | null;
  experimentId?: string | null;
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
    // Phase E / Task #26 — pass through the variant captured at submit
    // time. Explicit `?? null` so an undefined input (legacy batches
    // persisted before this field existed) comes back as null on the
    // return, which the DB column accepts.
    promptVersion: input.promptVersion ?? null,
    experimentId: input.experimentId ?? null,
  };
}
