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
import { CREDIT_PACKS } from "@/lib/pricing";
import type { CreditPackId } from "@/lib/pricing";
import type { LedgerFinancials, NormalizedPaymentEvent } from "./types";

/**
 * Re-exported from ./types so existing callers that import
 * `LedgerFinancials` from "@/lib/payments/ledger" continue to work.
 * The type now lives in types.ts (Phase B / Task #16) so the Paddle
 * adapter can build the payload without pulling in the ledger module
 * and so `NormalizedPaymentEvent` can embed it on the event.
 */
export type { LedgerFinancials } from "./types";

// --- Pack lookup ----------------------------------------------------------

/**
 * Resolve the credits + bonus granted by a one-time pack. Returns null
 * for unknown packs (defensive — webhooks should only reference packs
 * we minted, but a corrupted payment row shouldn't silently grant zero).
 */
function packCredits(packId: string): { base: number; bonus: number } | null {
  const pack = CREDIT_PACKS.find((p) => p.id === (packId as CreditPackId));
  if (!pack) return null;
  return { base: pack.credits, bonus: pack.bonus ?? 0 };
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

  // Mark captured (idempotent via status check — re-running doesn't
  // re-update a refunded row into "captured").
  if (payment.status === "pending") {
    await db
      .update(schema.payments)
      .set({
        status: "captured",
        providerRef: event.providerRef,
      })
      .where(eq(schema.payments.id, event.internalPaymentId));
  }

  // Grant credits for one-time packs. Subscription captures hit a
  // different path — see handleSubscription.
  if (payment.mode === "one_time" && payment.packId) {
    const pack = packCredits(payment.packId);
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
    const baseResult = await grantCredits({
      userId: payment.userId,
      delta: pack.base,
      reason: "purchase",
      note: `Pack: ${payment.packId}`,
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
    const pack = packCredits(payment.packId);
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
      // didn't populate financials (non-Paddle adapters, or future
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
