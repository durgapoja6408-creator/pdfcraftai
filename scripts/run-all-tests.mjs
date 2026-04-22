#!/usr/bin/env node
// scripts/run-all-tests.mjs
//
// Unified test runner — spawns each of the repo's plain-Node test harnesses
// in sequence, streams their output as they run, parses the "X passed, Y
// failed" summary line out of each, aggregates the totals, and exits
// non-zero if any suite failed or couldn't be parsed.
//
// Why this exists:
//   The repo has three independent `test-*.mjs` harnesses (one per
//   subsystem: pdf-tools, geo-router, geo-waitlist). They share the
//   same plain `assert()` + `pass/fail` counter idiom but each stands
//   alone — there's no Jest/Vitest driver, and no `"test"` script in
//   package.json. That's fine locally, but in practice it means:
//     1. Developers have to remember the full chain
//        `node scripts/test-pdf-tools.mjs && node scripts/test-geo-router.mjs
//        && node scripts/test-geo-waitlist.mjs` — easy to forget one.
//     2. CI (when it lands) has no canonical entrypoint — any GH Action
//        authored against this repo would have to either hard-code the
//        same chain or duplicate it as three matrix jobs.
//     3. There's no single "is the repo green?" command for pre-push
//        sanity checks.
//   This runner fixes all three: `npm test` (once wired into
//   package.json) runs everything and returns a single verdict.
//
// Design choices:
//   - Sequential, not parallel. Each harness is I/O-light and CPU-light;
//     wall-clock benefit from parallelism is small, and mixing three
//     harnesses' output streams would make failures painful to read.
//   - Stream output live via child.stdout/stderr piping — preserves the
//     "you see what's happening as it happens" feel, same as running the
//     harness directly.
//   - Also buffer stdout so we can regex out the summary line once the
//     child closes. The regex matches the common tail — `(\d+) passed,
//     (\d+) failed` — which each harness prints (with slight prefix
//     variation: plain in pdf-tools, "Geo-router tests: …" / "Geo-waitlist
//     tests: …" in the geo suites). Anchoring on the common tail means
//     adding a 4th harness just needs the same summary idiom, not
//     runner edits.
//   - Exit code 1 on any suite failure OR parse miss — "couldn't tell"
//     is a failure, not a pass. This catches the case where a harness
//     crashes before emitting its summary line.
//   - Zero dependencies — stdlib only, same posture as the harnesses
//     themselves. Keeps `npm test` fast and offline-safe.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Suites are run in the order they're declared here. Ordering note:
//   - pdf-tools first because it exercises the `pdf-lib` / `@cantoo/pdf-lib`
//     native crypto path; if a dependency upgrade breaks decryption, you
//     want to see that blow up before the pure-logic suites (which would
//     otherwise mask the noise).
//   - geo-router second — pure-logic, fastest, most likely to fail after
//     a data-table edit (TIER_1 / TIER_2 / TIER_3 changes).
//   - geo-waitlist last — it reads source files off disk and spot-checks
//     coverage, so it's the most sensitive to unrelated refactors.
//
// If you add a new harness:
//   1. Drop it in scripts/ following the `test-*.mjs` naming convention.
//   2. Make sure its final line prints `N passed, M failed` (rest of the
//      line can be anything — our regex only anchors on that tail).
//   3. Add an entry here.
const SUITES = [
  { name: "pdf-tools", file: "test-pdf-tools.mjs" },
  { name: "geo-router", file: "test-geo-router.mjs" },
  { name: "geo-waitlist", file: "test-geo-waitlist.mjs" },
  // ai-usage pins the Phase A1 `ai_usage` per-call audit contract: the
  // 0005 migration SQL, the Drizzle schema declaration, the write-path
  // helper, and the recordAiUsage() call-sites in the chat + summarize
  // routes. Regressions here would silently break provider-cost auditing.
  { name: "ai-usage", file: "test-ai-usage.mjs" },
  // chat-context-cap pins the Phase A2 token-cap contract (MASTER_PLAN
  // §7 gate #5 + §4 D4): 20k input tokens for chat_turn, 100k for
  // summarize. Locks the char-based estimator shape, the route's
  // 413 `context_too_large` branch, and the refund-before-413 contract.
  { name: "chat-context-cap", file: "test-chat-context-cap.mjs" },
  // ai-router pins the Phase A2 / MASTER_PLAN §7 gate #6 per-op routing
  // contract: the AIOp set, ROUTING_POLICY primary+fallback for every op,
  // OP_REQUIRED_CAPABILITY mapping, OP_ENV_VAR names, the Gemini adapter
  // shape + registry wiring, and the call-site refactor that moved every
  // lib/ai/*.ts subsystem (ocr, translate, summarize, compare) and the
  // chat route from selectProvider() to router.route(op, …). Placed
  // before dev-hooks so that a router regression is surfaced as a
  // subsystem failure rather than as a tooling failure.
  { name: "ai-router", file: "test-router.mjs" },
  // ai-evals pins Task #14 — the Phase A golden-set eval harness
  // scaffold + per-op quality floor. Covers: migration 0011 contract
  // (ai_eval_runs table + 3 indexes), Drizzle schema parity, the
  // lib/ai/eval/{types,rubric,golden-set,runner}.ts module surface,
  // rubric primitive behaviour via dynamic import, golden-set
  // well-formedness (unique (op,id) pairs, diverse rubric kinds,
  // must-cover translate + summarize since those are the Task #4/#11
  // regression targets), runner export contract including
  // PROMPT_BUILDERS coverage for every op with fixtures, and the
  // scripts/run-ai-evals.mjs CLI shell. Placed right after ai-router
  // because runner.ts layers directly on route(op, ...) + the
  // registry adapter surface — a router export removal breaks both,
  // and this harness surfaces "runner cannot build ChatInput for op X"
  // at the right granularity.
  { name: "ai-evals", file: "test-ai-evals.mjs" },
  // health-ai pins Task #18 (code-side) — the /api/health ai.{configured,
  // providers, defaults} block. Covers: import of the router+registry
  // introspection helpers, probeAi() try/catch degrade path, response-body
  // wiring, DB-gated 200/503 posture (AI state never flips `ok`), sibling
  // posture with /api/payments/probe (no-store cache, no SDK imports, no
  // env-var value echoes). Placed right after ai-router because it layers
  // on top of the same router surface — a router export removal breaks
  // both, and test-health-ai pins exactly that surface (currentPolicySnapshot
  // + AIOp type export + listConfiguredProviderIds) so the failure shows
  // up at the right granularity.
  { name: "health-ai", file: "test-health-ai.mjs" },
  // ai-margin-rollup pins Task #22 / MASTER_PLAN §7 gate #7 — the Phase
  // A4 daily margin rollup cron + 7-day green streak metric. Covers:
  // migration 0006 column + index contract, Drizzle schema alignment,
  // the lib/ai/margin-rollup.ts public surface (constants, pure math,
  // streak semantics, Slack emitter gating), and the cron route's
  // auth/backfill shape. Placed right after health-ai because it
  // layers on the same ai_usage schema the Phase A1 suite pins — a
  // column rename in ai_usage breaks both, and this harness pins the
  // aggregate-side consumer of those columns.
  { name: "ai-margin-rollup", file: "test-ai-margin-rollup.mjs" },
  // admin-margin pins Task #22's READ side — the /api/admin/margin
  // endpoint and its supporting helpers (clampAdminDays,
  // parseAdminEmails, isAdminEmail, getAdminMarginSummary). Forms a
  // write/read pair with the ai-margin-rollup suite above: a regression
  // in the cron surfaces as "ai-margin-rollup", a regression in the
  // dashboard endpoint or admin-auth gating surfaces as "admin-margin".
  // Placed here rather than next to the other admin routes (none exist
  // yet — this is the first) so the two margin suites sit together and
  // share their rationale at review time.
  { name: "admin-margin", file: "test-admin-margin.mjs" },
  // prompt-safety pins Task #26 / PLAN_GAP_ANALYSIS SEV-0 — the
  // defense-in-depth layer against prompt injection on PDF→AI flows.
  // Covers: the lib/ai/prompt-safety.ts module contract (exports,
  // PromptSafetyOp superset of AIOp, XML sentinel constants), wrap/
  // escape semantics (source-label sanitization, U+200B break-out escape
  // for tags + legacy === markers), safety-preamble coverage of every
  // op (ocr/translate/chat/summarize/compare/generate/sign/rewrite/
  // table/redact), jailbreak pattern library (13 patterns spanning
  // high/medium/low severity) with positive/negative cases, and
  // call-site integration (every lib/ai/*.ts op module + the chat
  // route imports from prompt-safety and actually wraps user input).
  // Placed after ai-margin-rollup because it pins the same lib/ai/*.ts
  // surface — a file-level rewrite (e.g. deleting summarize.ts) breaks
  // both, and this harness surfaces "prompt-safety call-site missing"
  // at the right granularity.
  { name: "prompt-safety", file: "test-prompt-safety.mjs" },
  // output-moderation pins Task #28 — the OUTPUT-side defense-in-depth
  // companion to prompt-safety's input-side defense. Covers: the
  // lib/ai/output-moderation.ts module contract (ModerationOp aliased
  // to PromptSafetyOp so the two op sets stay in lockstep,
  // SEVERITY_RANK ladder, moderateOutput/assertOutputSafe/
  // OutputModerationBlockedError exports), the pattern library (10
  // secret subtypes, 5 PII subtypes, 3 jailbreak-echo subtypes with
  // correct severities), positive/negative runtime checks for
  // critical-severity secrets and PII, severity aggregation +
  // redactSample masking, and call-site integration: all 9
  // non-streaming op modules (summarize/translate/compare/generate/
  // rewrite/table/redact/sign/ocr) import moderateOutput +
  // assertOutputSafe and block on critical; the chat route calls
  // moderateOutput advisory-only (console.warn, no
  // assertOutputSafe) because deltas are already on the wire. Placed
  // right after prompt-safety because the two form a defense-in-depth
  // pair and a regression in either module surface typically breaks
  // both harnesses — surfacing as "output-moderation" vs "prompt-safety"
  // gives the right granularity when debugging which side broke.
  { name: "output-moderation", file: "test-output-moderation.mjs" },
  // dev-hooks pins the pre-push hook's contract + DEV_SETUP.md install
  // instructions. Ordered last because it's not a subsystem gate —
  // it's a self-consistency gate on the repo's own dev tooling. If
  // somebody strips the executable bit off .githooks/pre-push or
  // rewires the hook to call something other than `npm test`, this
  // fails here rather than silently at push time.
  { name: "dev-hooks", file: "test-dev-hooks.mjs" },
  // credit-ledger-financials pins Phase B / Task #15 — the 12 new
  // financial columns on credit_ledger (fee / tax / FX / net_revenue /
  // provider / data_source / card_fingerprint). Covers: migration 0012
  // shape (additive-only, DEFAULT NULL across the board, no DROP/MODIFY
  // in executable SQL), Drizzle schema pins (decimal helper imported,
  // every column declared with matching drizzle-orm helper + length/
  // precision), lib/payments/ledger.ts wiring (LedgerFinancials type,
  // financials? on GrantCreditsInput, fxRateUsed persisted as String
  // to preserve decimal(18,8) precision, every column spread via
  // `?? null`), and a cross-file invariant that every column name
  // appears in all three layers (migration ✓ schema ✓ ledger.ts ✓) —
  // that's the refactor trap the prototype shipped net=0 against when
  // a column was added to the migration but left out of the write path.
  // Placed last alongside dev-hooks because this harness is pure
  // static-parse — no route imports — and the financial columns are
  // orthogonal to every AI-cluster suite above.
  {
    name: "credit-ledger-financials",
    file: "test-credit-ledger-financials.mjs",
  },
];

