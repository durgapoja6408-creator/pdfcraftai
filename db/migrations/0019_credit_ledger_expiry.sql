-- 0019_credit_ledger_expiry.sql — credit_ledger.expires_at column
--
-- Plan ref: docs/PRICING_AND_TELEMETRY_PLAN.md §8 layer 6 + Day 6.
--
-- New column
--   expires_at datetime(3) NULL — when this ledger row's credit
--                                  delta is no longer redeemable.
--                                  NULL = never expires (default for
--                                  paid grants, refunds, internal
--                                  bookkeeping). Set to NOW() + 7 days
--                                  for the signup-grant rows that
--                                  Day 6's grantSignupBonus() helper
--                                  will write.
--
-- Why on credit_ledger and not on credits
--   Each ledger row is a distinct grant event. A user could have
--   multiple unexpired grants overlapping (e.g. signup grant + a paid
--   pack purchase). Storing expiry per-row preserves the audit trail
--   and lets the nightly expiry job decide which exact grants to
--   reverse.
--
-- Why nullable
--   Most ledger rows (paid grants, refunds, manual adjustments) never
--   expire. Defaulting NULL keeps the existing behaviour for those
--   rows; only signup-grant inserts populate the column.
--
-- Index
--   `(expires_at, delta)` covering index for the nightly cleanup query
--   `WHERE expires_at < NOW() AND delta > 0 AND ...`. We don't index
--   on user_id alone for this — the cleanup pass is global, not
--   per-user.
--
-- Rollout safety
--   Additive migration, single nullable column, single index. Zero
--   rows rewritten. Safe to apply mid-deploy.

ALTER TABLE `credit_ledger`
  ADD COLUMN `expires_at` datetime(3) NULL AFTER `data_source`;

CREATE INDEX `credit_ledger_expires_idx` ON `credit_ledger` (`expires_at`, `delta`);
