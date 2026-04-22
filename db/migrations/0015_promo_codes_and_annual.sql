-- 0015_promo_codes_and_annual.sql
-- Phase E / Task #27 — promo codes + annual-prepay variant + INR pricing.
--
-- Background
-- ----------
-- Three related needs that share the same checkout plumbing:
--
--   1. Promo codes (growth). Sales/marketing needs typeable discount
--      codes for launch campaigns, B2B deals, referral programs, and
--      PR moments. Today the /admin/promos page is a placeholder —
--      operators who want to grant a discount mint a manual credit
--      adjustment through the support pipeline, which (a) doesn't
--      surface in /admin/revenue, (b) doesn't attribute to a campaign,
--      and (c) can't self-serve at the /pricing checkout step.
--
--   2. Annual-prepay tier (margin). The /pricing FAQ already claims
--      "Annual plans save 20%", but there is no code path that makes
--      that true — every pack is a one-time monthly-equivalent. We
--      introduce a pack *variant* (annual) that multiplies credits by
--      12 and applies a 20% discount on the price. Preserves the
--      one-time-charge simplicity — no subscription rail — and mints
--      credits that "never expire" just like monthly packs.
--
--   3. Per-pack INR pricing (UX + margin). The dual-rail router
--      (Task #20) currently picks Razorpay for IN and converts USD
--      prices via USD_TO_INR_RATE = 84. That's a display hack; the
--      real-world Indian market supports PPP-adjusted pricing well
--      below the raw USD conversion. A dedicated INR price per pack
--      lets us set region-appropriate anchors (e.g. Starter ₹399
--      instead of the ~₹420 the conversion produces) without touching
--      the USD rail. Schema-wise this is a client-side lib/pricing
--      change plus a checkout-actions read, so no new DB column is
--      needed at the pack level — it's a constant table.
--
-- What this migration adds
-- ------------------------
-- 1. `promo_codes` — the catalog of issued codes. Append-first (we
--    soft-delete via `is_active=false`) so historical redemptions
--    always have a foreign key to look up what code was applied,
--    even years later.
-- 2. `promo_redemptions` — the join rows: who used which code, on
--    which payment, for how much. Append-only. Source of truth for
--    /admin/promos usage counts and the /app/account history view.
-- 3. Four columns on `payments`:
--       promo_code_id          — the code that was applied (FK to
--                                promo_codes; nullable).
--       promo_discount_micros  — absolute discount in billing-currency
--                                micros (kept in micros for parity
--                                with gross_charge_micros added in
--                                Task #15, so the /admin/revenue view
--                                can subtract without FP rounding).
--       annual_variant         — tinyint(1) flag — whether this was
--                                an annual-prepay purchase (12× credits
--                                + 20% off price). Nullable so
--                                pre-0015 rows stay NULL.
--       promo_bonus_credits    — for kind='bonus_credits' codes the
--                                discount is NOT a money-off but extra
--                                credits granted post-capture. We
--                                stash the amount here so the ledger
--                                grant in lib/payments/ledger.ts can
--                                read it without re-resolving the
--                                promo, which would race with a
--                                deactivation between checkout init
--                                and webhook capture.
--
-- Why separate tables for promo_codes vs. promo_redemptions
-- ---------------------------------------------------------
-- One-to-many is the natural shape: a single WELCOME10 code gets
-- redeemed by many users, once each. Folding redemptions into
-- promo_codes as a JSON array would prevent clean indexes on
-- (code_id, user_id) for the per-user-limit check and would make
-- concurrent redemptions a write-contention hot spot. Two tables,
-- foreign-key constraint, done.
--
-- Why FK on payments.promo_code_id (not promo_redemptions.payment_id as source of truth)
-- -------------------------------------------------------------------------------------
-- A payment knows exactly one code it was applied with. Modelling the
-- code-to-payment relationship FROM the payment side lets the admin
-- revenue query scan payments and resolve the promo via a single
-- join, rather than scanning promo_redemptions first and then
-- re-joining payments. promo_redemptions stays as the audit log —
-- one row per successful redemption, pinned at the webhook-capture
-- step so /admin/promos counts reflect actual captured money, not
-- abandoned pending rows.
--
-- Why kind is an enum (not a free-form string)
-- --------------------------------------------
-- Three kinds cover every campaign we've sketched:
--   - "percent"        : X basis points off (e.g. 1000 bps = 10%)
--   - "flat"           : X micros off the billing-currency total
--                        (e.g. $5.00 off = 5_000_000 micros USD)
--   - "bonus_credits"  : grant X extra credits post-capture, no price
--                        change (useful for "buy Starter, get +50
--                        credits" campaigns where the headline price
--                        stays the same for ad copy purposes)
-- Adding a fourth kind is a schema migration; that's deliberate
-- friction — the promo resolver needs explicit logic per kind, and
-- implicit coercion of an unknown kind would silently break the
-- discount math.
--
-- Why `starts_at` / `expires_at` / `max_redemptions` / `per_user_limit`
-- --------------------------------------------------------------------
-- Minimum viable promo validation:
--   - starts_at: most launch codes are announced in advance
--     ("available from May 1"); we want to reject early-bird redemption
--     attempts clearly rather than silently honoring them.
--   - expires_at: every campaign has an end date; NULL means "no
--     expiry" (evergreen welcome codes).
--   - max_redemptions: a fixed pool (e.g. "first 1000 users"); NULL
--     means unlimited. Enforced at redemption time with a SELECT-for-
--     update pattern in lib/promos/resolver.ts.
--   - per_user_limit: prevents "buy many Starters with WELCOME10"
--     abuse. Usually 1; NULL means unlimited.
--
-- Rollout safety
-- --------------
-- Additive migration. New tables ship empty (no rows until the first
-- code is issued). New columns on `payments` are all nullable — pre-
-- 0015 rows stay NULL and the checkout code writes `null` when no
-- promo was applied. Zero write amplification, no downtime risk on
-- the managed MySQL instance at Hostinger.
--
-- Deploy order (mirrors Task #26 / #22 / #19 pattern)
-- ---------------------------------------------------
-- This migration is NOT auto-applied on deploy — must be piped to
-- Hostinger MySQL manually BEFORE the checkout action starts reading
-- args.promoCode or writing payments.promo_code_id. Before the code
-- lands, the code path gates on `schema.payments.promoCodeId`
-- existing; missing column = INSERT error. Apply 0015 first, then
-- push the code commit; the /admin/promos rewrite is harmless
-- without the migration (it renders zero rows), so the code can
-- redeploy mid-migration-window without user-visible breakage.

CREATE TABLE `promo_codes` (
  `id` varchar(36) NOT NULL,
  `code` varchar(64) NOT NULL,
  `kind` enum('percent','flat','bonus_credits') NOT NULL,
  -- For 'percent': basis points off the subtotal (1000 = 10%).
  -- For 'flat': micros of billing-currency off the subtotal.
  -- For 'bonus_credits': number of extra credits to grant on capture.
  `value` bigint NOT NULL,
  -- Scopes the discount — NULL = any currency. Non-NULL codes only
  -- apply when the checkout's currency matches, so an INR-only
  -- festival code can't accidentally discount a USD Paddle order.
  `currency` char(3) NULL,
  -- NULL = all packs. Non-NULL = comma-separated pack IDs the code
  -- is valid for ("starter,creator"). Cheaper than a join table at
  -- our expected catalog size (4 packs × variants).
  `pack_ids` varchar(255) NULL,
  -- If NULL, the code is valid for both monthly and annual variants.
  -- Useful for "annual-only promos" (e.g. LAUNCH_ANNUAL20 stacking
  -- another 20% on top of the base annual discount).
  `annual_only` tinyint(1) NOT NULL DEFAULT 0,
  `max_redemptions` int NULL,
  `per_user_limit` int NULL DEFAULT 1,
  `starts_at` timestamp(3) NULL,
  `expires_at` timestamp(3) NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  -- Freeform attribution — "launch_week", "bp_partner", "referral_x".
  -- Exposed on /admin/promos so operators can group by campaign.
  `campaign` varchar(64) NULL,
  `notes` text NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by` varchar(255) NULL,
  `disabled_at` timestamp(3) NULL,
  `disabled_by` varchar(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `promo_codes_code_idx` (`code`),
  KEY `promo_codes_active_idx` (`is_active`, `expires_at`),
  KEY `promo_codes_campaign_idx` (`campaign`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `promo_redemptions` (
  `id` varchar(36) NOT NULL,
  `promo_code_id` varchar(36) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `payment_id` varchar(36) NOT NULL,
  -- Absolute discount amount in billing-currency micros at redemption
  -- time. Captured here so /admin/promos can sum discounts without
  -- re-resolving the code (which might have been edited or
  -- deactivated since).
  `discount_micros` bigint NOT NULL DEFAULT 0,
  -- For bonus_credits kind — how many credits were granted.
  `bonus_credits` int NOT NULL DEFAULT 0,
  `currency` char(3) NOT NULL,
  `pack_id` varchar(32) NULL,
  `annual_variant` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `promo_redemptions_payment_idx` (`payment_id`),
  KEY `promo_redemptions_code_idx` (`promo_code_id`),
  KEY `promo_redemptions_user_idx` (`user_id`),
  KEY `promo_redemptions_code_user_idx` (`promo_code_id`, `user_id`),
  KEY `promo_redemptions_created_idx` (`created_at`),
  CONSTRAINT `promo_redemptions_code_fk`
    FOREIGN KEY (`promo_code_id`)
    REFERENCES `promo_codes`(`id`)
    ON DELETE RESTRICT,
  CONSTRAINT `promo_redemptions_payment_fk`
    FOREIGN KEY (`payment_id`)
    REFERENCES `payments`(`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `payments`
  ADD COLUMN `promo_code_id` varchar(36) NULL AFTER `metadata`,
  ADD COLUMN `promo_discount_micros` bigint NULL AFTER `promo_code_id`,
  ADD COLUMN `promo_bonus_credits` int NULL AFTER `promo_discount_micros`,
  ADD COLUMN `annual_variant` tinyint(1) NULL AFTER `promo_bonus_credits`,
  ADD CONSTRAINT `payments_promo_code_fk`
    FOREIGN KEY (`promo_code_id`)
    REFERENCES `promo_codes`(`id`)
    ON DELETE SET NULL;

CREATE INDEX `payments_promo_code_idx` ON `payments` (`promo_code_id`);
CREATE INDEX `payments_annual_variant_idx` ON `payments` (`annual_variant`);
