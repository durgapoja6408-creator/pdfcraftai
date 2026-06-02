// Ledger writer — the single path for mutating credit balances.
//
// Two public functions:
//   1. grantCredits — low-level, idempotent, transactional. Writes one
//      ledger row AND updates the balance in a single MySQL transaction.
//      Uses the unique `idempotency_key` index to make replays no-ops.
//   2. applyPaymentEvent — high-level webhook processor. Takes a
//      NormalizedPaymentEvent, updates the `payments` row, and calls
//      grantCredits when a capture should fund credits.
//
// All provider-specific shapes stop at the webhook boundary. This file
// deals exclusively in internal references — paymentId, packId, userId.
// That's the portability guarantee: swap providers and this file never
// changes.

import "server-only";
import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
// 2026-05-04 (PENDING §4c automation) — wire subscription lifecycle
// events to drive the dunning state machine. The persist helper is
// idempotent on providerEventId so a re-delivered webhook no-ops at
// the dunning layer (independent of the audit-layer dedup that
// happens upstream in webhook-handler.ts). When recurring SKUs ship
// in Phase E, this dispatch path activates without further code
// changes — today it's dormant because no subscription events fire.
import { persistDunningEvent } from "./dunning";
import type { DunningEvent } from "./dunning";
import {
  CREDIT_PACKS,
  packCreditsForVariant,
  ANNUAL_MONTHS,
} from "@/lib/pricing";
import type { CreditPackId } from "@/lib/pricing";
import type { LedgerFinancials, NormalizedPaymentEvent } from "./types";

/**
 * Re-exported from ./types so existing callers that import
 * `LedgerFinancials` from "@/lib/payments/ledger" continue to work.
 * The type now lives in types.ts (Phase B / Task #16) so any
 * adapter can build the payload without pulling in the ledger module
 * and so `NormalizedPaymentEvent` can embed it on the event.
 */
export type { LedgerFinancials } from "./types";

// --- Pack lookup ----------------------------------------------------------

/**
 * Resolve the credits + bonus granted by a one-time pack. Returns null
 * for unknown packs (defensive — webhooks should only reference packs
 * we minted, but a corrupted payment row shouldn't silently grant zero).
 *
 * Task #27 / Phase E — `variant` defaults to "monthly" for backward
 * compatibility. Pre-0015 payment rows have `annualVariant = NULL` which
 * callers map to "monthly" here. Annual-variant rows get `paid * 12` via
 * packCreditsForVariant; the bonus stays × 1 (see ANNUAL_DISCOUNT_BPS
 * JSDoc for rationale). Returning a shape that's richer than the old
 * `{ base, bonus }` keeps the refund / chargeback paths honest too —
 * they compute `totalGranted = base + bonus` without needing to
 * re-derive the annual multiplier themselves.
 */
function packCredits(
  packId: string,
  variant: "monthly" | "annual" = "monthly"
): { base: number; bonus: number } | null {
  const pack = CREDIT_PACKS.find((p) => p.id === (packId as CreditPackId));
  if (!pack) return null;
  const { paid, bonus } = packCreditsForVariant(pack, variant);
  return { base: paid, bonus };
}

// --- grantCredits ---------------------------------------------------------

export type GrantCreditsInput = {
  userId: string;
  /** Positive to grant, negative to debit. Zero is a no-op. */
  delta: number;
  reason: string;
  note?: string;
  paymentId?: string;
  /**
   * Unique key across `credit_ledger`. If a row with this key already
   * exists the grant is skipped and `{ applied: false }` is returned.
   * Callers should derive this from internal (paymentId, event-kind) so
   * the same webhook replayed ten times grants credits exactly once.
   */
  idempotencyKey: string;
  /**
   * Optional net-margin columns (Phase B / Task #15). Omit for internal
   * grants / debits that don't correspond to a real payment capture.
   */
  financials?: LedgerFinancials;
  /**
   * 2026-05-02 plan §8 layer 6 — optional per-row expiry for time-locked
   * grants. NULL = never expires (the default for paid grants, refunds,
   * manual adjustments). When set (typically by grantSignupBonus()), a
   * nightly cleanup pass debits the row's `delta` back to zero past
   * this timestamp. See migration 0019.
   */
  expiresAt?: Date;
};

export type GrantCreditsResult =
  | { applied: true; ledgerId: string; newBalance: number }
  | { applied: false; reason: "duplicate" | "zero_delta" };

