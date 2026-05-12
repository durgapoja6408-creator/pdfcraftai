#!/usr/bin/env node
// scripts/test-health-ai.mjs
//
// Self-contained test harness for Task #18 (code-side) — the
// `/api/health` AI-probe block. Pins the contract that:
//
//   1. `/api/health` imports `listConfiguredProviderIds` from the AI
//      registry and `currentPolicySnapshot` from the router.
//   2. The response body carries an `ai: { configured, providers,
//      defaults }` field with the exact shape ops depends on for
//      post-deploy env verification.
//   3. AI introspection failures degrade into `configured: false` +
//      empty shapes — they never flip the DB-gated `ok` boolean or
//      force a 503.
//   4. Sibling contract with /api/payments/probe (metadata-only,
//      no-store, no secrets) is preserved.
//   5. The router's introspection surface
//      (`currentPolicySnapshot`, `__ROUTER_INTERNALS`) that the health
//      route depends on is still exported from lib/ai/router.ts — if
//      someone removes that export, the probe degrades silently, so
//      the router side of the contract gets pinned here too.
//
// Why a dedicated harness (vs. extending test-router.mjs):
//   test-router.mjs already pins ~76 assertions on the router itself.
//   Mixing a route-shape suite into it would make the summary line
//   harder to skim and couple two otherwise-independent concerns. The
//   Phase A2 pattern has been one harness per contract; we keep that.
//
// Run: `node scripts/test-health-ai.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const HEALTH_PATH = resolve(ROOT, "app", "api", "health", "route.ts");
const ROUTER_PATH = resolve(ROOT, "lib", "ai", "router.ts");
const REGISTRY_PATH = resolve(ROOT, "lib", "ai", "registry.ts");
const PAYMENTS_PROBE_PATH = resolve(
  ROOT,
  "app",
  "api",
  "payments",
  "probe",
  "route.ts"
);

const HEALTH_SRC = readFileSync(HEALTH_PATH, "utf8");
const ROUTER_SRC = readFileSync(ROUTER_PATH, "utf8");
const REGISTRY_SRC = readFileSync(REGISTRY_PATH, "utf8");
const PAYMENTS_PROBE_SRC = readFileSync(PAYMENTS_PROBE_PATH, "utf8");

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
// SECTION A — /api/health imports the router + registry introspection helpers
// =============================================================================

assert(
  "A1 health route imports listConfiguredProviderIds from lib/ai/registry",
  /import\s*\{\s*listConfiguredProviderIds\s*\}\s*from\s*["']@\/lib\/ai\/registry["']/.test(
    HEALTH_SRC
  ),
  "health route must import listConfiguredProviderIds from @/lib/ai/registry"
);

assert(
  "A2 health route imports currentPolicySnapshot from lib/ai/router",
  /import\s*\{\s*currentPolicySnapshot\s*\}\s*from\s*["']@\/lib\/ai\/router["']/.test(
    HEALTH_SRC
  ),
  "health route must import currentPolicySnapshot from @/lib/ai/router"
);

assert(
  "A3 health route imports AIOp type from lib/ai/router",
  /import\s+type\s*\{\s*AIOp\s*\}\s*from\s*["']@\/lib\/ai\/router["']/.test(
    HEALTH_SRC
  ),
  "health route must import type AIOp from @/lib/ai/router for the defaults record"
);

assert(
  "A4 health route imports AIProviderId type from lib/ai/types",
  /import\s+type\s*\{\s*AIProviderId\s*\}\s*from\s*["']@\/lib\/ai\/types["']/.test(
    HEALTH_SRC
  ),
  "health route must import type AIProviderId from @/lib/ai/types for the providers array"
);

// =============================================================================
// SECTION B — probeAi() helper shape
// =============================================================================

assert(
  "B1 health route defines probeAi() helper",
  /function\s+probeAi\s*\(\s*\)\s*:/.test(HEALTH_SRC),
  "health route must define a probeAi() helper to encapsulate AI introspection"
);

assert(
  "B2 probeAi returns configured/providers/defaults shape",
  /configured:\s*boolean/.test(HEALTH_SRC) &&
    /providers:\s*AIProviderId\[\]/.test(HEALTH_SRC) &&
    /defaults:\s*Record<AIOp,\s*AIProviderId\[\]>/.test(HEALTH_SRC),
  "probeAi return type must be { configured: boolean; providers: AIProviderId[]; defaults: Record<AIOp, AIProviderId[]> }"
);

assert(
  "B3 probeAi computes configured from providers.length > 0",
  /providers\.length\s*>\s*0/.test(HEALTH_SRC),
  "probeAi must derive `configured` from providers.length > 0 (any provider is enough)"
);

