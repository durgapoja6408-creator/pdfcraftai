-- 0002_drop_agent_runs.sql
-- Drop Phase 6.3 agent tables after /app/studio deletion on 2026-04-20.
-- See db/schema/app.ts for context and docs/STATUS.md for the decision.
--
-- Safe to run multiple times (IF EXISTS).
-- Order matters: agent_run_steps has an FK to agent_runs, so drop child first.

DROP TABLE IF EXISTS agent_run_steps;
DROP TABLE IF EXISTS agent_runs;
