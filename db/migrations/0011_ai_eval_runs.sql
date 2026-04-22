-- 0011_ai_eval_runs.sql
-- Phase A / Task #14 — eval harness scaffold + per-op quality floor.
--
-- Background
-- ----------
-- Task #4 (2026-04-21, commit `4139098`) flipped the translate primary
-- from Gemini 2.5 Flash to gpt-4o-mini for a ~4× cost win. Task #11
-- (2026-04-22, commit `9a9d455`) tightened output caps across every op.
-- Both changes CAN regress quality silently — a cheaper model that
-- produces slightly worse output, or a tighter cap that truncates a
-- real 200-page summary at the wrong sentence, shows up in user
-- complaints weeks later, not in the margin dashboard.
--
-- The eval harness runs a small golden-set of inputs through each op's
-- live routing ladder, scores the output against a deterministic
-- rubric (regex/shape/numeric-preservation — no LLM-judge loops in
-- v1), and persists every run to `ai_eval_runs`. A nightly cron that
-- we'll wire in Phase B compares the trailing-7d pass rate per op
-- against `OP_QUALITY_FLOOR`; a drop alarms the same Slack channel as
-- the margin rollup.
--
-- v1 scope (Task #14): table + Drizzle + rubric + runner + CLI +
-- test harness. Cron, Slack alarm, and admin page are Phase B work.
--
-- Schema
-- ------
--   id               varchar(36)  PK (UUID v4)
--   run_batch_id     varchar(36)  NOT NULL — one CLI invocation = one batch.
--                                             Lets us group per-op scores into
--                                             a single dashboard row and filter
--                                             "only runs from commit SHA X".
--   commit_sha       varchar(40)  NULL     — process.env.COMMIT_SHA at invoke
--                                             (Hostinger sets this; local dev
--                                             leaves it NULL).
--   op               varchar(32)  NOT NULL — one of the 10 AIOp values.
--   golden_id        varchar(128) NOT NULL — stable identifier from
--                                             lib/ai/eval/golden-set.ts.
--                                             (op, golden_id) is the natural
--                                             key for "this specific test
--                                             across time".
--   provider_id      varchar(32)  NOT NULL — provider actually selected by
--                                             the router (primary or fallback).
--   model            varchar(128) NOT NULL — model string the adapter used.
--   passed           int          NOT NULL — 0 | 1 — rubric verdict. We
--                                             encode as int (not bool) to
--                                             match the `success`/
--                                             `response_truncated` pattern in
--                                             `ai_usage` and allow efficient
--                                             `SUM(passed)` pass-rate queries.
--   score_rubric     json         NOT NULL — full per-check breakdown:
--                                             { checks: [{id, label, passed,
--                                             weight, detail?}], score: number,
--                                             threshold: number }.
--   overall_score    int          NOT NULL — 0–10000 (basis points — same
--                                             scaling as `ai_daily_margin.
--                                             margin_bps`). Lets us query
--                                             "trailing median per op" without
--                                             double conversion.
--   latency_ms       int          NOT NULL — wall-clock round-trip.
--   tokens_in        int          NULL
--   tokens_out       int          NULL
--   cost_micros      bigint       NULL     — if the run paid via real
--                                             credits (not a dry-run), we
--                                             mirror ai_usage's cost so the
--                                             margin rollup can net out eval
--                                             spend vs user spend.
--   error_message    varchar(512) NULL     — populated when the op throw'd
--                                             before producing output;
--                                             `passed=0` in that case.
--   created_at       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
--
-- Indexes
--   (op, created_at)               — "trailing pass rate per op"
--   (run_batch_id)                 — "all rows from this CLI run"
--   (commit_sha, op)               — "regression check post-deploy"
--
-- Rollout safety
-- --------------
-- Empty table on creation. Table ships BEFORE the code that writes to
-- it, so a rolling deploy never sees an INSERT against a missing table.
-- No FK to users.id because eval runs are system-invoked, not
-- user-initiated; `run_batch_id` is the only cross-row anchor.

CREATE TABLE `ai_eval_runs` (
  `id` varchar(36) NOT NULL,
  `run_batch_id` varchar(36) NOT NULL,
  `commit_sha` varchar(40) DEFAULT NULL,
  `op` varchar(32) NOT NULL,
  `golden_id` varchar(128) NOT NULL,
  `provider_id` varchar(32) NOT NULL,
  `model` varchar(128) NOT NULL,
  `passed` int NOT NULL,
  `score_rubric` json NOT NULL,
  `overall_score` int NOT NULL,
  `latency_ms` int NOT NULL,
  `tokens_in` int DEFAULT NULL,
  `tokens_out` int DEFAULT NULL,
  `cost_micros` bigint DEFAULT NULL,
  `error_message` varchar(512) DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ai_eval_runs_op_created_idx` (`op`, `created_at`),
  KEY `ai_eval_runs_batch_idx` (`run_batch_id`),
  KEY `ai_eval_runs_commit_op_idx` (`commit_sha`, `op`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
