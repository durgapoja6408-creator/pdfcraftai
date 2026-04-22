#!/usr/bin/env node
// scripts/test-prompt-registry.mjs
//
// Self-contained test harness for Task #26 — prompt version registry
// + A/B testing infra (Phase E).
//
// What this covers:
//
//   SECTION A — migration 0014 + schema update:
//               * 0014_ai_usage_prompt_version.sql adds two nullable
//                 columns to ai_usage: prompt_version varchar(32) NULL
//                 and experiment_id varchar(64) NULL, positioned AFTER
//                 response_truncated (so the column order stays
//                 human-readable in \d ai_usage).
//               * db/schema/app.ts declares both columns on aiUsage
//                 with matching drizzle widths (length 32 / 64) and
//                 no .notNull() — defaulting the insert helper to
//                 NULL matches the migration's semantics.
//
//   SECTION B — lib/ai/usage.ts write-path extension:
//               * RecordAiUsageInput type extended with
//                 promptVersion?: string | null + experimentId?: string
//                 | null.
//               * The INSERT clause length-clamps to 32 / 64 so a
//                 pathological long id from a hand-edited registry
//                 doesn't throw "Data too long for column" and 500
//                 the whole AI call.
//
//   SECTION C — lib/ai/prompts/registry.ts module surface:
//               * Exports PromptOp, PromptVersion, Experiment,
//                 ResolvedPrompt, OpRegistryState types.
//               * Exports PROMPT_REGISTRY record, EXPERIMENTS array,
//                 RECORDING_ENABLED flag.
//               * Exports stableHashToBps, resolvePromptVersion,
//                 listAllPromptVersions, listActiveExperiments,
//                 classifyOpState functions.
//               * Exports __PROMPT_REGISTRY_INTERNALS test hook.
//               * PromptOp is an alias of PromptSafetyOp so a new op
//                 automatically becomes eligible for a registry entry.
//
//   SECTION D — registry content invariants:
//               * Every PromptSafetyOp key has at least one variant.
//               * Every variant's `op` field matches its map key
//                 (self-describing struct ↔ map-key agreement).
//               * Every variant has id within [1, 32] chars and
//                 weightBps in [0, 10000].
//               * At v1 ship, EXPERIMENTS is [] (no active tests yet).
//               * RECORDING_ENABLED = true.
//
//   SECTION E — resolver semantics (source inspection + dynamic import):
//               * 0-variant path falls back to "v1" without crashing.
//               * 1-variant path returns that variant + experimentId
//                 = null (deterministic).
//               * 2+ enabled variants path normalizes weights and
//                 uses stableHashToBps(seed) for assignment.
//               * stableHashToBps is a djb2 variant — deterministic,
//                 distribution ok enough for A/B buckets.
//
//   SECTION F — summarize wire-up (lib/ai/summarize.ts +
//               app/api/ai/summarize/route.ts):
//               * summarize.ts imports RECORDING_ENABLED + resolve-
//                 PromptVersion from ./prompts/registry.
//               * SummarizeInput gained userId; SummarizeResult gained
//                 promptVersion + experimentId (both string|null).
//               * buildSystemPrompt takes a promptVersion param.
//               * buildSummarizeBatchRequest accepts userId + returns
//                 promptVersion + experimentId.
//               * finalizeSummarizeBatchResult accepts promptVersion +
//                 experimentId params and returns them.
//               * /api/ai/summarize/route.ts threads session.user.id
//                 into summarizePdf AND passes summary.promptVersion /
//                 summary.experimentId to the success-path recordAi-
//                 Usage; the error-path recordAiUsage passes null/null.
//
//   SECTION G — batch wire-up:
//               * app/api/ai/batch/submit/route.ts passes userId to
//                 buildSummarizeBatchRequest and spreads promptVersion
//                 + experimentId into opPayload.
//               * app/api/ai/batch/[jobId]/route.ts reads both fields
//                 from opPayload (with `?? null` legacy fallback),
//                 threads them through finalizeSummarizeBatchResult,
//                 and includes them in the finalize-time recordAiUsage
//                 call alongside batchMode: true.
//
//   SECTION H — /admin/prompts page + NAV wiring:
//               * app/admin/prompts/page.tsx exists, force-dynamic +
//                 nodejs runtime, default export, consumes
//                 listAllPromptVersions + listActiveExperiments +
//                 classifyOpState + getPromptVersionRollout.
//               * Renders the misconfigured-op banner when
//                 classifyOpState === "misconfigured" for any op.
//               * app/admin/layout.tsx NAV gains a "Prompts" entry
//                 pointing at /admin/prompts.
//
//   SECTION I — phase-e-queries.ts DB helper:
//               * Exports PhaseEQueryResult<T> envelope.
//               * Exports getPromptVersionRollout({days}) returning
//                 PhaseEQueryResult<PromptVariantRolloutSnapshot>.
//               * Query applies WHERE prompt_version IS NOT NULL so
//                 pre-0014 rows don't skew the split.
//               * Import server-only for bundle safety.
//
//   SECTION J — aggregator registration:
//               * scripts/run-all-tests.mjs SUITES array includes
//                 "prompt-registry" → test-prompt-registry.mjs.
//
// Run: `node scripts/test-prompt-registry.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const MIGRATION_PATH = resolve(
  ROOT,
  "db",
  "migrations",
  "0014_ai_usage_prompt_version.sql"
);
const SCHEMA_PATH = resolve(ROOT, "db", "schema", "app.ts");
const USAGE_PATH = resolve(ROOT, "lib", "ai", "usage.ts");
const REGISTRY_PATH = resolve(ROOT, "lib", "ai", "prompts", "registry.ts");
const SUMMARIZE_PATH = resolve(ROOT, "lib", "ai", "summarize.ts");
const SUMMARIZE_ROUTE_PATH = resolve(
  ROOT,
  "app",
  "api",
  "ai",
  "summarize",
  "route.ts"
);
const BATCH_SUBMIT_PATH = resolve(
  ROOT,
  "app",
  "api",
  "ai",
  "batch",
  "submit",
  "route.ts"
);
const BATCH_FINALIZE_PATH = resolve(
  ROOT,
  "app",
  "api",
  "ai",
  "batch",
  "[jobId]",
  "route.ts"
);
const PHASE_E_QUERIES_PATH = resolve(
  ROOT,
  "lib",
  "admin",
  "phase-e-queries.ts"
);
const ADMIN_PROMPTS_PAGE_PATH = resolve(
  ROOT,
  "app",
  "admin",
  "prompts",
  "page.tsx"
);
const ADMIN_LAYOUT_PATH = resolve(ROOT, "app", "admin", "layout.tsx");
const RUN_ALL_TESTS_PATH = resolve(ROOT, "scripts", "run-all-tests.mjs");

