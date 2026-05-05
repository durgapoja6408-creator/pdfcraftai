// AI router — per-operation provider selection (Task #21 / MASTER_PLAN §7 gate #6).
//
// Why this exists
// ---------------
// Before this file, every op module (`ocr.ts`, `translate.ts`,
// `summarize.ts`, `compare.ts`, `/api/ai/chat`) called
// `selectProvider({ capabilityNeeded, preferredId })` directly. That
// worked when the question was just "who has this capability?", but it
// ignored a more important question: "given this operation, who is the
// BEST provider for it — quality, cost, and speed combined?"
//
// Concrete example: OCR against a messy scan is a job where Gemini 2.5
// Flash beats Claude Sonnet at half the per-page cost. Conversely,
// long-form sign-off generation rewards Claude's writing style. The
// old code-path would pick Anthropic every time (it was first in the
// registry) regardless of the op.
//
// The router encodes the routing policy in ONE place. Op modules stop
// worrying about who's best — they just say "I'm doing OCR" and hand
// over the input. The router:
//   1. Validates the op.
//   2. Looks up the routing policy (which provider is primary, which
//      is the fallback ladder).
//   3. Walks the ladder, picking the first configured provider that
//      also has the required capability.
//   4. Honors explicit overrides (env vars for prod tuning, and an
//      optional `preferredId` the caller can pass — e.g. to pin the
//      provider for retry logic).
//
// Routing policy (current defaults — MASTER_PLAN §7 gate #6, refreshed
// 2026-04-21 after the 3-provider cost audit in
// docs/ai/COST_MATRIX_3PROVIDER.md)
// -----------------------------------------------------------
//   op                | primary    | fallback ladder
//   ocr               | gemini     | [anthropic]          // pdfInput required
//   translate         | openai     | [gemini, anthropic]  // gpt-4o-mini is ~4× cheaper than gemini 2.5 flash
//   chat              | openai     | [anthropic, gemini]  // gpt-4o-mini is the cheapest streaming chat
//   summarize         | anthropic  | [openai, gemini]     // Claude's writing style wins — deferred for M3 eval
//   compare           | anthropic  | [openai, gemini]     // same
//   generate          | anthropic  | [openai, gemini]     // long-form writing — deferred for M3 eval
//   sign              | anthropic  | [openai, gemini]     // e-sign narrative + detection — deferred for M3 eval
//   rewrite           | openai     | [anthropic, gemini]  // text rewrite: gpt-4o-mini ~8× cheaper than haiku
//   table             | openai     | [anthropic, gemini]  // structured JSON output from text
//   redact            | openai     | [anthropic, gemini]  // PII span enumeration — structured JSON
//
// Env overrides
// -------------
// Each op can be pinned to a provider via an env var:
//   AI_ROUTER_OCR=anthropic
//   AI_ROUTER_TRANSLATE=openai
//   AI_ROUTER_CHAT=openai
//   AI_ROUTER_SUMMARIZE=anthropic
//   AI_ROUTER_COMPARE=anthropic
//   AI_ROUTER_GENERATE=anthropic
//   AI_ROUTER_SIGN=anthropic
//   AI_ROUTER_REWRITE=openai
//   AI_ROUTER_TABLE=openai
//   AI_ROUTER_REDACT=openai
// If the env override names a provider that isn't configured OR doesn't
// support the required capability, the router falls through to the
// compiled-in ladder (we never silently fail-closed because ops hates
// seeing "no_ai_provider_configured" for a pinning typo).
//
// Why capability checks still happen here
// ---------------------------------------
// The old `selectProvider` did capability filtering — we still need it
// because OCR demands `pdfInput` and chat demands `streaming`. The
// router layers policy ABOVE capability filtering: policy says "try
// Gemini first for OCR", capability filtering says "... but only if it
// advertises pdfInput". Both are required.
//
// Test story
// ----------
// `scripts/test-router.mjs` pins:
//   - Every AIOp has a primary and at least one fallback.
//   - Capability requirements are correct per op (ocr → pdfInput, etc.).
//   - Env override precedence works (env > policy).
//   - Env override skip-on-invalid works (unconfigured pinning → ladder).

import "server-only";

