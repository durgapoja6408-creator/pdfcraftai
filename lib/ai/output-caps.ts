// Per-op output-token caps — centralized policy for the maximum
// number of tokens any AI call is allowed to generate.
//
// Phase A / Net-Margin Task #11
// -----------------------------
// Before this module existed, every op file defined its own cap as a
// local constant:
//   lib/ai/ocr.ts           MAX_TOKENS_PER_PAGE = 1500
//   lib/ai/summarize.ts     MAX_TOKENS_BY_DEPTH = { tldr: 300, standard: 1200, detailed: 2000 }
//   lib/ai/rewrite.ts       MAX_TOKENS_BY_MODE = { simplify: 2000, ..., expand: 4000 }
//   lib/ai/generate.ts      MAX_TOKENS_BY_LENGTH = { short: 900, medium: 2200, long: 4600 }
//   lib/ai/translate.ts     maxTokensForChunk() = min(max(chunk/3*1.3, 400), 6000)
//   lib/ai/compare.ts       COMPARE_MAX_OUTPUT_TOKENS = 4000
//   lib/ai/sign.ts          MAX_OUTPUT_TOKENS = 2400
//   lib/ai/table.ts         MAX_OUTPUT_TOKENS = 2800
//   lib/ai/redact.ts        MAX_OUTPUT_TOKENS = 2400
//   app/api/ai/chat/route   maxTokens: 1024 (hardcoded)
//
// That worked but had three problems the Net-Margin plan called out:
//
//   1. No single source of truth. When the cost-matrix audit wanted to
//      evaluate "how much runaway risk do we carry if every call maxed
//      out?", there was no table to SUM over — you had to grep across
//      nine files and eyeball the constants.
//
//   2. No hard ceiling. Any future caller could pass `maxTokens: 100_000`
//      through `provider.chat()` and the adapter would happily forward
//      it. Providers DO enforce their own per-model caps (Haiku 4.5 =
//      8192 output, gpt-4o-mini = 16384, gemini-2.5-flash = 8192), but
//      those are provider-level failures that burn round-trip latency
//      before rejecting. We want our own, tighter ceiling that rejects
//      locally before the API call.
//
//   3. No observability. `ai_usage.success = 1` even when `stop_reason
//      === "max_tokens"`, which means the dashboards can't tell the
//      difference between "op completed naturally" and "op was
//      truncated because it hit the cap". Raising or lowering the cap
//      without that signal is flying blind.
//
// This module solves #1 and #2. Truncation observability (#3) lands
// in the same commit via migration 0008 adding ai_usage.response_truncated.
//
// API
// ---
//   HARD_CEILING_TOKENS                 single global ceiling (8192)
//   capForOp(op, variant?)              resolve cap for an op + variant
//   clampToHardCeiling(n)               idempotent safety clamp
//   OP_OUTPUT_CAP_TABLE                 the raw table (exported for tests)
//
// Why 8192 for the hard ceiling
// -----------------------------
// It's the lowest per-model output-cap among our three providers
// (Haiku 4.5 = 8192, Gemini 2.5 Flash = 8192, gpt-4o-mini = 16384).
// Setting our ceiling at the lowest denominator means no op can ever
// ask a provider for more output than that provider can deliver —
// which is another class of failure we used to surface as an adapter-
// level error instead of catching upstream.
//
// Why keep per-op + per-variant entries (instead of one global cap)
// -----------------------------------------------------------------
// The right cap depends on what the op PRODUCES. OCR per-page needs
// ~1500 because it's transcribing one page at a time; generate/long
// needs ~4600 because that's a multi-page document. Collapsing to one
// cap would either waste tokens (every op clamped at 4600) or break
// quality (every op clamped at 1500). The table is small — ten ops —
// so the per-variant granularity is cheap to maintain.
//
// Relationship to the provider adapter's default
// ----------------------------------------------
// Each adapter has its own fallback (`input.maxTokens ?? 1024`). That
// fallback fires when a caller forgets to pass `maxTokens` at all.
// This module is the policy layer ABOVE that fallback: callers that
// use `capForOp(...)` get the correct per-op value; callers that
// don't, still get a safe 1024 floor from the adapter. Belt + braces.