/**
 * Idempotent credit grant. Uses a MySQL transaction so the ledger row
 * and the balance update either both succeed or both roll back. The
 * unique `idempotency_key` index is what actually enforces exactly-once
 * semantics — we catch the duplicate-key error and report it as
 * `{ applied: false }`.
 */
export async function grantCredits(
  input: GrantCreditsInput
): Promise<GrantCreditsResult> {
  if (input.delta === 0) {
    return { applied: false, reason: "zero_delta" };
  }

  const ledgerId = randomUUID();

  try {
    const newBalance = await db.transaction(async (tx) => {
      // Insert the ledger row first. If the idempotencyKey collides the
      // transaction aborts via duplicate-key error and we return below.
      //
      // Phase B / Task #15: spread the optional `financials` payload into
      // the row so every column lands. `undefined` fields fall through to
      // DEFAULT NULL (migration 0012 made all new columns nullable).
      const fin = input.financials ?? {};
      await tx.insert(schema.creditLedger).values({
        id: ledgerId,
        userId: input.userId,
        delta: input.delta,
        reason: input.reason,
        note: input.note ?? null,
        paymentId: input.paymentId ?? null,
        idempotencyKey: input.idempotencyKey,
        grossChargeMicros: fin.grossChargeMicros ?? null,
        billingCurrency: fin.billingCurrency ?? null,
        provider: fin.provider ?? null,
        processorFeeMicros: fin.processorFeeMicros ?? null,
        taxCollectedMicros: fin.taxCollectedMicros ?? null,
        taxTreatment: fin.taxTreatment ?? null,
        taxRemittableMicros: fin.taxRemittableMicros ?? null,
        // drizzle-orm's decimal() accepts string to preserve precision.
        // Accept number too (dev convenience) — stringify before insert.
        fxRateUsed:
          fin.fxRateUsed === undefined || fin.fxRateUsed === null
            ? null
            : String(fin.fxRateUsed),
        fxSlippageMicros: fin.fxSlippageMicros ?? null,
        netRevenueMicros: fin.netRevenueMicros ?? null,
        cardFingerprint: fin.cardFingerprint ?? null,
        dataSource: fin.dataSource ?? null,
        // 2026-05-02 plan §8 layer 6 — set per-row expiry for time-
        // locked grants. NULL for everything else.
        expiresAt: input.expiresAt ?? null,
      });

      // Upsert the balance. `ON DUPLICATE KEY UPDATE` handles first-time
      // grants for users without a `credits` row yet (they come in via
      // register/first-login but defensively seed here too).
      await tx.execute(
        sql`
          INSERT INTO credits (user_id, balance, updated_at)
          VALUES (${input.userId}, ${input.delta}, NOW(3))
          ON DUPLICATE KEY UPDATE
            balance = balance + ${input.delta},
            updated_at = NOW(3)
        `
      );

      const [row] = await tx
        .select({ balance: schema.credits.balance })
        .from(schema.credits)
        .where(eq(schema.credits.userId, input.userId))
        .limit(1);
      return row?.balance ?? 0;
    });

    return { applied: true, ledgerId, newBalance };
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) {
      return { applied: false, reason: "duplicate" };
    }
    throw err;
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; errno?: number };
  // mysql2 surfaces ER_DUP_ENTRY as code "ER_DUP_ENTRY" / errno 1062.
  return e.code === "ER_DUP_ENTRY" || e.errno === 1062;
}

// --- applyPaymentEvent ----------------------------------------------------

export type ApplyEventResult =
  | { status: "processed"; grant?: GrantCreditsResult }
  | { status: "skipped"; reason: string }
  | { status: "error"; reason: string };

/**
 * Process a normalized webhook event. Intentionally side-effectful:
 *   - flips `payments.status` where appropriate
 *   - writes to `subscriptions` for lifecycle events
 *   - delegates to `grantCredits` for ledger mutations
 *   - logs the event to `webhook_events` for audit
 *
 * Idempotency: every path that touches the ledger routes through
 * `grantCredits` with a deterministic idempotencyKey
 * (`{paymentId}:{kind}`), so processing the same event twice is safe.
 */
