// lib/ai/prompts/registry.ts — Phase E / Task #26.
//
// Prompt version registry + A/B-testing resolver.
//
// Why this module exists
// ----------------------
// Phase A tightened every op's prompt for quality + margin (Tier 4 of
// the Net-Margin Roadmap), locking in a single "v1" prompt per op.
// That's good for correctness; it's bad for iteration velocity. Any
// future prompt change today means (a) edit the const string in the op
// module, (b) ship it to 100% of users, (c) hope nothing regresses, (d)
// if it does, roll back via another commit + deploy cycle. We cannot
// compare two variants side-by-side on real traffic, which means we
// cannot know if a new prompt is actually better — only that the old
// metrics changed when we shipped it, without a control group.
//
// This module replaces that workflow with a proper registry:
//
//   1. Prompts are data, not code. Each op has a list of PromptVersion
//      records at `PROMPT_REGISTRY[op]`. The op module looks up its
//      system-prompt renderer via the resolver, not by inlining a
//      const. Today v1 for every op IS the existing inline const —
//      same bytes, different indirection. But the indirection is the
//      point: adding v2 is now a registry-only change.
//
//   2. A/B routing is deterministic per user. `resolvePromptVersion(
//      op, seed)` hashes `(op, seed)` (seed is typically the userId
//      prefix) and deterministically picks a variant weighted by
//      each variant's `weightBps`. Same user + same op + same registry
//      config = same variant on every call. Switching a user between
//      variants mid-experiment is a registry edit (change weights)
//      followed by natural re-resolution on the next call — no state
//      to clean up.
//
//   3. Every resolved variant is recorded back into `ai_usage`
//      (columns added by migration 0014). `prompt_version` gets the
//      variant id; `experiment_id` gets the experiment id when the
//      resolution was randomized, NULL when it was deterministic
//      (single-variant at 100%). The margin-rollup slicer can then
//      produce a per-variant quality/cost split on command, which is
//      the output of the whole A/B testing apparatus.
//
// What this module intentionally does NOT do
// ------------------------------------------
//
//   - It does NOT render prompts. Each op still owns its
//     `buildSystemPrompt()` function — today. The registry advertises
//     which variant id is active for a given op; the op consults the
//     registry, branches on id (or defaults to v1's existing
//     builder), and proceeds. Moving the renderers INTO the registry
//     is a follow-up; for v1 the registry is a routing + recording
//     layer only, which keeps the blast radius of this commit small.
//
//   - It does NOT store anything in the DB. The registry IS the code
//     (this file). A/B experiments are edits to this file, not rows
//     in a table. That's a deliberate trade: experiments ship with
//     commits (reviewable, revert-able, auditable via git blame), at
//     the cost of not being runtime-tunable. For the scale this
//     product operates at, that trade favours reviewability.
//
//   - It does NOT do feature-flag-style targeting (e.g. "only users
//     on the Pro plan get v2"). Weighted random is sufficient for
//     the experiments we know we want to run; cohort-targeted
//     experiments can be added by extending PromptVersion with an
//     optional predicate later. YAGNI for v1.
//
//   - It does NOT write to `ai_usage` itself. The op module writes
//     via `recordAiUsage({ promptVersion, experimentId, ... })` as
//     it already writes every other audit field. This module just
//     returns the two strings for the caller to pass through.
//
// Deploy gotcha
// -------------
// Migration 0014 MUST land on Hostinger MySQL before any op starts
// passing `promptVersion`/`experimentId` to `recordAiUsage` — otherwise
// the INSERT throws "Unknown column" and the user-facing AI call 500s.
// The migration is additive/nullable (safe), but the code that WRITES
// those columns is gated behind this module's `RECORDING_ENABLED`
// constant. Flip it to true in the same commit that wires the summarize
// call-site; flip it back to false if the migration somehow fails
// post-deploy.

import "server-only";

import type { PromptSafetyOp } from "@/lib/ai/prompt-safety";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------
//
// `PromptOp` is a superset alias of `PromptSafetyOp` — every op that
// the prompt-safety wrapper covers can also carry a versioned prompt.
// The alias keeps this module decoupled from the exact AIOp shape
// (which evolves as we add ops like "outline" or "tone-check"); if a
// new op is added to PromptSafetyOp, it's automatically eligible here.

export type PromptOp = PromptSafetyOp;

