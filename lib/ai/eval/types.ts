/**
 * Phase A / Task #14 — eval harness types + per-op quality floor.
 *
 * These types are the contract between:
 *   - golden-set.ts  (fixtures)
 *   - rubric.ts      (pure deterministic scoring primitives)
 *   - runner.ts      (orchestrator — runs fixtures, scores, persists)
 *   - scripts/test-ai-evals.mjs (test harness)
 *   - scripts/run-ai-evals.mjs  (CLI, live router)
 *
 * Design notes
 * ------------
 * 1. Deterministic rubric only in v1. Each `RubricCheck` either passes
 *    or fails for a given (input, output) pair — no LLM judges, no
 *    coin flips, no external services. A trailing-7d floor alarm
 *    (Phase B) is only useful if yesterday's 0.94 pass rate vs. this
 *    morning's 0.82 is a real signal, not noise.
 *
 * 2. Scores are basis points (0–10000). Keeps `overall_score` in the
 *    same unit as `ai_daily_margin.margin_bps` so dashboards can use
 *    one number formatter.
 *
 * 3. `OP_QUALITY_FLOOR` is per-op trailing-7d pass-rate minimum, also
 *    in basis points. A lower floor on `chat` (conversational — more
 *    output variance) than on `table` (structured JSON — should be
 *    ~all-pass) bakes the expected determinism into the alarm.
 */

import type { AIOp } from "../router";

/**
 * One golden-set fixture. `input` is whatever the op's caller would
 * pass at the app layer — runner.ts is responsible for shaping it into
 * a `ChatInput` using the same prompt-construction code paths the real
 * routes use (so the eval exercises the live prompt, not a stub).
 *
 * `expectations` is the deterministic payload the rubric needs to
 * judge the output. Each `check` name must resolve to a function in
 * rubric.ts (the runner looks them up by string → no stringly-typed
 * surprises in production; the test harness asserts every referenced
 * check exists).
 */
export type GoldenItem = {
  /** Stable id. (op, id) is the natural key across time. */
  id: string;
  /** One-line human description. Shown in CLI output + admin UI. */
  label: string;
  op: AIOp;
  /**
   * The raw user-supplied content. Shape depends on op:
   *   - translate / summarize / rewrite: `{ text: string, targetLang?: string, depth?: string }`
   *   - compare: `{ a: string, b: string }`
   *   - sign / generate: `{ prompt: string }`
   *   - table / redact: `{ text: string }`
   *   - ocr: NOT v1 (needs PDF bytes — defer to Phase B)
   *   - chat: `{ messages: Array<{ role, content }> }`
   *
   * Validated at runtime by runner.ts against the op's expected shape.
   */
  input: Record<string, unknown>;
  /**
   * Ordered list of checks to run against the output. `weight` sums
   * across checks to the threshold (typically 100 — so each check's
   * weight is the % of the score it contributes).
   */
  checks: RubricCheckSpec[];
  /**
   * Basis-points threshold the aggregate must clear for `passed=1`.
   * Default 7000 (70%) — tunable per-fixture for particularly
   * forgiving or strict cases.
   */
  thresholdBps?: number;
};

/**
 * Declarative spec for one check against the output. `kind` must match
 * a function exported from rubric.ts; `args` is passed through.
 */
export type RubricCheckSpec = {
  id: string;
  label: string;
  /**
   * Points contributed if the check passes. Scales the aggregate score
   * — weights across checks for a fixture typically sum to 100.
   */
  weight: number;
  kind: RubricCheckKind;
  /** Per-kind arguments. Validated at check-lookup time. */
  args?: Record<string, unknown>;
};

/**
 * Names of the deterministic rubric primitives. Adding a new one
 * requires (a) implementing in rubric.ts, (b) extending this union,
 * (c) updating the runner dispatch table. Test harness asserts
 * coverage.
 */
export type RubricCheckKind =
  | "outputNonEmpty"
  | "numericPreservation"
  | "noPreamble"
  | "codeIdentifierPassthrough"
  | "outputLengthWithinCap"
  | "containsAll"
  | "containsNone"
  | "matchesRegex"
  | "isValidJson"
  | "jsonHasKeys"
  | "languageMarker";

/**
 * Result of running ONE check. `passed` is 0|1 — int, not boolean,
 * so we can JSON-persist + sum it cheaply downstream.
 */
export type RubricCheckResult = {
  id: string;
  label: string;
  weight: number;
  passed: 0 | 1;
  /** Free-form one-liner. Populated when the check fails. */
  detail?: string;
};

/**
 * Aggregate scored output for one golden-set run.
 *
 * `scoreBps` = sum(weight * passed) / sum(weight) * 10_000, clamped to
 * [0, 10000]. `thresholdBps` is the fixture threshold (default 7000).
 * `passed` is `1` iff `scoreBps >= thresholdBps` AND every check with
 * `weight > 0` was evaluated without error.
 */
export type RubricScore = {
  checks: RubricCheckResult[];
  scoreBps: number;
  thresholdBps: number;
  passed: 0 | 1;
};

/**
 * Output of one full (op, golden_id) run. This is the shape persisted
 * to `ai_eval_runs`. `runner.ts` constructs it; the test harness
 * asserts field-by-field against the migration + Drizzle table.
 */
export type EvalRunResult = {
  runBatchId: string;
  commitSha: string | null;
  op: AIOp;
  goldenId: string;
  providerId: string;
  model: string;
  passed: 0 | 1;
  scoreRubric: RubricScore;
  overallScore: number;
  latencyMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costMicros: number | null;
  errorMessage: string | null;
};

/**
 * Per-op trailing-7d pass-rate floor in basis points. If the nightly
 * rollup (Phase B) finds any op below its floor for 7 consecutive
 * days, the same Slack channel as the margin alarm gets pinged.
 *
 * Tuning rationale (v1 — expect to revise after first month of data):
 *   - Structured-output ops (`table`, `redact`) → 9000 (90%). Regex
 *     + shape checks should be near-deterministic; any real drop
 *     below 90% means the prompt or the model broke.
 *   - Deterministic-output ops (`compare`, `sign`) → 8500 (85%).
 *     Slightly more latitude — they involve natural-language framing
 *     around the structured payload.
 *   - Creative-text ops (`summarize`, `generate`, `rewrite`) → 8000
 *     (80%). Some variance in output phrasing is normal; floor
 *     catches regressions in numeric preservation + prompt
 *     adherence.
 *   - Natural-language ops (`translate`, `chat`) → 7500 (75%).
 *     Most phrasing variance — we're checking preservation of
 *     codes/numbers + language markers, not style.
 *   - `ocr` → 8500 (85%) once v1 adds PDF fixtures (Phase B).
 *     Placeholder for now so the union stays exhaustive.
 */
export const OP_QUALITY_FLOOR: Record<AIOp, number> = {
  ocr: 8500,
  translate: 7500,
  chat: 7500,
  summarize: 8000,
  compare: 8500,
  generate: 8000,
  sign: 8500,
  rewrite: 8000,
  table: 9000,
  redact: 9000,
};

/** Default fixture-level threshold when a GoldenItem doesn't set one. */
export const DEFAULT_FIXTURE_THRESHOLD_BPS = 7000;
