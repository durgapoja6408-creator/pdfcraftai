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
//   SECTION D — Task #11 (output-cap centralization + truncation
//               observability). Pins migration 0008, the two new
//               columns (stop_reason, response_truncated), the
//               covering index, the RecordAiUsageInput extension,
//               the isTruncatedStopReason classifier, the call-site
//               wiring, AND the 10/10 op-module migration to
//               capForOp/clampToHardCeiling.
//
// Run: `node scripts/test-ai-usage.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const MIG_PATH = resolve(ROOT, "db", "migrations", "0005_ai_usage.sql");
const MIG_0008_PATH = resolve(
  ROOT,
  "db",
  "migrations",
  "0008_ai_usage_truncation_cols.sql"
);
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
const OUTPUT_CAPS_PATH = resolve(ROOT, "lib", "ai", "output-caps.ts");
// SECTION E (Task #22 follow-up) — registry holds the chat-ladder default
// model strings that determine which rate-card row gets matched at
// enrichment time.
const REGISTRY_PATH = resolve(ROOT, "lib", "ai", "registry.ts");

const MIG_SRC = readFileSync(MIG_PATH, "utf8");
const MIG_0008_SRC = readFileSync(MIG_0008_PATH, "utf8");
const SCHEMA_SRC = readFileSync(SCHEMA_PATH, "utf8");
const USAGE_SRC = readFileSync(USAGE_PATH, "utf8");
const CHAT_SRC = readFileSync(CHAT_ROUTE_PATH, "utf8");
const SUMMARIZE_SRC = readFileSync(SUMMARIZE_ROUTE_PATH, "utf8");
const OUTPUT_CAPS_SRC = readFileSync(OUTPUT_CAPS_PATH, "utf8");
const REGISTRY_SRC = readFileSync(REGISTRY_PATH, "utf8");

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
// SECTION D: Task #11 — output-cap centralization + truncation observability
// =============================================================================
//
// Pins:
//   D1  Migration 0008 shape (columns + index + nullable contract)
//   D2  Drizzle schema parity for the two new columns + new index
//   D3  usage.ts contract: input type extended, insert wires columns,
//       isTruncatedStopReason classifier behaves as a 3-way mapper
//   D4  Call-site coverage: chat (streaming) + summarize (non-streaming)
//       forward stopReason AND responseTruncated into recordAiUsage
//   D5  output-caps.ts exists + HARD_CEILING_TOKENS = 8192 + table +
//       helper signatures; every one of the 10 op modules either imports
//       capForOp or clampToHardCeiling (the 10/10 op-migration invariant).

// -- D1: migration 0008 DDL ---------------------------------------------------
assert(
  "D1 migration 0008 targets ai_usage (ALTER TABLE)",
  /ALTER TABLE\s+`ai_usage`/.test(MIG_0008_SRC),
  "Expected `ALTER TABLE \\`ai_usage\\`` in 0008 migration"
);
assert(
  "D1 migration 0008 adds stop_reason varchar(32) NULL",
  /ADD COLUMN\s+`stop_reason`\s+varchar\(32\)\s+NULL/i.test(MIG_0008_SRC),
  "stop_reason column must be varchar(32) NULL"
);
assert(
  "D1 migration 0008 adds response_truncated int NULL",
  /ADD COLUMN\s+`response_truncated`\s+int\s+NULL/i.test(MIG_0008_SRC),
  "response_truncated column must be int NULL (nullable = 'unknown')"
);
assert(
  "D1 migration 0008 adds covering index on (response_truncated, created_at)",
  /ADD INDEX\s+`ai_usage_truncated_created_idx`\s*\(\s*`response_truncated`\s*,\s*`created_at`\s*\)/i.test(
    MIG_0008_SRC
  ),
  "ai_usage_truncated_created_idx must be ordered (response_truncated, created_at) for the rollup's covering scan"
);
assert(
  "D1 migration 0008 does NOT set a DEFAULT on response_truncated",
  !/`response_truncated`[^,]*DEFAULT/i.test(MIG_0008_SRC),
  "Do not DEFAULT response_truncated — nullable = 'unknown', which keeps pre-migration rows out of truncation-rate metrics"
);

