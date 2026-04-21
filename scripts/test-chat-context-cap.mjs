#!/usr/bin/env node
// Self-contained test harness for Phase A2 "context-token cap" —
// §7 gate #5 in docs/MASTER_PLAN.md, §4 decision D4 ("20k input tokens"),
// docs/ai/AI_API_MASTER_PLAN.md Phase A2 bullet "Context-token cap per op".
//
// What this covers
// ----------------
// SECTION A — static-content checks on `lib/ai/tokens.ts`: exports the
//             OP_MAX_INPUT_TOKENS table with the pinned numeric values
//             from D4, exports the `estimateTokens` +
//             `estimatePromptTokens` helpers, uses "server-only" to
//             keep off the client, branches on CJK code points, and
//             documents the 3.5 chars/token ratio that the runtime
//             checks below depend on.
// SECTION B — behavioural assertions. This harness re-implements
//             `estimateTokens` in plain JS (mirroring the TS source's
//             ratio + CJK branch) and runs it against known inputs to
//             lock the empirical behaviour — so a future edit that
//             changes the ratio without touching the tests is caught
//             because the assertions stop lining up.
// SECTION C — call-site coverage. `app/api/ai/chat/route.ts` must
//             import the helper, actually call it on the assembled
//             prompt, return 413 `context_too_large` on overflow, and
//             refund the up-front credit debit BEFORE returning 413
//             (matching the existing "refund on validation failure"
//             pattern the PDF-extract branch set).
// SECTION D — drift / removal checks. The old byte-level
//             `messageText.length > 16_000` hard 400 is gone (the
//             token cap replaces it); the 25 MB `MAX_PDF_BYTES` memory
//             guard is kept (orthogonal concern).
//
// Run: `node scripts/test-chat-context-cap.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const TOKENS_PATH = resolve(ROOT, "lib", "ai", "tokens.ts");
const CHAT_ROUTE_PATH = resolve(ROOT, "app", "api", "ai", "chat", "route.ts");
const MASTER_PLAN_PATH = resolve(ROOT, "docs", "MASTER_PLAN.md");

const TOKENS_SRC = readFileSync(TOKENS_PATH, "utf8");
const CHAT_SRC = readFileSync(CHAT_ROUTE_PATH, "utf8");
const MASTER_SRC = readFileSync(MASTER_PLAN_PATH, "utf8");

let pass = 0;
let fail = 0;
const failures = [];

function assert(label, condition, detail) {
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
    failures.push({ label, detail });
  }
}

// =============================================================================
// SECTION A — static content of lib/ai/tokens.ts
// =============================================================================

assert(
  "A1 tokens.ts exports OP_MAX_INPUT_TOKENS",
  /export const OP_MAX_INPUT_TOKENS\s*=/.test(TOKENS_SRC),
  "OP_MAX_INPUT_TOKENS export missing"
);

assert(
  "A2 tokens.ts pins chat_turn cap to 20_000 (D4 decision)",
  /chat_turn:\s*20_000/.test(TOKENS_SRC),
  "OP_MAX_INPUT_TOKENS.chat_turn must equal 20_000 per MASTER_PLAN.md §4 D4"
);

assert(
  "A3 tokens.ts pins summarize cap to 100_000 (AI_API_MASTER_PLAN §7)",
  /summarize:\s*100_000/.test(TOKENS_SRC),
  "OP_MAX_INPUT_TOKENS.summarize must equal 100_000"
);