export async function applyPaymentEvent(
  event: NormalizedPaymentEvent
): Promise<ApplyEventResult> {
  switch (event.kind) {
    case "payment_captured":
      return handleCaptured(event);
    case "payment_failed":
      return handleFailed(event);
    case "refund":
      return handleRefund(event);
    case "chargeback":
      return handleChargeback(event);
    case "subscription_event":
      return handleSubscription(event);
    case "ignored":
      return { status: "skipped", reason: `ignored:${event.eventType}` };
  }
}

async function handleCaptured(
  event: Extract<NormalizedPaymentEvent, { kind: "payment_captured" }>
): Promise<ApplyEventResult> {
  const [payment] = await db
    .select({
      id: schema.payments.id,
      userId: schema.payments.userId,
      mode: schema.payments.mode,
      packId: schema.payments.packId,
      status: schema.payments.status,
      currency: schema.payments.currency,
      // Task #21 — we need the prior providerRef + metadata so the
      // retry-promotion branch below can archive the losing pay_id into
      // metadata.priorAttempts[] without clobbering the existing route
      // metadata (routeRail/routeCountry/promoCode/…).
      providerRef: schema.payments.providerRef,
      metadata: schema.payments.metadata,
      // Task #27 / Phase E — promo + variant fields. Nullable on
      // pre-0015 rows; we coerce to sensible defaults below.
      annualVariant: schema.payments.annualVariant,
      promoCodeId: schema.payments.promoCodeId,
      promoDiscountMicros: schema.payments.promoDiscountMicros,
      promoBonusCredits: schema.payments.promoBonusCredits,
    })
    .from(schema.payments)
    .where(eq(schema.payments.id, event.internalPaymentId))
    .limit(1);

  if (!payment) {
    return {
      status: "error",
      reason: `no payment row for internalPaymentId=${event.internalPaymentId}`,
    };
  }

  // Status-transition guard (Task #21).
  //
  // Priority is **captured > failed > pending > refunded**. We allow
  // promotion from BOTH `pending → captured` (normal first-attempt
  // success) AND `failed → captured` (retry flow: Razorpay permits up
  // to ~7 payment attempts on one order_id — card fails, user pivots
  // to netbanking/UPI, same order captures on a different pay_id).
  //
  // Why `failed → captured` was missing before: the original guard
  // was `status === "pending"` only, so a prior `payment.failed`
  // webhook (which correctly flips pending → failed) would block the
  // later `payment.captured` event from updating the row — even
  // though credits WERE still granted downstream (idempotency key
  // `${paymentId}:base`). Net effect: credits correct, but
  // payments.status stuck at "failed" and providerRef pointed at
  // the losing attempt → /app/billing UI misleadingly showed
  // "Failed" for a successful purchase AND Razorpay-side
  // reconciliation couldn't match our DB ref to their captured
  // pay_id (broken chargeback / dispute lookup).
  //
  // Refunded/partial_refund rows are NEVER re-captured here — a
  // late `payment.captured` event arriving after a refund would be
  // provider weirdness and silently un-refunding is a real financial
  // bug. The credit grant below still runs and no-ops via
  // idempotency key if it really is a replay.
  if (payment.status === "pending" || payment.status === "failed") {
    // On retry-promotion, archive the losing pay_id into
    // metadata.priorAttempts[] so dispute/chargeback lookups can
    // trace every attempt against this order. Each entry captures
    // the provider ref, the normalized outcome, and a timestamp.
    const priorMeta =
      payment.metadata && typeof payment.metadata === "object"
        ? (payment.metadata as Record<string, unknown>)
        : {};
    const priorAttempts = Array.isArray(priorMeta.priorAttempts)
      ? [...(priorMeta.priorAttempts as unknown[])]
      : [];
    if (
      payment.status === "failed" &&
      payment.providerRef &&
      payment.providerRef !== event.providerRef
    ) {
      priorAttempts.push({
        providerRef: payment.providerRef,
        outcome: "failed",
        promotedAt: new Date().toISOString(),
      });
    }

    await db
      .update(schema.payments)
      .set({
        status: "captured",
        providerRef: event.providerRef,
        // Merge: keep all existing metadata keys (routeRail, promoCode,
        // etc.) and only update priorAttempts. Drizzle's json() column
        // handles serialization — pass the plain object.
        metadata: { ...priorMeta, priorAttempts },
      })
      .where(eq(schema.payments.id, event.internalPaymentId));
  }

  // Grant credits for one-time packs. Subscription captures hit a
  // different path — see handleSubscription.
  if (payment.mode === "one_time" && payment.packId) {
    const variant: "monthly" | "annual" =
      Number(payment.annualVariant ?? 0) === 1 ? "annual" : "monthly";
    const pack = packCredits(payment.packId, variant);
    if (!pack) {
      return {
        status: "error",
        reason: `unknown packId ${payment.packId} on payment ${payment.id}`,
      };
    }

    // Base credits: idempotency keyed on paymentId + "base".
    //
    // Phase B / Task #16 — attribute the full payment's LedgerFinancials
    // to the BASE row only. The base row is the canonical per-payment
    // representation in /admin/margin aggregates; putting the same
    // gross/fee/tax/net breakdown on the bonus row below would double-
    // count it. Bonus rows carry NULL financials — /admin/margin treats
    // that as "internal allocation, not revenue" (see Task #15 docs for
    // the "NULL means not categorized, never zero revenue" semantics).
    //
    // Task #27: `pack.base` is already variant-adjusted (× 12 for
    // annual) via packCreditsForVariant — we don't multiply here.
    const baseResult = await grantCredits({
      userId: payment.userId,
      delta: pack.base,
      reason: variant === "annual" ? "purchase_annual" : "purchase",
      note:
        variant === "annual"
          ? `Pack: ${payment.packId} (annual × ${ANNUAL_MONTHS})`
          : `Pack: ${payment.packId}`,
      paymentId: payment.id,
      idempotencyKey: `${payment.id}:base`,
      financials: event.financials,
    });

    // Bonus credits (if the pack ships with any): separate ledger row
    // so /app/billing can show "500 credits + 25 bonus" cleanly and so
    // the 30-day bonus expiry rule is trivial to enforce later. No
    // financials payload — see comment above.
    if (pack.bonus > 0) {
      await grantCredits({
        userId: payment.userId,
        delta: pack.bonus,
        reason: "bonus",
        note: `Bonus for pack ${payment.packId} (expires 30d)`,
        paymentId: payment.id,
        idempotencyKey: `${payment.id}:bonus`,
      });
    }

    // Task #27 / Phase E — promo redemption audit + bonus-credits
    // grant. We write the promo_redemptions row BEFORE the bonus
    // credits grant so if the credit grant transiently fails, a
    // retry finds the redemption row (unique on paymentId) and skips
    // the second write. The inner grantCredits call is itself
    // idempotent on the paymentId + reason key.
    const promoBonus = Number(payment.promoBonusCredits ?? 0);
    if (payment.promoCodeId) {
      try {
        await db.insert(schema.promoRedemptions).values({
          id: randomUUID(),
          promoCodeId: payment.promoCodeId,
          userId: payment.userId,
          paymentId: payment.id,
          discountMicros: Number(payment.promoDiscountMicros ?? 0),
          bonusCredits: promoBonus,
          currency: String(payment.currency),
          packId: payment.packId,
          annualVariant: variant === "annual" ? 1 : 0,
        });
      } catch (err: unknown) {
        // Duplicate-key on paymentIdx means we already recorded this
        // redemption on a prior webhook delivery — that's the intended
        // idempotent outcome, not an error.
        if (!isDuplicateKeyError(err)) {
          // Anything else is a real integrity failure; bubble up so
          // the webhook handler can decide (retry vs. /admin/alarms).
          throw err;
        }
      }

      // Grant the bonus_credits-kind extra credits, if any. Money-off
      // codes have promoBonus = 0 and this is a no-op.
      if (promoBonus > 0) {
        await grantCredits({
          userId: payment.userId,
          delta: promoBonus,
          reason: "promo_bonus",
          note: `Promo bonus credits on payment ${payment.id}`,
          paymentId: payment.id,
          idempotencyKey: `${payment.id}:promo_bonus`,
        });
      }
    }

    // PENDING §3e Phase E final (2026-05-05) — fire the REFERRER's
    // reward when their referred user makes a purchase. The trigger
    // is idempotent on referrer_rewarded_at, so calling on every
    // capture (not just first) only grants on the first one. No-op
    // when REFERRALS_ENABLED is off OR when the user has no
    // referral_signups row.
    //
    // Failure swallowed deliberately: the payment processed
    // successfully + the buyer got their credits. A referral-reward
    // failure is a downstream concern that shouldn't block the
    // webhook ack (which would cause Razorpay/Paddle to retry the
    // capture and double-grant the buyer). We log structured for
    // ops visibility.
    try {
      const { triggerReferrerReward } = await import(
        "@/lib/referrals/rewards"
      );
      await triggerReferrerReward(payment.userId);
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "payment_captured_referral_grant_failed",
          paymentId: payment.id,
          userId: payment.userId,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        }),
      );
    }

    return { status: "processed", grant: baseResult };
  }

  // Subscription capture is handled by the subscription event flow.
  return { status: "processed" };
}