import { isProviderKilled } from "./kill-switches";
import type { AIProvider } from "./provider";
import { getProvider, listConfiguredProviderIds } from "./registry";
import type { AICapabilities, AIProviderId } from "./types";
// 2026-05-04 (PENDING §6c automation) — quality-signal-driven
// provider bias. Behind a default-off env flag inside the helper;
// today's behavior is unchanged for every caller.
import { applyQualityBiasIfEnabled } from "./quality-signal";

// -------------------------------------------------------------------
// Op taxonomy — the single source of truth for "which operations exist"
// -------------------------------------------------------------------

/**
 * Operation identifier used by every AI call-site in the app. Adding a
 * new op means:
 *   1. Add it to this union.
 *   2. Add a policy row to `ROUTING_POLICY`.
 *   3. (Optional) Add an env override name to `OP_ENV_VAR`.
 *
 * Keep in sync with:
 *   - `ai_usage.operation` column values.
 *   - The `operation` field passed to `recordAiUsage()` from every
 *     route handler + op module.
 */
export type AIOp =
  | "ocr"
  | "translate"
  | "chat"
  | "summarize"
  | "compare"
  | "generate"
  | "sign"
  | "rewrite"
  | "table"
  | "redact";

/**
 * The capability an op REQUIRES. If a provider doesn't advertise it,
 * the router skips that provider regardless of routing-policy
 * preference.
 */
const OP_REQUIRED_CAPABILITY: Record<AIOp, keyof AICapabilities> = {
  // OCR needs a provider that accepts raw PDF bytes. Today: Anthropic +
  // Gemini. OpenAI's Chat Completions surface doesn't, and we don't
  // wire the Files API.
  ocr: "pdfInput",
  // Translate runs on text only — every adapter's `chat()` handles it.
  // We pick `streaming` to match the same universal minimum every op
  // below inherits (every configured adapter supports streaming today).
  translate: "streaming",
  chat: "streaming",
  summarize: "streaming",
  compare: "streaming",
  generate: "streaming",
  sign: "streaming",
  // The three structured/text ops added 2026-04-21 (MASTER_PLAN §7 gate #6,
  // M2 — promote gpt-4o-mini to primary for short-form text work where
  // it's 4–8× cheaper than haiku at equivalent quality per COST_MATRIX_3PROVIDER.md §2).
  // None require pdfInput; any streaming-capable provider works.
  rewrite: "streaming",
  table: "streaming",
  redact: "streaming",
};

/**
 * Routing policy: primary first, then the ladder. The router walks
 * [primary, ...fallback] and picks the first configured provider that
 * also has the required capability.
 *
 * Array order is load-bearing: #1 is the default choice, the rest is
 * the failover ladder.
 */
const ROUTING_POLICY: Record<AIOp, readonly AIProviderId[]> = {
  ocr: ["gemini", "anthropic"],
  // M1 — translate flipped to openai primary (2026-04-21). gpt-4o-mini is
  // ~4× cheaper than gemini 2.5 flash and ~8× cheaper than haiku for
  // short-form bilingual passes (COST_MATRIX_3PROVIDER.md §2, ranked
  // margin move #2). Gemini kept as fallback; Anthropic last.
  translate: ["openai", "gemini", "anthropic"],
  chat: ["openai", "anthropic", "gemini"],
  summarize: ["anthropic", "openai", "gemini"],
  compare: ["anthropic", "openai", "gemini"],
  generate: ["anthropic", "openai", "gemini"],
  sign: ["anthropic", "openai", "gemini"],
  // M2 — rewrite/table/redact added 2026-04-21 with openai primary.
  // All three are short-context, structured-output ops where gpt-4o-mini
  // dominates on $/call (COST_MATRIX_3PROVIDER.md §2). Anthropic is the
  // first fallback because haiku's JSON-mode reliability is second-best;
  // Gemini trails because its JSON schema enforcement is less strict.
  rewrite: ["openai", "anthropic", "gemini"],
  table: ["openai", "anthropic", "gemini"],
  redact: ["openai", "anthropic", "gemini"],
};

