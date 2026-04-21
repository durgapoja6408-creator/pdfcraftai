// lib/ai/tokens.ts — Token-count estimator + per-op input-token caps.
//
// Why this file exists
// --------------------
// AI providers bill per token, and the platform sets a per-operation
// input-token ceiling (MASTER_PLAN.md §7 gate #5, §4 decision D4):
// `chat_turn` = 20_000 tokens (~12 pages of dense prose). Anything
// larger must be redirected to `summarize` / `chat-with-pdf`.
//
// A user who uploads a 400-page text-only PDF and asks "summarize
// everything" would, without this guard:
//   (a) burn a large chunk of our provider budget on a single call
//       (chat-whale scenario S3 in docs/ai/MARGIN_VERIFICATION.md),
//   (b) likely 413 at the adapter boundary anyway (model context
//       window), but only after we'd already debited credits.
// This estimator catches the oversize request BEFORE the adapter call,
// returns 413 `context_too_large`, and refunds any up-front debit.
//
// Why char-based estimation instead of a real tokenizer
// -----------------------------------------------------
// Real tokenizers (`tiktoken` / `@anthropic-ai/tokenizer`) cost 1-2 MB
// of WASM/JS each, add cold-start latency on every Hostinger wake, and
// pull in native binaries that complicate the deploy (Hostinger-managed
// Node doesn't support postinstall compile steps cleanly). This cap is
// a CEILING check, not an exact count — a safe OVER-estimate is the
// correct failure mode (reject slightly earlier > send overbudget).
//
// Calibration
// -----------
// Claude and GPT-4 tokenizers agree within ±10% on English prose:
// both average ~3.5-4.5 chars per token on ASCII. 3.5 chars/token is
// the conservative side of that range (overestimates tokens by
// 10-25%). CJK runs ~1 token per char in both tokenizers, so we
// branch and count CJK code points 1:1. Every message carries
// ~4 tokens of role-framing overhead (Anthropic `<|im_start|>role\n
// ... <|im_end|>`, OpenAI analogous).
//
// What this file is NOT
// ---------------------
// - Not an OUTPUT-token budget. That's set via `maxTokens` on the
//   adapter call (see app/api/ai/chat/route.ts `maxTokens: 1024`).
// - Not a single-field length cap. The route may layer a cheap
//   `body.size > N` pre-filter for pathological multipart bodies;
//   this helper is the CANONICAL gate on the assembled prompt.

import type { ChatMessage } from "./types";

// -----------------------------------------------------------------------------
// Public caps — the single source of truth; tests pin these values.
// -----------------------------------------------------------------------------

/**
 * Per-operation input-token cap. Pinned to founder decisions in
 * `docs/MASTER_PLAN.md` §4 (D4) and `docs/ai/AI_API_MASTER_PLAN.md`
 * §7 Phase A2 bullet "Context-token cap per op".
 *
 * Changing a value here is a product decision — the test harness
 * (`scripts/test-chat-context-cap.mjs`) asserts the exact numbers so
 * a stealth edit trips pre-push.
 */
export const OP_MAX_INPUT_TOKENS = {
  /** D4: 20k tokens ≈ 12 pages dense prose. Larger → use `summarize`. */
  chat_turn: 20_000,
  /** AI_API_MASTER_PLAN §7 Phase A2: 100k tokens for document-scale ops. */
  summarize: 100_000,
} as const;

export type TokenCappedOperation = keyof typeof OP_MAX_INPUT_TOKENS;

// -----------------------------------------------------------------------------
// Internal constants — exported shape would leak tokenizer assumptions.
// -----------------------------------------------------------------------------

/**
 * Per-message framing overhead. Accounts for role markers at the wire
 * boundary. 4 is the widely-cited estimate (OpenAI cookbook + Anthropic
 * docs); exact value is provider-specific but within ±2 of 4.
 */
const PER_MESSAGE_OVERHEAD = 4;

/**
 * Chars per token for Latin / ASCII / European scripts. Real range is
 * 3.5-4.5; 3.5 is the floor — overestimates tokens by 10-25% in the
 * safe direction. If a future tokenizer makes this wildly inaccurate,
 * swap the divisor — no caller breaks.
 */
const CHARS_PER_TOKEN_LATIN = 3.5;

/**
 * CJK scripts tokenize close to 1:1 (char:token) in both Anthropic and
 * OpenAI tokenizers. Counting these 1:1 prevents a Japanese/Chinese/
 * Korean PDF from slipping past the cap under the Latin ratio.
 */
function isCjkCodePoint(code: number): boolean {
  return (
    (code >= 0x3400 && code <= 0x9fff) || // CJK Unified Ideographs + Ext A
    (code >= 0xac00 && code <= 0xd7af) || // Hangul syllables
    (code >= 0x3040 && code <= 0x30ff) || // Hiragana + Katakana
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0x20000 && code <= 0x2a6df)  // CJK Unified Ideographs Ext B
  );
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Estimate token count for a single string. Exported for tests + any
 * caller that needs finer-grained counting than the prompt-level
 * helper below.
 *
 * Contract:
 *   - Empty / falsy input → 0.
 *   - Never negative, never NaN.
 *   - Return value is a CEILING — the real tokenizer count is
 *     typically ≤ this. Safe to compare against
 *     `OP_MAX_INPUT_TOKENS` without further adjustment.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (isCjkCodePoint(code)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk + other / CHARS_PER_TOKEN_LATIN);
}

/**
 * Flatten a `ChatMessage.content` into the text an estimator can count.
 * Image / document blocks carry separate per-block token cost (adapter
 * accounts for them differently); we count only text blocks. Image
 * tokens, if introduced, will need a new branch here and a matching
 * bump to the op caps.
 */
function messageText(m: ChatMessage): string {
  if (typeof m.content === "string") return m.content;
  if (!Array.isArray(m.content)) return "";
  let out = "";
  for (const b of m.content) {
    if (b && b.type === "text") out += b.text;
  }
  return out;
}

/**
 * Estimate total input tokens for an assembled prompt (system + all
 * messages). This is what the route handler passes to the cap check.
 *
 * Contract:
 *   - `systemPrompt`, if non-empty, counts once plus framing overhead
 *     (it's effectively a system-role message at the wire).
 *   - Each `messages[i]` counts its text + `PER_MESSAGE_OVERHEAD`.
 *   - Empty inputs return 0.
 *   - Return value is a CEILING — safe to compare against
 *     `OP_MAX_INPUT_TOKENS`.
 */
export function estimatePromptTokens(
  systemPrompt: string | undefined,
  messages: ChatMessage[]
): number {
  let total = 0;
  if (systemPrompt && systemPrompt.length > 0) {
    total += estimateTokens(systemPrompt) + PER_MESSAGE_OVERHEAD;
  }
  for (const m of messages) {
    total += estimateTokens(messageText(m)) + PER_MESSAGE_OVERHEAD;
  }
  return total;
}
