#!/usr/bin/env node
// scripts/test-router.mjs
//
// Self-contained test harness for Task #21 / MASTER_PLAN §7 gate #6 —
// the per-op AI router (`lib/ai/router.ts`) plus the new Gemini adapter
// and the updated provider registry.
//
// What this covers:
//
//   SECTION A — AIProviderId + capability types. The types module must
//               include "gemini" in the provider-id union (adapter
//               registrations fail to typecheck otherwise) and keep the
//               pdfInput capability flag that OCR routing depends on.
//
//   SECTION B — lib/ai/router.ts contract checks:
//               * Exports the AIOp union, route(), resolveLadder(),
//                 currentPolicySnapshot(), NoRoutableProviderError, and
//                 __ROUTER_INTERNALS test hook.
//               * Every AIOp has a compiled ROUTING_POLICY row with a
//                 primary + at least one fallback.
//               * Every AIOp declares OP_REQUIRED_CAPABILITY — and OCR
//                 specifically requires pdfInput (the whole reason the
//                 router exists).
//               * Every AIOp has an AI_ROUTER_* env-override name.
//
//   SECTION C — Gemini adapter shipped:
//               * lib/ai/adapters/gemini.ts exists.
//               * Declares pdfInput: true (so the router's OCR ladder
//                 picks it over OpenAI).
//               * Imports from @google/generative-ai.
//               * package.json lists @google/generative-ai.
//
//   SECTION D — Registry wiring:
//               * lib/ai/registry.ts has a row with id "gemini".
//               * Accepts either GEMINI_API_KEY or GOOGLE_API_KEY.
//               * Lazy-imports the adapter (keeps boot safe when the
//                 package is missing, same posture as anthropic/openai).
//
//   SECTION E — Call-site refactor from selectProvider → router.route:
//               * ocr.ts calls route("ocr", …), catches
//                 NoRoutableProviderError.
//               * translate.ts calls route("translate", …).
//               * summarize.ts calls route("summarize", …).
//               * compare.ts calls route("compare", …).
//               * app/api/ai/chat/route.ts calls route("chat", …) and
//                 keeps the refund-then-503 behaviour on
//                 NoRoutableProviderError.
//               * No call-site still uses selectProvider for these ops.
//
// Run: `node scripts/test-router.mjs`
// Exits 0 on pass, 1 on any failure.
//
// Wiring: this harness is listed in scripts/run-all-tests.mjs SUITES so
// `npm test` covers it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const TYPES_PATH = resolve(ROOT, "lib", "ai", "types.ts");
const ROUTER_PATH = resolve(ROOT, "lib", "ai", "router.ts");
const REGISTRY_PATH = resolve(ROOT, "lib", "ai", "registry.ts");
const GEMINI_PATH = resolve(ROOT, "lib", "ai", "adapters", "gemini.ts");
const OCR_PATH = resolve(ROOT, "lib", "ai", "ocr.ts");
const TRANSLATE_PATH = resolve(ROOT, "lib", "ai", "translate.ts");
const SUMMARIZE_PATH = resolve(ROOT, "lib", "ai", "summarize.ts");
const COMPARE_PATH = resolve(ROOT, "lib", "ai", "compare.ts");
// Tier 1 (2026-04-21): rewrite/table/redact promoted to dedicated ops
// with openai primary — see COST_MATRIX_3PROVIDER.md §2, margin move M2.
const REWRITE_PATH = resolve(ROOT, "lib", "ai", "rewrite.ts");
const TABLE_PATH = resolve(ROOT, "lib", "ai", "table.ts");
const REDACT_PATH = resolve(ROOT, "lib", "ai", "redact.ts");
const CHAT_ROUTE_PATH = resolve(ROOT, "app", "api", "ai", "chat", "route.ts");
const PACKAGE_JSON_PATH = resolve(ROOT, "package.json");

