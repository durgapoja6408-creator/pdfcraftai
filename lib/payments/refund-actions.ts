// Refund server actions for the /app/billing page.
//
// Policy (matches the public FAQ on /pricing):
//   Unused credits are refundable within 14 days of purchase. Consumed
//   credits are non-refundable. Eligibility is computed per *payment*,
//   not per user — the credits still sitting in the user's balance may
//   have come from multiple packs, so we can't cleanly say "refund pack
//   X" if the user has since spent half and bought another.
//
// Simplification (Phase 4 MVP): we prorate on a single payment at a
// time. The user can refund *up to* `min(pack.credits + pack.bonus,
// currentBalance)` credits worth of the original amount. Examples:
//   - User bought 100 credits for $5, hasn't spent any → refundable for
//     full $5.
//   - User bought 100 credits for $5, spent 30, balance is 70 →
//     refundable for $5 * 70/100 = $3.50 (70 credits' worth).
//   - User bought 100 credits for $5, spent all 100 → refundable for $0
//     (button is hidden in the UI).
//
// This keeps the math honest even when the user bought multiple packs:
// each pack is refunded only against the credits currently in-balance,
// and the ledger debit in handleRefund matches what we promise here.
//
// Security:
//   - Auth is enforced inside the action. The user can only refund their
//     own payments (ownership check on userId).
//   - The guard order matters: auth → ownership → status → age → balance.
//     Each failure has a distinct `error` code so the UI can render the
//     right message.
//   - We never trust the client on amount — the action recomputes the
//     refund $ from (balance, pack, original amount) server-side.
//
// The actual credit debit lands via the webhook (handleRefund in
// ledger.ts), which is idempotent on `${paymentId}:refund:${refundRef}`.
// This action only *initiates* the refund at the provider. If the user
// consumes credits between init and webhook arrival, the balance may go
// negative — that's accepted, documented in handleRefund's comment.

"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { and, eq } from "drizzle-orm";
import { CREDIT_PACKS, type CreditPackId } from "@/lib/pricing";
import { getProvider } from "./registry";
import type { Currency, Money } from "./types";

/**
 * Window during which an unused-credits refund is allowed. Public policy
 * on /pricing FAQ is "within 14 days of purchase"; we measure from the
 * payment's captured createdAt, not the user's signup.
 */
const REFUND_WINDOW_DAYS = 14;

export type RefundEligibility =
  | {
      eligible: true;
      /** How many credits are refundable (≤ pack.total, ≤ balance). */
      refundableCredits: number;
      /** How many $ (minor units) that works out to. */
      refundAmount: Money;
      /** Helpful context for the UI. */
      totalPackCredits: number;
      originalAmount: Money;
      /** ISO timestamp of when the refund window expires. */
      expiresAt: string;
    }
  | {
      eligible: false;
      reason:
        | "not_found"
        | "not_owner"
        | "not_captured"
        | "already_refunded"
        | "window_expired"
        | "no_credits_left"
        | "unknown_pack";
      message: string;
    };

export type RefundResultPublic =
  | { ok: true; providerRefundRef: string; refundedCredits: number }
  | {
      ok: false;
      error:
        | "not_authenticated"
        | "ineligible"
        | "provider_unavailable"
        | "provider_error";
      message: string;
      eligibility?: RefundEligibility;
    };

/**
 * Check whether a given payment can be refunded, and if so, how much.
 * Safe to call repeatedly — read-only.
 *
 * The /app/billing page uses this to decide whether to render the
 * "Request refund" button next to each payment row.
 */
export async function getRefundEligibilityAction(
  paymentId: string
): Promise<RefundEligibility> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;

  if (!userId) {
    return {
      eligible: false,
      reason: "not_owner",
      message: "Sign in to view refund eligibility.",
    };
  }

  return computeEligibility(paymentId, userId);
}

/**
 * Initiate a refund against the provider. On success, credits are NOT
 * immediately debited — the provider will send a webhook that lands in
 * handleRefund and does the actual ledger work.
 *
 * Returns the refundable credits count the user was quoted so the UI can
 * render an optimistic "refund pending" state.
 */
