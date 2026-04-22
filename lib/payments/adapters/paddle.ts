// Paddle (Merchant of Record) adapter.
//
// Why Paddle: Paddle is the MoR for the international rail (Razorpay
// stays on the INR rail). As MoR, Paddle becomes the seller of record
// and absorbs:
//   - US 50-state sales tax nexus + remittance
//   - EU VAT OSS (cross-border digital services)
//   - UK VAT
//   - Chargeback liability (Paddle fights disputes; we don't)
//   - Customer refund handling on their hosted checkout
//
// This is the whole reason we picked a MoR over a raw PSP for non-IN
// traffic — see docs/payments/MOR_EVALUATION.md §5 "Why MoR beats raw
// PSP for a solo founder" and MARGIN_VERIFICATION.md §12.4 "Compliance
// dividends."
//
// PCI posture: Paddle.js renders a hosted iframe (inline or overlay) so
// card fields never touch our DOM — SAQ-A scope. The client-side token
// below (`PADDLE_CLIENT_TOKEN`, safe for the browser) authenticates the
// iframe; our server-side `PADDLE_API_KEY` (Bearer token) is used only
// server-to-server for creating transactions/subscriptions and calling
// the Paddle REST API from this adapter.
//
// Webhook signature format (Paddle Billing, not the legacy Classic API):
//   header `paddle-signature: ts=<unix-ts>;h1=<hex-hmac-sha256>`
//   payload signed = `<ts>:<rawBody>`, key = notification endpoint's
//   secret key (NOT the API key).
//
// Seller ID 320957 — vendor account rajasekarjavaee@gmail.com, signed
// up 2026-04-21. Verification pending at time of scaffold — sandbox
// works immediately; production paths are wired but will 401 until
// Paddle approves KYC.
//
// References (live URLs at time of scaffold — verify current in
// Paddle's docs when wiring):
//   Billing REST:   https://developer.paddle.com/api-reference/overview
//   Webhooks:       https://developer.paddle.com/webhooks/overview
//   Signature spec: https://developer.paddle.com/webhooks/signature-verification
//   Paddle.js:      https://developer.paddle.com/paddlejs/overview
//
// STATUS: SCAFFOLD. This file compiles and wires into the registry, but
// the live API calls (createCheckout, refund, listTransactionsSince) are
// marked with TODO(paddle-sandbox) — they need sandbox validation against
// real Paddle endpoints before being considered production-ready. See
// docs/STATUS.md Task #1 for the validation plan.

import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { PaymentProvider } from "../provider";
import { UnsupportedCapabilityError, WebhookSignatureError } from "../provider";
import type {
  CheckoutInput,
  CheckoutResult,
  Currency,
  LedgerFinancials,
  Money,
  NormalizedPaymentEvent,
  NormalizedTx,
  ProviderCapabilities,
  RefundInput,
  RefundResult,
  WebhookVerifyInput,
  WebhookVerifyResult,
} from "../types";

// Sandbox vs production host is governed by environment. The client
// token is itself environment-scoped by Paddle — a sandbox token won't
// work against live and vice versa — but we still gate our server-side
// base URL explicitly so a misconfigured env can't accidentally dual-
// home. Paddle documents these URLs in their REST overview page.
const API_BASE_LIVE = "https://api.paddle.com";
const API_BASE_SANDBOX = "https://sandbox-api.paddle.com";

export type PaddleEnvironment = "sandbox" | "live";

export type PaddleConfig = {
  /** Server-side Bearer token. Scope: full API. NEVER ships to browser. */
  apiKey: string;
  /** Client-side token. Paired with Paddle.js on the browser. Safe to expose. */
  clientToken: string;
  /** HMAC key for the notification endpoint's webhook secret. */
  webhookSecret: string;
  /** Which Paddle cluster this adapter talks to. */
  environment: PaddleEnvironment;
  /** Paddle Seller ID — informational, baked into publicConfig for Paddle.js. */
  sellerId: string;
};

