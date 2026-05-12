// Feature flag system (PENDING §4d foundation, 2026-05-05).
//
// One-paragraph summary
// ---------------------
// Every existing feature toggle in the codebase is a Hostinger panel
// env var (`BONUS_PER_OP_CAP_ENABLED`, `SIGNUP_GRANT_ENABLED`,
// `MULTIPLIER_PRICING_ENABLED`, `QUALITY_SIGNAL_AUTO_ROUTE_ENABLED`,
// etc.) — toggling requires panel access + redeploy + zero gradual
// rollout. This module is the single home for feature flag resolution,
// supporting per-flag overrides, deterministic-percent rollouts, and
// per-user override lists, all backed by env vars (no external SaaS
// dependency). When a downstream item like the annual plan SKU or
// multi-seat plan ships, it can be wrapped in `isFeatureEnabled
// ("annual_plan", { userId })` so the rollout is observable + reversible
// without redeploy.
//
// What this module does
// ---------------------
// `isFeatureEnabled(flagName, options?)` returns a boolean given a
// flag name + optional userId. Resolution rules, in order:
//
//   1. Per-flag override:
//        FEATURE_<FLAG>_OVERRIDE=on  → always enabled (every caller)
//        FEATURE_<FLAG>_OVERRIDE=off → always disabled (every caller)
//      Used to instantly kill or universally activate a flag without
//      touching the percent or user-list knobs. Highest priority so an
//      operator can override the rollout in one panel edit.
//   2. Per-user override list:
//        FEATURE_<FLAG>_USERS=u1,u2,u3
//      These users always get the flag enabled, regardless of percent.
//      Used for: founder dogfooding, beta-tester cohorts, debugging
//      a single user's report.
//   3. Deterministic-percent rollout:
//        FEATURE_<FLAG>_PERCENT=25
//      25% of users get the flag, bucketed by hash(userId, flagName).
//      Sticky per-user (the same userId always falls in the same
//      bucket for a given flag), so a user doesn't see the feature
//      flicker between requests. Without a userId, percent rollouts
//      are off (anonymous calls don't get partial features — would
//      cause hard-to-reproduce bugs).
//   4. Default: off.
//
// Why not GrowthBook / Unleash / LaunchDarkly
// -------------------------------------------
// The pending-list (§4d) calls for one of those eventually. They give
// a UI for non-engineers to flip flags, real-time updates without
// redeploy, and built-in A/B test stats. Worth it past ~10 active flags.
// Below that count, env-var-backed flags are simpler:
//   - Zero new infra (no SaaS account, no API key, no rate limit)
//   - Same surface as today's panel-driven toggles (operators already
//     know the workflow)
//   - Trivial to swap to GrowthBook later — `isFeatureEnabled` becomes
//     a pass-through to the SDK; call sites don't change.
//
// What this module does NOT do
// ----------------------------
// - Real-time flag updates (without redeploy). Hostinger requires a
//   panel "Save and redeploy" cycle for env var changes. The
//   GrowthBook upgrade path solves this; today, accept the limitation.
// - A/B test stats. The bucketing is deterministic so stats can be
//   computed externally, but this module doesn't run them.
// - Caching. Each `isFeatureEnabled` call re-reads `process.env` —
//   ~microseconds, irrelevant on the hot path. If env-var reads ever
//   become a bottleneck, an in-memory cache with periodic refresh is
//   one drop-in change.
// - Audit log. A flag flip leaves no record beyond the Hostinger panel
//   history. GrowthBook upgrade adds this.

import "server-only";
import { createHash } from "node:crypto";

/**
 * Registry of known flag names. Adding a flag here is the convention:
 * call sites use the registry constant, not a string literal, so
 * typos surface at compile time. The string value is what gets baked
 * into the env var name (`FEATURE_<UPPERCASE_VALUE>_*`).
 *
 * Order: alphabetical for ease of audit. New flags go in their
 * alphabetical position.
 */
