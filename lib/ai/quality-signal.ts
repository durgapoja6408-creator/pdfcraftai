// Per-user quality-signal foundation (PENDING §6c, 2026-05-04).
//
// One-paragraph summary
// ---------------------
// `lib/payments/dunning.ts` ships a pure state machine + persist
// surface for subscription dunning, ahead of the Phase E webhook
// wiring that actually drives it. This module mirrors that
// discipline for AI quality:
//
//   1. A pure classifier — given a user's recent thumbs ↑/↓ history,
//      compute their "consecutive-negative streak" and bucket them
//      into healthy / watch / flagged.
//   2. A read-side query — given a userId, pull the last N feedback
//      rows from `ai_feedback`, run the classifier, return the
//      result.
//   3. A list-flagged query — surface every user currently in the
//      `watch` or `flagged` bucket for the /admin/quality-signals
//      page.
//
// What's NOT in this module today
// -------------------------------
// - Auto-routing on flagged users. Could plumb into `lib/ai/router.ts`
//   to bias provider selection, but the right thresholds + behavior
//   are unknown until real chip data accumulates. Foundation here;
//   automation later.
// - Background "alerter" job that emails the admin when a previously-
//   healthy user crosses the watch threshold. Same rationale —
//   unknown threshold values until we see what real signal looks like.
// - Email notification to the user themselves ("we noticed your
//   recent results haven't been great — here's some guidance").
//   Possible future feature; needs UX design first.
//
// Why ship the foundation now
// ---------------------------
// Stage 3 of the FeedbackChip rollout is structurally complete on
// every AI-using component (commit `2a459f3`). The chip is collecting
// real ↑/↓ data into the `ai_feedback` table from this point on. As
// soon as a user accumulates 3+ thumbs-down in a row, that's a
// signal worth surfacing — even if we don't yet have an automated
// response. The /admin/quality-signals page lets a human operator
// reach out to that user manually (good DX), and the foundation is
// ready when the operational pattern becomes clearer enough to
// automate.
//
// No migration is needed — the existing `ai_feedback` table from
// migration 0022 has all the columns we read.

import { db, schema } from "@/db/client";
import { sql, eq, desc } from "drizzle-orm";

/**
 * Quality bucket for a user. Ordered by severity: `healthy` is the
 * default no-op state; `watch` is "this user has 2+ consecutive
 * thumbs-down — worth a manual look but not yet an outage"; `flagged`
 * is "this user has crossed our hard threshold, surface immediately".
 *
 * Stored only in memory — there is intentionally no
 * `user_quality_signals` table. The signal is derived from the
 * append-only `ai_feedback` log on every read, so there's no
 * de-sync risk between cached state and ground truth.
 */
export type QualityBucket = "healthy" | "watch" | "flagged";

/**
 * Policy thresholds. Kept as exported constants rather than env vars
 * because changing them mid-flight is a product decision, not a
 * deploy toggle. Phase B (when there's a real cohort to tune
 * against) can revisit.
 *
 * Defaults are deliberately conservative — we'd rather miss some
 * truly-failing cases on the first day than spam the admin with
 * false positives that erode trust in the surface.
 */
export const QUALITY_SIGNAL_POLICY = {
  /**
   * Consecutive thumbs-down count that flips a user from `healthy`
   * to `watch`. 2 is the smallest signal that's hard to write off
   * as a single bad PDF.
   */
  watchThreshold: 2,
  /**
   * Consecutive thumbs-down count that flips a user from `watch` to
   * `flagged`. 4 means even three "give it another shot" retries
   * didn't recover — much more than coincidence.
   */
  flaggedThreshold: 4,
  /**
   * How many of the most recent feedback rows the classifier
   * considers. Older feedback rows (before this window) are ignored
   * — a user who had a bad week six months ago shouldn't stay
   * flagged after recovering.
   */
  recentWindow: 20,
} as const;

/**
 * Single feedback observation. Just enough for the classifier to do
 * its job — full row shape lives in the `ai_feedback` table.
 */
export interface QualityFeedbackRow {
  /** "up" | "down" — the verdict the user submitted. */
  verdict: string;
  /** Operation name (denormalized from ai_usage). Used for context display only — not policy. */
  operation: string;
  /** When the feedback was last updated (created_at on first vote, bumped on flip). */
  updatedAt: Date;
}

