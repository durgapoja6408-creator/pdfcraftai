// Phase D / Task #22 — dunning scaffold.
//
// Status: SCAFFOLD ONLY. We do not currently sell subscriptions in
// production, so there is no live dunning to do. Today every SKU is a
// one-shot credit pack — a charge either succeeds (credits land) or
// fails (no credits, no retry). This module exists so that when
// recurring plans ship (Phase E — annual prepay + monthly tiers) we
// don't discover at billing-time that nobody ever thought about
// "card declined on renewal".
//
// What dunning is, in one paragraph
// ---------------------------------
// When a recurring payment attempt fails, the provider will usually
// retry on its own schedule. While those
// retries happen, our side has a choice: do we keep the subscription
// entitled (AI credits topped up, plan features on) in the hope the
// retry succeeds, or do we instantly cut the user off? The
// middle-ground path is "dunning": the user stays entitled for a
// grace window while we surface progressively louder in-app messaging
// and email reminders, and if all retries ultimately fail we downgrade
// the account rather than silently leaving it broken.
//
// Why scaffold now if we don't sell subs
// --------------------------------------
// Two reasons:
//   1. Webhook shapes for billing.subscription.payment_failed /
//      subscription.past_due exist on Razorpay (and on most
//      international gateways). Our webhook handler (lib/payments/webhook-handler.ts)
//      would panic-log or silently drop those events today. Even with
//      zero live subscribers, a test event in sandbox produces noise.
//      Having a no-op `handleDunningEvent` gives the ingest a safe
//      pattern-matchable sink.
//   2. The admin-side /admin/chargebacks gap we just closed taught us
//      that "untracked lifecycle events become silent drift". Writing
//      the state machine down now — even as types + TODO — means
//      Phase E doesn't start from a blank page in a tense moment.
//
// Design notes for Phase E implementors
// -------------------------------------
// The model below is intentionally tiny — four states, one event
// type. Real dunning systems are more elaborate (per-retry policy,
// per-region grace periods, SCA challenge handling, multi-currency
// edge cases), but those belong with the feature, not in the
// scaffold. The shape here is meant to survive expansion:
//
//   - DunningState is serialised to JSON and stored on the user /
//     subscription row when we build it. Keep the enum string-stable.
//   - DunningEvent carries the raw provider event ID so the ledger
//     can cross-reference. No money moves in this file — ledger
//     entries only land via webhook-handler.ts once the retry
//     actually succeeds / finally fails.
//
// This module never writes to the DB today. It only exports the
// shapes + a pure reducer so the Phase E wiring can unit-test
// transitions without touching MySQL.

/**
 * Lifecycle states for a subscription's dunning posture.
 *
 * Ordered mentally as a funnel: current → past_due → suspended → cancelled.
 * A successful retry puts the user back to `current` from any of the
 * later states (subject to policy — we may decide a grace window
 * can't come back from `cancelled`).
 */
export type DunningState =
  | "current"
  /** Provider reported a failed charge. Account still entitled, grace window counting down. */
  | "past_due"
  /** Grace window elapsed. Features off, credits frozen (not debited). Retry could still rescue. */
  | "suspended"
  /** Provider has given up retrying. Final — subscription row closed out; no further retries expected. */
  | "cancelled";

/**
 * One provider-side billing lifecycle event that might move the
 * dunning state. Normalised across all supported providers.
 */
export type DunningEvent =
  | {
      kind: "payment_failed";
      /** Provider event ID for idempotency + audit. */
      providerEventId: string;
      /** UNIX ms when the provider fired the event. */
      occurredAtMs: number;
      /** Number of failures the provider has logged this cycle. */
      failedAttempts: number;
      /** UNIX ms the provider intends to retry next, or null if no further retry. */
      nextRetryAtMs: number | null;
    }
  | {
      kind: "payment_succeeded";
      providerEventId: string;
      occurredAtMs: number;
    }
  | {
      kind: "subscription_cancelled";
      providerEventId: string;
      occurredAtMs: number;
      /** Free-form cause (e.g. "user_requested", "retries_exhausted", "fraud_block"). */
      reason: string;
    };

/**
 * Stored dunning posture for a single subscription.
 */
