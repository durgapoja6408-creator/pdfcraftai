#!/usr/bin/env node
/**
 * 2026-05-04 — subscription dunning foundation guard.
 *
 * PENDING_WORK_ANALYSIS.md §4c. Mirrors the
 * `ai-feedback-foundation` guard's discipline (commit `d74fefe`). The
 * dunning state machine in lib/payments/dunning.ts has been a pure
 * reducer for ~2 weeks but had no storage. This commit adds:
 *
 *   - Migration 0023 (`subscription_dunning` table — 8 cols, PK on
 *     subscription_id, 2 secondary indexes, no FK because the future
 *     `subscriptions` recurring shape doesn't exist yet)
 *   - Drizzle schema entry (`subscriptionDunning`)
 *   - Persistence helpers (`loadDunningRow`, `persistDunningEvent`,
 *     `listDunningRows`) in lib/payments/dunning.ts
 *   - Read-only `/admin/dunning` page (consumer of `listDunningRows`)
 *   - Admin nav entry under Ops
 *
 * This guard locks in the contract:
 *   A. Migration shape — table + 8 columns + 2 indexes + PK + bigint
 *      widths on the *_ms columns (int32 wraps; we store ms not s)
 *   B. Drizzle schema parity — every migration column is declared on
 *      `subscriptionDunning` with the right name + type
 *   C. Persist helpers — lib/payments/dunning.ts exports
 *      `loadDunningRow`, `persistDunningEvent`, `listDunningRows` AND
 *      preserves the original pure reducer + DUNNING_POLICY constants
 *      so existing callers still link
 *   D. Admin page — /admin/dunning exists, gates on requireAdmin,
 *      consumes listDunningRows + DUNNING_POLICY, renders state
 *      distribution + past-due backlog + full table
 *   E. Admin nav — layout NAV array contains /admin/dunning under Ops
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

// ============================================================================
// SECTION A: Migration 0023 shape
// ============================================================================

const MIGRATION_PATH = path.join(
  ROOT,
  "db",
  "migrations",
  "0023_subscription_dunning.sql",
);
const MIGRATION_SRC = fs.existsSync(MIGRATION_PATH)
  ? fs.readFileSync(MIGRATION_PATH, "utf8")
  : "";

assert(MIGRATION_SRC.length > 0, "A1: migration 0023 file exists");

assert(
  /CREATE\s+TABLE\s+`subscription_dunning`/i.test(MIGRATION_SRC),
  "A2: migration creates `subscription_dunning` table",
);

// All 8 expected columns must be present, with the right widths.
const EXPECTED_COLUMNS = [
  // [column, regex matching the DDL line]
  ["subscription_id", /`subscription_id`\s+varchar\(64\)\s+NOT\s+NULL/i],
  ["state", /`state`\s+varchar\(16\)\s+NOT\s+NULL\s+DEFAULT\s+'current'/i],
  // bigint, not int — Date.now() in ms exceeds int32.
  ["state_since_ms", /`state_since_ms`\s+bigint\s+NOT\s+NULL/i],
  ["next_retry_at_ms", /`next_retry_at_ms`\s+bigint\s+DEFAULT\s+NULL/i],
  ["failed_attempts", /`failed_attempts`\s+int\s+NOT\s+NULL\s+DEFAULT\s+0/i],
  [
    "last_provider_event_id",
    /`last_provider_event_id`\s+varchar\(128\)\s+DEFAULT\s+NULL/i,
  ],
  ["created_at", /`created_at`\s+timestamp\(3\)/i],
  ["updated_at", /`updated_at`\s+timestamp\(3\)[^\n]*ON\s+UPDATE/i],
];
for (const [col, regex] of EXPECTED_COLUMNS) {
  assert(regex.test(MIGRATION_SRC), `A3.${col}: column declared with right type`);
}

// Primary key on subscription_id (one row per subscription).
assert(
  /PRIMARY\s+KEY\s*\(\s*`subscription_id`\s*\)/i.test(MIGRATION_SRC),
  "A4: PRIMARY KEY on subscription_id",
);

// Two secondary indexes — admin "show me past_due" + cron "walk grace
// window".
assert(
  /CREATE\s+INDEX\s+`subscription_dunning_state_updated_idx`[\s\S]{0,400}\(`state`,\s*`updated_at`\)/i.test(
    MIGRATION_SRC,
  ),
  "A5: state_updated_idx on (state, updated_at)",
);
assert(
  /CREATE\s+INDEX\s+`subscription_dunning_state_since_idx`[\s\S]{0,400}\(`state_since_ms`\)/i.test(
    MIGRATION_SRC,
  ),
  "A6: state_since_idx on (state_since_ms)",
);

// Additive-only (zero existing rows; no DROP / MODIFY / CHANGE).
const sqlNoComments = MIGRATION_SRC.replace(/--.*$/gm, "").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
assert(
  !/\bDROP\b/i.test(sqlNoComments) && !/\bMODIFY\b/i.test(sqlNoComments),
  "A7: migration is additive only (no DROP / MODIFY)",
);

// ============================================================================
// SECTION B: Drizzle schema parity
// ============================================================================

const SCHEMA_PATH = path.join(ROOT, "db", "schema", "app.ts");
const SCHEMA_SRC = fs.readFileSync(SCHEMA_PATH, "utf8");

assert(
  /export\s+const\s+subscriptionDunning\s*=\s*mysqlTable\(/.test(SCHEMA_SRC),
  "B1: subscriptionDunning exported from db/schema/app.ts",
);

// Pull just the subscriptionDunning block for column-level checks.
const DUNNING_BLOCK_MATCH = SCHEMA_SRC.match(
  /export\s+const\s+subscriptionDunning\s*=\s*mysqlTable\([\s\S]*?\n\);/,
);
const DUNNING_BLOCK = DUNNING_BLOCK_MATCH ? DUNNING_BLOCK_MATCH[0] : "";
assert(DUNNING_BLOCK.length > 0, "B2: subscriptionDunning block extracted");

// Column-by-column parity with migration. The schema column DECLARATION
// uses camelCase TS keys but the DB column name (the first arg to
// varchar/bigint/etc) MUST match the migration's snake_case.
const SCHEMA_COLUMN_CHECKS = [
  { ts: "subscriptionId", db: "subscription_id", helper: /varchar\(\s*"subscription_id"/ },
  { ts: "state", db: "state", helper: /varchar\(\s*"state"/ },
  { ts: "stateSinceMs", db: "state_since_ms", helper: /bigint\(\s*"state_since_ms"/ },
  { ts: "nextRetryAtMs", db: "next_retry_at_ms", helper: /bigint\(\s*"next_retry_at_ms"/ },
  { ts: "failedAttempts", db: "failed_attempts", helper: /int\(\s*"failed_attempts"/ },
  {
    ts: "lastProviderEventId",
    db: "last_provider_event_id",
    helper: /varchar\(\s*"last_provider_event_id"/,
  },
  { ts: "createdAt", db: "created_at", helper: /timestamp\(\s*"created_at"/ },
  { ts: "updatedAt", db: "updated_at", helper: /timestamp\(\s*"updated_at"/ },
];
for (const { ts, db, helper } of SCHEMA_COLUMN_CHECKS) {
  assert(
    helper.test(DUNNING_BLOCK),
    `B3.${ts}: schema column maps to DB column "${db}"`,
  );
}

// The state column MUST default to "current" (matches migration default
// + matches the initial state in newDunningRow).
assert(
  /state:\s*varchar\([\s\S]{0,200}\.default\(\s*"current"\s*\)/.test(DUNNING_BLOCK),
  "B4: state column defaults to 'current' (matches migration + reducer)",
);

// updatedAt must use .onUpdateNow() so the timestamp moves on every
// upsert (matches migration's ON UPDATE CURRENT_TIMESTAMP clause).
assert(
  /updatedAt[\s\S]{0,300}\.onUpdateNow\(\)/.test(DUNNING_BLOCK),
  "B5: updatedAt has .onUpdateNow() (matches ON UPDATE clause)",
);

// Both indexes declared on the schema. Trailing-comma tolerant —
// prettier may format multi-arg `.on()` calls with one column per line
// and a dangling comma; the invariant is that BOTH columns appear in
// the call, regardless of whitespace / trailing-comma style.
assert(
  /stateUpdatedIdx:\s*index\(\s*"subscription_dunning_state_updated_idx"\s*\)\.on\([\s\S]{0,200}t\.state[\s\S]{0,200}t\.updatedAt[\s\S]{0,50}\)/.test(
    DUNNING_BLOCK,
  ),
  "B6: state_updated_idx declared on schema with (state, updatedAt)",
);
assert(
  /stateSinceIdx:\s*index\(\s*"subscription_dunning_state_since_idx"\s*\)\.on\([\s\S]{0,200}t\.stateSinceMs[\s\S]{0,50}\)/.test(
    DUNNING_BLOCK,
  ),
  "B7: state_since_idx declared on schema with (stateSinceMs)",
);

// ============================================================================
// SECTION C: Persist helpers in lib/payments/dunning.ts
// ============================================================================

const DUNNING_LIB_PATH = path.join(ROOT, "lib", "payments", "dunning.ts");
const DUNNING_LIB_SRC = fs.readFileSync(DUNNING_LIB_PATH, "utf8");

// Existing pure reducer surface MUST still be exported (don't break
// existing callers — degradation UX classifier imports it for the
// scaffold, /admin/dunning imports DUNNING_POLICY for grace-window
// display).
assert(
  /export\s+function\s+applyDunningEvent\(/.test(DUNNING_LIB_SRC),
  "C1: applyDunningEvent still exported (pure reducer preserved)",
);
assert(
  /export\s+function\s+newDunningRow\(/.test(DUNNING_LIB_SRC),
  "C2: newDunningRow still exported",
);
assert(
  /export\s+function\s+isEntitled\(/.test(DUNNING_LIB_SRC),
  "C3: isEntitled still exported",
);
assert(
  /export\s+const\s+DUNNING_POLICY/.test(DUNNING_LIB_SRC),
  "C4: DUNNING_POLICY still exported",
);
assert(
  /export\s+type\s+DunningState/.test(DUNNING_LIB_SRC),
  "C5: DunningState type still exported",
);
assert(
  /export\s+type\s+DunningEvent/.test(DUNNING_LIB_SRC),
  "C6: DunningEvent type still exported",
);
assert(
  /export\s+type\s+DunningRow/.test(DUNNING_LIB_SRC),
  "C7: DunningRow type still exported",
);

// New persist helpers landed.
assert(
  /export\s+async\s+function\s+loadDunningRow\(/.test(DUNNING_LIB_SRC),
  "C8: loadDunningRow exported",
);
assert(
  /export\s+async\s+function\s+persistDunningEvent\(/.test(DUNNING_LIB_SRC),
  "C9: persistDunningEvent exported",
);
assert(
  /export\s+async\s+function\s+listDunningRows\(/.test(DUNNING_LIB_SRC),
  "C10: listDunningRows exported",
);

// Persist must use the schema (not raw SQL strings) so a schema
// rename surfaces as a TS error.
assert(
  /from\s+"@\/db\/schema\/app"/.test(DUNNING_LIB_SRC) &&
    /subscriptionDunning/.test(DUNNING_LIB_SRC),
  "C11: persist helpers import subscriptionDunning from schema",
);

// persistDunningEvent must compose load + reduce + upsert (not bypass
// the pure reducer — that's how idempotency is preserved).
assert(
  /persistDunningEvent[\s\S]{0,3000}loadDunningRow/.test(DUNNING_LIB_SRC),
  "C12: persistDunningEvent loads existing row before reducing",
);
assert(
  /persistDunningEvent[\s\S]{0,3000}applyDunningEvent/.test(DUNNING_LIB_SRC),
  "C13: persistDunningEvent calls applyDunningEvent (idempotency preserved)",
);
assert(
  /persistDunningEvent[\s\S]{0,3000}onDuplicateKeyUpdate/.test(DUNNING_LIB_SRC),
  "C14: persistDunningEvent uses upsert (race-safe vs. concurrent webhook)",
);

// ============================================================================
// SECTION D: /admin/dunning page
// ============================================================================

const ADMIN_PAGE_PATH = path.join(ROOT, "app", "admin", "dunning", "page.tsx");
const ADMIN_PAGE_SRC = fs.existsSync(ADMIN_PAGE_PATH)
  ? fs.readFileSync(ADMIN_PAGE_PATH, "utf8")
  : "";

assert(ADMIN_PAGE_SRC.length > 0, "D1: app/admin/dunning/page.tsx exists");
assert(
  /requireAdmin\(\)/.test(ADMIN_PAGE_SRC),
  "D2: page gates access via requireAdmin()",
);
assert(
  /listDunningRows/.test(ADMIN_PAGE_SRC) &&
    /from\s+"@\/lib\/payments\/dunning"/.test(ADMIN_PAGE_SRC),
  "D3: page consumes listDunningRows from lib/payments/dunning",
);
assert(
  /DUNNING_POLICY/.test(ADMIN_PAGE_SRC),
  "D4: page references DUNNING_POLICY for grace-window display",
);
// All four states must be enumerated in the byState rollup so the
// summary cards never show `undefined` for a state we forgot.
for (const state of ["current", "past_due", "suspended", "cancelled"]) {
  assert(
    new RegExp(`byState\\.${state}|"${state}"`).test(ADMIN_PAGE_SRC),
    `D5.${state}: page renders ${state} bucket in summary`,
  );
}

// Phase E pending banner must call out that the table is empty by
// design today — operators reading the empty page should know why.
assert(
  /Phase\s+E\s+pending/i.test(ADMIN_PAGE_SRC),
  "D6: page surfaces 'Phase E pending' rationale (operator clarity)",
);

// Page is force-dynamic — admin pages MUST NOT render-cache (rows
// change as webhooks arrive).
assert(
  /dynamic\s*=\s*"force-dynamic"/.test(ADMIN_PAGE_SRC),
  "D7: page is force-dynamic (no render cache)",
);

// ============================================================================
// SECTION E: Admin nav entry
// ============================================================================

const ADMIN_LAYOUT_PATH = path.join(ROOT, "app", "admin", "layout.tsx");
const ADMIN_LAYOUT_SRC = fs.readFileSync(ADMIN_LAYOUT_PATH, "utf8");

assert(
  /href:\s*"\/admin\/dunning"/.test(ADMIN_LAYOUT_SRC),
  "E1: /admin/dunning entry exists in admin nav",
);
// Section must be Ops (matches /admin/ai-feedback rationale — health
// observation, not money rollup).
const dunningNavMatch = ADMIN_LAYOUT_SRC.match(
  /section:\s*"Ops"[\s\S]{0,500}\/admin\/dunning/,
);
assert(
  dunningNavMatch !== null,
  "E2: /admin/dunning nav entry is in 'Ops' section",
);

// ============================================================================
// SECTION F: Cross-file invariant — the four DunningState values must
// agree across the literal-union type, the migration's enum-via-default,
// the schema's varchar+default, and the admin page's StateChip palette.
// ============================================================================

const STATES = ["current", "past_due", "suspended", "cancelled"];
for (const state of STATES) {
  assert(
    new RegExp(`"${state}"`).test(DUNNING_LIB_SRC),
    `F1.${state}: DunningState union has "${state}"`,
  );
}
// Default value must be "current" (the only sane initial state — a
// fresh subscription has no failed charges yet).
assert(
  /DEFAULT\s+'current'/i.test(MIGRATION_SRC) &&
    /\.default\(\s*"current"\s*\)/.test(SCHEMA_SRC),
  "F2: 'current' is the default state across migration + schema",
);

// ============================================================================
// Output
// ============================================================================

if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error("  -", f);
}

console.log(`dunning-foundation: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