/**
 * Task #13 — ops that can optionally be submitted via OpenAI's Batch
 * API instead of realtime streaming. Batch runs get a flat 50%
 * discount on input + output token cost at a 24h SLA.
 *
 * Eligibility criteria (applied in order):
 *   1. The op's realtime ladder already includes "openai" (we only
 *      built the OpenAI batch adapter in Task #13; Anthropic batch
 *      lands in Task #26).
 *   2. The op is text-only at the wire level — batch doesn't support
 *      multimodal PDFs (so ocr/sign/generate are ineligible even
 *      though they pass #1 for generate).
 *   3. The op has no streaming UX assumption — we can't stream a
 *      batch's output through the existing chat stream pipe.
 *
 * Currently: summarize + translate. Rewrite/table/redact could join
 * later if we see real demand for async turnaround, but they're
 * typically single-shot synchronous today.
 *
 * The UI shows a "run in batch mode (50% off, 24h SLA)" toggle only
 * when `isBatchEligible(op)` is true; server-side the op routes
 * re-check and refuse `mode=batch` for ineligible ops.
 */
export const OP_BATCH_ELIGIBLE: ReadonlySet<AIOp> = new Set<AIOp>([
  "summarize",
  "translate",
]);

export function isBatchEligible(op: AIOp): boolean {
  return OP_BATCH_ELIGIBLE.has(op);
}

/**
 * Env-var name per op. Set in Hostinger → App → Environment Variables.
 * Overrides take precedence over `ROUTING_POLICY` but still respect
 * `OP_REQUIRED_CAPABILITY`. A typo'd or unconfigured override is
 * logged-and-ignored (we fall through to the ladder rather than 503).
 */
const OP_ENV_VAR: Record<AIOp, string> = {
  ocr: "AI_ROUTER_OCR",
  translate: "AI_ROUTER_TRANSLATE",
  chat: "AI_ROUTER_CHAT",
  summarize: "AI_ROUTER_SUMMARIZE",
  compare: "AI_ROUTER_COMPARE",
  generate: "AI_ROUTER_GENERATE",
  sign: "AI_ROUTER_SIGN",
  rewrite: "AI_ROUTER_REWRITE",
  table: "AI_ROUTER_TABLE",
  redact: "AI_ROUTER_REDACT",
};

const VALID_PROVIDER_IDS: ReadonlySet<AIProviderId> = new Set<AIProviderId>([
  "anthropic",
  "openai",
  "gemini",
]);

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

export interface RouteOptions {
  /**
   * Caller override — wins over env and policy if (and only if) the
   * named provider is configured AND supports the required capability.
   * Used by:
   *   - Chat resume: pin to the provider the session was started with
   *     so mid-session provider switches don't happen.
   *   - Retry logic that wants to re-run on a different provider than
   *     the one that just failed (pass the NEXT in the ladder).
   */
  preferredId?: AIProviderId;
  /**
   * 2026-05-04 (PENDING §6c automation) — when provided AND the env
   * flag `QUALITY_SIGNAL_AUTO_ROUTE_ENABLED=true` is set, the router
   * consults `loadUserQualitySignal(userId)` and deprioritizes
   * providers the user thumbs-down'd in their trailing streak. Behind
   * the env flag because the bias thresholds need real chip data to
   * tune; today the bias step is dormant for every caller. Optional
   * because system-initiated calls (cron jobs, batch reconcile) and
   * anonymous routes pass no userId.
   */
  userId?: string | null;
}

/**
 * Thrown when no configured provider can service the op. The route
 * handler catches this and returns 503 with `no_ai_provider_configured`
 * — same surface as the old `selectProvider() === null` branch, so
 * existing error handling upstream doesn't change.
 */
export class NoRoutableProviderError extends Error {
  constructor(
    public readonly op: AIOp,
    public readonly requiredCapability: keyof AICapabilities
  ) {
    super(
      `No AI provider can service op "${op}" — need capability ` +
        `"${requiredCapability}". Configured providers: ` +
        listConfiguredProviderIds().join(", ") || "(none)"
    );
    this.name = "NoRoutableProviderError";
  }
}

/**
 * Pick a provider for the given op. Returns a live `AIProvider` ready
 * to call `.chat()` / `.streamChat()` on.
 *
 * Throws `NoRoutableProviderError` if no configured provider can
 * service the op. Callers should catch and map to 503.
 *
 * Walks the resolved ladder in order, and returns the FIRST provider
 * that is (a) configured, (b) supports the required capability.
 */
