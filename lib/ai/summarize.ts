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
  | "resume-parse"
  // Task #62:
  //   action-items §2.7 P2 — TODO list with owner/due-date
  //   extraction from meeting notes, specs, briefs (3c)
  | "action-items"
  // Task #63 — Tier 3 wedges:
  //   bank-statement §3.1 P0 — JSON transactions + CSV (30c)
  //   blood-test     §3.4 P0 — lab values + trend notes (15c)
  | "bank-statement"
  | "blood-test"
  // Task #64 — three more Tier 3 P0 wedges:
  //   gst-invoice §3.1 — invoice-to-GSTR fields (25c)
  //   rental      §3.2 — rental agreement risks + missing clauses (15c)
  //   syllabus    §3.3 — syllabus → week-by-week study plan (20c)
  | "gst-invoice"
  | "rental"
  | "syllabus"
  // Task #65 — three more Tier 3 wedges:
  //   property §3.5 P1 — title/khata/EC/parent (30c)
  //   discharge §3.4 P1 — patient-friendly discharge summary (10c)
  //   itr-form16 §3.1 P1 — Indian tax doc analyzer (20c)
  | "property"
  | "discharge"
  | "itr-form16"
  // Task #67 — five more Tier 3 P0 wedges:
  //   cover-letter §3.6 P0 — tailored cover letter from resume +
  //   optional JD (5c). Uses `query` field for JD.
  //   jd-match     §3.6 P0 — resume vs JD fit report with gap
  //   analysis (5c/resume). Uses `query` field for JD.
  //   tnpsc        §3.3 P0 — TNPSC answer-key analyzer (₹299/mo
  //   or 15c). Table of questions with correct answer + user
  //   marks if available.
  //   jee-neet     §3.3 P0 — JEE/NEET previous-year paper
  //   analyser — subject-wise topic frequency + difficulty
  //   distribution + revision plan (₹499/mo or 20c).
  //   multi-bank   §3.1 P0 — merge multiple Indian bank
  //   statements into one consolidated transaction view with
  //   per-bank summary (20c).
  | "cover-letter"
  | "jd-match"
  | "tnpsc"
  | "jee-neet"
  | "multi-bank"
  // Task #75 — five more Tier 3 P1 wedges:
  //   credit-card §3.1 — categorise spend, recurring charges, fees,
  //   reward burn (15c)
  //   mutual-fund §3.1 — parse CAMS / KFin consolidated MF
  //   statements with returns + holdings table (15c)
  //   nda         §3.2 — flag risky NDA clauses, missing carveouts,
  //   negotiation points (15c)
  //   sale-deed   §3.2 — Indian sale deed risk audit + missing
  //   clauses + chain-of-title (25c)
  //   employment  §3.2 — employment contract review with
  //   non-compete, IP, notice period flags (20c)
  | "credit-card"
  | "mutual-fund"
  | "nda"
  | "sale-deed"
  | "employment"
  // Task #77 — five more Tier 3 P1 wedges:
  //   medical-bill §3.4 — Indian medical bill / insurance claim
  //   prep with itemised charges + Cashless/reimbursement notes (20c)
  //   prescription §3.4 — handwritten prescription parser into
  //   structured medication list (10c)
  //   rera         §3.5 — RERA project document audit + risk flags (25c)
  //   ec           §3.2 — Encumbrance Certificate parser with
  //   chain of liens / mortgages over time (15c)
  //   salary-slip  §3.1 — Indian salary slip analyzer with
  //   YoY-friendly normalised structure (10c)
  | "medical-bill"
  | "prescription"
  | "rera"
  | "ec"
  | "salary-slip"
  // Task #78 — five more Tier 3 wedges:
  //   upsc          §3.3 — UPSC Prelims/Mains paper analyzer (20c)
  //   research-paper §3.3 — academic paper summarizer with cited
  //   methods/results/limitations + BibTeX (15c)
  //   demat         §3.1 — NSDL/CDSL CAS / demat statement analyzer
  //   with portfolio + corporate actions (15c)
  //   insurance     §3.10 — Indian insurance policy comparator OR
  //   single-policy parser (extracts coverage / premium / exclusions /
  //   claim contacts) (20c)
  //   loan-bundle   §3.1 — Loan application document bundler that
  //   audits a stack of docs against bank checklist (15c)
  | "upsc"
  | "research-paper"
  | "demat"
  | "insurance"
  | "loan-bundle"
  // Task #79 — five more Tier 3 wedges:
  //   expense-report  §3.1 P1 — bank-statement → expense report
  //   with category × month matrix (15c)
  //   court-order     §3.2 P2 — Indian court judgment / order
  //   summary with parties + ratio + reasoning + remedy (20c)
  //   partnership-deed §3.2 P2 — partnership deed analyzer with
  //   roles + capital + profit-share + risk flags (20c)
  //   ssc-banking     §3.3 P1 — SSC CGL / Banking PO/Clerk exam
  //   paper analyzer (15c)
  //   ncert           §3.3 P1 — NCERT chapter summarizer with
  //   class-wise vocab (10c)
  | "expense-report"
  | "court-order"
  | "partnership-deed"
  | "ssc-banking"
  | "ncert"
  // Task #80 — five more Tier 3 wedges:
  //   scan-report      §3.4 P2 — MRI/CT/X-ray report explainer in
  //   plain Indian English. NOT a diagnosis. (20c)
  //   electricity-bill §3.10 P2 — TANGEDCO / BESCOM / TSSPDCL etc.
  //   slab-by-slab + recommendations (5c)
  //   telecom-bill     §3.10 P2 — Airtel / Jio / Vi postpaid /
  //   broadband bill analysis with overage flags (5c)
  //   builder-agreement §3.5 P2 — under-construction agreement
  //   red-flag detector for buyers (30c)
  //   balance-sheet    §3.1 P2 — extract structured financials from
  //   a balance sheet / P&L (25c)
  | "scan-report"
  | "electricity-bill"
  | "telecom-bill"
  | "builder-agreement"
  | "balance-sheet"
  // Task #81 — five more wedges (Tier 2 §2.5/§2.6/§2.8 + Tier 3 §3.3):
  //   improve-writing  §2.6 P1 — clarity / concision rewrite (5c)
  //   paraphrase       §2.6 P1 — paraphrase preserving meaning (5c)
  //   plagiarism       §2.5 P2 — internal originality check, surfaces
  //   patches that read like quoted/repurposed material (10c)
  //   chart-to-table   §2.8 P1 — extract numeric data from chart
  //   images embedded in the PDF (5c)
  //   paper-pattern    §3.3 P2 — multi-year question-paper pattern
  //   analysis (use to compare 5+ years of past papers) (15c)
  | "improve-writing"
  | "paraphrase"
  | "plagiarism"
  | "chart-to-table"
  | "paper-pattern"
  // Sprint A — 5 Indian govt ID parsers (Tier 3 wedges, §3.x).
  //   aadhaar         — Aadhaar e-PDF parser; redacts the full
  //                     12-digit number, only echoes last 4 (10c).
  //   pan-card        — PAN card e-card / verification PDF parser
  //                     (10c).
  //   driving-license — DL extract / Sarathi / Vahan PDF parser
  //                     with vehicle classes + validity (10c).
  //   voter-id        — EPIC / Voter ID PDF parser (10c).
  //   passport        — passport bio page parser including MRZ
  //                     detection if present (10c).
  | "aadhaar"
  | "pan-card"
  | "driving-license"
  | "voter-id"
  | "passport"
  // Sprint B — 5 Indian financial wedges (Tier 3 §3.1).
  //   form-26as     — TDS / tax-credit consolidated statement (15c)
  //   form-15g-15h  — TDS exemption declaration parser (10c)
  //   rent-receipt  — rent receipts → HRA-friendly summary (10c)
  //   property-tax  — municipal property tax bill parser (10c)
  //   stamp-duty    — stamp duty receipt / e-Stamp analyzer (10c)
  | "form-26as"
  | "form-15g-15h"
  | "rent-receipt"
  | "property-tax"
  | "stamp-duty";

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
      case "action-items":
        // §2.7 Action Items. Markdown table of actionable TODOs
        // extracted from meeting notes, specs, briefs, etc.
        // Owner / due-date / priority surfaced when the source
        // carries them; left blank otherwise (don't invent).
        return (
          "Extract every action item from this document as a " +
          "Markdown table with columns `Task | Owner | Due | " +
          "Priority | Page`. Task = a verb-led one-sentence " +
          "description of what needs doing (\"Review Q3 " +
          "forecast\", \"Send updated contract to Acme\"). Owner " +
          "= the person or role assigned; blank if not specified. " +
          "Due = the deadline in ISO format (YYYY-MM-DD) when " +
          "the source gives one, plain text otherwise, blank if " +
          "none. Priority = High / Medium / Low only if the " +
          "source explicitly marks it; blank otherwise. Page = " +
          "the source page. Do NOT invent owners or deadlines — " +
          "leave them blank. Skip aspirational statements " +
          "(\"we should consider…\") unless accompanied by a " +
          "concrete commitment. If no action items found, " +
          "render \"_No action items detected._\" with a one-" +
          "line note that this doesn't appear to be an " +
          "actionable document (meeting notes, spec, brief)."
        );
      case "bank-statement":
        // §3.1 Bank Statement Parser. JSON transaction list +
        // category inference. Indian banks (SBI / HDFC / ICICI /
        // Axis / Kotak) use different PDF layouts — we rely on
        // the model's flexible parsing. Output is JSON for the
        // UI to render + CSV export.
        return (
          "Parse this bank statement into structured JSON. " +
          "Output ONLY a ```json fenced code block containing a " +
          "single object shaped {\"account\": {\"holder\": " +
          "string|null, \"bank\": string|null, \"number_masked\": " +
          "string|null, \"period\": string|null}, \"opening_" +
          "balance\": number|null, \"closing_balance\": " +
          "number|null, \"currency\": string (default \"INR\"), " +
          "\"transactions\": [{\"date\": string (YYYY-MM-DD when " +
          "possible), \"description\": string (verbatim), " +
          "\"debit\": number|null, \"credit\": number|null, " +
          "\"balance\": number|null, \"category\": string (one " +
          "of: Income, Transfer, Food, Travel, Shopping, Bills, " +
          "Investment, Tax, Cash, Fees, Other)}]}. Preserve " +
          "transaction descriptions verbatim. Category is your " +
          "best-effort classification; if truly ambiguous use " +
          "'Other'. Do NOT invent dates, amounts, or balances — " +
          "null is the correct answer when the source is " +
          "unclear. Works for SBI / HDFC / ICICI / Axis / Kotak " +
          "/ Yes / IDFC and most NBFCs."
        );
      case "gst-invoice":
        // §3.1 GST Invoice Extractor. Extracts the fields a CA /
        // SME needs to file GSTR — supplier/buyer GSTINs, invoice
        // metadata, line items, tax breakdown.
        return (
          "Extract this GST invoice into a GSTR-2-ready Markdown " +
          "report. Produce these H2 sections in order: " +
          "`## Invoice Header` (table with: Invoice No, Date, " +
          "Place of Supply, Reverse Charge Y/N). `## Supplier` " +
          "(table: Name, GSTIN, Address, State Code). `## Buyer` " +
          "(table: Name, GSTIN, Address, State Code). " +
          "`## Line Items` (table with columns: HSN/SAC, " +
          "Description, Qty, Unit, Rate, Taxable Value, " +
          "CGST %, CGST Amt, SGST %, SGST Amt, IGST %, IGST Amt). " +
          "`## Totals` (Taxable Value, Total CGST, Total SGST, " +
          "Total IGST, Round-off, Invoice Total). Do NOT invent " +
          "GSTINs or amounts — leave blank if not in the source. " +
          "If this is not a GST invoice, render \"_Not a GST " +
          "invoice._\" with one line stating what the document " +
          "appears to be."
        );
      case "rental":
        // §3.2 Rental Agreement Analyzer. Indian-context risks
        // and missing clauses. NOT legal advice; surfaced in FAQ.
        return (
          "Analyse this rental agreement for risks and missing " +
          "clauses. Produce these H2 sections: `## Summary` " +
          "(one paragraph: parties, term, rent, deposit, " +
          "city/state). `## Critical Issues` (bullets with quoted " +
          "text + risk explanation — unfair lock-in, biased " +
          "deposit-forfeit, vague maintenance obligations, " +
          "missing notice period, etc.). `## Missing Standard " +
          "Clauses` (typical Indian rental clauses absent here — " +
          "Maintenance & Repairs, Utilities, Force Majeure, " +
          "Renewal Terms, Termination, Dispute Resolution, " +
          "Stamp Duty / Registration, Lock-in, Notice Period). " +
          "`## Negotiation Points` (3–5 specific suggestions a " +
          "tenant or landlord should ask for). `## Standard " +
          "Practice Notes` (Indian rental norms relevant to this " +
          "agreement — Karnataka / Maharashtra / Delhi / Tamil " +
          "Nadu specifics if state is identifiable). End with a " +
          "one-line disclaimer that this is not legal advice."
        );
      case "property":
        // §3.5 Property Document Checker. Title deed / khata /
        // Encumbrance Certificate / parent document analysis for
        // Indian residential / commercial property purchases.
        return (
          "Analyse this Indian property document for completeness " +
          "and red flags. Produce: `## Document Type` (one line — " +
          "Sale Deed / Khata / Encumbrance Certificate / Parent " +
          "Document / Allotment Letter / Lease Deed / etc.; if " +
          "unclear, say so). `## Property Details` (table: Address, " +
          "Survey/Plot No, Built-up area, Type, Title Holder, " +
          "Acquisition Date). `## Chain of Title` (bullets " +
          "tracing ownership history if visible — flag any gaps " +
          "or unrelated transfers). `## Encumbrances & Charges` " +
          "(list any mortgages, liens, court orders mentioned). " +
          "`## Red Flags` (bullets — missing seller signatures, " +
          "stamp-duty inconsistencies, encumbrance not cleared, " +
          "incomplete survey numbers, illegible registration " +
          "stamps, etc.). `## Missing Documents` (list standard " +
          "docs a buyer would also ask for that aren't in this " +
          "PDF — Khata Extract, Tax-paid Receipts, Approved " +
          "Plan, Occupancy Certificate, NOC, Power of Attorney, " +
          "etc.). End with a one-line disclaimer that property " +
          "verification requires a qualified lawyer / advocate."
        );
      case "discharge":
        // §3.4 Discharge Summary Simplifier. Patient + family-
        // friendly version of a hospital discharge summary.
        return (
          "Rewrite this hospital discharge summary in plain " +
          "language for the patient and their family. Produce: " +
          "`## Why You Were Admitted` (1–2 sentences). " +
          "`## What Happened During Your Stay` (one paragraph in " +
          "everyday language — no Latin/medical jargon unless " +
          "you immediately gloss it). `## Diagnoses` (bulleted " +
          "list with each named condition followed by a one-" +
          "sentence plain-language explanation in brackets). " +
          "`## Medications to Take Home` (table: Medicine | " +
          "What it's for | Dose | Duration). `## Follow-ups` " +
          "(table: Date | Specialist | Reason). `## Warning " +
          "Signs to Watch For` (bullets — call the hospital " +
          "if these symptoms appear). `## Lifestyle Notes` " +
          "(diet, exercise, activity restrictions in plain " +
          "language). DO NOT add medical advice the source " +
          "doesn't carry; if the source is silent, leave that " +
          "section blank or say \"discuss with your doctor.\" " +
          "End with a clear note that this is a plain-language " +
          "rewrite of an existing summary, not a new diagnosis " +
          "or recommendation."
        );
      case "itr-form16":
        // §3.1 ITR / Form 16 Analyzer. Salaried Indian tax-
        // filing document review.
        return (
          "Analyse this Indian tax document (Form 16, ITR-V, ITR " +
          "Acknowledgment, or annual tax statement). Produce: " +
          "`## Document Identified` (which form, AY/FY covered, " +
          "PAN-masked, employer name if visible). `## Income " +
          "Summary` (table: Salary, House Property, Capital " +
          "Gains, Other Sources, Total — with values from the " +
          "document; blank if section absent). `## Deductions " +
          "Claimed` (80C, 80D, HRA, Standard Deduction, others — " +
          "with amounts). `## Tax Computation` (table: Gross " +
          "Total Income, Total Deductions, Taxable Income, " +
          "Tax + Cess, TDS, Refund/Payable). `## Observations` " +
          "(3–5 bullets — under-utilised deductions, mismatched " +
          "TDS vs computed tax, incorrect regime selection " +
          "indicators, etc.). `## Suggested Actions` (concrete " +
          "items — e.g. \"verify TDS in Form 26AS\", \"file " +
          "rectification under Section 154 if mismatch\"). End " +
          "with a one-line note that this is an analysis, not " +
          "tax advice — consult a CA before acting."
        );
      case "syllabus":
        // §3.3 Syllabus → Study Plan. Indian student / aspirant
        // workflow. Generates week-by-week schedule with practice
        // checkpoints.
        return (
          "Convert this syllabus into a structured study plan. " +
          "Produce: `## Overview` (3–4 sentence framing — " +
          "subject area, scope, and how the topics relate). " +
          "`## Topic Map` (flat bulleted list of every topic / " +
          "subtopic in source order, page-cited where possible). " +
          "`## Recommended Study Plan` (a Markdown table with " +
          "columns: Week, Topics, Hours, Practice Checkpoint). " +
          "Default to 12 weeks at 8 hours/week unless the " +
          "syllabus implies otherwise; adjust if obviously a " +
          "shorter course (e.g. a 6-week boot camp). Practice " +
          "Checkpoint = a concrete activity (mock test, problem " +
          "set, summary essay). `## Final Revision Strategy` " +
          "(2–3 paragraphs on how to use the last week before " +
          "the exam). Optimised for Indian competitive-exam / " +
          "school / college-course syllabi (TNPSC, UPSC, JEE, " +
          "NEET, NCERT, university)."
        );
      case "blood-test":
        // §3.4 Blood Test Report Analyzer. Extracts lab values
        // + flags out-of-range with reference ranges. NOT a
        // diagnostic — surfaced clearly in FAQ.
        return (
          "Parse this blood test / lab report into structured " +
          "JSON. Output ONLY a ```json fenced code block " +
          "containing a single object shaped {\"patient\": " +
          "{\"name\": string|null, \"age\": string|null, " +
          "\"sex\": string|null, \"date\": string|null (test " +
          "date, ISO YYYY-MM-DD when possible)}, \"lab\": " +
          "string|null, \"results\": [{\"test\": string (the " +
          "test name, e.g. 'Hemoglobin'), \"value\": string " +
          "(the value as reported, including unit), \"range\": " +
          "string|null (reference range), \"flag\": string (one " +
          "of: 'normal', 'low', 'high', 'critical', 'unknown'), " +
          "\"group\": string|null (e.g. 'CBC', 'Lipid Profile', " +
          "'LFT', 'KFT', 'Thyroid', 'Glucose')}]}. Include " +
          "EVERY reported test, not just abnormal ones. Flag " +
          "determination uses the reference range when stated; " +
          "if unsure, use 'unknown' rather than guessing. Do " +
          "NOT add medical interpretation or recommendations in " +
          "the output — this tool extracts data; interpretation " +
          "belongs with a clinician."
        );
      case "cover-letter":
        // §3.6 Cover Letter Generator. Input = user's resume PDF.
        // If a JD is supplied via `query`, tailor to it.
        return (
          "Write a tailored cover letter based on the attached " +
          "resume. Output a single cover letter (no commentary, " +
          "no alternatives). Structure: `## Cover Letter` header, " +
          "then the letter body with greeting, three paragraphs, " +
          "and closing. Paragraph 1 — opening that names the " +
          "target role + hook (best credential from the resume). " +
          "Paragraph 2 — two or three concrete achievements from " +
          "the resume with quantified impact, mapped to the JD's " +
          "requirements if a JD is provided. Paragraph 3 — why " +
          "this company / role specifically + a clear call to " +
          "action (\"I'd welcome the chance to discuss...\"). " +
          "Keep it under 350 words. Neutral professional tone, " +
          "no clichés (\"self-motivated team player\", \"hit the " +
          "ground running\"). End with `## Key Customizations` — " +
          "3 bullets describing WHICH resume lines were surfaced " +
          "for which JD requirements, so the user can swap in " +
          "alternatives. If no JD was provided, generate a " +
          "generic-but-strong version and note that in the " +
          "customization section."
        );
      case "jd-match":
        // §3.6 Resume → JD Matcher. Input = resume PDF. JD in
        // `query`. Output a fit-score + gap analysis.
        return (
          "Score the attached resume against the job description " +
          "provided in the search_query tag. Output: `## Fit " +
          "Score` (single number 0-100 with one sentence " +
          "explaining the score — be blunt, this is self-audit). " +
          "`## Role Alignment` (a 3-column Markdown table: " +
          "Requirement | Resume Evidence | Match (✓ strong / ◐ " +
          "partial / ✗ missing). One row per explicit JD " +
          "requirement.). `## Strengths` (3-5 bullets — the " +
          "resume achievements that most strongly back the JD). " +
          "`## Gaps` (bullets — requirements with ✗ or ◐; for " +
          "each gap, suggest one concrete thing the candidate " +
          "could add or emphasise). `## Keywords Missing` (plain " +
          "list — JD-critical terms absent from the resume; these " +
          "are likely ATS blockers). `## Suggested Next Steps` " +
          "(3 concrete actions: re-words, projects to add, " +
          "certifications to pursue). If no JD is provided via " +
          "the query, return just the resume audit section of " +
          "ats-resume-optimizer style output and note the missing " +
          "JD in a top-level callout."
        );
      case "tnpsc":
        // §3.3 TNPSC Answer Key Analyzer. Input = TNPSC question
        // paper OR TNPSC-released answer key PDF. Produce a
        // question-by-question analysis.
        return (
          "Analyse this TNPSC (Tamil Nadu Public Service " +
          "Commission) question paper or answer key. Output: " +
          "`## Exam Identified` (paper name, exam date, subject, " +
          "question count, marking scheme if visible). `## " +
          "Question Analysis` — a Markdown table with columns: " +
          "#, Question (short), Subject-Tag (History / Geography " +
          "/ Polity / Economy / Science / Aptitude / Tamil Lit / " +
          "Current Affairs), Correct Answer (from the key), " +
          "Expected Difficulty (Easy / Medium / Hard — based on " +
          "the TNPSC pattern you know). One row per question; " +
          "include EVERY question present. `## Subject-Wise " +
          "Distribution` (a table with Subject, #Questions, " +
          "%Total, Avg-Difficulty). `## Topic Frequency` " +
          "(bullets — recurring topics you'd prioritise for the " +
          "next attempt). `## Strategy Notes` (3-5 bullets on " +
          "which sections to cram vs deprioritise, pacing, and " +
          "score-maximisation — specific to the TNPSC scheme of " +
          "examination). Use Tamil Nadu–specific context where " +
          "relevant (Tamil Thaayaga history, state polity, Tamil " +
          "Nadu geography/economy)."
        );
      case "jee-neet":
        // §3.3 JEE / NEET Previous Year Analyzer. Input = JEE
        // or NEET question paper PDF.
        return (
          "Analyse this JEE or NEET previous-year question paper. " +
          "Output: `## Paper Identified` (which exam — JEE Main / " +
          "JEE Advanced / NEET-UG, year, shift/phase if visible, " +
          "subject split). `## Question Table` — a Markdown " +
          "table with columns: #, Question Type (MCQ / " +
          "Numerical / Assertion-Reason / Match-following), " +
          "Subject (Physics / Chemistry / Biology for NEET; " +
          "Physics / Chemistry / Math for JEE), Chapter, " +
          "Sub-topic, Difficulty (Easy / Medium / Hard), Expected " +
          "Marks. One row per question. `## Chapter Frequency` — " +
          "a table per subject: Chapter, #Questions, %Subject, " +
          "Cumulative Difficulty. Sort high→low frequency. `## " +
          "High-Yield Topics` — 6–10 chapters that showed up " +
          "most; for each, one line on why it's high-yield (e.g. " +
          "\"Thermodynamics — 4 Qs, all Medium+, carries 16 " +
          "marks\"). `## Revision Plan` — a week-by-week plan " +
          "for a 12-week runway before the exam, weighted by " +
          "frequency × difficulty. `## Score-Maximisation Notes` " +
          "— 3–5 bullets on attempts strategy (which subject " +
          "first, how much time per Q, when to skip, accuracy vs " +
          "speed trade-offs). Be specific to the JEE/NEET " +
          "marking scheme (e.g. negative-marking penalties)."
        );
      case "credit-card":
        // §3.1 Credit Card Statement Analyzer.
        return (
          "Analyse this credit card statement (Indian or international " +
          "issuer). Output: `## Statement Identified` (bank, card type, " +
          "billing period, last-4, total due, minimum due, due date). " +
          "`## Spend by Category` (a Markdown table with columns: " +
          "Category, Amount, % of Total, # Transactions. Use " +
          "categories: Food/Groceries, Fuel, Travel, Shopping, " +
          "Entertainment, Bills/Utilities, EMI, Cash/ATM, Fees/Charges, " +
          "Refund/Credit, Other). `## Top Merchants` (top 10 by spend " +
          "with merchant + total). `## Fees & Interest` (table: Type, " +
          "Amount, Description — finance charges, late fees, " +
          "over-limit, foreign-tx fees). `## Recurring Charges` " +
          "(detected subscriptions: name, frequency, amount). `## " +
          "Reward Points` (earned this cycle, redeemed, balance — if " +
          "visible). `## Observations` (3-5 bullets — high-fee " +
          "alerts, unusual spikes, recurring charges to review). End " +
          "with note that this is parsed data, not financial advice."
        );
      case "mutual-fund":
        // §3.1 Mutual Fund / CAMS / KFin Statement Parser.
        return (
          "Parse this mutual fund consolidated statement (CAMS, " +
          "KFin, or AMC-specific format). Output: `## Statement " +
          "Identified` (PAN-masked, period covered, AMCs included, " +
          "folio count). `## Holdings Snapshot` (Markdown table: " +
          "Scheme, Folio, AMC, Category (Equity/Debt/Hybrid/ELSS/" +
          "Liquid/Other), Units, NAV, Current Value, Invested, " +
          "Returns %, XIRR if available). Sort by Current Value " +
          "desc. `## Asset Allocation` (table: Category, Value, " +
          "% of Portfolio). `## Transaction Summary` (table: Type " +
          "(Purchase/Switch-In/SIP/Redeem/Dividend), Count, Amount). " +
          "`## SIPs Active` (scheme, monthly amount, next date if " +
          "visible). `## Top Performers` (3 best XIRR) and `## " +
          "Underperformers` (3 worst — if held >12 months and " +
          "negative or below 8%). `## Tax Lots` (only mention if " +
          "relevant for capital gains; LTCG vs STCG split). End with " +
          "note that this is parsed data, not investment advice — " +
          "consult an SEBI-registered advisor."
        );
      case "nda":
        // §3.2 NDA Analyzer.
        return (
          "Analyse this Non-Disclosure Agreement (NDA / confidentiality " +
          "agreement). Output: `## Agreement Identified` (parties, " +
          "effective date, term length, jurisdiction). `## Type` " +
          "(unilateral / mutual / multilateral). `## Risk Flags` " +
          "(table: Issue, Severity (high/medium/low), Quote from " +
          "agreement, Recommendation). Common high-severity flags " +
          "to surface: missing residual-knowledge carveout, broad " +
          "definition of confidential information, indefinite term " +
          "or auto-renewal, embedded non-compete or non-solicit, " +
          "one-sided indemnification, jurisdiction in remote/foreign " +
          "courts, missing return-of-materials clause, IP assignment " +
          "(should NOT be in an NDA). `## Negotiation Points` (3-5 " +
          "concrete redlines you'd push back on, with suggested " +
          "language). `## Standard / Acceptable` (clauses that " +
          "are typical and OK to sign as-is). `## Missing Standard " +
          "Clauses` (e.g. residual knowledge, exceptions for " +
          "publicly-known info, forced-disclosure protections). End " +
          "with note that this is a flag-and-discuss aid, not legal " +
          "advice — review with counsel before signing high-stakes " +
          "NDAs."
        );
      case "sale-deed":
        // §3.2 Sale Deed Analyzer (Indian property buyers).
        return (
          "Analyse this Indian sale deed / property conveyance " +
          "document. Output: `## Document Identified` (deed type, " +
          "execution date, sub-registrar office, document number, " +
          "stamp duty paid, consideration amount). `## Parties` " +
          "(seller(s) and buyer(s) with relationship — e.g. " +
          "individual / firm / power of attorney). `## Property " +
          "Schedule` (description from deed: extent, boundaries, " +
          "khata/survey number, full address). `## Chain of Title` " +
          "(brief paragraph summarising prior ownership chain " +
          "referenced in the deed; flag any gaps). `## Encumbrances " +
          "& Liens Mentioned` (any existing charges, mortgages, " +
          "leases, easements). `## Risk Flags` (table: Issue, " +
          "Severity, Quote, Recommendation. Common flags: incomplete " +
          "chain of title, missing parent document references, " +
          "inadequate stamp duty, undivided share without partition, " +
          "ongoing litigation references, agricultural-conversion " +
          "issues, RERA non-disclosure for under-construction). `## " +
          "Missing Standard Clauses` (e.g. indemnity by seller for " +
          "title defects, encumbrance certificate cross-reference, " +
          "tax-paid receipts attached). `## Recommended Verifications` " +
          "(EC for past 30 years, latest property tax receipt, " +
          "khata certificate, building approval, RERA registration " +
          "if applicable). End with explicit note that this is a " +
          "checklist aid for buyers, NOT legal advice — engage a " +
          "local property lawyer before purchasing."
        );
      case "employment":
        // §3.2 Employment Contract Review.
        return (
          "Analyse this employment / appointment contract. Output: " +
          "`## Role Identified` (employer, employee, designation, " +
          "start date, location). `## Compensation Summary` (table: " +
          "Component, Amount, Frequency — base, allowances, bonuses, " +
          "ESOPs, benefits). `## Term & Termination` (probation " +
          "length, notice period — both sides, severance entitlement, " +
          "termination-for-cause grounds). `## Risk Flags` (table: " +
          "Issue, Severity, Quote, Recommendation. Common flags: " +
          "long non-compete (>6 months), broad non-solicit, IP " +
          "assignment that captures pre-employment work, garden " +
          "leave at full notice, training-bond / clawback clauses, " +
          "exclusive-jurisdiction in distant city, unilateral " +
          "transfer rights, no severance on retrenchment, vague " +
          "performance-improvement-plan exit, post-termination " +
          "moonlighting bans). `## Standard / Acceptable` (clauses " +
          "typical for the role/level). `## Missing Standard " +
          "Protections` (e.g. earned-leave encashment, gratuity " +
          "reference, prior-employer release). `## Negotiation " +
          "Points` (3-5 redlines a candidate could reasonably push " +
          "back on with suggested replacement language). End with " +
          "note that this is an audit aid, not legal advice — for " +
          "senior or India-specific issues consult an employment " +
          "lawyer."
        );
      case "medical-bill":
        // §3.4 Medical Bill / Insurance Claim Prep.
        return (
          "Analyse this Indian medical bill / hospital bill / " +
          "insurance claim document. Output: `## Bill Identified` " +
          "(hospital name, patient (PII-masked), admission date, " +
          "discharge date, IP/OP, total billed, total payable). " +
          "`## Itemised Charges` (Markdown table: Category " +
          "(Room/ICU, Doctor's Fees, Investigations, Medicines, " +
          "Procedures, Consumables, Implants, Other), Amount, " +
          "%Total, # Items). `## Insurance / Cashless` (insurer if " +
          "visible, sum-insured used, cashless approval status, " +
          "co-pay / deductible amount, dis-allowed items). `## " +
          "Likely Reimbursable` (line items typically covered by " +
          "Indian health insurance — IRDAI standard exclusions " +
          "noted separately). `## Likely Non-Reimbursable` " +
          "(IRDAI-excluded items: registration fees, food charges, " +
          "diapers, attendant fees, telephone, etc.). `## Pre-/" +
          "Post-Hospitalisation Notes` (if claim pertains to a " +
          "hospitalisation, list the items potentially claimable " +
          "in the 30-day pre and 60-day post windows). `## " +
          "Suggested Next Steps` (concrete actions: documents to " +
          "compile for claim, common reasons claims get denied, " +
          "discharge summary cross-check). End with note this is " +
          "a parsing + checklist aid, NOT a guarantee of " +
          "reimbursement — IRDAI rules + your specific policy " +
          "wording control."
        );
      case "prescription":
        // §3.4 Prescription Parser (handwritten + printed).
        return (
          "Parse this Indian prescription (printed or handwritten) " +
          "into structured JSON. Output ONLY a ```json fenced code " +
          "block with shape: {\"prescriber\": {\"name\": " +
          "string|null, \"qualification\": string|null, " +
          "\"registration_no\": string|null, \"clinic\": " +
          "string|null}, \"patient\": {\"name\": string|null, " +
          "\"age\": string|null, \"sex\": string|null, \"date\": " +
          "string|null (ISO YYYY-MM-DD)}, \"diagnosis\": " +
          "string|null, \"medications\": [{\"name\": string (the " +
          "drug name as written, brand or generic), \"strength\": " +
          "string|null (e.g. '500 mg'), \"dosage\": string|null " +
          "(e.g. '1 tablet'), \"frequency\": string|null (e.g. " +
          "'twice daily', '1-0-1', 'BD'), \"duration\": " +
          "string|null (e.g. '5 days', '14 days'), \"timing\": " +
          "string|null (e.g. 'after food', 'before sleep'), " +
          "\"route\": string|null (oral / IV / topical / inhaled), " +
          "\"confidence\": string (one of: 'high', 'medium', " +
          "'low' — based on legibility)}], \"investigations\": " +
          "[string] (lab tests prescribed), \"follow_up\": " +
          "string|null (next visit instructions)}. " +
          "Handwriting interpretation rules: when illegible mark " +
          "the field as null and set confidence='low'. NEVER " +
          "guess a drug name — wrong drug is a safety risk. Use " +
          "Indian prescribing conventions: '1-0-1' means morning-" +
          "noon-night; 'BD'=twice daily; 'TDS'=thrice daily; " +
          "'HS'=at bedtime; 'SOS'=as needed. End with no extra " +
          "commentary outside the JSON."
        );
      case "rera":
        // §3.5 RERA Document Analyzer.
        return (
          "Analyse this Indian RERA (Real Estate Regulatory " +
          "Authority) project document — registration certificate, " +
          "annexure, agreement for sale, or builder-buyer agreement. " +
          "Output: `## Project Identified` (project name, RERA " +
          "registration number, state RERA authority, promoter / " +
          "developer name, registration date, completion deadline). " +
          "`## Project Details` (location, total units, area type " +
          "(carpet/built-up/super), launched towers/blocks, common " +
          "amenities listed in the registration). `## Approvals & " +
          "Sanctions` (commencement certificate, environment " +
          "clearance, occupancy/completion certificates referenced). " +
          "`## Risk Flags` (table: Issue, Severity, Quote, " +
          "Recommendation. Common flags: missing OC/CC, expired " +
          "approvals, registration revoked/lapsed, complaints / " +
          "penalties on RERA portal, unrealistic completion " +
          "timelines, area calculated on super-built-up vs RERA-" +
          "mandated carpet area, hidden charges in agreement, " +
          "unilateral termination rights for builder, no penalty " +
          "for delay). `## Buyer Protections Present` (clauses " +
          "that work for the buyer per RERA Act 2016). `## " +
          "Verification Checklist` (concrete actions: cross-check " +
          "registration on state RERA portal, ask for OC, verify " +
          "encumbrance, RERA complaints search). End with note " +
          "that this is an audit aid for buyers, NOT legal advice " +
          "— consult a real estate lawyer + your state's RERA " +
          "filings before purchasing."
        );
      case "ec":
        // §3.2 / §3.5 Encumbrance Certificate Parser.
        return (
          "Parse this Indian Encumbrance Certificate (EC) issued " +
          "by the Sub-Registrar's office. Output: `## Document " +
          "Identified` (issuing SRO, application number, date " +
          "issued, period covered (from-to), property description, " +
          "applicant name). `## Encumbrances Found` (Markdown " +
          "table: Date, Document Number, Document Type (Sale Deed " +
          "/ Mortgage / Settlement / Gift / Lease / Release / " +
          "Other), Parties (PII-masked), Consideration, " +
          "Description). Sort chronologically. If 'Nil " +
          "Encumbrance' is stated, surface that prominently. `## " +
          "Chain Summary` (paragraph narrative: how the property " +
          "title moved through these documents — useful to spot " +
          "broken chains or missing predecessors). `## Risk Flags` " +
          "(active mortgages still in force, cross-referenced " +
          "deeds outside this EC's period that need separate ECs " +
          "for verification, suspicious quick-flips, sale by power " +
          "of attorney without principal verification). `## " +
          "Coverage Gaps` (years not covered by this EC — if you " +
          "have only 2014-2024 EC, recommend pulling the prior " +
          "30y to satisfy bank-loan diligence). `## Recommended " +
          "Next Steps` (additional ECs to pull, cross-reference " +
          "with khata + property tax history). End with note " +
          "this is a parsing aid — banks and lawyers may still " +
          "need original EC for diligence."
        );
      case "improve-writing":
        // §2.6 Improve Writing — clarity / concision rewrite.
        return (
          "Rewrite this document to improve clarity and concision " +
          "without changing the meaning. Output: `## Improved " +
          "Version` (the rewritten text in full). `## Edit " +
          "Summary` (3-5 bullets describing the kinds of changes " +
          "you made — e.g. 'split four 30-word sentences into " +
          "two-sentence pairs', 'replaced 12 instances of " +
          "passive voice with active', 'cut redundant " +
          "qualifiers like \"absolutely\", \"basically\"', " +
          "'tightened nominalisations'). Rules: preserve every " +
          "claim, number, and proper noun verbatim. Do NOT add " +
          "facts or examples not present in the original. Do NOT " +
          "change the document's register (a legal contract " +
          "stays formal; a casual blog stays casual). Aim for " +
          "20-30% shorter overall but never at the cost of " +
          "losing meaning. End with a one-line note about " +
          "approximate length reduction."
        );
      case "paraphrase":
        // §2.6 Paraphrase preserving meaning.
        return (
          "Paraphrase this document in your own words while " +
          "preserving every claim, number, and conclusion. " +
          "Output: `## Paraphrased Version` (the rewritten text " +
          "in full). `## How the Wording Changed` (3-5 bullets — " +
          "e.g. 'restructured opening from passive to active', " +
          "'replaced jargon \"leveraging\" with \"using\"', " +
          "'broke up two compound paragraphs'). Rules: never " +
          "alter facts, never add interpretation, never drop a " +
          "claim — paraphrasing is a wording change, not a " +
          "summary. Aim for similar length to the original, not " +
          "shorter. Preserve technical terms when no plainer " +
          "synonym would be accurate (e.g. don't paraphrase " +
          "'amortisation' as 'paying off'). End with a note " +
          "that paraphrasing isn't a substitute for citation — " +
          "credit the original work appropriately."
        );
      case "plagiarism":
        // §2.5 Internal originality check (no external corpus).
        return (
          "Audit this document for internal originality signals. " +
          "We don't compare against an external corpus, but we " +
          "DO surface patches that read like quoted, copy-pasted, " +
          "or repurposed material (sudden register shifts, " +
          "verbatim citations without attribution, definition-" +
          "style passages that look lifted from textbooks, " +
          "boilerplate paragraphs reused across sections). " +
          "Output: `## Originality Snapshot` (2-3 sentences — " +
          "broad assessment of how original the prose feels). " +
          "`## Flagged Passages` (Markdown table: Passage " +
          "(quoted), Section / page, Suspicion Type (one of: " +
          "'register-shift', 'unattributed-quote-style', " +
          "'definition-textbook-style', 'boilerplate-repeat', " +
          "'AI-generated-tells', 'translated-back-from-other-" +
          "language'), Recommendation). Mark severity Low/Medium/" +
          "High. `## AI-Generation Tells` (bullets — specific " +
          "phrases / structures common in LLM output: " +
          "'in conclusion', 'it is important to note', " +
          "'in today's world', overuse of em-dashes, three-item " +
          "rhetorical lists, etc.). `## Recommendations` (3-5 " +
          "concrete edits to lift originality + how to attribute " +
          "borrowed material properly). End with explicit caveat: " +
          "this is a heuristic check, not a Turnitin / Copyleaks " +
          "external-corpus scan. For thesis / publication " +
          "submission, run a real plagiarism service."
        );
      case "chart-to-table":
        // §2.8 Extract numeric data from a chart image embedded
        // in the PDF.
        return (
          "Extract the numeric data from any charts / graphs / " +
          "infographics embedded in this PDF and recreate them " +
          "as tables. The PDF's text won't carry the data — you " +
          "must read the chart visually. Output: For each chart " +
          "found, a section: `## Chart N — <chart title from the " +
          "figure caption>` followed by `**Type:** <bar / line / " +
          "pie / scatter / stacked / 100%-stacked / radar / " +
          "histogram>`, `**Source:** <page N>`, then a Markdown " +
          "table with the data points. Read axis labels and " +
          "units faithfully. For values you can't read precisely " +
          "from the visual, give a range (e.g. '170-180') with " +
          "a confidence note. For pie charts, columns are " +
          "Segment + Percentage. For stacked bars, columns are " +
          "Category + each Stack-Layer. After all charts, end " +
          "with a `## Charts Found` summary table (chart #, " +
          "title, page, type, # data points). If a chart's data " +
          "is genuinely illegible (low resolution, no " +
          "gridlines), surface that explicitly rather than " +
          "inventing numbers."
        );
      case "paper-pattern":
        // §3.3 Multi-year question-paper pattern analyzer.
        return (
          "Analyse this stack of question papers (typically 5-10 " +
          "years of the same exam concatenated). The user wants " +
          "to know what questions / topics / patterns recur and " +
          "which trend up or down. Output: `## Papers Detected` " +
          "(table: Year, Total Questions, Total Marks, " +
          "Sections). `## Subject / Section Mix Over Time` " +
          "(Markdown table — rows = subjects/sections, columns = " +
          "years, cells = #questions or %share. Reveals shifts " +
          "in syllabus weighting). `## Topic Frequency Across " +
          "Years` (table: Topic, Year-1, Year-2 ... ; aggregated " +
          "list sorted desc by total. The actual top of this " +
          "list is your high-yield study list). `## Question " +
          "Type Trend` (factual MCQ vs application-based vs " +
          "assertion-reason vs match-following ratio over " +
          "years). `## Difficulty Drift` (Easy / Medium / Hard " +
          "% per year). `## Question Recycle Rate` (questions " +
          "that appear verbatim or near-verbatim across years — " +
          "list them). `## Predictions` (5-7 specific topics " +
          "with high probability of appearing next, ranked, " +
          "with reasoning anchored in the data above — not " +
          "generic 'study hard'). `## Strategy Implications` " +
          "(3-5 bullets on study allocation, ignored sub-topics " +
          "the data suggests are safe to deprioritise, etc.). " +
          "Use exam-specific vocabulary if you can identify the " +
          "exam (TNPSC / UPSC / JEE / NEET / SSC / Banking / " +
          "GATE / etc.)."
        );
      // Sprint A — 5 Indian govt ID parsers (§3.x).
      // PRIVACY: Aadhaar full number is a Sensitive Personal Data
      // Identifier under DPDP Act 2023. We never echo all 12 digits.
      // PAN, EPIC, DL number, passport number have looser conventions
      // but still get mask-when-in-doubt treatment.
      case "aadhaar":
        return (
          "Parse this Aadhaar e-PDF (issued via UIDAI / DigiLocker / " +
          "mAadhaar). Output: `## Holder Identity` (Name, DOB, " +
          "Gender, Father/Spouse if printed). `## Address` (full " +
          "address as printed, with PIN). `## Aadhaar Number` (echo " +
          "ONLY the last 4 digits prefixed by `XXXX-XXXX-`. NEVER " +
          "print all 12 digits, even if visible). `## VID` (if a " +
          "Virtual ID is present, echo last 4 only with same XXXX " +
          "masking). `## Issue Details` (date generated, masking " +
          "status — masked Aadhaar shows only last 4, full Aadhaar " +
          "shows all 12). `## QR Code` (whether a QR code is " +
          "present and its declared content type). `## Privacy " +
          "Notes` (3-5 bullets explaining what's safe to share, " +
          "what isn't, when to use Masked Aadhaar / VID). End with " +
          "a clear caveat: this is data extraction, not identity " +
          "verification. Do NOT fabricate any field that's not " +
          "literally on the document."
        );
      case "pan-card":
        return (
          "Parse this PAN (Permanent Account Number) card or " +
          "verification PDF. Output: `## Holder Identity` (Name as " +
          "printed, Father's Name if shown, DOB). `## PAN Number` " +
          "(echo the full 10-character PAN in standard format " +
          "AAAAA9999A — PAN is not as sensitive as Aadhaar; this " +
          "matches NSDL / UTIITSL convention). `## Issue Details` " +
          "(date of issue if printed, signature presence, " +
          "photograph presence — say only what's literally " +
          "visible). `## Card Format` (physical card vs e-PAN PDF " +
          "vs verification PDF — a one-line classification). `## " +
          "Linkage Status` (if the PDF includes Aadhaar-PAN linkage " +
          "status, surface it as a flag — don't echo the Aadhaar " +
          "number even partially). `## What to Verify` (3-5 things " +
          "the user should double-check on their physical card vs " +
          "this PDF). End with: not financial / tax advice."
        );
      case "driving-license":
        return (
          "Parse this Driving License (DL) extract — typically from " +
          "Sarathi (Parivahan) or a state RTO portal. Output: `## " +
          "Holder Identity` (Name, DOB, Father's Name, Blood Group " +
          "if shown). `## License Details` (DL Number — echo full, " +
          "Issue Date, Validity From, Validity To, Issuing RTO). " +
          "`## Address` (full address as printed). `## Vehicle " +
          "Classes` (Markdown table: Class Code, Description, " +
          "Granted Date, Validity, Status. Common codes: LMV / MCWG " +
          "/ MCWOG / HGV / HPMV / TRANS / etc. — translate codes to " +
          "readable English). `## Endorsements / Suspensions` (any " +
          "flags shown — DUI history, cancellations, etc.). `## " +
          "Renewal Watch` (how many days until expiry; flag if " +
          "<30 days, <90 days, or already expired). `## Cross-" +
          "Verification Tips` (3-5 points: check on Sarathi portal, " +
          "verify QR code, etc.). End with: data extraction only, " +
          "not legal validity verification."
        );
      case "voter-id":
        return (
          "Parse this Voter ID (EPIC) card or verification PDF " +
          "issued by the Election Commission of India. Output: `## " +
          "Holder Identity` (Name, Father/Husband Name, DOB or Age, " +
          "Gender). `## EPIC Number` (echo full — EPIC is the " +
          "standard public reference, format usually 3 letters + 7 " +
          "digits). `## Constituency` (Assembly Constituency name + " +
          "number, Parliamentary Constituency, State). `## Polling " +
          "Station` (booth name + number if printed). `## Address` " +
          "(as printed). `## Issue Details` (issue date, signature " +
          "presence, hologram description). `## Cross-Verification` " +
          "(steps to verify on the National Voters' Service Portal " +
          "(NVSP) or Voter Helpline — type that 3-5 step list). `## " +
          "Updates Needed` (if address moved / name changed / etc., " +
          "what form to file: Form 8 vs Form 6 vs Form 7). End " +
          "with: data extraction only, not voter-eligibility " +
          "verification."
        );
      // Sprint B — Indian financial wedges (§3.1).
      case "form-26as":
        return (
          "Parse this Form 26AS (Tax Credit Statement from TRACES). " +
          "Output: `## Assessee` (PAN, Name — echo full PAN, last 4 " +
          "of Aadhaar if linked, AY). `## Part A — TDS on Salary` " +
          "(table: Deductor, TAN, Section, Total Tax Deducted, " +
          "Period). `## Part A1 — TDS Other Than Salary` (same " +
          "table shape, includes 194A interest, 194I rent, 194J " +
          "professional fees, etc.). `## Part B — TCS` (Tax " +
          "Collected at Source). `## Part C — Advance Tax / Self-" +
          "Assessment` (Challans paid, BSR code, dates, amounts). " +
          "`## Part D — Refund Status` (refunds issued in this AY). " +
          "`## Part E — High-Value Transactions (AIR / SFT)` " +
          "(financial transactions reported by banks / mutual funds " +
          "/ etc., flag any over thresholds). `## Cross-Check Notes` " +
          "(does total TDS deducted equal sum across deductors? " +
          "Does any deductor appear here but not on your Form 16?). " +
          "End with: not tax advice. ITR file numbers should match " +
          "Form 26AS exactly — discrepancies are the #1 source of " +
          "ITR notices."
        );
      case "form-15g-15h":
        return (
          "Parse this Form 15G or Form 15H (declaration of zero / " +
          "low TDS deduction). Output: `## Form Type` (15G under 18-" +
          "60 yrs OR 15H for senior citizens 60+ — flag mismatch if " +
          "DOB inconsistent). `## Declarant` (Name, PAN, DOB, Status " +
          "— Individual / HUF / etc., Address). `## Income Details` " +
          "(table: Identification number, Section, Estimated income " +
          "this FY, Estimated total income for FY). `## Eligibility " +
          "Check` (basic exemption limit ₹2.5L for <60, ₹3L for " +
          "60-80, ₹5L for 80+ — flag if total estimated income " +
          "exceeds the limit, which makes the declaration " +
          "INVALID). `## Verification` (signature, date, place, " +
          "verification statement presence). `## Submission Status` " +
          "(if there's a UIN / acknowledgment number from bank or " +
          "deductor, surface it). `## Risk Flags` (3-5 things that " +
          "could invalidate this form — e.g., TDS already " +
          "deducted; income exceeds limit; declarant has filed " +
          "ITR with refund). End with: not tax advice. False " +
          "declarations under section 277 of IT Act carry " +
          "imprisonment + fine."
        );
      case "rent-receipt":
        return (
          "Parse this stack of rent receipts (typically 12 months for " +
          "HRA exemption claim under section 10(13A)). Output: `## " +
          "Tenant` (Name, address). `## Landlord` (Name, PAN if " +
          "shown — PAN MANDATORY if annual rent > ₹1L per IT rule, " +
          "flag if missing for that case). `## Property` (rented " +
          "address). `## Receipt Detail Table` (table: Receipt #, " +
          "Month, Amount, Mode of Payment, Date, Stamp Present, " +
          "Signature Present). `## Annual Rent Total` (sum). `## " +
          "HRA Eligibility Math` (3 limits: actual HRA received, " +
          "rent paid - 10% basic, 50% basic for metro / 40% non-" +
          "metro — minimum of 3 is the eligible amount; show all " +
          "three if user provides salary basic separately, " +
          "otherwise just the rent-paid figure). `## Compliance " +
          "Flags` (red flags: unsigned receipts, missing landlord " +
          "PAN with rent > ₹1L/yr, missing revenue stamp on " +
          "receipts > ₹5K, gaps in months covered, mismatched " +
          "amounts vs. bank-statement evidence the user might " +
          "want to provide). End with: not tax advice. HRA claims " +
          "must match rent agreement + bank-transfer evidence."
        );
      case "property-tax":
        return (
          "Parse this property tax bill (municipal corporation, " +
          "panchayat, or city municipal council — covers BBMP, MCD, " +
          "BMC, Chennai Corp, KMC, etc.). Output: `## Property` " +
          "(Owner Name, Property ID / Khata No / PID, Address, " +
          "Property Type — Residential / Commercial / Mixed, Built-" +
          "Up Area, Plot Area). `## Bill Details` (Bill Number, " +
          "Assessment Year, Half-Year H1/H2 if applicable, Issue " +
          "Date, Due Date). `## Tax Computation` (table: " +
          "Component, Basis, Rate, Amount — Property Tax, Library " +
          "Cess, Health Cess, Solid Waste Cess, Beggary Cess, " +
          "etc.). `## Outstanding Dues` (any prior unpaid amounts " +
          "+ accrued interest / penalty). `## Total Payable`. `## " +
          "Payment Options` (online portal, bank counter, " +
          "authorized centers — list whatever the bill mentions). " +
          "`## Rebate Eligibility` (early-payment rebate, " +
          "self-assessment rebate, women / senior / disabled " +
          "rebates if your municipality offers — flag if the bill " +
          "mentions but doesn't apply). `## Late-Payment " +
          "Consequences` (per-month interest, penalty %, " +
          "disconnection of water/services if applicable). End " +
          "with: data extraction only, not legal/financial advice. " +
          "Cross-check Property ID against your latest sale-deed " +
          "or khata."
        );
      case "stamp-duty":
        return (
          "Parse this stamp duty receipt / e-Stamp certificate / " +
          "challan (Indian — covers SHCIL e-Stamp, state-portal e-" +
          "Stamp, franking-machine receipt, traditional stamp " +
          "paper). Output: `## Document` (Stamp Certificate / " +
          "Receipt Number, Issue Date, Issuing Authority, State, " +
          "Status — Valid / Used / Cancelled). `## Transaction " +
          "Type` (Sale Deed / Lease Agreement / Gift Deed / Power " +
          "of Attorney / Affidavit / Loan Agreement / etc.). `## " +
          "Parties` (First Party — buyer/lessee, Second Party — " +
          "seller/lessor). `## Property / Subject` (if a property " +
          "transaction: address, survey number; if not, brief " +
          "description). `## Stamp Duty Paid` (amount, percentage " +
          "of consideration — typical IN ranges: 5-7% for sale " +
          "deeds, varies by state/gender/urban). `## Registration " +
          "Fee` (separate from stamp duty, usually 1%). `## " +
          "Validity Check` (e-Stamp certificates have a unique " +
          "ID verifiable on shcilestamp.com or state-specific " +
          "portal — surface the verification URL). `## Common " +
          "Issues` (3-5 risk flags: under-stamping, expired " +
          "certificate used, mismatched parties vs deed, etc.). " +
          "End with: data extraction only, not legal advice. " +
          "Always verify e-Stamp authenticity on the official " +
          "issuing portal before relying on it."
        );
      case "passport":
        return (
          "Parse this Indian passport bio page (or international " +
          "passport bio page) PDF. Output: `## Personal Details` " +
          "(Surname, Given Names, Nationality, DOB, Place of Birth, " +
          "Gender). `## Passport Document` (Passport Number — full " +
          "echo, Type — P/PA/PD, Country Code — IND/etc., Date of " +
          "Issue, Date of Expiry, Place of Issue). `## MRZ Status` " +
          "(whether the Machine-Readable Zone is present at the " +
          "bottom — two lines starting with `P<` for ICAO 9303. " +
          "Don't echo the MRZ contents, only confirm presence). " +
          "`## Renewal Watch` (months until expiry; flag if <12 " +
          "months because many countries require 6+ months " +
          "validity for entry). `## Document Format Detected` " +
          "(physical scan vs e-passport with chip indicator vs " +
          "DigiLocker stamp). `## Travel Tips` (3-5 specific " +
          "checks: visa pages remaining, signature page completed, " +
          "ECR / ECNR status if printed). End with: data extraction " +
          "aid only, not travel-document verification or visa " +
          "advice."
        );
      case "scan-report":
        // §3.4 Scan Report (MRI/CT/X-ray/Ultrasound) Plain-language
        // Explainer. STRICTLY non-diagnostic — surfaces what the
        // radiologist wrote in patient-friendly language only.
        return (
          "Rewrite this radiology / scan report (MRI / CT / X-ray " +
          "/ Ultrasound / Mammogram / DEXA) in plain Indian " +
          "English for a patient and their family. Output: `## " +
          "Scan Identified` (modality, body part(s) imaged, date, " +
          "referring doctor, reporting radiologist if visible). " +
          "`## Why the Scan Was Done` (clinical indication / " +
          "history section, in plain language). `## What the " +
          "Radiologist Found` (organ-by-organ in patient-friendly " +
          "phrasing — translate medical Latin to everyday words. " +
          "Examples: 'no acute intracranial abnormality' → 'no " +
          "recent injury or bleeding visible in the brain'). `## " +
          "Impression` (rewrite the radiologist's impression " +
          "verbatim AND in plain language side-by-side). `## " +
          "Glossary` (table: Term-from-report, Plain-English " +
          "meaning. Cover the technical words the patient is " +
          "likely to Google). `## Questions to Ask Your Doctor` " +
          "(5-7 specific questions tied to THIS report — not " +
          "generic). `## What This Does NOT Tell You` (be honest " +
          "about scan limits — e.g. an MRI brain doesn't evaluate " +
          "the spine; an ultrasound abdomen doesn't replace " +
          "endoscopy). End with a clear caveat block: this is a " +
          "language translation aid, NOT a diagnosis or treatment " +
          "plan. Always discuss the report with the prescribing " +
          "doctor. Do NOT invent findings. Do NOT downplay or " +
          "amplify what's in the report. If the report contains " +
          "an urgent finding (e.g. 'critical', 'emergency', 'see " +
          "doctor immediately'), surface that in a bold callout " +
          "at the top."
        );
      case "electricity-bill":
        // §3.10 Indian Electricity Bill Analyzer (TANGEDCO,
        // BESCOM, TSSPDCL, MSEDCL, BSES, Tata Power, etc.).
        return (
          "Analyse this Indian electricity bill. Output: `## Bill " +
          "Identified` (DISCOM — TANGEDCO / BESCOM / TSSPDCL / " +
          "MSEDCL / BSES Rajdhani-Yamuna / Tata Power-DDL / " +
          "Adani-Mumbai / etc., consumer number masked, billing " +
          "period, due date, total amount). `## Consumption " +
          "Snapshot` (units consumed kWh, daily-average, " +
          "compared with previous bill if visible, sanctioned " +
          "load, contract demand). `## Tariff Breakdown` (slab- " +
          "by-slab Markdown table: Slab, Units in Slab, Rate, " +
          "Charge — useful since most Indian DISCOMs use " +
          "telescopic slabs where overshooting one tier raises " +
          "rates on ALL units). `## Other Charges` (Fixed " +
          "Charges, Fuel Surcharge, Electricity Duty, Meter " +
          "Rent, Late Payment Surcharge, GST). `## Subsidy / " +
          "Rebate Applied` (any state subsidy, BPL, solar net-" +
          "metering credit). `## Observations` (3-5 " +
          "actionable bullets — about-to-cross-slab warnings, " +
          "fixed-charge anomalies, meter-reading basis " +
          "(actual / estimated / on-record), unusually high " +
          "fuel surcharge in a regulatory adjustment cycle). " +
          "`## Saving Recommendations` (concrete: 'shift " +
          "23 units pre-month-end to avoid slab jump', 'if " +
          "average exceeds 500 units consider switching to TOD " +
          "tariff if available in your DISCOM area', 'check if " +
          "you qualify for the state rooftop-solar subsidy'). " +
          "End with note this is a parsing aid; tariff details " +
          "vary by state and DISCOM, refer to the bill or DISCOM " +
          "website for authoritative interpretation."
        );
      case "telecom-bill":
        // §3.10 Indian Telecom Bill Analyzer (Airtel / Jio / Vi
        // postpaid + broadband).
        return (
          "Analyse this Indian telecom bill (Airtel / Jio / Vi " +
          "postpaid mobile or fibre / broadband). Output: `## " +
          "Bill Identified` (operator, account number masked, " +
          "service type (postpaid mobile / fibre / DTH / " +
          "enterprise), billing cycle, due date, total). `## " +
          "Plan Details` (current plan name, base price, " +
          "validity, included talktime / data / SMS / OTT " +
          "subscriptions). `## Usage vs Plan` (table: Resource, " +
          "Included, Used, Overage, Overage Charge — separate " +
          "rows for Voice (mins), Data (GB), SMS, ISD/IDD if " +
          "any). `## Add-ons & Bolt-ons` (any additional packs " +
          "purchased mid-cycle: data add-on, ISD pack, " +
          "international roaming, value-added services). `## " +
          "OTT / Subscription Bundle` (Disney+ Hotstar, Amazon " +
          "Prime, Netflix Basic, JioSaavn etc. bundled in the " +
          "plan — flag duplicates if the user is paying " +
          "separately for the same service). `## Charges " +
          "Breakdown` (base + add-ons + overage + GST). `## " +
          "Risk Flags` (mid-cycle pack auto-renewal, " +
          "international roaming activated, premium SMS " +
          "charges, OTT trial that converted to paid, last-bill " +
          "spike). `## Plan Fit Recommendations` (3-5 bullets: " +
          "is the user under-utilising the plan and over-paying, " +
          "or repeatedly hitting overage and should upgrade; " +
          "specific cheaper / better-fit plans on the same " +
          "operator if pattern is clear). End with note this " +
          "is a parsing aid, plan details change frequently."
        );
      case "builder-agreement":
        // §3.5 Builder Agreement Red-Flag Detector for under-
        // construction property buyers.
        return (
          "Audit this Indian builder-buyer agreement (under-" +
          "construction property — apartment / villa / plot). " +
          "Output: `## Project Identified` (project name, RERA " +
          "registration number, builder, tower / phase, unit " +
          "number, super-built-up + carpet area, agreed total " +
          "consideration, BSP, parking + amenity charges, GST). " +
          "`## Key Dates & Milestones` (booking date, possession " +
          "date promised, payment plan / construction-linked " +
          "milestones, grace period clause). `## Pricing & " +
          "Charges Breakdown` (Markdown table: Component, " +
          "Amount, Per-sqft Rate, Charged on (Carpet vs Super-" +
          "built-up), Notes. Surface PLC, EDC, IDC, Club " +
          "Membership, Maintenance Deposit, Stamp + Registration " +
          "if included). `## Red Flags` (severity-rated table: " +
          "Issue, Severity, Quote, Recommendation. Common ones " +
          "to surface — area calculated on super-built-up vs " +
          "RERA-mandated carpet area, unilateral right to alter " +
          "specifications, vague 'force majeure' that includes " +
          "ordinary delays, possession-date escape clauses, " +
          "no mention of OC / completion certificate, asymmetric " +
          "delay-penalty (huge for buyer, tiny for builder), " +
          "free interest-free period for builder if buyer pays " +
          "late, mandatory arbitration in distant city, no " +
          "exit / refund clause, transfer fees on resale, " +
          "compulsory club membership at handover, undefined " +
          "common-area share). `## Buyer Protections Per RERA " +
          "Act 2016` (which mandatory protections are honoured " +
          "vs missing in this agreement). `## Specifications & " +
          "Material Schedule` (table from the spec annexure " +
          "if included). `## Recommended Verifications & " +
          "Negotiation Points` (concrete actions before signing: " +
          "verify RERA on state portal, ask for sanctioned " +
          "plan, OC, EC for the plot, phase-wise approvals; " +
          "redlines to push back on with replacement language). " +
          "End with note this is an audit aid for buyers, NOT " +
          "legal advice — engage a property lawyer before " +
          "signing a builder agreement."
        );
      case "balance-sheet":
        // §3.1 Balance Sheet / P&L Extractor for analysts.
        return (
          "Extract the financial statements from this audited or " +
          "management report into structured JSON. Output ONLY a " +
          "```json fenced code block with shape: {\"entity\": " +
          "{\"name\": string|null, \"CIN\": string|null, \"FY\": " +
          "string|null, \"period_type\": string (one of: 'annual', " +
          "'half-year', 'quarter', 'standalone', 'consolidated'), " +
          "\"reporting_framework\": string|null (Ind AS / IFRS / " +
          "Indian GAAP)}, \"balance_sheet\": {\"as_at\": string|null, " +
          "\"assets\": {\"non_current\": [{\"head\": string, " +
          "\"current_period\": number, \"prior_period\": " +
          "number|null}], \"current\": [...], \"total\": number}, " +
          "\"equity_and_liabilities\": {\"equity\": [...], " +
          "\"non_current_liabilities\": [...], \"current_liabilities\": " +
          "[...], \"total\": number}}, \"profit_and_loss\": " +
          "{\"period\": string|null, \"revenue\": [...], " +
          "\"expenses\": [...], \"profit_before_tax\": number, " +
          "\"tax\": number, \"profit_after_tax\": number, \"eps\": " +
          "{\"basic\": number|null, \"diluted\": number|null}}, " +
          "\"cash_flow\": {\"operating\": number|null, " +
          "\"investing\": number|null, \"financing\": number|null, " +
          "\"net_change\": number|null} (only if cash flow " +
          "statement included), \"key_ratios\": {\"current_ratio\": " +
          "number|null, \"debt_to_equity\": number|null, " +
          "\"roe\": number|null (calculated if PAT / avg-equity " +
          "is derivable), \"roa\": number|null, \"interest_coverage\": " +
          "number|null} (compute the ratios from the extracted " +
          "data — null if any input is missing rather than " +
          "guessing)}. Round to 2 decimals. Preserve original " +
          "line-item names verbatim — don't normalise away " +
          "company-specific schedules. Do NOT add commentary " +
          "outside the JSON."
        );
      case "expense-report":
        // §3.1 Expense Report Builder from a bank statement.
        return (
          "Build a structured expense report from this bank " +
          "statement. Use Indian categories. Output: `## Statement " +
          "Identified` (bank, account masked, period). `## " +
          "Category × Month Matrix` (Markdown table — rows = " +
          "categories, columns = months in the period, cells = " +
          "spend). Categories: Salary (negative = inflow), Rent, " +
          "Groceries / Food, Fuel, Utilities, Mobile / Internet, " +
          "EMI / Loans, Insurance, Investments / SIPs, Travel, " +
          "Shopping, Entertainment / Subscriptions, Healthcare, " +
          "Education, Cash / ATM, UPI Transfers, Refunds / " +
          "Reversals, Bank Charges, Other. `## Top Spend Areas` " +
          "(top 5 categories by total with %). `## Recurring " +
          "Charges Detected` (subscriptions / EMI with frequency " +
          "+ amount + counter party). `## Income Snapshot` " +
          "(monthly avg net income — credits minus refunds). `## " +
          "Saving Rate` (income - expense, % of income). `## " +
          "Observations` (3-5 actionable bullets — high-fee " +
          "alerts, unusual spikes, subscriptions to review, dining-" +
          "out share, etc.). End with note this is a parsing aid; " +
          "category choice is heuristic and the user can override."
        );
      case "court-order":
        // §3.2 Indian Court Order / Judgment Summarizer.
        return (
          "Summarise this Indian court order / judgment. Output: " +
          "`## Citation` (court, bench, judge(s), date, case " +
          "number / writ petition / civil appeal / SLP, citation " +
          "string if available). `## Parties` (Petitioner(s), " +
          "Respondent(s), Intervenor(s) if any — PII-masked when " +
          "the case isn't a published precedent). `## Issue(s) " +
          "Framed` (the legal questions the court considered, " +
          "verbatim quotes preferred). `## Held / Operative Part` " +
          "(the operative directions of the court — what was " +
          "ordered, granted, denied, remanded). `## Ratio " +
          "Decidendi` (the principle of law on which the decision " +
          "rests — paraphrased + quoted from the para that lays " +
          "it down). `## Reasoning` (chain of reasoning the court " +
          "follows; cite paragraph numbers where possible). `## " +
          "Cited Authorities` (other judgments / statutes / " +
          "constitutional articles relied on). `## Costs / Time " +
          "Limits` (any costs awarded, compliance timelines, " +
          "next-of-action). `## Practical Implications` (3-4 " +
          "bullets — what this means for similarly-placed " +
          "litigants / lawyers / authorities). End with note this " +
          "is a research aid, not legal advice — read the full " +
          "judgment for citation."
        );
      case "partnership-deed":
        // §3.2 Indian Partnership Deed Analyzer.
        return (
          "Analyse this Indian partnership / LLP deed. Output: " +
          "`## Deed Identified` (firm name, type — partnership " +
          "vs LLP, registration status / RoC number, date of " +
          "execution, place, jurisdiction). `## Partners` (table: " +
          "Name, Role (managing / working / sleeping / nominee), " +
          "Capital Contribution, Profit Share %, Loss Share %, " +
          "Salary / Drawings entitled, Authority limits). `## " +
          "Business / Object Clause` (paragraph). `## Capital & " +
          "Drawings` (initial contribution, top-up rules, " +
          "interest on capital, drawings limits). `## Profit / " +
          "Loss Sharing` (formula + special allocations). `## " +
          "Decision-Making` (resolutions requiring unanimity vs " +
          "majority, day-to-day management authority). `## " +
          "Admission / Retirement / Death` (rules for new " +
          "partners, exit, death, expulsion, dissolution " +
          "triggers). `## Risk Flags` (severity-rated table: " +
          "vague decision-making, no exit clause, profit share " +
          "≠ capital share without justification, no goodwill " +
          "valuation, indefinite lock-in, missing dispute " +
          "resolution / arbitration seat, missing books-of-" +
          "account audit clause). `## Missing Standard Clauses` " +
          "(arbitration, non-compete on retirement, IP/goodwill " +
          "ownership, succession on death). End with note this " +
          "is an audit aid, not legal advice."
        );
      case "ssc-banking":
        // §3.3 SSC CGL / Banking PO/Clerk Exam Paper Analyzer.
        return (
          "Analyse this Indian competitive exam paper — SSC " +
          "(CGL/CHSL/CPO/MTS/JE/Selection Posts) or Banking " +
          "(IBPS PO / Clerk / SO, SBI PO/Clerk, RBI Grade B, " +
          "NABARD). Output: `## Paper Identified` (exam, " +
          "tier/phase, year, sections, marking scheme — most " +
          "have negative marking). `## Section-Wise Question " +
          "Analysis` (Markdown table: #, Section (Quant " +
          "Aptitude / Reasoning / English / GK / Current Affairs " +
          "/ Computer / Banking Awareness / etc.), Sub-topic, " +
          "Difficulty (Easy/Medium/Hard), Time-Per-Question " +
          "estimate). `## Section Distribution` (questions, " +
          "marks, time allotted per section). `## Topic " +
          "Frequency` (recurring high-yield areas — " +
          "Profit/Loss/SI/CI for Quant; Puzzles/Seating " +
          "Arrangement for Reasoning; Cloze/RC for English; " +
          "RBI / SEBI / banking awareness items). `## Strategy " +
          "Notes` (5-7 bullets: section attempt order, time " +
          "management, accuracy thresholds for sectional cutoff " +
          "vs final, when to skip a difficult set, mock-test " +
          "frequency). Use exam-specific vocabulary (Quantum " +
          "CAT, Arun Sharma, Indian Economy by Ramesh Singh as " +
          "study refs)."
        );
      case "ncert":
        // §3.3 NCERT Textbook chapter summarizer (school).
        return (
          "Summarise this NCERT textbook chapter for an Indian " +
          "school student. Output: `## Chapter Identified` (" +
          "subject, class, chapter number + title). `## In One " +
          "Sentence` (the central idea, in plain language). `## " +
          "Key Concepts` (bullet list — every important term, " +
          "definition, or formula a student needs to memorise). " +
          "`## Important Diagrams / Figures` (list, with what " +
          "each shows — useful since CBSE/state-board questions " +
          "often ask 'with the help of a diagram, explain...'). " +
          "`## Worked-Through Examples` (any problem the chapter " +
          "solves — rewritten clearly with the steps). `## " +
          "Likely Exam Questions` (5-8 questions in the style " +
          "of CBSE / state-board paper writers, mixing 1-mark / " +
          "3-mark / 5-mark, marked accordingly). `## Connections " +
          "to Other Chapters` (1-2 sentences on prerequisites + " +
          "what this chapter sets up). `## Common Mistakes` " +
          "(3-4 errors students make on this chapter — " +
          "actual misconceptions, not generic 'read carefully' " +
          "advice). End with a 5-bullet `## Quick Revision` " +
          "checklist."
        );
      case "upsc":
        // §3.3 UPSC Prelims/Mains Analyzer.
        return (
          "Analyse this UPSC question paper or answer key (Prelims " +
          "GS / CSAT / Mains GS-I/II/III/IV / Optional / Essay). " +
          "Output: `## Paper Identified` (exam, year, paper, " +
          "marking scheme — Prelims has 1/3 negative, Mains is " +
          "subjective). `## Question Analysis` (Markdown table per " +
          "question: #, Type (MCQ for Prelims, descriptive for " +
          "Mains), Subject Tag (History / Polity / Economy / " +
          "Geography / Environment / Science & Tech / IR / " +
          "Internal Security / Ethics / Current Affairs / Tamil " +
          "Lit etc.), Sub-topic, Difficulty, Word-Length-Required " +
          "(for Mains: 150 / 250 word counts mandated by UPSC). " +
          "For Prelims, include Correct Answer if visible). `## " +
          "Subject-Wise Distribution` table. `## Static vs " +
          "Current` (UPSC trends: ratio of static-syllabus topics " +
          "vs current-affairs questions). `## Topic Frequency` " +
          "(recurring high-yield areas — Modern Indian History, " +
          "Constitution, Indian Economy, Environment & Ecology, " +
          "Internal Security). `## Strategy Notes` (5-7 specific " +
          "tactics for THIS paper level — Prelims attempts " +
          "strategy, Mains answer-structure templates, " +
          "Optional-specific advice). Use UPSC-aware vocabulary " +
          "(NCERT, Laxmikanth, Spectrum, Shankar IAS, etc. as " +
          "study-source references)."
        );
      case "research-paper":
        // §3.3 Research Paper Summarizer with citations.
        return (
          "Summarise this academic research paper. Output: `## " +
          "Citation` (full citation in APA 7 + a `## BibTeX` block " +
          "below it). `## Field & Sub-field` (broad area + specific " +
          "subdiscipline). `## Research Question` (one or two " +
          "sentences — what the paper actually asks). `## " +
          "Hypotheses / Claims` (bulleted, each with the section " +
          "of the paper it appears in if you can identify it). `## " +
          "Methods` (study design, sample size, instruments, " +
          "statistical methods — quote the key choices). `## Key " +
          "Results` (numbered list — each result with the " +
          "magnitude/effect/p-value where stated; quote precisely " +
          "rather than paraphrasing numbers). `## Limitations` " +
          "(both author-acknowledged AND ones the methods imply " +
          "but the authors didn't surface). `## How to Cite This " +
          "Paper` (3 short example sentences a reviewer / writer " +
          "could adapt). `## Related Reading` (3-5 references " +
          "from the paper's own bibliography that look most " +
          "central). End with the paper's contribution in one " +
          "sentence, in the most plain language possible (the " +
          "kind of sentence you'd use to explain it to a smart " +
          "non-specialist)."
        );
      case "demat":
        // §3.1 NSDL/CDSL CAS / Demat statement parser.
        return (
          "Parse this NSDL or CDSL Consolidated Account Statement " +
          "(CAS) or demat holdings statement into structured JSON. " +
          "Output ONLY a ```json fenced code block with shape: " +
          "{\"cas\": {\"depository\": string (NSDL or CDSL), " +
          "\"period\": {\"from\": string|null (ISO), \"to\": " +
          "string|null}, \"PAN\": string|null (masked), \"BO_id\": " +
          "string|null (masked)}, \"holdings\": [{\"isin\": " +
          "string, \"name\": string (security name), " +
          "\"category\": string (one of: 'equity', 'mutual-fund', " +
          "'bond', 'gsec', 'etf', 'reit', 'invit', 'sgb', " +
          "'commercial-paper', 'other'), \"quantity\": number, " +
          "\"avg_cost\": number|null, \"current_value\": " +
          "number|null, \"unrealised_pnl\": number|null}], " +
          "\"transactions\": [{\"date\": string (ISO), \"type\": " +
          "string (one of: 'buy', 'sell', 'dividend', 'bonus', " +
          "'split', 'demerger', 'rights', 'ipo-allot', 'transfer-" +
          "in', 'transfer-out', 'redemption', 'corp-action-other'), " +
          "\"isin\": string, \"name\": string, \"quantity\": " +
          "number|null, \"amount\": number|null}], \"summary\": " +
          "{\"total_value\": number, \"by_category\": [{" +
          "\"category\": string, \"value\": number, \"percent\": " +
          "number}], \"corporate_actions_count\": number, " +
          "\"transactions_count\": number}}. Don't add commentary " +
          "outside the JSON. Round amounts to 2 decimals. If a " +
          "field isn't determinable from the statement, null it " +
          "rather than guessing."
        );
      case "insurance":
        // §3.10 Insurance Policy Parser (health/life/motor/etc.).
        return (
          "Analyse this Indian insurance policy document (health, " +
          "life, motor, home, travel, term). Output: `## Policy " +
          "Identified` (insurer, plan name, policy number (PII-" +
          "masked last 4), product type, policy period, premium " +
          "frequency, latest premium). `## Coverage` (table: " +
          "Section / Benefit, Sum Insured / Limit, Deductible, " +
          "Notes. Surface room-rent capping, sub-limits, ICU " +
          "limits for health). `## Insureds` (list of covered " +
          "lives or assets with relationship/age — health/family " +
          "floater). `## Premium & Discounts` (base premium, " +
          "GST, NCB / cumulative bonus, riders / add-ons " +
          "purchased, total). `## Exclusions` (table of permanent " +
          "exclusions + waiting periods + pre-existing-disease " +
          "wait + specific-disease wait — IRDAI standard plus " +
          "policy-specific). `## Claim Process` (cashless network " +
          "TPA name, intimation contact, document checklist for " +
          "claim). `## Renewal & Portability` (renewability " +
          "guarantee, lifetime renewal flag, portability rights " +
          "summary, grace period). `## Risk Flags` (severity-" +
          "rated table: low room-rent capping that forces " +
          "proportionate deduction, high co-pay, missing day-" +
          "care procedure list, restoration benefit absent, " +
          "sub-limits worse than market average). `## Comparison " +
          "Notes` (1-2 paragraphs benchmarking against typical " +
          "market features for that product type — without " +
          "naming specific competing brands). End with note this " +
          "is a parsing aid, not insurance advice."
        );
      case "loan-bundle":
        // §3.1 Loan Application Document Bundler / Audit.
        return (
          "Audit this stack of loan-application documents against " +
          "Indian bank checklists (home loan / personal loan / " +
          "business loan / car loan). The PDF likely concatenates " +
          "several documents — identify what's present and what " +
          "is missing for a typical lender's KYC + financial + " +
          "collateral diligence. Output: `## Loan Type Detected` " +
          "(home / personal / business / car / education / " +
          "unknown — best guess from contents, with confidence). " +
          "`## Documents Found` (Markdown table: Document, " +
          "Status (Present / Partial / Missing), Pages, Notes. " +
          "Common lines: PAN, Aadhaar, address proof, last-3 " +
          "salary slips, last-6 bank statements, ITR/Form 16 last " +
          "2 years, Form 26AS, employment letter, KYC selfie/" +
          "video, property documents (chain of title, EC, sale " +
          "deed, sanctioned plan, OC), property tax receipt, " +
          "company KYC for self-employed, GST returns, " +
          "partnership deed / MoA, balance sheet for last 2 FYs). " +
          "`## Income Snapshot` (gross monthly income detected, " +
          "net income, FOIR estimate if data permits, debt " +
          "obligations spotted). `## Eligibility-Affecting Items` " +
          "(things the lender will care about: employment " +
          "stability gap, salary credit pattern in bank " +
          "statements, EMI bounces, large unexplained credits). " +
          "`## Missing / Unclear Documents` (specific list of " +
          "what's missing so the applicant can re-submit). `## " +
          "Recommended Next Steps` (5-7 concrete actions to " +
          "complete the bundle and fix any issues that would " +
          "delay sanction). End with note this is a checklist " +
          "aid, NOT pre-approval — final eligibility is the " +
          "lender's call."
        );
      case "salary-slip":
        // §3.1 Salary Slip Analyzer.
        return (
          "Parse this Indian salary slip / pay slip into " +
          "structured JSON. Output ONLY a ```json fenced code " +
          "block with shape: {\"employer\": string|null, " +
          "\"employee\": {\"name\": string|null, \"id\": " +
          "string|null, \"designation\": string|null, " +
          "\"department\": string|null, \"PAN\": string|null " +
          "(masked: 'XXXXX1234X'), \"UAN\": string|null}, " +
          "\"period\": {\"month\": string|null, \"year\": " +
          "string|null, \"days_paid\": number|null, " +
          "\"days_present\": number|null, \"days_loss_of_pay\": " +
          "number|null}, \"earnings\": [{\"head\": string (e.g. " +
          "'Basic', 'HRA', 'Special Allowance', 'LTA', " +
          "'Performance Bonus'), \"amount\": number, \"taxable\": " +
          "boolean|null}], \"deductions\": [{\"head\": string " +
          "(e.g. 'EPF', 'Professional Tax', 'TDS', 'Health " +
          "Insurance', 'Loan EMI'), \"amount\": number, " +
          "\"statutory\": boolean|null}], \"totals\": {\"gross\": " +
          "number, \"deductions\": number, \"net_pay\": number, " +
          "\"reimbursements\": number|null}, \"ytd\": {\"gross\": " +
          "number|null, \"tds\": number|null, \"epf_employee\": " +
          "number|null, \"epf_employer\": number|null} (only if " +
          "the slip shows YTD)}. Use exact label names from the " +
          "slip rather than normalising — preserves idiosyncratic " +
          "components. Round amounts to 2 decimals. Do NOT add " +
          "commentary outside the JSON."
        );
      case "multi-bank":
        // §3.1 Multi-Bank Merger. Input = concatenated bank
        // statements (user uploads a merged PDF containing
        // statements from multiple banks). Output consolidated
        // JSON + per-bank summary.
        return (
          "Parse this multi-bank statement PDF into structured " +
          "JSON. The document contains statements from MULTIPLE " +
          "banks concatenated together. Output ONLY a ```json " +
          "fenced code block containing a single object shaped " +
          "{\"period\": {\"from\": string|null (ISO date), " +
          "\"to\": string|null}, \"banks\": [{\"bank\": string " +
          "(SBI / HDFC / ICICI / Axis / Kotak / etc.), " +
          "\"account_mask\": string|null (last 4 digits), " +
          "\"opening_balance\": number|null, \"closing_balance\": " +
          "number|null, \"total_credits\": number, \"total_debits\": " +
          "number, \"transactions\": [{\"date\": string (ISO " +
          "YYYY-MM-DD), \"description\": string, \"type\": " +
          "string (one of: 'credit', 'debit'), \"amount\": " +
          "number, \"balance\": number|null, \"category\": string " +
          "(one of: 'salary', 'transfer', 'upi', 'atm', 'emi', " +
          "'bills', 'shopping', 'food', 'fuel', 'investment', " +
          "'refund', 'interest', 'fee', 'other')}]}], " +
          "\"consolidated\": {\"total_credits\": number, " +
          "\"total_debits\": number, \"net_flow\": number, " +
          "\"transaction_count\": number, \"bank_count\": number, " +
          "\"by_category\": [{\"category\": string, \"credits\": " +
          "number, \"debits\": number, \"count\": number}]}}. " +
          "Detect the bank from transaction narration patterns, " +
          "account-statement formatting, or bank logos/text. " +
          "Merge all transactions into a single sorted-by-date " +
          "view inside each bank, and also aggregate in " +
          "`consolidated`. Include EVERY transaction. Do NOT " +
          "invent amounts or dates; if a row is illegible, skip " +
          "it rather than guessing. Round amounts to 2 decimals."
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
        return "Parse this resume into structured JSON";      case "action-items":
        return "Extract the action items";
      case "bank-statement":
        return "Parse this bank statement";
      case "blood-test":
        return "Parse this lab report";
      case "gst-invoice":
        return "Extract this GST invoice";
      case "rental":
        return "Analyse this rental agreement";
      case "syllabus":
        return "Build a study plan from this syllabus";
      case "property":
        return "Analyse this property document";
      case "discharge":
        return "Simplify this discharge summary";
      case "itr-form16":
        return "Analyse this tax document";
      case "cover-letter":
        return "Draft a tailored cover letter from this resume";
      case "jd-match":
        return "Score this resume against the job description";
      case "tnpsc":
        return "Analyse this TNPSC paper";
      case "jee-neet":
        return "Analyse this JEE/NEET paper";
      case "multi-bank":
        return "Parse this multi-bank statement";
      case "credit-card":
        return "Analyse this credit card statement";
      case "mutual-fund":
        return "Parse this mutual fund statement";
      case "nda":
        return "Analyse this NDA";
      case "sale-deed":
        return "Audit this sale deed";
      case "employment":
        return "Review this employment contract";
      case "medical-bill":
        return "Analyse this medical bill";
      case "prescription":
        return "Parse this prescription";
      case "rera":
        return "Audit this RERA document";
      case "ec":
        return "Parse this Encumbrance Certificate";
      case "salary-slip":
        return "Parse this salary slip";
      case "upsc":
        return "Analyse this UPSC paper";
      case "research-paper":
        return "Summarise this research paper";
      case "demat":
        return "Parse this demat / CAS statement";
      case "insurance":
        return "Analyse this insurance policy";
      case "loan-bundle":
        return "Audit this loan-application bundle";
      case "expense-report":
        return "Build an expense report from this bank statement";
      case "court-order":
        return "Summarise this court order";
      case "partnership-deed":
        return "Analyse this partnership deed";
      case "ssc-banking":
        return "Analyse this SSC/Banking exam paper";
      case "ncert":
        return "Summarise this NCERT chapter";
      case "scan-report":
        return "Explain this scan report in plain language";
      case "electricity-bill":
        return "Analyse this electricity bill";
      case "telecom-bill":
        return "Analyse this telecom bill";
      case "builder-agreement":
        return "Audit this builder agreement";
      case "balance-sheet":
        return "Extract financials from this report";
      case "improve-writing":
        return "Improve the writing in this document";
      case "paraphrase":
        return "Paraphrase this document";
      case "plagiarism":
        return "Audit originality of this document";
      case "chart-to-table":
        return "Extract data from charts in this PDF";
      case "paper-pattern":
        return "Analyse pattern across years of papers";
      case "aadhaar":
        return "Parse this Aadhaar PDF (mask Aadhaar number)";
      case "pan-card":
        return "Parse this PAN card / e-PAN PDF";
      case "driving-license":
        return "Parse this Driving License extract";
      case "voter-id":
        return "Parse this Voter ID / EPIC card";
      case "passport":
        return "Parse this passport bio page";
      case "form-26as":
        return "Parse this Form 26AS tax credit statement";
      case "form-15g-15h":
        return "Parse this Form 15G / 15H declaration";
      case "rent-receipt":
        return "Parse rent receipts for HRA-friendly summary";
      case "property-tax":
        return "Parse this property tax bill";
      case "stamp-duty":
        return "Parse this stamp duty receipt / e-Stamp";
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
  // Task #67: JD-driven resume tools (cover-letter + jd-match) use
  // the same `query` threading as semantic-search. The query here
  // carries the job description, capped at 2000 chars to preserve
  // budget for the resume itself.
  if (
    (opts.depth === "cover-letter" || opts.depth === "jd-match") &&
    opts.query
  ) {
    return (
      `${verb}. The job description follows inside the search_query tag, ` +
      `and the resume text follows inside the untrusted_input tag.\n\n` +
      `<search_query>\n${opts.query.slice(0, 2000)}\n</search_query>\n\n` +
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