import "server-only";

import type { AIOp } from "./router";

// --- exported constants -------------------------------------------------

/**
 * The global hard ceiling. No op + variant combination may exceed
 * this, even if a misconfigured caller tries. `clampToHardCeiling`
 * enforces it; `capForOp` returns values that are always ≤ this.
 *
 * Picked at 8192 because that's the lowest per-model output cap
 * across our three configured providers:
 *   - claude-haiku-4-5           8192 output tokens
 *   - gemini-2.5-flash           8192 output tokens
 *   - gpt-4o-mini               16384 output tokens
 *
 * Setting the ceiling at the lowest denominator means the router is
 * free to pick any ladder position without bumping into a provider-
 * level max-output error mid-flight.
 */
export const HARD_CEILING_TOKENS = 8192;

// --- per-op variant types -----------------------------------------------

/**
 * Variants keyed per op. Kept loose (strings) so op modules can pass
 * their own mode/depth/length labels without the table needing to
 * import every op's type. The table below uses a default entry
 * (`"default"`) when the op has no variant dimension.
 */
export type OpVariant = string;

/**
 * The table. One inner record per op, keyed by the op module's own
 * variant label. Every inner record must define `"default"` — that's
 * the entry returned when the caller doesn't pass a variant (and the
 * entry the hard-ceiling invariant is enforced against).
 *
 * NOTE ON VARIANT LABELS: these must match the string literals that
 * the op modules use for their variant param (RewriteMode,
 * SummarizeDepth, etc.). A mismatch falls through to "default" —
 * not a hard failure, but the test harness pins the alignment.
 */
type CapTable = Record<AIOp, Record<OpVariant, number>>;

/**
 * OP_OUTPUT_CAP_TABLE
 * -------------------
 * Single source of truth for output-token ceilings.
 *
 * Evidence trail for each cap value — every number here traces back
 * to either (a) a measurement in docs/ai/MARGIN_VERIFICATION.md or
 * docs/ai/COST_MATRIX_3PROVIDER.md, or (b) the 2026-04-21 Tier 4
 * cap-tightening audit where we trimmed headroom that QA showed was
 * never usefully consumed.
 */