const TYPES_SRC = readFileSync(TYPES_PATH, "utf8");
const ROUTER_SRC = readFileSync(ROUTER_PATH, "utf8");
const REGISTRY_SRC = readFileSync(REGISTRY_PATH, "utf8");
const GEMINI_SRC = readFileSync(GEMINI_PATH, "utf8");
const OCR_SRC = readFileSync(OCR_PATH, "utf8");
const TRANSLATE_SRC = readFileSync(TRANSLATE_PATH, "utf8");
const SUMMARIZE_SRC = readFileSync(SUMMARIZE_PATH, "utf8");
const COMPARE_SRC = readFileSync(COMPARE_PATH, "utf8");
const REWRITE_SRC = readFileSync(REWRITE_PATH, "utf8");
const TABLE_SRC = readFileSync(TABLE_PATH, "utf8");
const REDACT_SRC = readFileSync(REDACT_PATH, "utf8");
const CHAT_SRC = readFileSync(CHAT_ROUTE_PATH, "utf8");
const PACKAGE_JSON_SRC = readFileSync(PACKAGE_JSON_PATH, "utf8");

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

// The canonical operations. Adding an op means adding a row here
// AND to ROUTING_POLICY + OP_REQUIRED_CAPABILITY + OP_ENV_VAR in the
// router. This test pins the set so silent drift (e.g. deleting "sign"
// from the router but not from the types) fails here.
//
// Tier 1 (2026-04-21): rewrite/table/redact promoted from "chat-with-
// extra-prompting" ad-hoc calls into first-class ops with dedicated
// openai primaries — see COST_MATRIX_3PROVIDER.md §2, margin move M2.
const OPS = [
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

// =============================================================================
// SECTION A — lib/ai/types.ts
// =============================================================================

assert(
  "A1 types.ts AIProviderId union includes 'gemini'",
  /export type AIProviderId\s*=\s*"anthropic"\s*\|\s*"openai"\s*\|\s*"gemini"/.test(
    TYPES_SRC
  ) ||
    /export type AIProviderId[\s\S]{0,200}"gemini"/.test(TYPES_SRC),
  "Expected AIProviderId to include the 'gemini' literal"
);

assert(
  "A2 types.ts AICapabilities still declares pdfInput",
  /pdfInput:\s*boolean/.test(TYPES_SRC),
  "pdfInput capability flag missing — OCR routing depends on it"
);

// =============================================================================
// SECTION B — lib/ai/router.ts contract
// =============================================================================

assert(
  "B1 router exports AIOp union",
  /export type AIOp\s*=/.test(ROUTER_SRC),
  "AIOp type export missing"
);

assert(
  "B1 router AIOp union covers every shipped op",
  OPS.every((op) => new RegExp(`"${op}"`).test(ROUTER_SRC)),
  "At least one of ocr/translate/chat/summarize/compare/generate/sign missing from router.ts"
);

assert(
  "B2 router exports route() entry point",
  /export async function route\(/.test(ROUTER_SRC),
  "route() entry point missing from router.ts"
);

assert(
  "B2 router exports resolveLadder() test hook",
  /export function resolveLadder\(/.test(ROUTER_SRC),
  "resolveLadder() helper missing from router.ts"
);

assert(
  "B2 router exports currentPolicySnapshot() diagnostic",
  /export function currentPolicySnapshot\(/.test(ROUTER_SRC),
  "currentPolicySnapshot() diagnostic helper missing"
);

assert(
  "B2 router exports NoRoutableProviderError",
  /export class NoRoutableProviderError/.test(ROUTER_SRC),
  "NoRoutableProviderError class missing — call-sites need it for 503 mapping"
);

assert(
  "B2 router exports __ROUTER_INTERNALS test hook",
  /export const __ROUTER_INTERNALS\b/.test(ROUTER_SRC),
  "__ROUTER_INTERNALS test hook missing"
);

// Policy table present + OCR specifically pins gemini as primary.
assert(
  "B3 router ROUTING_POLICY table declared",
  /const ROUTING_POLICY:\s*Record<AIOp,\s*readonly AIProviderId\[\]>\s*=\s*\{/.test(
    ROUTER_SRC
  ),
  "ROUTING_POLICY Record declaration missing"
);

assert(
  "B3 router OCR policy picks gemini first, anthropic fallback",
  /ocr:\s*\[\s*"gemini"\s*,\s*"anthropic"\s*\]/.test(ROUTER_SRC),
  "OCR primary should be gemini with anthropic fallback"
);

// M1 (2026-04-21) — translate primary flipped from gemini → openai.
// gpt-4o-mini is ~4× cheaper than gemini 2.5 flash for short-form
// bilingual passes (COST_MATRIX_3PROVIDER.md §2).
assert(
  "B3 router translate policy picks openai first (M1 flip, 2026-04-21)",
  /translate:\s*\[\s*"openai"[^\]]*\]/.test(ROUTER_SRC),
  "translate primary should be openai post-M1"
);

assert(
  "B3 router chat policy picks openai first (cheapest streaming)",
  /chat:\s*\[\s*"openai"[^\]]*\]/.test(ROUTER_SRC),
  "chat primary should be openai for cost reasons"
);

// M2 (2026-04-21) — rewrite/table/redact promoted with openai primaries.
assert(
  "B3 router rewrite policy picks openai first (M2, 2026-04-21)",
  /rewrite:\s*\[\s*"openai"[^\]]*\]/.test(ROUTER_SRC),
  "rewrite primary should be openai (gpt-4o-mini ~8× cheaper than haiku)"
);

assert(
  "B3 router table policy picks openai first (M2, 2026-04-21)",
  /table:\s*\[\s*"openai"[^\]]*\]/.test(ROUTER_SRC),
  "table primary should be openai for structured-JSON short-form work"
);

assert(
  "B3 router redact policy picks openai first (M2, 2026-04-21)",
  /redact:\s*\[\s*"openai"[^\]]*\]/.test(ROUTER_SRC),
  "redact primary should be openai for PII span enumeration"
);

