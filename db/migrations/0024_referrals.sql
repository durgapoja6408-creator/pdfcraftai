-- 0024_referrals.sql — referral program foundation (PENDING §3e)
--
-- Plan ref: docs/PENDING_WORK_ANALYSIS.md §3e (no referral program).
-- Existing users have no incentive to refer; growth-loop infra is
-- entirely absent. This migration ships the **storage foundation**
-- following the same staging discipline as ai-feedback (`d74fefe`),
-- subscription-dunning (`76a0c82`), contact-submissions (`52307a3`),
-- and feature-flags (`a849c91`): tables + helpers + admin viewer
-- land NOW even though no signup-flow wire-up runs yet. Phase E
-- enables the wire-up behind a `REFERRALS_ENABLED` env flag once we
-- want the program live.
--
-- Two new tables
-- --------------
-- referral_codes
--   One code per user. The user's code IS their referral identity —
--   sharing it on social/blog/word-of-mouth is the only growth lever.
--   Codes are short, URL-safe, base36-style 6-8 chars. NOT derived
--   from userId (that would leak account ordering); generated random
--   with collision-retry inside the helper.
--
-- referral_signups
--   The attribution log. One row per `referrerUserId × referredUserId`
--   pair. UNIQUE(referredUserId) ensures every signup has exactly one
--   referrer (we record the FIRST code that ever attributed them, not
--   the latest — first-touch attribution; see §6 of the helper module
--   for the rationale vs. last-touch).
--
-- Reward state lives on the signup row, NOT on a separate ledger
-- table. Two nullable timestamp columns (`referrer_rewarded_at`,
-- `referred_rewarded_at`) and two nullable FKs to `credit_ledger.id`
-- record when each side got credited. NULL on both = "attributed but
-- not yet rewarded" (e.g. referred user signed up but hasn't completed
-- email verification or first credit purchase yet). Phase E flips
-- these to non-NULL as the conversion milestones are hit.
--
-- Why no separate `referral_rewards` table:
--   - Each signup row has at most ONE reward grant per side. A 2-col
--     denorm beats a 1:1 child table.
--   - The grant ITSELF is already in credit_ledger (the FK points
--     there). This table records the *milestone* of granting; the
--     credits and money trail are in the existing ledger.
--   - When Phase E wires the grant, it's a 2-line UPDATE here + an
--     INSERT into credit_ledger. No transactional join across three
--     tables.
--
-- Code generation strategy
-- ------------------------
-- Helper picks 7 random base36 chars (~78 billion namespace), checks
-- for collision via SELECT, retries on conflict. Rate of collision is
-- negligible at our scale (< 1M users), so the helper rarely loops.
-- Code is stored UPPERCASE for visual distinction from random URL
-- query strings.
--
-- Indexes
-- -------
-- referral_codes:
--   PRIMARY KEY (id) — UUID
--   UNIQUE (user_id) — one code per user
--   UNIQUE (code) — sharing requires code uniqueness
--
-- referral_signups:
--   PRIMARY KEY (id)
--   UNIQUE (referred_user_id) — first-touch attribution; one referrer
--   (referrer_user_id, created_at) — admin "top referrers" leaderboard
--   (created_at) — admin chronological list
--
-- Rollout safety
-- --------------
-- Two new tables, no FK to legacy code paths. Zero existing-row impact.
-- Indexes built on empty tables so the migration is sub-second.
-- FK to users(id) is included because users is a stable schema (NextAuth
-- pluralized), and the reward FKs to credit_ledger(id) are nullable so
-- the row exists pre-grant.
--
-- Rollback: DROP TABLE referral_signups; DROP TABLE referral_codes;

CREATE TABLE `referral_codes` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `code` varchar(16) NOT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `referral_codes_pk` PRIMARY KEY (`id`),
  CONSTRAINT `referral_codes_user_id_unique` UNIQUE (`user_id`),
  CONSTRAINT `referral_codes_code_unique` UNIQUE (`code`)
);

CREATE TABLE `referral_signups` (
  `id` varchar(36) NOT NULL,
  `referrer_user_id` varchar(255) NOT NULL,
  `referred_user_id` varchar(255) NOT NULL,
  `code` varchar(16) NOT NULL,
  `referrer_rewarded_at` timestamp(3) DEFAULT NULL,
  `referred_rewarded_at` timestamp(3) DEFAULT NULL,
  `referrer_credit_ledger_id` varchar(36) DEFAULT NULL,
  `referred_credit_ledger_id` varchar(36) DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `referral_signups_pk` PRIMARY KEY (`id`),
  CONSTRAINT `referral_signups_referred_user_id_unique` UNIQUE (`referred_user_id`)
);

CREATE INDEX `referral_signups_referrer_created_idx`
  ON `referral_signups` (`referrer_user_id`, `created_at`);

CREATE INDEX `referral_signups_created_idx`
  ON `referral_signups` (`created_at`);
