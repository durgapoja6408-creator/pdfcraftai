// Provider registry — the single point of provider selection.
//
// Callers ask the registry two questions:
//   - "Which providers are configured right now?"
//   - "Given (currency, mode), which provider should I use?"
//
// The registry is env-driven: only providers whose env vars are set get
// registered. That means rolling out a provider to production is "set a
// handful of env vars on Hostinger" — no code changes, no redeploy
// beyond env.
//
// Adapters are lazy-imported so a misconfigured provider never breaks
// boot. If RAZORPAY_KEY_ID isn't set, the Razorpay module is simply not
// loaded — its dependencies don't get pulled, its init never runs.
//
// History: this registry used to carry a PayPal row (between Phase 4
// and 2026-04-21). D4 replaced the PayPal international rail with
// Paddle MoR; the PayPal adapter, webhook route, and env-var block
// were retired in the same commit that added this note.

import type { PaymentProvider } from "./provider";
import type { Currency, ProviderId } from "./types";

type ProviderFactory = () => Promise<PaymentProvider>;

/**
 * One row per adapter we ship. `isConfigured` checks env to decide
 * whether the adapter is actually usable right now; `load` lazy-imports
 * and constructs it.
 *
 * To add a new provider: add a row here and ship the adapter file. No
 * other code in the app needs to change.
 */
const ADAPTERS: ReadonlyArray<{
  id: ProviderId;
  isConfigured: () => boolean;
  load: ProviderFactory;
}> = [
  {
    id: "razorpay",
    isConfigured: () =>
      Boolean(
        process.env.RAZORPAY_KEY_ID &&
          process.env.RAZORPAY_KEY_SECRET &&
          process.env.RAZORPAY_WEBHOOK_SECRET
      ),
    load: async () => {
      const { RazorpayProvider } = await import("./adapters/razorpay");
      return new RazorpayProvider({
        keyId: process.env.RAZORPAY_KEY_ID!,
        keySecret: process.env.RAZORPAY_KEY_SECRET!,
        webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
      });
    },
  },
  {
    // Paddle (Merchant of Record) — the international rail post-D4.
    // Razorpay stays on the INR rail; Paddle replaces PayPal for
    // non-IN traffic. Seller ID 320957 (signed up 2026-04-21).
    // See docs/payments/MOR_EVALUATION.md for the gateway pick.
    //
    // Five env vars gate whether the adapter is live:
    //   PADDLE_API_KEY         server-side Bearer token (secret)
    //   PADDLE_CLIENT_TOKEN    browser-safe token paired with Paddle.js
    //   PADDLE_WEBHOOK_SECRET  HMAC key for paddle-signature verification
    //   PADDLE_SELLER_ID       informational — "320957" for pdfcraftai
    //   PADDLE_ENV             "sandbox" | "live" (defaults to sandbox)
    //
    // While Paddle KYC verification is pending, only the sandbox
    // quad lands on Hostinger, so registry.isConfigured() → false
    // in production until the live keys are in.
    id: "paddle",
    isConfigured: () =>
      Boolean(
        process.env.PADDLE_API_KEY &&
          process.env.PADDLE_CLIENT_TOKEN &&
          process.env.PADDLE_WEBHOOK_SECRET &&
          process.env.PADDLE_SELLER_ID
      ),
    load: async () => {
      const { PaddleProvider } = await import("./adapters/paddle");
      return new PaddleProvider({
        apiKey: process.env.PADDLE_API_KEY!,
        clientToken: process.env.PADDLE_CLIENT_TOKEN!,
        webhookSecret: process.env.PADDLE_WEBHOOK_SECRET!,
        sellerId: process.env.PADDLE_SELLER_ID!,
        environment:
          (process.env.PADDLE_ENV as "sandbox" | "live" | undefined) ??
          "sandbox",
      });
    },
  },
];

// Cache loaded adapters. We want one instance per process so webhook
// handlers, checkout routes, and the reconciliation cron share state
// like HTTP keep-alive and token caches.
const CACHE = new Map<ProviderId, Promise<PaymentProvider>>();

function loaderFor(id: ProviderId): ProviderFactory | null {
  const row = ADAPTERS.find((a) => a.id === id);
  if (!row) return null;
  if (!row.isConfigured()) return null;
  return row.load;
}

/**
 * Get a provider by ID. Returns null if the provider isn't configured
 * (missing env vars) or unknown. Never throws for config issues —
 * callers should check and fall back. Throws only on broken init (rare).
 */
export async function getProvider(id: ProviderId): Promise<PaymentProvider | null> {
  const cached = CACHE.get(id);
  if (cached) return cached;
  const loader = loaderFor(id);
  if (!loader) return null;
  const promise = loader();
  CACHE.set(id, promise);
  // If init rejects, evict so we don't cache the failure forever.
  promise.catch(() => CACHE.delete(id));
  return promise;
}

/**
 * All currently configured providers. Used by the checkout UI to render
 * "Pay with Razorpay / Paddle" buttons — only configured options appear.
 * Order matches ADAPTERS declaration order.
 */
export async function listConfiguredProviders(): Promise<PaymentProvider[]> {
  const ids = ADAPTERS.filter((a) => a.isConfigured()).map((a) => a.id);
  const loaded = await Promise.all(ids.map((id) => getProvider(id)));
  return loaded.filter((p): p is PaymentProvider => p !== null);
}

/**
 * Just the IDs of configured providers — cheaper when callers don't
 * need the live adapter, only to know whether a provider is available.
 */
export function listConfiguredProviderIds(): ProviderId[] {
  return ADAPTERS.filter((a) => a.isConfigured()).map((a) => a.id);
}

/**
 * Selection strategy: given what the caller needs, pick a provider.
 * Simple rule for now: first configured provider that supports the
 * currency AND the mode. `preferredId` lets the caller honor a user
 * choice (the UI passes whichever button was clicked).
 *
 * We intentionally don't encode smart routing (Paddle for USD, Razorpay
 * for INR) here — the UI renders both buttons and the user picks. If we
 * ever want to auto-route, this is the single function to change.
 */
export async function selectProvider(opts: {
  currency: Currency;
  mode: "one_time" | "subscription";
  preferredId?: ProviderId;
}): Promise<PaymentProvider | null> {
  const candidates = await listConfiguredProviders();
  const eligible = candidates.filter((p) => {
    if (!p.supportedCurrencies.includes(opts.currency)) return false;
    if (opts.mode === "subscription" && !p.capabilities.subscriptions) return false;
    if (opts.mode === "one_time" && !p.capabilities.oneTime) return false;
    return true;
  });
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
export function __resetProviderCache(): void {
  CACHE.clear();
}
