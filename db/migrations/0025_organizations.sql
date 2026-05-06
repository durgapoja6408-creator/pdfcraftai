-- 0025_organizations.sql — multi-seat / team plan foundation (PENDING §3b)
--
-- Plan ref: docs/PENDING_WORK_ANALYSIS.md §3b (no team / multi-seat plan).
-- "Every conversation that starts with 'we have N employees who need PDF
-- tools' currently has nowhere to land beyond /enterprise" — this
-- migration ships the storage foundation following the same staging
-- discipline as ai-feedback (`d74fefe`), subscription-dunning
-- (`76a0c82`), contact-submissions (`52307a3`), feature-flags
-- (`a849c91`), referrals (`6a49736`): tables + helpers + admin viewer
-- land NOW behind the MULTI_SEAT feature flag (already registered in
-- lib/flags.ts §4d). Phase F flips the flag + adds signup-flow / billing
-- / permissions / email-invite wire-up.
--
-- Three new tables
-- ----------------
-- organizations
--   One row per team account. The `owner_user_id` is the founding
--   member who pays the bill (until billing-handoff lands). The
--   `slug` is the URL component for /app/org/<slug>/* pages — short,
--   lowercase, hyphen-separated, generated from the name with a
--   collision-retry loop. The `billing_mode` field reserves the
--   policy choice for Phase F:
--     "central"     — owner pays, all members consume from central
--                     credit balance (most common — small teams)
--     "per_seat"    — each member has their own credit pool; org
--                     gets aggregate visibility but doesn't pool
--     "credit_pool" — shared credit balance across all members, but
--                     each member's usage tracked separately for
--                     /admin chargeback (large enterprise)
--   The schema accommodates all three; today's foundation reserves
--   the column without enforcing semantics (we'll wire when Phase F
--   ships actual billing).
--
-- organization_members
--   M:N table linking users to organizations. One row per (org, user)
--   pair. `role` is "owner" | "admin" | "member" — owner can transfer
--   ownership / delete the org, admins can invite + remove members,
--   members can use tools. The owner_user_id on the parent
--   organizations row is denormalized for fast admin lookup; the
--   organization_members.role="owner" row is the source-of-truth and
--   what permission checks consult.
--
-- organization_invites
--   Pending invitations. The `token` is a 32-char random URL-safe
--   string used in the invite link (/invite/<token>). Idempotent on
--   (organizationId, email) — re-inviting an already-pending email
--   replaces the prior token + bumps the expiry. `accepted_at` IS
--   NULL means "still pending"; non-NULL means the user accepted
--   and a row was created in organization_members.
--
-- Why three tables (not two with embedded invites)
-- ------------------------------------------------
-- Invites and members have different lifecycles + different access
-- patterns. An invite has a token, an expiry, and a pending state;
-- a member has a role, a join date, and a usage history. Forcing
-- both into one table with nullable columns + status enums creates
-- a denormalized mess that's awkward to query. Three tables makes
-- each query simple.
--
-- Indexes
-- -------
-- organizations:
--   PRIMARY KEY (id) — UUID
--   UNIQUE (slug) — URL component must be globally unique
--   (owner_user_id) — admin "list all orgs by owner"
--
-- organization_members:
--   PRIMARY KEY (id)
--   UNIQUE (organization_id, user_id) — one membership per user per org
--   (user_id) — "list orgs I belong to" (for /app/dashboard org switcher)
--   (organization_id, role) — "list owners / admins for permission checks"
--
-- organization_invites:
--   PRIMARY KEY (id)
--   UNIQUE (token) — token is the lookup key for /invite/<token>
--   (organization_id, accepted_at) — admin "list pending invites"
--   (email) — abuse prevention: rate-limit invite blasts to one email
--
-- Rollout safety
-- --------------
-- Three new tables, no FK to existing schema's primary keys (we use
-- app-layer references via varchar(255) for user_id, matching the
-- pattern in referrals/dunning/contact-submissions). Zero existing-
-- row impact. Indexes built on empty tables so the migration is
-- sub-second.
--
-- Rollback:
--   DROP TABLE organization_invites;
--   DROP TABLE organization_members;
--   DROP TABLE organizations;

CREATE TABLE `organizations` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `slug` varchar(64) NOT NULL,
  `owner_user_id` varchar(255) NOT NULL,
  `billing_mode` varchar(16) NOT NULL DEFAULT 'central',
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `organizations_pk` PRIMARY KEY (`id`),
  CONSTRAINT `organizations_slug_unique` UNIQUE (`slug`)
);

CREATE INDEX `organizations_owner_user_id_idx`
  ON `organizations` (`owner_user_id`);

CREATE TABLE `organization_members` (
  `id` varchar(36) NOT NULL,
  `organization_id` varchar(36) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `role` varchar(16) NOT NULL DEFAULT 'member',
  `joined_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `organization_members_pk` PRIMARY KEY (`id`),
  CONSTRAINT `organization_members_org_user_unique` UNIQUE (`organization_id`, `user_id`)
);

CREATE INDEX `organization_members_user_id_idx`
  ON `organization_members` (`user_id`);

CREATE INDEX `organization_members_org_role_idx`
  ON `organization_members` (`organization_id`, `role`);

CREATE TABLE `organization_invites` (
  `id` varchar(36) NOT NULL,
  `organization_id` varchar(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `token` varchar(64) NOT NULL,
  `invited_by_user_id` varchar(255) NOT NULL,
  `role` varchar(16) NOT NULL DEFAULT 'member',
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` timestamp(3) NOT NULL,
  `accepted_at` timestamp(3) DEFAULT NULL,
  CONSTRAINT `organization_invites_pk` PRIMARY KEY (`id`),
  CONSTRAINT `organization_invites_token_unique` UNIQUE (`token`)
);

CREATE INDEX `organization_invites_org_accepted_idx`
  ON `organization_invites` (`organization_id`, `accepted_at`);

CREATE INDEX `organization_invites_email_idx`
  ON `organization_invites` (`email`);