export const OP_OUTPUT_CAP_TABLE: CapTable = {
  // OCR runs page-by-page. 1500 tokens per page is enough for a
  // dense letter-size PDF page (~500-800 words) plus formatting
  // overhead from the ## Page N markdown structure. Was 1500
  // pre-Task #11 (lib/ai/ocr.ts:71).
  ocr: {
    default: 1500,
  },

  // Translate computes its cap dynamically from chunk char count
  // (see lib/ai/translate.ts `maxTokensForChunk`). The "default" entry
  // here is the HARD CEILING for any single chunk — translate still
  // computes a smaller per-chunk number but will never exceed this.
  // Was min(max(chunk/3 * 1.3, 400), 6000) pre-Task #11; the 6000
  // chunk-level ceiling is preserved.
  translate: {
    default: 6000,
  },

  // Chat is a single-turn streaming exchange. 1024 is deliberately
  // low — longer answers come from summarize/generate, not chat. Was
  // the hardcoded `maxTokens: 1024` in app/api/ai/chat/route.ts.
  chat: {
    default: 1024,
  },

  // Summarize scales with depth. TL;DR intentionally caps low so a
  // rambling model gets cut before it writes a standard-length
  // summary we'd have charged more for. Was MAX_TOKENS_BY_DEPTH in
  // lib/ai/summarize.ts:107.
  summarize: {
    default: 1200, // = "standard" — the conservative default
    tldr: 300,
    standard: 1200,
    detailed: 2000,
    // Task #52 — three presentation-style variants. Caps sized for
    // their intended output shape: key-points is a bullet list
    // (compact), study-notes is revision-grade with multiple sections
    // (largest), eli5 is conversational prose (medium).
    "key-points": 800,
    "study-notes": 2400,
    eli5: 1000,
    // Task #53:
    faq: 1500, // 6-10 Q&A pairs with short-paragraph answers.
    blog: 1800, // Full-article structure needs headroom for 3-5 sections.
    // Task #54:
    readability: 1200, // Scores + quotes + jargon list + suggestions.
    entities: 1500, // 4 tables, up to ~50 entities total.
    "social-thread": 1500, // 5-10 posts, ~240 chars each.
    // Task #55:
    condense: 2000, // Rewriting — output can approach source length.
    expand: 3000, // Elaborated output runs longer than source.
    "tone-analyze": 1200, // Voice + audience + attribute bullets.
    citations: 2400, // BibTeX block + formatted reference list.
    financials: 1500, // Single wide table, up to ~60 rows.
    // Task #56:
    sentiment: 1000, // Overall verdict + per-section table + shifts.
    bias: 1500, // 4-5 category sections with quoted evidence.
    proofread: 2000, // Error table can run long on poorly edited docs.
    // Task #57:
    newsletter: 1800, // Subject + preheader + 3-5 sections + sign-off.
    "video-script": 2400, // 3-5 × 90s segments with stage cues.
    // Task #58 — JSON-in-fence variants.
    flashcards: 2500, // 10-30 Q&A pairs, each concise.
    quiz: 2500, // 6-12 MCQs with 4 options + explanation each.
    // Task #59:
    mindmap: 2000, // JSON tree, labels are short so 2000 fits deep docs.
    // Task #60:
    "semantic-search": 1500, // 3-8 passages, each with 1-3 sentence quotes.
    // Task #61 — Tier 3:
    "ats-resume": 2000, // 5 sections with specific-fix bullets.
    "resume-parse": 2500, // Full structured JSON, many experience bullets.
    // Task #62:
    "action-items": 1500, // Single table, up to ~30 rows typical.
    // Task #63:
    "bank-statement": 3500, // Long transaction lists — up to ~200 rows.
    "blood-test": 2000, // 20-60 lab values + patient metadata.
    // Task #64:
    "gst-invoice": 2000, // 5 sections incl. line items table.
    "rental": 2200, // 5 sections, prose-heavy with quoted clauses.
    "syllabus": 2200, // Topic map + 12-week table + revision strategy.
    // Task #65:
    "property": 2200, // 6 sections + chain-of-title bullets.
    "discharge": 2000, // 7 sections, plain-language rewrite.
    "itr-form16": 2000, // 5 sections incl. tax computation table.
    // Task #67 — §3.6, §3.3, §3.1 P0 wedges.
    "cover-letter": 1200, // ≤350-word letter + 3-bullet customizations.
    "jd-match": 2200, // Fit score + alignment table + 4 bullet sections.
    "tnpsc": 3200, // Per-question table can be 100+ rows for a full paper.
    "jee-neet": 3600, // Per-question table + per-subject chapter-frequency tables + revision plan.
    "multi-bank": 4000, // Multi-bank JSON — can span hundreds of transactions per statement.
    // Task #75 — Tier 3 §3.1 + §3.2 P1 wedges.
    "credit-card": 2400, // Spend table + top merchants + observations.
    "mutual-fund": 2800, // Holdings + asset allocation + performers tables.
    "nda": 2400, // Risk flags + negotiation + standard sections.
    "sale-deed": 2800, // Property schedule + chain of title + risk flags + verifications.
    "employment": 2400, // Comp + termination + risk flags + missing protections.
    // Task #77 — Tier 3 §3.4, §3.5, §3.2, §3.1 P1 wedges.
    "medical-bill": 2400, // Itemised + insurance + reimbursable + next-steps.
    "prescription": 1800, // JSON medications list — usually <12 drugs.
    "rera": 2800, // Project + approvals + risk flags + checklist.
    "ec": 2400, // Encumbrance table + chain summary + gaps.
    "salary-slip": 1600, // Compact JSON earnings + deductions + YTD.
  },

  // Compare produces a side-by-side diff narrative. 4000 is
  // generous because two-doc comparisons can surface many discrete
  // changes; empirically the median comparison uses ~2200 and the
  // p95 is ~3600. Was COMPARE_MAX_OUTPUT_TOKENS in lib/ai/compare.ts:123.
  compare: {
    default: 4000,
  },

  // Generate scales with the user's requested length. "long" is the
  // biggest individual op we support; for anything longer the user
  // should split into sections. Was MAX_TOKENS_BY_LENGTH in
  // lib/ai/generate.ts:128.
  generate: {
    default: 2200, // = "medium"
    short: 900,
    medium: 2200,
    long: 4600,
  },

  // Sign extracts signature fields + narrative; 2400 is enough for a
  // multi-page agreement with up to ~15 signature blocks and per-
  // block rationale. Was MAX_OUTPUT_TOKENS in lib/ai/sign.ts:183.
  sign: {
    default: 2400,
  },

  // Rewrite scales with mode. simplify/formal/casual were trimmed
  // from 2400 → 2000 in the 2026-04-21 Tier 4 audit (17% output-cost
  // cut per call, zero observed QA regression); concise is bounded
  // lower by definition; expand is the one variant whose purpose IS
  // to produce MORE text than the input. Was MAX_TOKENS_BY_MODE in
  // lib/ai/rewrite.ts:97.
  rewrite: {
    default: 2000, // = "simplify/formal/casual"
    simplify: 2000,
    formal: 2000,
    casual: 2000,
    concise: 1600,
    expand: 4000,
  },

  // Table outputs structured JSON. Trimmed from 3200 → 2800 in the
  // 2026-04-21 Tier 4 audit — the JSON envelope fits in ~2500 even
  // for 5-table docs; the extra 400 tokens were padding GFM output
  // we no longer emit. Was MAX_OUTPUT_TOKENS in lib/ai/table.ts:108.
  table: {
    default: 2800,
  },

  // Redact enumerates PII spans as JSON. 2400 is sized for a
  // densely PII-populated page (~50-80 spans with text + reason).
  // Was MAX_OUTPUT_TOKENS in lib/ai/redact.ts:181.
  redact: {
    default: 2400,
  },
};

