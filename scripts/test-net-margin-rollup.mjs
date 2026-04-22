#!/usr/bin/env node
// Self-contained test harness for Phase B / Task #17 — the net-margin
// finishing touches on the daily rollup: infra per-call amortization,
// refund reserve, and aged-credit breakage recognition.
//
// Companion to test-ai-margin-rollup.mjs. That suite pins the Phase A4
// gross-margin pipeline (migration 0006, core revenue-proxy math, cron
// auth, streak semantics). This suite pins what Task #17 LAYERED ON TOP
// — three nullable columns on ai_daily_margin (migration 0013), three
// env-keyed constants in lib/ai/margin-rollup.ts, and the three
// synthesis points in runDailyRollup that populate them.
//
// What this covers:
//   SECTION A — migration 0013 SQL static contract: additive-only ALTER
//               TABLE adding exactly three nullable bigint columns
//               (infra_cost_per_call_micros, refund_reserve_micros,
//               breakage_revenue_micros). No DROP, no MODIFY, no index
//               changes. All three NULL-allowing so legacy rows sit
//               there as "not measured".
//   SECTION B — Drizzle schema at db/schema/app.ts extends aiDailyMargin
//               with matching fields (bigint mode:number, nullable) and
//               leaves the unique/index set unchanged.
//   SECTION C — lib/ai/margin-rollup.ts exports the Task #17 public
//               surface: INFRA_MONTHLY_USD_MICROS, REFUND_RESERVE_BPS,
//               BREAKAGE_RECOGNITION_MONTHS (env-tunable constants),
//               BREAKAGE_SYNTHETIC_SLICE (the {provider: "system",
//               model: "breakage", operation: "breakage"} triplet),
//               computeInfraCostPerCallMicros, computeBreakageRevenueMicros.
//   SECTION D — SliceReport type carries the three new nullable fields;
//               runDailyRollup populates them on the insert path; upsert
//               includes them in ON DUPLICATE KEY UPDATE; synthetic
//               breakage slice is gated on aggRows.length > 0 so an
//               outage day still stops the green streak.
//   SECTION E — cross-file invariants: every new column name appears in
//               migration + schema + rollup; the refund-reserve math
//               uses REFUND_RESERVE_BPS / 10_000; breakage recognition
//               uses BREAKAGE_RECOGNITION_MONTHS for the cutoff; infra
//               rate uses prior-day call count with same-day fallback.
//
// Run: `node scripts/test-net-margin-rollup.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const MIG_PATH = resolve(
  ROOT,
  "db",
  "migrations",
  "0013_ai_daily_margin_net_margin.sql"
);
const SCHEMA_PATH = resolve(ROOT, "db", "schema", "app.ts");
const ROLLUP_PATH = resolve(ROOT, "lib", "ai", "margin-rollup.ts");
const AGGREGATOR_PATH = resolve(ROOT, "scripts", "run-all-tests.mjs");

const MIG_SRC = readFileSync(MIG_PATH, "utf8");
const SCHEMA_SRC = readFileSync(SCHEMA_PATH, "utf8");
const ROLLUP_SRC = readFileSync(ROLLUP_PATH, "utf8");
const AGG_SRC = readFileSync(AGGREGATOR_PATH, "utf8");

let pass = 0;
let fail = 0;
const failures = [];

function assert(label, condition, detail) {
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
    failures.push({ label, detail });
  }
}

// =============================================================================
// SECTION A: migration 0013 static contract
// =============================================================================

assert(
  "A1 migration is strictly additive — only ALTER TABLE ADD COLUMN",
  /ALTER TABLE\s+`ai_daily_margin`[\s\S]+ADD COLUMN/.test(MIG_SRC) &&
    !/DROP\s+COLUMN|MODIFY\s+COLUMN|CHANGE\s+COLUMN|DROP\s+TABLE|DROP\s+INDEX/i.test(
      // Strip comments before scanning for destructive ops so commentary
      // like "no DROP needed" doesn't false-positive.
      MIG_SRC.replace(/--[^\n]*\n/g, "\n")
    ),
  "Migration 0013 must only ADD COLUMN — no destructive ops, no index changes"
);