/**
 * A single registered prompt variant for one op.
 *
 * Fields
 * ------
 *   op           — the op this variant belongs to. Mirrors the map key
 *                  to make single-variant lookups self-describing; the
 *                  test harness cross-validates map-key vs. struct
 *                  field agreement.
 *
 *   id           — human-readable stable id ("v1", "v2-concise",
 *                  "v3-expert-tone"). Persisted into
 *                  `ai_usage.prompt_version`. Changing an id is a
 *                  breaking change for historical rollup queries —
 *                  prefer adding a new id and deprecating old ones.
 *                  Max 32 chars (matches the DB column width).
 *
 *   enabled      — if false, the resolver ignores this variant even
 *                  if weightBps > 0. Use this to "pause" a variant
 *                  without deleting the config (so rollback is a
 *                  one-flag flip). When all variants on an op are
 *                  disabled, the resolver falls back to "v1" (the
 *                  forever-safe default).
 *
 *   weightBps    — 0..10000 weight in basis points. The resolver
 *                  normalizes weights across enabled variants, so
 *                  {A: 10000, B: 10000} is a 50/50 split (equivalent
 *                  to {A: 1, B: 1}). Using bps over percentage lets
 *                  us express 1%-granularity rollouts (100 bps) and
 *                  stays integer across the codebase.
 *
 *   createdAt    — ISO date the variant was added. Surfaces in the
 *                  admin page so operators can see rollout history.
 *
 *   description  — one-liner for the admin UI. No user-facing copy
 *                  — this is operator-facing only.
 */
export interface PromptVersion {
  op: PromptOp;
  id: string;
  enabled: boolean;
  weightBps: number;
  createdAt: string;
  description: string;
}

/**
 * An active experiment binds a stable experiment id to an op. When
 * the resolver finds >1 enabled variant for an op AND an experiment
 * is registered for that op, the resolved row gets stamped with the
 * experiment id — otherwise `experimentId` in the return is null,
 * signalling "this assignment was deterministic, not randomized".
 *
 * Fields
 * ------
 *   id           — stable slug, persisted into `ai_usage.experiment_id`.
 *                  Convention: <op>-<hypothesis>-<quarter>, e.g.
 *                  "summarize-concise-vs-balanced-2026Q2". Max 64.
 *
 *   op           — the op this experiment governs. One op can host at
 *                  most one active experiment at a time — the resolver
 *                  picks the FIRST match in registration order.
 *
 *   startedAt    — ISO date the experiment began collecting data.
 *
 *   endedAt      — optional; when set, the experiment is considered
 *                  concluded and the resolver treats this entry as
 *                  inert (it still records the experiment id on
 *                  historical rows, but no new rows get stamped).
 *                  Leaving concluded experiments in the registry is
 *                  deliberate — they're git-blame-searchable and
 *                  the admin page can surface past experiments for
 *                  post-mortem.
 *
 *   description  — one-liner for the admin UI.
 */
export interface Experiment {
  id: string;
  op: PromptOp;
  startedAt: string;
  endedAt?: string;
  description: string;
}

/**
 * The resolver's return value. Callers pass BOTH strings to
 * `recordAiUsage` so the audit row captures them. Callers also use
 * `version` to pick the right renderer branch in their op module.
 *
 *   version      — the PromptVersion.id that was selected. Never empty.
 *                  Pass through to `recordAiUsage({ promptVersion })`.
 *
 *   experimentId — the Experiment.id when randomized assignment, null
 *                  when single-variant. Pass through to
 *                  `recordAiUsage({ experimentId })`.
 */
export interface ResolvedPrompt {
  version: string;
  experimentId: string | null;
}

// ---------------------------------------------------------------------
// Registry — single source of truth
// ---------------------------------------------------------------------
//
// At v1 ship every op has exactly one enabled variant at 100% weight.
// Adding a v2 is a single line in the array for that op; flipping
// weights is a two-line edit. No DB work.
//
// Keep descriptions short — they render inline on the admin page.

const TODAY = "2026-04-22";