// --- exported helpers ---------------------------------------------------

/**
 * Resolve the output-token cap for an op + optional variant.
 *
 * - Unknown variant falls through to `default` (intentional: the op
 *   modules source variant labels from user input in some cases —
 *   e.g. the `depth` query param on /api/ai/summarize. A typo
 *   shouldn't 500; it should just use the safe default cap).
 *
 * - Every returned value is already clamped to HARD_CEILING_TOKENS
 *   as a defense-in-depth guarantee; the table values are audited
 *   to be ≤ the ceiling today, but if anyone bumps one above by
 *   mistake, clampToHardCeiling catches it before it reaches the
 *   adapter.
 */
export function capForOp(op: AIOp, variant?: OpVariant): number {
  const table = OP_OUTPUT_CAP_TABLE[op];
  // Defensive: should never happen given the CapTable type
  // constraint, but being explicit documents the fallback path for
  // future maintainers who add a new op to AIOp and forget to add
  // a row here (tsc catches it, but this is belt + braces).
  if (!table) {
    return clampToHardCeiling(1024);
  }

  const picked = variant != null ? table[variant] : undefined;
  const fallback = table["default"]!; // table is always populated with "default"
  const value = picked ?? fallback;

  return clampToHardCeiling(value);
}

/**
 * Idempotent clamp to HARD_CEILING_TOKENS.
 *
 * Exposed for callers that compute `maxTokens` dynamically (today:
 * only `translate.maxTokensForChunk`) and want the guarantee
 * without having to know the constant.
 */
export function clampToHardCeiling(n: number): number {
  // NaN / Infinity / negative inputs collapse to 1 — a provider
  // can't generate zero tokens (some treat it as "unlimited") and
  // we never want to hand the adapter a nonsense number.
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > HARD_CEILING_TOKENS) return HARD_CEILING_TOKENS;
  return Math.floor(n);
}
