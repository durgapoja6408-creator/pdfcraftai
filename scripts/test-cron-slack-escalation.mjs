#!/usr/bin/env node
/**
 * 2026-05-04 — cron failure escalation guard (PENDING §2b).
 *
 * Follow-up to commits `36821aa` (shared Slack helper) +
 * `b4e382b` (margin-rollup migrated). This guard locks in the
 * application-level escalation contract for all 3 cron route
 * handlers:
 *
 *   - app/api/cron/ai-margin-rollup/route.ts: severity "alarm" on
 *     top-level catch (rollup itself crashed → no row written
 *     → greenStreak NOT advanced).
 *   - app/api/cron/reconcile-payments/route.ts: severity "alarm"
 *     on top-level catch (recent payments may not be audited
 *     against provider webhooks).
 *   - app/api/cron/expire-grants/route.ts: severity "warn" on
 *     per-row error accumulation (sweep continued, but recurring
 *     failures need eyes on them).
 *
 * Each call uses the urlOverride backward-compat pattern to keep
 * the legacy `AI_SPEND_ALERT_SLACK_URL` env var working alongside
 * the canonical `SLACK_OPS_WEBHOOK_URL`.
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

// Each route's expected escalation contract.
const ROUTES = [
  {
    name: "ai-margin-rollup",
    path: "app/api/cron/ai-margin-rollup/route.ts",
    severity: "alarm",
    titleAnchor: "Cron ai-margin-rollup failed",
  },
  {
    name: "reconcile-payments",
    path: "app/api/cron/reconcile-payments/route.ts",
    severity: "alarm",
    titleAnchor: "Cron reconcile-payments failed",
  },
  {
    name: "expire-grants",
    path: "app/api/cron/expire-grants/route.ts",
    severity: "warn",
    titleAnchor: "Cron expire-grants",
  },
];

// ============================================================================
// SECTION A: Per-route imports + sendSlackAlert call site
// ============================================================================

for (const route of ROUTES) {
  const fullPath = path.join(ROOT, route.path);
  const src = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";

  assert(src.length > 0, `A0.${route.name}: ${route.path} exists`);
  if (src.length === 0) continue;

  // Import from the canonical helper.
  assert(
    /import\s+\{\s*sendSlackAlert\s*\}\s+from\s+"@\/lib\/ops\/slack-alert"/.test(
      src,
    ),
    `A1.${route.name}: imports sendSlackAlert from @/lib/ops/slack-alert`,
  );

  // sendSlackAlert is invoked.
  assert(
    /sendSlackAlert\s*\(/.test(src),
    `A2.${route.name}: invokes sendSlackAlert(...)`,
  );

  // The expected severity literal appears.
  assert(
    new RegExp(`severity:\\s*"${route.severity}"`).test(src),
    `A3.${route.name}: alert uses severity="${route.severity}"`,
  );

  // The expected title anchor appears (each cron has a distinct title
  // so operators reading the Slack channel can route at a glance).
  assert(
    src.includes(route.titleAnchor),
    `A4.${route.name}: alert title contains "${route.titleAnchor}"`,
  );

  // Backward-compat: legacy AI_SPEND_ALERT_SLACK_URL still readable
  // via the same urlOverride pattern as margin-rollup.
  assert(
    /process\.env\.AI_SPEND_ALERT_SLACK_URL/.test(src),
    `A5.${route.name}: reads legacy AI_SPEND_ALERT_SLACK_URL for urlOverride backward-compat`,
  );
  assert(
    /legacyOverride\s*\?\s*\{\s*urlOverride:\s*legacyOverride\s*\}\s*:\s*undefined/.test(
      src,
    ),
    `A6.${route.name}: passes options conditionally (legacyOverride ? {urlOverride} : undefined)`,
  );
}

// ============================================================================
// SECTION B: Cross-route invariants — title prefix, severity discipline
// ============================================================================

// Every route's title MUST start with "Cron " — convention for the
// Slack channel reader who scans titles for the cron prefix to
// distinguish ops alerts from product alerts.
for (const route of ROUTES) {
  const fullPath = path.join(ROOT, route.path);
  const src = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
  assert(
    /title:\s*[`"']Cron\s/i.test(src) ||
      /title:\s*`Cron\s/i.test(src),
    `B1.${route.name}: title starts with "Cron " (channel-scanning convention)`,
  );
}

// "alarm" severity routes MUST be the ones whose failure means data
// is at risk (rollup → no row written; reconcile → audit drift).
// "warn" severity routes are non-cascading per-row issues
// (expire-grants per-row).
const ALARM_ROUTES = ROUTES.filter((r) => r.severity === "alarm").map(
  (r) => r.name,
);
const WARN_ROUTES = ROUTES.filter((r) => r.severity === "warn").map(
  (r) => r.name,
);
assert(
  ALARM_ROUTES.includes("ai-margin-rollup") &&
    ALARM_ROUTES.includes("reconcile-payments"),
  "B2: ai-margin-rollup + reconcile-payments routes use severity=alarm (data-at-risk failure modes)",
);
assert(
  WARN_ROUTES.includes("expire-grants"),
  "B3: expire-grants uses severity=warn (per-row, non-cascading failure mode)",
);

// ============================================================================
// SECTION C: Helper compatibility — the urlOverride pattern this
// guard depends on must still exist in lib/ops/slack-alert.ts. If a
// future refactor removes urlOverride, this whole rollout breaks
// silently — every cron route would call the helper with an unknown
// option and lose backward-compat for the legacy env var.
// ============================================================================

const LIB_PATH = path.join(ROOT, "lib", "ops", "slack-alert.ts");
const LIB_SRC = fs.existsSync(LIB_PATH) ? fs.readFileSync(LIB_PATH, "utf8") : "";
assert(
  /export\s+interface\s+SendSlackAlertOptions/.test(LIB_SRC),
  "C1: lib/ops/slack-alert.ts still exports SendSlackAlertOptions interface",
);
assert(
  /urlOverride\?:\s*string/.test(LIB_SRC),
  "C2: SendSlackAlertOptions still has urlOverride?: string field",
);

// ============================================================================
// SECTION D: Never-throws guarantee preserved across all 3 routes
// ============================================================================

// The helper itself never throws. The cron routes wrap their work in
// try/catch and the catch-block alert call (or post-loop alert call
// for expire-grants) MUST be inside a try-context so a hypothetical
// future helper bug can't propagate up. Equivalently: NO `throw` keyword
// inside the route handler bodies (the sweep + reporting paths shouldn't
// re-throw on any path).
for (const route of ROUTES) {
  const fullPath = path.join(ROOT, route.path);
  const src = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
  // Allow `throw` keywords in test/mock blocks (none expected in cron
  // routes themselves, but the regex is conservative — match on
  // non-comment `throw` statements).
  const codeOnly = src
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert(
    !/\bthrow\b/.test(codeOnly),
    `D1.${route.name}: no \`throw\` statements in route body (preserves cron-safe never-throws contract)`,
  );
}

// ============================================================================
// Output
// ============================================================================

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`cron-slack-escalation: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