export const FEATURE_FLAGS = {
  /** Annual plan SKU rollout — wraps the /buy listing + checkout. */
  ANNUAL_PLAN: "annual_plan",
  /** Referral program rollout — wraps the /account referral panel + invite-tracking webhook. */
  REFERRAL_PROGRAM: "referral_program",
  /**
   * PDF Compress (PENDING §5a) — wraps the server-side Ghostscript-
   * backed compress route. Foundation lands without this flag set so
   * the route is silently disabled at the handler level until the
   * UI / catalog entry / CI smoke is ready to ship together.
   */
  PDF_COMPRESS: "pdf_compress",
  /**
   * PDF/A-2b conversion (PENDING §5b) — wraps the server-side
   * Ghostscript-backed PDF/A converter. Same staging discipline as
   * PDF_COMPRESS — foundation route ships flag-off, UI ships in a
   * follow-up commit, operator activation flips it to live.
   */
  PDF_A_CONVERT: "pdf_a_convert",
  /**
   * Homepage hero CTA variant (PENDING §6d, 2026-05-12). First real
   * use of the deterministic-percent rollout path of isFeatureEnabled
   * — every prior flag callsite (PDF_COMPRESS, PDF_A_CONVERT) used
   * the foundation as an on/off gate, not as an A/B variant.
   *
   * Variant A (control): "Try it now — no signup" → /tools
   * Variant B (test): "Pick a tool in 30 seconds" → /compare
   *
   * Hypothesis: /compare's verb-led decision tree converts higher
   * than /tools' catalog browse for users who don't yet know what
   * they want. The /compare page itself shipped 2026-05-12; this
   * flag tests whether routing some homepage traffic through it
   * improves downstream activation.
   *
   * Default state: FEATURE_HOMEPAGE_HERO_CTA_PERCENT unset → 0% →
   * everyone gets variant A. Founder flips to 10/25/50 in the
   * Hostinger panel once they want to start measuring. Anonymous
   * traffic always gets the control variant (percent rollouts
   * require userId per the foundation's documented behaviour).
   */
  HOMEPAGE_HERO_CTA: "homepage_hero_cta",
} as const;

export type FeatureFlagName = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/**
 * Per-call options. Optional because some flags are global (no
 * userId-dependent rollout) — e.g. an operator-driven feature kill
 * switch.
 */
export interface IsFeatureEnabledOptions {
  /**
   * The user the request is acting on behalf of, or null/undefined
   * for anonymous / system / cron callers. Without a userId, only
   * the per-flag override (rule 1) takes effect — percent rollouts
   * (rule 3) need a stable identity to bucket.
   */
  userId?: string | null;
}

// ============================================================================
// Pure helpers (no env reads, no I/O — testable by unit harness)
// ============================================================================

/**
 * Map a userId + flag name to a stable 0-99 bucket. Uses SHA-1 (in
 * crypto, no extra dep) hashed over `${flagName}:${userId}` and takes
 * the first 4 bytes mod 100. SHA-1 is fine here — we're not signing
 * anything; we just need a uniform spread that's stable per user-flag
 * pair so a user's bucket doesn't change between requests.
 *
 * Including the flag name in the hash means different flags assign
 * different buckets to the same user, so flag-rollout populations
 * don't correlate. (If flag A and flag B both bucket the same user
 * to bucket 17, a 25% rollout of both flags would target identical
 * cohorts — which masks any one flag's true impact.)
 *
 * Pure function. Same inputs → same output. Exported separately so
 * the CI guard can exercise canonical inputs without mocking env.
 */
export function bucketUserId(userId: string, flagName: string): number {
  const hash = createHash("sha1")
    .update(`${flagName}:${userId}`)
    .digest();
  // Read first 4 bytes as unsigned 32-bit integer (big-endian, but
  // either-endian works here — we only care about uniform spread).
  const word = (hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3];
  // `>>> 0` coerces to unsigned 32-bit; mod 100 → 0-99 bucket.
  return (word >>> 0) % 100;
}

/**
 * Parse a percent value from env — returns null on invalid input
 * (non-numeric, negative, > 100). null is treated as "no percent
 * rollout" by the resolver (i.e. the flag is off unless a higher-
 * priority rule fires).
 *
 * Pure function over a single string input.
 */