export type DunningRow = {
  subscriptionId: string;
  state: DunningState;
  /** UNIX ms the current state began — drives grace-window math. */
  stateSinceMs: number;
  /** UNIX ms the provider intends to retry next, or null. */
  nextRetryAtMs: number | null;
  /** Count of failed charges in the current past_due / suspended streak. */
  failedAttempts: number;
  /** Last event we applied (for idempotency + audit). */
  lastProviderEventId: string | null;
};

/**
 * Grace window policy. These are the ONLY numbers a Phase E
 * implementor needs to tweak to change the user-visible behaviour.
 *
 * Kept as exported constants rather than env vars because changing
 * them mid-flight is a policy decision, not a deploy toggle.
 */
export const DUNNING_POLICY = {
  /** How long to stay entitled after the first failed charge. 3 days matches typical processor default retry windows. */
  gracePastDueMs: 3 * 24 * 60 * 60 * 1000,
  /** How long to hold `suspended` state before declaring the sub cancelled. */
  suspendedBeforeCancelMs: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Pure reducer. Given the current row and a new event, return the
 * row's next state without touching the DB.
 *
 * The reducer is idempotent on `providerEventId`: replaying the same
 * event yields the same row. Phase E wiring should persist
 * `lastProviderEventId` alongside the row so retried webhook
 * deliveries don't double-count failures.
 */
export function applyDunningEvent(
  row: DunningRow,
  event: DunningEvent
): DunningRow {
  // Idempotent replay.
  if (row.lastProviderEventId === event.providerEventId) return row;

  const base = { ...row, lastProviderEventId: event.providerEventId };

  switch (event.kind) {
    case "payment_succeeded":
      // Any successful charge clears the dunning posture.
      return {
        ...base,
        state: "current",
        stateSinceMs: event.occurredAtMs,
        nextRetryAtMs: null,
        failedAttempts: 0,
      };

    case "payment_failed": {
      // First failure → past_due; subsequent failures while already
      // past_due just update the retry hint + counter.
      if (row.state === "cancelled") {
        // Once cancelled, we don't revert to past_due on straggler
        // failures. The provider shouldn't retry a cancelled sub,
        // but guard anyway.
        return base;
      }
      const nowMs = event.occurredAtMs;
      const gracePastDueExpiresAt =
        (row.state === "past_due" ? row.stateSinceMs : nowMs) +
        DUNNING_POLICY.gracePastDueMs;
      // If the grace window already elapsed and we got another
      // failure, step down to suspended.
      const nextState: DunningState =
        row.state === "past_due" && nowMs >= gracePastDueExpiresAt
          ? "suspended"
          : row.state === "suspended"
          ? "suspended"
          : "past_due";
      return {
        ...base,
        state: nextState,
        stateSinceMs:
          nextState === row.state ? row.stateSinceMs : nowMs,
        nextRetryAtMs: event.nextRetryAtMs,
        failedAttempts: event.failedAttempts,
      };
    }

    case "subscription_cancelled":
      return {
        ...base,
        state: "cancelled",
        stateSinceMs: event.occurredAtMs,
        nextRetryAtMs: null,
      };
  }
}

/**
 * Initial row for a newly-created subscription. Used by Phase E
 * wiring when the subscription.created webhook fires.
 */
export function newDunningRow(
  subscriptionId: string,
  createdAtMs: number
): DunningRow {
  return {
    subscriptionId,
    state: "current",
    stateSinceMs: createdAtMs,
    nextRetryAtMs: null,
    failedAttempts: 0,
    lastProviderEventId: null,
  };
}

/**
 * Predicate: is this subscription still entitled to the features it
 * was paying for? Used by `/api/ai/*` route guards (eventually) to
 * decide whether a suspended-but-not-cancelled user can still consume
 * banked credits vs. being hard-gated.
 *
 * Today: `current` and `past_due` are entitled; `suspended` and
 * `cancelled` are not. This is conservative — a Phase E product
 * decision might soften `suspended` to "read-only" rather than hard
 * gate.
 */
export function isEntitled(row: DunningRow): boolean {
  return row.state === "current" || row.state === "past_due";
}

// TODO(Phase E): persist DunningRow to a `subscription_dunning` table
// keyed by subscriptionId. Wire from webhook-handler.ts on:
//   Razorpay: subscription.charged, subscription.pending, subscription.halted,
//             subscription.cancelled
// (When the next international gateway is added, map its subscription
// lifecycle events to the same DunningEvent shape.)
// Expose in /admin/dunning (new page) with a StatCard per state.
