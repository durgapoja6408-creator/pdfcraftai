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
// Adding a new provider: add a row to the ADAPTERS array below, ship
// the adapter file under ./adapters/<name>.ts implementing the
// PaymentProvider interface, set the env vars on the host. No other
// code in the app needs to change. The retirement path is symmetric:
// remove the row + delete the adapter; downstream code keeps working
// because the registry returns null for "no configured provider."

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
  // International rail: not currently configured. The router at
  // lib/payments/router.ts returns null for non-IN currencies, which
  // surfaces a clear "international payments not yet available" error
  // at the checkout layer. Add the next approved gateway as a new row
  // here when it's ready.
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
 * a "Pay with X" button per provider — only configured options appear.
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
 * We intentionally don't encode smart routing (e.g. one rail for USD,
 * another for INR) here — the UI renders the buttons and the user
 * picks. If we ever want to auto-route, this is the single function
 * to change.
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