// -- D2: Drizzle schema parity ------------------------------------------------
assert(
  "D2 schema declares stopReason varchar('stop_reason', 32)",
  /stopReason:\s*varchar\(\s*"stop_reason"\s*,\s*\{\s*length:\s*32\s*\}\s*\)/.test(
    SCHEMA_SRC
  ),
  "stopReason column missing or wrong type in Drizzle schema"
);
assert(
  "D2 schema declares responseTruncated int('response_truncated')",
  /responseTruncated:\s*int\(\s*"response_truncated"\s*\)/.test(SCHEMA_SRC),
  "responseTruncated column missing or wrong type in Drizzle schema"
);
assert(
  "D2 schema declares truncatedCreatedIdx with Drizzle index",
  /truncatedCreatedIdx:\s*index\(\s*"ai_usage_truncated_created_idx"\s*\)\.on\(\s*t\.responseTruncated\s*,\s*t\.createdAt\s*\)/.test(
    SCHEMA_SRC
  ),
  "truncatedCreatedIdx must be defined on (responseTruncated, createdAt) to match the migration"
);

// -- D3: usage.ts contract ----------------------------------------------------
assert(
  "D3 usage.ts adds stopReason to RecordAiUsageInput (nullable)",
  /stopReason\?:\s*string\s*\|\s*null/.test(USAGE_SRC),
  "RecordAiUsageInput.stopReason must be optional + nullable"
);
assert(
  "D3 usage.ts adds responseTruncated to RecordAiUsageInput (nullable)",
  /responseTruncated\?:\s*number\s*\|\s*null/.test(USAGE_SRC),
  "RecordAiUsageInput.responseTruncated must be optional + nullable (0/1/null)"
);
assert(
  "D3 usage.ts insert body wires stopReason via normalizer",
  /stopReason:\s*normalizeStopReason\(\s*input\.stopReason\s*\)/.test(USAGE_SRC),
  "Insert body must call normalizeStopReason(input.stopReason) to enforce the 32-char contract"
);
assert(
  "D3 usage.ts insert body wires responseTruncated via normalizer",
  /responseTruncated:\s*normalizeTruncatedFlag\(\s*input\.responseTruncated\s*\)/.test(
    USAGE_SRC
  ),
  "Insert body must call normalizeTruncatedFlag(input.responseTruncated) to reject stray ints/booleans"
);
assert(
  "D3 usage.ts exports isTruncatedStopReason classifier",
  /export function isTruncatedStopReason\(/.test(USAGE_SRC),
  "isTruncatedStopReason must be exported for op routes to call"
);
assert(
  "D3 isTruncatedStopReason returns null for null/undefined",
  /if \(stopReason == null\) return null/.test(USAGE_SRC),
  "Null-input branch must return null (= 'unknown'), not 0"
);
assert(
  "D3 isTruncatedStopReason returns null for empty/whitespace",
  /if \(s\.length === 0\) return null/.test(USAGE_SRC),
  "Empty-trimmed branch must return null — a zero-length reason means 'we didn't get one'"
);
assert(
  "D3 isTruncatedStopReason lowercases + trims before matching",
  /\.trim\(\)\.toLowerCase\(\)/.test(USAGE_SRC),
  "Classifier must normalize case + whitespace so provider adapter variants (MAX_TOKENS / max_tokens) both classify the same"
);
assert(
  "D3 TRUNCATED_STOP_REASONS set contains max_tokens",
  /TRUNCATED_STOP_REASONS[^=]*=\s*new Set\(\[\s*"max_tokens"\s*\]\)/.test(
    USAGE_SRC
  ),
  "Canonical truncated-reason set must contain exactly 'max_tokens' today (all 3 adapters normalize to this)"
);

// -- D4: Call-site wiring of stopReason + responseTruncated -------------------
// Chat — streaming path. Both success AND error branches must forward
// both fields; responseTruncated is always wrapped in isTruncatedStopReason
// so the single classifier rule survives any future provider additions.
assert(
  "D4 chat route imports isTruncatedStopReason",
  /import\s*\{\s*[^}]*\bisTruncatedStopReason\b[^}]*\}\s*from\s+"@\/lib\/ai\/usage"/.test(
    CHAT_SRC
  ),
  "chat route must import isTruncatedStopReason alongside recordAiUsage"
);
{
  const stopReasonCalls = CHAT_SRC.match(/stopReason:\s*finalStopReason/g) ?? [];
  assert(
    "D4 chat route forwards stopReason in BOTH recordAiUsage branches",
    stopReasonCalls.length >= 2,
    `Found ${stopReasonCalls.length} 'stopReason: finalStopReason' call(s) in chat route; expected >= 2 (success + error)`
  );
  const truncCalls =
    CHAT_SRC.match(
      /responseTruncated:\s*isTruncatedStopReason\(\s*finalStopReason\s*\)/g
    ) ?? [];
  assert(
    "D4 chat route forwards responseTruncated in BOTH branches",
    truncCalls.length >= 2,
    `Found ${truncCalls.length} 'responseTruncated: isTruncatedStopReason(...)' call(s) in chat route; expected >= 2`
  );
}
assert(
  "D4 chat route uses capForOp('chat') instead of hardcoded maxTokens",
  /maxTokens:\s*capForOp\(\s*"chat"\s*\)/.test(CHAT_SRC),
  "chat route must call capForOp('chat') — no hardcoded maxTokens"
);
assert(
  "D4 chat route imports capForOp from output-caps",
  /import\s*\{\s*capForOp\s*\}\s*from\s+"@\/lib\/ai\/output-caps"/.test(
    CHAT_SRC
  ),
  "chat route must import capForOp from '@/lib/ai/output-caps'"
);

