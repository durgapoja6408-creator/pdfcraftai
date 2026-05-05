#!/usr/bin/env node
/**
 * 2026-05-04 — margin-rollup → shared-helper Slack migration guard.
 *
 * Follow-up to commit `36821aa` which shipped the shared
 * `lib/ops/slack-alert.ts` helper. Before this migration commit,
 * `lib/ai/margin-rollup.ts:postMarginAlertToSlack` had its own
 * inline `fetch` to a URL read from `AI_SPEND_ALERT_SLACK_URL` and
 * built `{text: "..."}` Slack legacy payloads. The migration:
 *
 *   1. Imports `sendSlackAlert` + `SlackAlertSeverity` from
 *      lib/ops/slack-alert.
 *   2. Builds a structured payload (severity, title, body, context)
 *      instead of a single text string. The 4 message branches
 *      (red slices, red alarms, warn alarms, all green) map onto
 *      the helper's 3 severities (alarm, alarm, warn, info).
 *   3. Drops the inline `fetch(url, {...})` call entirely.
 *   4. Preserves the legacy env var name as `urlOverride` for
 *      backward-compat — a founder who already set
 *      AI_SPEND_ALERT_SLACK_URL doesn't see alerts go silent the
 *      moment this commit lands.
 *
 * This guard locks in all four invariants. It exists AS A SEPARATE
 * SUITE from `slack-alert-foundation` because the migration is
 * scoped to one consumer (margin-rollup) — a future migration of
 * dunning or quality-signal would add its own consumer-specific
 * guard, and we want the failure attribution to be clean.
 *
 * Output line conforms to aggregator regex:
 *   `${name}: ${pass} passed, ${fail} failed`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
  }
}

const ROLLUP_PATH = path.join(ROOT, "lib", "ai", "margin-rollup.ts");
const ROLLUP_SRC = fs.existsSync(ROLLUP_PATH)
  ? fs.readFileSync(ROLLUP_PATH, "utf8")
  : "";

assert(ROLLUP_SRC.length > 0, "A0: lib/ai/margin-rollup.ts file exists");

// ============================================================================
// SECTION A: Imports
// ============================================================================

assert(
  /import\s+\{\s*sendSlackAlert\s*\}\s+from\s+"@\/lib\/ops\/slack-alert"/.test(
    ROLLUP_SRC,
  ),
  "A1: imports sendSlackAlert from @/lib/ops/slack-alert",
);
assert(
  /import\s+type\s+\{\s*SlackAlertSeverity\s*\}\s+from\s+"@\/lib\/ops\/slack-alert"/.test(
    ROLLUP_SRC,
  ),
  "A2: imports type SlackAlertSeverity from @/lib/ops/slack-alert",
);

// ============================================================================
// SECTION B: postMarginAlertToSlack body — structured payload + sendSlackAlert
// ============================================================================

// Extract the function body so we can do per-block invariant checks.
// The end-of-function marker is the first `^}` at column 0 after the
// signature — multi-line regex with greedy [\s\S]*? to stop at the
// first balanced close.
const FN_MATCH = ROLLUP_SRC.match(
  /export\s+async\s+function\s+postMarginAlertToSlack\([^)]*\)\s*:\s*Promise<boolean>\s*\{[\s\S]*?\n\}/,
);
const FN_BODY = FN_MATCH ? FN_MATCH[0] : "";
assert(FN_BODY.length > 0, "B1: postMarginAlertToSlack function body extracted");

// Old inline fetch MUST be gone. Two anchors: no `fetch(url,` call
// inside this function body, and no `JSON.stringify({ text })`
// payload (the legacy {text:...} shape).
assert(
  !/fetch\s*\(\s*url\s*,/.test(FN_BODY),
  "B2: inline fetch(url, ...) call removed (migrated to sendSlackAlert)",
);
assert(
  !/JSON\.stringify\(\s*\{\s*text\s*:/.test(FN_BODY),
  "B3: legacy {text: ...} Slack payload format removed",
);
// And no `process.env.AI_SPEND_ALERT_SLACK_URL` direct read OUTSIDE
// the urlOverride pattern (the override pattern itself is allowed —
// it's the migration escape hatch).
const directEnvReadCount = (
  FN_BODY.match(/process\.env\.AI_SPEND_ALERT_SLACK_URL/g) || []
).length;
assert(
  directEnvReadCount <= 1,
  "B4: at most one process.env.AI_SPEND_ALERT_SLACK_URL read (the urlOverride fallback assignment)",
);

// New shared-helper call MUST be present.
assert(
  /sendSlackAlert\s*\(/.test(FN_BODY),
  "B5: function calls sendSlackAlert(...)",
);

// Severity must be set in all 4 branches — the discriminated union
// `let severity: SlackAlertSeverity` declaration + assignments.
assert(
  /let\s+severity:\s*SlackAlertSeverity/.test(FN_BODY),
  "B6: declares `let severity: SlackAlertSeverity` (typed, not free string)",
);
for (const sev of ["alarm", "warn", "info"]) {
  assert(
    new RegExp(`severity\\s*=\\s*"${sev}"`).test(FN_BODY),
    `B7.${sev}: function assigns severity="${sev}" in at least one branch`,
  );
}
// "alarm" must appear TWICE (redSlices branch + redAlarms branch
// both escalate to page-the-founder).
const alarmAssignCount = (FN_BODY.match(/severity\s*=\s*"alarm"/g) || []).length;
assert(
  alarmAssignCount >= 2,
  "B8: severity=\"alarm\" is assigned in 2+ branches (redSlices + redAlarms both escalate)",
);

// All 4 message branches still exist — refactor must preserve the
// existing routing logic. Anchor on the discriminator expressions.
const FN_BRANCH_DISCRIMINATORS = [
  /redSlices\.length\s*>\s*0/,
  /redAlarms\.length\s*>\s*0/,
  /alarms\.length\s*>\s*0/,
  // The all-green branch is the trailing `else` — anchor on the
  // gate-7 banner copy that's only emitted there.
  /Gate\s+#7\s+target\s+reached/,
];
for (const disc of FN_BRANCH_DISCRIMINATORS) {
  assert(
    disc.test(FN_BODY),
    `B9.${disc.source}: branch discriminator preserved post-migration`,
  );
}

// ============================================================================
// SECTION C: Backward-compat — AI_SPEND_ALERT_SLACK_URL still works
// ============================================================================

// The legacy env var must still be readable, but ONLY as a fallback
// passed via urlOverride to sendSlackAlert. The function body must
// route through the helper, not back to its own inline fetch.
assert(
  /process\.env\.AI_SPEND_ALERT_SLACK_URL/.test(FN_BODY),
  "C1: AI_SPEND_ALERT_SLACK_URL is still readable (backward-compat)",
);
assert(
  /urlOverride\s*:\s*legacyOverride/.test(FN_BODY) ||
    /urlOverride\s*:\s*[\w]+/.test(FN_BODY),
  "C2: legacy env var is passed as urlOverride: ... to sendSlackAlert",
);

// The helper's options arg pattern: when legacy var is unset, we
// pass `undefined` for the options to fall through to the canonical
// env var read inside the helper. The conditional ternary anchors
// this contract.
assert(
  /legacyOverride\s*\?\s*\{\s*urlOverride:\s*legacyOverride\s*\}\s*:\s*undefined/.test(
    FN_BODY,
  ),
  "C3: passes options arg conditionally (legacyOverride ? {urlOverride} : undefined)",
);

// ============================================================================
// SECTION D: Result-envelope handling — never throws, returns false on no-op
// ============================================================================

// The helper returns SlackAlertResult; this function returns boolean.
// Three handling branches must be present:
//   - result.ok && result.sent → return true
//   - result.ok && !result.sent → return false (no-webhook no-op)
//   - !result.ok → log warn + return false
assert(
  /result\.ok\s*&&\s*result\.sent/.test(FN_BODY),
  "D1: handles result.ok && result.sent → return true (happy path)",
);
assert(
  /result\.ok\s*&&\s*!result\.sent/.test(FN_BODY),
  "D2: handles result.ok && !result.sent → return false (graceful no-op)",
);
assert(
  /console\.warn[\s\S]{0,200}result\.reason[\s\S]{0,200}result\.detail/.test(
    FN_BODY,
  ),
  "D3: handles delivery_failed → console.warn(reason, detail) then return false",
);

// The function must NOT throw. The shared helper never throws; we
// just verify there are no stray `throw` statements introduced by
// the refactor.
assert(
  !/\bthrow\b/.test(FN_BODY),
  "D4: postMarginAlertToSlack contains no `throw` (preserves cron-safe never-throws contract)",
);

// ============================================================================
// SECTION E: Context block carries operationally-useful fields
// ============================================================================

// The structured payload's context block should surface the at-a-
// glance fields operators want without parsing the body bullets.
// We don't enforce exact field names (that's a UX choice the team
// can iterate on), but at least 3 distinct context entries should
// be present so the migration doesn't accidentally drop the
// operational signal value.
const CONTEXT_MATCH = FN_BODY.match(/const\s+context\s*=\s*\{[\s\S]*?\};/);
assert(
  CONTEXT_MATCH !== null,
  "E1: function constructs a `const context` block for the structured payload",
);
if (CONTEXT_MATCH) {
  const ctxBody = CONTEXT_MATCH[0];
  // Count "Key": value entries — at least 3 means the context is
  // meaningfully populated.
  const fieldCount = (ctxBody.match(/^\s*"[^"]+"\s*:\s*[a-zA-Z_]/gm) || [])
    .length;
  assert(
    fieldCount >= 3,
    `E2: context block has at least 3 fields (got ${fieldCount} — fewer means the migration dropped operational signal)`,
  );
}

// ============================================================================
// Output
// ============================================================================

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(
  `margin-rollup-slack-migration: ${passed} passed, ${failed} failed`,
);
process.exit(failed > 0 ? 1 : 0);