async function handleFailed(
  event: Extract<NormalizedPaymentEvent, { kind: "payment_failed" }>
): Promise<ApplyEventResult> {
  const [payment] = await db
    .select({ id: schema.payments.id, status: schema.payments.status })
    .from(schema.payments)
    .where(eq(schema.payments.id, event.internalPaymentId))
    .limit(1);

  if (!payment) {
    return {
      status: "error",
      reason: `no payment row for internalPaymentId=${event.internalPaymentId}`,
    };
  }

  // Only mark failed if still pending — don't overwrite a later capture.
  if (payment.status === "pending") {
    await db
      .update(schema.payments)
      .set({ status: "failed", providerRef: event.providerRef })
      .where(eq(schema.payments.id, event.internalPaymentId));
  }
  return { status: "processed" };
}

async function handleRefund(
  event: Extract<NormalizedPaymentEvent, { kind: "refund" }>
): Promise<ApplyEventResult> {
  const [payment] = await db
    .select({
      id: schema.payments.id,
      userId: schema.payments.userId,
      mode: schema.payments.mode,
      packId: schema.payments.packId,
      amountMinor: schema.payments.amountMinor,
      status: schema.payments.status,
      // Task #27 - so proration uses the SAME total handleCaptured granted.
      // Annual captures grant base x12; without this a full refund would
      // only claw back the monthly base (~1/12th).
      annualVariant: schema.payments.annualVariant,
    })
    .from(schema.payments)
    .where(eq(schema.payments.id, event.internalPaymentId))
    .limit(1);

  if (!payment) {
    return {
      status: "error",
      reason: `no payment row for refund on internalPaymentId=${event.internalPaymentId}`,
    };
  }

  const isPartial = event.amount.amountMinor < payment.amountMinor;
  await db
    .update(schema.payments)
    .set({ status: isPartial ? "partial_refund" : "refunded" })
    .where(eq(schema.payments.id, event.internalPaymentId));

  // Task #54: the 14-day unused-credits policy is enforced *before* we
  // ever fire the provider refund (see lib/payments/refund-actions.ts —
  // it computes the refundable $ from the user's remaining balance).
  // Here, once the webhook lands, we trust `event.amount` and debit
  // credits proportionally — i.e. whatever fraction of the original
  // capture was refunded, debit the same fraction of the total credits
  // we originally granted (base + bonus, since both were funded by this
  // payment).
  //
  // Why prorate on the granted total rather than on the *remaining
  // balance*: the remaining balance can drift between when the refund
  // is initiated and when this webhook arrives — the user could consume
  // credits in between. Prorating on the original grant keeps the
  // ledger deterministic and idempotent, and the refund-action's
  // pre-flight guard already ensured we're not refunding more than the
  // user still has available.
  //
  // Balance can go negative if the user consumed credits between the
  // refund init and the webhook. That's rare and we accept it — a
  // negative balance just means "next top-up pays down the overdraft".
  if (payment.mode === "one_time" && payment.packId) {
    // Match the capture's variant so totalGranted equals what was granted
    // (annual = base x12 + bonus). See SELECT note above.
    const variant: "monthly" | "annual" =
      Number(payment.annualVariant ?? 0) === 1 ? "annual" : "monthly";
    const pack = packCredits(payment.packId, variant);
    if (!pack) {
      return {
        status: "error",
        reason: `unknown packId ${payment.packId} on refund of ${payment.id}`,
      };
    }

    const totalGranted = pack.base + pack.bonus;
    // Proration: round to nearest credit. Full refunds pass through
    // cleanly (event.amount === payment.amountMinor → totalGranted).
    const creditsToDebit =
      event.amount.amountMinor >= payment.amountMinor
        ? totalGranted
        : Math.round(
            (event.amount.amountMinor / payment.amountMinor) * totalGranted
          );

    if (creditsToDebit > 0) {
      // Phase B / Task #16 — thread the refund's negative-signed
      // financials through. The adapter leaves `provider` undefined on
      // refund events by convention; here at the ledger we tag the
      // debit row with "refund_reversal" so /admin/margin can
      // distinguish a refund reversal from the original charge even
      // though both rows reference the same paymentId. If the adapter
      // didn't populate financials (manual entries, or future
      // adapters that can't reconstruct the breakdown) we still land
      // the provenance tag so the row isn't classified as "not
      // categorized" — a refund with no financial detail is still
      // meaningfully a refund_reversal.
      const refundFinancials: LedgerFinancials = {
        ...(event.financials ?? {}),
        provider: "refund_reversal",
      };

      await grantCredits({
        userId: payment.userId,
        delta: -creditsToDebit,
        reason: "refund",
        note: `Refund ${event.providerRefundRef} (${
          isPartial ? "partial" : "full"
        })`,
        paymentId: payment.id,
        // providerRefundRef uniquely identifies the refund — a single
        // payment can have multiple partial refunds, each with their
        // own debit row, so this key scheme handles them naturally.
        idempotencyKey: `${payment.id}:refund:${event.providerRefundRef}`,
        financials: refundFinancials,
      });
    }
  }

  return { status: "processed" };
}

