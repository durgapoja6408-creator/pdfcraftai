-- 0023_subscription_dunning.sql — persistent dunning posture per subscription
--
-- Plan ref: docs/PENDING_WORK_ANALYSIS.md §4c (orphaned `TODO(Phase E)`
-- markers — `lib/payments/dunning.ts:236` "persist DunningRow to a
-- subscription_dunning table"). The dunning state machine has been
-- coded as a pure reducer for ~2 weeks (commit `8bbd841`) but never
-- had storage, so a Phase E webhook handler couldn't actually drive
-- it. This migration unblocks the "load → reduce → upsert" loop.
--
-- New table: subscription_dunning
--   One row per subscription. The reducer in lib/payments/dunning.ts
--   produces a `DunningRow` from {previousRow, event}; this table
--   stores that latest reduced row keyed by subscriptionId. Replaying
--   the same provider event is a no-op via lastProviderEventId.
--
-- Why a separate table not a column on subscriptions:
--   - subscriptions today is one-shot (every plan is a credit pack).
--     When recurring plans ship in Phase E, the subscriptions table
--     will already exist with rows; bolting dunning columns onto it
--     would require backfill + ALTER on every existing row.
--   - The reducer is keyed on subscription_id, not user_id — multiple
--     subscriptions per user is plausible (annual + add-on + bonus).
--     Storing per-subscription matches the model.
--   - Dunning is a posture observation, not contract metadata. The
--     subscription itself stays in the contracts table; this table
--     records "where in the lifecycle is this sub right now".
--
-- Columns
--   subscription_id          varchar(64)   PK — provider sub id
--                                          (Razorpay sub_xxx; Paddle
--                                          sub_xxx; abstract enough
--                                          for whatever rail comes
--                                          next)
--   state                    varchar(16)   "current" | "past_due" |
--                                          "suspended" | "cancelled"
--                                          — kept as varchar (not
--                                          enum) so adding a future
--                                          state ("trialing",
--                                          "paused", etc.) is a code
--                                          change, not a migration
--   state_since_ms           bigint        UNIX ms when current state
--                                          began — drives grace-window
--                                          math in the reducer
--   next_retry_at_ms         bigint        UNIX ms the provider intends
--                                          to retry next, or NULL
--   failed_attempts          int           count of failed charges in
--                                          the current past_due /
--                                          suspended streak (resets
--                                          to 0 on payment_succeeded)
--   last_provider_event_id   varchar(128)  provider event id we last
--                                          applied — replay guard.
--                                          NULL on a fresh row.
--   created_at               timestamp(3)  row insert time
--   updated_at               timestamp(3)  last reducer apply time
--
-- Indexes
--   PRIMARY KEY (subscription_id)
--   (state, updated_at)             — admin dashboard "show me all
--                                     past_due subs sorted by how long
--                                     they've been there"
--   (state_since_ms)                — cron job that flips past_due
--                                     subs to suspended after the
--                                     grace window elapses (Phase E
--                                     wiring will run a daily walk)
--
-- Rollout safety
-- --------------
-- New table only — zero existing-row impact. Indexes built on empty
-- table so the migration is sub-second. No FK to a `subscriptions`
-- table because that table doesn't yet exist with the shape Phase E
-- needs (today's `subscriptions` is one-shot pack metadata, not
-- recurring contracts). When Phase E reshapes `subscriptions`, this
-- table can gain a FK then.

CREATE TABLE `subscription_dunning` (
  `subscription_id` varchar(64) NOT NULL,
  `state` varchar(16) NOT NULL DEFAULT 'current',
  `state_since_ms` bigint NOT NULL,
  `next_retry_at_ms` bigint DEFAULT NULL,
  `failed_attempts` int NOT NULL DEFAULT 0,
  `last_provider_event_id` varchar(128) DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `subscription_dunning_pk` PRIMARY KEY (`subscription_id`)
);

CREATE INDEX `subscription_dunning_state_updated_idx`
  ON `subscription_dunning` (`state`, `updated_at`);

CREATE INDEX `subscription_dunning_state_since_idx`
  ON `subscription_dunning` (`state_since_ms`);