export const PROMPT_REGISTRY: Record<PromptOp, PromptVersion[]> = {
  summarize: [
    {
      op: "summarize",
      id: "v1",
      enabled: true,
      weightBps: 10000,
      createdAt: TODAY,
      description: "Baseline — locked by Tier 4 of the Net-Margin Roadmap.",
    },
  ],
  translate: [
    {
      op: "translate",
      id: "v1",
      enabled: true,
      weightBps: 10000,
      createdAt: TODAY,
      description: "Baseline — faithful translation with glossary pass-through.",
    },
  ],
  chat: [
    {
      op: "chat",
      id: "v1",
      enabled: true,
      weightBps: 10000,
      createdAt: TODAY,
      description: "Baseline — PDF-grounded Q&A, refuses off-document claims.",
    },
  ],
  compare: [
    {
      op: "compare",
      id: "v1",
      enabled: true,
      weightBps: 10000,
      createdAt: TODAY,
      description: "Baseline — structured diff with added/removed/moved buckets.",
    },
  ],
  generate: [
    {
      op: "generate",
      id: "v1",
      enabled: true,
      weightBps: 10000,
      createdAt: TODAY,
      description: "Baseline — doc generator with tone + length + docType pins.",
    },
  ],
  sign: [
    {
      op: "sign",
      id: "v1",
      enabled: true,
      weightBps: 10000,
      createdAt: TODAY,
      description: "Baseline — signature-block analyzer.",
    },
  ],
  ocr: [
    {
      op: "ocr",
      id: "v1",
      enabled: true,
      weightBps: 10000,
      createdAt: TODAY,
      description: "Baseline — faithful OCR transcription, preamble-only wrap.",
    },
  ],
  rewrite: [
    {
      op: "rewrite",
      id: "v1",
      enabled: true,
      weightBps: 10000,
      createdAt: TODAY,
      description: "Baseline — tone/voice rewrite preserving factual content.",
    },
  ],
  table: [
    {
      op: "table",
      id: "v1",
      enabled: true,
      weightBps: 10000,
      createdAt: TODAY,
      description: "Baseline — table extraction to markdown + CSV.",
    },
  ],
  redact: [
    {
      op: "redact",
      id: "v1",
      enabled: true,
      weightBps: 10000,
      createdAt: TODAY,
      description: "Baseline — PII redaction, categorical hits + bounding text.",
    },
  ],
};

// ---------------------------------------------------------------------
// Experiments — active A/B assignments
// ---------------------------------------------------------------------
//
// EMPTY at v1 ship. Every op has a single variant at 100% weight so
// no randomized assignment is happening — `experimentId` in every
// resolved row is null, and the admin page shows "No active
// experiments". When we're ready to A/B summarize v2, we add a second
// PromptVersion above AND an Experiment entry here, in the same commit.

export const EXPERIMENTS: Experiment[] = [];

// ---------------------------------------------------------------------
// Recording gate
// ---------------------------------------------------------------------
//
// Global kill switch for the prompt_version/experiment_id columns.
// When false, the resolver still runs and still returns a
// `ResolvedPrompt`, but callers of `recordAiUsage` should pass
// `promptVersion: null` / `experimentId: null` so the DB columns stay
// NULL. Flip to true in the same commit that wires the first op's
// call-site, AFTER migration 0014 has been confirmed applied on
// Hostinger MySQL. Flip back to false if the migration somehow
// errors out post-deploy.
//
// Not using a .env var for this because:
//   (a) we want the state to be reviewable (git blame),
//   (b) there's no runtime-tuning value — a misaligned value
//       produces a 500, which is a deploy-time problem, not a
//       per-request problem.

export const RECORDING_ENABLED = true;

// ---------------------------------------------------------------------
// Stable hash — pure, deps-free
// ---------------------------------------------------------------------
//
// We need a deterministic bucketing function that:
//   (a) is stable across Node versions (no dependency on
//       hash-randomization internals),
//   (b) distributes inputs uniformly over 0..10000 so small-weight
//       variants actually get traffic at the expected rate,
//   (c) costs nothing — this runs on every AI call's hot path.
//
// djb2 satisfies all three. Not cryptographic, but uniformity over
// 10,000-bucket space is great for A/B assignment. The >>> 0 coerces
// to unsigned 32-bit which Math.abs would otherwise not do reliably
// for INT_MIN.

export function stableHashToBps(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    // h * 33 + c — classic djb2
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  // Coerce to unsigned 32-bit, then mod into bps space (0..10000).
  return (h >>> 0) % 10000;
}