/**
 * Handle a chargeback webhook. Phase D / Task #22.
 *
 * Flow mirrors handleRefund but with three material differences:
 *
 *   1. Credit debit scope: chargebacks debit ALL granted credits from
 *      the original payment (base + bonus), regardless of whether the
 *      user has consumed some. Rationale: a chargeback means the bank
 *      reversed the capture; we cannot treat already-consumed credits
 *      as "paid for" since the underlying payment has been clawed back.
 *      Balance can and should go negative; the next top-up pays it down.
 *      Partial chargebacks are rare on card schemes but we still prorate
 *      by amount fraction for defensiveness.
 *
 *   2. Ledger row tag: `provider: "chargeback_reversal"` instead of
 *      `"refund_reversal"` so /admin/chargebacks and /admin/refunds
 *      render honest, non-overlapping totals. /admin/margin reads both
 *      tags as negative revenue and computes net margin correctly.
 *
 *   3. payments.status: we flip to "refunded" / "partial_refund" just
 *      like a refund. Rationale: the payments.status enum doesn't yet
 *      have a "chargeback" value (would require a migration), and
 *      semantically the money state is equivalent — funds reversed.
 *      The distinction between user-initiated refund and bank-initiated
 *      chargeback lives in credit_ledger.provider and webhook_events,
 *      which is where an operator needs it for dispute prep anyway.
 *      A future migration can promote this to a dedicated enum value.
 *
 * Idempotent via `${paymentId}:chargeback:${providerChargebackRef}`, so
 * replayed webhook events and any chargeback_warning → chargeback
 * progression (two distinct adjustment ids for what may feel like "the
 * same" dispute) each land their own row correctly.
 */