/**
 * Computed signal for a user. Returned by `loadUserQualitySignal`
 * and ranged over by `listFlaggedUsers`.
 */
export interface UserQualitySignal {
  userId: string;
  bucket: QualityBucket;
  /** Length of the trailing "down" streak in the recent window. */
  consecutiveNegative: number;
  /** Total feedback count in the recent window (≤ recentWindow). */
  totalInWindow: number;
  /** Total thumbs-down count in the recent window. */
  downInWindow: number;
  /** ISO timestamp of the most recent feedback (any verdict), or null if no feedback. */
  lastFeedbackAt: string | null;
  /** Operation list of the trailing-down streak (most recent first), capped at the streak length. */
  recentOperations: string[];
  /**
   * Provider IDs the user thumbs-down'd in the trailing streak (most
   * recent first, deduplicated, capped at the streak length). Used by
   * `applyQualityBiasIfEnabled` to deprioritize the offending provider
   * on the user's NEXT request. Null entries (older ai_feedback rows
   * predating provider-id denormalization) are dropped.
   *
   * Empty array is the no-data path — signal exists but the chip
   * pre-dated provider_id denormalization, OR the streak landed on
   * rows without a usable provider_id. Bias step treats empty array
   * the same as healthy-bucket: ladder unchanged.
   */
  recentProviders: string[];
}

// ============================================================================
// Pure classifier helpers (no DB)
// ============================================================================

/**
 * Compute the trailing consecutive-negative streak from a list of
 * verdicts ordered MOST RECENT FIRST.
 *
 * Examples:
 *   [] → 0
 *   ["up"] → 0
 *   ["down"] → 1
 *   ["down", "down"] → 2
 *   ["down", "down", "up"] → 2
 *   ["up", "down", "down"] → 0  (most recent is "up", streak is broken)
 *
 * The "most recent first" convention matches what `db.select(...).
 * orderBy(desc(updatedAt))` returns naturally; reordering inside
 * this helper would just hide that contract from callers.
 */
export function computeConsecutiveNegative(verdictsMostRecentFirst: string[]): number {
  let streak = 0;
  for (const v of verdictsMostRecentFirst) {
    if (v === "down") streak++;
    else break;
  }
  return streak;
}

/**
 * Classify a user into a quality bucket given their consecutive-
 * negative streak. Pure function over the policy constants above.
 *
 * Order of comparisons matters — flaggedThreshold check has to come
 * first so a streak of 5 (>= flagged 4) doesn't get caught by the
 * watch (>= 2) branch and incorrectly bucketed as `watch`.
 */
export function classifyQualitySignal(consecutiveNegative: number): QualityBucket {
  if (consecutiveNegative >= QUALITY_SIGNAL_POLICY.flaggedThreshold) return "flagged";
  if (consecutiveNegative >= QUALITY_SIGNAL_POLICY.watchThreshold) return "watch";
  return "healthy";
}

// ============================================================================
// Read-side helpers (DB-backed, server-only)
// ============================================================================

/**
 * Load the recent feedback window for one user and return their
 * computed quality signal. Returns a `healthy` zero-streak signal
 * for users with zero feedback rows so callers don't have to
 * special-case the no-data path.
 *
 * Cost: one `SELECT ... LIMIT recentWindow` keyed on user_id —
 * served by the existing index pattern (no new index needed; the
 * `ai_feedback_user_call_uq` UNIQUE prefix-matches `(user_id, ...)`
 * and is selected by the planner for this query).
 */
