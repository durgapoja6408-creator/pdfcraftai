#!/usr/bin/env node
// Self-contained test harness for Phase B / Task #15 — credit_ledger
// financial columns (fee / tax / FX / net_revenue).
//
// Mirrors scripts/test-ai-usage.mjs — plain Node assertions, no Jest,
// static-parse pattern (doesn't touch a real MySQL connection).
//
// What this covers:
//   SECTION A — migration 0012_credit_ledger_financials.sql shape:
//               ALTER TABLE + every documented column present with the
//               right type and DEFAULT NULL.
//   SECTION B — Drizzle schema app.ts pins: creditLedger table gets the
//               12 new fields with matching SQL column names, correct
//               drizzle-orm helpers (bigint/varchar/decimal), and the
//               appropriate length/precision.
//   SECTION C — lib/payments/ledger.ts wiring: LedgerFinancials type is
//               exported, GrantCreditsInput exposes `financials?`, and
//               the tx.insert().values() call spreads every financial
//               field (with `?? null` fallback) onto the row.
//   SECTION D — cross-file invariants: every column name in the
//               migration must appear both in the Drizzle schema AND in
//               the ledger.ts insert payload. This is the refactor-trap
//               that catches a column being added to the migration but
//               left out of the write path (the bug that shipped net=0
//               for a week in the prototype).
//   SECTION E — additive migration safety: every ADD COLUMN has
//               DEFAULT NULL, no NOT NULL constraints, no FK additions,
//               no index additions. Verified so a rolling deploy can't
//               strand a pre-migration writer against a post-migration
//               schema.
//
// Run: `node scripts/test-credit-ledger-financials.mjs`
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
  "0012_credit_ledger_financials.sql"
);
const SCHEMA_PATH = resolve(ROOT, "db", "schema", "app.ts");
const LEDGER_PATH = resolve(ROOT, "lib", "payments", "ledger.ts");
// Phase B / Task #16 — `LedgerFinancials` type moved from ledger.ts →
// types.ts. The enum-literal assertions below (C3-C5) now inspect the
// types.ts source where the discriminated unions live.
const TYPES_PATH = resolve(ROOT, "lib", "payments", "types.ts");

const MIG_SRC = readFileSync(MIG_PATH, "utf8");
const SCHEMA_SRC = readFileSync(SCHEMA_PATH, "utf8");
const LEDGER_SRC = readFileSync(LEDGER_PATH, "utf8");
const TYPES_SRC = readFileSync(TYPES_PATH, "utf8");

let pass = 0;
let fail = 0;
const failures = [];

function assert(label, condition, detail) {
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
    failures.push({ label, detail: detail ?? "" });
  }
}