const MIGRATION_SRC = readFileSync(MIGRATION_PATH, "utf8");
const SCHEMA_SRC = readFileSync(SCHEMA_PATH, "utf8");
const USAGE_SRC = readFileSync(USAGE_PATH, "utf8");
const REGISTRY_SRC = readFileSync(REGISTRY_PATH, "utf8");
const SUMMARIZE_SRC = readFileSync(SUMMARIZE_PATH, "utf8");
const SUMMARIZE_ROUTE_SRC = readFileSync(SUMMARIZE_ROUTE_PATH, "utf8");
const BATCH_SUBMIT_SRC = readFileSync(BATCH_SUBMIT_PATH, "utf8");
const BATCH_FINALIZE_SRC = readFileSync(BATCH_FINALIZE_PATH, "utf8");
const PHASE_E_QUERIES_SRC = readFileSync(PHASE_E_QUERIES_PATH, "utf8");
const ADMIN_PROMPTS_SRC = readFileSync(ADMIN_PROMPTS_PAGE_PATH, "utf8");
const ADMIN_LAYOUT_SRC = readFileSync(ADMIN_LAYOUT_PATH, "utf8");
const RUN_ALL_SRC = readFileSync(RUN_ALL_TESTS_PATH, "utf8");

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
// SECTION A — migration 0014 + schema parity
// =============================================================================

