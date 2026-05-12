# On-demand production E2E suite

**2026-05-12 — Phases 1, 2, 3 (partial), 4 (scaffolded).**

Tests the live production site at https://pdfcraftai.com.

## TL;DR

```bash
npm run test:prod-e2e            # against pdfcraftai.com
npm run test:prod-e2e:ui         # interactive Playwright UI
gh workflow run prod-e2e.yml     # CI run via GitHub Actions
```

Specs that need secrets stay **skipped** (not failed) until the
secret lands. So every npm run is green-by-default and goes
fuller as you flip switches.

## Phase activation matrix

| Phase | What it tests | Activation |
|---|---|---|
| **1 — Anonymous smoke** | Homepage, /tools, /compare, /pricing, legal pages, JSON-LD, sitemap, robots, /api/health, PDFium WASM MIME, security headers, auth redirects | **ACTIVE** — runs by default. 53 assertions. |
| **3a — Free tool execution** | Drop sample.pdf into 12 single-input client-side tools + Merge. 13 tests. Verifies the dropzone exits empty state and the file is accepted — checks the floor, not per-tool success UI (which differs by tool). | **ACTIVE** — runs by default. Uses `public/sample.pdf` (checked in). |
| **2 — Authenticated flows** | Login flow, /app/dashboard, /app/welcome, /app/settings, /app/billing, session cookie attributes (NextAuth v5 `authjs.session-token`), admin no-leak for non-admin authed users. 6 tests. | **ACTIVE locally** when `PROD_E2E_TEST_EMAIL` + `PROD_E2E_TEST_PASSWORD` are set. In CI, **runs on weekly Sunday cron** (Phase 2/3b included automatically). |
| **3b — AI tool execution** | Exercises 9 backing AI endpoints through representative tools: `/api/ai/summarize` (5 variants), `/api/ai/rewrite`, `/api/ai/translate`, `/api/ai/table`, `/api/ai/ocr`, `/api/ai/generate`, `/api/ai/compare`, `/api/ai/chat`. Each test waits for the real POST response (status < 400) — NOT page text. 12 tests total. ~65 credits/run. | **ACTIVE locally** when Phase 2 + `PROD_E2E_AI_BUDGET_OK=yes` are set. In CI, runs on weekly Sunday cron. |
| **4 — Payment flows** | Razorpay checkout iframe opens for Starter pack + the /api/payments/razorpay/create-order POST returns 200. Full checkout-with-test-card path is scaffolded but commented `test.skip` pending founder review. | **ACTIVE locally** when Phase 2 + `PROD_E2E_PAYMENTS_OK=yes` are set. Prod runs `rzp_test_*` keys today — no separate test-mode key injection needed. Manual via `gh workflow run prod-e2e.yml -f phases=payments`. |

## Phase 2 unlock — authenticated flows

**One-time operator action (~5 min):**

1. **Create a dedicated test account on prod:**
   - Open https://pdfcraftai.com/register in an incognito window
   - Email: pick a dedicated address you control. Suggested:
     `e2e-test@pdfcraftai.com` (set up the mailbox in Hostinger
     Mail panel first if needed)
   - Password: strong, randomly generated. Save it somewhere
     you can retrieve later (1Password, etc.)
   - Verify the email (check the Hostinger inbox)
2. **Configure GitHub Actions secrets:**
   ```bash
   gh secret set PROD_E2E_TEST_EMAIL --body "e2e-test@pdfcraftai.com"
   gh secret set PROD_E2E_TEST_PASSWORD --body "<the password>"
   ```
3. **Configure local .env.local for dev runs:**
   ```bash
   echo "PROD_E2E_TEST_EMAIL=e2e-test@pdfcraftai.com" >> .env.local
   echo "PROD_E2E_TEST_PASSWORD=<the password>" >> .env.local
   ```

**Verify the unlock:**
```bash
npm run test:prod-e2e -- --grep "authenticated flows"
```
You should see the auth tests run instead of skip.

## Phase 3-AI unlock — AI tool execution

**Phase 2 must be complete first.**

1. **Top up the test account with ~50 credits** (~$5 at Starter
   pack rate; real money). Open https://pdfcraftai.com/pricing,
   buy a Starter pack via Razorpay (production), the credits land
   on the test account.
2. **Acknowledge the credit budget:**
   ```bash
   gh secret set PROD_E2E_AI_BUDGET_OK --body "yes"
   ```
3. **(Optional) Add weekly cron** in `.github/workflows/prod-e2e.yml`
   instead of relying solely on manual `gh workflow run`:
   ```yaml
   schedule:
     - cron: "0 6 * * *"      # existing daily (Phase 1 + 3a)
     - cron: "0 6 * * 0"      # weekly Sunday for AI suite
   ```
   Then teach the workflow to set `PROD_E2E_AI_BUDGET_OK` only
   for the weekly run. Pattern in workflow_dispatch inputs.

Each AI run spends ~3-6 credits across the suite (ai-summarize at
3, ai-key-points at 3). Weekly runs ≈ 12-24 credits/month ≈ $0.30/mo
once the test account is topped up.

## Phase 4 unlock — payment flows

**Phase 2 must be complete first. Founder review recommended.**

