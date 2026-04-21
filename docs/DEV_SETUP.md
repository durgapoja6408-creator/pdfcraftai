# Developer setup

Getting this repo from clone to pushable-green-state in under 2 minutes.

---

## Prerequisites

- **Node.js** ≥ 18.17.0 (both 18 and 20 are explicitly tested in CI; 22 works locally but is not production-pinned on Hostinger)
- **npm** (ships with Node)
- **git** ≥ 2.9 (for `core.hooksPath` support — shipped in 2016, every modern `git` has it)

## First-run setup

```bash
# 1. Install dependencies (uses package-lock.json exactly; takes ~45s)
npm ci

# 2. Opt into the repo's git hooks (one-time, see below for why)
git config core.hooksPath .githooks

# 3. Verify the test gate passes locally
npm test
```

Expected output from `npm test` (as of 2026-04-21):

```
running: pdf-tools
17 passed, 0 failed.
running: geo-router
148 passed, 0 failed.
running: geo-waitlist
217 passed, 0 failed.

[OK  ] pdf-tools
[OK  ] geo-router
[OK  ] geo-waitlist

382 passed, 0 failed across 3 suites (0.8s)
Result: PASS
```

If that's green, you're ready to push.

---

## What `core.hooksPath .githooks` does

Git's default hook directory is `.git/hooks/`, which is **not** tracked by git — so any hook you put there only affects your clone. That makes it unusable for "every contributor runs the test gate before pushing".

`core.hooksPath` overrides that directory. Setting it to `.githooks` points git at a tracked directory that ships with the repo — every clone that runs the one-time config command picks up the same set of hooks, and any future hook addition automatically activates for everyone.

### What the pre-push hook does

`.githooks/pre-push` runs `npm test` before any `git push`. The gate is fast (0.8s wall-clock for the full 382-assertion, 3-suite offline harness) and catches regressions **before** they hit GitHub — saving the round-trip to CI plus the "did my push just break `main` for 3 minutes" anxiety.

### When you need to skip the hook

Two documented bypass paths (pick whichever feels more deliberate in the moment):

```bash
# Option 1: git's built-in flag
git push --no-verify

# Option 2: env var (more greppable in shell history)
GIT_PRE_PUSH_SKIP_TESTS=1 git push
```

Legitimate reasons to bypass:

- You're shipping a test-expectation diff together with the code change it covers (tests fail mid-push because the expectation file hasn't been updated yet), and the full atomic commit is already staged.
- You're pushing a docs-only branch while unrelated tests are broken on `main`.
- You're in the middle of a rebase/fixup flow and need to push a work-in-progress branch you'll force-push over shortly.

Not a reason: "tests are slow." The gate is 0.8s.

---

## Running the test harnesses individually

`npm test` runs `scripts/run-all-tests.mjs`, which spawns each suite as a child process in declared order. To run one suite standalone:

```bash
node scripts/test-pdf-tools.mjs      # 17 assertions: free-tool PDF manipulation + encryption
node scripts/test-geo-router.mjs     # 148 assertions: Tier-1/2/3 routing logic
node scripts/test-geo-waitlist.mjs   # 217 assertions: geo-waitlist API contract + UI wiring
```

Each harness is plain-Node `assert()` + `pass`/`fail` counter — no Jest/Vitest driver, no runtime dependencies. Adding a fourth harness:

1. Drop it in `scripts/` as `test-<name>.mjs`.
2. Make sure it prints a summary line matching `N passed, M failed` (the runner regexes on that tail).
3. Add it to the `SUITES` array in `scripts/run-all-tests.mjs`.

## Running the live-prod smoke harness

```bash
npm run smoke
```

This hits the **real** production deployment at `https://pdfcraftai.com` — do not confuse with `npm test`, which is the offline pure-logic gate. `npm run smoke` answers "is the deployed site healthy?" while `npm test` answers "does the repo's own logic pass?". Two distinct questions, two distinct commands.

Override the base URL (e.g. to hit a staging deploy):

```bash
SMOKE_BASE=https://staging.pdfcraftai.com npm run smoke
```

---

## Typecheck

```bash
npm run typecheck
```

Runs `tsc --noEmit` against the whole repo. Not part of the pre-push hook (it takes ~8s vs. the test suite's ~0.8s, and typecheck drift gets caught in CI) but run it before any significant change so you don't discover type breakage at push time.

## CI

Every push to `main` and every PR targeting `main` triggers `.github/workflows/ci.yml`, which runs `npm run typecheck` + `npm test` matrixed across Node 18 and Node 20. Green CI is the last line of defence before Hostinger's GitHub App auto-deploys `main`.

See `.github/workflows/ci.yml` for the full design rationale (matrix choice, concurrency group semantics, intentionally-excluded gates).

---

## Editor / tooling

- TypeScript strict mode is on (`tsconfig.json` `strict: true`). Most drift is caught by `tsc --noEmit`.
- ESLint is installed but has no committed config yet. `next lint` will prompt for a posture on first run — don't adopt one unilaterally; that's a repo-wide design decision. If you want linting for your own editor, add an un-tracked `.eslintrc.local.json` or use your IDE's built-in TypeScript diagnostics.

## Troubleshooting

**`git push` hangs / my push is slow after `core.hooksPath`:** the hook runs `npm test` (~0.8s). If it's taking meaningfully longer than that, something in the harness is running against real prod (shouldn't happen — the three offline harnesses don't touch the network) or npm is resolving a stale registry cache. Run `npm test` standalone to check.

**Hook fires on unrelated pushes (e.g., pushing a tag):** the pre-push hook fires on `git push` regardless of refspec. To push a tag without running tests, use `git push --no-verify origin <tag>`.

**I want to disable the hook permanently for my clone:** `git config --unset core.hooksPath`. Reverts to the default `.git/hooks/` directory, which is empty.
