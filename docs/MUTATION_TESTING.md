# Phase 7 — Mutation testing (Stryker) — DOCUMENTATION ONLY

**Status (2026-04-30):** scaffolded as documentation, not as automation.

## What it is

Mutation testing tools like [Stryker](https://stryker-mutator.io/)
introduce small mutations to source code (flip operators, change
return values, swap conditional branches) and run the test suite.
A test that still passes after a mutation is a test that isn't
actually testing anything — it's "lying" about coverage. Mutation
score = % of mutations the suite caught.

This catches the failure mode where you have green tests but they're
asserting trivialities (e.g., "the function returned a value" without
checking what value). Coverage tools say 100% covered; mutation
tools say 30% mutation score; only the latter is honest.

## Why this isn't automated yet

1. **Run cost.** Stryker mutates each file independently and runs
   the test suite per mutation. For a codebase with ~30 op files +
   ~3300 tests, a full run is multi-hour wall time. The sandbox
   doesn't have the budget.
2. **Configuration sensitivity.** Mutation tools produce noise on
   loosely-asserting tests (e.g., "is the response JSON?" passes
   under mutations that change the JSON content). The Phase 2 test
   suite is structured well enough to give meaningful results, but
   tuning Stryker to ignore false-positives (e.g., string literals
   in error messages) takes iteration.
3. **Diminishing return until the lower phases are mature.** Mutation
   testing on a sparse suite produces noise. Phases 1-6 are still
   freshly shipped; running mutation tests against them would surface
   tests that are intentionally loose ("smoke check that the page
   renders") and flag them as gaps. Better to wait until Phases 1-3
   are battle-tested, then run Stryker against Phase 2 + Phase 3 to
   identify real coverage holes.

## How to run when you're ready

```bash
# Install (only when running)
npm install --save-dev @stryker-mutator/core @stryker-mutator/typescript-checker

# Initialize (creates stryker.conf.json)
npx stryker init
# Pick: vitest or custom command runner
# Mutate: lib/pdf/ops/**/*.ts
# Test runner: command (`npx tsx scripts/test-pdf-ops.ts`)

# Run
npx stryker run

# Open the HTML report
open reports/mutation/html/index.html
```

## Recommended scope when you do run it

Start narrow:

1. **Phase 2's pdf-ops tests.** Mutate `lib/pdf/ops/*.ts`, run via
   `tsx scripts/test-pdf-ops.ts`. You'll find which ops have weak
   tests — likely the byte-parser inspectors where assertions are
   "totalCount is a number" rather than "totalCount = 3".
2. **Schema-drift logic.** `lib/db/schema-drift.ts` is critical
   safety code; mutation testing exposes whether the test suite
   actually exercises drift detection.
3. **Credit-ledger math.** `lib/payments/`, `lib/credits/`. Money
   bugs are the worst kind to ship; mutation testing catches "test
   never asserted the dollar amount."

Skip the React components — they're already covered by Playwright
E2E + the existing 39 static-parse suites, and Stryker on JSX is
noisy.

## Stryker config sketch

Save as `stryker.conf.json` when you set this up:

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "npm",
  "testRunner": "command",
  "commandRunner": {
    "command": "npx tsx scripts/test-pdf-ops.ts"
  },
  "mutate": [
    "lib/pdf/ops/**/*.ts",
    "!lib/pdf/ops/standards-helpers.ts",
    "!lib/pdf/ops/pdf-lib-helpers.ts"
  ],
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": 40
  },
  "timeoutMS": 30000,
  "concurrency": 4,
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json"
}
```

`break: 40` means CI fails if mutation score drops below 40%. Tune
upward over time as the suite matures. Industry-typical "good"
mutation scores are 60-80%.

## Estimated time-to-value

- Initial setup + first run: 1-2 hours
- Tuning config to filter noise: 1-2 hours
- Reviewing report + adding asserts to weak tests: 4-8 hours
- Integrating into a CI gate: 1 hour

Total: a 1-2 day investment for ~20-30 percentage points of
mutation-score lift on the critical paths.

When you do this, ship the work as a separate session — it's a
deep-focus task that doesn't batch well with feature work.
