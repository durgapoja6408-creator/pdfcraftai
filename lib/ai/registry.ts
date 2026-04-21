// AI provider registry — the single point of AI provider selection.
//
// Callers ask the registry two questions:
//   - "Which AI providers are configured right now?"
//   - "Given (capability, preference), which provider should I use?"
//
// Env-driven. Only providers whose API key is set get registered. Rolling
// out a new adapter to production is "set the API key on Hostinger" —
// no code changes, no redeploy beyond env.
//
// Adapters are lazy-imported so a misconfigured provider never breaks
// boot. If ANTHROPIC_API_KEY isn't set, the Anthropic module is simply
// not loaded — its SDK dependencies don't get pulled, its init never
// runs. Same guarantee as `lib/payments/registry.ts`.

import "server-only";

import type { AIProvider } from "./provider";
import type { AICapabilities, AIProviderId } from "./types";

type ProviderFactory = () => Promise<AIProvider>;

/**
 * One row per adapter we ship. `isConfigured` checks env to decide
 * whether the adapter is actually usable right now; `load` lazy-imports
 * and constructs it.
 *
 * To add a new provider: add a row here and ship the adapter file. No
 * other code in the app needs to change.
 */
const ADAPTERS: ReadonlyArray<{
  id: AIProviderId;
  isConfigured: () => boolean;
  load: ProviderFactory;
}> = [
  {
    id: "anthropic",
    isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
    load: async () => {
      const { AnthropicProvider } = await import("./adapters/anthropic");
      return new AnthropicProvider({
        apiKey: process.env.ANTHROPIC_API_KEY!,
        // Default to Haiku — cheap, fast, good enough for chat-with-PDF.
        // Ops can upgrade per-deployment by setting ANTHROPIC_MODEL.
        defaultModel: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      });
    },
  },
  {
    id: "openai",
    isConfigured: () => Boolean(process.env.OPENAI_API_KEY),
    load: async () => {
      const { OpenAIProvider } = await import("./adapters/openai");
      return new OpenAIProvider({
        apiKey: process.env.OPENAI_API_KEY!,
        defaultModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      });
    },
  },
  {
    id: "gemini",
    // Accept either GEMINI_API_KEY (preferred, matches our naming
    // convention) or GOOGLE_API_KEY (the Google SDK's own default env
    // var). First one set wins in `load()`.
    isConfigured: () =>
      Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY),
    load: async () => {
      const { GeminiProvider } = await import("./adapters/gemini");
      return new GeminiProvider({
        apiKey: (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY)!,
        // Default to Gemini 2.5 Flash — cheap, fast, supports inline PDFs.
        // Ops can upgrade per-deployment by setting GEMINI_MODEL (e.g.
        // gemini-2.5-pro for higher-quality OCR on messy scans).
        defaultModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      });
    },
  },
];

// Cache loaded adapters. One instance per process so chat routes,
// future summarize/translate routes, and background jobs share HTTP
// keep-alive and any in-memory token caches the SDK carries.
const CACHE = new Map<AIProviderId, Promise<AIProvider>>();

function loaderFor(id: AIProviderId): ProviderFactory | null {
  const row = ADAPTERS.find((a) => a.id === id);
  if (!row) return null;
  if (!row.isConfigured()) return null;
  return row.load;
}

/**
 * Get a provider by ID. Returns null if the provider isn't configured
 * (missing env vars) or unknown. Never throws for config issues —
 * callers should check and fall back to another provider.
 */
export async function getProvider(id: AIProviderId): Promise<AIProvider | null> {
  const cached = CACHE.get(id);
  if (cached) return cached;
  const loader = loaderFor(id);
  if (!loader) return null;
  const promise = loader();
  CACHE.set(id, promise);
  // Evict on failure — don't cache a broken init forever.
  promise.catch(() => CACHE.delete(id));
  return promise;
}

/**
 * All currently configured providers. Used by the admin UI ("Which
 * engines are live?") and by `selectProvider` below.
 * Order matches ADAPTERS declaration order.
 */
export async function listConfiguredProviders(): Promise<AIProvider[]> {
  const ids = ADAPTERS.filter((a) => a.isConfigured()).map((a) => a.id);
  const loaded = await Promise.all(ids.map((id) => getProvider(id)));
  return loaded.filter((p): p is AIProvider => p !== null);
}

/**
 * Just the IDs of configured providers — cheaper when callers don't
 * need the live adapter.
 */
export function listConfiguredProviderIds(): AIProviderId[] {
  return ADAPTERS.filter((a) => a.isConfigured()).map((a) => a.id);
}

/**
 * Selection strategy: given what the caller needs, pick a provider.
 * Rule for now:
 *   1. If a preferred ID is passed and that provider supports the
 *      needed capability, use it (honor the user's choice).
 *   2. Otherwise, first configured provider in ADAPTERS order that
 *      supports the capability.
 *
 * For Chat with PDF the relevant capability is `streaming`. Future
 * features (image input, tool use, native PDF input) flip the flag
 * and the same selection code just works.
 */
export async function selectProvider(opts: {
  capabilityNeeded: keyof AICapabilities;
  preferredId?: AIProviderId;
}): Promise<AIProvider | null> {
  const candidates = await listConfiguredProviders();
  const eligible = candidates.filter(
    (p) => p.capabilities[opts.capabilityNeeded]
  );
  if (eligible.length === 0) return null;
  if (opts.preferredId) {
    const preferred = eligible.find((p) => p.id === opts.preferredId);
    if (preferred) return preferred;
  }
  return eligible[0];
}

/**
 * Test hook — reset the cache. Exported for unit tests only; production
 * code should never call this.
 */
export function __resetAIProviderCache(): void {
  CACHE.clear();
}
