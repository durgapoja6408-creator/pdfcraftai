-- 0018_users_signup_security.sql — abuse-prevention columns on users
--
-- Plan ref: docs/PRICING_AND_TELEMETRY_PLAN.md §8 abuse stack layers 4 + 5,
--           plan §10 (gap 10 migration sequence — number adjusted from
--           original 0014 to 0018 because 0014-0017 were already taken
--           by ai_usage_prompt_version + promo_codes_and_annual +
--           users_billing_profile + agent_runs_v2 between plan-write
--           time and Day 5 implementation).
--
-- New columns
--   signup_ip varchar(45)        — IPv6-safe storage of the request
--                                   IP at signup time (Cloudflare
--                                   `cf-connecting-ip` header). Used
--                                   by the abuse-signal detector to
--                                   cluster signups per /24 (IPv4) or
--                                   /48 (IPv6).
--   device_fingerprint varchar(64) — FingerprintJS open-core hash.
--                                    Used by abuse-signal detector to
--                                    cluster signups per device.
--   email_normalized varchar(254) — Gmail-alias-collapsed +
--                                    dot-stripped + lowercased form.
--                                    Indexed UNIQUE so two signups
--                                    with `raja+1@gmail.com` and
--                                    `raja+2@gmail.com` (which both
--                                    normalize to `raja@gmail.com`)
--                                    cannot coexist.
--
-- All three columns are nullable on insert. Backfill for the 7
-- existing users (per Day 0 SSH user-count probe) is NOT performed —
-- pre-migration users keep NULL signup_ip + device_fingerprint
-- (they're under the per-IP / per-device cap by definition since the
-- abuse detector treats NULL as "no signal", not a match). The
-- email_normalized column is backfilled for existing users via the
-- registration flow's normalize() helper on next sign-in (next
-- session can write a one-time backfill script if needed).
--
-- Rollout safety
-- --------------
-- Additive migration. All three new columns nullable. Zero rows
-- rewritten. UNIQUE index on email_normalized enforces the new
-- collision rule from this point forward; legacy rows with NULL
-- email_normalized are exempt (MySQL treats multiple NULLs as
-- distinct under UNIQUE).
--
-- IMPORTANT: this migration does NOT enforce email_normalized as
-- NOT NULL. Doing so would require a backfill on the existing 7
-- rows; we defer that to a follow-up commit so this migration can
-- land mid-session without coordination.

ALTER TABLE `users`
  ADD COLUMN `signup_ip` varchar(45) NULL AFTER `password_hash`,
  ADD COLUMN `device_fingerprint` varchar(64) NULL AFTER `signup_ip`,
  ADD COLUMN `email_normalized` varchar(254) NULL AFTER `device_fingerprint`;

CREATE UNIQUE INDEX `users_email_normalized_uq` ON `users` (`email_normalized`);
CREATE INDEX `users_signup_ip_idx` ON `users` (`signup_ip`);
CREATE INDEX `users_device_fingerprint_idx` ON `users` (`device_fingerprint`);