export async function loadUserQualitySignal(
  userId: string,
): Promise<UserQualitySignal> {
  const rows = await db
    .select({
      verdict: schema.aiFeedback.verdict,
      operation: schema.aiFeedback.operation,
      providerId: schema.aiFeedback.providerId,
      updatedAt: schema.aiFeedback.updatedAt,
    })
    .from(schema.aiFeedback)
    .where(eq(schema.aiFeedback.userId, userId))
    .orderBy(desc(schema.aiFeedback.updatedAt))
    .limit(QUALITY_SIGNAL_POLICY.recentWindow);

  const verdicts = rows.map((r) => r.verdict);
  const consecutiveNegative = computeConsecutiveNegative(verdicts);
  const bucket = classifyQualitySignal(consecutiveNegative);
  const downInWindow = rows.filter((r) => r.verdict === "down").length;
  const lastFeedbackAt = rows[0]?.updatedAt
    ? new Date(rows[0].updatedAt).toISOString()
    : null;
  const recentOperations = rows
    .slice(0, consecutiveNegative)
    .map((r) => r.operation);
  // recentProviders: dedupe inside the trailing streak so a user who
  // got 4 thumbs-down all on the same provider doesn't show up with
  // the provider name 4× — `Array.from(new Set(...))` preserves
  // most-recent-first order. Filter out null/empty providerId rows
  // (chip pre-dated provider_id denormalization) so the bias step
  // doesn't try to deprioritize an empty string.
  const recentProviders = Array.from(
    new Set(
      rows
        .slice(0, consecutiveNegative)
        .map((r) => r.providerId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  return {
    userId,
    bucket,
    consecutiveNegative,
    totalInWindow: rows.length,
    downInWindow,
    lastFeedbackAt,
    recentOperations,
    recentProviders,
  };
}

/**
 * List every user whose most recent feedback puts them in the
 * `watch` or `flagged` bucket. Used by the /admin/quality-signals
 * page.
 *
 * Implementation note — we don't have a single SQL query that
 * computes "consecutive trailing down streak per user" cheaply
 * across all users (it'd need a window function with a gaps-and-
 * islands pattern that's awkward in MariaDB 10.x), so the strategy
 * is:
 *
 *   1. SQL pulls a candidate set of users who have at least one
 *      thumbs-down in the recent global window. Tight enough to
 *      keep the candidate list small even on a busy day.
 *   2. For each candidate, run `loadUserQualitySignal`. The N+1
 *      pattern is intentional — it keeps the per-user logic in one
 *      place and the candidate list is bounded by `maxCandidates`
 *      below (default 200, well under the volume we'd hit in a
 *      year). Re-evaluate if/when the candidate count routinely
 *      exceeds the cap.
 *   3. Filter out healthy users; sort by severity then recency.
 *
 * The `maxCandidates` cap is a defensive ceiling — a single bad
 * model release that triggers thumbs-down across thousands of
 * users in a day shouldn't take this query down with it. Better
 * to truncate the list and rely on /admin/ai-feedback's per-op
 * NPS dashboard for that "fleet-wide outage" failure mode.
 */
export async function listFlaggedUsers(
  maxCandidates: number = 200,
): Promise<UserQualitySignal[]> {
  // Look back 30 days — anything older than that is past the recent
  // window for a typical user (assuming < 20 ops/month, which is
  // generous). A user who hasn't run anything in 30 days isn't
  // actively suffering today even if their last feedback was bad,
  // so the surface shouldn't show them.
  const lookbackMs = 30 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - lookbackMs);

  // Candidate set: distinct user_ids who have at least one "down"
  // verdict in the lookback window. Sorted by their most recent
  // feedback so we visit the "currently noisy" users first under
  // the maxCandidates cap.
  const candidatesRows = await db.execute(sql`
    SELECT user_id, MAX(updated_at) AS last_feedback_at
    FROM ai_feedback
    WHERE verdict = 'down'
      AND updated_at > ${cutoff}
    GROUP BY user_id
    ORDER BY last_feedback_at DESC
    LIMIT ${maxCandidates}
  `);
  const candidatesUnknown = candidatesRows as unknown;
  // mysql2 wraps SELECT results in [rows, fields]; drizzle execute
  // sometimes flattens that to just `rows` depending on the dialect.
  // Tolerate both shapes here so a future driver swap doesn't break
  // the surface silently.
  const candidates = (Array.isArray(candidatesUnknown) && Array.isArray(candidatesUnknown[0])
    ? candidatesUnknown[0]
    : candidatesUnknown) as Array<{ user_id?: unknown }>;

  const signals: UserQualitySignal[] = [];
  for (const c of candidates) {
    const userId = typeof c.user_id === "string" ? c.user_id : String(c.user_id ?? "");
    if (!userId) continue;
    const signal = await loadUserQualitySignal(userId);
    if (signal.bucket !== "healthy") signals.push(signal);
  }

  // Sort: flagged before watch; within a bucket, longer streaks
  // first; within a streak length, most recent feedback first.
  const bucketRank: Record<QualityBucket, number> = {
    flagged: 0,
    watch: 1,
    healthy: 2,
  };
  signals.sort((a, b) => {
    if (a.bucket !== b.bucket) return bucketRank[a.bucket] - bucketRank[b.bucket];
    if (a.consecutiveNegative !== b.consecutiveNegative) {
      return b.consecutiveNegative - a.consecutiveNegative;
    }
    return (b.lastFeedbackAt ?? "").localeCompare(a.lastFeedbackAt ?? "");
  });

  return signals;
}

// 2026-05-04 (PENDING §6c automation foundation, follow-up to commit
// 81087df) — auto-routing scaffold. The router consults this helper
// before walking its provider ladder; when the env flag is on AND
// the user is flagged AND the recent streak attributes blame to
// specific providers, we move those providers to the END of the
// ladder. Graceful degradation (try a different provider next time)
// rather than a hard block. Behind a default-off env flag because
// the (2, 4) thresholds + the bias decision both need real chip
// data to validate. Today the helper is dormant for every caller.

/**
 * Env-flag default. Production must set
 * `QUALITY_SIGNAL_AUTO_ROUTE_ENABLED=true` to activate the bias
 * logic. Anything else (unset, "false", "0", typo) is off — fail-
 * safe default keeps every user on the canonical ladder.
 */
function autoRouteEnabled(): boolean {
  const raw = process.env.QUALITY_SIGNAL_AUTO_ROUTE_ENABLED;
  return raw === "true" || raw === "1";
}

/**
 * Bias the provider ladder for a user whose recent feedback shows a
 * trailing thumbs-down streak. Returns the ladder unchanged in any
 * of these cases (so the bias step is safe to call from the hot
 * path):
 *
 *   - env flag not set (default state today)
 *   - userId not provided (anonymous calls, system calls)
 *   - signal lookup throws (DB hiccup; fail-safe to canonical ladder)
 *   - bucket !== "flagged" (we deliberately bias only on the hard
 *     threshold, not the watch threshold — watch is operator-only
 *     signal, flagged is "user is genuinely struggling")
 *   - recentProviders is empty (chip data pre-dated provider_id
 *     denormalization, or the streak landed on null-provider rows)
 *
 * When the bias DOES fire: providers from `recentProviders` are
 * moved to the END of the ladder, preserving relative order among
 * themselves AND among the unbiased remainder. This is monotone —
 * idempotent on repeated calls — so a future caller composing
 * multiple bias steps doesn't accidentally cycle providers.
 *
 * The function is async because `loadUserQualitySignal` is async,
 * but the env-flag short-circuit lets the no-op path return without
 * ever touching the DB.
 *
 * Hot-path performance note: when the flag is on, the function does
 * one indexed `SELECT ... LIMIT recentWindow` keyed on user_id. On
 * a busy user this adds ~5-10ms to the route() call. If that becomes
 * a concern at scale, the right fix is a per-user-day cache populated
 * by a cron job that walks `listFlaggedUsers()` once daily — the
 * staleness is acceptable (the bias is "recently bad provider",
 * which doesn't change minute-to-minute).
 */
export async function applyQualityBiasIfEnabled<T extends string>(
  ladder: T[],
  userId: string | null | undefined,
): Promise<T[]> {
  if (!autoRouteEnabled()) return ladder;
  if (!userId) return ladder;

  let signal: UserQualitySignal;
  try {
    signal = await loadUserQualitySignal(userId);
  } catch (err) {
    // DB hiccup MUST NOT take down the router. Log + return
    // canonical ladder. Same reasoning as the dunning persist
    // try/catch: the bias step is an enhancement, not a contract.
    console.warn(
      `[quality-signal] bias lookup failed for user ${userId}; ` +
        `falling back to canonical ladder:`,
      err,
    );
    return ladder;
  }

  // Watch bucket is operator-only signal; only bias on hard threshold.
  if (signal.bucket !== "flagged") return ladder;
  if (signal.recentProviders.length === 0) return ladder;

  const biased = new Set(signal.recentProviders);
  const front: T[] = [];
  const tail: T[] = [];
  for (const id of ladder) {
    if (biased.has(id)) tail.push(id);
    else front.push(id);
  }
  // No-op shortcut: if the bias step didn't actually move anything
  // (no overlap between recentProviders and the ladder), don't
  // reconstruct — return original reference so a downstream
  // identity check stays cheap.
  if (tail.length === 0) return ladder;
  return [...front, ...tail];
}