/**
 * Spawn one harness, stream its output, return a structured result.
 *
 * We pipe stdout/stderr to both (a) the parent process's stdout/stderr
 * so the developer sees output in real time, and (b) an in-memory
 * buffer so we can regex the summary line out after close. This is
 * cheap — each harness outputs a few hundred lines at most.
 */
function runSuite(suite) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, suite.file);
    const child = spawn(process.execPath, [scriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
      process.stdout.write(d);
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      process.stderr.write(d);
    });

    child.on("close", (code) => {
      // Match the common tail of every harness's summary: "N passed,
      // M failed". Case-insensitive to be forgiving, and we don't
      // anchor on prefix so future harnesses can label however they
      // like ("Foo tests: 3 passed, 0 failed", "3 passed, 0 failed.",
      // etc. — all work).
      const match = stdout.match(/(\d+)\s+passed,\s+(\d+)\s+failed/i);
      const passed = match ? parseInt(match[1], 10) : NaN;
      const failed = match ? parseInt(match[2], 10) : NaN;
      resolve({
        name: suite.name,
        file: suite.file,
        exit: code ?? -1,
        passed,
        failed,
        parsed: Boolean(match),
      });
    });

    child.on("error", (err) => {
      // Process failed to spawn at all — treat as a suite failure with
      // exit -1 and no parseable counts. The aggregate step below will
      // flip the overall verdict to FAIL.
      resolve({
        name: suite.name,
        file: suite.file,
        exit: -1,
        passed: NaN,
        failed: NaN,
        parsed: false,
        spawnError: err.message,
      });
    });
  });
}

