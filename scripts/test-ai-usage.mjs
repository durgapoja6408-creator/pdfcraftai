#!/usr/bin/env node
// Self-contained test harness for Phase A1 `ai_usage` table wiring.
// Mirrors scripts/test-geo-waitlist.mjs — plain Node assertions, no Jest.
//
// What this covers:
//   SECTION A — static checks on the shipped artifacts: migration SQL,
//               Drizzle schema table, write-path helper, and call-site
//               instrumentation. Detects refactors that would drift the
//               contract.
//   SECTION B — cross-file invariants. The migration's CREATE TABLE, the
//               Drizzle schema definition, and the write-path helper
//               must all agree on column names + shape.
//   SECTION C — call-site coverage. At least one streaming AI route
//               (chat) and one non-streaming AI route (summarize) must
//               call `recordAiUsage` on both success and error branches.
//
// Run: `node scripts/test-ai-usage.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const MIG_PATH = resolve(ROOT, "db", "migrations", "0005_ai_usage.sql");
const SCHEMA_PATH = resolve(ROOT, "db", "schema", "app.ts");
const USAGE_PATH = resolve(ROOT, "lib", "ai", "usage.ts");
const CHAT_ROUTE_PATH = resolve(ROOT, "app", "api", "ai", "chat", "route.ts");
const SUMMARIZE_ROUTE_PATH = resolve(
  ROOT,
  "app",
  "api",
  "ai",
  "summarize",
  "route.ts"
);

const MIG_SRC = readFileSync(MIG_PATH, "utf8");
const SCHEMA_SRC = readFileSync(SCHEMA_PATH, "utf8");
const USAGE_SRC = readFileSync(USAGE_PATH, "utf8");
const CHAT_SRC = readFileSync(CHAT_ROUTE_PATH, "utf8");
const SUMMARIZE_SRC = readFileSync(SUMMARIZE_ROUTE_PATH, "utf8");

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
// SECTION A: static-content checks on each shipped artifact
// =============================================================================

// -- Migration SQL ---
assert(
  "A1 migration creates ai_usage table",
  /CREATE TABLE IF NOT EXISTS\s+`ai_usage`/.test(MIG_SRC),
  "Expected `CREATE TABLE IF NOT EXISTS \\`ai_usage\\`` in migration"
);

const REQUIRED_COLS = [
  "id",
  "user_id",
  "operation",
  "provider_id",
  "model",
  "input_tokens",
  "output_tokens",
  "latency_ms",
  "credits_spent",
  "cost_micros",
  "success",
  "error_code",
  "ledger_id",
  "idempotency_key",
  "created_at",
];
for (const col of REQUIRED_COLS) {
  assert(
    `A1 migration declares column \`${col}\``,
    new RegExp(`\`${col}\``).test(MIG_SRC),
    `Column \`${col}\` missing from migration SQL`
  );
}

assert(
  "A1 migration declares PRIMARY KEY on id",
  /PRIMARY KEY\(`id`\)/.test(MIG_SRC),
  "PRIMARY KEY on id missing"
);

assert(
  "A1 migration declares UNIQUE index on idempotency_key",
  /UNIQUE\(`idempotency_key`\)/.test(MIG_SRC),
  "UNIQUE constraint on idempotency_key missing"
);

assert(
  "A1 migration declares user_id FK to users ON DELETE CASCADE",
  /FOREIGN KEY \(`user_id`\) REFERENCES `users`\(`id`\) ON DELETE CASCADE/.test(
    MIG_SRC
  ),
  "user_id FK missing or wrong target"
);

for (const idx of [
  "ai_usage_user_created_idx",
  "ai_usage_created_idx",
  "ai_usage_provider_created_idx",
  "ai_usage_success_idx",
]) {
  assert(
    `A1 migration declares index ${idx}`,
    new RegExp(`CREATE INDEX \`${idx}\``).test(MIG_SRC),
    `Index ${idx} missing from migration`
  );
}

