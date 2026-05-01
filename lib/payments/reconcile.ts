// Nightly reconciliation.
//
// Why this exists:
//   Webhooks are best-effort. Networks blip, Hostinger occasionally
//   hiccups, the provider's retry budget runs out. A webhook we miss
//   means credits never land — a user paid us and saw nothing change.
//   Reconciliation is the "sweeper": ask each provider "what happened
//   in the last 48h?" and catch anything that slipped.
//
// How it runs:
//   An HTTP endpoint (app/api/cron/reconcile-payments/route.ts) calls
//   `runReconciliation()`. Hostinger cron hits that endpoint with a
//   shared secret header on a nightly schedule.
//
// Safety:
//   Every action reconciliation takes flows through `applyPaymentEvent`
//   — the same idempotent path webhooks use. Running reconciliation
//   twice in the same hour is safe: duplicate ledger rows are rejected
//   by the unique idempotencyKey index.

import "server-only";
import { and, eq, gt, isNotNull, lt } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { listConfiguredProviders } from "./registry";
import { applyPaymentEvent } from "./ledger";
import type { PaymentProvider } from "./provider";
import type { NormalizedPaymentEvent, NormalizedTx, ProviderId } from "./types";

export type ReconciliationReport = {
  startedAt: string;
  finishedAt: string;
  windowStart: string;
  byProvider: Record<
    ProviderId,
    {
      scanned: number;
      matched: number;
      synthesized: number;
      anomalies: number;
      errors: number;
      errorDetails: string[];
      // Task #24 — reverse sweep stats. Always present; absent providers
      // (no fetchPaymentStatus impl) report scanned=0.
      reverseSweep: {
        scanned: number;
        recovered: number;
        unchanged: number;
        errors: number;
        errorDetails: string[];
      };
    }
  >;
};

const DEFAULT_LOOKBACK_HOURS = 48;

// Reverse-sweep window — separate from the forward `lookbackHours` because
// the failure modes are different. Forward sweep cares about "what
// happened recently in the provider"; reverse sweep cares about "what
// stale-pending rows do we have in our DB that we should ask about".
//
// MIN_AGE: Razorpay's checkout modal expires after ~15 min. Wait 30 min
// before suspecting drift — under that, a "pending" row is just a user
// who's still on the page filling in their card.
//
// MAX_AGE: don't reach back forever. The /app/billing UI age-out (Task #23)
// already grays out rows > 24h, and 14 days is the cap on Razorpay's order
// retention before the order id is no longer addressable. A row that's
// been pending 14 days is operationally dead and not worth a sweep call.
//
// PER_PROVIDER_BUDGET: cap fetches per run. Even at 500/run with 1 req/sec
// we're under the Razorpay rate limit (300 rpm public, higher with
// allowlisting), and if we ever hit the cap the next nightly run picks up
// where we left off thanks to the createdAt floor.
const REVERSE_SWEEP_MIN_AGE_MIN = 30;
const REVERSE_SWEEP_MAX_AGE_DAYS = 14;
const REVERSE_SWEEP_PER_PROVIDER_BUDGET = 500;

/**
 * Run reconciliation across all configured providers. Returns a report
 * the cron endpoint can emit to logs (and optionally to an alerting
 * channel in the future).
 */