assert(
  "B4 probeAi calls listConfiguredProviderIds()",
  /listConfiguredProviderIds\s*\(\s*\)/.test(HEALTH_SRC),
  "probeAi must invoke listConfiguredProviderIds() to enumerate configured adapters"
);

assert(
  "B5 probeAi calls currentPolicySnapshot()",
  /currentPolicySnapshot\s*\(\s*\)/.test(HEALTH_SRC),
  "probeAi must invoke currentPolicySnapshot() to resolve the router ladder per op"
);

assert(
  "B6 probeAi wraps introspection in try/catch (log-and-degrade)",
  /try\s*\{[\s\S]*?listConfiguredProviderIds[\s\S]*?currentPolicySnapshot[\s\S]*?\}\s*catch\s*\(/.test(
    HEALTH_SRC
  ),
  "probeAi must wrap listConfiguredProviderIds + currentPolicySnapshot in a try/catch so registry failures don't take /api/health down"
);

assert(
  "B7 probeAi catch-path degrades to configured=false + empty shapes",
  /catch[\s\S]{0,400}configured:\s*false[\s\S]{0,200}providers:\s*\[\s*\][\s\S]{0,200}defaults:\s*\{\s*\}/.test(
    HEALTH_SRC
  ),
  "probeAi catch-path must return { configured: false, providers: [], defaults: {} } — empty shapes, no throw-through"
);

assert(
  "B8 probeAi logs errors via console.error",
  /console\.error\(\s*["']\[health\]\s*ai\s*probe\s*threw:?/.test(HEALTH_SRC),
  "probeAi should emit a single `[health] ai probe threw:` log line so introspection failures are visible in Hostinger logs"
);

// =============================================================================
// SECTION C — GET() response body wiring
// =============================================================================

assert(
  // 2026-05-12 SEV-2: AI provider list now gated behind the cron
  // secret header (publicly we only expose `configured: boolean`).
  // The handler still calls probeAi(), just stores it as aiFull
  // before deciding what to emit. Accept either the old (`const ai`)
  // or the new (`const aiFull`) variable name.
  "C1 GET handler calls probeAi() to build the ai field",
  /const\s+(ai|aiFull)\s*=\s*probeAi\s*\(\s*\)/.test(HEALTH_SRC),
  "GET handler must assign `const ai = probeAi()` (or `const aiFull = probeAi()` post 2026-05-12 SEV-2 audit fix) before building the response body"
);

assert(
  "C2 response body includes `ai` alongside `db`/`commit`/`ts`",
  /ok:\s*dbOk,[\s\S]{0,500}\bai,/.test(HEALTH_SRC),
  "response body must contain an `ai` field in the returned JSON"
);

assert(
  "C3 GET still gates status code on dbOk only",
  /status:\s*dbOk\s*\?\s*200\s*:\s*503/.test(HEALTH_SRC),
  "AI state must NOT influence HTTP status — only DB health flips to 503. This preserves Kubernetes readiness-probe semantics."
);

assert(
  "C4 GET preserves no-store cache headers (sibling to /api/payments/probe)",
  /cache-control["']\s*:\s*["']no-store,\s*no-cache,\s*must-revalidate["']/.test(
    HEALTH_SRC
  ),
  "health route must keep cache-control: no-store so Cloudflare never serves a stale AI snapshot after env change"
);

assert(
  "C5 docstring documents the ai block shape",
  /ai:\s*\{[\s\S]{0,400}configured:\s*boolean[\s\S]{0,400}providers:\s*AIProviderId\[\][\s\S]{0,400}defaults:\s*Record<AIOp,\s*AIProviderId\[\]>/.test(
    HEALTH_SRC
  ),
  "top-of-file docstring must describe the ai.{configured, providers, defaults} shape so /status page + external callers can rely on it"
);

// =============================================================================
// SECTION D — router surface the health route depends on still exported
// =============================================================================

assert(
  "D1 router.ts exports currentPolicySnapshot",
  /export\s+function\s+currentPolicySnapshot\s*\(\s*\)/.test(ROUTER_SRC),
  "lib/ai/router.ts must export currentPolicySnapshot() — the health probe depends on this surface"
);

assert(
  "D2 router.ts exports AIOp type",
  /export\s+type\s+AIOp\s*=/.test(ROUTER_SRC),
  "lib/ai/router.ts must export the AIOp type so /api/health can annotate its defaults record"
);

assert(
  "D3 currentPolicySnapshot walks every AIOp key",
  /for\s*\(\s*const\s+op\s+of\s+Object\.keys\(ROUTING_POLICY\)/.test(
    ROUTER_SRC
  ),
  "currentPolicySnapshot must iterate ROUTING_POLICY so the snapshot covers every op — a missing op would show up as an empty ladder in /api/health"
);

assert(
  "D4 registry.ts exports listConfiguredProviderIds",
  /export\s+function\s+listConfiguredProviderIds\s*\(\s*\)/.test(REGISTRY_SRC),
  "lib/ai/registry.ts must export listConfiguredProviderIds() — the health probe depends on this surface"
);

assert(
  "D5 listConfiguredProviderIds reads from ADAPTERS table",
  /ADAPTERS\.filter\s*\(\s*\(a\)\s*=>\s*a\.isConfigured\(\)\s*\)\.map\s*\(\s*\(a\)\s*=>\s*a\.id\s*\)/.test(
    REGISTRY_SRC
  ),
  "listConfiguredProviderIds must derive the list from ADAPTERS.filter((a) => a.isConfigured()) — any drift breaks the contract that providers returned here are actually usable"
);

// =============================================================================
// SECTION E — sibling posture with /api/payments/probe (no-secrets, no-API)
// =============================================================================

assert(
  "E1 health route does NOT import any AI adapter directly",
  !/from\s*["']@\/lib\/ai\/adapters\//.test(HEALTH_SRC),
  "health route must NOT import AI adapters directly — that would load SDK dependencies (@anthropic-ai/sdk, @google/generative-ai, openai) into the health-check cold path. Use the registry indirection."
);

assert(
  "E2 health route does NOT call listConfiguredProviders (the heavy variant)",
  !/listConfiguredProviders\s*\(/.test(HEALTH_SRC),
  "health route must use listConfiguredProviderIds (env-read only), not listConfiguredProviders (triggers lazy-loads of every adapter SDK) — /api/health should stay cheap"
);

assert(
  "E3 health route does NOT invoke route() / getProvider() (would trigger actual provider init)",
  !/\brouter?\.route\s*\(/.test(HEALTH_SRC) &&
    !/\bgetProvider\s*\(/.test(HEALTH_SRC),
  "health route must not call route() or getProvider() — those lazy-load adapters. Introspection only."
);

assert(
  "E4 payments/probe still uses the same no-store cache posture",
  /cache-control["']\s*:\s*["']no-store,\s*no-cache,\s*must-revalidate["']/.test(
    PAYMENTS_PROBE_SRC
  ),
  "payments/probe must keep cache-control: no-store — the health route docstring claims the AI block mirrors this posture; if probe drifts, the claim is stale"
);

assert(
  "E5 health route doesn't echo env-var values in the response",
  !/process\.env\.[A-Z_]+API_KEY/.test(HEALTH_SRC),
  "health route must never reference API key env vars directly — introspection must go through listConfiguredProviderIds which only returns provider IDs, not key fragments"
);

// =============================================================================
// Summary
// =============================================================================

console.log("");
console.log("=".repeat(72));
console.log("  test-health-ai.mjs — /api/health AI probe contract");
console.log("=".repeat(72));
console.log("");
console.log(`  SECTION A — imports                           ${sectionCount("A")}`);
console.log(`  SECTION B — probeAi helper shape              ${sectionCount("B")}`);
console.log(`  SECTION C — GET() response body wiring        ${sectionCount("C")}`);
console.log(`  SECTION D — router/registry exports intact    ${sectionCount("D")}`);
console.log(`  SECTION E — sibling posture with payments     ${sectionCount("E")}`);

if (failures.length > 0) {
  console.log("");
  console.log("  Failures:");
  for (const f of failures) {
    console.log(`    - ${f.label}`);
    if (f.detail) console.log(`      ${f.detail}`);
  }
}

console.log("");
console.log(`  ${pass} passed, ${fail} failed`);
console.log("");

process.exit(fail > 0 ? 1 : 0);

// Small helper: count assertions in the labelled section.
function sectionCount(sectionLetter) {
  const passed = failures.length;
  // Count how many labels start with "<letter>"
  const total = passedInSection(sectionLetter) + failedInSection(sectionLetter);
  return `${passedInSection(sectionLetter)}/${total}`;
}
function passedInSection(letter) {
  // Everything-passed minus failures gives per-section-pass via label prefix.
  const failsInSection = failures.filter((f) =>
    f.label.startsWith(letter + (f.label[1] === " " ? "" : ""))
      ? true
      : new RegExp(`^${letter}\\d`).test(f.label)
  ).length;
  return totalInSection(letter) - failsInSection;
}
function failedInSection(letter) {
  return failures.filter((f) => new RegExp(`^${letter}\\d`).test(f.label))
    .length;
}
function totalInSection(letter) {
  // We know the totals at author time; these line up with the asserts above.
  const counts = { A: 4, B: 8, C: 5, D: 5, E: 5 };
  return counts[letter] ?? 0;
}
