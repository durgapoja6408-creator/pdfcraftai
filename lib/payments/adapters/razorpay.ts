// Razorpay adapter.
//
// PCI posture: we use the Razorpay Checkout modal (hosted iframe). The
// browser loads checkout.razorpay.com, the card fields are rendered
// inside their iframe, and the payment object we receive back contains
// no PAN/CVV — only an encrypted `razorpay_payment_id`. That puts us in
// SAQ-A scope. We still scrub `providerRaw` defensively because
// Razorpay's webhook payloads include `card.last4` / `card.network`
// fields that are fine to keep, but we don't want a mis-sent `number`
// field to ever land in our DB.
//
// References:
//   Orders API:         https://razorpay.com/docs/api/orders/
//   Webhook sigs:       https://razorpay.com/docs/webhooks/validate/
//   Subscriptions API:  https://razorpay.com/docs/api/subscriptions/
//   Checkout modal:     https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/

import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { PaymentProvider } from "../provider";
import { WebhookSignatureError } from "../provider";
import type {
  CheckoutInput,
  CheckoutResult,
  Currency,
  Money,
  NormalizedPaymentEvent,
  NormalizedTx,
  ProviderCapabilities,
  RefundInput,
  RefundResult,
  WebhookVerifyInput,
  WebhookVerifyResult,
} from "../types";

const API_BASE = "https://api.razorpay.com/v1";

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
};

// --- Provider -------------------------------------------------------------

export class RazorpayProvider implements PaymentProvider {
  readonly id = "razorpay";
  readonly displayName = "Razorpay";
  readonly capabilities: ProviderCapabilities = {
    oneTime: true,
    subscriptions: true,
    refunds: true,
    partialRefunds: true,
    webhooks: true,
  };
  readonly supportedCurrencies: readonly Currency[] = ["INR", "USD"];

  constructor(private readonly config: RazorpayConfig) {}