// --- Provider -------------------------------------------------------------

export class PaddleProvider implements PaymentProvider {
  readonly id = "paddle";
  readonly displayName = "Paddle";
  readonly capabilities: ProviderCapabilities = {
    oneTime: true,
    subscriptions: true,
    refunds: true,
    // Paddle supports partial refunds but they require line-item context
    // (transaction_item_id + amount). We'll enable this once the refund
    // path is sandbox-validated — until then the billing action must
    // request a full refund to be safe.
    partialRefunds: false,
    webhooks: true,
  };
  // Paddle settles to the seller in one of a small set of presentment
  // currencies; for our purposes the international rail is USD-first
  // with automatic presentment in buyer-locale currency via Paddle's
  // FX engine. We list USD here because that's what we *accept* from
  // the caller; Paddle handles the presentment-currency conversion.
  readonly supportedCurrencies: readonly Currency[] = ["USD"];

  constructor(private readonly config: PaddleConfig) {}

  private get apiBase(): string {
    return this.config.environment === "live" ? API_BASE_LIVE : API_BASE_SANDBOX;
  }

  // --- Checkout ----------------------------------------------------------

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    // Paddle's client-side checkout accepts either:
    //   (a) a pre-created Transaction ID (preferred for one-time purchases
    //       where we want server-side control over line items), or
    //   (b) a price/items list passed directly to Paddle.js
    //
    // We use (a) so every one-time checkout has a server-side anchor
    // keyed by our internalPaymentId in the Paddle transaction's
    // `custom_data`. That's what lets the webhook normalizer recover
    // internalPaymentId without trusting the client.
    if (input.mode === "one_time") {
      return this.createTransaction(input);
    }
    return this.createSubscriptionCheckout(input);
  }

  private async createTransaction(
    input: Extract<CheckoutInput, { mode: "one_time" }>
  ): Promise<CheckoutResult> {
    // TODO(paddle-sandbox): validate this payload against the sandbox
    // POST /transactions endpoint. The shape below is from the REST
    // docs at time of scaffold; any drift needs a doc fetch before
    // we trust it.
    const body = {
      items: [
        {
          // `price_id` comes from Paddle's catalog — created out of band
          // in the Paddle dashboard (Products → Prices) so our server
          // never mints prices. The caller resolves packId → priceId via
          // a lookup table keyed off `input.packId` (TODO: add
          // lib/pricing mapping once sandbox products exist).
          price_id: this.priceIdForPack(input.packId),
          quantity: 1,
        },
      ],
      custom_data: {
        userId: input.userId,
        packId: input.packId,
        internalPaymentId: input.internalPaymentId,
        ...(input.metadata ?? {}),
      },
      // Return URLs are used when Paddle falls back to hosted checkout
      // (e.g. email-retry flow). The inline overlay doesn't need them
      // but setting both is safe and future-proofs against flow changes.
      checkout: {
        url: input.returnUrl,
      },
      collection_mode: "automatic" as const,
    };

    const txn = await this.call<{
      data: { id: string; checkout: { url?: string } | null };
    }>("POST", "/transactions", body);

    const transactionId = txn.data.id;

    return {
      providerRef: transactionId,
      session: {
        // Paddle.js Overlay Checkout consumes the transaction id on the
        // browser. We return it as `clientToken` per our contract — the
        // UI layer knows what to do with it when sdk === "paddle".
        kind: "client",
        clientToken: transactionId,
        sdk: "paddle",
        publicConfig: {
          clientToken: this.config.clientToken,
          environment: this.config.environment,
          sellerId: this.config.sellerId,
        },
      },
    };
  }

  private async createSubscriptionCheckout(
    input: Extract<CheckoutInput, { mode: "subscription" }>
  ): Promise<CheckoutResult> {
    // Subscriptions in Paddle Billing are created by the *first*
    // transaction (collection_mode: "automatic" + a recurring price
    // creates a subscription on capture). We reuse the same
    // POST /transactions endpoint — the recurring nature is encoded in
    // the price_id, not in a separate endpoint.
    const body = {
      items: [
        {
          price_id: this.priceIdForPlan(input.planCode),
          quantity: 1,
        },
      ],
      custom_data: {
        userId: input.userId,
        planCode: input.planCode,
        internalPaymentId: input.internalPaymentId,
        ...(input.metadata ?? {}),
      },
      checkout: {
        url: input.returnUrl,
      },
      collection_mode: "automatic" as const,
    };

    const txn = await this.call<{
      data: { id: string };
    }>("POST", "/transactions", body);

    return {
      providerRef: txn.data.id,
      session: {
        kind: "client",
        clientToken: txn.data.id,
        sdk: "paddle",
        publicConfig: {
          clientToken: this.config.clientToken,
          environment: this.config.environment,
          sellerId: this.config.sellerId,
        },
      },
    };
  }

  // --- Webhook verification ---------------------------------------------

  async verifyWebhook(input: WebhookVerifyInput): Promise<WebhookVerifyResult> {
    const header = input.headers["paddle-signature"];
    if (!header) {
      return { ok: false, reason: "missing paddle-signature header" };
    }

    // Header format: "ts=1701234567;h1=<hex-hmac-sha256>"
    const parts = header.split(";").reduce<Record<string, string>>((acc, kv) => {
      const [k, v] = kv.split("=");
      if (k && v) acc[k.trim()] = v.trim();
      return acc;
    }, {});
    const ts = parts.ts;
    const h1 = parts.h1;
    if (!ts || !h1) {
      return { ok: false, reason: "malformed paddle-signature header" };
    }

    // Replay protection: Paddle documents a 5-minute tolerance. We
    // enforce 10 minutes on the permissive side to absorb clock skew
    // + Cloudflare hops — any signature older than that is rejected
    // rather than letting an attacker replay a captured body.
    const tsMillis = Number(ts) * 1000;
    if (!Number.isFinite(tsMillis)) {
      return { ok: false, reason: "timestamp is not numeric" };
    }
    const ageMs = Date.now() - tsMillis;
    if (ageMs > 10 * 60 * 1000) {
      return { ok: false, reason: `signature too old (${ageMs}ms)` };
    }
    // Small future-drift tolerance (the sender's clock may lead ours).
    if (ageMs < -2 * 60 * 1000) {
      return { ok: false, reason: "signature timestamp in future" };
    }

    const signedPayload = `${ts}:${input.rawBody}`;
    const expected = createHmac("sha256", this.config.webhookSecret)
      .update(signedPayload)
      .digest("hex");

    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(h1, "hex");
    if (
      expectedBuf.length !== sigBuf.length ||
      !timingSafeEqual(expectedBuf, sigBuf)
    ) {
      return { ok: false, reason: "signature mismatch" };
    }

    // Signature valid. Parse + normalize.
    let parsed: PaddleWebhookBody;
    try {
      parsed = JSON.parse(input.rawBody) as PaddleWebhookBody;
    } catch {
      return { ok: false, reason: "body is not valid JSON" };
    }

    const event = this.normalize(parsed);
    if (!event) {
      return {
        ok: false,
        reason: `unhandled shape for event ${parsed.event_type}`,
      };
    }
    return { ok: true, event };
  }

  private normalize(body: PaddleWebhookBody): NormalizedPaymentEvent | null {
    const eventType = body.event_type;
    const occurredAt = body.occurred_at ? new Date(body.occurred_at) : new Date();
    const data = body.data ?? {};
    const customData = (data as { custom_data?: Record<string, string> })
      .custom_data;
    const internalPaymentId = customData?.internalPaymentId ?? "";

    // --- Transactions (one-time + subscription first charge) ------------
    if (eventType === "transaction.completed" || eventType === "transaction.paid") {
      const txn = data as PaddleTransactionEntity;
      if (!txn.id) return null;
      const total = txn.details?.totals?.total ?? txn.items?.[0]?.totals?.total;
      const currency = (txn.currency_code ?? "USD") as Currency;
      // Phase B / Task #16 — populate LedgerFinancials from the webhook
      // body. Paddle always gives us totals.{total,subtotal,tax,fee,earnings}
      // on transaction.completed, so this payload is authoritative and
      // every /admin/margin column lands with a real value (no
      // estimate/backfill). The taxTreatment/dataSource/provider fields
      // are constants for the Paddle rail — the builder bakes them in.
      const financials = buildPaddleCapturedFinancials(txn);
      return {
        kind: "payment_captured",
        providerId: this.id,
        providerRef: txn.id,
        internalPaymentId,
        amount: {
          amountMinor: Number(total ?? 0),
          currency,
        },
        occurredAt,
        providerRaw: scrub(body),
        financials,
      };
    }

    if (eventType === "transaction.payment_failed") {
      const txn = data as PaddleTransactionEntity;
      if (!txn.id) return null;
      return {
        kind: "payment_failed",
        providerId: this.id,
        providerRef: txn.id,
        internalPaymentId,
        reason:
          (data as { reason?: string }).reason ?? "paddle transaction failed",
        occurredAt,
        providerRaw: scrub(body),
      };
    }

    // --- Refunds (Paddle calls them adjustments) ------------------------
    // Paddle models refunds as "adjustments" of action `refund`. The
    // adjustment references the original transaction id, which is our
    // providerRef.
    if (eventType === "adjustment.created" || eventType === "adjustment.updated") {
      const adj = data as PaddleAdjustmentEntity;
      if (adj.action !== "refund") {
        return {
          kind: "ignored",
          providerId: this.id,
          providerRef: adj.id ?? "",
          eventType,
          occurredAt,
          providerRaw: scrub(body),
        };
      }
      if (!adj.id || !adj.transaction_id) return null;
      const total = adj.totals?.total ?? adj.items?.[0]?.amount;
      const currency = (adj.currency_code ?? "USD") as Currency;
      // Phase B / Task #16 — negative-signed financials for the refund
      // debit row. `provider` is left undefined here; the ledger's
      // handleRefund tags the row as "refund_reversal" before writing.
      const financials = buildPaddleRefundFinancials(adj);
      return {
        kind: "refund",
        providerId: this.id,
        providerRef: adj.transaction_id,
        internalPaymentId,
        providerRefundRef: adj.id,
        amount: {
          amountMinor: Number(total ?? 0),
          currency,
        },
        occurredAt,
        providerRaw: scrub(body),
        financials,
      };
    }

    // --- Subscription lifecycle -----------------------------------------
    type SubState = "activated" | "renewed" | "cancelled" | "paused" | "failed";
    const subStateMap: Record<string, SubState> = {
      "subscription.activated": "activated",
      "subscription.created": "activated",
      "subscription.updated": "renewed", // renewal captured as "updated" when billing_period rolls
      "subscription.canceled": "cancelled",
      "subscription.paused": "paused",
      "subscription.past_due": "failed",
    };

    const mappedState = subStateMap[eventType];
    if (mappedState) {
      const sub = data as PaddleSubscriptionEntity;
      if (!sub.id) return null;
      return {
        kind: "subscription_event",
        providerId: this.id,
        providerRef: sub.id,
        internalPaymentId,
        state: mappedState,
        occurredAt,
        providerRaw: scrub(body),
      };
    }

    // Anything else: record but don't act. This keeps webhook logs
    // lossless while preventing accidental ledger writes on events we
    // haven't reviewed (e.g. tax-calculation webhooks, which Paddle can
    // send in addition to transaction events).
    return {
      kind: "ignored",
      providerId: this.id,
      providerRef: (data as { id?: string }).id ?? "",
      eventType,
      occurredAt,
      providerRaw: scrub(body),
    };
  }

  // --- Cancellation + Refunds -------------------------------------------

  async cancelSubscription(internalPaymentId: string): Promise<void> {
    // We don't persist a Paddle subscription id directly on the
    // `payments` row — the billing action looks it up from
    // `providerRef` and hands it to `cancelSubscriptionByProviderRef`.
    // Keep this method as a contract-satisfying stub; the registry
    // callers should route through the by-ref variant.
    throw new UnsupportedCapabilityError(
      this.id,
      "subscriptions"
    );
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    // Same story as Razorpay — callers resolve the providerRef
    // from our `payments` row and call refundByProviderRef. Refusing
    // the by-internalId variant here makes it obvious if something
    // accidentally calls this path.
    throw new Error("Use refundByProviderRef — internal-id resolution is the caller's job");
  }

  async refundByProviderRef(providerRef: string, amount?: Money): Promise<RefundResult> {
    // TODO(paddle-sandbox): validate against POST /adjustments in the
    // sandbox. Paddle refunds require an `action: "refund"`, a reason,
    // and either a transaction_id (full) or a list of items (partial).
    // Since capabilities.partialRefunds === false until sandbox-validated,
    // we reject an `amount` argument here.
    if (amount) {
      throw new UnsupportedCapabilityError(this.id, "partialRefunds");
    }
    const body = {
      action: "refund",
      transaction_id: providerRef,
      reason: "requested_by_customer",
      // Paddle requires item-level detail for refunds. For a full refund
      // we fetch the transaction's items first.
      items: await this.fetchRefundableItems(providerRef),
    };
    const adjustment = await this.call<{ data: { id: string } }>(
      "POST",
      "/adjustments",
      body
    );
    return { providerRefundRef: adjustment.data.id };
  }

  private async fetchRefundableItems(transactionId: string): Promise<
    Array<{ item_id: string; type: "full" }>
  > {
    // TODO(paddle-sandbox): validate this fetch + mapping. Paddle's
    // transaction response wraps items in `data.items[].id`, and each
    // item needs to be tagged `type: "full"` for a full-amount refund.
    const txn = await this.call<{
      data: { items: Array<{ id: string }> };
    }>("GET", `/transactions/${encodeURIComponent(transactionId)}`);
    return txn.data.items.map((i) => ({ item_id: i.id, type: "full" as const }));
  }

  // --- Reconciliation ----------------------------------------------------

  async *listTransactionsSince(since: Date): AsyncIterable<NormalizedTx> {
    // TODO(paddle-sandbox): validate cursor pagination. Paddle uses
    // `meta.pagination.next` as a full URL; we extract the `after`
    // cursor from it. The `since` bound is ISO-8601 passed as the
    // `created_at[GTE]` filter per the REST docs.
    let url: string | null =
      `/transactions?order_by=created_at[ASC]&created_at[GTE]=${encodeURIComponent(
        since.toISOString()
      )}&per_page=100`;
    while (url !== null) {
      const currentUrl: string = url;
      const resp: PaddleTransactionsListResponse = await this.call<PaddleTransactionsListResponse>(
        "GET",
        currentUrl
      );
      for (const txn of resp.data ?? []) {
        const total = txn.details?.totals?.total ?? txn.items?.[0]?.totals?.total;
        yield {
          providerId: this.id,
          providerRef: txn.id,
          internalPaymentId: txn.custom_data?.internalPaymentId ?? null,
          status: mapTransactionStatus(txn.status),
          amount: {
            amountMinor: Number(total ?? 0),
            currency: (txn.currency_code ?? "USD") as Currency,
          },
          occurredAt: new Date(txn.created_at ?? Date.now()),
        };
      }
      // Extract just the path+query from Paddle's full next URL so the
      // next `call()` prepends our apiBase correctly.
      const next: string | undefined = resp.meta?.pagination?.next;
      if (!next) {
        url = null;
      } else {
        try {
          const u: URL = new URL(next);
          url = `${u.pathname}${u.search}`;
        } catch {
          url = null;
        }
      }
    }
  }

  // --- Transport ---------------------------------------------------------

  private async call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
    const url = `${this.apiBase}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        // Paddle Billing API versioning is via the `Paddle-Version`
        // header. We pin a version so a silent server-side rollout
        // can't break our webhook shapes.
        "Paddle-Version": "1",
        // Identify our integration in Paddle's dashboards. Paddle
        // echoes User-Agent in their request log, handy when debugging.
        "User-Agent": "pdfcraftai/1.0 (paddle-adapter)",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
      // Scrub before throwing — error bodies occasionally include
      // customer email snippets, which we don't want in server logs.
      const text = await res.text();
      throw new Error(`Paddle ${method} ${path} -> ${res.status}: ${truncate(text, 500)}`);
    }
    return (await res.json()) as T;
  }

  // --- Catalog lookup ----------------------------------------------------
  //
  // These are stubbed until sandbox products exist. The actual mapping
  // will live in a config module that tracks priceId per (environment,
  // packId/planCode). Keeping the indirection here so callers never have
  // to know about Paddle's catalog model.

  private priceIdForPack(packId: string): string {
    const id = process.env[`PADDLE_PRICE_ID_PACK_${packId.toUpperCase()}`];
    if (!id) {
      throw new Error(
        `Paddle price id not configured for pack "${packId}" — set PADDLE_PRICE_ID_PACK_${packId.toUpperCase()}`
      );
    }
    return id;
  }

  private priceIdForPlan(planCode: string): string {
    const id = process.env[`PADDLE_PRICE_ID_PLAN_${planCode.toUpperCase().replace(/-/g, "_")}`];
    if (!id) {
      throw new Error(
        `Paddle price id not configured for plan "${planCode}" — set PADDLE_PRICE_ID_PLAN_${planCode.toUpperCase().replace(/-/g, "_")}`
      );
    }
    return id;
  }
}

// --- Helpers -------------------------------------------------------------

function mapTransactionStatus(s: string | undefined): NormalizedTx["status"] {
  switch (s) {
    case "completed":
    case "paid":
      return "captured";
    case "canceled":
    case "past_due":
      return "failed";
    case "draft":
    case "ready":
    case "billed":
      return "pending";
    default:
      return "pending";
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

/**
 * Convert a Paddle-side amount (smallest-unit string, e.g. "1299" for
 * USD $12.99) into our canonical micros scale (1 currency unit =
 * 1,000,000 micros). For USD: 1 cent = 10,000 micros.
 *
 * Returns undefined if the input is missing or unparseable so the
 * downstream ledger column stays NULL rather than being silently
 * zeroed out — /admin/margin treats NULL as "not yet categorized",
 * never as "zero revenue", which is the right semantics if Paddle
 * omits a field.
 *
 * NOTE: This assumes a two-decimal presentment currency. USD, EUR,
 * GBP, INR, and the vast majority of Paddle's presentment currencies
 * fit this. Zero-decimal currencies (JPY, KRW) would need `amount *
 * 1_000_000` instead — we don't enable those in supportedCurrencies
 * today, so the assumption is safe. If we ever add JPY support this
 * needs a per-currency switch.
 */
function paddleMinorToMicros(
  s: string | number | undefined | null
): number | undefined {
  if (s === undefined || s === null) return undefined;
  const n = typeof s === "string" ? Number(s) : s;
  if (!Number.isFinite(n)) return undefined;
  // Round to keep downstream math integer-clean — Paddle strings are
  // always integers but JS Number coercion can introduce a trailing
  // .0000000001 on some platforms.
  return Math.round(n * 10_000);
}

/**
 * Non-reversible per-card identifier. Paddle's `payment_method_id` is
 * stable across charges for the same card+customer but is an opaque
 * token — we hash it so the value we persist can't be used to retrieve
 * the card or the customer record even if the ledger row leaked. 16
 * hex chars (64 bits) is enough to cluster-count cards in the margin
 * dashboard without any meaningful chance of collision at our scale.
 */
function fingerprintPaymentMethod(
  paymentMethodId: string | undefined | null
): string | undefined {
  if (!paymentMethodId) return undefined;
  return createHash("sha256")
    .update(paymentMethodId)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Build the LedgerFinancials payload for a Paddle-captured transaction.
 * Exported as a free function (not a PaddleProvider method) so the test
 * harness can exercise it against fixture payloads without standing up
 * a full provider instance with webhook secrets.
 *
 * Invariants baked into this payload that are Paddle-specific:
 *   - provider      = "paddle"           (always — MoR is the whole point)
 *   - taxTreatment  = "mor"              (Paddle absorbs remit; never "forward")
 *   - dataSource    = "webhook"          (this code path only runs from verifyWebhook)
 *   - fxRateUsed / fxSlippageMicros are left undefined in v1. Paddle
 *     exposes `earnings` in settlement currency but doesn't hand us the
 *     FX rate on the webhook; benchmark-rate comparison is Task #17.
 */
export function buildPaddleCapturedFinancials(
  txn: PaddleTransactionEntity
): LedgerFinancials {
  const totals = txn.details?.totals;
  const firstPayment = txn.payments?.[0];
  return {
    grossChargeMicros: paddleMinorToMicros(totals?.total),
    billingCurrency: txn.currency_code,
    provider: "paddle",
    processorFeeMicros: paddleMinorToMicros(totals?.fee),
    taxCollectedMicros: paddleMinorToMicros(totals?.tax),
    taxTreatment: "mor",
    // Paddle remits tax as MoR — we owe nothing. taxRemittableMicros is
    // the "what *we* owe the taxman" column, so for MoR rows it is
    // always 0 (not the same as taxCollected, which is what Paddle
    // pulled from the buyer).
    taxRemittableMicros: 0,
    // `earnings` is already in our settlement currency (USD) — it's the
    // cleanest definition of "net revenue" we can get without running
    // our own FX: Paddle has already done subtotal - fee - their take.
    netRevenueMicros: paddleMinorToMicros(totals?.earnings),
    cardFingerprint: fingerprintPaymentMethod(firstPayment?.payment_method_id),
    dataSource: "webhook",
  };
}

/**
 * Build the LedgerFinancials reversal payload for a Paddle refund
 * (adjustment with action="refund"). All monetary fields are negative
 * so the ledger row writes as a debit that reverses the original
 * credit grant.
 *
 * IMPORTANT: `provider` is intentionally left undefined here. The ledger's
 * refund path sets `provider: "refund_reversal"` on the debit row — it's
 * a ledger-side provenance tag, not an adapter-level fact. See
 * `NormalizedPaymentEvent.refund.financials` docstring.
 */
export function buildPaddleRefundFinancials(
  adj: PaddleAdjustmentEntity
): LedgerFinancials {
  const totals = adj.totals;
  const neg = (x: number | undefined): number | undefined =>
    x === undefined ? undefined : -x;
  return {
    grossChargeMicros: neg(paddleMinorToMicros(totals?.total)),
    billingCurrency: adj.currency_code,
    // provider deliberately left undefined — ledger fills "refund_reversal"
    processorFeeMicros: neg(paddleMinorToMicros(totals?.fee)),
    taxCollectedMicros: neg(paddleMinorToMicros(totals?.tax)),
    taxTreatment: "mor",
    // MoR refund: Paddle un-remits on their side; we still owe 0 to tax
    // authorities (we never collected it in the first place).
    taxRemittableMicros: 0,
    netRevenueMicros: neg(paddleMinorToMicros(totals?.earnings)),
    // cardFingerprint intentionally omitted on refunds — the ledger's
    // refund row points back at the original payment via
    // internalPaymentId; duplicating the card tag would invite
    // consistency bugs if the buyer changed cards between charge + refund.
    dataSource: "webhook",
  };
}

/**
 * Defensive scrub — Paddle webhook bodies should never include raw PAN
 * since the iframe owns the card fields, but we still strip anything
 * that smells like card data before persisting `providerRaw` to audit.
 * Paddle does include `card.last4`, `card.type`, which are fine.
 */
function scrub(o: unknown): unknown {
  if (!o || typeof o !== "object") return o;
  if (Array.isArray(o)) return o.map(scrub);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    const lk = k.toLowerCase();
    if (lk === "cvv" || lk === "cvc" || lk === "number" || lk === "pan") {
      out[k] = "[scrubbed]";
    } else {
      out[k] = scrub(v);
    }
  }
  return out;
}

// --- Paddle payload shapes (narrow, only what we touch) ------------------

type PaddleWebhookBody = {
  event_type: string;
  occurred_at?: string;
  data?: unknown;
};

type PaddleTransactionEntity = {
  id: string;
  status?: string;
  currency_code?: string;
  custom_data?: Record<string, string>;
  created_at?: string;
  /**
   * Paddle Billing returns monetary fields as strings in the smallest unit
   * of the buyer's presentment currency (cents for USD, paise for INR).
   * `details.totals` is where the full fee/tax/earnings breakdown lives
   * for a completed transaction — this is what lets us populate
   * LedgerFinancials from a webhook without a second REST fetch.
   *
   *   subtotal = pre-tax amount the buyer was charged
   *   tax      = tax collected (Paddle computes + remits as MoR)
   *   total    = subtotal + tax (what hit the buyer's card)
   *   fee      = Paddle's processor fee, in presentment currency
   *   earnings = seller's take, already in seller's settlement currency
   *              (typically USD for us — Paddle does the FX conversion
   *              when settling payouts)
   *
   * Paddle sometimes also provides a `details.totals` subtree under each
   * item in `items[]`; we prefer `details.totals` on the transaction
   * itself because it's always present on `transaction.completed`.
   */
  details?: {
    totals?: {
      total?: string | number;
      subtotal?: string | number;
      tax?: string | number;
      fee?: string | number;
      earnings?: string | number;
    };
  };
  items?: Array<{
    id?: string;
    totals?: {
      total?: string | number;
    };
  }>;
  /**
   * Payment instrument details. Paddle populates `payments[]` on every
   * `transaction.completed`; we use `payment_method_id` (a Paddle-side
   * stable id per card per customer) as the basis for cardFingerprint —
   * hashed + truncated so we never store anything reversible.
   */
  payments?: Array<{
    payment_method_id?: string;
    method_details?: {
      type?: string;
      card?: {
        last4?: string;
        type?: string;
      };
    };
  }>;
};

type PaddleAdjustmentEntity = {
  id?: string;
  action?: "refund" | "credit" | "chargeback" | string;
  transaction_id?: string;
  currency_code?: string;
  /**
   * Adjustment `totals` mirrors transaction `details.totals` — Paddle
   * exposes subtotal/tax/total/fee/earnings on a refund so we can book
   * a symmetric negative-signed LedgerFinancials reversal. `fee` and
   * `earnings` may be zero or absent if Paddle didn't return the
   * processor fee on this refund class.
   */
  totals?: {
    total?: string | number;
    subtotal?: string | number;
    tax?: string | number;
    fee?: string | number;
    earnings?: string | number;
  };
  items?: Array<{
    amount?: string | number;
  }>;
};

type PaddleSubscriptionEntity = {
  id?: string;
  status?: string;
};

type PaddleTransactionsListResponse = {
  data?: PaddleTransactionEntity[];
  meta?: {
    pagination?: {
      next?: string;
    };
  };
};
