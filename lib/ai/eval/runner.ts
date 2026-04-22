/**
 * Phase A / Task #14 — eval runner.
 *
 * Orchestrates: load golden set → for each fixture, build a ChatInput,
 * call route() + provider.chat(), score the output against the
 * declared rubric, persist to `ai_eval_runs`.
 *
 * Design notes
 * ------------
 * 1. The runner builds a minimal per-op ChatInput inline rather than
 *    calling the full op modules (summarize.ts, translate.ts, etc.).
 *    Those are `server-only` and do chunking + moderation + the whole
 *    app-layer shuttle. For eval purposes we want to isolate the
 *    MODEL's behaviour at a single prompt — if the full op-module
 *    regresses we'd rather blame the prompt + router flip, not a
 *    bug in chunk reassembly.
 *
 *    Phase B can add a second runner that calls the full op modules
 *    via a `mode: "op" | "raw"` flag; for v1 this keeps the harness
 *    fast + deterministic.
 *
 * 2. Dry-run mode (`dryRun: true`): score a stubbed output against
 *    the rubric without hitting any AI provider. Used by the test
 *    harness to exercise the rubric + persistence without burning
 *    live tokens or depending on network.
 *
 * 3. `persist: false` skips the DB write. Used by the test harness
 *    to run end-to-end without polluting `ai_eval_runs`.
 *
 * 4. Every run inside one `runEvals()` call shares a `runBatchId` so
 *    the admin UI (Phase B) can group them.
 */

import "server-only";

import { randomUUID } from "crypto";

import { db } from "@/db/client";
import { aiEvalRuns } from "@/db/schema/app";

import { capForOp } from "../output-caps";
import type { AIProvider } from "../provider";
import { route } from "../router";
import type { AIOp } from "../router";
import type { ChatInput, ChatMessage } from "../types";

import { GOLDEN_SET, goldenSetForOp } from "./golden-set";
import { RUBRIC_CHECKS, type CheckOutcome } from "./rubric";
import {
  DEFAULT_FIXTURE_THRESHOLD_BPS,
  type EvalRunResult,
  type GoldenItem,
  type RubricCheckResult,
  type RubricScore,
} from "./types";

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

export type RunEvalsOptions = {
  /** Restrict to these ops. Default: every op with fixtures. */
  ops?: AIOp[];
  /** Restrict to these golden ids within the selected ops. */
  goldenIds?: string[];
  /**
   * When true, don't hit any AI provider — use `dryRunOutput` (or a
   * stub) and score that against the rubric. Default: false.
   */
  dryRun?: boolean;
  /** Used in dryRun: the canned output to score. */
  dryRunOutput?: string;
  /** Write to `ai_eval_runs`. Default: true. */
  persist?: boolean;
  /** Exposed for deterministic test output. */
  runBatchId?: string;
};

export type RunEvalsSummary = {
  runBatchId: string;
  commitSha: string | null;
  started: string; // ISO
  finished: string; // ISO
  results: EvalRunResult[];
  perOpPassRateBps: Record<string, number>;
  overallPassRateBps: number;
};

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

export async function runEvals(
  opts: RunEvalsOptions = {}
): Promise<RunEvalsSummary> {
  const runBatchId = opts.runBatchId ?? randomUUID();
  const commitSha = process.env.COMMIT_SHA?.trim() || null;
  const persist = opts.persist ?? true;
  const dryRun = opts.dryRun ?? false;

  const started = new Date();

  const fixtures = selectFixtures(opts);
  const results: EvalRunResult[] = [];

  for (const fixture of fixtures) {
    const result = await runOneFixture(fixture, {
      runBatchId,
      commitSha,
      dryRun,
      dryRunOutput: opts.dryRunOutput,
    });
    results.push(result);
    if (persist) {
      await persistEvalRun(result);
    }
  }

  const finished = new Date();

  // Per-op pass rate in bps (e.g. 3/4 → 7500).
  const perOp: Record<string, { passed: number; total: number }> = {};
  for (const r of results) {
    const slot = perOp[r.op] ?? { passed: 0, total: 0 };
    slot.passed += r.passed;
    slot.total += 1;
    perOp[r.op] = slot;
  }
  const perOpPassRateBps: Record<string, number> = {};
  for (const [op, { passed, total }] of Object.entries(perOp)) {
    perOpPassRateBps[op] =
      total === 0 ? 0 : Math.round((passed / total) * 10000);
  }
  const totalPassed = results.reduce((a, r) => a + r.passed, 0);
  const overallPassRateBps =
    results.length === 0
      ? 0
      : Math.round((totalPassed / results.length) * 10000);

  return {
    runBatchId,
    commitSha,
    started: started.toISOString(),
    finished: finished.toISOString(),
    results,
    perOpPassRateBps,
    overallPassRateBps,
  };
}

/* ------------------------------------------------------------------ */
/* Fixture selection                                                   */
/* ------------------------------------------------------------------ */