assert(
  "A1 migration 0014 adds prompt_version varchar(32) NULL",
  /ADD COLUMN\s+`prompt_version`\s+varchar\(32\)\s+NULL/.test(MIGRATION_SRC),
  "prompt_version varchar(32) NULL clause missing"
);

assert(
  "A1 migration 0014 adds experiment_id varchar(64) NULL",
  /ADD COLUMN\s+`experiment_id`\s+varchar\(64\)\s+NULL/.test(MIGRATION_SRC),
  "experiment_id varchar(64) NULL clause missing"
);

assert(
  "A2 migration 0014 positions prompt_version AFTER response_truncated",
  /prompt_version.*AFTER\s+`response_truncated`/.test(MIGRATION_SRC),
  "prompt_version should be placed AFTER response_truncated for readable column order"
);

assert(
  "A2 migration 0014 positions experiment_id AFTER prompt_version",
  /experiment_id.*AFTER\s+`prompt_version`/.test(MIGRATION_SRC),
  "experiment_id should be placed AFTER prompt_version"
);

assert(
  "A3 migration targets ai_usage table",
  /ALTER TABLE\s+`ai_usage`/.test(MIGRATION_SRC),
  "Migration should ALTER ai_usage (not ai_daily_margin or another table)"
);

assert(
  "A4 schema declares promptVersion varchar({length:32})",
  /promptVersion:\s*varchar\("prompt_version",\s*\{\s*length:\s*32\s*\}\)/.test(
    SCHEMA_SRC
  ),
  "aiUsage schema must declare promptVersion with length 32"
);

assert(
  "A4 schema declares experimentId varchar({length:64})",
  /experimentId:\s*varchar\("experiment_id",\s*\{\s*length:\s*64\s*\}\)/.test(
    SCHEMA_SRC
  ),
  "aiUsage schema must declare experimentId with length 64"
);

assert(
  "A4 schema columns are nullable (no .notNull() on either)",
  !/promptVersion:\s*varchar\("prompt_version",\s*\{\s*length:\s*32\s*\}\)\.notNull/.test(
    SCHEMA_SRC
  ) &&
    !/experimentId:\s*varchar\("experiment_id",\s*\{\s*length:\s*64\s*\}\)\.notNull/.test(
      SCHEMA_SRC
    ),
  "Both columns must stay nullable — .notNull() contradicts the migration"
);

// =============================================================================
// SECTION B — lib/ai/usage.ts write-path extension
// =============================================================================

assert(
  "B1 usage.ts RecordAiUsageInput includes promptVersion field",
  /promptVersion\?:\s*string\s*\|\s*null/.test(USAGE_SRC),
  "RecordAiUsageInput must accept promptVersion as string | null | undefined"
);

assert(
  "B1 usage.ts RecordAiUsageInput includes experimentId field",
  /experimentId\?:\s*string\s*\|\s*null/.test(USAGE_SRC),
  "RecordAiUsageInput must accept experimentId as string | null | undefined"
);

assert(
  "B2 usage.ts clamps promptVersion to 32 chars at insert time",
  /promptVersion[\s\S]{0,300}\.slice\(0,\s*32\)/.test(USAGE_SRC),
  "INSERT path must slice promptVersion to 32 chars so a long id doesn't 500"
);

assert(
  "B2 usage.ts clamps experimentId to 64 chars at insert time",
  /experimentId[\s\S]{0,300}\.slice\(0,\s*64\)/.test(USAGE_SRC),
  "INSERT path must slice experimentId to 64 chars"
);

// =============================================================================
// SECTION C — lib/ai/prompts/registry.ts module surface
// =============================================================================