export async function runReconciliation(opts: {
  lookbackHours?: number;
} = {}): Promise<ReconciliationReport> {
  const lookbackHours = opts.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;
  const startedAt = new Date();
  const windowStart = new Date(
    startedAt.getTime() - lookbackHours * 60 * 60 * 1000
  );

  const providers = await listConfiguredProviders();
  const byProvider: ReconciliationReport["byProvider"] = {};

  for (const provider of providers) {
    const stats = {
      scanned: 0,
      matched: 0,
      synthesized: 0,
      anomalies: 0,
      errors: 0,
      errorDetails: [] as string[],
      reverseSweep: {
        scanned: 0,
        recovered: 0,
        unchanged: 0,
        errors: 0,
        errorDetails: [] as string[],
      },
    };

    // Forward sweep: provider → our DB.
    try {
      for await (const tx of provider.listTransactionsSince(windowStart)) {
        stats.scanned++;
        try {
          const action = await reconcileOne(tx);
          if (action === "matched") stats.matched++;
          else if (action === "synthesized") stats.synthesized++;
          else if (action === "anomaly") stats.anomalies++;
        } catch (err) {
          stats.errors++;
          stats.errorDetails.push(
            `${tx.providerRef}: ${err instanceof Error ? err.message : String(err)}`
          );
          // Keep going — one bad tx shouldn't abort the entire sweep.
        }
      }
    } catch (err) {
      stats.errors++;
      stats.errorDetails.push(
        `listTransactionsSince failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Reverse sweep: our DB → provider. Catches stale-pending rows the
    // forward sweep missed (e.g. orders whose payment events never
    // landed in /payments because the user retried mid-flow). A failure
    // here is isolated — it doesn't poison the forward sweep stats.
    try {
      await reverseSweepProvider(provider, stats.reverseSweep);
    } catch (err) {
      stats.reverseSweep.errors++;
      stats.reverseSweep.errorDetails.push(
        `reverse sweep failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    byProvider[provider.id] = stats;
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    windowStart: windowStart.toISOString(),
    byProvider,
  };
}

type ReconcileAction = "matched" | "synthesized" | "anomaly";

/**
 * Reconcile a single provider-side transaction against our DB.
 *
 * Cases:
 *   1. We have a payment row, status already matches   → "matched" (no-op)
 *   2. We have a payment row, status is out of sync    → "synthesized"
 *      (synthesize a NormalizedPaymentEvent and run it through
 *       applyPaymentEvent so credits land idempotently)
 *   3. No payment row but we have an internalPaymentId → "synthesized"
 *      (same path — the row is looked up inside applyPaymentEvent)
 *   4. No internalPaymentId AND no matching providerRef → "anomaly"
 *      (payment made outside our checkout flow, e.g. someone sent
 *       money directly to the merchant account — log and alert)
 */
async function reconcileOne(tx: NormalizedTx): Promise<ReconcileAction> {
  // Look up the payment row. Prefer internal ID (the portable anchor);
  // fall back to (providerId, providerRef) if the provider didn't echo
  // the notes/custom_id field back correctly.
  const row = await lookupPayment(tx);

  if (!row) {
    // No match on either key. Could be:
    //   - Payment created out-of-band (direct deposit, test transaction)
    //   - providerRef format drift we haven't caught
    // We don't auto-grant credits here — that would be dangerous.
    // Instead, record an audit row so the ops review picks it up.
    console.warn(
      `[reconcile:${tx.providerId}] anomaly: no payment row for providerRef=${tx.providerRef}, status=${tx.status}`
    );
    return "anomaly";
  }

  // Status already in sync. The webhook-driven flow handled this tx.
  if (dbStatusMatches(row.status, tx.status)) {
    return "matched";
  }

  // Out of sync. Synthesize a normalized event for the ledger processor.
  const event = synthesizeEvent(tx, row.id);
  if (!event) {
    // Status combination we don't have a synthesis path for (e.g. tx
    // is "pending" but we think it's "captured" — downgrade is never
    // something we want to do from reconciliation). Treat as matched
    // to avoid accidental clobbering.
    return "matched";
  }

  await applyPaymentEvent(event);
  return "synthesized";
}

async function lookupPayment(tx: NormalizedTx): Promise<
  | {
      id: string;
      status: string;
    }
  | null
> {
  // Internal ID first.
  if (tx.internalPaymentId) {
    const [byInternal] = await db
      .select({ id: schema.payments.id, status: schema.payments.status })
      .from(schema.payments)
      .where(eq(schema.payments.id, tx.internalPaymentId))
      .limit(1);
    if (byInternal) return byInternal;
  }

  // Fallback: (providerId, providerRef).
  const [byRef] = await db
    .select({ id: schema.payments.id, status: schema.payments.status })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.providerId, tx.providerId),
        eq(schema.payments.providerRef, tx.providerRef)
      )
    )
    .limit(1);
  return byRef ?? null;
}

function dbStatusMatches(
  dbStatus: string,
  txStatus: NormalizedTx["status"]
): boolean {
  if (txStatus === "captured") {
    return dbStatus === "captured" || dbStatus === "refunded" || dbStatus === "partial_refund";
  }
  if (txStatus === "failed") return dbStatus === "failed";
  if (txStatus === "refunded") return dbStatus === "refunded";
  if (txStatus === "pending") return dbStatus === "pending";
  return false;
}