async function handleChargeback(
  event: Extract<NormalizedPaymentEvent, { kind: "chargeback" }>
): Promise<ApplyEventResult> {
  const [payment] = await db
    .select({
      id: schema.payments.id,
      userId: schema.payments.userId,
      mode: schema.payments.mode,
      packId: schema.payments.packId,
      amountMinor: schema.payments.amountMinor,
      status: schema.payments.status,
      // Task #27 - same annual-variant fix as handleRefund: an annual
      // capture granted base x12, so a chargeback must claw back base x12.
      annualVariant: schema.payments.annualVariant,
    })
    .from(schema.payments)
    .where(eq(schema.payments.id, event.internalPaymentId))
    .limit(1);

  if (!payment) {
    return {
      status: "error",
      reason: `no payment row for chargeback on internalPaymentId=${event.internalPaymentId}`,
    };
  }

  const isPartial = event.amount.amountMinor < payment.amountMinor;
  // Flip to refunded/partial_refund. Chargeback-specific status is out
  // of scope until the enum migration — see function docstring.
  await db
    .update(schema.payments)
    .set({ status: isPartial ? "partial_refund" : "refunded" })
    .where(eq(schema.payments.id, event.internalPaymentId));

  if (payment.mode === "one_time" && payment.packId) {
    // Match the capture's variant so the clawback equals what was granted
    // (annual = base x12 + bonus). See SELECT note above.
    const variant: "monthly" | "annual" =
      Number(payment.annualVariant ?? 0) === 1 ? "annual" : "monthly";
    const pack = packCredits(payment.packId, variant);
    if (!pack) {
      return {
        status: "error",
        reason: `unknown packId ${payment.packId} on chargeback of ${payment.id}`,
      };
    }

    const totalGranted = pack.base + pack.bonus;
    // Chargeback debit: always proportional to the amount reversed.
    // Full chargeback (amount >= original) → debit everything granted.
    // Partial (rare) → prorate. Crucially, UNLIKE refunds we don't cap
    // at the remaining balance — the money is gone, so the credits
    // backing it must go too, even if the user already spent some.
    // Balance going negative is the correct ops signal (see docstring).
    const creditsToDebit =
      event.amount.amountMinor >= payment.amountMinor
        ? totalGranted
        : Math.round(
            (event.amount.amountMinor / payment.amountMinor) * totalGranted
          );

    if (creditsToDebit > 0) {
      const chargebackFinancials: LedgerFinancials = {
        ...(event.financials ?? {}),
        provider: "chargeback_reversal",
      };

      const noteParts = [
        `Chargeback ${event.providerChargebackRef}`,
        isPartial ? "partial" : "full",
      ];
      if (event.reason) noteParts.push(`reason: ${event.reason}`);

      await grantCredits({
        userId: payment.userId,
        delta: -creditsToDebit,
        // credit_ledger.reason is varchar(64), not an enum — free-form.
        // Using a distinct value from "refund" here lets downstream
        // reporting (and an operator eyeballing the ledger) tell a
        // user-initiated refund apart from a bank-initiated chargeback
        // even when the financials shape is identical.
        reason: "chargeback",
        note: noteParts.join(" · "),
        paymentId: payment.id,
        // Distinct idempotency key prefix from refunds so a chargeback
        // on a payment that was also partially refunded doesn't collide.
        idempotencyKey: `${payment.id}:chargeback:${event.providerChargebackRef}`,
        financials: chargebackFinancials,
      });
    }
  }

  return { status: "processed" };
}