// Summarize — non-streaming path. Single success branch; the error
// branch records a 'summarize_failed' row earlier and doesn't try to
// surface a provider stop_reason.
assert(
  "D4 summarize route imports isTruncatedStopReason",
  /import\s*\{\s*[^}]*\bisTruncatedStopReason\b[^}]*\}\s*from\s+"@\/lib\/ai\/usage"/.test(
    SUMMARIZE_SRC
  ),
  "summarize route must import isTruncatedStopReason"
);
assert(
  "D4 summarize route forwards stopReason: summary.stopReason",
  /stopReason:\s*summary\.stopReason/.test(SUMMARIZE_SRC),
  "summarize route must forward the resolved summary.stopReason"
);
assert(
  "D4 summarize route forwards responseTruncated: isTruncatedStopReason(summary.stopReason)",
  /responseTruncated:\s*isTruncatedStopReason\(\s*summary\.stopReason\s*\)/.test(
    SUMMARIZE_SRC
  ),
  "summarize route must classify summary.stopReason through isTruncatedStopReason"
);

// -- D5: output-caps.ts centralization ---------------------------------------
assert(
  "D5 output-caps.ts declares HARD_CEILING_TOKENS = 8192",
  /export const HARD_CEILING_TOKENS\s*=\s*8192/.test(OUTPUT_CAPS_SRC),
  "Global ceiling must be 8192 — lowest per-model output cap across our 3 providers (Haiku 4.5 / Gemini 2.5 Flash / gpt-4o-mini)"
);
assert(
  "D5 output-caps.ts exports capForOp",
  /export function capForOp\(/.test(OUTPUT_CAPS_SRC),
  "capForOp must be exported so op modules can look up caps by op + variant"
);
assert(
  "D5 output-caps.ts exports clampToHardCeiling",
  /export function clampToHardCeiling\(/.test(OUTPUT_CAPS_SRC),
  "clampToHardCeiling must be exported for ops that compute caps dynamically (translate)"
);
assert(
  "D5 output-caps.ts exports OP_OUTPUT_CAP_TABLE",
  /export const OP_OUTPUT_CAP_TABLE\b/.test(OUTPUT_CAPS_SRC),
  "OP_OUTPUT_CAP_TABLE must be exported for tests + admin tooling"
);
assert(
  "D5 capForOp clamps returned value to HARD_CEILING_TOKENS",
  /return clampToHardCeiling\(/.test(OUTPUT_CAPS_SRC),
  "capForOp must route through clampToHardCeiling so raw table values can't slip past the ceiling"
);

// Every op listed in OP_OUTPUT_CAP_TABLE must have a "default" entry.
// Parse the table and confirm.
for (const op of [
  "ocr",
  "translate",
  "chat",
  "summarize",
  "compare",
  "generate",
  "sign",
  "rewrite",
  "table",
  "redact",
]) {
  assert(
    `D5 OP_OUTPUT_CAP_TABLE defines op '${op}'`,
    new RegExp(`^\\s*${op}:\\s*\\{`, "m").test(OUTPUT_CAPS_SRC),
    `Missing op key '${op}' — the CapTable type requires every AIOp to be populated`
  );
}

// 10/10 op-module migration invariant: every op module file must call
// through the centralized caps module. This is the assertion that would
// catch a regression where someone reintroduces a local MAX_TOKENS_*
// constant instead of using capForOp / clampToHardCeiling.
const OP_MODULES = [
  "ocr.ts",
  "translate.ts",
  "summarize.ts",
  "compare.ts",
  "generate.ts",
  "sign.ts",
  "rewrite.ts",
  "table.ts",
  "redact.ts",
];
for (const file of OP_MODULES) {
  const path = resolve(ROOT, "lib", "ai", file);
  const src = readFileSync(path, "utf8");
  assert(
    `D5 lib/ai/${file} sources its cap from @/lib/ai/output-caps`,
    /from\s+"[.@\/]*(?:\.\.\/)?(?:@\/lib\/ai\/|\.\/)output-caps"/.test(src) ||
      /from\s+"\.\/output-caps"/.test(src),
    `${file} must import from ./output-caps or @/lib/ai/output-caps (capForOp or clampToHardCeiling)`
  );
  assert(
    `D5 lib/ai/${file} calls capForOp or clampToHardCeiling`,
    /\bcapForOp\(/.test(src) || /\bclampToHardCeiling\(/.test(src),
    `${file} must invoke capForOp(...) or clampToHardCeiling(...) — don't hoist a new local MAX_TOKENS constant`
  );
}
// chat is an API route rather than a lib module — already covered in D4
// above (capForOp('chat') assertion).

// =============================================================================
// SECTION E: Task #22 follow-up — chat_turn cost_micros enrichment contract
// =============================================================================
//
// Why this section exists:
//
// The Task #19 close (commit `037f6ea`, 2026-04-21) flagged that some
// `ai_usage` rows from `/api/ai/chat` were landing with `cost_micros = NULL`
// even on `success = 1` rows, which would silently break the daily margin
// rollup's revenue/cost ratio (Task #22, gate #7) — a NULL cost is treated
// as "unknown" and excluded from margin math, so any drift toward NULLs
// would either erode the 7-day green streak signal or paper over a real
// cost regression.
//
// Investigation (2026-04-22): the chain that's supposed to populate
// cost_micros at insert time looks like this —
//
//   1. `app/api/ai/chat/route.ts` calls `recordAiUsage({ costMicros: null,
//      success: true, ... })` on the success path (line ~509-534).
//   2. `lib/ai/usage.ts:recordAiUsage` enrichment branch (line ~317-329)
//      sees `costMicros === null && success === true` and calls
//      `computeCostMicros(model, inTok, outTok, cacheRead, cacheWrite,
//      batchMode)` — Tier-2 enrichment per MASTER_PLAN §7 gate #6.
//   3. `computeCostMicros` calls `lookupModelRate(modelId)` against the
//      `MODEL_RATE_TABLE` (13 entries spanning Anthropic / OpenAI / Gemini)
//      which prefix-matches so dated suffixes (claude-haiku-4-5-20251001)
//      still resolve to the base rate.
//   4. The chat ladder's three default models — `gpt-4o-mini`,
//      `claude-haiku-4-5-20251001`, `gemini-2.5-flash` — must each match
//      a `MODEL_RATE_TABLE` entry, otherwise the enrichment returns null
//      and we're back where we started.
//
// The verdict from the investigation was: today, the chain works — all
// three default models are in the rate card, so success-path chat_turn
// rows DO get cost_micros populated at insert time. The margin-rollup
// green-streak signal is meaningful.
//
// THE GAP this section closes: nothing currently pins that contract end
// to end. If anyone (a) swaps `lib/ai/registry.ts:defaultModel` to an
// unlisted variant (e.g. an experimental gpt-5-preview), (b) drops a
// `MODEL_RATE_TABLE` entry during a refactor, (c) adds a third
// `recordAiUsage` call site in chat/route.ts that forgets `costMicros:
// null`, or (d) flips the enrichment branch from `success ? compute :
// null` to something that always returns null — the green streak quietly
// degrades, no test fails, and the regression hides for weeks until
// someone notices the margin dashboard going blank.
//
// Pins (5 assertions):
//   E1  chat route still passes `costMicros: null` on the success branch
//       (the trigger condition for Tier-2 enrichment).
//   E2  chat route also passes `costMicros: null` on the error branch
//       (defines the design choice: errors stay NULL because the
//       provider typically didn't return usage, so we can't compute
//       honestly — the rollup must explicitly exclude these rows).
//   E3  recordAiUsage's enrichment branch shape is intact: when
//       `costMicros === null && success === true`, it routes through
//       `computeCostMicros` with all 6 args.
//   E4  All three chat-ladder default models in `lib/ai/registry.ts` —
//       gpt-4o-mini, claude-haiku-4-5, gemini-2.5-flash — exist as
//       prefixes in `MODEL_RATE_TABLE`. (Prefix because Anthropic ships
//       dated model strings like `claude-haiku-4-5-20251001` that must
//       resolve to the base entry via the longest-prefix match in
//       `lookupModelRate`.)
//   E5  Each default model is wired through `defaultModel: process.env.X
//       ?? "..."` in `lib/ai/registry.ts` so an env override can rotate
//       the model without touching the rate card — but the compiled-in
//       fallback (the `??` right-hand side) is what ships and what most
//       deploys actually use, so it's the value that has to be in the
//       rate card.

assert(
  "E1 chat route passes costMicros: null on the success path (triggers Tier-2 enrichment)",
  /success:\s*true,?[\s\S]{0,400}?costMicros:\s*null|costMicros:\s*null,[\s\S]{0,400}?success:\s*true/.test(
    CHAT_SRC
  ),
  "app/api/ai/chat/route.ts must pass `costMicros: null, success: true` on the success branch — that's the trigger condition for the lib/ai/usage.ts enrichment branch (line ~317-329) to call computeCostMicros. If anyone hard-codes a value here, enrichment is bypassed; if anyone removes the field entirely, undefined silently routes the same way but the contract stops being explicit."
);

assert(
  "E2 chat route passes costMicros: null on the error path (rollup excludes by design)",
  /success:\s*false,?[\s\S]{0,400}?costMicros:\s*null|costMicros:\s*null,[\s\S]{0,400}?success:\s*false/.test(
    CHAT_SRC
  ),
  "app/api/ai/chat/route.ts must also pass `costMicros: null, success: false` on the error branch. This is the design choice: provider errors typically don't return usage metadata, so we can't compute honestly. The enrichment branch in usage.ts intentionally returns null on `success === false` — the daily margin rollup excludes these rows from cost math because attributing partial cost to a refunded turn would skew the green-streak signal."
);

assert(
  "E3 recordAiUsage enrichment branch routes null+success through computeCostMicros",
  /enrichedCostMicros\s*=[\s\S]{0,200}?input\.costMicros\s*!==\s*undefined\s*&&\s*input\.costMicros\s*!==\s*null[\s\S]{0,200}?input\.success[\s\S]{0,400}?computeCostMicros\(/.test(
    USAGE_SRC
  ),
  "lib/ai/usage.ts must keep the enrichment branch shape `costMicros !== null ? costMicros : success ? computeCostMicros(...) : null`. Caller-passed cost wins; null+success triggers Tier-2 enrichment; null+failure stays null. Flipping any of the three branches breaks the chat_turn cost_micros population pipeline this section was written to defend."
);

const CHAT_LADDER_DEFAULTS = [
  // [registry default-model literal, MODEL_RATE_TABLE prefix it must match]
  // Why prefix-match: lookupModelRate scans the table looking for
  // exact OR prefix match (`m.startsWith(k + "-")` or `m.startsWith(k)`),
  // longest-key wins. So a registry default of
  // "claude-haiku-4-5-20251001" resolves to the base "claude-haiku-4-5"
  // rate-card row.
  ["gpt-4o-mini", "gpt-4o-mini"],
  ["claude-haiku-4-5", "claude-haiku-4-5"],
  ["gemini-2.5-flash", "gemini-2.5-flash"],
];

for (const [defaultModel, ratePrefix] of CHAT_LADDER_DEFAULTS) {
  assert(
    `E4 MODEL_RATE_TABLE has an entry for chat-ladder default '${defaultModel}'`,
    new RegExp(`\\["${ratePrefix.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"`).test(
      USAGE_SRC
    ),
    `lib/ai/usage.ts:MODEL_RATE_TABLE must contain an entry whose key is "${ratePrefix}" (or a longer prefix that still matches via lookupModelRate's prefix scan). Without this entry, computeCostMicros returns null for every chat_turn that uses '${defaultModel}', and the daily margin rollup loses cost coverage for the entire chat surface — silently. Add the rate row before swapping the default.`
  );
}

for (const [defaultModel] of CHAT_LADDER_DEFAULTS) {
  // Some registry defaults carry a dated suffix (Anthropic ships
  // `claude-haiku-4-5-20251001`); the regex tolerates an optional
  // suffix segment after the listed model name so future date bumps
  // don't trip this pin (lookupModelRate prefix-matches, so the rate
  // card still resolves correctly).
  assert(
    `E5 lib/ai/registry.ts wires '${defaultModel}' as a defaultModel via process.env override`,
    new RegExp(
      `defaultModel:\\s*process\\.env\\.[A-Z_]+\\s*\\?\\?\\s*"${defaultModel.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?:-[\\w]+)*"`
    ).test(REGISTRY_SRC),
    `lib/ai/registry.ts must wire '${defaultModel}' (or a dated variant prefixed with it) as the compiled-in fallback for one of the chat-ladder providers via the \`defaultModel: process.env.X ?? "..."\` pattern. The env override exists so ops can hot-swap models without redeploy, but the compiled-in fallback is what most deploys actually use — so it's the literal that has to be present in the rate card per E4.`
  );
}

// =============================================================================
// Report
// =============================================================================

const total = pass + fail;
console.log("");
console.log(`test-ai-usage.mjs — ${pass}/${total} assertions passed`);
// Canonical summary line — parsed by scripts/run-all-tests.mjs. The
// aggregator's regex anchors on `(\d+) passed, (\d+) failed`; keep this
// wording in sync across harnesses or the suite shows up as
// "(summary unparseable)" even when every assertion passed.
console.log(`AI-usage tests: ${pass} passed, ${fail} failed`);
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
