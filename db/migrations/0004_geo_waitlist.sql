-- 0004_geo_waitlist.sql
-- Phase 7.1 — Tier-2 deferred-region email waitlist. Visitors from countries
-- we've deferred launching in (docs/GEO_LAUNCH_POLICY.md §2 Tier 2 — EU27 +
-- EEA + CH/CN/RU/BY) can opt in to be notified when we go live in their
-- country. Schema companion to db/schema/app.ts → geoWaitlist.
--
-- Design notes live on the Drizzle definition — see db/schema/app.ts for the
-- full rationale. Highlights:
--   - (email, country) UNIQUE, not just email: one address can track
--     multiple countries.
--   - `reason` ENUM discriminates "hit the checkout defer page" from
--     "signed up proactively from a marketing surface".
--   - `consent_text` captures the EXACT copy the user clicked through —
--     GDPR defensibility. Text, not varchar, so copy length is unbounded.
--   - `ip_hash` is SHA-256(ip + server-side salt); raw IP never lands.
--   - `notified_at` gates the launch-announcement job against double-send.
--
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS. If the journal tracker
-- is ever rebuilt by `drizzle-kit generate`, this file is the source of
-- truth for the table shape; the generator will pick it up as an existing
-- table rather than try to re-create.

CREATE TABLE IF NOT EXISTS `geo_waitlist` (
  `id` varchar(36) NOT NULL,
  `email` varchar(320) NOT NULL,
  `country` varchar(2) NOT NULL,
  `reason` ENUM('tier2_deferred', 'tier2_notify') NOT NULL,
  `source` varchar(64) NOT NULL,
  `consent_text` text NOT NULL,
  `user_agent` varchar(512),
  `ip_hash` varchar(64),
  `created_at` timestamp(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
  `notified_at` timestamp(3),
  CONSTRAINT `geo_waitlist_id` PRIMARY KEY(`id`),
  CONSTRAINT `geo_waitlist_email_country_idx` UNIQUE(`email`, `country`)
);
--> statement-breakpoint
CREATE INDEX `geo_waitlist_country_idx` ON `geo_waitlist` (`country`);
--> statement-breakpoint
CREATE INDEX `geo_waitlist_created_idx` ON `geo_waitlist` (`created_at`);