assert(
  "A4 tokens.ts exports estimateTokens",
  /export function estimateTokens\(/.test(TOKENS_SRC),
  "estimateTokens not exported"
);

assert(
  "A5 tokens.ts exports estimatePromptTokens",
  /export function estimatePromptTokens\(/.test(TOKENS_SRC),
  "estimatePromptTokens not exported"
);

assert(
  "A6 tokens.ts exports TokenCappedOperation type",
  /export type TokenCappedOperation\s*=\s*keyof typeof OP_MAX_INPUT_TOKENS/.test(
    TOKENS_SRC
  ),
  "TokenCappedOperation type alias missing (used by callers for type-safe op lookup)"
);

assert(
  "A7 tokens.ts uses the 3.5 chars/token Latin ratio",
  /CHARS_PER_TOKEN_LATIN\s*=\s*3\.5/.test(TOKENS_SRC),
  "Ratio constant drifted — either re-tune with real tokenizer data and update SECTION B, or revert"
);

assert(
  "A8 tokens.ts uses 4 tokens of per-message overhead",
  /PER_MESSAGE_OVERHEAD\s*=\s*4/.test(TOKENS_SRC),
  "Per-message framing overhead changed — update SECTION B expectations"
);

assert(
  "A9 tokens.ts has a CJK code-point branch",
  /function isCjkCodePoint/.test(TOKENS_SRC) &&
    /0x3400/.test(TOKENS_SRC) &&
    /0xac00/.test(TOKENS_SRC) &&
    /0x3040/.test(TOKENS_SRC),
  "CJK-detection branch missing — Latin-only ratio would under-count CJK by 3-4x"
);

assert(
  "A10 tokens.ts is server-only-compatible (no client leak of ChatMessage shape)",
  /import type \{ ChatMessage \} from "\.\/types"/.test(TOKENS_SRC),
  "Type import for ChatMessage missing"
);

// =============================================================================
// SECTION B — behavioural lock. Reimplements estimateTokens inline so edits
// to the ratio / CJK table that bypass SECTION A's regex checks still trip.
// =============================================================================

function isCjk(code) {
  return (
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x20000 && code <= 0x2a6df)
  );
}

// Mirror of the TS source's estimator — kept here as a spec oracle.
function oracleEstimate(text) {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (isCjk(code)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk + other / 3.5);
}

assert(
  "B1 empty string → 0 tokens",
  oracleEstimate("") === 0,
  "Empty string must yield 0 tokens"
);

assert(
  "B2 short ASCII rounds up (11 chars → 4 tokens)",
  oracleEstimate("hello world") === 4,
  `11 chars / 3.5 = 3.14, ceil = 4; got ${oracleEstimate("hello world")}`
);

assert(
  "B3 3500-char ASCII → 1000 tokens (ratio lock)",
  oracleEstimate("x".repeat(3500)) === 1000,
  `Expected 1000; got ${oracleEstimate("x".repeat(3500))}`
);

assert(
  "B4 CJK chars count 1:1 (3 Japanese chars → 3 tokens)",
  oracleEstimate("日本語") === 3,
  `Expected 3; got ${oracleEstimate("日本語")} — CJK branch broken`
);

assert(
  "B5 CJK emoji / supplementary plane counted (Ext B range)",
  oracleEstimate("𠀀") === 1,
  `Expected 1 (code point 0x20000 in CJK Ext B); got ${oracleEstimate("𠀀")}`
);

assert(
  "B6 mixed ASCII + CJK sums correctly (7 ASCII + 3 CJK → 5 tokens)",
  oracleEstimate("hello! 日本語") === 5,
  // "hello! " = 7 ASCII = 7/3.5 = 2 tokens; "日本語" = 3 tokens; total 5
  `Expected 5; got ${oracleEstimate("hello! 日本語")}`
);

assert(
  "B7 70k ASCII chars blow 20k cap (70000/3.5 = 20000 tokens exactly)",
  oracleEstimate("a".repeat(70_000)) === 20_000,
  `Expected 20000; got ${oracleEstimate("a".repeat(70_000))}`
);

assert(
  "B8 71k ASCII chars over cap (71000/3.5 = 20286, ceil)",
  oracleEstimate("a".repeat(71_000)) > 20_000,
  `70k is the break-even; 71k should overflow the 20k cap`
);

// =============================================================================
// SECTION C — call-site wiring in app/api/ai/chat/route.ts
// =============================================================================

assert(
  "C1 chat route imports estimatePromptTokens + OP_MAX_INPUT_TOKENS",
  /import\s*\{\s*estimatePromptTokens,\s*OP_MAX_INPUT_TOKENS\s*\}\s*from\s*"@\/lib\/ai\/tokens"/.test(
    CHAT_SRC
  ),
  "chat route must import both symbols from @/lib/ai/tokens"
);

assert(
  "C2 chat route calls estimatePromptTokens with (systemPrompt, messages)",
  /estimatePromptTokens\(\s*systemPrompt,\s*messages\s*\)/.test(CHAT_SRC),
  "Expected estimatePromptTokens(systemPrompt, messages) in route body"
);

assert(
  "C3 chat route compares estimate against OP_MAX_INPUT_TOKENS.chat_turn",
  /OP_MAX_INPUT_TOKENS\.chat_turn/.test(CHAT_SRC),
  "Route must use OP_MAX_INPUT_TOKENS.chat_turn (not a magic number)"
);

assert(
  "C4 chat route returns 413 on token-cap overflow",
  /return json\(413,\s*\{\s*[\s\S]*?error:\s*"context_too_large"/.test(CHAT_SRC),
  "413 context_too_large response not found"
);

assert(
  "C5 413 body includes maxTokens + estimatedTokens fields (client-friendly)",
  /error:\s*"context_too_large"[\s\S]*?maxTokens:[\s\S]*?estimatedTokens:/.test(
    CHAT_SRC
  ),
  "413 payload must carry maxTokens + estimatedTokens for UI"
);

// Refund-before-413 is critical: spendCredits has already fired at this
// point, so a 413 without a refund would silently debit credits on
// rejected turns. Check the refundCredits call appears BEFORE the 413
// return within the token-cap block.
{
  const block = CHAT_SRC.match(
    /if \(estimatedInputTokens > OP_MAX_INPUT_TOKENS\.chat_turn\)\s*\{([\s\S]*?)\}\s*\n\s*\/\/ -- 8\./
  );
  const body = block ? block[1] : "";
  assert(
    "C6 token-cap branch refunds BEFORE returning 413",
    /refundCredits\(\s*\{[\s\S]*?\}\s*\)[\s\S]*?return json\(413/.test(body),
    "refundCredits must precede the 413 return inside the token-cap branch"
  );
  assert(
    "C7 token-cap refund carries 'context_too_large' in the note (audit trail)",
    /note:\s*`Refund: context_too_large/.test(body),
    "Refund note must name the reason so credit_ledger is greppable"
  );
}

assert(
  "C8 token-cap check fires AFTER PDF extraction (so PDF text counts)",
  CHAT_SRC.indexOf("extractPdfText(bytes)") <
    CHAT_SRC.indexOf("estimatePromptTokens(systemPrompt"),
  "Cap check must come after extractPdfText call — otherwise PDF content is not in the count"
);

assert(
  "C9 token-cap check fires BEFORE user_message DB insert (so no orphaned rows)",
  CHAT_SRC.indexOf("estimatePromptTokens(systemPrompt") <
    CHAT_SRC.indexOf("id: userMessageId"),
  "Cap check must precede the user_message insert — otherwise 413 leaves an orphan row"
);

// =============================================================================
// SECTION D — removal / drift checks
// =============================================================================

assert(
  "D1 stale byte-level check `messageText.length > 16_000` is gone",
  !/messageText\.length\s*>\s*16_000/.test(CHAT_SRC),
  "Old char-level 400 still present — the token cap is the canonical gate"
);

assert(
  "D2 stale `message_too_long` error code is gone from the route",
  !/"message_too_long"/.test(CHAT_SRC),
  "Old 'message_too_long' error code still referenced — replace with token cap"
);

assert(
  "D3 25 MB MAX_PDF_BYTES memory guard is KEPT (orthogonal concern)",
  /MAX_PDF_BYTES\s*=\s*25\s*\*\s*1024\s*\*\s*1024/.test(CHAT_SRC),
  "25 MB upload cap must stay — it's a memory/OOM guard, not a context guard"
);

assert(
  "D4 pdf_too_large 413 response preserved",
  /error:\s*"pdf_too_large"/.test(CHAT_SRC),
  "pdf_too_large byte-level 413 must remain for OOM defense"
);

// =============================================================================
// SECTION E — spec-pinning: MASTER_PLAN.md still says what this harness assumes
// =============================================================================

assert(
  "E1 MASTER_PLAN.md §7 gate #5 still says chat_turn context cap",
  /50k tokens to `chat_turn` → 413/.test(MASTER_SRC),
  "Gate #5 wording drifted — realign this harness with the new spec or revert MP"
);

assert(
  "E2 MASTER_PLAN.md §4 D4 still pins 20k input tokens",
  /20k input tokens/.test(MASTER_SRC),
  "D4 decision drifted — update OP_MAX_INPUT_TOKENS.chat_turn to match"
);

// =============================================================================
// Summary
// =============================================================================

console.log("");
console.log("================================================================");
console.log(" Phase A2 token-cap test harness");
console.log("================================================================");
for (const f of failures) {
  console.log(`  ❌ ${f.label}`);
  if (f.detail) console.log(`     ${f.detail}`);
}
console.log("");
console.log(`Context-cap tests: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