// -- Drizzle schema ---
assert(
  "A2 schema exports aiUsage table",
  /export const aiUsage = mysqlTable\(\s*"ai_usage"/.test(SCHEMA_SRC),
  "aiUsage export missing from schema"
);

// Check schema mentions the same columns (camelCase form in TS).
const SCHEMA_COL_MAP = {
  id: `"id"`,
  user_id: `"user_id"`,
  operation: `"operation"`,
  provider_id: `"provider_id"`,
  model: `"model"`,
  input_tokens: `"input_tokens"`,
  output_tokens: `"output_tokens"`,
  latency_ms: `"latency_ms"`,
  credits_spent: `"credits_spent"`,
  cost_micros: `"cost_micros"`,
  success: `"success"`,
  error_code: `"error_code"`,
  ledger_id: `"ledger_id"`,
  idempotency_key: `"idempotency_key"`,
  created_at: `"created_at"`,
};
for (const [sql, tsLiteral] of Object.entries(SCHEMA_COL_MAP)) {
  assert(
    `A2 schema declares column ${sql}`,
    SCHEMA_SRC.includes(tsLiteral),
    `TS literal ${tsLiteral} missing from schema`
  );
}

assert(
  "A2 schema references users.id for userId FK",
  /userId:\s+varchar\("user_id"[\s\S]*?\.references\(\(\)\s*=>\s*users\.id,\s*\{\s*onDelete:\s*"cascade"\s*\}\)/.test(
    SCHEMA_SRC
  ),
  "userId FK declaration (users.id, onDelete cascade) not found in schema"
);

// -- Write-path helper (lib/ai/usage.ts) ---
assert(
  "A3 usage helper exports recordAiUsage",
  /export async function recordAiUsage\(/.test(USAGE_SRC),
  "recordAiUsage function not exported"
);
assert(
  "A3 usage helper uses 'server-only' to keep off the client",
  /import\s+"server-only"/.test(USAGE_SRC),
  "Missing 'server-only' import in lib/ai/usage.ts"
);
assert(
  "A3 usage helper catches duplicate-key without throwing",
  /isDuplicateKeyError\(err\)/.test(USAGE_SRC) &&
    /reason:\s*"duplicate"/.test(USAGE_SRC),
  "Duplicate-key error handling missing"
);
assert(
  "A3 usage helper floors + clamps numeric fields to non-negative",
  /Math\.max\(0,\s*Math\.floor/.test(USAGE_SRC),
  "Non-negative clamp on numeric fields missing"
);

// =============================================================================
// SECTION B: cross-file invariants (migration ↔ schema agreement)
// =============================================================================

// Every migration column name must appear in the schema file (as a string
// literal for the underlying DB column name).
for (const col of REQUIRED_COLS) {
  assert(
    `B1 schema + migration agree on column '${col}'`,
    SCHEMA_SRC.includes(`"${col}"`),
    `Column '${col}' declared in migration but not in schema`
  );
}

// Every index name declared in the migration must also appear in the
// schema so Drizzle's introspection matches what MySQL sees.
const MIG_INDEXES = [
  "ai_usage_user_created_idx",
  "ai_usage_created_idx",
  "ai_usage_provider_created_idx",
  "ai_usage_success_idx",
  "ai_usage_idempotency_idx",
];
for (const idx of MIG_INDEXES) {
  assert(
    `B2 schema + migration agree on index '${idx}'`,
    SCHEMA_SRC.includes(`"${idx}"`),
    `Index '${idx}' declared in migration but not in schema`
  );
}

// =============================================================================
// SECTION C: call-site instrumentation coverage
// =============================================================================

// Chat route — streaming. Must call recordAiUsage in BOTH branches.
assert(
  "C1 chat route imports recordAiUsage",
  /from\s+"@\/lib\/ai\/usage"/.test(CHAT_SRC) &&
    /\brecordAiUsage\b/.test(CHAT_SRC),
  "chat route missing recordAiUsage import"
);
assert(
  "C1 chat route captures providerStartedAt before stream",
  /const providerStartedAt = Date\.now\(\)/.test(CHAT_SRC),
  "providerStartedAt timestamp missing from chat route"
);
{
  const recordCalls = CHAT_SRC.match(/await recordAiUsage\(/g) ?? [];
  assert(
    "C1 chat route calls recordAiUsage on BOTH success + error branches (>=2)",
    recordCalls.length >= 2,
    `Found ${recordCalls.length} recordAiUsage call(s) in chat route; expected >= 2`
  );
}
assert(
  "C1 chat route success branch passes success: true",
  /success:\s*true/.test(CHAT_SRC),
  "Chat route success branch must pass success: true"
);
assert(
  "C1 chat route error branch passes success: false with errorCode",
  /success:\s*false,[\s\S]*?errorCode:/.test(CHAT_SRC),
  "Chat route error branch must pass success: false + errorCode"
);

// Summarize route — non-streaming. Must call recordAiUsage on both
// outcomes.
assert(
  "C2 summarize route imports recordAiUsage",
  /from\s+"@\/lib\/ai\/usage"/.test(SUMMARIZE_SRC) &&
    /\brecordAiUsage\b/.test(SUMMARIZE_SRC),
  "summarize route missing recordAiUsage import"
);
assert(
  "C2 summarize route captures providerStartedAt",
  /const providerStartedAt = Date\.now\(\)/.test(SUMMARIZE_SRC),
  "providerStartedAt timestamp missing from summarize route"
);
{
  const recordCalls = SUMMARIZE_SRC.match(/await recordAiUsage\(/g) ?? [];
  assert(
    "C2 summarize route calls recordAiUsage on BOTH branches (>=2)",
    recordCalls.length >= 2,
    `Found ${recordCalls.length} recordAiUsage call(s) in summarize route; expected >= 2`
  );
}

// =============================================================================
// Report
// =============================================================================

const total = pass + fail;
console.log("");
console.log(`test-ai-usage.mjs — ${pass}/${total} assertions passed`);
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