export function parsePercent(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Parse a comma-separated user-id override list. Trims whitespace,
 * drops empty entries, dedupes via Set. Returns an empty array on
 * unset / empty input.
 */
export function parseUserList(raw: string | undefined): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );
}

/**
 * Parse the per-flag override knob. Returns:
 *   - true  when value is "on" / "1" / "true" (case-insensitive)
 *   - false when value is "off" / "0" / "false"
 *   - null  when unset / unrecognized (resolver falls through to
 *           rule 2)
 *
 * The strict "on" / "off" preference (over the truthy "1" / "true"
 * shortcut) is for operator clarity — Hostinger panel env-var values
 * are read by humans, and `OVERRIDE=on` tells you the intent at a
 * glance.
 */
export function parseOverride(raw: string | undefined): boolean | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "on" || v === "1" || v === "true") return true;
  if (v === "off" || v === "0" || v === "false") return false;
  return null;
}

// ============================================================================
// Public resolver
// ============================================================================

/**
 * Compute the env-var key for a given flag + suffix. `flagName` is
 * the registry's string value (already lowercase + snake_case);
 * uppercased here for the `FEATURE_<FLAG>_<SUFFIX>` convention.
 *
 * Exported so admin tooling + tests can verify expected env var
 * names without duplicating the convention string.
 */
export function envKey(
  flagName: string,
  suffix: "OVERRIDE" | "USERS" | "PERCENT",
): string {
  return `FEATURE_${flagName.toUpperCase()}_${suffix}`;
}

/**
 * Resolve a feature flag for a given caller. See module-level
 * resolution rules at the top of the file for the priority order.
 *
 * Synchronous + pure-ish — touches `process.env` but no I/O. Safe
 * to call on the hot path of any request (microseconds per call).
 */
export function isFeatureEnabled(
  flag: FeatureFlagName,
  options?: IsFeatureEnabledOptions,
): boolean {
  // Rule 1 — per-flag override (highest priority).
  const override = parseOverride(process.env[envKey(flag, "OVERRIDE")]);
  if (override !== null) return override;

  // Rule 2 — per-user override list.
  const userId = options?.userId;
  if (userId) {
    const userList = parseUserList(process.env[envKey(flag, "USERS")]);
    if (userList.includes(userId)) return true;
  }

  // Rule 3 — percent rollout.
  const percent = parsePercent(process.env[envKey(flag, "PERCENT")]);
  if (percent !== null && percent > 0 && userId) {
    return bucketUserId(userId, flag) < percent;
  }

  // Rule 4 — default off.
  return false;
}

/**
 * Snapshot the current state of every known flag for the admin
 * viewer. Returned shape is JSON-serializable so the page can render
 * it without further transformation.
 *
 * For percent rollouts, we report the percent value but NOT the
 * user-list contents — that's potentially sensitive operator data
 * (a list of beta testers might be PII). The admin page surfaces
 * "userList: <count> users" instead of names. Operators who need
 * to inspect the list look at the Hostinger panel directly.
 */
export interface FeatureFlagSnapshot {
  flag: FeatureFlagName;
  override: "on" | "off" | null;
  userListCount: number;
  percent: number | null;
  /** Resolved state for an anonymous caller (no userId) — useful for "is this on for everybody right now?" checks. */
  defaultEnabled: boolean;
}

export function snapshotAllFlags(): FeatureFlagSnapshot[] {
  const out: FeatureFlagSnapshot[] = [];
  for (const flag of Object.values(FEATURE_FLAGS)) {
    const override = parseOverride(process.env[envKey(flag, "OVERRIDE")]);
    const userList = parseUserList(process.env[envKey(flag, "USERS")]);
    const percent = parsePercent(process.env[envKey(flag, "PERCENT")]);
    out.push({
      flag,
      override:
        override === true ? "on" : override === false ? "off" : null,
      userListCount: userList.length,
      percent,
      defaultEnabled: isFeatureEnabled(flag),
    });
  }
  return out;
}
