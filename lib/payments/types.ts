// Payment provider types — portable, provider-neutral.
//
// Design principles (from the portability review):
//   1. Internal IDs are primary. Provider refs are metadata.
//      Every Checkout is anchored to an `internalPaymentId` (UUID) that
//      outlives any single provider. Migration across gateways re-uses
//      the same internal ID.
//   2. `ProviderId` is an open `string`, not a literal union. Adding a
//      new adapter must not require a type change in callers.
//   3. Events are normalized at the webhook boundary. Downstream code
//      (ledger writer, credit granter) never sees provider-specific
//      shapes — only `NormalizedPaymentEvent`.
//   4. PCI: we never accept raw PAN/CVV. `CheckoutSession` returns either
//      a redirect URL or a client-side token the provider's hosted iframe
//      consumes. The card data never touches our servers.

import type { CreditPackId } from "@/lib/pricing";

// --- Identifiers ----------------------------------------------------------

/**
 * Open provider identifier. Currently shipped: "razorpay".
 * Intentionally `string` — adding an adapter is a runtime concern, not a
 * type-system concern. Call sites that need to branch should use the
 * registry, not a switch on this value.
 */
export type ProviderId = string;

/** ISO 4217 currency code. Extend as we add providers/markets. */
export type Currency = "INR" | "USD";

/**
 * Money is always expressed in the currency's smallest unit (paise / cents).
 * Never pass a float — rounding errors compound across refunds and splits.
 */
export type Money = {
  amountMinor: number;
  currency: Currency;
};

// --- Capabilities ---------------------------------------------------------

/**
 * What a provider can do in *this* installation. Capabilities may be the
 * same across installs (e.g. Razorpay always supports refunds) or gated
 * (e.g. some providers gate partial refunds behind sandbox-validation).
 * The registry decides what to expose.
 */
export type ProviderCapabilities = {
  oneTime: boolean;
  subscriptions: boolean;
  refunds: boolean;
  partialRefunds: boolean;
  webhooks: boolean;
};

// --- Checkout -------------------------------------------------------------

/**
 * Input to `createCheckout`. The only thing the caller *must* pick is the
 * internal payment ID — everything else is derivable from the pack or
 * plan. We accept both pack (one-time) and plan (subscription) inputs in
 * one shape; the provider decides which endpoint to hit based on `mode`.
 */
export type CheckoutInput =
  | {
      mode: "one_time";
      /**
       * UUID minted by *us* before calling the provider. This is the
       * portability anchor: if we migrate providers mid-flight, the user's
       * retried checkout reuses the same internalPaymentId and we stay
       * idempotent.
       */
      internalPaymentId: string;
      userId: string;
      packId: CreditPackId;
      amount: Money;
      returnUrl: string;
      cancelUrl: string;
      /** Arbitrary metadata we want the provider to echo back. */
      metadata?: Record<string, string>;
    }
  | {
      mode: "subscription";
      internalPaymentId: string;
      userId: string;
      /** Our internal plan code ("plus-monthly", "plus-annual", ...). */
      planCode: string;
      amount: Money;
      returnUrl: string;
      cancelUrl: string;
      metadata?: Record<string, string>;
    };

/**
 * How the client should hand off to the provider. Two shapes:
 *   - "redirect": we navigate the browser to `url` (some subscription
 *     flows that prefer a hosted checkout page).
 *   - "client": we hand the browser a token/order-id to feed into the
 *     provider's hosted iframe SDK (Razorpay Checkout modal, etc.).
 *
 * Both shapes keep card data entirely on the provider side — SAQ-A.
 */
export type CheckoutSession =
  | {
      kind: "redirect";
      url: string;
    }
  | {
      kind: "client";
      /** Opaque token/order-id the provider's JS SDK consumes. */
      clientToken: string;
      /** Which SDK to load ("razorpay", ...). */
      sdk: ProviderId;
      /** Extra config the SDK needs (public key, merchant ID, etc.). */
      publicConfig: Record<string, string>;
    };

export type CheckoutResult = {
  /** Provider-side reference (order id, transaction id, etc.). */
  providerRef: string;
  session: CheckoutSession;
};

// --- Ledger financials ----------------------------------------------------

