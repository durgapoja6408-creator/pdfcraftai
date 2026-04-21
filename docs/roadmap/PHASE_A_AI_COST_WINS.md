# Phase A: Code-only AI cost wins

_Scope: pure code changes that reduce AI provider spend and add safety rails. No schema changes. No external dependencies (no Paddle/Razorpay/GSTIN work). Every task is reversible with a single git revert._

_Target: 30–40% reduction in per-call AI cost for Claude-served ops once caching is wired, plus hard ceilings that prevent runaway spend._

## Task #10 — Anthropic prompt caching

**What.** Wire Anthropic's prompt caching feature. Cached input tokens cost 25% of base (75% discount on write) and cache reads cost 10% of base (90% discount). System prompts + few-shot examples are perfect candidates.

**Files to touch.**
- `lib/ai/adapters/anthropic.ts` — add `cache_control: { type: "ephemeral" }` block after the system prompt and any stable prefix.
- `lib/ai/prompts/*.ts` (wherever system prompts live) — mark the cacheable segment.
- `lib/ai/types.ts` — extend usage type to track `cache_creation_input_tokens` + `cache_read_input_tokens`.
- `lib/ai/cost-calculator.ts` (or wherever cost_micros is computed) — apply cache pricing tiers: write = base × 1.25, read = base × 0.10.
- `db/schema.ts` — add `cache_read_input_tokens` + `cache_creation_input_tokens` to `ai_usage`.
- Drizzle migration for the two new columns.

