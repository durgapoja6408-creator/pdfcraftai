# Abuse Prevention — 8-layer reference

_Consolidated reference for the layered defenses that protect the 5-credit signup grant from coordinated bot abuse. Replaces the scattered inline docstrings across `lib/auth/`, `lib/payments/`, `app/api/`, and `auth.ts`._

**Plan ref:** `docs/PRICING_AND_TELEMETRY_PLAN.md` §8 (layers 1-7), `docs/GAP2_DESIGN_OPTIONS.md` (layer 8).

## Threat model

The asset under attack: **the 5-credit signup grant**, valid 7 days, granted at `/verify-email`. Each free credit costs us roughly ₹0.40 in AI infrastructure spend at average op cost. A bot that successfully bypasses every layer can extract:
- Per account: 5 credits = ~₹2 of AI spend
- Per "campaign": as many accounts as the attacker can manufacture
- Sustained: ~₹2 × accounts/day × days

The defenses below are designed so that the **attacker's per-account cost** (in time, money, or compute) exceeds the **value extracted per account** (~₹2). Each layer multiplies the cost without single-point-of-failure assumptions — bypassing one doesn't bypass the whole stack.

## Defense stack overview

| # | Layer | Where it lives | Bot cost to bypass | Legit-user friction |
|---|---|---|---|---|
| 1 | Disposable email blocklist | `lib/auth/abuse-prevention.ts` | Real email or paid temp-mail (~$0.50/account) | Near-zero (~0.01% false-positive rate) |
| 2 | Gmail+alias / dot normalize | `lib/auth/abuse-prevention.ts` | Multiple distinct inboxes | None |
| 3 | Email verification gate (deferred grant) | `app/verify-email/page.tsx` | Inbox access required | One extra click, must check email |
| 4 | IP /24 throttle + admin review | `lib/auth/abuse-prevention.ts` + `/admin/abuse-signals` | Distinct /24 (CGNAT, residential proxies) | None until throttle threshold |
| 5 | Device fingerprint | `lib/auth/fingerprint.ts` | Distinct browser fingerprint per account | None (silent collection) |
| 6 | 7-day signup grant expiry | `lib/payments/signup-bonus.ts` + `app/api/cron/expire-grants` | Spend within 7 days OR lose the grant | None |
| 7 | Cloudflare Turnstile | `lib/auth/turnstile.ts` | Solve managed challenge per account | One transparent widget interaction |
| 8 | Per-op signup-bonus cap (Gap #2) | `lib/payments/per-op-bonus-cap.ts` (default OFF) | Spread credits across multiple ops per account | Quiet — most legit users won't hit it |

**Plus** session-level + endpoint-level rate limits:
- `/api/ai/estimate` — 30/user/min token bucket (pre-flight estimator).
- `/api/account/recent-usage` — 60/user/min token bucket (out-of-credits recap).
- `/api/auth/login` — 5 failures / 15 min / 30 min lockout per (email_normalized, IP).

## Per-layer detail

### Layer 1 — Disposable email blocklist

**What:** before the registration row is inserted, the email's domain is checked against a hardcoded list of ~250 known temp-mail providers (mailinator, guerrillamail, yopmail, etc.).

**Where:** `lib/auth/abuse-prevention.ts:isDisposableEmail()`, called from `lib/auth-actions.ts:registerAction` BEFORE any DB write.

**Bot cost to bypass:** $0.50–$5 per account for a paid temp-mail / real-mail provider, or running their own SMTP server (free but heavy ops cost). Cuts the cheapest abuse path entirely.

**Legit-user friction:** ~0.01% false-positive rate by design (we err on the side of the user — only providers with documented disposable behavior are listed). Honest users with edge-case providers (e.g. their employer happens to use a domain on the list) can contact support@pdfcraftai.com.

**Tuning:** the list lives in the helper file. Adding a domain is a one-line change + commit. No env var override (intentional — the list shouldn't be configurable from outside the codebase or it could be weaponized).

### Layer 2 — Gmail+alias + dot normalization

**What:** before checking for duplicate accounts, both the input email and the lookup are passed through `normalizeEmail()`, which collapses Gmail's `+suffix` and `.` aliasing. So `raja+1@gmail.com`, `raj.a@gmail.com`, and `raja@gmail.com` all resolve to the canonical `raja@gmail.com`.

**Where:** `lib/auth/abuse-prevention.ts:normalizeEmail()`. Stored in `users.email_normalized` with a `UNIQUE INDEX` (migration 0018) — DB-level enforcement is the backstop.

**Bot cost to bypass:** distinct inboxes per account. Trivial via temp-mail (Layer 1 catches), expensive via real email accounts.

**Legit-user friction:** none. Two real users with distinct emails will never collide on the normalized form.

**Coverage:** today only Gmail. Other providers (Outlook, iCloud) don't use the same alias semantics so don't need normalization. If we ever see abuse via, e.g., an Outlook+suffix pattern, extend the helper.

### Layer 3 — Email verification gate (deferred grant)

**What:** the 5-credit grant is NOT funded at registration. It's funded at `/verify-email` after `consumeVerificationToken()` succeeds. A bot that creates an account but never accesses the verification email gets 0 credits.

**Where:** `lib/auth-actions.ts:registerAction` no longer calls `grantSignupBonus`. The call moved to `app/verify-email/page.tsx` after token consume. OAuth path (Google) still grants on first sign-in via `auth.ts` `events.signIn` because Google has already verified the email server-side.

**Bot cost to bypass:** must have inbox access to the address used at signup. Combined with Layer 1, this means the bot needs a real (paid temp-mail or owned) inbox per account.

**Legit-user friction:** one extra step — user must check their email and click the link to fund their free credits. The verification page renders a "✨ N free credits added — valid until <date>" pill on success.

**Token specifics:** SHA-256 hashed in DB (raw token never persisted), 24h expiry, single-use (deleted on consume), idempotent grant key per userId.

### Layer 4 — IP /24 throttle + admin review

**What:** every signup records `users.signup_ip` (from Cloudflare's `cf-connecting-ip` header). The bucket key is the /24 prefix (`192.168.1.x` → `192.168.1`). At signup time, the system checks how many signups have come from the same bucket in a rolling window. If above the cap, the system logs `event:"ip_throttle_triggered"` and tags the signup as `queue_review`.

**Where:** `lib/auth/abuse-prevention.ts:ipBucket()` + `decideIpThrottle()`. Surface at `/admin/abuse-signals`.

**Bot cost to bypass:** distinct /24 (or /48 for IPv6) per account. Achievable via residential proxies (~$0.10–$1 per account depending on volume) but adds non-trivial operational cost.

**Legit-user friction:** none until the bucket fills up. Cap and window are env-overridable (`MAX_SIGNUPS_PER_BUCKET`, `BUCKET_WINDOW_DAYS`). College / co-working / corporate VPN users may share a /24 — for those, a higher cap is appropriate.

**Important:** the throttle does NOT block the signup. It only logs the event for admin review (and, post-Gap #1, the deferred-grant variant flows through `/verify-email` regardless). Admin can review `/admin/abuse-signals` and claw back via the new grant/debit form before or after the user verifies.

### Layer 5 — Device fingerprint

**What:** on the registration page, a hidden field is populated by `computeFingerprint()` which collects browser canvas signals + WebGL UNMASKED_VENDOR/RENDERER + screen dimensions + timezone + hardware capability flags, then SHA-256 hashes into a 64-char hex string. Stored in `users.device_fingerprint`.

**Where:** `lib/auth/fingerprint.ts` (client) + `app/register/page.tsx` (form). Stored via `users.device_fingerprint` (migration 0018).

**Bot cost to bypass:** distinct browser fingerprint per account. A naive headless-Chromium-with-defaults bot will have one fingerprint across 1000s of accounts; admin-cluster review at `/admin/abuse-signals` surfaces this clearly. Real evasion requires per-account browser-instance variance (different OS, different GPU vendor strings, different screen res, different fonts).

**Legit-user friction:** none — silent client-side collection.

**Coverage:** SSR + JavaScript-disabled clients won't get a fingerprint (field is empty string → stored as null). This is a tradeoff: requiring fingerprint would block legit no-JS users; not requiring it leaves a gap. Today we accept the gap because the other layers compensate.

### Layer 6 — 7-day signup grant expiry

**What:** every `signup_bonus` ledger row is written with `expires_at = NOW + 7 days`. The nightly cron `/api/cron/expire-grants` debits expired rows that haven't been spent. Net effect: a bot that signs up, gets credits, but doesn't redeem within 7 days loses the credits.

**Where:** `lib/payments/signup-bonus.ts` writes the expiry. `app/api/cron/expire-grants/route.ts` enforces it (idempotent per ledger row, clamped to current balance — never goes negative).

**Bot cost to bypass:** spend within 7 days. This makes "stockpile then bulk-redeem" attacks impossible — the attacker has to use the credits as fast as they're granted, which constrains scale.

**Legit-user friction:** none for users who use the product within a week; rare friction for users who sign up then forget. The marketing copy at `/pricing` is honest about this: "5 free credits, valid 7 days. Purchased credits never expire."

**Cron config:** see `docs/CRON_JOBS.md`. **CRITICAL:** if the cron stops firing, the expiry promise is silently broken and bots can hoard credits. Monitoring the cron is on the user-action checklist in `docs/NEXT_SESSION.md`.

### Layer 7 — Cloudflare Turnstile

**What:** the registration form embeds a Cloudflare Turnstile widget. Form submission includes a `cf-turnstile-response` token. Server-side `verifyTurnstileToken()` POSTs the token to Cloudflare's siteverify endpoint and rejects the submission if invalid.

**Where:** `lib/auth/turnstile.ts` (server) + `app/register/page.tsx` (client widget).

**Bot cost to bypass:** solving a managed challenge per account. Turnstile uses ML signals from across Cloudflare's network and chooses challenge difficulty dynamically. Bypass requires either:
- Real human solver (CAPTCHA farms: ~$0.001–$0.003 per solve), OR
- Browser automation that passes Turnstile's bot-detection (fingerprintable; constantly evolving)

**Legit-user friction:** transparent for ~95% of legit users (Turnstile shows a checkbox or invisible challenge); a small fraction sees a managed challenge. No explicit "select all squares with traffic lights" — Cloudflare positions Turnstile as friendlier than reCAPTCHA.

**Fail-open behavior:** if `TURNSTILE_SECRET_KEY` env var is unset, the verifier returns OK. This is intentional — it lets the form keep working through env-var rotation without locking everyone out.

### Layer 8 — Per-op signup-bonus cap (Gap #2 Option A, default OFF)

**What:** when activated, free-trial users (no purchases) can spend at most N=2 credits per AI op type from their signup-bonus pool. After hitting the cap on a given op, they see "Top up to keep using it." Topping up bypasses the cap entirely.

**Where:** `lib/payments/per-op-bonus-cap.ts` + `lib/ai/credits.ts:spendCredits` (call site). Activation: `BONUS_PER_OP_CAP_ENABLED=true` in Hostinger panel. See `docs/GAP2_DESIGN_OPTIONS.md`.

**Bot cost to bypass:** force the bot to spread credits across multiple distinct op types per account, which significantly limits the value extractable per account. Specifically prevents the "5 credits = 1 high-value OCR run on a 5-page PDF" attack pattern.

**Legit-user friction:** near-zero for users who try multiple tools. Friction shows up for users evaluating one specific tool by running it 3+ times — they hit the cap on the third try. Same UX as running out of pool credits, just earlier per-op.

**Tuning:** `BONUS_PER_OP_CAP=N` env var overrides the default cap. Higher N = lower friction + lower defense.

## Endpoint rate limits (orthogonal to the 8 layers)

These bound abuse of READ-mostly endpoints from authenticated users — different threat than the signup-grant abuse defenses above.

| Endpoint | Limit | Where | Bypass |
|---|---|---|---|
| `/api/ai/estimate` | 30/user/min | `app/api/ai/estimate/route.ts:consume()` | 429 response; no client retry storm path |
| `/api/account/recent-usage` | 60/user/min | `app/api/account/recent-usage/route.ts:consume()` | Silent client-side hide |
| Login attempts | 5 per (email, IP) / 15 min | `lib/auth/login-rate-limit.ts` | 30 min lockout; reset on successful login |

## Monitoring + ops surfaces

Today:
- `/admin/abuse-signals` — clusters by IP /24 + fingerprint + email_normalized. Use this to find coordinated signups (2+ accounts sharing a fingerprint or /24 are flagged).
- `/admin/users/[id]` — per-user view with abuse-signal panel + grant/debit form. Use this to manually claw back credits from a flagged account.
- Stdout structured logs: grep `nodejs/console.log` for `event:"ip_throttle_triggered"`, `event:"signup_bonus_deferred_throttled"`, `event:"turnstile_verify_failed"`, `event:"verify_email_grant_failed"`.

Future (deferred — see `docs/NEXT_SESSION.md` §2):
- Daily Slack digest of abuse-signal cluster sizes.
- Per-op cap admin observability (log emit when `checkPerOpBonusCap` returns capped:true with remaining < cost).

## Key invariants to preserve

When modifying the auth flow, **do not break these**:

1. **Layer 3 honesty.** The 5-credit grant must NOT fire in `registerAction` for the credentials path. It MUST fire at `/verify-email` after token consume. CI guard `abuse-prevention` G6 enforces this via the `signup_bonus_deferred_throttled` event check.

2. **Idempotency on grants.** `grantSignupBonus(userId)` must be idempotent on `signup_bonus:${userId}`. Calling it from BOTH `/verify-email` (credentials path) AND `auth.ts` `events.signIn` (OAuth path) must result in exactly one grant — this is what makes credentials → OAuth re-link safe.

3. **Disposable check before DB write.** `isDisposableEmail()` MUST be called BEFORE the `INSERT INTO users`. Otherwise a flagged email gets a row + we have to clean it up.

4. **Cap check before balance probe.** `checkPerOpBonusCap()` MUST run BEFORE `spendCredits` reads the balance. If we read balance first, free-trial users with pool credits will always pass the balance check and the cap will never fire. CI guard `per-op-bonus-cap` B6 enforces this.

5. **Turnstile fail-open intentional.** Don't change `verifyTurnstileToken()` to fail-closed when `TURNSTILE_SECRET_KEY` is unset. The fail-open behavior is what allows env-var rotation without taking down registration.

## Verification

```bash
# Run all 5 abuse-related CI guards.
node scripts/test-abuse-prevention.mjs
node scripts/test-signup-bonus.mjs
node scripts/test-turnstile.mjs
node scripts/test-fingerprint.mjs
node scripts/test-per-op-bonus-cap.mjs
```

All five should report `<name>: N passed, 0 failed`. Together they total ~150 assertions covering the 8-layer stack.

## Related docs

- `docs/PRICING_AND_TELEMETRY_PLAN.md` — original plan (§8 abuse stack design)
- `docs/GAP2_DESIGN_OPTIONS.md` — Gap #2 (Layer 8) design + activation
- `docs/runbooks/data-breach.md` — DPDP compliance protocol if any of this fails
- `docs/CRON_JOBS.md` — cron config for `/api/cron/expire-grants` (Layer 6)
- `docs/STATUS.md` — full timeline of plan + post-plan arc
- `CLAUDE.md` §3 — secret + env-var reference table
