# pdfcraftai.com — Claude Session Bootstrap

**This file is auto-loaded at the start of every session. READ IT FIRST before doing any deployment, env, or credential work.**

---

## 1. Project identity

- **Production URL:** https://pdfcraftai.com (apex + www)
- **Stack:** Next.js 14 (app router), NextAuth v5, Drizzle (MySQL)
- **Host:** Hostinger (managed Node.js Web App, `hpanel.hostinger.com/websites/pdfcraftai.com`)
- **CDN/Proxy:** Cloudflare (full proxy; confirmed via `cf-ray`, `server: cloudflare`)
- **GitHub repo:** `durgapoja6408-creator/pdfcraftai` (main branch deploys automatically)

## 2. Deployment flow — DO NOT edit via Hostinger file manager

**How code goes live:**
1. Commit + push to `main` on the GitHub repo
2. Hostinger's **GitHub App integration** auto-pulls and redeploys (takes ~2–3 min)

**You (Claude) have TWO persistent credentials the user already set up for you:**

### (a) GitHub Personal Access Token (classic)
- **Name:** `cowork-pdfcraftai-deploy` (assumed — CLAUDE.md previously said May 19, 2026; API reports expiration 2026-07-18 18:10:48 UTC, so the token in `.claude/secrets.env` has been rotated at least once)
- **Expires:** 2026-07-18 (verified via `github-authentication-token-expiration` response header, 2026-04-20)
- **Owner login:** `durgapoja6408-creator` (id 277461726)
- **Scopes:** `repo`, `workflow`, `read:network_configurations`
- **Where stored on user's side:** GitHub → Settings → Developer Settings → Tokens (classic)
- **How you use it:** After the user pastes it into chat or into `.claude/secrets.env` (see section 4), use it to `git clone https://<PAT>@github.com/durgapoja6408-creator/pdfcraftai.git`, commit, and `git push`.

### (b) Hostinger SSH key
- **Name on Hostinger:** `cowork-apr2026-v2` (original `cowork-apr2026` was rotated on 2026-04-19 because its private half was lost)
- **Key comment:** `cowork-20260419@claude`
- **Algorithm:** ed25519
- **Status on Hostinger:** ACTIVE (verified via `ssh ... 'whoami'` → `u692382124` on `us-imm-web534.main-hosting.eu`)
- **What it grants:** Shell access to the Hostinger server (for runtime debugging, log tailing, `pm2` control, etc.)
- **SSH endpoint:** `u692382124@212.85.28.206:65002`
- **Private key path (sandbox):** `/sessions/gifted-funny-franklin/mnt/pdfcraftai.com/.claude/id_ed25519_cowork` (chmod 600, gitignored)
- **How to connect:** `ssh -i .claude/id_ed25519_cowork -p 65002 u692382124@212.85.28.206`
- **CAVEAT:** the private key lives in the sandbox. If the sandbox is wiped, regenerate with `ssh-keygen -t ed25519 -C "cowork-<date>@claude" -f .claude/id_ed25519_cowork -N ""`, add the new .pub to Hostinger (SSH Access → Add SSH key), then delete the old entry.

## 3. Known infra IDs (safe to keep in the repo)

| Item | Value |
|---|---|
| Google OAuth Client ID | `912612566698-n1857n8qa60n2sb55qag7sn2fi9bgias.apps.googleusercontent.com` |
| Google Cloud project | `pdfcraftai` |
| GA4 Measurement ID | `G-2Y8PS0S93F` |
| GA4 Stream ID | `14383455005` |
| Microsoft Clarity Project ID | `wcsbv536zv` |
| GitHub repo | `durgapoja6408-creator/pdfcraftai` |
<!-- Paddle Seller ID 320957 retired as a payment rail on 2026-05-01 (commit 92f965a). Razorpay is the sole payment processor; international gateway TBD. -->