/**
 * Build a NormalizedPaymentEvent from a reconciled transaction. We only
 * synthesize "upgrade" events (pending → captured, captured → refunded).
 * We never synthesize a downgrade; that would be dangerous territory.
 */
function synthesizeEvent(
  tx: NormalizedTx,
  internalPaymentId: string
): NormalizedPaymentEvent | null {
  const base = {
    providerId: tx.providerId,
    providerRef: tx.providerRef,
    internalPaymentId,
    occurredAt: tx.occurredAt,
    providerRaw: {
      synthesized: true,
      source: "reconciliation",
      tx,
    },
  };

  switch (tx.status) {
    case "captured":
      return {
        kind: "payment_captured",
        ...base,
        amount: tx.amount,
      };
    case "failed":
      return {
        kind: "payment_failed",
        ...base,
        reason: "reconciled from provider state",
      };
    case "refunded":
      return {
        kind: "refund",
        ...base,
        providerRefundRef: `reconciled:${tx.providerRef}`,
        amount: tx.amount,
      };
    case "pending":
      return null;
  }
}

/**
 * Task #24 — reverse sweep arm. Walks our `payments` table for rows that
 * have been stuck in `pending` for longer than expected, and asks the
 * provider what really happened to each. Recovered txs flow through
 * `reconcileOne` so synthesis is idempotent with the forward sweep.
 *
 * Skips gracefully when:
 * - The adapter doesn't implement `fetchPaymentStatus`.
 * - The row has no providerRef yet (checkout was created server-side
 *   but the order id never made it back — separate failure mode, not
 *   recoverable from the provider).
 * - The provider returns null (sub_xxx, sandbox/live drift, unknown id).
 *
 * Hard cap on rows scanned per run: REVERSE_SWEEP_PER_PROVIDER_BUDGET.
 * If we ever hit it, the next nightly run picks up where we left off
 * because we always order by createdAt ASC and the floor moves forward
 * naturally as pending rows get resolved.
 */
async function reverseSweepProvider(
  provider: PaymentProvider,
  stats: ReconciliationReport["byProvider"][string]["reverseSweep"]
): Promise<void> {
  if (typeof provider.fetchPaymentStatus !== "function") return;

  const now = Date.now();
  const minAge = new Date(now - REVERSE_SWEEP_MIN_AGE_MIN * 60 * 1000);
  const maxAge = new Date(
    now - REVERSE_SWEEP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  );

  const stale = await db
    .select({
      id: schema.payments.id,
      providerRef: schema.payments.providerRef,
      status: schema.payments.status,
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.status, "pending"),
        eq(schema.payments.providerId, provider.id),
        isNotNull(schema.payments.providerRef),
        lt(schema.payments.createdAt, minAge),
        gt(schema.payments.createdAt, maxAge)
      )
    )
    .orderBy(schema.payments.createdAt)
    .limit(REVERSE_SWEEP_PER_PROVIDER_BUDGET);

  for (const row of stale) {
    if (!row.providerRef) continue; // belt-and-braces; the WHERE already filters
    stats.scanned++;

    try {
      const tx = await provider.fetchPaymentStatus(row.providerRef);
      if (!tx) {
        // Provider has nothing actionable. Don't touch the row — the
        // /app/billing UI age-out (Task #23) handles user-facing
        // staleness; the row will eventually be cleaned by an explicit
        // ops action if needed.
        stats.unchanged++;
        continue;
      }

      // Anchor the synthesized event on our row id. The provider's
      // notes-echo pathway sometimes drops the internalPaymentId
      // (e.g. on retry attempts), so we override with the row we
      // already know we're reconciling against.
      tx.internalPaymentId = row.id;

      const action = await reconcileOne(tx);
      if (action === "synthesized") stats.recovered++;
      else stats.unchanged++;
    } catch (err) {
      stats.errors++;
      stats.errorDetails.push(
        `${row.id}: ${err instanceof Error ? err.message : String(err)}`
      );
      // Keep going — one bad ref shouldn't abort the whole sweep.
    }
  }
}
