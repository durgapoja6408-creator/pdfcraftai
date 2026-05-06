-- 0026_eval_human_grades.sql — human eval grading layer (PENDING §6a)
--
-- Plan ref: docs/PENDING_WORK_ANALYSIS.md §6a (no human eval loop).
-- Phase A Task #14 (commit f02c5b3) shipped the automated rubric
-- layer: golden-set fixtures, deterministic checks (no LLM-judge),
-- runner.ts persists ai_eval_runs rows. What's MISSING from a real
-- "weekly grading rubric" is the HUMAN judgment layer on top:
-- relevance / completeness / faithfulness / actionability scores
-- that humans assign to actual AI output and that the team can
-- review weekly.
--
-- This migration ships the storage foundation for the human-grading
-- layer following the same staging discipline as the prior 8
-- foundations this session: schema + read paths land NOW; writers +
-- grader UI come later (Phase G).
--
-- New table: eval_human_grades
-- ---------------------------
-- One row per (golden-set-fixture, provider, model, op, run) +
-- grader user combo. The same fixture may be graded by multiple
-- humans — we keep all opinions and aggregate at read time. Calling
-- this `eval_human_grades` (not `ai_eval_human_grades`) because the
-- prefix `ai_` already means "operational AI usage" in this repo
-- (ai_usage / ai_outputs / ai_feedback / ai_eval_runs); the human-
-- grade table sits beside `ai_eval_runs` not on top of it.
--
-- Columns
--   id                      varchar(36) PK — UUID
--   golden_set_id           varchar(64)    — references the fixture
--                                            id in lib/ai/eval/golden-set.ts.
--                                            App-layer string match (no
--                                            FK because golden-set lives
--                                            in code, not DB).
--   operation               varchar(32)    — "summarize" | "translate" |
--                                            "compare" | "rewrite" | …
--                                            same enum that ai_usage uses
--   provider_id             varchar(32)    — "anthropic" | "openai" | "gemini"
--                                            same enum that ai_usage uses
--   model                   varchar(128)   — "claude-3-5-haiku" / "gpt-4o-mini" / …
--   eval_run_id             varchar(36)   — optional FK app-layer reference
--                                           to ai_eval_runs.id; NULL means
--                                           this grade was on a fresh
--                                           regenerate-and-grade rather than
--                                           an existing automated run row
--   grader_user_id          varchar(255)   — admin user who entered the grade
--   score_relevance         tinyint(unsigned) — 1..5 Likert
--   score_completeness      tinyint(unsigned) — 1..5
--   score_faithfulness      tinyint(unsigned) — 1..5 (output sticks to
--                                                source; no hallucinations)
--   score_actionability     tinyint(unsigned) — 1..5 (would the user act
--                                                on this?)
--   notes                   text          — free-text grader comments
--   ai_output_excerpt       text          — sample of the output the
--                                           human graded; we store this
--                                           so weekly reviews can re-read
--                                           what the grader saw without
--                                           re-running the AI. Truncated
--                                           to 4KB at write time.
--   created_at              timestamp(3)
--
-- Indexes
--   PRIMARY KEY (id)
--   UNIQUE (golden_set_id, provider_id, model, operation, grader_user_id)
--     — one grade per (fixture × provider × model × op × grader)
--     combo. A grader can re-score the same fixture if they want
--     by deleting the prior row and re-inserting (the unique
--     constraint forces them to acknowledge they're overwriting).
--   (operation, created_at)            — admin "show me recent
--                                         summarize grades"
--   (provider_id, model, operation)    — aggregate "show me Anthropic
--                                         3-5-haiku summarize avg
--                                         score over time"
--   (grader_user_id, created_at)       — admin "what did Sam grade
--                                         last week"
--
-- Why we don't FK golden_set_id to a DB table
--   The golden-set lives in code (lib/ai/eval/golden-set.ts) so it
--   evolves with the repo, not via DB migrations. App-layer string
--   match means a removed fixture leaves orphan grade rows but the
--   admin viewer can detect that ("fixture 'summarize.long-doc' no
--   longer exists in golden-set; preserved for history"). The
--   alternative — moving the golden-set to a DB table — would
--   require a schema migration for every fixture change, which
--   defeats the "code-as-source-of-truth" goal.
--
-- Why we don't FK eval_run_id to ai_eval_runs
--   Same reason: ai_eval_runs is operational data; older rows get
--   archived/deleted on a different cadence than human grade rows
--   (which we want to keep for trend analysis). App-layer ref keeps
--   them loosely coupled.
--
-- Rollout safety
--   New table only. Zero existing-row impact. Indexes built on
--   empty table — sub-second migration.
--
-- Rollback: DROP TABLE eval_human_grades;

CREATE TABLE `eval_human_grades` (
  `id` varchar(36) NOT NULL,
  `golden_set_id` varchar(64) NOT NULL,
  `operation` varchar(32) NOT NULL,
  `provider_id` varchar(32) NOT NULL,
  `model` varchar(128) NOT NULL,
  `eval_run_id` varchar(36) DEFAULT NULL,
  `grader_user_id` varchar(255) NOT NULL,
  `score_relevance` tinyint unsigned NOT NULL,
  `score_completeness` tinyint unsigned NOT NULL,
  `score_faithfulness` tinyint unsigned NOT NULL,
  `score_actionability` tinyint unsigned NOT NULL,
  `notes` text DEFAULT NULL,
  `ai_output_excerpt` text DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `eval_human_grades_pk` PRIMARY KEY (`id`),
  CONSTRAINT `eval_human_grades_unique` UNIQUE (
    `golden_set_id`,
    `provider_id`,
    `model`,
    `operation`,
    `grader_user_id`
  )
);

CREATE INDEX `eval_human_grades_op_created_idx`
  ON `eval_human_grades` (`operation`, `created_at`);

CREATE INDEX `eval_human_grades_provider_model_op_idx`
  ON `eval_human_grades` (`provider_id`, `model`, `operation`);

CREATE INDEX `eval_human_grades_grader_created_idx`
  ON `eval_human_grades` (`grader_user_id`, `created_at`);