/**
 * Phase B / Task #15 — financial self-description payload written onto
 * every real-payment `credit_ledger` row. Lives here in types.ts (not
 * ledger.ts) so webhook adapters can build the payload without pulling
 * in the full ledger module — and so `NormalizedPaymentEvent` can embed
 * it on the event itself without a circular import.
 *
 * ALL fields are optional so existing callers (internal grants, refund
 * debits, promo credits) that don't know about processor fees / tax / FX
 * keep working with no changes. When `financials` is omitted the new
 * columns stay NULL — which /admin/margin treats as "not yet categorized",
 * never as zero revenue.
 *
 * Semantic notes:
 *   - `grossChargeMicros` + `billingCurrency` describe what the customer
 *     was billed in their currency. `netRevenueMicros` is the canonical
 *     USD-micros figure the caller already resolved through FX.
 *   - `provider` of "refund_reversal" is how we book a refund debit row:
 *     deltas are negative (credits going out), but the column-level
 *     provenance points back at which rail originated the debit.
 *   - `taxTreatment` of "mor" (MoR provider absorbs remittance) /
 *     "forward" (Razorpay collects, we remit) / "rcm" (foreign-buyer
 *     reverse charge) / "none" drives the admin-side tax dashboard's
 *     segmentation. (No "mor" rows are written today — kept for the
 *     case where the next international gateway is a Merchant of
 *     Record.)
 *   - `dataSource` is the audit switch. "webhook" = real, authoritative;
 *     "backfill_api" = fetched from provider history REST; "estimate" =
 *     synthesized from defaults (only used by the backfill script for
 *     rows the provider can no longer reconstruct).
 */
export type LedgerFinancials = {
  grossChargeMicros?: number;
  billingCurrency?: string;
  provider?:
    | "razorpay"
    | "manual"
    | "refund_reversal"
    | "chargeback_reversal";
  processorFeeMicros?: number;
  taxCollectedMicros?: number;
  taxTreatment?: "mor" | "forward" | "rcm" | "none";
  taxRemittableMicros?: number;
  /** decimal(18,8) — pass as string or number; persisted as string. */
  fxRateUsed?: string | number;
  fxSlippageMicros?: number;
  netRevenueMicros?: number;
  cardFingerprint?: string;
  dataSource?: "webhook" | "backfill_api" | "estimate";
};

// --- Normalized events ----------------------------------------------------

/**
 * Every webhook, regardless of provider, is translated into one of these
 * shapes before touching the ledger. Discriminated on `kind` so the
 * applyPaymentEvent switch is exhaustive.
 *
 * `providerRef` is the provider's payment/capture id. `internalPaymentId`
 * is recovered from the providerRef via our `payments` table lookup. We
 * write the ledger keyed on `internalPaymentId`, never on providerRef —
 * that's what makes us migration-safe.
 *
 * Phase B / Task #16: `payment_captured` and `refund` carry an optional
 * `financials` payload. Adapters that have rich fee/tax/FX data
 * (Razorpay reconciliation fetches; future MoR adapters via webhook)
 * populate it; adapters that don't leave it undefined and the ledger
 * columns stay NULL.
 */