assert(
  "A2 migration adds infra_cost_per_call_micros as nullable bigint",
  /ADD COLUMN\s+`infra_cost_per_call_micros`\s+bigint\s+NULL/i.test(MIG_SRC),
  "infra_cost_per_call_micros must be bigint NULL (no NOT NULL, no default, nullable)"
);

assert(
  "A3 migration adds refund_reserve_micros as nullable bigint",
  /ADD COLUMN\s+`refund_reserve_micros`\s+bigint\s+NULL/i.test(MIG_SRC),
  "refund_reserve_micros must be bigint NULL"
);

assert(
  "A4 migration adds breakage_revenue_micros as nullable bigint",
  /ADD COLUMN\s+`breakage_revenue_micros`\s+bigint\s+NULL/i.test(MIG_SRC),
  "breakage_revenue_micros must be bigint NULL"
);

assert(
  "A5 migration docstring cites Task #17 and Phase B",
  /Task #17/.test(MIG_SRC) && /Phase B/.test(MIG_SRC),
  "Header comment must identify which task/phase this migration serves"
);

assert(
  "A6 migration explains why the new columns are nullable",
  /nullable|NULL/i.test(MIG_SRC) && /legacy|historical|pre-/i.test(MIG_SRC),
  "Rationale for nullable columns (legacy rows) must be in the header"
);

// =============================================================================
// SECTION B: Drizzle schema parity
// =============================================================================

assert(
  "B1 schema declares infraCostPerCallMicros as bigint nullable",
  /infraCostPerCallMicros:\s*bigint\(\s*"infra_cost_per_call_micros"[\s\S]{0,80}mode:\s*"number"/m.test(
    SCHEMA_SRC
  ) &&
    // No .notNull() chain on this field — regex looks at the chunk
    // between the column declaration and the next comma/line-end.
    !/infraCostPerCallMicros:\s*bigint\([^)]+\)[^,}\n]*\.notNull\(\)/m.test(
      SCHEMA_SRC
    ),
  "infraCostPerCallMicros must be bigint mode:number and NOT .notNull()"
);

assert(
  "B2 schema declares refundReserveMicros as bigint nullable",
  /refundReserveMicros:\s*bigint\(\s*"refund_reserve_micros"[\s\S]{0,80}mode:\s*"number"/m.test(
    SCHEMA_SRC
  ) &&
    !/refundReserveMicros:\s*bigint\([^)]+\)[^,}\n]*\.notNull\(\)/m.test(
      SCHEMA_SRC
    ),
  "refundReserveMicros must be bigint mode:number and NOT .notNull()"
);

assert(
  "B3 schema declares breakageRevenueMicros as bigint nullable",
  /breakageRevenueMicros:\s*bigint\(\s*"breakage_revenue_micros"[\s\S]{0,80}mode:\s*"number"/m.test(
    SCHEMA_SRC
  ) &&
    !/breakageRevenueMicros:\s*bigint\([^)]+\)[^,}\n]*\.notNull\(\)/m.test(
      SCHEMA_SRC
    ),
  "breakageRevenueMicros must be bigint mode:number and NOT .notNull()"
);

assert(
  "B4 schema keeps the existing UNIQUE + indexes unchanged",
  /uniqueIndex\("ai_daily_margin_slice_idx"\)\.on\(\s*t\.date,\s*t\.providerId,\s*t\.model,\s*t\.operation\s*\)/m.test(
    SCHEMA_SRC
  ) &&
    /index\("ai_daily_margin_date_idx"\)/.test(SCHEMA_SRC) &&
    /index\("ai_daily_margin_date_green_idx"\)/.test(SCHEMA_SRC) &&
    /index\("ai_daily_margin_provider_date_idx"\)/.test(SCHEMA_SRC),
  "Unique+three indexes from migration 0006 must all still be declared"
);

assert(
  "B5 schema block cites Task #17",
  /Task #17/.test(SCHEMA_SRC),
  "aiDailyMargin Drizzle block must annotate the Task #17 additions"
);

// =============================================================================
// SECTION C: margin-rollup.ts public surface
// =============================================================================