assert(
  "B3 router summarize policy picks anthropic first",
  /summarize:\s*\[\s*"anthropic"[^\]]*\]/.test(ROUTER_SRC),
  "summarize primary should be anthropic"
);

assert(
  "B3 router compare policy picks anthropic first",
  /compare:\s*\[\s*"anthropic"[^\]]*\]/.test(ROUTER_SRC),
  "compare primary should be anthropic"
);

assert(
  "B3 router generate policy picks anthropic first",
  /generate:\s*\[\s*"anthropic"[^\]]*\]/.test(ROUTER_SRC),
  "generate primary should be anthropic"
);

assert(
  "B3 router sign policy picks anthropic first",
  /sign:\s*\[\s*"anthropic"[^\]]*\]/.test(ROUTER_SRC),
  "sign primary should be anthropic"
);

// Per-op policy entries: each op must have at least primary + one fallback.
for (const op of OPS) {
  const rowRe = new RegExp(`${op}:\\s*\\[([^\\]]*)\\]`);
  const m = ROUTER_SRC.match(rowRe);
  const ladder = m
    ? m[1].split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  assert(
    `B4 router ROUTING_POLICY.${op} has primary + at least one fallback`,
    ladder.length >= 2,
    `Expected ROUTING_POLICY.${op} to have ≥2 providers (primary + fallback); found ${ladder.length}`
  );
}

// Required capability table.
assert(
  "B5 router OP_REQUIRED_CAPABILITY declared",
  /const OP_REQUIRED_CAPABILITY:\s*Record<AIOp,\s*keyof AICapabilities>/.test(
    ROUTER_SRC
  ),
  "OP_REQUIRED_CAPABILITY table missing"
);

assert(
  "B5 router OP_REQUIRED_CAPABILITY.ocr === 'pdfInput'",
  /ocr:\s*"pdfInput"/.test(ROUTER_SRC),
  "OCR op must declare pdfInput as required capability"
);

for (const op of OPS.filter((o) => o !== "ocr")) {
  assert(
    `B5 router OP_REQUIRED_CAPABILITY.${op} === 'streaming'`,
    new RegExp(`${op}:\\s*"streaming"`).test(ROUTER_SRC),
    `Non-OCR op ${op} should require the universal 'streaming' capability`
  );
}