async function handleSubscription(
  event: Extract<NormalizedPaymentEvent, { kind: "subscription_event" }>
): Promise<ApplyEventResult> {
  // Find the subscription by its linked payment row.
  const [payment] = await db
    .select({
      id: schema.payments.id,
      userId: schema.payments.userId,
      subscriptionId: schema.payments.subscriptionId,
      planCode: schema.payments.planCode,
    })
    .from(schema.payments)
    .where(eq(schema.payments.id, event.internalPaymentId))
    .limit(1);

  if (!payment || !payment.subscriptionId) {
    return {
      status: "error",
      reason: `no subscription linked to payment ${event.internalPaymentId}`,
    };
  }

  const nextStatus = mapSubscriptionStatus(event.state);
  await db
    .update(schema.subscriptions)
    .set({
      status: nextStatus,
      cancelledAt: event.state === "cancelled" ? event.occurredAt : null,
    })
    .where(
      and(
        eq(schema.subscriptions.id, payment.subscriptionId),
        eq(schema.subscriptions.userId, payment.userId)
      )
    );

  // 2026-05-04 (PENDING §4c automation) — drive the dunning state
  // machine alongside the subscriptions.status update. Two reasons
  // these need separate persistence paths:
  //   1. subscriptions.status is a single canonical contract field;
  //      dunning posture is an observation log keyed on a different
  //      lifecycle (grace windows, retry counters) that may diverge
  //      from contract status briefly during a failed-payment
  //      retry sequence.
  //   2. Phase E may extend `subscriptions.status` with new values
  //      (e.g. "trialing") that don't map cleanly onto the existing
  //      4-state dunning machine — keeping them orthogonal lets each
  //      evolve independently.
  //
  // The mapping is deliberately partial: paused state has no dunning
  // event today because it's a user-initiated pause, not a payment
  // failure. activated/renewed both clear the dunning posture (state
  // returns to "current"). failed advances; cancelled finalizes.
  //
  // The ledger layer's idempotency comes from `persistDunningEvent`'s
  // own replay guard (lastProviderEventId equality check). The webhook
  // audit-layer dedup upstream in handleWebhook handles the SAME event
  // delivered twice; this layer additionally handles the case where
  // the subscription transition gets driven from a non-webhook path
  // (e.g. an admin manually flipping status) and we want the dunning
  // log to skip it.
  const dunningEvent: DunningEvent | null = mapSubscriptionStateToDunning(
    event.state,
    event.providerRef,
    event.occurredAt.getTime(),
  );
  if (dunningEvent) {
    try {
      await persistDunningEvent(payment.subscriptionId, dunningEvent);
    } catch (err) {
      // Dunning persistence failure MUST NOT abort subscription status
      // update — they're separate contracts. Log + swallow. The
      // contract is: subscriptions.status is the source of truth for
      // entitlement; dunning is the observation log. If dunning misses
      // an event, /admin/dunning will be slightly stale but
      // subscriptions.status is still correct.
      console.warn(
        `[ledger:subscription] persistDunningEvent failed for ` +
          `subscription ${payment.subscriptionId}:`,
        err,
      );
    }
  }

  // Subscription activation / renewal grant is a separate path — Task
  // #53 wires /pricing Plus plan to a planCode → credits map. For now
  // we just track status transitions.
  return { status: "processed" };
}