**Acceptance criteria.**
- A Claude call with a stable system prompt returns a non-zero `cache_creation_input_tokens` on first call.
- Subsequent call within 5 minutes (TTL) returns a non-zero `cache_read_input_tokens` and lower `input_tokens`.
- `cost_micros` in `ai_usage` reflects the discounted rate (verifiable against raw API response's `cache_read_input_tokens`).
- `docs/ai/COST_MATRIX_3PROVIDER.md` updated with cache pricing row.
- Unit test confirms cost calc: `cache_read_tokens × base × 0.10` + `cache_creation_tokens × base × 1.25` + `input_tokens × base` matches adapter output.

**Test plan.**
- `scripts/test-anthropic-cache.mjs` — calls summarize twice within 10s, asserts second call has `cache_read_input_tokens > 0`.
- `node scripts/test-router.mjs` — confirm no assertion regressed.
- `npx tsc --noEmit` clean.

**Status:** planned. Commit SHA: `___`.

---

## Task #11 — Response-length caps per op (max_output_tokens)

**What.** Hard cap on `max_output_tokens` per AIOp. Prevents a "summarize this 400-page PDF" from generating a 20K-token response when the op should produce 500.

**Files to touch.**
- `lib/ai/router.ts` — add `OP_MAX_OUTPUT_TOKENS: Record<AIOp, number>` table. Initial values:
  - ocr: 8000 (large output OK for OCR)
  - translate: 4000
  - chat: 2000
  - summarize: 1500
  - compare: 2000
  - generate: 3000
  - sign: 500
  - rewrite: 3000
  - table: 4000
  - redact: 4000
- `lib/ai/adapters/anthropic.ts` + `openai.ts` + `gemini.ts` — pull the cap from router and pass to provider API.
- Emit `output_tokens_capped` boolean on `ai_usage` row when the cap was hit, so we can detect ops that are regularly bumping against the cap.

**Acceptance criteria.**
- A chat call that would generate 5000 tokens is capped at 2000.
- `ai_usage` row has `output_tokens <= OP_MAX_OUTPUT_TOKENS[op]`.
- `output_tokens_capped` is `true` when cap triggered, else `false`.
- Admin dashboard `/admin/ops` (Phase B) will later plot cap-hit rate.

**Test plan.**
- Add E-section assertion to `scripts/test-router.mjs` that `OP_MAX_OUTPUT_TOKENS` exists and has all 10 ops.
- Integration test: call chat op with input that would normally generate 5K tokens, verify output ≤ 2K.

**Status:** planned.

---

## Task #12 — Per-user daily cost ceiling + kill switches

**What.** Env-var kill switches for providers and ops. Per-user daily USD cost ceiling enforced in middleware before `route()` is called.

**Files to touch.**
- `lib/ai/kill-switches.ts` (new) — reads `AI_KILL_{PROVIDER}` + `AI_KILL_{OP}` env vars. Exports `isProviderKilled(id: ProviderId)` and `isOpKilled(op: AIOp)`.
- `lib/ai/router.ts` — consult kill switches before returning provider list; if provider killed, skip it in the ladder.
- `lib/ai/rate-limit.ts` (new) — `checkUserDailyCost(userId): { allowed: boolean, usedMicros: number, capMicros: number }`. Reads `USER_DAILY_COST_MICROS_CAP` env + per-user override from `user_rate_limits` table.
- `lib/ai/ops/*.ts` (all op entry points) — call rate-limit check before route(). Throw `DailyCostCeilingExceededError` if hit.
- `app/api/ai/*/route.ts` — catch and return 429 with Retry-After header.
- `db/schema.ts` — add `user_rate_limits` table.
- `app/admin/kill-switches/page.tsx` (new) — read-only display + instructions to toggle via Hostinger env vars (no direct DB mutation).

**Env vars introduced.**
- `AI_KILL_ANTHROPIC` — "true" disables Anthropic in router.
- `AI_KILL_OPENAI` — same for OpenAI.
- `AI_KILL_GEMINI` — same for Gemini.
- `AI_KILL_OCR`, `AI_KILL_TRANSLATE`, ... — per-op disable (returns 503 gracefully).
- `USER_DAILY_COST_MICROS_CAP` — default cap (e.g., `500000` = $0.50/user/day initially).

**Acceptance criteria.**
- Setting `AI_KILL_ANTHROPIC=true` + redeploying causes router to skip Anthropic; fall-through to OpenAI.
- User hitting daily cap gets 429 with clear message.
- Admin page at `/admin/kill-switches` shows current state (read-only). Admin users documented on how to toggle.

**Test plan.**
- Assertion in `scripts/test-router.mjs`: when env simulates kill, provider is removed from primary list.
- Integration: simulate 1000 calls from one user, verify 1001st is 429.

**Status:** planned.

---

## Task #13 — OpenAI Batch API adapter for non-urgent ops

**What.** OpenAI Batch API offers 50% discount for 24-hour turnaround. Wire as a secondary adapter for ops that can be queued (summarize with "run overnight" toggle, translate with "bulk" mode).

**Files to touch.**
- `lib/ai/adapters/openai-batch.ts` (new) — submits JSONL to `/v1/batches`, polls completion, parses results.
- `lib/ai/router.ts` — add `OP_BATCH_ELIGIBLE: Set<AIOp>` (initially `{ summarize, translate }`).
- `lib/ai/ops/summarize.ts` + `translate.ts` — accept `mode: "realtime" | "batch"` param. Batch mode returns a job ID.
- `app/api/ai/batch/[jobId]/route.ts` (new) — polling endpoint for client.
- `db/schema.ts` — add `batch_jobs` table (id, userId, op, openai_batch_id, status, submitted_at, completed_at, cost_micros).

**Acceptance criteria.**
- User can opt into batch mode from UI (UX work — can be API-only initially).
- Batch job tracked to completion; `ai_usage` gets a row with `batch_mode: true` + 50% pricing.
- Rate-limit check and kill switches still apply.

**Test plan.**
- `scripts/test-openai-batch.mjs` — submits a 5-request batch, polls, asserts results returned within 10min in testing.
- Unit test: cost calc applies 50% discount when `batch_mode: true`.

**Status:** planned. Lower priority than #10–#12; can defer if time-pressured.

---

## Task #14 — Eval harness scaffold + quality floor per op

**What.** Golden-set eval framework so we can objectively measure quality. Required for quality-constrained routing in Phase E.

**Files to touch.**
- `docs/ai/evals/golden.jsonl` (new) — per-op cases: `{ op, input, expected_rubric: {criteria: weight}, expected_output_sample }`.
- `scripts/eval-ops.mjs` (new) — runs each case against each configured provider, scores via rubric (LLM-as-judge or exact-match depending on op).
- `lib/ai/router.ts` — add `OP_QUALITY_FLOOR_BPS: Record<AIOp, number>`. Initial defaults: ocr 9000, translate 8500, summarize 8000, etc.
- `db/schema.ts` — add `eval_runs` table (id, commit_sha, op, provider, case_id, score_bps, passed, run_at).
- `app/admin/evals/page.tsx` (new) — read-only results view.

**Acceptance criteria.**
- `node scripts/eval-ops.mjs` runs all 10 ops × 3 providers × N cases, writes `eval_runs` rows.
- Summary report emitted: "OCR: Gemini 9234, Anthropic 9100, OpenAI 8950 (floor 9000) — OpenAI BELOW FLOOR".
- Admin page shows latest run per op × provider with pass/fail.

**Test plan.**
- Dry-run with 3 cases per op to validate pipeline. Full run with 20–50 cases per op to be scheduled nightly (Phase E cron).

**Status:** planned. Can ship MVP (one case per op) quickly; full golden-set is iterative.

---

## Phase A completion bar

- All five tasks shipped, each with its own commit and SHA recorded above.
- `node scripts/test-router.mjs` — 100% pass.
- `npx tsc --noEmit` — clean.
- `/api/health` green on production.
- One week of data captured showing: Claude cost/call before vs after caching, output-tokens distribution before vs after caps, zero kill-switch incidents (or documented response plan if any).
- `docs/STATUS.md` updated with Phase A completion.
