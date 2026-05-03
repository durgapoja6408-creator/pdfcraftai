-- 0020_failed_login_attempts.sql — credentials login rate limit
--
-- Plan ref: docs/PRICING_AND_TELEMETRY_PLAN.md §8a Day 1.5a Phase C.
--
-- New table: failed_login_attempts
--   Tracks failed Credentials provider login attempts so we can
--   apply a rolling-window lockout per (email, IP) pair. Successful
--   logins delete the row(s) for that email; expired rows are
--   garbage-collected by a periodic sweep (or lazily on read — both
--   work because the lockout decision uses a window-bound COUNT).
--
-- Columns
--   id                   varchar(36)  PK (UUID)
--   email_normalized     varchar(254) target email (lowercase + Gmail-
--                                     normalized via normalizeEmail();
--                                     matches the column on users)
--   ip                   varchar(45)  IPv6-safe; from cf-connecting-ip
--   attempted_at         timestamp(3) NOT NULL default NOW()
--
-- Indexes
--   (email_normalized, attempted_at)  — primary lookup for "how many
--                                       failures from this email in
--                                       the last 15 min"
--   (ip, attempted_at)                — secondary lookup for IP-based
--                                       lockout (defends against same-
--                                       IP credential stuffing across
--                                       multiple emails)
--   (attempted_at)                    — covering index for the periodic
--                                       garbage-collection sweep
--
-- Rollout safety
-- --------------
-- New table only — zero existing-row impact. Indexes built on empty
-- table so the migration is sub-second.

CREATE TABLE `failed_login_attempts` (
  `id` varchar(36) NOT NULL,
  `email_normalized` varchar(254) NOT NULL,
  `ip` varchar(45) NOT NULL DEFAULT '',
  `attempted_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `failed_login_attempts_id` PRIMARY KEY (`id`)
);

CREATE INDEX `failed_login_attempts_email_idx`
  ON `failed_login_attempts` (`email_normalized`, `attempted_at`);

CREATE INDEX `failed_login_attempts_ip_idx`
  ON `failed_login_attempts` (`ip`, `attempted_at`);

CREATE INDEX `failed_login_attempts_gc_idx`
  ON `failed_login_attempts` (`attempted_at`);