// Env-override name table.
assert(
  "B6 router OP_ENV_VAR declared",
  /const OP_ENV_VAR:\s*Record<AIOp,\s*string>/.test(ROUTER_SRC),
  "OP_ENV_VAR table missing"
);

for (const op of OPS) {
  const envVarName = `AI_ROUTER_${op.toUpperCase()}`;
  assert(
    `B6 router OP_ENV_VAR.${op} === '${envVarName}'`,
    new RegExp(`${op}:\\s*"${envVarName}"`).test(ROUTER_SRC),
    `Op ${op} should map to env var ${envVarName}`
  );
}

// Caller preferredId + env override precedence semantics.
assert(
  "B7 router resolveLadder considers caller preferredId first",
  /preferredId && VALID_PROVIDER_IDS\.has\(preferredId\)/.test(ROUTER_SRC),
  "Caller preferredId should be pushed onto the ladder first when valid"
);

assert(
  "B7 router resolveLadder reads env override via OP_ENV_VAR",
  /process\.env\[envVar\]/.test(ROUTER_SRC) ||
    /process\.env\[OP_ENV_VAR\[op\]\]/.test(ROUTER_SRC),
  "resolveLadder should read process.env[OP_ENV_VAR[op]] for env-based pinning"
);

assert(
  "B7 router resolveLadder falls through ROUTING_POLICY last",
  /for \(const id of ROUTING_POLICY\[op\]\)/.test(ROUTER_SRC),
  "Compiled ROUTING_POLICY ladder should be appended last"
);

// Invalid env value / caller id is silently ignored (never fail-closed
// because a typo shouldn't 503 the app).
assert(
  "B8 router skips invalid env / caller IDs via VALID_PROVIDER_IDS gate",
  /VALID_PROVIDER_IDS\s*:\s*ReadonlySet<AIProviderId>/.test(ROUTER_SRC),
  "VALID_PROVIDER_IDS set missing — typo'd env values would reach the ladder otherwise"
);

// Capability filter is still applied even with a policy match.
assert(
  "B9 router route() still filters by provider.capabilities[capability]",
  /provider\.capabilities\[capability\]/.test(ROUTER_SRC),
  "route() must keep the capability filter — policy-only isn't enough"
);

// Throws typed error when no provider in the ladder can service the op.
assert(
  "B9 router route() throws NoRoutableProviderError when ladder is empty",
  /throw new NoRoutableProviderError\(op,\s*capability\)/.test(ROUTER_SRC),
  "route() must throw NoRoutableProviderError on empty ladder so callers map to 503"
);

// =============================================================================
// SECTION C — lib/ai/adapters/gemini.ts
// =============================================================================

assert(
  "C1 gemini adapter imports from @google/generative-ai SDK",
  /from\s+"@google\/generative-ai"/.test(GEMINI_SRC),
  "Gemini adapter must import from @google/generative-ai"
);

assert(
  "C1 gemini adapter exports GeminiProvider class",
  /export class GeminiProvider\b/.test(GEMINI_SRC),
  "GeminiProvider class export missing"
);

assert(
  "C1 gemini adapter declares id: 'gemini'",
  /\bid\s*:\s*AIProviderId\s*=\s*"gemini"|readonly id:\s*AIProviderId\s*=\s*"gemini"|id\s*=\s*"gemini"/.test(
    GEMINI_SRC
  ) ||
    /id\s*:\s*"gemini"/.test(GEMINI_SRC),
  "Adapter.id must equal 'gemini'"
);

assert(
  "C1 gemini adapter declares pdfInput: true in capabilities",
  /capabilities\s*:[\s\S]*?pdfInput:\s*true/.test(GEMINI_SRC),
  "Gemini's whole reason-for-being is native PDF input — capability flag must be true"
);

assert(
  "C1 gemini adapter declares streaming: true in capabilities",
  /capabilities\s*:[\s\S]*?streaming:\s*true/.test(GEMINI_SRC),
  "Gemini must advertise streaming capability"
);

