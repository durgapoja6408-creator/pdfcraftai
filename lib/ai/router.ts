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
// Routing policy (current defaults — MASTER_PLAN §7 gate #6)
// -----------------------------------------------------------
//   op                | primary    | fallback ladder
//   ocr               | gemini     | [anthropic]          // pdfInput required
//   translate         | gemini     | [anthropic, openai]  // chat is enough
//   chat              | openai     | [anthropic, gemini]  // gpt-4o-mini is the cheapest streaming chat
//   summarize         | anthropic  | [openai, gemini]     // Claude's writing style wins
//   compare           | anthropic  | [openai, gemini]     // same
//   generate          | anthropic  | [openai, gemini]     // long-form writing
//   sign              | anthropic  | [openai, gemini]     // e-sign narrative + detection
//
// Env overrides
// -------------
// Each op can be pinned to a provider via an env var:
//   AI_ROUTER_OCR=anthropic
//   AI_ROUTER_TRANSLATE=gemini
//   AI_ROUTER_CHAT=openai
//   AI_ROUTER_SUMMARIZE=anthropic
//   AI_ROUTER_COMPARE=anthropic
//   AI_ROUTER_GENERATE=anthropic
//   AI_ROUTER_SIGN=anthropic
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

import type { AIProvider } from "./provider";
import { getProvider, listConfiguredProviderIds } from "./registry";
import type { AICapabilities, AIProviderId } from "./types";

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
  | "sign";

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
  translate: ["gemini", "anthropic", "openai"],
  chat: ["openai", "anthropic", "gemini"],
  summarize: ["anthropic", "openai", "gemini"],
  compare: ["anthropic", "openai", "gemini"],
  generate: ["anthropic", "openai", "gemini"],
  sign: ["anthropic", "openai", "gemini"],
};

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

  const ladder = resolveLadder(op, opts.preferredId);

  for (const id of ladder) {
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