function mapSubscriptionStatus(
  state: "activated" | "renewed" | "cancelled" | "paused" | "failed"
): "active" | "paused" | "cancelled" | "failed" {
  switch (state) {
    case "activated":
    case "renewed":
      return "active";
    case "paused":
      return "paused";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
  }
}

/**
 * 2026-05-04 (PENDING §4c automation) — map normalized subscription
 * state to a DunningEvent for the dunning state machine. Returns null
 * for states that don't drive dunning posture (today: "paused").
 *
 * Mapping rationale:
 *   - activated / renewed → payment_succeeded: any successful charge
 *     clears the dunning posture (state returns to "current").
 *   - failed → payment_failed: advances posture toward suspended.
 *     failedAttempts defaults to 1 because the normalized event
 *     doesn't yet carry a retry counter — adapter-level support for
 *     Razorpay's `attempts` field is a Phase E refinement. nextRetryAtMs
 *     is null for the same reason: until the adapter parses provider-
 *     specific retry hints, the reducer falls through to its grace-
 *     window defaults from DUNNING_POLICY.
 *   - cancelled → subscription_cancelled: final state. reason field
 *     defaults to "provider_lifecycle" (we don't yet distinguish
 *     "user_requested" vs "retries_exhausted" vs "fraud_block" in the
 *     normalized event).
 *   - paused → null: user-initiated pauses aren't dunning events.
 *     /admin/dunning shows the user as "current" until a real failed
 *     charge fires, which is correct.
 */
function mapSubscriptionStateToDunning(
  state: "activated" | "renewed" | "cancelled" | "paused" | "failed",
  providerEventId: string,
  occurredAtMs: number,
): DunningEvent | null {
  switch (state) {
    case "activated":
    case "renewed":
      return {
        kind: "payment_succeeded",
        providerEventId,
        occurredAtMs,
      };
    case "failed":
      return {
        kind: "payment_failed",
        providerEventId,
        occurredAtMs,
        failedAttempts: 1,
        nextRetryAtMs: null,
      };
    case "cancelled":
      return {
        kind: "subscription_cancelled",
        providerEventId,
        occurredAtMs,
        reason: "provider_lifecycle",
      };
    case "paused":
      return null;
  }
}

// --- webhook event audit --------------------------------------------------

/**
 * Persist a raw-but-scrubbed webhook payload for audit. Called by every
 * webhook route AFTER signature verification and BEFORE applyPaymentEvent.
 * Dedupes on (providerId, providerEventId) so replayed webhooks become
 * no-ops at this layer too.
 */
export async function recordWebhookEvent(input: {
  providerId: string;
  providerEventId: string;
  eventType: string;
  normalizedKind: string;
  paymentId?: string | null;
  rawPayload: unknown;
}): Promise<{ recorded: boolean }> {
  const id = randomUUID();
  try {
    await db.insert(schema.webhookEvents).values({
      id,
      providerId: input.providerId,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      normalizedKind: input.normalizedKind,
      paymentId: input.paymentId ?? null,
      rawPayload: input.rawPayload as object,
    });
    return { recorded: true };
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) {
      return { recorded: false };
    }
    throw err;
  }
}