export type NormalizedPaymentEvent =
  | {
      kind: "payment_captured";
      providerId: ProviderId;
      providerRef: string;
      internalPaymentId: string;
      amount: Money;
      occurredAt: Date;
      /** Raw provider payload, scrubbed of PAN/CVV. Stored for audit. */
      providerRaw: unknown;
      /** Phase B / Task #16 — fee/tax/FX/net breakdown (provider-dependent). */
      financials?: LedgerFinancials;
    }
  | {
      kind: "payment_failed";
      providerId: ProviderId;
      providerRef: string;
      internalPaymentId: string;
      reason: string;
      occurredAt: Date;
      providerRaw: unknown;
    }
  | {
      kind: "refund";
      providerId: ProviderId;
      providerRef: string;
      internalPaymentId: string;
      /** Refund-side reference, distinct from the original payment ref. */
      providerRefundRef: string;
      amount: Money;
      occurredAt: Date;
      providerRaw: unknown;
      /**
       * Phase B / Task #16 — reversal breakdown. For a full refund all
       * money values are negative (gross/fee/tax/net reversed). The
       * `provider` field for a refund debit row is conventionally set to
       * "refund_reversal" by the ledger, so adapters building this
       * payload should leave `provider` undefined — the ledger fills it.
       */
      financials?: LedgerFinancials;
    }
  | {
      /**
       * Phase D / Task #22 — chargeback (card-scheme dispute the issuer
       * pulled back funds on). Materially different from `refund`:
       *   - the user didn't ask; the card-issuing bank initiated
       *   - we typically incur a dispute fee (2,000–4,000 INR on
       *     Razorpay; international processors charge similar in USD)
       *     whether or not we contest
       *   - if a future rail is a Merchant of Record, the MoR fights
       *     the dispute on our behalf; win rates hover around 40%
       *     industry-wide
       *   - funds move out of the processor's account → back to the
       *     issuer; our credit_ledger mirrors that with a negative-
       *     signed row tagged `provider: "chargeback_reversal"`
       *
       * Why a distinct `kind` from `refund`:
       * Both reduce revenue and credits, but the operational response
       * (dispute evidence, fee absorption, potential fraud flag on the
       * user) is different. Keeping them as separate normalized kinds
       * lets /admin/chargebacks and /admin/refunds be honest about WHY
       * money left, and the per-payment audit reads correctly when an
       * operator goes back six months to explain a reversal.
       */
      kind: "chargeback";
      providerId: ProviderId;
      providerRef: string;
      internalPaymentId: string;
      /**
       * Chargeback-side reference (provider-specific id for the
       * dispute event; same wire shape as refund's providerRefundRef
       * but semantically distinct; we keep the field name narrower to
       * avoid collision).
       */
      providerChargebackRef: string;
      amount: Money;
      occurredAt: Date;
      providerRaw: unknown;
      /**
       * Negative-signed breakdown. Adapters populate gross/fee/tax/net as
       * negatives of the original capture; the ledger tags `provider` as
       * "chargeback_reversal" so /admin/chargebacks can distinguish this
       * from a user-initiated refund even though the sign and shape
       * match.
       */
      financials?: LedgerFinancials;
      /**
       * Free-form reason string from the provider (e.g. the card-
       * scheme chargeback reason code). Stored on
       * the ledger row's `note` for downstream dispute prep.
       */
      reason?: string;
    }
  | {
      kind: "subscription_event";
      providerId: ProviderId;
      providerRef: string;
      internalPaymentId: string;
      /** Subscription lifecycle signal, normalized. */
      state: "activated" | "renewed" | "cancelled" | "paused" | "failed";
      occurredAt: Date;
      providerRaw: unknown;
    }
  | {
      /**
       * Known event the provider sends that we don't act on. Recorded so
       * webhook logs aren't lossy but no ledger write happens.
       */
      kind: "ignored";
      providerId: ProviderId;
      providerRef: string;
      eventType: string;
      occurredAt: Date;
      providerRaw: unknown;
    };

// --- Reconciliation -------------------------------------------------------

/**
 * Provider-neutral transaction shape used by the nightly reconciliation
 * cron. `listTransactionsSince` returns an AsyncIterable so adapters can
 * page internally without forcing the whole window into memory.
 */
export type NormalizedTx = {
  providerId: ProviderId;
  providerRef: string;
  /** May be null if we can't trace back to an internal payment (alerting case). */
  internalPaymentId: string | null;
  status: "captured" | "failed" | "refunded" | "pending";
  amount: Money;
  occurredAt: Date;
};

// --- Refunds --------------------------------------------------------------

export type RefundInput = {
  internalPaymentId: string;
  /** Omit for full refund. */
  amount?: Money;
  reason: string;
};

export type RefundResult = {
  providerRefundRef: string;
};

// --- Webhook verification -------------------------------------------------

/**
 * Shape we hand the adapter to verify a webhook. Kept minimal and
 * framework-neutral — the caller (Next.js route handler) is responsible
 * for extracting headers and raw body before delegating.
 */
export type WebhookVerifyInput = {
  /** Raw request body bytes. Do NOT JSON.parse before signature checks. */
  rawBody: string;
  headers: Record<string, string>;
};

export type WebhookVerifyResult =
  | { ok: true; event: NormalizedPaymentEvent }
  | { ok: false; reason: string };