function selectFixtures(opts: RunEvalsOptions): GoldenItem[] {
  let fixtures = GOLDEN_SET;
  if (opts.ops && opts.ops.length > 0) {
    const set = new Set(opts.ops);
    fixtures = fixtures.filter((f) => set.has(f.op));
  }
  if (opts.goldenIds && opts.goldenIds.length > 0) {
    const set = new Set(opts.goldenIds);
    fixtures = fixtures.filter((f) => set.has(f.id));
  }
  return fixtures;
}

/* ------------------------------------------------------------------ */
/* Single-fixture execution                                            */
/* ------------------------------------------------------------------ */

type RunContext = {
  runBatchId: string;
  commitSha: string | null;
  dryRun: boolean;
  dryRunOutput?: string;
};

export async function runOneFixture(
  fixture: GoldenItem,
  ctx: RunContext
): Promise<EvalRunResult> {
  const t0 = Date.now();

  // 1. Build the ChatInput the router will actually see. Per-op shape
  //    mirrors what the production route handler sends, minus app
  //    concerns (chunking, moderation, credit accounting).
  const { chatInput, systemPrompt, userPrompt } = buildChatInputForFixture(fixture);

  // 2. Invoke — or stub in dry-run.
  let providerId = "dryrun";
  let model = "dryrun";
  let output = "";
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  let errorMessage: string | null = null;

  if (ctx.dryRun) {
    output = ctx.dryRunOutput ?? "";
    providerId = "dryrun";
    model = "dryrun";
  } else {
    try {
      const provider: AIProvider = await route(fixture.op);
      providerId = provider.id;
      const result = await provider.chat(chatInput);
      output = result.text;
      model = result.model;
      tokensIn = result.usage?.inputTokens ?? null;
      tokensOut = result.usage?.outputTokens ?? null;
    } catch (err) {
      errorMessage = truncate((err as Error).message ?? String(err), 500);
    }
  }

  const latencyMs = Date.now() - t0;

  // 3. Score.
  const scoreRubric = scoreOutput(fixture, output, errorMessage);
  const overallScore = scoreRubric.scoreBps;
  const passed = scoreRubric.passed;

  return {
    runBatchId: ctx.runBatchId,
    commitSha: ctx.commitSha,
    op: fixture.op,
    goldenId: fixture.id,
    providerId,
    model,
    passed,
    scoreRubric,
    overallScore,
    latencyMs,
    tokensIn,
    tokensOut,
    costMicros: null, // v1: not populated (eval runs don't hit ai_usage).
    errorMessage,
  };
}

/* ------------------------------------------------------------------ */
/* Rubric scoring                                                      */
/* ------------------------------------------------------------------ */

export function scoreOutput(
  fixture: GoldenItem,
  output: string,
  errorMessage: string | null
): RubricScore {
  const threshold = fixture.thresholdBps ?? DEFAULT_FIXTURE_THRESHOLD_BPS;

  // If the op threw, every check fails with the error message as
  // detail, and score is 0. Keeps the persisted shape consistent.
  if (errorMessage) {
    const checks: RubricCheckResult[] = fixture.checks.map((spec) => ({
      id: spec.id,
      label: spec.label,
      weight: spec.weight,
      passed: 0,
      detail: `op errored: ${errorMessage}`,
    }));
    return { checks, scoreBps: 0, thresholdBps: threshold, passed: 0 };
  }

  const checks: RubricCheckResult[] = [];
  let weightedPassed = 0;
  let weightTotal = 0;

  for (const spec of fixture.checks) {
    const fn = RUBRIC_CHECKS[spec.kind];
    let outcome: CheckOutcome;
    if (!fn) {
      outcome = {
        passed: 0,
        detail: `rubric bug: no check registered for kind "${spec.kind}"`,
      };
    } else {
      try {
        outcome = fn(output, spec.args ?? {});
      } catch (err) {
        outcome = {
          passed: 0,
          detail: `rubric threw: ${(err as Error).message}`,
        };
      }
    }
    checks.push({
      id: spec.id,
      label: spec.label,
      weight: spec.weight,
      passed: outcome.passed,
      detail: outcome.detail,
    });
    weightTotal += spec.weight;
    if (outcome.passed === 1) weightedPassed += spec.weight;
  }

  const scoreBps =
    weightTotal === 0
      ? 0
      : Math.min(10000, Math.max(0, Math.round((weightedPassed / weightTotal) * 10000)));
  const passed: 0 | 1 = scoreBps >= threshold ? 1 : 0;

  return { checks, scoreBps, thresholdBps: threshold, passed };
}

/* ------------------------------------------------------------------ */
/* Per-op prompt construction                                          */
/* ------------------------------------------------------------------ */

/**
 * Minimal per-op prompt builder. Mirrors the production prompts'
 * structural intent — "no preamble", "preserve numbers", etc. — so a
 * model that regresses against those directives shows up here. The
 * full production prompts live in lib/ai/{translate,summarize,…}.ts;
 * those are `server-only` and do chunking, so the runner keeps a
 * parallel minimal version.
 *
 * When a production prompt changes its quality-critical directive
 * (e.g. Task #11's cap tightening, M4's no-preamble rule), update
 * the mirror here too. `scripts/test-ai-evals.mjs` smoke-tests that
 * every op with fixtures has a builder here (no silent fallthrough).
 */