assert(
  "C1 gemini adapter implements chat() entry point",
  /\bchat\s*\(/.test(GEMINI_SRC),
  "chat() method missing from adapter"
);

assert(
  "C1 gemini adapter implements streamChat() entry point",
  /\bstreamChat\s*\(/.test(GEMINI_SRC),
  "streamChat() method missing from adapter"
);

assert(
  "C1 gemini adapter maps PDFs to inlineData Part",
  /inlineData:\s*\{[\s\S]*?mimeType/.test(GEMINI_SRC),
  "PDFs should travel via inlineData Part; SDK shape required"
);

// =============================================================================
// SECTION D — lib/ai/registry.ts wiring
// =============================================================================

assert(
  "D1 registry declares gemini adapter row with id: 'gemini'",
  /id:\s*"gemini"/.test(REGISTRY_SRC),
  "Registry ADAPTERS is missing the gemini row"
);

assert(
  "D1 registry accepts GEMINI_API_KEY or GOOGLE_API_KEY",
  /process\.env\.GEMINI_API_KEY[\s\S]*?process\.env\.GOOGLE_API_KEY/.test(
    REGISTRY_SRC
  ),
  "Registry should accept either GEMINI_API_KEY (preferred) or GOOGLE_API_KEY (SDK default)"
);

assert(
  "D1 registry lazy-imports the gemini adapter module",
  /await import\(\s*"\.\/adapters\/gemini"\s*\)/.test(REGISTRY_SRC),
  "Adapter should be lazy-imported so a missing SDK doesn't break boot"
);

assert(
  "D1 registry defaults gemini model to gemini-2.5-flash",
  /defaultModel:\s*process\.env\.GEMINI_MODEL\s*\?\?\s*"gemini-2\.5-flash"/.test(
    REGISTRY_SRC
  ),
  "Gemini default model should be gemini-2.5-flash (cheap, fast, PDF-capable)"
);

// =============================================================================
// SECTION E — call-site refactor (selectProvider → router.route)
// =============================================================================

// ocr.ts
assert(
  "E1 ocr.ts imports route + NoRoutableProviderError from ./router",
  /import\s*\{\s*NoRoutableProviderError\s*,\s*route\s*\}\s*from\s*"\.\/router"/.test(
    OCR_SRC
  ) ||
    /import\s*\{\s*route\s*,\s*NoRoutableProviderError\s*\}\s*from\s*"\.\/router"/.test(
      OCR_SRC
    ),
  "ocr.ts must import { route, NoRoutableProviderError } from './router'"
);

assert(
  "E1 ocr.ts calls route(\"ocr\", { preferredId })",
  /route\(\s*"ocr"\s*,\s*\{\s*preferredId:/.test(OCR_SRC),
  "ocr.ts should call route('ocr', { preferredId: input.preferredProvider })"
);

assert(
  "E1 ocr.ts maps NoRoutableProviderError → NoOcrProviderConfiguredError",
  /instanceof NoRoutableProviderError[\s\S]{0,200}throw new NoOcrProviderConfiguredError/.test(
    OCR_SRC
  ),
  "ocr.ts should catch NoRoutableProviderError and rethrow as NoOcrProviderConfiguredError (preserves 503 surface)"
);

assert(
  "E1 ocr.ts no longer imports selectProvider from ./registry",
  !/import\s*\{\s*selectProvider\s*\}\s*from\s*"\.\/registry"/.test(OCR_SRC),
  "ocr.ts should have dropped the selectProvider import"
);

// translate.ts
assert(
  "E2 translate.ts imports route + NoRoutableProviderError",
  /\broute\b[\s\S]{0,120}from\s*"\.\/router"/.test(TRANSLATE_SRC) &&
    /\bNoRoutableProviderError\b/.test(TRANSLATE_SRC),
  "translate.ts must import { route, NoRoutableProviderError } from './router'"
);

assert(
  "E2 translate.ts calls route(\"translate\", { preferredId })",
  /route\(\s*"translate"\s*,\s*\{\s*preferredId:/.test(TRANSLATE_SRC),
  "translate.ts should call route('translate', { preferredId })"
);

assert(
  "E2 translate.ts no longer imports selectProvider",
  !/import\s*\{\s*selectProvider\s*\}\s*from\s*"\.\/registry"/.test(
    TRANSLATE_SRC
  ),
  "translate.ts should have dropped the selectProvider import"
);

// summarize.ts
assert(
  "E3 summarize.ts imports route + NoRoutableProviderError",
  /\broute\b[\s\S]{0,120}from\s*"\.\/router"/.test(SUMMARIZE_SRC) &&
    /\bNoRoutableProviderError\b/.test(SUMMARIZE_SRC),
  "summarize.ts must import { route, NoRoutableProviderError } from './router'"
);

assert(
  "E3 summarize.ts calls route(\"summarize\", { preferredId })",
  /route\(\s*"summarize"\s*,\s*\{\s*preferredId:/.test(SUMMARIZE_SRC),
  "summarize.ts should call route('summarize', { preferredId })"
);

assert(
  "E3 summarize.ts no longer imports selectProvider",
  !/import\s*\{\s*selectProvider\s*\}\s*from\s*"\.\/registry"/.test(
    SUMMARIZE_SRC
  ),
  "summarize.ts should have dropped the selectProvider import"
);

// compare.ts
assert(
  "E4 compare.ts imports route + NoRoutableProviderError",
  /\broute\b[\s\S]{0,120}from\s*"\.\/router"/.test(COMPARE_SRC) &&
    /\bNoRoutableProviderError\b/.test(COMPARE_SRC),
  "compare.ts must import { route, NoRoutableProviderError } from './router'"
);

assert(
  "E4 compare.ts calls route(\"compare\", { preferredId })",
  /route\(\s*"compare"\s*,\s*\{\s*preferredId:/.test(COMPARE_SRC),
  "compare.ts should call route('compare', { preferredId })"
);

assert(
  "E4 compare.ts no longer imports selectProvider",
  !/import\s*\{\s*selectProvider\s*\}\s*from\s*"\.\/registry"/.test(
    COMPARE_SRC
  ),
  "compare.ts should have dropped the selectProvider import"
);

// app/api/ai/chat/route.ts
assert(
  "E5 chat route imports route + NoRoutableProviderError from @/lib/ai/router",
  /\bNoRoutableProviderError\b[\s\S]{0,200}from\s*"@\/lib\/ai\/router"/.test(
    CHAT_SRC
  ) ||
    /from\s*"@\/lib\/ai\/router"[\s\S]{0,200}\bNoRoutableProviderError\b/.test(
      CHAT_SRC
    ),
  "chat route must import { route, NoRoutableProviderError } from '@/lib/ai/router'"
);

assert(
  "E5 chat route calls route(\"chat\", { preferredId: ... })",
  /route\(\s*"chat"\s*,\s*\{\s*preferredId:/.test(CHAT_SRC),
  "chat route should call route('chat', { preferredId: chatSession.providerId })"
);

assert(
  "E5 chat route preserves refund + 503 on NoRoutableProviderError",
  /instanceof NoRoutableProviderError[\s\S]{0,600}refundCredits[\s\S]{0,600}no_ai_provider_configured/.test(
    CHAT_SRC
  ),
  "chat route must refund credits and return 503 no_ai_provider_configured when router throws NoRoutableProviderError"
);

assert(
  "E5 chat route no longer imports selectProvider from @/lib/ai/registry",
  !/import\s*\{\s*selectProvider\s*\}\s*from\s*"@\/lib\/ai\/registry"/.test(
    CHAT_SRC
  ),
  "chat route should have dropped the selectProvider import"
);

// rewrite.ts (Tier 1 / M2, 2026-04-21)
assert(
  "E6 rewrite.ts imports route + NoRoutableProviderError",
  /\broute\b[\s\S]{0,120}from\s*"\.\/router"/.test(REWRITE_SRC) &&
    /\bNoRoutableProviderError\b/.test(REWRITE_SRC),
  "rewrite.ts must import { route, NoRoutableProviderError } from './router'"
);

assert(
  'E6 rewrite.ts calls route("rewrite", { preferredId })',
  /route\(\s*"rewrite"\s*,\s*\{\s*preferredId:/.test(REWRITE_SRC),
  "rewrite.ts should call route('rewrite', { preferredId })"
);

assert(
  "E6 rewrite.ts maps NoRoutableProviderError → NoAIProviderConfiguredError",
  /instanceof NoRoutableProviderError[\s\S]{0,200}throw new NoAIProviderConfiguredError/.test(
    REWRITE_SRC
  ),
  "rewrite.ts should catch NoRoutableProviderError and rethrow as NoAIProviderConfiguredError"
);

assert(
  "E6 rewrite.ts no longer imports selectProvider",
  !/import\s*\{\s*selectProvider\s*\}\s*from\s*"\.\/registry"/.test(REWRITE_SRC),
  "rewrite.ts should have dropped the selectProvider import"
);

// table.ts (Tier 1 / M2, 2026-04-21)
assert(
  "E7 table.ts imports route + NoRoutableProviderError",
  /\broute\b[\s\S]{0,120}from\s*"\.\/router"/.test(TABLE_SRC) &&
    /\bNoRoutableProviderError\b/.test(TABLE_SRC),
  "table.ts must import { route, NoRoutableProviderError } from './router'"
);

assert(
  'E7 table.ts calls route("table", { preferredId })',
  /route\(\s*"table"\s*,\s*\{\s*preferredId:/.test(TABLE_SRC),
  "table.ts should call route('table', { preferredId })"
);

assert(
  "E7 table.ts maps NoRoutableProviderError → NoAIProviderConfiguredError",
  /instanceof NoRoutableProviderError[\s\S]{0,200}throw new NoAIProviderConfiguredError/.test(
    TABLE_SRC
  ),
  "table.ts should catch NoRoutableProviderError and rethrow as NoAIProviderConfiguredError"
);

assert(
  "E7 table.ts no longer imports selectProvider",
  !/import\s*\{\s*selectProvider\s*\}\s*from\s*"\.\/registry"/.test(TABLE_SRC),
  "table.ts should have dropped the selectProvider import"
);

// redact.ts (Tier 1 / M2, 2026-04-21)
assert(
  "E8 redact.ts imports route + NoRoutableProviderError",
  /\broute\b[\s\S]{0,120}from\s*"\.\/router"/.test(REDACT_SRC) &&
    /\bNoRoutableProviderError\b/.test(REDACT_SRC),
  "redact.ts must import { route, NoRoutableProviderError } from './router'"
);

assert(
  'E8 redact.ts calls route("redact", { preferredId })',
  /route\(\s*"redact"\s*,\s*\{\s*preferredId:/.test(REDACT_SRC),
  "redact.ts should call route('redact', { preferredId })"
);

assert(
  "E8 redact.ts maps NoRoutableProviderError → NoAIProviderConfiguredError",
  /instanceof NoRoutableProviderError[\s\S]{0,200}throw new NoAIProviderConfiguredError/.test(
    REDACT_SRC
  ),
  "redact.ts should catch NoRoutableProviderError and rethrow as NoAIProviderConfiguredError"
);

assert(
  "E8 redact.ts no longer imports selectProvider",
  !/import\s*\{\s*selectProvider\s*\}\s*from\s*"\.\/registry"/.test(REDACT_SRC),
  "redact.ts should have dropped the selectProvider import"
);

// =============================================================================
// SECTION F — package.json dependency
// =============================================================================

assert(
  "F1 package.json lists @google/generative-ai dependency",
  /"@google\/generative-ai"\s*:\s*"[^"]+"/.test(PACKAGE_JSON_SRC),
  "package.json must list @google/generative-ai under dependencies"
);

// =============================================================================
// Report
// =============================================================================

const total = pass + fail;
console.log("");
console.log(`test-router.mjs — ${pass}/${total} assertions passed`);
// Canonical summary line — parsed by scripts/run-all-tests.mjs.
console.log(`AI-router tests: ${pass} passed, ${fail} failed`);
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