**Secrets NOT in this file** (env vars live on Hostinger; PAT + SSH private key live only in `.claude/secrets.env`):
`GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `MYSQL_URL`, the PAT/SSH private key itself, and `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`.

## 4. Credentials handoff pattern — `.claude/secrets.env`

When the user pastes credentials, save them to `.claude/secrets.env` (already gitignored). Format:

```bash
# GitHub PAT for pushing to durgapoja6408-creator/pdfcraftai
GITHUB_PAT=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Hostinger SSH (use as -i flag; private key body, NOT path)
HOSTINGER_SSH_USER=u123456789
HOSTINGER_SSH_HOST=192.0.2.1
HOSTINGER_SSH_PORT=65002
HOSTINGER_SSH_PRIVATE_KEY_PATH=/sessions/gifted-funny-franklin/mnt/pdfcraftai.com/.claude/id_ed25519_cowork
```

### 4a. Current `.claude/secrets.env` inventory (as of 2026-05-12)

The sandbox `.claude/secrets.env` file at session-write time contains these keys. **If sandbox wipes between sessions** AND the user wants to skip re-bootstrap, the user has a one-time backup of these values from chat history and can re-paste; otherwise a fresh session re-collects each one as documented in §4b below.

| Key | Source of truth | How to re-fetch |
|---|---|---|
| `CRON_SECRET` | Hostinger env (set 2026-05-04) | SSH + read /proc env: `cat /proc/$(ps -fu u692382124 \| grep next-server \| head -1 \| awk '{print $2}')/environ \| tr '\0' '\n' \| grep CRON_SECRET` |
| `PROD_E2E_TEST_EMAIL` | Hardcoded: `durgapoja6408@gmail.com` | Account user_id `6b303c3b-ddfd-48fc-9162-2556d077fece` in the `users` table |
| `PROD_E2E_TEST_PASSWORD` | Set by user 2026-05-12: `Cognizant@2020` | User-side only (NextAuth credentials provider hashes via bcrypt — not recoverable from DB without rotation) |
| `PROD_E2E_AI_BUDGET_OK` / `PROD_E2E_PAYMENTS_OK` | Hardcoded `yes` to ack mutations on test account | n/a — just a yes-flag |
| `RAZORPAY_KEY_ID` | Hostinger env. Currently `rzp_test_Sg0TtVISTov479` (TEST mode) | Same `/proc env` SSH pattern as CRON_SECRET |
| `RAZORPAY_KEY_SECRET` | Hostinger env | Same |
| `RAZORPAY_WEBHOOK_SECRET` | Hostinger env | Same |

**For payments-side migration to `rzp_live_*` keys**, see `docs/RAZORPAY_LIVE_SWAP.md` — the test account password also needs revisiting at that point (don't reuse the test pw for any payment-bearing account).

### 4b. Recovery sequence for a fresh session if `.claude/secrets.env` is missing

1. **GitHub PAT** — Claude cannot self-recover this. Ask user: *"I see there's a `cowork-pdfcraftai-deploy` PAT in your GitHub Settings → Developer → Tokens. Please paste it so I can `git push` again."*
2. **SSH private key** — If the corresponding pub key at Hostinger (`cowork-apr2026-v2`) is still valid:
   - Generate fresh keypair: `ssh-keygen -t ed25519 -C "cowork-<YYYY-MM-DD>@claude" -f .claude/id_ed25519_cowork -N ""`
   - Print the new `.pub` to chat + ask user to add it on Hostinger → SSH Access. Then delete the old `cowork-apr2026-v2`.
3. **Once SSH works**, fetch all the prod-env secrets in one shot:
   ```bash
   ssh -i .claude/id_ed25519_cowork -p 65002 u692382124@212.85.28.206 \
     'PID=$(ps -fu u692382124 | grep -E "next-server" | head -1 | awk "{print \$2}"); \
      cat /proc/$PID/environ 2>/dev/null | tr "\0" "\n" | \
      grep -E "^(CRON_SECRET|RAZORPAY_|MYSQL_)"'
   ```
4. **Test account password** — ask the user to re-paste `Cognizant@2020` OR rotate it via the prod login page → "Forgot password?" flow (the user-side email inbox at Hostinger receives the reset link).

**Any future Claude session should:**
1. Read this `CLAUDE.md` first
2. Check if `.claude/secrets.env` exists → source it
3. If missing, follow §4b above
4. Read `docs/STATUS.md` for the latest state of the world

## 5. Known operational gotchas

- **503 after deploy** → hPanel → Resource Usage → **Stop running process** → app auto-restarts → 503 clears.
- **Stale-worker hold (`/api/health` reports an OLD commit even though deploy succeeded)** → SSH and `pkill -9 -u u692382124 -f "next-server\|server.js"` to force the runtime to respawn against the fresh `.next` build. Diagnose first: SSH to `~/domains/pdfcraftai.com/public_html/.builds/last-source` and `git log --oneline -1` — if THAT shows the latest SHA, the build pipeline is fine and the stuck runtime is the only problem. Don't bother with empty-commit nudges (those only help when auto-pull itself is jammed — much rarer than this case). Verified working 2026-04-28 on the #175 deploy.
- **Thread-cap cascade — DO NOT pkick repeatedly** (2026-04-28, #192 deploy): if you SSH-pkick once and the new workers don't come up cleanly, **STOP** — sending another pkill while LSAPI is mid-respawn pushes the account past Hostinger's plan-level thread cap and triggers `pthread_create: Resource temporarily unavailable` across every worker, which manifests as account-wide 503s. ONE pkick max per deploy cycle. If the first kick doesn't recover within 60s, switch to **hPanel → Resource Usage → Stop running process** (drains the failed-thread state via the platform's own restart machinery, which is gentler than SIGKILL). Diagnostic for the cascade: `tail ~/domains/pdfcraftai.com/nodejs/stderr.log` shows repeated `node[NNN]: pthread_create: Resource temporarily unavailable`. The thread cap is shared across the whole user account, so the per-user `ulimit -u` value (usually high, e.g. 1M) is misleading — actual limit is much lower at the cgroup level.
- **Do NOT push-force to main** — Hostinger's GitHub App treats it as a normal push and may redeploy mid-state.
- **Env var changes require "Save and redeploy"** in Hostinger → this restarts the runtime but doesn't pull new code; pushing to main pulls new code AND restarts.
- **Static `/public/*.wasm` files are served as `text/plain`** by the LiteSpeed/Passenger pipeline regardless of `next.config.mjs` `headers()` or `.htaccess` directives (`AddType` / `ForceType` / `<FilesMatch> + Header always set` were all tried). Browsers refuse `WebAssembly.compileStreaming` on the wrong MIME, so PDFium-backed tools silently fall back to slow ArrayBuffer init. Workaround: route through a Next.js API handler — see `app/api/pdfium-wasm/route.ts` which serves `/public/pdfium.wasm` with the correct `Content-Type: application/wasm`. Do NOT undo this by reverting `lib/pdf/library.ts` back to `wasmUrl: "/pdfium.wasm"`. Discovered 2026-04-30 during Phase 1 prod validation; full root-cause writeup in `docs/STATUS.md` PDFium-WASM finding.
- **Zombie next-server cleanup (2026-04-30 follow-up to thread-cap cascade)**: during the commit `7395e02` deploy, 10 stale `next-server` processes from earlier deploys had accumulated under one Passenger HelperAgent (PPID 2725344) and saturated the LVE thread limit (`uv_thread_create` assertion in `nodejs/stderr.log` — same family as the cascade above but caused by accumulated zombies, not by repeated pkicks). Recovery via SSH (use sparingly, treat as the LAST resort after one pkick + waiting): `ps -fu u692382124 | grep next-server | awk '{print $2}' | xargs -r kill -KILL && touch ~/domains/pdfcraftai.com/nodejs/tmp/restart.txt`. App typically recovers within 30s. Mass-kill is safe ONLY when there are no fresh in-flight requests — it WILL drop any user mid-upload. Prefer hPanel "Stop running process" when reachable.
- **Worst-case thread-cap recovery (2026-04-30, commit `2f51d72` deploy)**: if the cascade has saturated the cgroup so deeply that **even SSH bash cannot fork** (`bash: fork: retry: Resource temporarily unavailable`), STOP TRYING. Every reconnect attempt creates more pending forks that the cgroup is rejecting and prolongs the hang. The ONLY recovery from this state without hPanel access is to wait 5-10 minutes for the kernel to drain pending threads. Verified: commit `2f51d72` deploy went into 503 at ~09:42 UTC, SSH unreachable from ~09:45 onward, recovered automatically at ~10:12 UTC (~30 min total, ~7 min after I stopped poking). DO NOT add fresh ssh / pkick / curl loops in this window — those compound the cgroup pressure even though they look like they're "doing something."
- **Server `.htaccess` is the SOURCE OF TRUTH for production HTTP headers, NOT `next.config.mjs`** (verified 2026-05-02). The Hostinger LiteSpeed/Passenger path serves headers from `~/domains/pdfcraftai.com/public_html/.htaccess` which OVERRIDES the headers declared in `next.config.mjs` (`headers()` block). The `.htaccess` file lives ONLY on the server (NOT in the repo, NOT in the deploy source under `~/.builds/last-source/`). It was originally introduced 2026-04-30 to fix a LiteSpeed CSP-stripping bug ("LiteSpeed/Passenger path was stripping CSP down to the last directive"). Implication: edits to `next.config.mjs`'s CSP / Permissions-Policy / etc. **DO NOT take effect in production** — the .htaccess override silently wins. To change a production header, you MUST edit BOTH `next.config.mjs` (so the Next runtime fallback has the right value) AND the server's `.htaccess` (via SSH). Verified 2026-05-02 when commit `4cdbeb6` removed Paddle from `next.config.mjs` but live CSP still served Paddle origins; .htaccess sed-edit was needed to actually flush the change. Diagnostic: compare `curl -sI / | grep -i 'content-security-policy'` against the canonical CSP in `next.config.mjs` — any divergence = .htaccess drift. Future sessions: when modifying CSP, run a 2-step deploy (commit code change first, then SSH-edit .htaccess to match).

## 5a. Phase 2 standardization gotchas (2026-05-01)

- **`KNOWN_AI_LONGFORM_PENDING` is now empty** (cap = 0). Adding a NEW AI tool to `lib/tools.ts` REQUIRES shipping a longform entry in `lib/tool-longforms.ts` in the same commit. The CI guard `scripts/test-tool-content-coverage.mjs` will fail otherwise. To explicitly grandfather a new tool (rare; only when the longform is genuinely deferred to a later sprint), bump the cap in that script with rationale.
- **`KNOWN_BROKEN_RELATED_IDS` cap = 22** in `scripts/test-tool-id-references.mjs`. 22 unique broken tool-id references in `lib/seo-pages.ts` related[] arrays are grandfathered (Phase 3 cleanup). Adding a NEW invalid tool id to a related[] fails the build. To repair one: replace every reference site, then remove the id from the allowlist + lower the cap. The allowlist also rejects stale entries (ids fully repaired) to keep the cap meaningful.
- **AI tool runners use `ToolRunnerLongform` with `isAI={!tool.free}`** — see `app/tool/[id]/page.tsx`. Without that prop, AI tools render the (false) free-tool differentiators ("100% local processing", "no signup, no daily limit"). The `tool-runner-longform-ai-parity` guard catches this if the prop is dropped.
- **Auth callback preservation** lives in `lib/auth-callback.ts` (`sanitizeCallbackUrl()`). Used by:
  - `LoginForm.tsx` + `RegisterForm.tsx` (read `?callbackUrl=` from URL, propagate to Google OAuth + hidden form input for credentials)
  - `loginAction` + `registerAction` in `lib/auth-actions.ts` (read from formData, sanitize server-side as defense-in-depth)
  - 10 `/app/*` page-level redirects (preserve callback in `redirect("/login?callbackUrl=...")`)
  - The single `app/app/layout.tsx` redirect is intentionally exempt (defense-in-depth fallback only fires for unguarded NEW pages; documented inline)
  Adding a new `/app/*` page → MUST include `?callbackUrl=` in its auth redirect. CI guard `auth-callback-preservation` catches this.
- **`/tool/ai-chat` is a 308 redirect to `/chat-with-pdf`**, NOT a runner page. Chat is multi-turn and lives at `/app/chat` (history dashboard) + `/app/chat/[id]` (active session). The top-nav "Chat" link is auth-conditional via `buildNav(loggedIn)` in `components/nav/TopNav.tsx`: anon → `/chat-with-pdf` (marketing), logged-in → `/app/chat` (history dashboard).

## 6. Current integration status (as of 2026-05-02)

- **2026-05-02 EOD** — 32-commit cleanup arc spanning 5 phases: Phase 3 broken-related-id cleanup (cap 22 → 4), 4 new tools shipped (extract-contacts, extract-dates, ai-court-order, extract-attachments), **17 new SEO landings** for full catalog coverage (5 Tier 1 head-term + 7 Tier 3b mid-traffic + 6 Tier 4 audit-tool + 5 reclaimed from stale 308 redirects + 1 wrong-direction-redirect fix on /markdown-to-pdf + 1 wrong-tool fix on /pdf-to-png), 4 new CI guards (`ai-tool-preview`, `redirect-direction`, `download-helper-adoption`, `spelling-uk-in`), 30-tool migration to canonical `downloadBytes` helper (eliminated ~250 LOC of duplicated dance + auto-fixed 14 tools that skipped filename collision suffix), sitewide /tool/ai-chat hop-elimination sweep (5 CTAs + 1 homepage grid), AI-specific error-shapes documented in UI_COPY.md, British/Indian spelling pinned for -ising verbs. Aggregator: **4095/4095 across 63 suites** (up from 4013/59 yesterday — +82 assertions, +4 new suites). Live commit pending deploy queue. KNOWN_DEAD_REFS pruned 13 → 7 (remaining 7 all server-side rails — compress + 6 Office bidirectionals — deferred per user directive "concentrate on Client side and AI tools" until Paddle KYC unblocks the paid tier). Multiple stale-worker holds during the arc (zombie next-server cleanup via SSH pkick per CLAUDE.md §5; each recovered within 60s). **Final SEO landing coverage: 111/111 (100%).** Full breakdown in `docs/STATUS.md` 2026-05-02 EOD addendum.
- **Phase 2 AI standardization COMPLETE** (2026-05-01, commits `e5a9aa8..3d32d6e` — 12 commits this arc):
  - 39 AI tools backfilled with full longforms (ai-faq, ai-action-items, ai-mindmap, ai-blood-test, ai-jd-match, ai-paraphrase, ai-detector, ai-rewrite, ai-study-notes, ai-syllabus, ai-discharge, ai-blog, ai-readability, ai-newsletter, ai-video-script, ai-improve-writing, ai-proofread, ai-nda, ai-employment, ai-partnership-deed, ai-loan-bundle, ai-insurance, ai-research-paper, ai-salary-slip, ai-ats-resume, ai-condense, ai-expand, ai-tone-analyze, ai-citations, ai-sentiment, ai-bias, ai-entities, ai-social-thread, ai-semantic-search, ai-searchable-pdf, ai-chart-to-table, ai-table, ai-generate, ai-sign).
  - 13 new SEO landings closing AI acquisition gap (`/condense-pdf`, `/expand-pdf`, `/analyze-pdf-tone`, `/extract-pdf-citations`, `/pdf-sentiment-analysis`, `/inclusive-language-audit`, `/proofread-pdf`, `/pdf-to-newsletter`, `/pdf-to-video-script`, `/semantic-search-pdf`, `/extract-action-items`, `/generate-pdf-from-prompt`, `/ai-fill-pdf-form`).
  - Final scoreboard: 52/52 TOOL_INTROS / 51/52 TOOL_LONGFORMS (ai-chat correctly excluded — lives at `/app/chat`) / 52/52 SEO landings.
  - 5 new CI guards: `tool-runner-longform-ai-parity` / `auth-callback-preservation` / `tool-id-references` (with KNOWN_BROKEN_RELATED_IDS allowlist + cap=22 for Phase 3 cleanup) / shrinkage cap on KNOWN_AI_LONGFORM_PENDING stepped 39 → 0 / dashboard-v2 regex relaxed to coexist with auth-callback guard.
  - Aggregator: **4013/4013 across 59 suites in 6.4s** (up from 3404/54 at 2026-04-30 EOD).
- **Sitewide auth-callback fix** (2026-05-01, commit `471dc8b`): every layer of auth funnel previously hardcoded `/app/dashboard` as post-sign-in destination. Now preserved end-to-end:
  - `lib/auth-callback.ts` — `sanitizeCallbackUrl()` open-redirect-prevention sanitizer (rejects `//evil`, `/api/*`, `/login`, `/register`, > 512 chars).
  - `LoginForm.tsx` + `RegisterForm.tsx` read `?callbackUrl=` from URL, propagate to Google OAuth + hidden form input for credentials.
  - `loginAction` + `registerAction` read from formData, sanitize server-side as defense-in-depth.
  - 10 `/app/*` page-level redirects preserve callback. The single `app/app/layout.tsx` redirect is intentionally exempt (defense-in-depth fallback only fires for unguarded NEW pages; documented inline).
  - CI guard `auth-callback-preservation` (21 assertions) locks all 4 layers.
- Cloudflare proxy: ACTIVE
- Sitemap (`/sitemap.xml`): serving 200 — **but old submissions in GSC + Bing point at stale URLs; needs re-submission after latest redeploy**
- Google OAuth: env vars deployed, consent verified (branding page, 2026-04-19) — **end-to-end sign-in test still pending**
- Microsoft Clarity: committed + pushed in `36034eb` (2026-04-20); Hostinger redeploy in flight
- GA4: committed + pushed in `36034eb` (2026-04-20); Hostinger redeploy in flight
- **Payment rail**: Razorpay is the sole payment processor. Paddle (international MoR) was retired on 2026-05-01 (commit 92f965a) — adapter, webhook route, and dedicated test suite deleted; the registry/router/types/migrations all stripped of Paddle references. International payments rolling out separately when next gateway is approved; non-IN traffic currently routes to the Tier-2 "defer" surface (geo-waitlist signup).
- **Net Margin initiative — Phase A / Task #12 CLOSED** (2026-04-22, commit `a178f29`): per-user daily cost ceiling ($0.50/user/UTC-day default via `USER_DAILY_COST_MICROS_CAP`, per-user override via new `user_rate_limits` table) + op/provider kill switches via `AI_KILL_{PROVIDER|OP}` env vars. Shared `guardAiRoute()` wired into all 10 op routes BEFORE `spendCredits`. Migration 0009 applied pre-push (errno 150 FK repair: `user → users` to match Drizzle's pluralized NextAuth table). Read-only admin page at `/app/admin/kill-switches`.
- **Net Margin initiative — Phase A / Task #13 CLOSED** (2026-04-22, commit `e256d2b`): OpenAI Batch API adapter for non-urgent ops (`summarize` + `translate`) routing through `/v1/batches` at 50% discount / 24h SLA. Migration 0010 applied pre-push (new `batch_jobs` table: 20 cols, UNIQUE(`user_id`,`idempotency_key`), `(user_id, submitted_at)` + `(status, submitted_at)` indexes, FK to `files.id` for `output_file_id`). Two new routes: `POST /api/ai/batch/submit` (auth → `guardAiRoute` → spend full credits at submit → Files API JSONL upload + `POST /v1/batches` with `completion_window:"24h"` → persist `batch_jobs` row with `opPayload` capturing `spendIdempotencyKey` + `clientIdempotencyKey` + `chunkPlan` so finalize doesn't need the PDF) and `GET /api/ai/batch/[jobId]` (poll → on `completed` moderate+reassemble+txn-persist `files` + `ai_outputs`, status→`finalized`; on `{failed,expired,cancelled}` refund via original spend key). `BATCH_DISCOUNT_MULTIPLIER=0.5` in `computeCostMicros` routes the 50% savings to **infra margin, not user price**. `ai_outputs.meta` stamps `mode:"batch"` for admin segmentation. `npx tsc --noEmit` exit 0; pushed `2aad843..e256d2b`.
- **Net Margin initiative — Phase A / Task #14 CLOSED** (2026-04-22, commit `f02c5b3`): Phase A eval harness scaffold + per-op quality floor. Migration 0011 applied pre-push (new `ai_eval_runs` table: 15 cols + 3 indexes, `passed` 0|1 + `score_rubric` JSON + `overall_score` in bps matching `ai_daily_margin.margin_bps`, `run_batch_id` anchors one CLI invocation across rows). New `lib/ai/eval/` module split into `types.ts` / `rubric.ts` (deterministic checks — `outputNonEmpty`, `noPreamble`, `jsonShape`, `numericPreservation`, `piiScrub`, `languageMatch` — no LLM-judge in v1) / `golden-set.ts` (seeded fixtures per op with `thresholdBps`) / `runner.ts` (layers on `route(op,…)`, persists per-run + batch-aggregate rows, emits `eval.batch.finished` + per-op `eval.floor.alarm` when `overall_score < OP_QUALITY_FLOOR`). New CLI `scripts/run-ai-evals.mjs` (stdlib-only: static golden-set parse + dynamic `rubric.ts` import via `pathToFileURL`; flags: `--dry-run` / `--ops` / `--ids` / `--stub` / `--json`; live-plan mode prints forward-compatible `POST /api/admin/ai-evals/run` body for Phase B hand-off). New test harness `scripts/test-ai-evals.mjs` at 153/153 across 9 sections (types, rubric-individual, rubric-aggregate, golden-set, runner-integration, CLI-contract, DB-schema, batch-anchor, floor-alarm). Aggregator `run-all-tests.mjs` wired with `ai-evals` entry directly after `ai-router` (runner layers on `route(op,…)` — router export removal breaks both; placement gives correct debug signal). Full aggregator 1364/1364 passed; `tsc --noEmit` exit 0; pushed `383921c..f02c5b3`. **Phase A code-only (5/5) COMPLETE.** Phase B (credit_ledger expansion, Paddle webhooks, nightly reconciliation cron, admin margin page) gated on Paddle KYC verification (in progress, 3–7 day SLA).
- **Net Margin initiative — Phase B / Task #15 CLOSED** (2026-04-22, commit `1827ebf`): first Phase B item shipped — `credit_ledger` expanded with fee/tax/FX/net columns. Migration `0012_credit_ledger_financials.sql` applied pre-push to prod MariaDB via SSH HEREDOC pipe (same discipline as 0005-0011): 12 additive nullable columns — `gross_charge_micros bigint` / `billing_currency char(3)` / `provider varchar(32)` (app-layer enum `"paddle"|"razorpay"|"manual"|"refund_reversal"` — varchar preferred over mysqlEnum so adding Razorpay in Task #20 is a code change, not an `ALTER TABLE`) / `processor_fee_micros bigint` / `tax_collected_micros bigint` / `tax_treatment varchar(16)` (`"mor"` Paddle MoR absorbs / `"forward"` Razorpay collects we remit / `"rcm"` foreign-buyer reverse charge / `"none"`) / `tax_remittable_micros bigint` / `fx_rate_used decimal(18,8)` (precision exceeds IEEE-754 capacity past ~15 total digits — persisted + read as **string** via `String(fin.fxRateUsed)` guard, NEVER `parseFloat`/`Number()`) / `fx_slippage_micros bigint` / `net_revenue_micros bigint` (USD micros canonical for `/admin/margin` roll-ups against `ai_usage.cost_micros`) / `card_fingerprint varchar(64)` / `data_source varchar(16)` (`"webhook"` authoritative / `"backfill_api"` provider REST history / `"estimate"` synthetic — `/admin/margin` segments estimate rows separately to keep signal honest). Verified post-migration via `SHOW COLUMNS FROM credit_ledger` — 8 legacy + 12 new = 20 cols, all new NULLable with NULL default, metadata-only ALTER so zero downtime. Drizzle schema extended (`db/schema/app.ts` adds `decimal` to `mysql-core` imports + 12 typed fields between `idempotencyKey` and `createdAt` with inline docstrings enumerating the app-layer enum members). New exported type `LedgerFinancials` in `lib/payments/ledger.ts` with strict TS literal unions matching the app-layer enum semantics; `GrantCreditsInput` extended with optional `financials?: LedgerFinancials` (zero-breaking — existing callers for promo grants / refund debits / internal bookkeeping continue to work unchanged); `tx.insert().values()` spreads every field with `?? null` fallback; `fxRateUsed` special-cased through `String(fin.fxRateUsed)` for decimal(18,8) precision preservation. New test harness `scripts/test-credit-ledger-financials.mjs` (73 assertions / 5 sections A-E: A migration shape — ALTER TABLE target + no ADD INDEX/KEY/UNIQUE + no REFERENCES + per-column `ADD COLUMN` regex + no NOT NULL; B Drizzle pins — decimal imported + creditLedger block extracted + per-column helper/length/precision regex; C ledger.ts wiring — LedgerFinancials exported + financials? present + all 11 literal-union members present + fxRateUsed `String()` guard + no parseFloat/Number + per-column `?? null` fallback; D cross-file invariant — every column name present in all three layers catches the "column added to migration but left out of write path" refactor trap; E additive safety on comment-stripped SQL — exactly 12 ADD COLUMN + no DROP/MODIFY/CHANGE in executable SQL + rollback playbook preserved in comments). Suite summary line `credit-ledger-financials: ${pass} passed, ${fail} failed` matches aggregator regex exactly. Aggregator `run-all-tests.mjs` wired with `credit-ledger-financials` entry after `dev-hooks` (pure static-parse, no route imports, no live MySQL dependency, orthogonal to AI-cluster suites). Full aggregator at **1437/1437 passed**; `tsc --noEmit` exit 0; pushed `c622e3d..1827ebf`. **Phase B payments-side chain begins.**
- **Net Margin initiative — Phase B / Task #16 CLOSED** (2026-04-22, commit `411c9f6`): Paddle webhook handler populates the new credit_ledger financial columns from real `transaction.completed` + `adjustment.created` (action=refund) payloads. **No migration** (Task #15 already shipped the columns — this is pure write-path wiring). `lib/payments/types.ts` became the single source of truth for `LedgerFinancials` (moved from `ledger.ts`) to break the circular import cycle `paddle.ts → ledger.ts → types.ts → paddle.ts`; `ledger.ts` now re-exports `LedgerFinancials` for back-compat so no existing caller changes. `NormalizedPaymentEvent` discriminated union gains `financials?: LedgerFinancials` on `payment_captured` + `refund` variants. `lib/payments/adapters/paddle.ts` extended: `PaddleTransactionEntity.details.totals` now types `{total,subtotal,tax,fee,earnings}` + `PaddleTransactionEntity.payments[].{payment_method_id, method_details.card.last4}`; `PaddleAdjustmentEntity.totals` mirrors the transaction shape. **Four new helpers:** `paddleMinorToMicros` (cents → micros ×10,000 with `Math.round()` / `Number.isFinite` guard — assumes 2-decimal presentment currencies, which matches every Paddle-supported currency except JPY where Paddle already normalizes to "0" decimals upstream), `fingerprintPaymentMethod` (SHA256 hex prefix **16 chars / 64 bits** of `payment_method_id` — stable per card per customer, non-reversible, zero PAN exposure), `buildPaddleCapturedFinancials` (populates grossCharge / billingCurrency / provider=`paddle` / processorFee / taxCollected / taxTreatment=`mor` / **taxRemittableMicros=`0`** (MoR invariant — Paddle absorbs remittance, we never owe tax authorities on this rail) / netRevenue / cardFingerprint / dataSource=`webhook`; leaves `fxRateUsed` + `fxSlippageMicros` undefined — benchmark-rate comparison is **Task #17** scope), `buildPaddleRefundFinancials` (symmetric negative-signed via `neg()` closure; leaves `provider` **undefined** — adapter doesn't tag provenance, ledger does). `normalize()` attaches `financials: buildPaddleCapturedFinancials(txn)` on `payment_captured` + `financials: buildPaddleRefundFinancials(adj)` on `refund`. `lib/payments/ledger.ts` threads `event.financials` into BASE grant **only** — bonus grant deliberately carries NULL financials (extensive inline comment about the `/admin/margin` double-count trap: putting gross/fee/tax/net on both base + bonus would double-count revenue); `handleRefund` builds `refundFinancials = { ...(event.financials ?? {}), provider: "refund_reversal" }` — spread-then-override pattern so the provenance tag lands even when an adapter produces a refund event without financials, and so `/admin/margin` never classifies a refund row as "not yet categorized". Idempotency key scheme preserved unchanged (`${paymentId}:base` / `${paymentId}:bonus` / `${paymentId}:refund:${providerRefundRef}`). **New test harness** `scripts/test-paddle-webhook-financials.mjs` at **79/79 across 5 sections** (A: `types.ts` discriminated-union contract — `LedgerFinancials` definition + every field typed + `payment_captured`/`refund` variants expose `financials?` + circular-import guard verifying `types.ts` has NO runtime import of `ledger.ts`; B: `paddle.ts` captured branch — entity shape + TXN_TOTALS_FIELDS loop over `total/tax/fee/earnings` + `payments[].payment_method_id` + builder exported + Paddle-rail invariants + monetary fields consumed + `paddleMinorToMicros` used + `taxRemittableMicros=0` + SHA256 fingerprinter + `normalize` attaches financials; C: `paddle.ts` refund branch — entity shape + builder exported + `neg` helper + refund builder doesn't set `provider` but DOES set `taxTreatment`/`dataSource` + `normalize` attaches financials; D: `ledger.ts` call-sites — base grant threads `event.financials` + bonus grant does NOT + `handleRefund` override + refund grant threads `refundFinancials`; E: cross-file invariants — captured builder populates 10 fields + leaves fx fields undefined + refund builder symmetry + type-only imports don't reintroduce circular cycle). `scripts/test-credit-ledger-financials.mjs` updated (C1 regex now accepts either direct definition OR `export type {...} from "./types"` re-export, C3 split into C3a `types.ts` union contract + C3b `ledger.ts` `handleRefund` override, `TYPES_SRC` reads for C3a/C4/C5) — went from 73 → 74 passed with C3 split. `run-all-tests.mjs` wired new `paddle-webhook-financials` suite after `credit-ledger-financials`; **full aggregator now 1517/1517 across 15 suites (delta +80: +79 new harness + 1 from C3 split)**; `npx tsc --noEmit` exit 0; pushed `d1367e9..411c9f6`. **No deploy gotcha** — pure code change, no migration, no new env var.
- **Net Margin initiative — Phase B / Task #17 CLOSED** (2026-04-22, commit `ec63038`): net-margin "finishing touches" on `ai_daily_margin` — infra per-call amortization + refund reserve + breakage revenue. Migration `db/migrations/0013_ai_daily_margin_net_margin.sql` applied pre-push to prod MariaDB via SSH HEREDOC pipe (same discipline as 0005–0012); three additive nullable `bigint` columns: **`infra_cost_per_call_micros`** (amortized share of fixed monthly infra — Hostinger Node.js Web App + Cloudflare proxy + DB + auth — divided across prior day's total call count so each slice's share scales with how busy the fleet was; same-day call-count fallback handles brand-new days where the prior day has zero calls so the first-ever slice doesn't get infinity), **`refund_reserve_micros`** (3% of each slice's `revenue_micros_sum` via `REFUND_RESERVE_BPS` / default 300 bps; accrued whenever the rollup writes a slice so refunds never come out of cash-on-hand — chargebacks and goodwill refunds draw down the accrued reserve), **`breakage_revenue_micros`** (positive revenue with zero COGS recognized when a user's credit balance hasn't been touched for `BREAKAGE_RECOGNITION_MONTHS` / default 12 months — stored on a synthetic per-day slice `provider_id='system'`, `model='breakage'`, `operation='breakage'` riding the existing `UNIQUE(date, provider_id, model, operation)` for idempotent upsert-on-re-run without any special-casing). All three columns nullable — pre-migration rows stay NULL with intended semantic "we didn't measure these during Phase A"; `/admin/margin` treats NULL as zero when computing net margin so no backfill required. No new index — pure additive financial metrics never participate in uniqueness, aggregated daily across slices and served by existing `ai_daily_margin_date_idx` + `ai_daily_margin_date_green_idx`. `bigint` width same as `*_micros_sum` — high-volume day's share of infra or 3% reserve on a seven-figure-call day exceeds int32. `lib/ai/margin-rollup.ts` gained env-keyed constants via `parseIntEnv` with warn-on-misconfig: **`INFRA_MONTHLY_USD_MICROS`** default 15_000_000 µUSD ($15/mo = Hostinger Premium plan rough midpoint), **`REFUND_RESERVE_BPS`** default 300 (3%), **`BREAKAGE_RECOGNITION_MONTHS`** default 12. Two pure helpers: **`computeInfraCostPerCallMicros(priorDayCallCount, sameDayCallCount?)`** — `Math.floor((INFRA_MONTHLY_USD_MICROS / 30) / callCount)` with same-day fallback; **`computeRefundReserveMicros(revenueMicrosSum)`** — `Math.floor((revenueMicrosSum * REFUND_RESERVE_BPS) / 10_000)`. **Breakage query**: SUM(delta) per user from `credit_ledger`, cutoff via `setUTCMonth(cutoff.getUTCMonth() - BREAKAGE_RECOGNITION_MONTHS)`, filter `balance > 0 AND last_activity < cutoff`, collapsed to a single synthetic `system/breakage/breakage` slice upsert on the target date. **Green-streak invariant preserved**: breakage slice write gated on `aggRows.length > 0` — empty AI days still stop Task #22's green-streak walk (absent-day=not-green semantic untouched). Both helpers wrapped in non-fatal try/catch so a transient DB hiccup on infra/reserve/breakage computation never cascades to `margin_rollup_failed` 500. **New test harness** `scripts/test-net-margin-rollup.mjs` at **40/40 across 5 sections** (A: migration 0013 DDL contract — three columns exist, all `bigint`, all nullable, all on `ai_daily_margin`, no new index, no DROP/MODIFY; B: Drizzle schema parity with migration — bigint mode=number, notNull=false; C: public surface — constants exported at correct defaults, both helpers exported, `parseIntEnv` fallback behavior, `setUTCMonth` cutoff uses `BREAKAGE_RECOGNITION_MONTHS`; D: `runDailyRollup` wiring — helpers called with correct argument ordering, breakage gate ties to `aggRows.length`, try/catch wraps both sub-computations; E: cross-file invariants — migration/schema/library agree on column names + nullability, additive-only). `test-ai-margin-rollup.mjs` F1 aggregator-ordering regex bumped `{0,2000}` → `{0,10000}` char gap ceilings with inline Task #17 explainer comment (inserting net-margin-rollup's 34-line rationale block pushed the ai-margin-rollup→dev-hooks distance past the 2000-char ceiling; future suite additions will keep growing it; ordering invariant still enforced by regex anchoring + direction). `scripts/run-all-tests.mjs` SUITES gains `net-margin-rollup` entry between `ai-margin-rollup` and `admin-margin` with 34-line rationale on the Phase A surface dependency (migration 0013 extends `ai_daily_margin` from Task #22 — regression in Phase A surface typically breaks both harnesses; placement gives debug signal at right granularity). **Full aggregator now 1557/1557 across 16 suites in 2.0s**; `npx tsc --noEmit` exit 0. Pushed `2a3f68f..ec63038`. **Deploy gotcha:** migration 0013 NOT auto-applied — MUST be piped pre-push (same pattern as 0005–0012), otherwise the first nightly rollup after deploy throws `Unknown column 'infra_cost_per_call_micros'` and returns `margin_rollup_failed` 500. **Next: Task #18** (Phase B Admin dashboard v2 — 12 pages consuming the now-complete net-margin financial surface). GST registration runs in parallel as CA-dependent paperwork.

## 7. Files to ALWAYS consult

- `CLAUDE.md` (this file) — session bootstrap (credentials + infra)
- **`docs/STATUS.md` — live punch list: what's DONE, what's PENDING, who owns each. Read this IMMEDIATELY after CLAUDE.md at session start.**
- **`docs/TOOL_PATTERN.md` — canonical structure every new tool must follow. Read BEFORE shipping any new tool. The PDF Inspector saga (P0–P9) hardened this pattern; treat `/tool/page-count` and `/tool/pdf-inspector` as reference implementations.**
- **`docs/NEXT_SESSION.md` — handoff doc with item-by-item ranked priorities. Read for "what should I work on next" guidance.**
- `docs/UI_COPY.md` — UI copy style guide + canonical error strings (M14 / G1 deliverable)
- `docs/DEPLOYMENT_NOTES.md` — detailed env vars, integration status, recovery playbook
- `app/layout.tsx` — analytics / tracking scripts live here
- `auth.ts` / `auth.config.ts` — NextAuth v5 Google provider wiring
- **`scripts/run-all-tests.mjs` — aggregator entry. 38 commits in the 2026-04-30 auto-mode arc shipped 16 sub-second pre-flight CI guards across SEO (9), quality + security (6), and test infrastructure (1). Read the SUITES array comments to learn what each guard catches. Full inventory + arc summary in `docs/STATUS.md`.**

### 7a. Shared client-side infrastructure (M-series, 2026-04-29)

When wiring a new tool runner, prefer these shared modules over re-implementing inline:

| Module | Purpose | Used by |
|---|---|---|
| `lib/client/handoff.ts` | Window-scoped Blob registry for "Open in another tool" workflows | M9 |
| `lib/client/tool-suggestions.ts` | Curated `source toolId → target toolIds` map | M9 |
| `lib/client/csv.ts` | Canonical CSV writer (RFC 4180, BOM, CRLF) | M22 |
| `lib/client/download.ts` | Filename collision suffix + download helper | M3 |
| `lib/client/fetch-ai-with-retry.ts` | AI op fetch with backoff retry on 408/502/503/504 + TypeError | M20 |
| `lib/pdf/error-messages.ts` | Canonical user-facing error mapping | G1 |
| `components/tools/useHandoffConsumer.ts` | Mount hook to consume `?handoff=<key>` | M9 |
| `components/tools/useFileUrlConsumer.ts` | Mount hook to consume `?file=<url>` (same-origin only) | M10 |
| `components/tools/useScrollErrorIntoView.ts` | Scroll error into view on null→string | M16 |
| `components/tools/useFirstPagePreview.ts` | Page-1 PDFium render with M25 LRU cache | M18, M25 |
| `components/tools/useVirtualGrid.ts` | Window-scroll-driven DOM virtualization | G4, #192 |
| `components/tools/useRectEditor.ts` | Foundation hook for move/resize plumbing | G8 |
| `components/tools/HandoffSuggestions.tsx` | "Open this output in: [Tool]" panel | M9 |
| `components/tools/UploadedFilePreview.tsx` | Page-1 thumbnail for AI upload cards | M18 |
| `components/tools/PageEditorTool.tsx` | Shared base for visual editors | Tier 6 |
| `components/tools/PageGridTool.tsx` | Shared base for thumbnail-grid tools | Task #156 |
| `components/tools/PdfSimpleOpsTool.tsx` | Shared base for single-shot pdf-lib ops | G2 |
| `components/tools/PdfReadOpsTool.tsx` | Shared base for read-only inspector tools (slot-fill: parser + headline + renderBody + optional csvExport/jsonExport) | M21 |
| `public/pdfium-sw.js` | Single-purpose Service Worker — caches `/pdfium.wasm` only | M23 |
| `components/PdfiumServiceWorker.tsx` | Idle-callback SW registration helper | M23 |
| `components/tools/ToolRunner.tsx` | Per-tool code-split dispatcher — replaces 60+ static imports in `app/tool/[id]/page.tsx` with `next/dynamic({ ssr: false })`. Each tool ships as its own webpack chunk | M24 |

**CI guards** (under `scripts/test-*.mjs`) codify these patterns and fail the build on regressions:
- `test-objecturl-revocation.mjs` — every `createObjectURL` has a matching `revokeObjectURL`
- `test-csv-helper.mjs` — RFC-4180 escape/row/build invariants
- `test-page-editor-consumers.mjs` — multiPage discriminator + single-page edge cases + orientation invariants
- `test-tool-handoff.mjs` — suggestion map references valid ids; no self-loops; security guards in place
- `test-fetch-ai-retry.mjs` — every AI op route uses retry + has the file preview
- `test-first-page-preview-cache.mjs` — sample hash + LRU eviction order

When adding a new tool, run `npm test` to verify it doesn't regress these invariants.

## 8. Session hygiene

When you finish a meaningful piece of work:
1. Update `docs/STATUS.md` — move the item from Pending → Done with the date and verification evidence (command, commit SHA, screenshot).
2. If the work involved a deploy, bump the commit SHA in `docs/DEPLOYMENT_NOTES.md` §Production environment.
3. Commit these doc changes to the repo (`docs/STATUS.md` + `docs/DEPLOYMENT_NOTES.md` + `CLAUDE.md` are all tracked) so they survive sandbox wipes and fresh clones.

**NEVER commit `.claude/` contents** — that directory holds secrets and is gitignored. If `.gitignore` ever stops covering it, fix that BEFORE any other work.