// ---------------------------------------------------------------------
// Resolver — the public entry point
// ---------------------------------------------------------------------
//
// Given an op and a stable seed (typically the userId), pick the
// PromptVersion.id that should run. Records nothing itself — that's
// the caller's job.
//
// Contract
// --------
//   - Always returns a non-empty `version` string.
//   - If there are zero enabled variants for the op, falls back to
//     "v1" — any caller branching on this version gets the same
//     behaviour as the pre-registry era. This is the failure-of-
//     last-resort; it should never happen in practice because every
//     op ships with ≥1 enabled variant.
//   - If there is exactly one enabled variant, returns its id with
//     `experimentId: null` (deterministic assignment, not an A/B).
//   - If there are 2+ enabled variants AND an Experiment entry is
//     registered for this op, assigns weighted-random via
//     `stableHashToBps(op + ":" + seed)` and returns the matching
//     experiment id.
//   - If there are 2+ enabled variants AND NO Experiment entry, the
//     resolver STILL assigns by weight but returns `experimentId:
//     null`. That state is "misconfigured but safe" — the rollup
//     won't aggregate cross-user because `experimentId IS NULL`
//     doesn't GROUP meaningfully. The admin page surfaces this
//     case as a red banner.
//   - A null/undefined `seed` is coerced to empty string; the
//     resolver still returns a deterministic variant (everyone
//     without a userId maps to the same bucket, which is the least-
//     surprising choice for unauthenticated paths).
export function resolvePromptVersion(
  op: PromptOp,
  seed: string | null | undefined
): ResolvedPrompt {
  const variants = (PROMPT_REGISTRY[op] ?? []).filter((v) => v.enabled);

  if (variants.length === 0) {
    return { version: "v1", experimentId: null };
  }
  if (variants.length === 1) {
    return { version: variants[0].id, experimentId: null };
  }

  // ≥2 variants — do weighted assignment.
  const totalWeight = variants.reduce(
    (s, v) => s + Math.max(0, v.weightBps),
    0
  );
  if (totalWeight <= 0) {
    // Every variant has weightBps <= 0 — degenerate. Fall back to
    // the first enabled variant deterministically.
    return { version: variants[0].id, experimentId: null };
  }

  const normalizedSeed = (seed ?? "").toString();
  // Mix the op into the hash so the same user doesn't get the same
  // bucket across different ops (which would correlate their
  // experiment assignments — a confounder).
  const bucket = stableHashToBps(`${op}:${normalizedSeed}`);
  // Scale bucket into totalWeight space.
  const scaledBucket = Math.floor((bucket / 10000) * totalWeight);

  let cursor = 0;
  let picked = variants[0].id;
  for (const v of variants) {
    cursor += Math.max(0, v.weightBps);
    if (scaledBucket < cursor) {
      picked = v.id;
      break;
    }
  }

  // Look up an active experiment for this op. Active = not endedAt,
  // and op matches. First match in registration order wins — the
  // registry is single-author-edit, so this is deterministic.
  const activeExperiment =
    EXPERIMENTS.find((e) => e.op === op && !e.endedAt) ?? null;

  return {
    version: picked,
    experimentId: activeExperiment ? activeExperiment.id : null,
  };
}

// ---------------------------------------------------------------------
// Read-only introspection — used by the admin page + test harness
// ---------------------------------------------------------------------

/**
 * Flatten the registry into a single array for admin-page rendering.
 * The return is a fresh array each call; callers must not mutate the
 * PromptVersion objects (which are shared with the registry).
 */
export function listAllPromptVersions(): PromptVersion[] {
  const out: PromptVersion[] = [];
  for (const op of Object.keys(PROMPT_REGISTRY) as PromptOp[]) {
    for (const v of PROMPT_REGISTRY[op]) {
      out.push(v);
    }
  }
  return out;
}

/**
 * List of currently-active experiments (endedAt unset). Used by the
 * admin page's "What's running now?" card.
 */
export function listActiveExperiments(): Experiment[] {
  return EXPERIMENTS.filter((e) => !e.endedAt);
}

/**
 * Classify an op's current registry state for admin display.
 *
 *   - "single"       — 1 enabled variant (the steady state).
 *   - "experiment"   — 2+ enabled variants AND an active Experiment.
 *                       This is the A/B-test state.
 *   - "misconfigured" — 2+ enabled variants AND no active Experiment.
 *                        Variants are being assigned but we're not
 *                        recording the experiment id, so we can't
 *                        analyze the split.
 *   - "empty"        — 0 enabled variants. The resolver falls back to
 *                      "v1" but the admin page should flag this.
 */
export type OpRegistryState =
  | "single"
  | "experiment"
  | "misconfigured"
  | "empty";

export function classifyOpState(op: PromptOp): OpRegistryState {
  const variants = (PROMPT_REGISTRY[op] ?? []).filter((v) => v.enabled);
  if (variants.length === 0) return "empty";
  if (variants.length === 1) return "single";
  const hasActiveExp = EXPERIMENTS.some(
    (e) => e.op === op && !e.endedAt
  );
  return hasActiveExp ? "experiment" : "misconfigured";
}

// ---------------------------------------------------------------------
// Test-only internals — exported under __INTERNALS so the production
// surface stays flat. Matches the pattern established by
// lib/ai/prompt-safety.ts. Do NOT import this from app code; if a
// thing here should be part of the public surface, promote it with
// an intentional export.
// ---------------------------------------------------------------------

export const __PROMPT_REGISTRY_INTERNALS = {
  stableHashToBps,
  EXPERIMENTS,
  PROMPT_REGISTRY,
  RECORDING_ENABLED,
};
