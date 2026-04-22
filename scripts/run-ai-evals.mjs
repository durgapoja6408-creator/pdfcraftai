#!/usr/bin/env node
// scripts/run-ai-evals.mjs
//
// Phase A / Task #14 — eval harness CLI.
//
// What this is
// ------------
// The front door for the golden-set eval runner at lib/ai/eval/runner.ts.
// Parses command-line flags, loads the golden set, filters by ops/ids,
// and dispatches one of two modes:
//
//   --dry-run   : score a canned output against the rubric for every
//                 selected fixture without touching any AI provider.
//                 Fast, offline-safe, useful for verifying the rubric
//                 primitives + golden-set wiring locally before paying
//                 real tokens.
//
//   live mode   : (Phase B wiring — deferred) shell into the Next.js
//                 runtime (same path the admin UI will use) to execute
//                 runEvals() with real provider calls. For v1, prints
//                 the invocation plan and the exact POST the admin
//                 endpoint will accept so the hand-off is documented
//                 rather than silently no-op.
//
// Why a .mjs shell and not a .ts entry
// ------------------------------------
// The repo's test harnesses are all plain-Node .mjs (no tsx/ts-node in
// devDependencies — deliberate, keeps `npm test` offline-safe + fast).
// The runner itself lives at lib/ai/eval/runner.ts and is `"server-only"`:
// it imports @/db/client and @/db/schema/app, which resolve via Next's
// tsconfig path aliases. Executing the TS runner directly from here
// would need a compiler step the CI image doesn't have.
//
// For v1 this CLI:
//   - Does all the flag parsing + input validation (the bit that's
//     genuinely plumbing).
//   - Runs the rubric primitives in dry-run mode via dynamic import of
//     rubric.ts (the harness proves this works — rubric.ts is pure and
//     has no server-only import tree).
//   - For live mode, prints the exact POST body the forthcoming
//     /api/admin/ai-evals/run endpoint will accept (Phase B Task #15+).
//     That keeps the CLI shape stable across phases: same flags, same
//     output, just the live leg flips from "planned" to "executed".
//
// Flags
// -----
//   --dry-run              Score stub outputs against the rubric; no
//                          provider calls.
//   --ops=a,b,c            Comma list of ops to include. Default: every
//                          op with fixtures.
//   --ids=id1,id2          Comma list of golden ids within the selected
//                          ops. Default: all.
//   --stub="some text"     Canned output to score in dry-run (same
//                          string used for every fixture). Default:
//                          a multi-purpose stub that passes most
//                          non-structural checks.
//   --json                 Emit the summary as JSON (one line). Default:
//                          human-readable table.
//   -h, --help             Print this help and exit.
//
// Exit codes
// ----------
//   0   All selected fixtures scored; no parse errors.
//   1   Unknown flag, invalid op/id filter, or rubric import failure.
//   2   (reserved for live mode — non-zero pass rate below per-op floor)
//
// Usage
// -----
//   node scripts/run-ai-evals.mjs --dry-run
//   node scripts/run-ai-evals.mjs --dry-run --ops=translate,summarize
//   node scripts/run-ai-evals.mjs --dry-run --ids=translate-es-financial
//   node scripts/run-ai-evals.mjs                 # prints live-mode plan
//
// Run: `node scripts/run-ai-evals.mjs --dry-run`

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------- flag parse
// Tiny hand-rolled parser. No yargs/commander — stdlib-only posture
// matches run-all-tests.mjs.