const HR = "=".repeat(72);

(async () => {
  const started = Date.now();
  const results = [];

  for (const s of SUITES) {
    console.log(`\n${HR}`);
    console.log(`  Running: ${s.name}  (scripts/${s.file})`);
    console.log(HR);
    const r = await runSuite(s);
    results.push(r);
  }

  // ----- Aggregate -----
  console.log(`\n${HR}`);
  console.log(`  Test suite summary`);
  console.log(HR);

  let totalPassed = 0;
  let totalFailed = 0;
  let anyFailed = false;

  for (const r of results) {
    const suiteOk = r.exit === 0 && r.parsed && r.failed === 0;
    const verdict = suiteOk ? "OK  " : "FAIL";
    const counts = r.parsed
      ? `${String(r.passed).padStart(3)} passed, ${String(r.failed).padStart(2)} failed`
      : `(summary unparseable)`;
    const exitBadge = r.exit === 0 ? "" : `  [exit ${r.exit}]`;
    console.log(`  [${verdict}] ${r.name.padEnd(14)}  ${counts}${exitBadge}`);

    if (Number.isFinite(r.passed)) totalPassed += r.passed;
    if (Number.isFinite(r.failed)) totalFailed += r.failed;
    if (!suiteOk) anyFailed = true;
  }

  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`  ${"-".repeat(68)}`);
  console.log(
    `  Total: ${totalPassed} passed, ${totalFailed} failed across ${results.length} suites  (${elapsedSec}s)`
  );

  if (anyFailed) {
    console.log(`\n  Result: FAIL\n`);
    process.exit(1);
  }
  console.log(`\n  Result: PASS\n`);
  process.exit(0);
})();
