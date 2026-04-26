-- 0017_agent_runs_v2.sql
-- Agent mode (production) — Phase 1-2 schema, 2026-04-26.
--
-- Re-introduces agent_runs + agent_run_steps after the 0002 drop. Schema
-- has been refined for the LLM-planned executor at /agent (different
-- surface and lifecycle from the old /app/studio Smart-mode runner).
--
-- Lifecycle reference: see db/schema/app.ts ("Agent runs" block).
--
-- Idempotency: every CREATE uses IF NOT EXISTS so a deploy that double-
-- runs (e.g. Hostinger's same-UUID retry pattern observed today) is a
-- no-op the second time.

CREATE TABLE IF NOT EXISTS `agent_runs` (
  `id`                 VARCHAR(36)  NOT NULL,
  `user_id`            VARCHAR(255) NOT NULL,
  `prompt`             TEXT         NOT NULL,
  `plan_json`          JSON         NOT NULL,
  `status`             VARCHAR(32)  NOT NULL DEFAULT 'queued',
  `total_cost_micros`  BIGINT       NULL,
  `est_cost_micros`    BIGINT       NOT NULL,
  `output_file_id`     VARCHAR(36)  NULL,
  `error_message`      TEXT         NULL,
  `created_at`         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at`       TIMESTAMP(3) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `agent_runs_user_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `agent_runs_user_created_idx` (`user_id`, `created_at`),
  INDEX `agent_runs_status_idx` (`status`)
);

CREATE TABLE IF NOT EXISTS `agent_run_steps` (
  `id`              VARCHAR(36)  NOT NULL,
  `run_id`          VARCHAR(36)  NOT NULL,
  `idx`             INT          NOT NULL,
  `tool`            VARCHAR(64)  NOT NULL,
  `params_json`     JSON         NOT NULL,
  `status`          VARCHAR(32)  NOT NULL DEFAULT 'pending',
  `output_ref`      TEXT         NULL,
  `output_type`     VARCHAR(16)  NULL,
  `cost_micros`     BIGINT       NULL,
  `error_message`   TEXT         NULL,
  `started_at`      TIMESTAMP(3) NULL,
  `completed_at`    TIMESTAMP(3) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `agent_run_steps_run_fk`
    FOREIGN KEY (`run_id`) REFERENCES `agent_runs`(`id`) ON DELETE CASCADE,
  UNIQUE INDEX `agent_run_steps_run_idx_idx` (`run_id`, `idx`),
  INDEX `agent_run_steps_status_idx` (`status`)
);