// Canonical list — driven from the PHASE_B_SCHEMA_OBSERVABILITY.md spec.
// Every check below loops over this list so "add a new column" is a
// one-line change in both the migration and this file.
const COLUMNS = [
  { sql: "gross_charge_micros",    ts: "grossChargeMicros",    sqlType: "bigint",         drizzle: /bigint\(\s*"gross_charge_micros"/ },
  { sql: "billing_currency",       ts: "billingCurrency",      sqlType: "char(3)",        drizzle: /varchar\(\s*"billing_currency",\s*\{\s*length:\s*3\s*\}\)/ },
  { sql: "provider",               ts: "provider",             sqlType: "varchar(32)",    drizzle: /varchar\(\s*"provider",\s*\{\s*length:\s*32\s*\}\)/ },
  { sql: "processor_fee_micros",   ts: "processorFeeMicros",   sqlType: "bigint",         drizzle: /bigint\(\s*"processor_fee_micros"/ },
  { sql: "tax_collected_micros",   ts: "taxCollectedMicros",   sqlType: "bigint",         drizzle: /bigint\(\s*"tax_collected_micros"/ },
  { sql: "tax_treatment",          ts: "taxTreatment",         sqlType: "varchar(16)",    drizzle: /varchar\(\s*"tax_treatment",\s*\{\s*length:\s*16\s*\}\)/ },
  { sql: "tax_remittable_micros",  ts: "taxRemittableMicros",  sqlType: "bigint",         drizzle: /bigint\(\s*"tax_remittable_micros"/ },
  { sql: "fx_rate_used",           ts: "fxRateUsed",           sqlType: "decimal(18,8)",  drizzle: /decimal\(\s*"fx_rate_used",\s*\{\s*precision:\s*18,\s*scale:\s*8\s*\}\)/ },
  { sql: "fx_slippage_micros",     ts: "fxSlippageMicros",     sqlType: "bigint",         drizzle: /bigint\(\s*"fx_slippage_micros"/ },
  { sql: "net_revenue_micros",     ts: "netRevenueMicros",     sqlType: "bigint",         drizzle: /bigint\(\s*"net_revenue_micros"/ },
  { sql: "card_fingerprint",       ts: "cardFingerprint",      sqlType: "varchar(64)",    drizzle: /varchar\(\s*"card_fingerprint",\s*\{\s*length:\s*64\s*\}\)/ },
  { sql: "data_source",            ts: "dataSource",           sqlType: "varchar(16)",    drizzle: /varchar\(\s*"data_source",\s*\{\s*length:\s*16\s*\}\)/ },
];

// =============================================================================
// SECTION A: migration SQL shape
// =============================================================================
assert(
  "A1: migration targets credit_ledger",
  /ALTER TABLE\s+`?credit_ledger`?/i.test(MIG_SRC)
);

assert(
  "A2: migration has no ADD INDEX / ADD KEY (additive-columns-only)",
  !/\bADD\s+(INDEX|KEY|UNIQUE)\b/i.test(MIG_SRC)
);

assert(
  "A3: migration has no FK additions (no REFERENCES clauses on new cols)",
  !/\bADD\s+COLUMN[^,\n]+REFERENCES\b/i.test(MIG_SRC)
);

for (const col of COLUMNS) {
  // Match the ADD COLUMN line for this column. Column names are
  // backtick-wrapped in the migration.
  const pattern = new RegExp(
    `ADD\\s+COLUMN\\s+\`${col.sql}\`\\s+${col.sqlType.replace(/([().])/g, "\\$1")}\\s+DEFAULT\\s+NULL`,
    "i"
  );
  assert(
    `A4.${col.sql}: ADD COLUMN line present with type ${col.sqlType} DEFAULT NULL`,
    pattern.test(MIG_SRC)
  );
}

// Defensive: no NOT NULL on any new column.
for (const col of COLUMNS) {
  const pattern = new RegExp(`\`${col.sql}\`[^,\\n]*NOT\\s+NULL`, "i");
  assert(
    `A5.${col.sql}: not NOT NULL (additive + rollback safe)`,
    !pattern.test(MIG_SRC)
  );
}

// =============================================================================
// SECTION B: Drizzle schema app.ts pins
// =============================================================================
assert(
  "B1: decimal helper imported from drizzle-orm/mysql-core",
  /from\s+"drizzle-orm\/mysql-core"/.test(SCHEMA_SRC) &&
    /\bdecimal\b/.test(SCHEMA_SRC.split("drizzle-orm/mysql-core")[0] || "") ||
    // The import list is multiline; grab the import block and look for `decimal,`
    /import\s*\{[^}]*\bdecimal\b[^}]*\}\s*from\s*"drizzle-orm\/mysql-core"/.test(
      SCHEMA_SRC
    )
);

// Extract the creditLedger block so per-column regex is scoped.
const CREDIT_LEDGER_BLOCK_MATCH = SCHEMA_SRC.match(
  /export const creditLedger[\s\S]*?\}\s*\)\s*;/
);
assert(
  "B2: creditLedger block extractable",
  CREDIT_LEDGER_BLOCK_MATCH !== null
);
const CREDIT_LEDGER_BLOCK = CREDIT_LEDGER_BLOCK_MATCH ? CREDIT_LEDGER_BLOCK_MATCH[0] : "";

for (const col of COLUMNS) {
  assert(
    `B3.${col.sql}: creditLedger declares ${col.ts} with ${col.sqlType} helper`,
    col.drizzle.test(CREDIT_LEDGER_BLOCK)
  );
}

// =============================================================================
// SECTION C: lib/payments/ledger.ts wiring
// =============================================================================
// Phase B / Task #16 — LedgerFinancials moved to types.ts so the Paddle
// adapter can build the payload without pulling in the ledger module
// (and so NormalizedPaymentEvent can embed it without a circular import).
// ledger.ts must still re-export it so callers that import it from
// "@/lib/payments/ledger" continue to work. Accept either:
//   - direct definition: `export type LedgerFinancials = { ... }`
//   - re-export: `export type { LedgerFinancials } from "./types";`
assert(
  "C1: LedgerFinancials type exported (direct or re-export from ./types)",
  /export\s+type\s+LedgerFinancials\s*=/.test(LEDGER_SRC) ||
    /export\s+type\s*\{\s*[^}]*\bLedgerFinancials\b[^}]*\}\s*from\s*["']\.\/types["']/.test(
      LEDGER_SRC
    )
);

assert(
  "C2: GrantCreditsInput includes financials?: LedgerFinancials",
  /financials\?\s*:\s*LedgerFinancials/.test(LEDGER_SRC)
);

