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
  // dev-hooks pins the pre-push hook's contract + DEV_SETUP.md install
  // instructions. Ordered last because it's not a subsystem gate —
  // it's a self-consistency gate on the repo's own dev tooling. If
  // somebody strips the executable bit off .githooks/pre-push or
  // rewires the hook to call something other than `npm test`, this
  // fails here rather than silently at push time.
  { name: "dev-hooks", file: "test-dev-hooks.mjs" },
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