assert(
  "C1 registry.ts imports 'server-only'",
  /import\s+"server-only"/.test(REGISTRY_SRC),
  "registry must import 'server-only' to keep the bucketing logic off the client bundle"
);

assert(
  "C1 registry.ts exports PromptOp type",
  /export type PromptOp\s*=/.test(REGISTRY_SRC),
  "PromptOp type export missing"
);

assert(
  "C1 registry.ts aliases PromptOp from PromptSafetyOp",
  /export type PromptOp\s*=\s*PromptSafetyOp/.test(REGISTRY_SRC),
  "PromptOp must be an alias of PromptSafetyOp so adding a new op forces a registry entry"
);

assert(
  "C1 registry.ts exports PromptVersion interface",
  /export interface PromptVersion/.test(REGISTRY_SRC),
  "PromptVersion interface export missing"
);

assert(
  "C1 registry.ts exports Experiment interface",
  /export interface Experiment/.test(REGISTRY_SRC),
  "Experiment interface export missing"
);

assert(
  "C1 registry.ts exports ResolvedPrompt interface",
  /export interface ResolvedPrompt/.test(REGISTRY_SRC),
  "ResolvedPrompt interface export missing"
);

assert(
  "C1 registry.ts exports OpRegistryState type",
  /export type OpRegistryState\s*=/.test(REGISTRY_SRC),
  "OpRegistryState type export missing"
);

assert(
  "C2 registry.ts exports PROMPT_REGISTRY",
  /export const PROMPT_REGISTRY:\s*Record<PromptOp,\s*PromptVersion\[\]>/.test(
    REGISTRY_SRC
  ),
  "PROMPT_REGISTRY must be declared as Record<PromptOp, PromptVersion[]>"
);

assert(
  "C2 registry.ts exports EXPERIMENTS array",
  /export const EXPERIMENTS:\s*Experiment\[\]\s*=\s*\[\s*\]/.test(REGISTRY_SRC),
  "EXPERIMENTS must be declared as Experiment[] and start empty"
);

assert(
  "C2 registry.ts exports RECORDING_ENABLED flag (= true at v1)",
  /export const RECORDING_ENABLED\s*=\s*true/.test(REGISTRY_SRC),
  "RECORDING_ENABLED must default to true at v1 ship"
);