assert(
  "C1 export INFRA_MONTHLY_USD_MICROS with env fallback",
  /export\s+const\s+INFRA_MONTHLY_USD_MICROS\s*=\s*parseIntEnv\(\s*"INFRA_MONTHLY_USD_MICROS"/.test(
    ROLLUP_SRC
  ) && /15_000_000|15000000/.test(ROLLUP_SRC),
  "INFRA_MONTHLY_USD_MICROS must parse env with a ~$15/mo default (15_000_000 µUSD)"
);

assert(
  "C2 export REFUND_RESERVE_BPS with env fallback default 300",
  /export\s+const\s+REFUND_RESERVE_BPS\s*=\s*parseIntEnv\(\s*"REFUND_RESERVE_BPS"[\s\S]{0,20}300/m.test(
    ROLLUP_SRC
  ),
  "REFUND_RESERVE_BPS must parse env with default 300 (3%)"
);

assert(
  "C3 export BREAKAGE_RECOGNITION_MONTHS with env fallback default 12",
  /export\s+const\s+BREAKAGE_RECOGNITION_MONTHS\s*=\s*parseIntEnv\(\s*"BREAKAGE_RECOGNITION_MONTHS"[\s\S]{0,20}12/m.test(
    ROLLUP_SRC
  ),
  "BREAKAGE_RECOGNITION_MONTHS must parse env with default 12"
);

assert(
  "C4 parseIntEnv guards against negative / non-integer env values",
  /function\s+parseIntEnv[\s\S]+Number\.isFinite[\s\S]+<\s*0/m.test(
    ROLLUP_SRC
  ) && /using default/.test(ROLLUP_SRC),
  "parseIntEnv must reject NaN / negative and fall back to default with a warning"
);

assert(
  "C5 export BREAKAGE_SYNTHETIC_SLICE triplet",
  /export\s+const\s+BREAKAGE_SYNTHETIC_SLICE[\s\S]{0,200}providerId:\s*"system"[\s\S]{0,60}model:\s*"breakage"[\s\S]{0,60}operation:\s*"breakage"/m.test(
    ROLLUP_SRC
  ),
  "BREAKAGE_SYNTHETIC_SLICE must be exported as (system, breakage, breakage)"
);

assert(
  "C6 export computeInfraCostPerCallMicros",
  /export\s+async\s+function\s+computeInfraCostPerCallMicros\s*\(/m.test(
    ROLLUP_SRC
  ),
  "computeInfraCostPerCallMicros must be exported so the test + dashboard can call it"
);

assert(
  "C7 infra-cost math divides monthly by 30 then by prior-day-or-fallback count",
  /INFRA_MONTHLY_USD_MICROS\s*\/\s*30/.test(ROLLUP_SRC) &&
    /priorCallCount\s*>\s*0\s*\?\s*priorCallCount\s*:\s*opts\.sameDayCallCount/.test(
      ROLLUP_SRC
    ),
  "Formula must be (INFRA_MONTHLY_USD_MICROS / 30) / prior_day_call_count, with sameDayCallCount fallback"
);

assert(
  "C8 infra-cost returns 0 when both prior and same-day count are 0",
  /divisor\s*<=\s*0[\s\S]{0,40}return\s+0/m.test(ROLLUP_SRC),
  "Divisor ≤ 0 must short-circuit to 0 — never divide by zero"
);

assert(
  "C9 export computeBreakageRevenueMicros",
  /export\s+async\s+function\s+computeBreakageRevenueMicros\s*\(/m.test(
    ROLLUP_SRC
  ),
  "computeBreakageRevenueMicros must be exported"
);

assert(
  "C10 breakage query uses MAX(created_at) last_activity cutoff",
  /MAX\(created_at\)/.test(ROLLUP_SRC) &&
    /SUM\(delta\)/.test(ROLLUP_SRC) &&
    /current_balance\s*>\s*0/.test(ROLLUP_SRC) &&
    /last_activity\s*<\s*\$\{cutoff\}/.test(ROLLUP_SRC),
  "Breakage query must group by user_id, sum delta, take MAX(created_at), and filter to balance>0 AND last_activity<cutoff"
);

assert(
  "C11 breakage cutoff uses BREAKAGE_RECOGNITION_MONTHS",
  /setUTCMonth\s*\([\s\S]*?-\s*BREAKAGE_RECOGNITION_MONTHS/m.test(ROLLUP_SRC),
  "Cutoff must be targetDate minus BREAKAGE_RECOGNITION_MONTHS months"
);

assert(
  "C12 breakage credits → µUSD via REFERENCE_USD_MICROS_PER_CREDIT",
  /totalCredits\s*\*\s*REFERENCE_USD_MICROS_PER_CREDIT/.test(ROLLUP_SRC),
  "Breakage credit count must be priced via the same revenue proxy as real usage"
);

// =============================================================================
// SECTION D: runDailyRollup wiring
// =============================================================================

assert(
  "D1 SliceReport type carries three new nullable fields",
  /export type SliceReport\s*=\s*\{[\s\S]{0,2000}infraCostPerCallMicros:\s*number\s*\|\s*null;[\s\S]{0,200}refundReserveMicros:\s*number\s*\|\s*null;[\s\S]{0,200}breakageRevenueMicros:\s*number\s*\|\s*null;/m.test(
    ROLLUP_SRC
  ),
  "SliceReport must include infraCostPerCallMicros, refundReserveMicros, breakageRevenueMicros (all number|null)"
);

assert(
  "D2 runDailyRollup computes infra rate ONCE per day (outside the for-loop)",
  /const\s+sameDayCallCount\s*=\s*aggRows\.reduce[\s\S]{0,500}infraCostPerCallMicros\s*=\s*await\s+computeInfraCostPerCallMicros\(/m.test(
    ROLLUP_SRC
  ),
  "Infra rate is fleet-wide — compute once, apply to every slice"
);

assert(
  "D3 per-slice refund reserve = revenue * REFUND_RESERVE_BPS / 10_000",
  /Math\.floor\(\s*\(?\s*revenueMicrosSum\s*\*\s*REFUND_RESERVE_BPS\s*\)?\s*\/\s*10[_]?000/m.test(
    ROLLUP_SRC
  ),
  "Reserve formula must be floor(revenue * BPS / 10_000) — under-accrue not over-accrue"
);

assert(
  "D4 insertValues carry the three new columns per slice",
  /insertValues\.push\(\{[\s\S]{0,2000}infraCostPerCallMicros[\s\S]{0,200}refundReserveMicros[\s\S]{0,200}breakageRevenueMicros/m.test(
    ROLLUP_SRC
  ),
  "Every insertValues.push must include all three new columns"
);

assert(
  "D5 upsert ON DUPLICATE KEY UPDATE includes the three new columns",
  /onDuplicateKeyUpdate\(\{\s*set:\s*\{[\s\S]{0,3000}infraCostPerCallMicros:\s*sql`VALUES\(infra_cost_per_call_micros\)`[\s\S]{0,300}refundReserveMicros:\s*sql`VALUES\(refund_reserve_micros\)`[\s\S]{0,300}breakageRevenueMicros:\s*sql`VALUES\(breakage_revenue_micros\)`/m.test(
    ROLLUP_SRC
  ),
  "Re-running a day must overwrite the three financial columns too, not just the gross-margin fields"
);

assert(
  "D6 synthetic breakage slice gated on aggRows.length > 0",
  /shouldWriteBreakage\s*=\s*aggRows\.length\s*>\s*0/m.test(ROLLUP_SRC) &&
    /if\s*\(\s*shouldWriteBreakage\s*\)\s*\{[\s\S]{0,3000}slices\.push\(breakageSlice\)/m.test(
      ROLLUP_SRC
    ),
  "Empty days must NOT get a breakage slice — otherwise greenStreak runs through outages"
);

assert(
  "D7 synthetic breakage slice has is_green=1, margin_bps=10_000, null infra/reserve",
  /marginBps:\s*10_?000[\s\S]{0,400}floorBps:\s*0[\s\S]{0,400}isGreen:\s*1[\s\S]{0,400}infraCostPerCallMicros:\s*null[\s\S]{0,200}refundReserveMicros:\s*null/m.test(
    ROLLUP_SRC
  ),
  "Breakage slice pins 100% margin / passes any floor / has NULL infra+reserve (breakage has no COGS and isn't reserved against)"
);

assert(
  "D8 real slices have breakageRevenueMicros: null",
  // Only the synthetic slice carries a breakage number; real slices
  // explicitly nil it out.
  /breakageRevenueMicros:\s*null[\s\S]{0,3000}shouldWriteBreakage/m.test(
    ROLLUP_SRC
  ),
  "Real slices must write breakageRevenueMicros: null — breakage lives only on the synthetic slice"
);

assert(
  "D9 breakage computation wrapped in try/catch (non-fatal)",
  /try\s*\{[\s\S]{0,400}computeBreakageRevenueMicros[\s\S]{0,400}\}\s*catch[\s\S]{0,400}non-fatal/m.test(
    ROLLUP_SRC
  ),
  "A failed breakage lookup must not kill the rollup — degrade to 0 with a warn log"
);

assert(
  "D10 infra computation wrapped in try/catch (non-fatal)",
  /try\s*\{[\s\S]{0,400}computeInfraCostPerCallMicros[\s\S]{0,400}\}\s*catch[\s\S]{0,400}non-fatal/m.test(
    ROLLUP_SRC
  ),
  "A failed infra-rate lookup must not kill the rollup either"
);

// =============================================================================
// SECTION E: cross-file invariants
// =============================================================================

assert(
  "E1 infra_cost_per_call_micros appears in migration + schema + rollup",
  /infra_cost_per_call_micros/.test(MIG_SRC) &&
    /infra_cost_per_call_micros/.test(SCHEMA_SRC) &&
    /infra_cost_per_call_micros/.test(ROLLUP_SRC),
  "Column name infra_cost_per_call_micros must live in all three layers (migration, schema, rollup)"
);

assert(
  "E2 refund_reserve_micros appears in migration + schema + rollup",
  /refund_reserve_micros/.test(MIG_SRC) &&
    /refund_reserve_micros/.test(SCHEMA_SRC) &&
    /refund_reserve_micros/.test(ROLLUP_SRC),
  "Column name refund_reserve_micros must live in all three layers"
);

assert(
  "E3 breakage_revenue_micros appears in migration + schema + rollup",
  /breakage_revenue_micros/.test(MIG_SRC) &&
    /breakage_revenue_micros/.test(SCHEMA_SRC) &&
    /breakage_revenue_micros/.test(ROLLUP_SRC),
  "Column name breakage_revenue_micros must live in all three layers"
);

assert(
  "E4 camelCase parity — infraCostPerCallMicros in schema + rollup",
  /infraCostPerCallMicros/.test(SCHEMA_SRC) &&
    /infraCostPerCallMicros/.test(ROLLUP_SRC),
  "Drizzle field infraCostPerCallMicros must match the rollup's insert/upsert references"
);

assert(
  "E5 camelCase parity — refundReserveMicros + breakageRevenueMicros",
  /refundReserveMicros/.test(SCHEMA_SRC) &&
    /refundReserveMicros/.test(ROLLUP_SRC) &&
    /breakageRevenueMicros/.test(SCHEMA_SRC) &&
    /breakageRevenueMicros/.test(ROLLUP_SRC),
  "Camel-case field names must be consistent across Drizzle + rollup"
);

assert(
  "E6 aggregator run-all-tests.mjs includes net-margin-rollup entry",
  /name:\s*"net-margin-rollup",\s*file:\s*"test-net-margin-rollup\.mjs"/.test(
    AGG_SRC
  ),
  "scripts/run-all-tests.mjs SUITES must include net-margin-rollup"
);

assert(
  "E7 aggregator orders net-margin-rollup after ai-margin-rollup",
  /ai-margin-rollup[\s\S]{0,3000}net-margin-rollup/.test(AGG_SRC),
  "net-margin-rollup should follow ai-margin-rollup — Phase B extends Phase A"
);

// =============================================================================
// Report
// =============================================================================

const total = pass + fail;
console.log("");
console.log(`test-net-margin-rollup.mjs — ${pass}/${total} assertions passed`);
// Canonical summary line — parsed by scripts/run-all-tests.mjs.
console.log(`Net-margin-rollup tests: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("");
  console.error("FAILURES:");
  for (const f of failures) {
    console.error(`  ✗ ${f.label}`);
    console.error(`      ${f.detail}`);
  }
  process.exit(1);
}
process.exit(0);
