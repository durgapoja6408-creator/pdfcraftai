# pdfcraftai.com — Deployment & Session Notes

_Last updated: 2026-04-22 (**Schema drift sweep — production DB cross-checked vs `db/migrations/` 0000–0016.** Pulled `SHOW TABLES` from prod via SSH + the app credential against MariaDB 11.8.6 (`u692382124_pdfcraftai`). 22 tables live; every column from migrations 0005–0016 verified present (`ai_usage.cost_micros bigint`, `cached_input_tokens`, `cache_creation_input_tokens`, `stop_reason`, `response_truncated`, `prompt_version`; `ai_daily_margin.cost_micros_sum` + `infra_cost_per_call_micros`; `credit_ledger.{billing_currency,fx_rate_used,fx_slippage_micros}`; `users.billing_*` ×7; `user_rate_limits` FK pluralized to `users(id)` with `ON DELETE CASCADE` — errno-150 repair from CLAUDE.md §6 confirmed live). Two gaps surfaced: **(a) FIXED** — migration `0004_geo_waitlist.sql` had never been applied. Backfilled in prod via `scp` of the migration file + `mysql --defaults-extra-file=...` from inside Hostinger using the app credential. Post-state `SHOW CREATE TABLE geo_waitlist` confirms `PRIMARY KEY (id)`, `UNIQUE KEY (email,country)`, `KEY country`, `KEY created_at`, `ENGINE=InnoDB`, `CHARSET=utf8mb4` — schema matches the migration byte-for-byte. Tier-2 deferred-region waitlist signups (EU27/EEA/CH/CN/RU/BY per `docs/GEO_LAUNCH_POLICY.md`) now have somewhere to land. **(b) OPEN — Task #28 backlog** — there is no Drizzle migration journal table in prod (no `__drizzle_migrations`, no `__journal`); migrations are being applied manually, which is exactly how 0004 sat unapplied for ~13 commits without anyone noticing. Two candidate fixes (preferred: bake `drizzle-kit migrate` into Hostinger deploy step; defensive: boot-time `lib/db/preflight.ts` schema-drift WARN). See STATUS.md → Pending → Task #28 for the full plan. **No code change, no commit, no deploy needed for the table backfill itself** — pure DDL applied directly against the prod DB via SSH. Previous: **Task #22 follow-up CLOSED — chat_turn cost_micros enrichment contract pinned.** Commit `35e3783` (test-only). Investigation traced the success-path enrichment chain `recordAiUsage({ costMicros: null, success: true }) → enrichment branch → computeCostMicros(model, …) → MODEL_RATE_TABLE prefix match` and confirmed all three chat-ladder defaults (`gpt-4o-mini` / `claude-haiku-4-5` / `gemini-2.5-flash`) resolve to a rate-card row, so chat_turn rows DO populate `cost_micros` at insert time today and the daily margin rollup green-streak signal is meaningful. Gap closed: new SECTION E in `scripts/test-ai-usage.mjs` (5 labels / 9 assertions: chat success+error pass `costMicros: null`, enrichment branch shape intact, all 3 defaults present in rate card, all 3 wired through `defaultModel: process.env.X ?? "…"` in registry). Aggregator: **2654 passed / 0 failed across 27 suites** (was 2645). Pure test addition — no migration, no env, no runtime change, no deploy gotcha. Pushed to main 2026-04-22; `/api/health` `commit` field will flip from `cb41e14…` → `35e3783…` on Hostinger auto-deploy. Previous: **Customer-blocking hotfix pair shipped post-Task #27 Phase E.** (a) Commit `cb41e14` — Razorpay checkout `publicConfig.keyId` → `key` rename. Order-creation server-side was fine (`POST /orders` returned a fresh order id with the correct `RAZORPAY_KEY_ID`); the failure was a property-name drift between `lib/payments/adapters/razorpay.ts:createOrder` (writing `keyId:`) and `components/billing/CheckoutButton.tsx:launchCheckout` (reading `.key`). `CheckoutSession.publicConfig: Record<string, string>` is loosely typed (the union must absorb Paddle's `clientToken/environment/sellerId` shape), so TypeScript couldn't catch it. Hosted modal threw *"Payment Failed because of a configuration error. Authentication key was missing during initialization"* on every Buy pack click. Fix renames the wire field to match what Razorpay's `checkout.js` SDK reads, while preserving the env chain (`process.env.RAZORPAY_KEY_ID` → `this.config.keyId` → `publicConfig.key`). New `scripts/test-razorpay-handoff.mjs` (7 static-regex assertions across 3 sections) pins the contract on both sides so the drift can't re-enter main. (b) Commit `13e1d29` — admin allowlist `normalizeAdminEmail()` Gmail-scoped folder. `/admin` was 404'ing for every real founder session because `requireAdmin()` → `notFound()` (anti-enumeration) and the founder-fallback was an exact-string `Set.has()` lookup. Five of six `users.email` rows in prod use `+1`/`+2`/`+5`/`+razaorpay` aliases of `rajasekarjavaee@gmail.com` (Google collapses `+suffix` at delivery; NextAuth treats each as a distinct identity row). Fix collapses `+suffix` before `@gmail.com`/`@googlemail.com` only (Outlook/Fastmail treat `+suffix` literally) and routes both `parseAdminEmails` + `isAdminEmail` through the helper. New SECTION E2 in `scripts/test-admin-margin.mjs` adds 5 pins. Aggregator post-change: **2645 passed / 0 failed across 27 suites**; `npx tsc --noEmit` exit 0. Both pushed to main 2026-04-22; Hostinger auto-deploy ~2–3 min — `/api/health` commit field flips from `2ab2dd3…` to `cb41e14…` on successful redeploy; if 503 persists >5 min apply CLAUDE.md §5 recovery (hPanel → Resource Usage → Stop running process). Previous: Task #23 Phase D PART 2 SHIPPED — buyer-side billing form + migration 0016 + `/admin/invoicing`; commit `2ab2dd3` live on prod per `/api/health` flip to `2ab2dd3cceea` with `db.ok:true`, `latencyMs:1`; migration `0016_users_billing_profile.sql` piped to Hostinger MySQL (`MIGRATION_OK`, `DESCRIBE users` confirms 8 new nullable `billing_*` columns live); aggregator **2633 passed / 0 failed across 26 suites**; `npx tsc --noEmit` exit 0; Task #23 `in_progress` → `completed`. Previous: Task #27 Phase E `1b33b21` (annual-prepay tier + INR pricing + promo codes, 2026-04-22); Task #26 Phase E `941dac6` — prompt version registry + A/B testing infra; commit `941dac6`; aggregator **2457 passed / 0 failed across 25 suites**; migration `0014_ai_usage_prompt_version.sql` adds `prompt_version varchar(32) NULL` + `experiment_id varchar(64) NULL` to `ai_usage` — must be piped to Hostinger MySQL BEFORE the code ships; new `lib/ai/prompts/registry.ts` (~530 lines) exports `PROMPT_REGISTRY` covering all 10 `AIOp` entries with `EXPERIMENTS = []` at ship so every op resolves to deterministic `"v1"` at 100%; `resolvePromptVersion(op, seed)` returns `{version, experimentId}` via djb2-hashed weighted bucketing when 2+ variants enabled; `RECORDING_ENABLED` kill switch nulls audit strings at call-sites; summarize wire-up threads `userId` + `promptVersion` + `experimentId` through success + error `recordAiUsage` call-sites plus batch submit/finalize (variant captured at submit time, read back with `?? null` legacy fallback); new `/admin/prompts` page backed by `lib/admin/phase-e-queries.ts`; new 79-assertion test harness `scripts/test-prompt-registry.mjs`; previous: Task #25 Phase D `9bcf0d8`)_

## Production environment

- **Host:** Hostinger (managed Next.js hosting, hPanel)
- **CDN / Proxy:** Cloudflare (proxy enabled — confirmed via `cf-ray`, `server: cloudflare`, `cf-cache-status: DYNAMIC`)
- **Domain:** https://pdfcraftai.com (apex + www redirect)
- **Current commit at last successful deploy:** `8f4b71c` (2026-06-02, full security/payments/SEO/a11y audit + hardening; health green, smoke 73/0). NOTE: live CSP is being reduced to `upgrade-insecure-requests` at the Hostinger/LiteSpeed serving layer (full CSP is in the build + next.config.mjs but not served) — see STATUS.md 2026-06-02 OPEN item.

## Hostinger environment variables (production)

Set in hPanel → App → Environment Variables:

| Key | Value |
|---|---|
| `MYSQL_URL` | (pre-existing — MySQL connection string) |
| `NEXTAUTH_SECRET` | (pre-existing) |
| `NEXTAUTH_URL` | `https://pdfcraftai.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://pdfcraftai.com` |
| `GOOGLE_CLIENT_ID` | `912612566698-n1857n8qa60n2sb55qag7sn2fi9bgias.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | (set; do not echo) |
| `ADMIN_EMAILS` | *(optional)* comma-separated lowercase email allowlist for `/api/admin/*` endpoints. If unset or empty the founder (`rajasekarjavaee@gmail.com`) is the sole admin — setting `ADMIN_EMAILS` lets ops add more without a code change. Whitespace is trimmed, casing is normalised, entries without `@` are discarded. |

After editing env vars, click **Save and redeploy**.

## Google OAuth

- **Google Cloud project:** `pdfcraftai`
- **Consent screen:** Published + Branding verified (2026-04-19)
- **OAuth client type:** Web application
- **Authorized JavaScript origins:**
  - `https://pdfcraftai.com`
  - `https://www.pdfcraftai.com`
- **Authorized redirect URIs:**
  - `https://pdfcraftai.com/api/auth/callback/google`
  - `https://www.pdfcraftai.com/api/auth/callback/google`
- **App logo uploaded:** `public/brand/pdfcraftai-mark-120.png` (120×120 chromatic monogram)
- **Branding URLs filled:** App home, Privacy, Terms — all pointing at `https://pdfcraftai.com/...`
- **Support email:** `rajasekarjavaee@gmail.com` (swap to `support@pdfcraftai.com` once that mailbox is confirmed deliverable)

## Hostinger operational gotchas (Task #20 family)

Hostinger's stack is Cloudflare → LiteSpeed (LSAPI) → Node.js (Next.js). Each layer has its own quirks. The rules below are battle-tested from real deploy incidents — pin them as durable knowledge, not session-specific noise.

### G1 — 503 after deploy (occasional)

**Symptom:** After clicking *Save and redeploy* OR after the GitHub App auto-pulls, the site returns HTTP 503 for 1–10 minutes.

**Fixes (in order of preference):**

A. **SSH respawn (fastest, no clicks):**
```bash
ssh -i .claude/id_ed25519_cowork -p 65002 -o IdentitiesOnly=yes u692382124@212.85.28.206 \
  'nohup bash -c "sleep 1 && pkill -9 -u u692382124 -f next-server" >/dev/null 2>&1 &'
```
The `nohup ... &` detach pattern is critical — if you kill `next-server` synchronously you also kill the worker hosting your SSH session, so the kill itself fails halfway through. Adding `sleep 1 &&` lets SSH disconnect first.

B. **hPanel:** Resource Usage → Stop running process → app auto-restarts → 503 clears.

C. **Push a no-op commit** to nudge the GitHub-App webhook (last resort if A and B don't work; useful when the auto-pull itself is jammed, see G2).

### G2 — GitHub App auto-pull jams

**Symptom:** You push to `main`, but `/api/health` keeps reporting the previous commit for >5 min after push. SSH check confirms `~/domains/pdfcraftai.com/nodejs/.next` mtime hasn't moved.

**Diagnosis sequence:**
1. Confirm the commit landed on GitHub (`git log origin/main --oneline -3`).
2. SSH and `stat ~/domains/pdfcraftai.com/nodejs/.next` — old mtime confirms no pull happened.
3. Hostinger Deploys page may show the commit as queued/stuck.

**Fix:** Push an empty commit (`git commit --allow-empty -m "chore: nudge"`) to re-trigger the webhook. This typically pulls within 2–3 min. If still stuck, hPanel manual deploy.

### G3 — Static OG image only — `next/og` fails at build

**Symptom:** Build fails at Hostinger with errors like:
```
Failed to load dynamic font for ✓. Status: 400
ERROR: Failed to build the application on /opengraph-image/route
```

**Root cause:** `next/og`'s `ImageResponse` triggers a Google Fonts fetch from the build sandbox. Hostinger's build network rejects that fetch with HTTP 400 — even when the OG content has no real fonts (gradient-text-clip rendering still triggers the lookup).

**Rule:** Ship a static `public/og.png` instead. Pre-render once with Pillow / sharp / similar. No runtime/build-time font dependency, same image on every cold start. See commit `28a629c` for the canonical pattern.

### G4 — LSAPI rejects POSTs with `Content-Type` but no body

**Symptom:** A POST request to your route handler returns `400` with `content-length: 0` (empty body). Node-side logs are silent — the request never reached your handler. Cloudflare passes through cleanly (`cf-ray` is set, `cf-cache-status: DYNAMIC`).

**Reproduction:**
```bash
# FAILS with 400, empty body — LSAPI rejects:
curl -X POST -H "Content-Type: application/json" https://pdfcraftai.com/api/admin/reconcile

# WORKS — LSAPI accepts:
curl -X POST -H "Content-Type: application/json" -d "{}" https://pdfcraftai.com/api/admin/reconcile
```

**Rule:** Any browser `fetch()` that sets `Content-Type: application/json` MUST also send a `body` (at minimum `body: "{}"`). Pin this as a comment in the call site so future hands know why. Discovered 2026-04-25 while shipping Task #91.

### G5 — `/api/health` commit-SHA reporting

`/api/health` reads `BUILD_COMMIT_SHA` baked in at build time by `next.config.mjs` (a pre-config `execSync("git rev-parse")` block). Falls back to `null` if `git` isn't available at build time. After deploy, you may see *multiple* commit SHAs round-robining for ~5–10 min as Hostinger's worker pool recycles old workers — wait for steady-state OR run G1 fix A to force-respawn all workers at once.

### G6 — Duplicate build under same UUID with `ERROR: package.json file not found`

**Symptom:** The Hostinger Deploys UI shows "Build failed" with the message `ERROR: package.json file not found`, but the live site is healthy and `/api/health` reports the latest commit. Investigation shows two build logs with the **same UUID** in `~/domains/pdfcraftai.com/public_html/.builds/logs/<uuid>/`:

```
2026-04-25_14-22-23_deploy.log   ← SUCCESS (the real deploy)
2026-04-25_14-43-23_deploy.log   ← "ERROR: package.json file not found" (retry)
```

**Root cause:** Hostinger's deploy system fired a duplicate build attempt — likely a webhook double-fire or a build-queue race. The second container tried to run `next build` against an empty workdir before the GitHub-App pull populated it, so package.json was missing.

**Why it's harmless:** The first build under that UUID already succeeded and is what's serving users. The second's failure didn't roll anything back; it just left a noisy log entry.

**Diagnosis sequence:**
1. Check `/api/health` — if commit matches your latest push, the real deploy succeeded.
2. SSH and `ls ~/domains/pdfcraftai.com/public_html/.builds/logs/<uuid>/` — count `*_deploy.log` files. Two with same UUID = G6.
3. Read both — the earlier one should be a clean `next build` success.

**Fix:** None required. The "Build failed" UI message is misleading in this case. Optionally push a tiny no-op commit to trigger a fresh single-build cycle and watch it complete cleanly.

**Confused with G2 (jammed auto-pull)?** G2 = no build attempt happened at all (live commit stale). G6 = two attempts happened, the second one transient-failed but the first succeeded (live commit fresh).

## Integration status (verified 2026-04-20)

| Integration | Status | Evidence |
|---|---|---|
| Cloudflare proxy | OK | `cf-ray`, `server: cloudflare` on every response |
| `robots.txt` | OK | Advertises `Sitemap: https://pdfcraftai.com/sitemap.xml` |
| Sitemap (`/sitemap.xml`) | OK | 39 URLs, application/xml, resubmitted to GSC + Bing 2026-04-19 |
| Google OAuth (plumbing) | OK | `/api/auth/providers` shows Google wired to correct callback |
| Google OAuth (sign-in smoke test) | Pending | Needs human click at `/login` |
| Microsoft Clarity | OK (live) | Tag `wcsbv536zv` present in rendered HTML, commit `36034eb` |
| Google Analytics (GA4) | OK (live) | Tag `G-2Y8PS0S93F` present in rendered HTML, commit `36034eb` |

## `app/layout.tsx` current state

Contains:
1. Theme-flash-prevention inline script (pre-existing)
2. GA4 snippet via `next/script` (id `ga4-init`, `afterInteractive`)
3. Microsoft Clarity snippet via `next/script` (id `ms-clarity-init`, `afterInteractive`)

IDs are defined as constants at the top of the file: `GA_MEASUREMENT_ID`, `CLARITY_PROJECT_ID`.

## Useful commands

```bash
# Check live headers (from sandbox)
curl -sI https://pdfcraftai.com | head -20

# Verify Clarity + GA4 present in live HTML
curl -s https://pdfcraftai.com | grep -oE '(gtag/js\?id=G-[A-Z0-9]+|clarity\.ms|ga4-init|ms-clarity-init)' | sort -u

# Check sitemap URL count
curl -s https://pdfcraftai.com/sitemap.xml | grep -c '<loc>'

# Auth plumbing
curl -s https://pdfcraftai.com/api/auth/providers
```
