// PaymentProvider — the portability contract every adapter implements.
//
// Rules of engagement for adapter authors:
//   - Do NOT leak provider-specific types out of this interface. All
//     shapes are declared in ./types.ts and normalized before return.
//   - Idempotency is the caller's responsibility via `internalPaymentId`.
//     Adapters should tolerate the same (userId, internalPaymentId) pair
//     being retried — if the provider supports idempotency keys, use
//     internalPaymentId as that key.
//   - Never store PAN/CVV. If the provider's raw webhook body contains
//     anything that looks like a card number, scrub it before returning
//     it in `providerRaw`.

import type {
  CheckoutInput,
  CheckoutResult,
  Currency,
  Money,
  NormalizedTx,
  ProviderCapabilities,
  ProviderId,
  RefundInput,
  RefundResult,
  WebhookVerifyInput,
  WebhookVerifyResult,
} from "./types";

export interface PaymentProvider {
  /**
   * Stable identifier. Used as the FK value stored against every
   * `payments` row and as the switch key in the registry. Must never
   * change once an adapter has written data — downstream rows depend on
   * this string.
   */
  readonly id: ProviderId;

  /** Human-readable name for the checkout UI ("Razorpay", "Paddle"). */
  readonly displayName: string;

  /** What this adapter, in the current configuration, can do. */
  readonly capabilities: ProviderCapabilities;

  /**
   * Currencies this adapter can accept in this configuration. The
   * registry uses this to pick a provider per (user locale, pack
   * currency) pair.
   */
  readonly supportedCurrencies: readonly Currency[];

  /**
   * Kick off a checkout session. Mints a provider-side order, returns a
   * `CheckoutSession` the browser can use. The caller has already
   * written a `payments` row keyed on `input.internalPaymentId` in
   * "pending" state; this method only attaches the providerRef.
   */
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;

  /**
   * Verify + parse an incoming webhook. Must be called with the raw
   * request body (not JSON.parsed) so signature checks work. On success,
   * returns a `NormalizedPaymentEvent` the ledger processor can apply
   * blindly. On failure (bad signature, replay, malformed), returns a
   * reason string — the route handler decides whether to 400 or 200
   * (many providers stop retrying on 2xx, so invalid signatures should
   * still 400).
   */
  verifyWebhook(input: WebhookVerifyInput): Promise<WebhookVerifyResult>;

  /**
   * Cancel a subscription. Identified by internal payment/subscription
   * ID so callers never touch provider refs directly. If the adapter
   * doesn't support subscriptions (capabilities.subscriptions === false),
   * throw `UnsupportedCapabilityError`.
   */
  cancelSubscription(internalPaymentId: string): Promise<void>;

  /**
   * Issue a refund. Full refund if `input.amount` is omitted. Returns
   * the provider's refund reference so the caller can store it for
   * audit. The refund *event* arrives separately via webhook and is
   * what actually updates the ledger — this method only initiates.
   *
   * In practice adapters throw from this method and require callers to
   * go through `refundByProviderRef` (keyed on the provider's own id,
   * which the billing action resolves from our `payments` row). The
   * interface keeps `refund` for symmetry with `RefundInput` and for
   * future adapters that can resolve internal ids natively.
   */
  refund(input: RefundInput): Promise<RefundResult>;

  /**
   * Issue a refund against a provider-side reference directly. This is
   * what the billing server action calls after looking up the providerRef
   * on our `payments` row — it avoids a round-trip through `RefundInput`
   * for adapters that can't resolve internal ids on their own.
   *
   * `amount` is optional; omitting it requests a full refund. When
   * provided, it's in the *same currency* as the original capture —
   * adapters must reject a mismatch rather than silently cross-convert.
   */
  refundByProviderRef(providerRef: string, amount?: Money): Promise<RefundResult>;

  /**
   * Reconciliation iterator. Used by the nightly cron to catch webhooks
   * we missed (network blips, Hostinger 5xx, provider outages). Returns
   * an AsyncIterable so adapters can page through their API without
   * forcing everything into memory.
   *
   * `since` is an inclusive lower bound. Adapters must yield in
   * occurredAt-ascending order so the cron can checkpoint progress.
   */
  listTransactionsSince(since: Date): AsyncIterable<NormalizedTx>;

  /**
   * Reverse-direction reconciliation: given a provider-side reference
   * (an order id, a transaction id) that our DB still has marked
   * "pending", ask the provider what really happened. Used by the
   * reverse-sweep arm of `runReconciliation` (Task #24).
   *
   * Why this is separate from `listTransactionsSince`:
   * - `listTransactionsSince` is a forward sweep — it asks the provider
   *   "what happened in the last N hours" and matches against our DB.
   *   That catches webhooks we missed AS LONG AS the listing endpoint
   *   surfaces the tx within the lookback window.
   * - But Razorpay's /payments listing only returns *attempted* payments.
   *   Orders whose checkout modal was opened but never completed never
   *   show up there, so a `payments` row with status='pending' and a
   *   real order id sits forever even though Razorpay knows the order
   *   was either captured (on a different attempt the listing missed)
   *   or abandoned. The reverse sweep is the belt-and-suspenders fix.
   *
   * Return shape:
   * - `null` means "the provider has no actionable record for this ref"
   *   (unknown id / out-of-scope subscription / sandbox-vs-live key
   *   drift). The caller leaves the DB row alone.
   * - A NormalizedTx is fed straight into the same `reconcileOne` path
   *   the forward sweep uses, so synthesis is idempotent.
   *
   * Optional because not every adapter implements it. The reverse sweep
   * skips providers whose `fetchPaymentStatus` is undefined.
   */
  fetchPaymentStatus?(providerRef: string): Promise<NormalizedTx | null>;
}

/**
 * Thrown by adapters when the caller asks for a capability the provider
 * doesn't offer in this configuration. The registry checks
 * `capabilities` first, so callers who inspect before acting never see
 * this — it exists for defensive programming in the adapters themselves.
 */
export class UnsupportedCapabilityError extends Error {
  constructor(providerId: ProviderId, capability: keyof ProviderCapabilities) {
    super(`Provider "${providerId}" does not support capability "${capability}"`);
    this.name = "UnsupportedCapabilityError";
  }
}

/**
 * Thrown when a webhook's signature fails verification. Route handlers
 * should catch this and return HTTP 400 (NOT 2xx) so the provider's
 * retry logic kicks in — a 2xx on an invalid signature is worse than
 * dropping it, because the provider marks the event as delivered.
 */
export class WebhookSignatureError extends Error {
  constructor(providerId: ProviderId, reason: string) {
    super(`Webhook signature verification failed for "${providerId}": ${reason}`);
    this.name = "WebhookSignatureError";
  }
}