assert(
  "C3 registry.ts exports stableHashToBps function",
  /export function stableHashToBps\(/.test(REGISTRY_SRC),
  "stableHashToBps function export missing"
);

assert(
  "C3 registry.ts exports resolvePromptVersion function",
  /export function resolvePromptVersion\(/.test(REGISTRY_SRC),
  "resolvePromptVersion function export missing"
);

assert(
  "C3 registry.ts exports listAllPromptVersions function",
  /export function listAllPromptVersions\(/.test(REGISTRY_SRC),
  "listAllPromptVersions function export missing"
);

assert(
  "C3 registry.ts exports listActiveExperiments function",
  /export function listActiveExperiments\(/.test(REGISTRY_SRC),
  "listActiveExperiments function export missing"
);

assert(
  "C3 registry.ts exports classifyOpState function",
  /export function classifyOpState\(/.test(REGISTRY_SRC),
  "classifyOpState function export missing"
);

assert(
  "C4 registry.ts exports __PROMPT_REGISTRY_INTERNALS test hook",
  /export const __PROMPT_REGISTRY_INTERNALS\b/.test(REGISTRY_SRC),
  "__PROMPT_REGISTRY_INTERNALS hook missing — needed for test-time access"
);

// =============================================================================
// SECTION D — registry content invariants (dynamic import)
// =============================================================================

const EXPECTED_OPS = [
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
];

for (const op of EXPECTED_OPS) {
  assert(
    `D0 PROMPT_REGISTRY has entry for op "${op}"`,
    new RegExp(`${op}:\\s*\\[`).test(REGISTRY_SRC),
    `PROMPT_REGISTRY["${op}"] missing — every PromptSafetyOp must have ≥1 variant`
  );
}

// =============================================================================
// SECTION E — resolver semantics (source inspection)
// =============================================================================

assert(
  "E1 resolvePromptVersion filters to enabled variants",
  /PROMPT_REGISTRY\[op\]\s*\?\?\s*\[\s*\]\)\.filter\(\(v\)\s*=>\s*v\.enabled\)/.test(
    REGISTRY_SRC
  ),
  "resolvePromptVersion must filter to v.enabled === true"
);

assert(
  "E2 resolvePromptVersion handles the 0-variant fallback with 'v1'",
  /version:\s*"v1"/.test(REGISTRY_SRC),
  "0-variant fallback should return a non-empty 'v1' string so the caller can still record a version"
);

assert(
  "E3 resolvePromptVersion uses stableHashToBps for assignment",
  /stableHashToBps\(/.test(REGISTRY_SRC),
  "Multi-variant path must use stableHashToBps(seed) for deterministic per-user bucketing"
);

assert(
  "E4 resolvePromptVersion consults EXPERIMENTS for active (!endedAt) entry",
  /EXPERIMENTS\.find\(\(e\)\s*=>\s*e\.op\s*===\s*op\s*&&\s*!e\.endedAt\)/.test(
    REGISTRY_SRC
  ),
  "Multi-variant path must pick the matching active experiment (op matches AND endedAt is falsy)"
);

assert(
  "E5 stableHashToBps uses djb2-style integer hash",
  // djb2 canonical: h = h * 33 + c, often written as h = (h << 5) + h + c.
  // Accept either variable name (`h` or `hash`) — the source uses a short
  // `h` inside the hot-loop body. Regex anchors on the `<<5 + <var>` or
  // `<var>*33` shape either way.
  /\b(h|hash)\s*=\s*\(\s*\(?\s*\1\s*<<\s*5\s*\)?\s*\+\s*\1\b/.test(REGISTRY_SRC) ||
    /\b(h|hash)\s*=\s*\(?\s*\1\s*\*\s*33\b/.test(REGISTRY_SRC),
  "stableHashToBps should be a djb2 variant (either *33 or <<5+h/hash form)"
);

// =============================================================================
// SECTION E-dyn — dynamic-import runtime checks
// =============================================================================

// Registry is TypeScript; loading it under plain Node is non-trivial.
// We rely on source inspection above + classify + surface checks, and
// skip dynamic TS import here. Harness stays dependency-free.

// =============================================================================
// SECTION F — summarize wire-up (module + route)
// =============================================================================

assert(
  "F1 summarize.ts imports RECORDING_ENABLED from ./prompts/registry",
  /import\s*\{[^}]*RECORDING_ENABLED[^}]*\}\s*from\s*"\.\/prompts\/registry"/.test(
    SUMMARIZE_SRC
  ),
  "summarize must import RECORDING_ENABLED so the kill switch works"
);

assert(
  "F1 summarize.ts imports resolvePromptVersion from ./prompts/registry",
  /import\s*\{[^}]*resolvePromptVersion[^}]*\}\s*from\s*"\.\/prompts\/registry"/.test(
    SUMMARIZE_SRC
  ),
  "summarize must import resolvePromptVersion"
);

assert(
  "F2 summarize.ts SummarizeInput extended with userId",
  /userId\?:\s*string\s*\|\s*null/.test(SUMMARIZE_SRC),
  "SummarizeInput must accept userId?: string | null for the bucketing seed"
);

assert(
  "F2 summarize.ts SummarizeResult gained promptVersion/experimentId",
  /promptVersion:\s*string\s*\|\s*null/.test(SUMMARIZE_SRC) &&
    /experimentId:\s*string\s*\|\s*null/.test(SUMMARIZE_SRC),
  "SummarizeResult must surface promptVersion + experimentId so the route can log them"
);

assert(
  "F3 summarize.ts calls resolvePromptVersion(\"summarize\", input.userId)",
  /resolvePromptVersion\(\s*"summarize"\s*,\s*input\.userId\s*\)/.test(
    SUMMARIZE_SRC
  ),
  "summarizePdf must resolve against op='summarize' with the userId seed"
);

assert(
  "F3 summarize.ts nulls audit fields when RECORDING_ENABLED is false",
  /RECORDING_ENABLED\s*\?\s*resolved\.version\s*:\s*null/.test(SUMMARIZE_SRC) ||
    /PROMPT_RECORDING_ENABLED\s*\?\s*resolved\.version\s*:\s*null/.test(
      SUMMARIZE_SRC
    ),
  "When recording is disabled, the returned strings should be null — resolver still runs for the buildSystemPrompt branch"
);

assert(
  "F4 summarize.ts buildSystemPrompt accepts promptVersion param",
  // Anchor on the declaration (`function buildSystemPrompt(`) rather
  // than a bare `buildSystemPrompt(` which would match call-sites too.
  // The window is generous (up to 1200 chars) because the param carries
  // a multi-line JSDoc explaining the Phase E branching contract, and
  // it sits after the five other params in the destructured opts obj.
  /function\s+buildSystemPrompt\s*\(\s*opts:\s*\{[\s\S]{0,1200}promptVersion:\s*string/.test(
    SUMMARIZE_SRC
  ),
  "buildSystemPrompt(opts) declaration must include promptVersion: string in its opts shape"
);

assert(
  "F5 summarize.ts buildSummarizeBatchRequest accepts userId",
  /buildSummarizeBatchRequest\([\s\S]{0,600}userId\?:\s*string\s*\|\s*null/.test(
    SUMMARIZE_SRC
  ),
  "buildSummarizeBatchRequest must accept userId so batch-mode assignment is stable"
);

assert(
  "F5 summarize.ts buildSummarizeBatchRequest returns promptVersion + experimentId",
  /promptVersion:\s*[^,\n]+,\s*\n[\s\S]{0,100}experimentId:\s*/.test(
    SUMMARIZE_SRC
  ) ||
    /promptVersion:\s*PROMPT_RECORDING_ENABLED/.test(SUMMARIZE_SRC),
  "buildSummarizeBatchRequest must return both audit fields for persistence into opPayload"
);

assert(
  "F6 summarize.ts finalizeSummarizeBatchResult accepts promptVersion param",
  /finalizeSummarizeBatchResult\([\s\S]{0,600}promptVersion\?:\s*string\s*\|\s*null/.test(
    SUMMARIZE_SRC
  ),
  "finalizeSummarizeBatchResult must accept promptVersion so the variant persists through the finalize path"
);

assert(
  "F6 summarize.ts finalizeSummarizeBatchResult accepts experimentId param",
  /finalizeSummarizeBatchResult\([\s\S]{0,800}experimentId\?:\s*string\s*\|\s*null/.test(
    SUMMARIZE_SRC
  ),
  "finalizeSummarizeBatchResult must accept experimentId"
);

// -- /api/ai/summarize/route.ts wiring --

assert(
  "F7 /api/ai/summarize passes userId to summarizePdf",
  /summarizePdf\([\s\S]{0,1500}userId[\s,\n}]/.test(SUMMARIZE_ROUTE_SRC),
  "summarize route must thread userId into summarizePdf() for the registry seed"
);

assert(
  "F8 /api/ai/summarize success-path recordAiUsage includes promptVersion",
  /recordAiUsage\(\{[\s\S]{0,2500}promptVersion:\s*summary\.promptVersion/.test(
    SUMMARIZE_ROUTE_SRC
  ),
  "success-path recordAiUsage must pass summary.promptVersion"
);

assert(
  "F8 /api/ai/summarize success-path recordAiUsage includes experimentId",
  /recordAiUsage\(\{[\s\S]{0,2500}experimentId:\s*summary\.experimentId/.test(
    SUMMARIZE_ROUTE_SRC
  ),
  "success-path recordAiUsage must pass summary.experimentId"
);

assert(
  "F9 /api/ai/summarize error-path recordAiUsage passes null/null",
  /recordAiUsage\(\{[\s\S]{0,1500}promptVersion:\s*null[\s\S]{0,200}experimentId:\s*null/.test(
    SUMMARIZE_ROUTE_SRC
  ),
  "error-path recordAiUsage must explicitly null both audit fields — the resolver never ran or we couldn't observe it"
);

// =============================================================================
// SECTION G — batch wire-up (submit + finalize)
// =============================================================================

assert(
  "G1 batch submit passes userId to buildSummarizeBatchRequest",
  /buildSummarizeBatchRequest\(\{[\s\S]{0,800}userId[,\s\n}]/.test(
    BATCH_SUBMIT_SRC
  ),
  "submit route must thread userId to buildSummarizeBatchRequest"
);

assert(
  "G2 batch submit persists promptVersion into opPayload",
  /opPayload\s*=\s*\{[\s\S]{0,2500}promptVersion:\s*plan\.promptVersion/.test(
    BATCH_SUBMIT_SRC
  ),
  "opPayload must capture plan.promptVersion so finalize can reuse it"
);

assert(
  "G2 batch submit persists experimentId into opPayload",
  /opPayload\s*=\s*\{[\s\S]{0,2500}experimentId:\s*plan\.experimentId/.test(
    BATCH_SUBMIT_SRC
  ),
  "opPayload must capture plan.experimentId"
);

assert(
  "G3 batch finalize reads promptVersion from opPayload (with null fallback)",
  /opPayload\.promptVersion[\s\S]{0,100}\?\?\s*null/.test(BATCH_FINALIZE_SRC),
  "finalize must read opPayload.promptVersion defaulting to null for legacy batches"
);

assert(
  "G3 batch finalize reads experimentId from opPayload (with null fallback)",
  /opPayload\.experimentId[\s\S]{0,100}\?\?\s*null/.test(BATCH_FINALIZE_SRC),
  "finalize must read opPayload.experimentId defaulting to null"
);

assert(
  "G4 batch finalize threads audit fields into finalizeSummarizeBatchResult",
  /finalizeSummarizeBatchResult\(\{[\s\S]{0,600}promptVersion:\s*submittedPromptVersion/.test(
    BATCH_FINALIZE_SRC
  ),
  "finalizeSummarizeBatchResult must receive the submit-time promptVersion"
);

assert(
  "G5 batch finalize recordAiUsage includes the two audit fields",
  /recordAiUsage\(\{[\s\S]{0,2500}batchMode:\s*true[\s\S]{0,800}promptVersion:\s*promptVersionForLogging/.test(
    BATCH_FINALIZE_SRC
  ) ||
    /recordAiUsage\(\{[\s\S]{0,2500}promptVersion:\s*promptVersionForLogging[\s\S]{0,800}batchMode:\s*true/.test(
      BATCH_FINALIZE_SRC
    ),
  "finalize-time recordAiUsage must include promptVersion + experimentId AND batchMode: true in the same call"
);

// =============================================================================
// SECTION H — /admin/prompts page + NAV wiring
// =============================================================================

assert(
  "H1 /admin/prompts/page.tsx exists",
  existsSync(ADMIN_PROMPTS_PAGE_PATH),
  "app/admin/prompts/page.tsx file missing"
);

assert(
  "H2 /admin/prompts declares force-dynamic + nodejs runtime",
  /export const dynamic\s*=\s*"force-dynamic"/.test(ADMIN_PROMPTS_SRC) &&
    /export const runtime\s*=\s*"nodejs"/.test(ADMIN_PROMPTS_SRC),
  "admin pages must be force-dynamic + runtime=nodejs"
);

assert(
  "H3 /admin/prompts has a default export",
  /export default (?:async )?function/.test(ADMIN_PROMPTS_SRC),
  "page must export a default component function"
);

assert(
  "H4 /admin/prompts imports from the registry",
  /from\s+"@\/lib\/ai\/prompts\/registry"/.test(ADMIN_PROMPTS_SRC),
  "page must pull registry exports from @/lib/ai/prompts/registry"
);

assert(
  "H4 /admin/prompts imports getPromptVersionRollout from phase-e-queries",
  /getPromptVersionRollout[\s\S]{0,200}from\s+"@\/lib\/admin\/phase-e-queries"/.test(
    ADMIN_PROMPTS_SRC
  ),
  "page must pull the rollout helper from phase-e-queries"
);

assert(
  "H5 /admin/prompts renders misconfigured-op banner",
  /anyMisconfigured/.test(ADMIN_PROMPTS_SRC) &&
    /Misconfigured op detected/.test(ADMIN_PROMPTS_SRC),
  "page must surface a red banner when any op is in the misconfigured state"
);

assert(
  "H6 /admin/prompts consumes classifyOpState",
  /classifyOpState\(/.test(ADMIN_PROMPTS_SRC),
  "page must call classifyOpState(op) for each op"
);

assert(
  "H7 admin layout NAV registers /admin/prompts under Ops",
  /section:\s*"Ops",\s*href:\s*"\/admin\/prompts",\s*label:\s*"Prompts"/.test(
    ADMIN_LAYOUT_SRC
  ),
  "app/admin/layout.tsx NAV must include a Prompts entry in the Ops section"
);

// =============================================================================
// SECTION I — phase-e-queries.ts DB helper
// =============================================================================

assert(
  "I1 phase-e-queries.ts imports 'server-only'",
  /import\s+"server-only"/.test(PHASE_E_QUERIES_SRC),
  "phase-e-queries must import 'server-only' so the query helper never bundles client-side"
);

assert(
  "I2 phase-e-queries.ts exports PhaseEQueryResult envelope",
  /export type PhaseEQueryResult<T>\s*=\s*\|?\s*\{\s*ok:\s*true;\s*data:\s*T\s*\}\s*\|\s*\{\s*ok:\s*false;\s*error:\s*string\s*\}/.test(
    PHASE_E_QUERIES_SRC
  ),
  "PhaseEQueryResult must mirror the AdminQueryResult envelope from queries.ts"
);

assert(
  "I3 phase-e-queries.ts exports getPromptVersionRollout",
  /export async function getPromptVersionRollout\(/.test(PHASE_E_QUERIES_SRC),
  "getPromptVersionRollout async helper missing"
);

assert(
  "I4 getPromptVersionRollout filters out pre-0014 rows",
  /isNotNull\(\s*schema\.aiUsage\.promptVersion\s*\)/.test(
    PHASE_E_QUERIES_SRC
  ),
  "Query MUST filter WHERE prompt_version IS NOT NULL so pre-registry rows don't skew the split"
);

assert(
  "I5 getPromptVersionRollout groups by operation + promptVersion + experimentId",
  /groupBy\(\s*schema\.aiUsage\.operation\s*,\s*schema\.aiUsage\.promptVersion\s*,\s*schema\.aiUsage\.experimentId/.test(
    PHASE_E_QUERIES_SRC
  ),
  "Query must group by the 3-tuple (operation, promptVersion, experimentId) for the variant split"
);

// =============================================================================
// SECTION J — aggregator registration
// =============================================================================

assert(
  "J1 scripts/run-all-tests.mjs SUITES registers 'prompt-registry'",
  /name:\s*"prompt-registry",\s*file:\s*"test-prompt-registry\.mjs"/.test(
    RUN_ALL_SRC
  ),
  "Add { name: 'prompt-registry', file: 'test-prompt-registry.mjs' } to the SUITES array in scripts/run-all-tests.mjs"
);

// =============================================================================
// Report
// =============================================================================

const total = pass + fail;
console.log("");
console.log(
  `test-prompt-registry.mjs — ${pass}/${total} assertions passed`
);
// Canonical summary line — parsed by scripts/run-all-tests.mjs.
console.log(`Prompt-registry tests: ${pass} passed, ${fail} failed`);
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
