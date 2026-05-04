-- 0021_contact_submissions.sql — persistent contact form storage
--
-- Plan ref: docs/PENDING_WORK_ANALYSIS.md §4c (orphaned `TODO(Phase E)`
-- markers — `app/api/contact/route.ts:116` "wire SendGrid / Postmark
-- here"). The contact form currently logs to stdout only, which means
-- /enterprise SMB sales-qualified leads are at the mercy of Hostinger
-- log rotation. Until the founder wires a transactional email
-- provider, persisting to MariaDB lets the founder read submissions
-- via the new /admin/contact-submissions page.
--
-- New table: contact_submissions
--   Append-only audit log of contact-form POSTs that survived the
--   honeypot + per-IP throttle + per-email throttle. Each row is one
--   submission. Topic enum kept open as varchar so /enterprise's
--   "Sales" topic + future topics don't require migration churn.
--
-- Columns
--   id                 varchar(36)   PK (UUID v4 minted by route)
--   name               varchar(200)  required, capped at zod schema
--   email              varchar(320)  required, RFC 5321 max length
--   topic              varchar(60)   "Sales" | "Support" | "Billing" |
--                                    "Press" | "General" | other —
--                                    persisted as the user submitted
--                                    so we can grow the dropdown without
--                                    DB migrations
--   message            text          5000-char cap from zod schema
--   ip                 varchar(45)   IPv6-safe — populated from
--                                    cf-connecting-ip (Cloudflare
--                                    canonical client IP)
--   user_agent         varchar(512)  truncated User-Agent header for
--                                    bot triage
--   referer            varchar(1024) HTTP Referer for "did this come
--                                    from /enterprise vs /contact"
--                                    attribution
--   status             varchar(16)   "new" (default) | "read" | "replied"
--                                    | "spam" — admin marks via
--                                    server action; v1 is read-only
--                                    so all rows stay "new"
--   created_at         timestamp(3)  server time of receipt
--   read_at            timestamp(3)  null until admin marks read
--
-- Indexes
--   (created_at)              — admin "newest first" sort
--   (status, created_at)      — admin filter "show only new"
--   (email)                   — "all submissions from this email"
--   No unique key — same person can legitimately submit multiple
--   times (e.g. Sales follow-up, then Billing question). The route's
--   per-email + per-IP throttles handle abuse.
--
-- Rollout safety
-- --------------
-- New table only — zero existing-row impact. Indexes built on empty
-- table so the migration is sub-second. No FK to users — anonymous
-- visitors can contact us without an account.

CREATE TABLE `contact_submissions` (
  `id` varchar(36) NOT NULL,
  `name` varchar(200) NOT NULL,
  `email` varchar(320) NOT NULL,
  `topic` varchar(60) NOT NULL,
  `message` text NOT NULL,
  `ip` varchar(45) NOT NULL DEFAULT '',
  `user_agent` varchar(512) DEFAULT NULL,
  `referer` varchar(1024) DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'new',
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `read_at` timestamp(3) DEFAULT NULL,
  CONSTRAINT `contact_submissions_id` PRIMARY KEY (`id`)
);

CREATE INDEX `contact_submissions_created_idx`
  ON `contact_submissions` (`created_at`);

CREATE INDEX `contact_submissions_status_created_idx`
  ON `contact_submissions` (`status`, `created_at`);

CREATE INDEX `contact_submissions_email_idx`
  ON `contact_submissions` (`email`);
