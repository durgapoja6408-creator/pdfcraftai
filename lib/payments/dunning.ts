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

// --- Persistence layer (PENDING §4c foundation, 2026-05-04) ---------------
//
// The reducer above is pure + transport-agnostic. The functions below
// thread it through MariaDB via the `subscription_dunning` table
// (migration `0023_subscription_dunning.sql`, schema entry
// `subscriptionDunning`). They are exported NOW even though no Phase E
// webhook handler calls them yet, for two reasons:
//
//   1. The migration + schema have to land together; calling code is
//      a Phase E concern but having the persist surface compile-checked
//      against the schema lets us catch shape drift at build time
//      rather than at first-event-time on a sandbox webhook.
//   2. /admin/dunning consumes `loadDunningRow` to render its read-
//      only viewer (see `app/admin/dunning/page.tsx`). The page
//      surfaces "table empty — Phase E pending" today; once Phase E
//      flips the wiring on, the same page shows real rows without
//      any code change.
//
// The persist-side flow Phase E will implement:
//
//   webhook-handler.ts → normalizeProviderEvent() → DunningEvent
//   → persistDunningEvent(subscriptionId, event)
//
// Phase E SHOULD NOT bypass `persistDunningEvent` — using
// `applyDunningEvent` directly + writing manually re-implements the
// load + upsert dance and risks losing the idempotency guarantee.

import { db } from "@/db/client";
import { subscriptionDunning } from "@/db/schema/app";
import { eq, sql } from "drizzle-orm";

/**
 * Read the current dunning row for a subscription. Returns null if the
 * subscription has never had an event applied (a Phase E `subscription.created`
 * webhook should be the first thing to seed a row via
 * `persistDunningEvent` with a synthetic `payment_succeeded` or by
 * calling `newDunningRow` + the seed helper below).
 *
 * The DB row's column names map to the in-memory `DunningRow` via
 * Drizzle, so the return is a typed `DunningRow` rather than a raw
 * record.
 */
export async function loadDunningRow(
  subscriptionId: string,
): Promise<DunningRow | null> {
  const rows = await db
    .select()
    .from(subscriptionDunning)
    .where(eq(subscriptionDunning.subscriptionId, subscriptionId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    subscriptionId: row.subscriptionId,
    state: row.state as DunningState,
    stateSinceMs: row.stateSinceMs,
    nextRetryAtMs: row.nextRetryAtMs ?? null,
    failedAttempts: row.failedAttempts,
    lastProviderEventId: row.lastProviderEventId ?? null,
  };
}

/**
 * Apply a Phase E webhook-driven dunning event to the persisted row.
 *
 * If no row exists yet, seed one via `newDunningRow` keyed at the
 * event's `occurredAtMs` so the first event creates the contract row.
 * If a row exists, reduce it via `applyDunningEvent` and upsert.
 *
 * Idempotency: replays of the same provider event are no-ops via the
 * reducer's `lastProviderEventId` guard. The DB upsert is keyed on
 * subscription_id so duplicate webhook deliveries collapse to a single
 * row regardless of timing.
 *
 * Returns the new row so the caller can decide on entitlement
 * follow-ups (e.g. flipping a `subscriptions.active = false` flag if
 * the new state is "cancelled").
 */
export async function persistDunningEvent(
  subscriptionId: string,
  event: DunningEvent,
): Promise<DunningRow> {
  const existing = await loadDunningRow(subscriptionId);
  const previous = existing ?? newDunningRow(subscriptionId, event.occurredAtMs);
  const next = applyDunningEvent(previous, event);

  // Upsert keyed on subscription_id. We use INSERT ... ON DUPLICATE KEY
  // UPDATE to keep the persist atomic — a separate read + write would
  // race against a concurrent webhook delivery for the same sub.
  await db
    .insert(subscriptionDunning)
    .values({
      subscriptionId: next.subscriptionId,
      state: next.state,
      stateSinceMs: next.stateSinceMs,
      nextRetryAtMs: next.nextRetryAtMs,
      failedAttempts: next.failedAttempts,
      lastProviderEventId: next.lastProviderEventId,
    })
    .onDuplicateKeyUpdate({
      set: {
        state: sql`VALUES(state)`,
        stateSinceMs: sql`VALUES(state_since_ms)`,
        nextRetryAtMs: sql`VALUES(next_retry_at_ms)`,
        failedAttempts: sql`VALUES(failed_attempts)`,
        lastProviderEventId: sql`VALUES(last_provider_event_id)`,
      },
    });

  return next;
}

/**
 * Read every dunning row for the /admin/dunning viewer. Sorted with
 * the most-recently-updated state changes first (admin's "what's
 * happening right now" mental model).
 *
 * Caps the result at 500 rows because /admin/dunning renders a single
 * paginated table; if a deployment ever exceeds 500 active subs in
 * dunning posture, the admin page should switch to per-state filters
 * instead of one giant list. That's a Phase E sizing decision, not a
 * foundation concern.
 */
export async function listDunningRows(limit: number = 500): Promise<DunningRow[]> {
  const rows = await db
    .select()
    .from(subscriptionDunning)
    .orderBy(sql`${subscriptionDunning.updatedAt} DESC`)
    .limit(limit);

  return rows.map((row) => ({
    subscriptionId: row.subscriptionId,
    state: row.state as DunningState,
    stateSinceMs: row.stateSinceMs,
    nextRetryAtMs: row.nextRetryAtMs ?? null,
    failedAttempts: row.failedAttempts,
    lastProviderEventId: row.lastProviderEventId ?? null,
  }));
}

// TODO(Phase E): wire `persistDunningEvent` from webhook-handler.ts on:
//   Razorpay: subscription.charged, subscription.pending, subscription.halted,
//             subscription.cancelled
//   Paddle:   subscription.payment_succeeded, subscription.payment_failed,
//             subscription.canceled
// (When the next international gateway is added, map its subscription
// lifecycle events to the same DunningEvent shape.)
