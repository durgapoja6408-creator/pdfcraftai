-- 0031_error_events.sql — in-house error tracking (2026-06-07).
--
-- Free, self-hosted alternative to Sentry: client + server errors are written
-- here and surfaced at /admin/errors (admin-only). One row per occurrence;
-- the admin viewer groups by `fingerprint` (a stable hash of message + top
-- stack frame) to show count + last-seen per distinct error.
--
-- Additive + safe: new table only, no ALTER on existing tables. `user_id` is a
-- loose varchar (NO foreign key) on purpose — an error event must survive the
-- user being deleted, and we never want error logging to fail on an FK. Two
-- indexes: fingerprint (grouping) and created_at (the recent-errors query).
CREATE TABLE IF NOT EXISTS `error_events` (
  `id` varchar(36) NOT NULL,
  `fingerprint` varchar(64) NOT NULL,
  `kind` varchar(16) NOT NULL,
  `message` varchar(1024) NOT NULL,
  `stack` mediumtext,
  `path` varchar(512),
  `method` varchar(8),
  `status_code` int,
  `digest` varchar(64),
  `user_id` varchar(255),
  `user_agent` varchar(512),
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `error_events_fingerprint_idx` (`fingerprint`),
  KEY `error_events_created_idx` (`created_at`)
);