export function buildChatInputForFixture(fixture: GoldenItem): {
  chatInput: ChatInput;
  systemPrompt: string;
  userPrompt: string;
} {
  const builder = PROMPT_BUILDERS[fixture.op];
  if (!builder) {
    throw new Error(
      `eval runner: no prompt builder for op "${fixture.op}". Add one to PROMPT_BUILDERS in runner.ts.`
    );
  }
  const { systemPrompt, userPrompt } = builder(fixture.input);
  const messages: ChatMessage[] = [{ role: "user", content: userPrompt }];
  const chatInput: ChatInput = {
    messages,
    systemPrompt,
    maxTokens: capForOp(fixture.op),
    temperature: 0, // deterministic eval inputs
  };
  return { chatInput, systemPrompt, userPrompt };
}

type PromptBuilder = (input: Record<string, unknown>) => {
  systemPrompt: string;
  userPrompt: string;
};

export const PROMPT_BUILDERS: Partial<Record<AIOp, PromptBuilder>> = {
  translate(input) {
    const text = String(input.text ?? "");
    const targetLang = String(input.targetLang ?? "");
    const systemPrompt =
      `You are a translator. Translate the user's text into ${targetLang}. ` +
      `Preserve ALL numbers, codes, identifiers, emails, URLs, and proper nouns ` +
      `verbatim — do not translate them. Do not add any preamble, explanation, ` +
      `or commentary. Return ONLY the translated text.`;
    const userPrompt = text;
    return { systemPrompt, userPrompt };
  },
  summarize(input) {
    const text = String(input.text ?? "");
    const depth = String(input.depth ?? "standard");
    const systemPrompt =
      `You are a summarizer. Produce a ${depth} summary of the user's text. ` +
      `Preserve ALL numbers exactly as stated. Do not add any preamble, ` +
      `explanation, or commentary — return ONLY the summary.`;
    const userPrompt = text;
    return { systemPrompt, userPrompt };
  },
  compare(input) {
    const a = String(input.a ?? "");
    const b = String(input.b ?? "");
    const systemPrompt =
      `You are a document comparator. The user supplies two versions labelled ` +
      `A and B. Describe the material differences between them. Preserve ALL ` +
      `numbers exactly as stated. Do not add preamble or commentary — return ` +
      `ONLY the comparison.`;
    const userPrompt = `A:\n${a}\n\nB:\n${b}`;
    return { systemPrompt, userPrompt };
  },
  rewrite(input) {
    const text = String(input.text ?? "");
    const tone = String(input.tone ?? "clear");
    const systemPrompt =
      `You are a rewriter. Rewrite the user's text in a ${tone} tone. ` +
      `Preserve ALL numbers, codes, identifiers, emails, URLs, and proper ` +
      `nouns verbatim. Do not add preamble or commentary — return ONLY the ` +
      `rewritten text.`;
    const userPrompt = text;
    return { systemPrompt, userPrompt };
  },
  table(input) {
    const text = String(input.text ?? "");
    const systemPrompt =
      `You are a table extractor. Extract structured tabular data from the ` +
      `user's text as a JSON array of objects. Each object MUST include an ` +
      `"item" key. Preserve numbers verbatim. Return ONLY the JSON — no ` +
      `preamble, no code fence.`;
    const userPrompt = text;
    return { systemPrompt, userPrompt };
  },
  redact(input) {
    const text = String(input.text ?? "");
    const systemPrompt =
      `You are a PII redactor. Replace email addresses and phone numbers in ` +
      `the user's text with bracketed tags ([EMAIL], [PHONE]). Preserve ` +
      `everything else verbatim, including order ids and times. Return ONLY ` +
      `the redacted text — no preamble.`;
    const userPrompt = text;
    return { systemPrompt, userPrompt };
  },
};

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

export async function persistEvalRun(result: EvalRunResult): Promise<void> {
  await db.insert(aiEvalRuns).values({
    id: randomUUID(),
    runBatchId: result.runBatchId,
    commitSha: result.commitSha,
    op: result.op,
    goldenId: result.goldenId,
    providerId: result.providerId,
    model: result.model,
    passed: result.passed,
    scoreRubric: result.scoreRubric,
    overallScore: result.overallScore,
    latencyMs: result.latencyMs,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costMicros: result.costMicros,
    errorMessage: result.errorMessage,
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

/**
 * Read-only convenience used by the test harness + any future admin
 * surface: list the ops that actually have fixtures.
 */
export function opsWithFixtures(): AIOp[] {
  const seen = new Set<AIOp>();
  for (const f of GOLDEN_SET) seen.add(f.op);
  return Array.from(seen).sort();
}

export { goldenSetForOp };
