-- 0005_ai_usage.sql
-- Phase A1 (MASTER_PLAN §6 task #83 + §7 gate #3). Per-AI-call audit log.
-- Schema companion to db/schema/app.ts → aiUsage.
--
-- Design notes live on the Drizzle definition — see db/schema/app.ts for the
-- full rationale. Highlights:
--   - `operation` is a free varchar, not an enum. `AIOperationId` in
--     lib/pricing.ts is the source of truth; flexibility here avoids
--     schema drift when a new op lands in a future phase.
--   - `cost_micros` = USD × 1e6, nullable until per-model rate cards are
--     wired (Phase A4 deliverable).
--   - `success` is an int (1 = ok, 0 = error) because MySQL has no native
--     bool. Indexed so error-rate monitoring is a cheap range scan.
--   - `idempotency_key` unique — a retried spendCredits call collapses to
--     one usage row too, mirroring how `credit_ledger` collapses.
--
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS. If the journal tracker
-- is ever rebuilt by `drizzle-kit generate`, this file is the source of
-- truth for the table shape; the generator will pick it up as an existing
-- table rather than try to re-create.

CREATE TABLE IF NOT EXISTS `ai_usage` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `operation` varchar(32) NOT NULL,
  `provider_id` varchar(32) NOT NULL,
  `model` varchar(128) NOT NULL,
  `input_tokens` int NOT NULL DEFAULT 0,
  `output_tokens` int NOT NULL DEFAULT 0,
  `latency_ms` int NOT NULL DEFAULT 0,
  `credits_spent` int NOT NULL DEFAULT 0,
  `cost_micros` bigint,
  `success` int NOT NULL DEFAULT 1,
  `error_code` varchar(64),
  `ledger_id` varchar(36),
  `idempotency_key` varchar(128),
  `created_at` timestamp(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
  CONSTRAINT `ai_usage_id` PRIMARY KEY(`id`),
  CONSTRAINT `ai_usage_idempotency_idx` UNIQUE(`idempotency_key`),
  CONSTRAINT `ai_usage_user_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `ai_usage_user_created_idx` ON `ai_usage` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `ai_usage_created_idx` ON `ai_usage` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ai_usage_provider_created_idx` ON `ai_usage` (`provider_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `ai_usage_success_idx` ON `ai_usage` (`success`);