export async function route(
  op: AIOp,
  opts: RouteOptions = {}
): Promise<AIProvider> {
  const capability = OP_REQUIRED_CAPABILITY[op];
  if (!capability) {
    // Unknown op — defensive branch. TS narrows this away for typed
    // callers, but route handlers occasionally cast from `string`.
    throw new NoRoutableProviderError(op, "streaming");
  }

  const baseLadder = resolveLadder(op, opts.preferredId);
  // 2026-05-04 (PENDING §6c automation) — quality-signal bias step.
  // Returns baseLadder unchanged when env flag is off OR userId is
  // null OR signal lookup throws OR user is not flagged. See
  // applyQualityBiasIfEnabled JSDoc for the full short-circuit set.
  // Today's behavior: identical to baseLadder for every caller (env
  // flag default is off).
  const ladder = await applyQualityBiasIfEnabled(baseLadder, opts.userId);

  for (const id of ladder) {
    // Task #12 — provider kill switch. An operator-flipped env var
    // (`AI_KILL_{PROVIDER}=true`) removes a provider from consideration
    // for every op until the var is unflipped + redeployed. Skipping
    // silently here means the router falls through to the next ladder
    // entry exactly as if the provider were unconfigured. If every
    // entry is killed, the loop exits and we throw
    // `NoRoutableProviderError` — handled by route handlers as 503
    // `no_ai_provider_configured`, which is the right caller-visible
    // posture ("we can't serve this right now").
    if (isProviderKilled(id)) continue;
    const provider = await getProvider(id);
    if (!provider) continue;
    if (!provider.capabilities[capability]) continue;
    return provider;
  }

  throw new NoRoutableProviderError(op, capability);
}

/**
 * Test + diagnostic hook: what ladder does the router CURRENTLY
 * consider for this op, given env + caller preference? Does NOT
 * filter by configured status or capability — it's the pre-filter
 * ordered list.
 *
 * Used by:
 *   - `/api/health` to show ops which provider each op would pick.
 *   - `scripts/test-router.mjs` to pin env-override semantics.
 */
export function resolveLadder(op: AIOp, preferredId?: AIProviderId): AIProviderId[] {
  const seen = new Set<AIProviderId>();
  const ladder: AIProviderId[] = [];

  // 1. Caller-scoped preference (top priority if valid).
  if (preferredId && VALID_PROVIDER_IDS.has(preferredId)) {
    ladder.push(preferredId);
    seen.add(preferredId);
  }

  // 2. Env override (next priority if set AND valid).
  const envVar = OP_ENV_VAR[op];
  const envValue = process.env[envVar];
  if (envValue && VALID_PROVIDER_IDS.has(envValue as AIProviderId)) {
    const envId = envValue as AIProviderId;
    if (!seen.has(envId)) {
      ladder.push(envId);
      seen.add(envId);
    }
  }

  // 3. Compiled-in policy ladder.
  for (const id of ROUTING_POLICY[op]) {
    if (!seen.has(id)) {
      ladder.push(id);
      seen.add(id);
    }
  }

  return ladder;
}

/**
 * Introspection helper — what op → default-primary mapping is the
 * router currently using? Snapshots BOTH compiled-in policy and live
 * env overrides. Primary diagnostics use: `/api/health` rendering,
 * and the test harness's drift-detection section.
 */
export function currentPolicySnapshot(): Record<AIOp, AIProviderId[]> {
  const snapshot = {} as Record<AIOp, AIProviderId[]>;
  for (const op of Object.keys(ROUTING_POLICY) as AIOp[]) {
    snapshot[op] = resolveLadder(op);
  }
  return snapshot;
}

/**
 * Test hook — expose the policy tables. Exported for the test harness
 * only; production code should call `route()` / `resolveLadder()` /
 * `currentPolicySnapshot()` instead.
 */
export const __ROUTER_INTERNALS = {
  OP_REQUIRED_CAPABILITY,
  ROUTING_POLICY,
  OP_ENV_VAR,
  VALID_PROVIDER_IDS,
} as const;