  // --- Checkout ----------------------------------------------------------

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    if (input.mode === "one_time") {
      return this.createOrder(input);
    }
    return this.createSubscription(input);
  }

  private async createOrder(
    input: Extract<CheckoutInput, { mode: "one_time" }>
  ): Promise<CheckoutResult> {
    // Razorpay accepts amount in the smallest currency unit (paise for
    // INR, cents for USD). Our types already enforce that.
    const body = {
      amount: input.amount.amountMinor,
      currency: input.amount.currency,
      // The Razorpay idempotency scheme is client-side: we pass a
      // `receipt` string they index on. Using our internal UUID keeps
      // retries deterministic.
      receipt: input.internalPaymentId,
      notes: {
        userId: input.userId,
        packId: input.packId,
        internalPaymentId: input.internalPaymentId,
        ...input.metadata,
      },
    };

    const order = await this.call<{ id: string }>("POST", "/orders", body);

    return {
      providerRef: order.id,
      session: {
        kind: "client",
        clientToken: order.id,
        sdk: "razorpay",
        // Field name MUST be `key` — Razorpay's checkout.js SDK reads
        // `new Razorpay({ key })` and the only client-side caller
        // (components/billing/CheckoutButton.tsx) reads
        // `session.publicConfig.key`. We previously shipped this as
        // `keyId` (matching our internal config naming) which caused
        // the SDK to throw "Authentication key was missing during
        // initialization" — the order was created server-side but the
        // browser couldn't open the modal. publicConfig is typed as
        // Record<string, string> so TypeScript can't catch this drift;
        // tests in scripts/test-paddle-webhook-financials.mjs pin it.
        publicConfig: {
          key: this.config.keyId,
          amount: String(input.amount.amountMinor),
          currency: input.amount.currency,
          name: "pdfcraft ai",
          description: `Credit pack — ${input.packId}`,
        },
      },
    };
  }

  private async createSubscription(
    input: Extract<CheckoutInput, { mode: "subscription" }>
  ): Promise<CheckoutResult> {
    // planCode in our schema maps to a Razorpay plan_id (created out of
    // band in the Razorpay dashboard — we never mint plans from the
    // server, as they're a billing-ops concern).
    const body = {
      plan_id: input.planCode,
      // 12 = annual, 120 = 10 years; we pick an arbitrarily large number
      // so the subscription renews until the user explicitly cancels.
      total_count: 120,
      customer_notify: 1,
      notes: {
        userId: input.userId,
        internalPaymentId: input.internalPaymentId,
        ...input.metadata,
      },
    };

    const sub = await this.call<{ id: string; short_url: string }>(
      "POST",
      "/subscriptions",
      body
    );

    return {
      providerRef: sub.id,
      // For subscriptions Razorpay returns a hosted URL — simpler and
      // handles mandate consent flows (UPI Autopay, card tokens) cleanly.
      session: { kind: "redirect", url: sub.short_url },
    };
  }

  // --- Webhook verification ---------------------------------------------

  async verifyWebhook(input: WebhookVerifyInput): Promise<WebhookVerifyResult> {
    const sig = input.headers["x-razorpay-signature"];
    if (!sig) {
      return { ok: false, reason: "missing x-razorpay-signature header" };
    }

    const expected = createHmac("sha256", this.config.webhookSecret)
      .update(input.rawBody)
      .digest("hex");

    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(sig, "hex");
    if (
      expectedBuf.length !== sigBuf.length ||
      !timingSafeEqual(expectedBuf, sigBuf)
    ) {
      return { ok: false, reason: "signature mismatch" };
    }

    // Signature valid. Parse, normalize, scrub.
    let parsed: RazorpayWebhookBody;
    try {
      parsed = JSON.parse(input.rawBody) as RazorpayWebhookBody;
    } catch {
      return { ok: false, reason: "body is not valid JSON" };
    }

    const event = this.normalize(parsed);
    if (!event) {
      return { ok: false, reason: `unhandled shape for event ${parsed.event}` };
    }
    return { ok: true, event };
  }

  private normalize(body: RazorpayWebhookBody): NormalizedPaymentEvent | null {
    const eventType = body.event;
    const occurredAt = new Date((body.created_at ?? 0) * 1000);

    // --- Payments --------------------------------------------------------
    if (eventType === "payment.captured" || eventType === "payment.authorized") {
      const p = body.payload?.payment?.entity;
      if (!p) return null;
      const internalPaymentId = p.notes?.internalPaymentId ?? "";
      return {
        kind: "payment_captured",
        providerId: this.id,
        providerRef: p.id,
        internalPaymentId,
        amount: { amountMinor: p.amount, currency: p.currency as Currency },
        occurredAt,
        providerRaw: scrub(body),
      };
    }

    if (eventType === "payment.failed") {
      const p = body.payload?.payment?.entity;
      if (!p) return null;
      return {
        kind: "payment_failed",
        providerId: this.id,
        providerRef: p.id,
        internalPaymentId: p.notes?.internalPaymentId ?? "",
        reason: p.error_description ?? p.error_code ?? "unknown",
        occurredAt,
        providerRaw: scrub(body),
      };
    }

    // --- Refunds ---------------------------------------------------------
    if (eventType === "refund.created" || eventType === "refund.processed") {
      const r = body.payload?.refund?.entity;
      const p = body.payload?.payment?.entity;
      if (!r || !p) return null;
      return {
        kind: "refund",
        providerId: this.id,
        providerRef: p.id,
        internalPaymentId: p.notes?.internalPaymentId ?? "",
        providerRefundRef: r.id,
        amount: { amountMinor: r.amount, currency: r.currency as Currency },
        occurredAt,
        providerRaw: scrub(body),
      };
    }

    // --- Subscriptions ---------------------------------------------------
    type SubState = "activated" | "renewed" | "cancelled" | "paused" | "failed";
    const subStateMap: Record<string, SubState> = {
      "subscription.activated": "activated",
      "subscription.charged": "renewed",
      "subscription.cancelled": "cancelled",
      "subscription.paused": "paused",
      "subscription.halted": "failed",
    };

    const mappedState = subStateMap[eventType];
    if (mappedState) {
      const s = body.payload?.subscription?.entity;
      if (!s) return null;
      return {
        kind: "subscription_event",
        providerId: this.id,
        providerRef: s.id,
        internalPaymentId: s.notes?.internalPaymentId ?? "",
        state: mappedState,
        occurredAt,
        providerRaw: scrub(body),
      };
    }

    // Known-but-unhandled event (e.g. order.paid, which duplicates
    // payment.captured). Record as ignored so the audit trail is complete.
    return {
      kind: "ignored",
      providerId: this.id,
      providerRef: "",
      eventType,
      occurredAt,
      providerRaw: scrub(body),
    };
  }

  // --- Mutations ---------------------------------------------------------

  async cancelSubscription(internalPaymentId: string): Promise<void> {
    // The caller knows our internal payment id; we need the Razorpay
    // subscription id. In practice the webhook routes resolve
    // providerRef before calling this — but defensively we accept the
    // internal id and let the caller map. This method is intentionally
    // thin; richer lookup belongs in the billing server action.
    throw new WebhookSignatureError(
      this.id,
      `cancelSubscription needs providerRef resolution — call from the billing action, not the adapter (got internalPaymentId=${internalPaymentId})`
    );
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // Same shape issue: refund is keyed on the Razorpay payment id, not
    // our internal id. The billing action resolves that mapping and
    // calls `refundByProviderRef` below.
    throw new Error(
      `RazorpayProvider.refund: resolve providerRef first via billing action (got internalPaymentId=${input.internalPaymentId})`
    );
  }

  /**
   * Issue a refund against a known Razorpay payment id. This is what the
   * billing server action calls after looking up the payment row.
   *
   * Razorpay's refund endpoint takes `amount` in the smallest currency
   * unit matching the original capture. We don't cross-convert here —
   * the billing action is responsible for supplying the right currency.
   * Omit `amount` for a full refund.
   */
  async refundByProviderRef(
    providerRef: string,
    amount?: Money
  ): Promise<RefundResult> {
    const body = amount !== undefined ? { amount: amount.amountMinor } : {};
    const r = await this.call<{ id: string }>(
      "POST",
      `/payments/${providerRef}/refund`,
      body
    );
    return { providerRefundRef: r.id };
  }

  /**
   * Cancel a Razorpay subscription by its provider reference.
   */
  async cancelSubscriptionByProviderRef(providerRef: string): Promise<void> {
    await this.call("POST", `/subscriptions/${providerRef}/cancel`, {
      cancel_at_cycle_end: 0,
    });
  }

  // --- Reconciliation ----------------------------------------------------

  async *listTransactionsSince(since: Date): AsyncIterable<NormalizedTx> {
    // Razorpay's /payments endpoint pages via skip+count. We iterate
    // oldest-first so the cron can checkpoint by occurredAt.
    const fromSec = Math.floor(since.getTime() / 1000);
    const pageSize = 100;
    let skip = 0;

    while (true) {
      const res = await this.call<{
        items: Array<{
          id: string;
          status: string;
          amount: number;
          currency: string;
          created_at: number;
          notes?: { internalPaymentId?: string };
        }>;
      }>(
        "GET",
        `/payments?from=${fromSec}&count=${pageSize}&skip=${skip}`
      );

      if (!res.items || res.items.length === 0) return;

      for (const p of res.items) {
        yield {
          providerId: this.id,
          providerRef: p.id,
          internalPaymentId: p.notes?.internalPaymentId ?? null,
          status: mapRazorpayStatus(p.status),
          amount: {
            amountMinor: p.amount,
            currency: p.currency as Currency,
          },
          occurredAt: new Date(p.created_at * 1000),
        };
      }

      if (res.items.length < pageSize) return;
      skip += pageSize;
    }
  }

  /**
   * Reverse sweep — Task #24. Anchored on a single provider ref (the
   * Razorpay order id we stored on `payments.provider_ref`). Hits
   * /orders/<id>/payments and returns the dominant payment attempt.
   *
   * Subscription rows (`sub_xxx`) are out of scope here — their state
   * changes flow through subscription_event webhooks, not the one-time
   * captured/failed reconciliation path. We return null so the sweep
   * skips them.
   *
   * Errors:
   * - 400 BAD_REQUEST_ERROR for unknown ids → null (sandbox/live drift,
   *   or providerRef stored before the order was actually created).
   * - 5xx / network → throw, caller counts as error and moves on.
   */
  async fetchPaymentStatus(providerRef: string): Promise<NormalizedTx | null> {
    if (providerRef.startsWith("sub_")) return null;

    type Item = {
      id: string;
      status: string;
      amount: number;
      currency: string;
      created_at: number;
      notes?: { internalPaymentId?: string };
    };
    let res: { count: number; items: Item[] };
    try {
      res = await this.call<{ count: number; items: Item[] }>(
        "GET",
        `/orders/${encodeURIComponent(providerRef)}/payments`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Razorpay returns 400 for "order id is invalid" / unknown ids.
      // Treat 400 and 404 alike — the order isn't actionable on their
      // side, so there's nothing for the sweep to recover.
      if (msg.includes(" 400:") || msg.includes(" 404:")) return null;
      throw err;
    }

    if (!res.items || res.items.length === 0) return null;

    // Pick the dominant attempt: captured/authorized > refunded > failed
    // > anything else. A single order can have multiple attempts (user
    // failed then retried); we want the most-positive outcome to drive
    // the ledger sync.
    const ranked = res.items
      .slice()
      .sort((a, b) => statusRank(b.status) - statusRank(a.status));
    const top = ranked[0];

    return {
      providerId: this.id,
      // Use the *payment* id (not the order id) so the synthesized
      // event lands a unique providerRef on the ledger row. Falling
      // back to the order id would collide across retries.
      providerRef: top.id,
      internalPaymentId: top.notes?.internalPaymentId ?? null,
      status: mapRazorpayStatus(top.status),
      amount: {
        amountMinor: top.amount,
        currency: top.currency as Currency,
      },
      occurredAt: new Date(top.created_at * 1000),
    };
  }

  // --- HTTP --------------------------------------------------------------

  private async call<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown
  ): Promise<T> {
    const auth = Buffer.from(
      `${this.config.keyId}:${this.config.keySecret}`
    ).toString("base64");
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
      // Razorpay occasionally returns 5xx during maintenance; caller
      // (webhook handler / cron) retries at a higher level.
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Razorpay ${method} ${path} failed ${res.status}: ${text.slice(0, 500)}`
      );
    }
    return (await res.json()) as T;
  }
}

function mapRazorpayStatus(
  s: string
): "captured" | "failed" | "refunded" | "pending" {
  switch (s) {
    case "captured":
    case "authorized":
      return "captured";
    case "failed":
      return "failed";
    case "refunded":
      return "refunded";
    default:
      return "pending";
  }
}

/**
 * Used by the reverse sweep when an order has multiple payment attempts
 * (typical: failed-then-succeeded). Rank in "ledger materiality" order so
 * the most consequential outcome wins.
 */
function statusRank(s: string): number {
  switch (s) {
    case "captured":
      return 5;
    case "authorized":
      return 4;
    case "refunded":
      return 3;
    case "failed":
      return 2;
    case "created":
      return 1;
    default:
      return 0;
  }
}

// --- Webhook body shapes --------------------------------------------------

// Narrow typing of the Razorpay webhook body. We deliberately type only
// the fields we read — schema drift on unused fields shouldn't break
// verification.
type RazorpayWebhookBody = {
  event: string;
  created_at?: number;
  payload?: {
    payment?: {
      entity: {
        id: string;
        amount: number;
        currency: string;
        error_code?: string;
        error_description?: string;
        notes?: { internalPaymentId?: string };
      };
    };
    refund?: {
      entity: {
        id: string;
        amount: number;
        currency: string;
      };
    };
    subscription?: {
      entity: {
        id: string;
        notes?: { internalPaymentId?: string };
      };
    };
  };
};

// --- Scrubber -------------------------------------------------------------

// Belt-and-braces: Razorpay's hosted checkout doesn't send PANs to our
// server, but we still strip any key that smells like one so a future
// Razorpay change can't silently leak card data into our DB. Runs on
// every providerRaw value before persistence.
const SENSITIVE_KEY_RX = /^(number|pan|cvv|cvc|card_number|security_code)$/i;
const PAN_RX = /\b(?:\d[ -]*?){13,19}\b/;

export function scrub(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return PAN_RX.test(value) ? "[REDACTED]" : value;
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RX.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = scrub(v);
      }
    }
    return out;
  }
  return value;
}