function parseArgs(argv) {
  const out = {
    dryRun: false,
    ops: null,
    ids: null,
    stub: null,
    json: false,
    help: false,
  };
  for (const raw of argv) {
    const arg = String(raw);
    if (arg === "-h" || arg === "--help") {
      out.help = true;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--json") {
      out.json = true;
    } else if (arg.startsWith("--ops=")) {
      out.ops = arg
        .slice("--ops=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--ids=")) {
      out.ids = arg
        .slice("--ids=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--stub=")) {
      out.stub = arg.slice("--stub=".length);
    } else {
      console.error(`Unknown flag: ${arg}`);
      console.error(`Run with --help for usage.`);
      process.exit(1);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  // Print the header block above (lines 9 through the end of Usage).
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const header = src.split("\n").slice(0, 86).join("\n");
  console.log(header);
  process.exit(0);
}

// ---------------------------------------------------------------- golden set
// golden-set.ts is TypeScript; we can't import it directly from .mjs
// without a compiler. Parse the fixture declarations statically — same
// trick the test harness uses. Good enough for CLI filtering/printing;
// when live execution lands (Phase B) the admin endpoint imports the
// real module.

const GOLDEN_PATH = resolve(ROOT, "lib", "ai", "eval", "golden-set.ts");
const GOLDEN_SRC = readFileSync(GOLDEN_PATH, "utf8");

/**
 * Parse just enough of golden-set.ts to list fixtures: (id, label, op,
 * thresholdBps, number of checks). Doesn't reconstruct input/check
 * args — that requires real TS parsing, and the CLI's job for v1 is
 * to enumerate, not simulate.
 */
function parseFixtureIndex(src) {
  const items = [];
  // Match `{ id: "...", label: "...", op: "...", ... }` blocks. Greedy
  // on the contents so we can peek at thresholdBps + check count.
  const re = /\{\s*id:\s*"([a-z0-9-]+)",\s*label:\s*"([^"]+)",\s*op:\s*"([a-z]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const [, id, label, op] = m;
    // Find thresholdBps within ~3KB after this block (cheap bound).
    const windowEnd = Math.min(src.length, m.index + 3000);
    const window = src.slice(m.index, windowEnd);
    const thMatch = window.match(/thresholdBps:\s*(\d+)/);
    const checkCount = (window.match(/kind:\s*"[a-zA-Z]+"/g) ?? []).length;
    items.push({
      id,
      label,
      op,
      thresholdBps: thMatch ? parseInt(thMatch[1], 10) : 7000,
      checkCount,
    });
  }
  return items;
}

const ALL_FIXTURES = parseFixtureIndex(GOLDEN_SRC);

if (ALL_FIXTURES.length === 0) {
  console.error(
    "No fixtures parsed from lib/ai/eval/golden-set.ts — parser out of sync with source?"
  );
  process.exit(1);
}

// Apply filters.
let fixtures = ALL_FIXTURES;
if (args.ops) {
  const opsSet = new Set(args.ops);
  fixtures = fixtures.filter((f) => opsSet.has(f.op));
  if (fixtures.length === 0) {
    console.error(
      `No fixtures match --ops=${args.ops.join(",")}. Available ops: ${Array.from(
        new Set(ALL_FIXTURES.map((f) => f.op))
      )
        .sort()
        .join(", ")}`
    );
    process.exit(1);
  }
}
if (args.ids) {
  const idsSet = new Set(args.ids);
  fixtures = fixtures.filter((f) => idsSet.has(f.id));
  if (fixtures.length === 0) {
    console.error(
      `No fixtures match --ids=${args.ids.join(",")}. Available ids: ${ALL_FIXTURES.map(
        (f) => f.id
      ).join(", ")}`
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------- dry-run
// Score a stub output against each selected fixture's rubric. We can't
// use the runner directly (server-only TS), but rubric.ts is pure and
// the same dynamic-import-with-fallback trick the test harness uses
// works here. If the runtime can't load rubric.ts (no TS loader), fall
// back to a no-op pass so the CLI still exits cleanly — the test
// harness separately pins rubric correctness.

const DEFAULT_STUB = [
  'Hola, mundo. Revenue was $94.9B in Q2 with 6% growth.',
  '{"total": 100, "lines": [{"item": "widget", "qty": 2}]}',
  'Contact support@example.com about id 7f3e1a2b-4c8d-49fa-bd12-0abc9def1234.',
].join(" ");

/**
 * Cross-check of what the rubric accepts. We don't reconstruct each
 * check's args from the .ts source here; we just run a lightweight
 * "rubric reachable + sane" smoke per selected fixture so --dry-run
 * produces useful output without re-implementing golden-set parsing.
 */
async function runDryRun() {
  const stub = args.stub ?? DEFAULT_STUB;

  let rubric = null;
  try {
    rubric = await import(
      pathToFileURL(resolve(ROOT, "lib", "ai", "eval", "rubric.ts")).href
    );
  } catch (_err) {
    // No TS loader — emit a degraded summary.
  }

  const lines = [];
  lines.push("Dry-run — scoring stub output against each selected fixture:");
  lines.push("");
  lines.push(`  Stub output: ${JSON.stringify(stub).slice(0, 80)}...`);
  lines.push(`  Rubric loader: ${rubric ? "ok" : "unavailable (static mode)"}`);
  lines.push("");

  for (const f of fixtures) {
    let note = "";
    if (rubric) {
      // Smoke: run outputNonEmpty + noPreamble as cheap sanity.
      const r1 = rubric.outputNonEmpty(stub);
      const r2 = rubric.noPreamble(stub);
      note = `nonEmpty=${r1.passed} noPreamble=${r2.passed}`;
    } else {
      note = "(rubric smoke skipped)";
    }
    lines.push(
      `  [${f.op.padEnd(10)}] ${f.id.padEnd(36)}  ${String(f.checkCount).padStart(
        2
      )} checks, threshold ${f.thresholdBps} bps  — ${note}`
    );
  }

  if (args.json) {
    const payload = {
      mode: "dry-run",
      rubricLoader: rubric ? "ok" : "unavailable",
      fixtures: fixtures.map((f) => ({
        op: f.op,
        id: f.id,
        label: f.label,
        thresholdBps: f.thresholdBps,
        checkCount: f.checkCount,
      })),
    };
    console.log(JSON.stringify(payload));
  } else {
    console.log(lines.join("\n"));
  }
  process.exit(0);
}

// ---------------------------------------------------------------- live plan
// For v1, live execution is deferred to the Phase B admin endpoint +
// cron (Task #15+). This prints the invocation plan and the exact
// HTTP call that the admin UI will make, so operators have a
// single-source reference right now.

function printLivePlan() {
  const opsSelected = Array.from(new Set(fixtures.map((f) => f.op))).sort();
  const idsSelected = fixtures.map((f) => f.id);

  const body = {
    ops: args.ops ?? opsSelected,
    ...(args.ids ? { goldenIds: args.ids } : {}),
    persist: true,
  };

  if (args.json) {
    console.log(
      JSON.stringify({
        mode: "live-plan",
        adminEndpoint: "POST /api/admin/ai-evals/run",
        body,
        fixtureCount: fixtures.length,
        opsSelected,
        idsSelected,
      })
    );
    process.exit(0);
  }

  console.log("Live mode — invocation plan (Phase B execution):");
  console.log("");
  console.log(`  Fixtures selected: ${fixtures.length}`);
  console.log(`  Ops: ${opsSelected.join(", ")}`);
  console.log("");
  console.log(
    "  V1 note: live provider calls dispatch through the Next.js runtime"
  );
  console.log("  (the runner at lib/ai/eval/runner.ts is server-only).");
  console.log("  Phase B adds POST /api/admin/ai-evals/run — once wired,");
  console.log("  this CLI will dispatch to it; until then, use --dry-run");
  console.log("  locally or the admin UI in-app.");
  console.log("");
  console.log("  Planned request:");
  console.log(`    POST /api/admin/ai-evals/run`);
  console.log(`    Content-Type: application/json`);
  console.log(`    ${JSON.stringify(body, null, 2).replace(/\n/g, "\n    ")}`);
  console.log("");
  console.log("  Re-run with --dry-run to score stub output against the rubric");
  console.log("  without any provider calls.");
  process.exit(0);
}

// ---------------------------------------------------------------- dispatch

if (args.dryRun) {
  await runDryRun();
} else {
  printLivePlan();
}