export async function requestRefundAction(
  paymentId: string
): Promise<RefundResultPublic> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;

  if (!userId) {
    return {
      ok: false,
      error: "not_authenticated",
      message: "Please sign in to request a refund.",
    };
  }

  const eligibility = await computeEligibility(paymentId, userId);
  if (!eligibility.eligible) {
    return {
      ok: false,
      error: "ineligible",
      message: eligibility.message,
      eligibility,
    };
  }

  // Look up the payment row again to get providerId + providerRef. We
  // already fetched it inside computeEligibility, but re-reading here
  // keeps this function the single source of truth for what we actually
  // send to the provider, and avoids shipping providerRef out through
  // RefundEligibility (which is returned to the client).
  const [payment] = await db
    .select({
      id: schema.payments.id,
      providerId: schema.payments.providerId,
      providerRef: schema.payments.providerRef,
      amountMinor: schema.payments.amountMinor,
      currency: schema.payments.currency,
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.id, paymentId),
        eq(schema.payments.userId, userId)
      )
    )
    .limit(1);

  if (!payment || !payment.providerRef) {
    // Belt-and-braces — computeEligibility would already have caught
    // this, but if something changed between the two reads we bail
    // rather than calling the provider with a bad ref.
    return {
      ok: false,
      error: "ineligible",
      message: "This payment can no longer be refunded.",
    };
  }

  const provider = await getProvider(payment.providerId);
  if (!provider) {
    return {
      ok: false,
      error: "provider_unavailable",
      message:
        "The payment provider is temporarily unavailable. Please try again in a few minutes.",
    };
  }

  if (!provider.capabilities.refunds) {
    return {
      ok: false,
      error: "provider_unavailable",
      message: "Refunds aren't supported by the payment provider used here.",
    };
  }

  // Is this a full refund? If the refundable amount equals the captured
  // amount, omit the amount field — some providers prefer that shape for
  // full refunds (Razorpay behaves the same either way; Paddle resolves
  // full refunds at item-level via POST /adjustments with action=refund).
  const isFullRefund =
    eligibility.refundAmount.amountMinor === payment.amountMinor;

  try {
    const result = await provider.refundByProviderRef(
      payment.providerRef,
      isFullRefund ? undefined : eligibility.refundAmount
    );

    // We intentionally do NOT write to `payments` or `credit_ledger`
    // here. The provider's webhook will arrive in handleRefund with the
    // confirmed amount, and that path is idempotent on providerRefundRef.
    // If we debited credits here *and* the webhook also fired, we'd
    // need to keep two idempotency schemes in sync — single-path is
    // simpler and safer.

    revalidatePath("/app/billing");
    return {
      ok: true,
      providerRefundRef: result.providerRefundRef,
      refundedCredits: eligibility.refundableCredits,
    };
  } catch (err) {
    console.error("[refund] provider.refundByProviderRef failed:", err);
    return {
      ok: false,
      error: "provider_error",
      message:
        "We couldn't complete the refund with the provider. Please try again, or contact support if this keeps happening.",
    };
  }
}

// --- Internals ------------------------------------------------------------

async function computeEligibility(
  paymentId: string,
  userId: string
): Promise<RefundEligibility> {
  const [payment] = await db
    .select({
      id: schema.payments.id,
      userId: schema.payments.userId,
      status: schema.payments.status,
      mode: schema.payments.mode,
      packId: schema.payments.packId,
      amountMinor: schema.payments.amountMinor,
      currency: schema.payments.currency,
      createdAt: schema.payments.createdAt,
    })
    .from(schema.payments)
    .where(eq(schema.payments.id, paymentId))
    .limit(1);

  if (!payment) {
    return {
      eligible: false,
      reason: "not_found",
      message: "We couldn't find that payment.",
    };
  }

  if (payment.userId !== userId) {
    // Don't leak existence — same copy as not_found.
    return {
      eligible: false,
      reason: "not_owner",
      message: "We couldn't find that payment.",
    };
  }

  // Only one-time captures are refundable via self-serve. Subscriptions
  // go through cancel-flow (handled in a separate action). Already-
  // refunded rows bail early.
  if (payment.mode !== "one_time") {
    return {
      eligible: false,
      reason: "already_refunded",
      message: "Subscription refunds are handled via subscription cancellation.",
    };
  }

  if (payment.status !== "captured") {
    if (payment.status === "refunded" || payment.status === "partial_refund") {
      return {
        eligible: false,
        reason: "already_refunded",
        message: "This payment has already been refunded.",
      };
    }
    return {
      eligible: false,
      reason: "not_captured",
      message: "Only completed payments are eligible for refund.",
    };
  }

  if (!payment.packId) {
    return {
      eligible: false,
      reason: "unknown_pack",
      message: "We couldn't match this payment to a credit pack.",
    };
  }

  const pack = CREDIT_PACKS.find(
    (p) => p.id === (payment.packId as CreditPackId)
  );
  if (!pack) {
    return {
      eligible: false,
      reason: "unknown_pack",
      message: "This credit pack is no longer available for refund.",
    };
  }

  // 14-day window. Inclusive of day 14 — the expiry instant is exactly
  // 14 days after the payment's captured timestamp.
  const ageMs = Date.now() - payment.createdAt.getTime();
  const windowMs = REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (ageMs > windowMs) {
    return {
      eligible: false,
      reason: "window_expired",
      message: `Refunds are only available within ${REFUND_WINDOW_DAYS} days of purchase.`,
    };
  }

  // Read the user's current balance. Proration cap is
  // min(packTotal, balance) — consumed credits are non-refundable.
  const [balanceRow] = await db
    .select({ balance: schema.credits.balance })
    .from(schema.credits)
    .where(eq(schema.credits.userId, userId))
    .limit(1);

  const balance = balanceRow?.balance ?? 0;
  const totalPackCredits = pack.credits + (pack.bonus ?? 0);
  const refundableCredits = Math.min(totalPackCredits, Math.max(balance, 0));

  if (refundableCredits <= 0) {
    return {
      eligible: false,
      reason: "no_credits_left",
      message:
        "No unused credits remain from this pack. Consumed credits are non-refundable.",
    };
  }

  // Refund amount in the same currency as the capture. Prorated on the
  // credit fraction; full pack refund bypasses the rounding so the
  // amountMinor matches the original exactly.
  const refundAmountMinor =
    refundableCredits === totalPackCredits
      ? payment.amountMinor
      : Math.floor(
          (refundableCredits / totalPackCredits) * payment.amountMinor
        );

  const expiresAt = new Date(
    payment.createdAt.getTime() + windowMs
  ).toISOString();

  return {
    eligible: true,
    refundableCredits,
    refundAmount: {
      amountMinor: refundAmountMinor,
      currency: payment.currency as Currency,
    },
    totalPackCredits,
    originalAmount: {
      amountMinor: payment.amountMinor,
      currency: payment.currency as Currency,
    },
    expiresAt,
  };
}
