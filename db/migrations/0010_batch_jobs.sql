-- 0010_batch_jobs.sql
-- Phase A / Task #13 — OpenAI Batch API adapter for non-urgent ops.
--
-- Background
-- ----------
-- OpenAI's Batch API runs asynchronously with a 24-hour SLA and a flat
-- 50% discount on input + output token pricing. For ops where the user
-- doesn't need an immediate answer — "summarize this 200-page PDF
-- overnight", "translate this annual report by tomorrow" — routing
-- through batch cuts realized AI cost in half.
--
-- Realtime routes (unchanged) call the provider's streaming chat endpoint
-- and respond inside the request. Batch routes instead:
--   1. Shape every op-level request into one JSONL line with a stable
--      `custom_id`.
--   2. Upload the JSONL, POST /v1/batches with endpoint="/v1/chat/completions"
--      and completion_window="24h".
--   3. Persist a `batch_jobs` row capturing the submission (this table).
--   4. The user polls /api/ai/batch/[jobId]; the polling route calls
--      OpenAI's batches.retrieve(), and when status="completed" it
--      downloads the output_file_id, parses the JSONL, writes the
--      ai_outputs + files rows exactly like a realtime route would, and
--      stamps the batch_jobs row completed.
--
-- Ops wired for batch in Task #13: summarize + translate. Kill-switches
-- and per-user cost ceilings still apply at submission time — a user
-- who's already hit their daily cap can't submit a batch.
--
-- Credit accounting
-- -----------------
-- Credits are spent at SUBMISSION (same as realtime — the user pays up
-- front with an idempotency key). The 50% discount applies to
-- `ai_usage.cost_micros`, NOT to user-facing credits. Rationale:
--   - Credits are our abstraction; cost_micros is what we actually pay
--     OpenAI. The margin win from batch flows to US, not to the user.
--   - If we discounted credits, users would always pick batch, and our
--     realtime p99 latency SLO would become impossible to staff.
--   - A 24h SLA is materially worse UX than realtime; charging the same
--     credits compensates the user with... convenience of their choice.
-- Failure handling: if OpenAI reports batch status="failed" or "expired",
-- we refund the credits via the existing `refundCredits` helper using the
-- original idempotency key.
--
-- Schema
-- ------
--   id                       varchar(36)  PK  (UUID v4)
--   user_id                  varchar(255) NOT NULL  FK → users.id ON DELETE CASCADE
--   op                       varchar(32)  NOT NULL  ("summarize" | "translate" for Task #13)
--   openai_batch_id          varchar(128) NOT NULL  (OpenAI's batch_... id)
--   status                   varchar(32)  NOT NULL  ("submitted" | "in_progress" | "completed" | "failed" | "expired" | "cancelled" | "finalized")
--                                                     "finalized" is OUR terminal state — the batch completed AND we've
--                                                     written ai_outputs + files. Distinct from OpenAI's "completed"
--                                                     which only means the JSONL is ready to download.
--   request_count            int          NOT NULL  (number of JSONL lines submitted — 1 for summarize, N for translate)
--   op_payload               json         NOT NULL  (inputs we need to replay the op: filename, depth, targetLanguage,
--                                                     custom_id map, sha256 — enough to re-build the answer on finalize)
--   result_payload           json         NULL      (filled on finalize: tokens, stopReasons, model, etc.)
--   idempotency_key          varchar(128) NOT NULL  (client-supplied; unique per user — prevents double-submit)
--   result_file_id           varchar(128) NULL      (OpenAI output_file_id)
--   error_file_id            varchar(128) NULL      (OpenAI error_file_id — populated on partial or full failure)
--   error_message            varchar(512) NULL      (human-readable failure summary for the UI)
--   tokens_in                bigint       NULL      (aggregate input tokens across all JSONL lines, post-finalize)
--   tokens_out               bigint       NULL      (aggregate output tokens, post-finalize)
--   cost_micros              bigint       NULL      (post-50%-discount cost in µUSD; written to ai_usage.cost_micros on finalize)
--   output_file_id           varchar(36)  NULL      (FK → files.id once finalize wrote the /app/files entry; nullable
--                                                     because a failed batch never produces a file row)
--   submitted_at             timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
--   completed_at             timestamp(3) NULL      (set when status transitions to "finalized" or a terminal failure)
--   created_at               timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
--   updated_at               timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
--
-- Indexes
--   (user_id, submitted_at DESC)  — "show me my batch jobs" list
--   (status, submitted_at)        — operator sweep for stuck / stale jobs
--   UNIQUE (user_id, idempotency_key) — double-submit protection
--
-- Rollout safety
-- --------------
-- Empty table on creation — the submit/poll routes are gated by a new
-- form field (`mode=batch`) that clients must opt into. Existing
-- realtime flows are byte-for-byte unchanged and never touch this table.
-- The table ships BEFORE the code that writes to it, so a rolling
-- deploy never sees a route INSERTing into a non-existent table.

CREATE TABLE `batch_jobs` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `op` varchar(32) NOT NULL,
  `openai_batch_id` varchar(128) NOT NULL,
  `status` varchar(32) NOT NULL,
  `request_count` int NOT NULL,
  `op_payload` json NOT NULL,
  `result_payload` json NULL,
  `idempotency_key` varchar(128) NOT NULL,
  `result_file_id` varchar(128) NULL,
  `error_file_id` varchar(128) NULL,
  `error_message` varchar(512) NULL,
  `tokens_in` bigint NULL,
  `tokens_out` bigint NULL,
  `cost_micros` bigint NULL,
  `output_file_id` varchar(36) NULL,
  `submitted_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` timestamp(3) NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `batch_jobs_user_idem_uq` (`user_id`, `idempotency_key`),
  KEY `batch_jobs_user_submitted_idx` (`user_id`, `submitted_at`),
  KEY `batch_jobs_status_submitted_idx` (`status`, `submitted_at`),
  CONSTRAINT `batch_jobs_user_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `batch_jobs_output_file_fk`
    FOREIGN KEY (`output_file_id`) REFERENCES `files` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