1. **Get a Razorpay test-mode key:**
   - Razorpay dashboard → Settings → API Keys → Toggle to Test mode
   - Generate a test key pair (`rzp_test_...`)
2. **Configure secrets:**
   ```bash
   gh secret set PROD_E2E_RAZORPAY_TEST_KEY --body "rzp_test_..."
   gh secret set PROD_E2E_PAYMENTS_OK --body "yes"
   ```
3. **Verify the `is_test` flag plumbing:** the pending_order row
   created on each test run should set `is_test = true` so it
   doesn't appear in /admin/margin reports. If this column doesn't
   exist, add a migration before flipping the unlock.

Phase 4 is the highest-risk surface — it touches real production
DB rows (in test mode, but real DB writes). Recommend running
manually before enabling on cron.

## Local development

```bash
npm run test:prod-e2e                              # all enabled phases
npm run test:prod-e2e -- --grep "homepage"         # one group
npm run test:prod-e2e -- --grep "authenticated"    # one phase
npm run test:prod-e2e:ui                           # debug with UI
PROD_E2E_URL=https://staging.pdfcraftai.com \
  npm run test:prod-e2e                            # against staging
```

## CI

GitHub Actions workflow at `.github/workflows/prod-e2e.yml`. Triggers:

| Trigger | Cron | Phases | Notes |
|---|---|---|---|
| Daily Mon-Sat 06:00 UTC | `0 6 * * 1-6` | 1 + 3a | Safe surface — no DB writes, no credit spend |
| Weekly Sunday 06:00 UTC | `0 6 * * 0` | 1 + 3a + 2 + 3b | Adds authed + AI surfaces. ~65 credits/run ≈ $0.40/mo |
| `gh workflow run` | manual | input `phases`: `smoke` / `full` / `payments` | Operator picks the scope |

The workflow's "Determine phase scope" step reads `github.event.schedule` and conditionally injects the Phase 2/3b/4 secrets into the test step's `env:` block. Phases without their required secrets cleanly skip rather than failing.

Scheduled-run failures auto-open a GitHub issue tagged `prod-e2e-failure` (one per failed run, with weekly vs. daily disambiguated in the title).

Reports uploaded as artifacts on every run; retention 14 days.

### Required GH secrets

| Secret | Required for | How to set |
|---|---|---|
| `PROD_E2E_TEST_EMAIL` | Phase 2 + 3b + 4 | `gh secret set PROD_E2E_TEST_EMAIL --body "..."` |
| `PROD_E2E_TEST_PASSWORD` | Phase 2 + 3b + 4 | `gh secret set PROD_E2E_TEST_PASSWORD --body "..."` |
| `PROD_E2E_AI_BUDGET_OK` | Phase 3b | `gh secret set PROD_E2E_AI_BUDGET_OK --body "yes"` |
| `PROD_E2E_PAYMENTS_OK` | Phase 4 | `gh secret set PROD_E2E_PAYMENTS_OK --body "yes"` |

**Note:** Phase 4 does NOT require a separate `PROD_E2E_RAZORPAY_TEST_KEY` because production's `RAZORPAY_KEY_ID` is already `rzp_test_*` (verified 2026-05-12 via /proc env on Hostinger). The day prod swaps to `rzp_live_*` keys for real revenue, this needs revisiting — see the safety note in `tests/e2e-prod/payments-flow.spec.ts` header.

After setting Phase 2 + 3b secrets, the next weekly Sunday run automatically expands from 66 to 78+ tests. No workflow edit needed.

## Safety summary by phase

| Phase | Mutates prod DB? | Spends credits? | Charges real money? |
|---|---|---|---|
| 1 | No | No | No |
| 3a | No | No | No |
| 2 | No (login only) | No | No |
| 3b | Yes (ai_usage rows, credit_ledger) | Yes (~$0.30/mo) | No (credits already purchased) |
| 4 | Yes (pending_order rows, `is_test`) | No | No (test-mode card) |

## When tests fail

1. **Single test, transient (network blip):** ignore. Re-run.
2. **Single test, persistent:** check if production changed. If
   the change was intentional, update the assertion in the spec.
3. **Whole phase skipped unexpectedly:** check env var configuration
   (`gh secret list` or `env | grep PROD_E2E`).
4. **Phase 1 failing:** real regression on the live site. Most
   recent deploy via `curl https://pdfcraftai.com/api/health | jq .commit`
   is the suspect.
5. **Phase 2 failing on login:** test account may have been
   disabled, email-verification flag may have been flipped on, or
   the password was changed. Re-verify and rotate the secret.
6. **Phase 3-AI failing with `insufficient_credits`:** top up the
   test account; the daily/weekly runs deplete the balance.
7. **Phase 4 failing:** check Razorpay dashboard for the test-mode
   account status; check `/admin/margin` for orphaned `is_test`
   pending_orders that didn't clean up.

## What this suite is NOT

- Not a replacement for unit tests or the static-parse aggregator
  (`npm test`). Those run in <10s; this is minutes.
- Not the deploy gate. Deploys happen via Hostinger GitHub App
  auto-pull regardless. This suite is observation, not enforcement.
- Not load testing. One request per test, no concurrency probe.

For deploy-gate-grade testing, see `playwright.config.ts` (dev
server, full triple-browser) which CAN gate deploys via GitHub
Actions on PRs.