// C3: "refund_reversal" is both a union member in types.ts AND must be
// the override value the ledger tags onto refund debits. The type-side
// check + the handleRefund-side check together guarantee we can't
// silently drop the refund_reversal tag (either by trimming the union
// or by forgetting to set it in the ledger).
assert(
  "C3a: provider union in types.ts includes refund_reversal",
  /"refund_reversal"/.test(TYPES_SRC)
);
assert(
  "C3b: ledger.ts handleRefund sets provider: \"refund_reversal\"",
  /provider:\s*"refund_reversal"/.test(LEDGER_SRC)
);

assert(
  "C4: tax_treatment union in types.ts includes mor/forward/rcm/none",
  /"mor"/.test(TYPES_SRC) &&
    /"forward"/.test(TYPES_SRC) &&
    /"rcm"/.test(TYPES_SRC) &&
    /"none"/.test(TYPES_SRC)
);

assert(
  "C5: data_source union in types.ts includes webhook/backfill_api/estimate",
  /"webhook"/.test(TYPES_SRC) &&
    /"backfill_api"/.test(TYPES_SRC) &&
    /"estimate"/.test(TYPES_SRC)
);

// fxRateUsed is persisted via String(...) — guard that: we must never
// parseFloat a decimal(18,8), because IEEE-754 can't hold 8 decimal
// precision past ~15 total digits.
assert(
  "C6: fxRateUsed persisted via String() (no parseFloat / Number())",
  /fxRateUsed:[\s\S]*?String\(fin\.fxRateUsed\)/.test(LEDGER_SRC) &&
    !/fxRateUsed:[\s\S]*?parseFloat/.test(LEDGER_SRC) &&
    !/fxRateUsed:[\s\S]*?Number\(/.test(LEDGER_SRC)
);

// Every column appears in the tx.insert().values() payload with a
// `?? null` fallback (or, for fxRateUsed, the String() wrapper above).
for (const col of COLUMNS) {
  if (col.ts === "fxRateUsed") continue; // special-cased above
  const pattern = new RegExp(
    `${col.ts}:\\s*fin\\.${col.ts}\\s*\\?\\?\\s*null`
  );
  assert(
    `C7.${col.ts}: ledger insert sets ${col.ts} with ?? null fallback`,
    pattern.test(LEDGER_SRC)
  );
}

// =============================================================================
// SECTION D: cross-file invariant
// =============================================================================
for (const col of COLUMNS) {
  // Migration has it
  const inMig = new RegExp(`\`${col.sql}\``).test(MIG_SRC);
  // Schema has it
  const inSchema = new RegExp(`"${col.sql}"`).test(CREDIT_LEDGER_BLOCK);
  // Ledger.ts has it (either as property key or in the String() wrapper)
  const inLedger = new RegExp(`\\b${col.ts}\\b`).test(LEDGER_SRC);
  assert(
    `D.${col.sql}: present in all three layers (migration ✓ schema ✓ ledger.ts ✓)`,
    inMig && inSchema && inLedger,
    `mig=${inMig} schema=${inSchema} ledger=${inLedger}`
  );
}

// =============================================================================
// SECTION E: additive migration safety summary
// =============================================================================
// Strip SQL line comments (-- ...) before counting. The migration embeds
// both a rationale comment that mentions "ADD COLUMN" in prose and a
// rollback playbook that lists DROP COLUMN statements — neither of which
// runs, but both of which would poison a naive regex.
const MIG_SQL_ONLY = MIG_SRC
  .split("\n")
  .map((line) => (line.replace(/--.*$/, "")))
  .join("\n");

// Count ADD COLUMN occurrences — must be exactly COLUMNS.length.
const addColumnCount = (MIG_SQL_ONLY.match(/\bADD\s+COLUMN\b/gi) || []).length;
assert(
  `E1: exactly ${COLUMNS.length} ADD COLUMN statements (found ${addColumnCount})`,
  addColumnCount === COLUMNS.length
);

// No DROP, no MODIFY, no CHANGE — purely additive. (Comment-only DROP
// COLUMN in the rollback block is allowed; we strip comments above.)
assert(
  "E2: no DROP COLUMN / MODIFY / CHANGE in executable SQL",
  !/\b(DROP\s+COLUMN|MODIFY\s+COLUMN|CHANGE\s+COLUMN)\b/i.test(MIG_SQL_ONLY)
);

// Rollback block is present in comments — so future-us knows how to undo.
assert(
  "E3: rollback playbook embedded in migration comments",
  /Rollback path/i.test(MIG_SRC) && /DROP COLUMN/i.test(MIG_SRC)
);

// =============================================================================
// Report
// =============================================================================
console.log("");
if (fail === 0) {
  console.log(`credit-ledger-financials: ${pass} passed, ${fail} failed`);
  process.exit(0);
} else {
  console.log(`credit-ledger-financials: ${pass} passed, ${fail} failed`);
  for (const f of failures) {
    console.log(`  — ${f.label}${f.detail ? ` :: ${f.detail}` : ""}`);
  }
  process.exit(1);
}
