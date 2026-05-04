# Pricing & Telemetry Plan — Canonical Reference

_Retroactively assembled (2026-05-04) from session transcripts + STATUS.md + commit history. The plan was conversational across multiple chat sessions in late April / early May 2026; this doc is the source of truth for what was decided and what was shipped._

**Status:** SHIPPED. All 13 days + all 5 post-plan gaps closed. Live in production.
**Plan kickoff:** 2026-04-22.
**Code complete:** 2026-05-03.
**Production activation (env vars + cron):** 2026-05-04.

## 1. Background — why this plan existed

Going into the arc, the codebase had:
- Working AI tools with credit-based metering, but credit costs were hardcoded in tool component badges ("3 credits per doc") that leaked our supply chain and pricing math.
- A 25-credit signup grant with no expiry, no abuse defenses, and no path to convert free trials.
- No DPDP compliance for India operations.
- No pre-flight credit estimator — users committed to runs without knowing the cost.
- No admin tooling for credit grant/debit or abuse-signal review.

Going out, the goal was: **a defensible free-trial funnel** that's economically uneconomical for bots to abuse, transparent to legit users, compliant with DPDP, and instrumented enough that admin can spot problems before they breach the margin floor.

## 2. Locked decisions

Five major decisions were locked by the founder before implementation:

### Decision 1 — Auth surface: Path D (Google OAuth + email registration with full abuse stack)

Not Google-only. Founder concern: "I'm confident I'll lose users without email auth, ship both."

Cost: extra ~13h of implementation work to layer 7 abuse defenses on top of the email path that Google's verification already gives us for free on the OAuth path. Accepted as the cost of broader user coverage.

### Decision 2 — Free grant size + expiry: 5 credits, valid 7 days

Down from 25 credits / no expiry. Reduces per-account economic value to a bot from ~₹10 to ~₹2, while preserving the "try before you buy" UX promise for legit users.

### Decision 3 — Principle: hide the supply chain

Users see credits, not rupees per call. Users do NOT see provider/model names ("Anthropic Haiku" → just "AI"). Rupees only appear at /buy (the cash register). Admin sees everything; users see the minimum.

### Decision 4 — Principle: credits-only display

No per-call cost in rupees, no margin %, no chunking detail, no provider attribution. Removes a constant trust-erosion vector ("why does Claude cost 3 credits but my chat with Gemini costs 1?") that would force constant marketing apologetics.

### Decision 5 — Pre-flight estimator MUST equal live charge

The number the user sees before clicking Run MUST equal the number debited. No drift, no surprise multiplier discovery. This forced multiplier-aware route handlers to do the chunking math BEFORE spendCredits, not after.

## 3. The 13 plan days (with commit references)

Each day shipped as one or more commits. Full commit history is in `docs/STATUS.md`.

### Day 0 — Prep (no code commit)
SSH user-count probe (7 users at session start), SMTP credentials saved, Cloudflare Turnstile keys generated.

### Day 1 — Supply-chain scrub + credit-badge removal + marketing copy (`9f9c8fe`)
- 9 tool components stripped of "Provenance" footers leaking provider+model.
- Credit-number badges removed from tool titles ("Summarize PDF · 3 credits" → "Summarize PDF · AI" chip).
- Marketing copy sweep: "Purchased credits never expire" + dropped "few cents" rupee leak + dropped Anthropic/OpenAI naming across 30+ tool components.
- 2 new CI guards: `no-supply-chain-leaks` (281 files scanned) + `no-credit-number-hardcodes` (282 files scanned).
- Multiplier feature flag scaffold: `MULTIPLIER_PRICING_ENABLED` env var, default-on, Hostinger panel rollback path.

### Day 1.5a — Email verification + password reset SMTP + login rate limit (`15bd557`, `e1bc582`, `a0b50d9`)
- Phase A: `lib/auth/email-verification.ts` — token lifecycle (raw 32-byte hex, SHA-256 hashed in DB, 24h expiry, single-use), `sendVerificationEmail()`, /verify-email landing page.
- Phase B: password reset SMTP via nodemailer + Hostinger SMTP (`support@pdfcraftai.com`).
- Phase C: login rate limit — 5 failures per 15 min per (email_normalized, IP), 30 min lockout. Migration `0020_failed_login_attempts.sql`.
- Fix: nodemailer added as direct dep (Hostinger build couldn't resolve transitive).

### Day 1.5b — Bcrypt audit + password strength + no-enumeration (`f96800c`, `72ae160`)
- Bcrypt cost factor 10 → 12 (2026 baseline; ~150ms hash time).
- Password: min 10 chars + 3 of 4 character classes (lower/upper/digit/symbol).
- Removed user-enumeration leak: "An account with that email already exists" → generic "Couldn't create the account."
- bcrypt.compare audit confirmed constant-time.
- NextAuth v5 default cookie audit passed (Secure + HttpOnly + SameSite=Lax + 30d).
- Client-side password minLength bumped 8 → 10 to match server.

### Day 1.6 — DPDP Act 2023 compliance (`8dbfcbe`)
- New `GET /api/account/export` — full JSON dump of every user-attributable record (parallel queries, ai_outputs joined via files).
- New `POST /api/account/delete` — email-confirmation defense, hard-delete + cascade, audit log captures domain+id+ts only (no PII).
- New `docs/runbooks/data-breach.md` — DPDP §8(6) + GDPR Art. 33-34, 4-tier classification, hour-by-hour playbook, cross-border transfer note.
- Privacy Policy already covered DPDP §16/§9/§11 from earlier work.

### Day 1.7 — Multiplier-aware route refactor (`606e57b`)
- translate/redact/sign route handlers refactored to compute multiplier-aware cost BEFORE spendCredits.
- redact + sign peek pageCount via `PDFDocument.load`; translate moves text extraction before spend.
- Closes the gap where Day 2 estimator quoted size-aware costs but routes still charged flat.
- All gated behind `isMultiplierPricingEnabled()` for env-var rollback.

### Day 2 — Pre-flight credit estimator endpoint (`396a5c3`)
- `POST /api/ai/estimate` — pure function `lib/ai/estimate.ts:estimateCredits()`.
- Per-page multiplier for ocr/redact/sign, per-chunk for translate (`ceil(charCount / 10K)`), flat for chat/summarize/rewrite/table/compare/generate.
- Token-bucket rate limit: 30/user/min.
- Credits-only response (no multiplier leak).

### Day 2.5 — Estimator UI wired into AI tools (`7ad31a6`, `93cd85b`, plus Gap #3 batch)
- `<CreditEstimateBadge>` rendered under file picker in each AI tool component.
- 3 tools wired in initial pass (OCR, Redact, Sign).
- Remaining 6 wired as Gap #3 (`c635015`).
- 9/9 AI tools coverage achieved.

### Day 3 — User /app/usage page (referenced in earlier work)
- Per-user AI usage rollup (credits-only view).
- Two tables: per-operation rollup, daily spend timeline.
- Clamped 1..90 days. PII wall: userId from auth() only, never params.
- Explicitly hides cost_micros / margin / per-provider routing.

### Day 4 (partial) — Admin abuse-signals page (`3b866f1`, `346b2d0`, `3d64665`)
- `/admin/abuse-signals` — clusters users by IP /24 + fingerprint + email_normalized.
- `/admin/users/[id]` — per-user detail with abuse-signal panel (cluster sizes).
- `/admin/tools` index + `/admin/tools/[id]` — per-op unit economics dashboard.

### Day 5 — Abuse stack layers 1-3 (`08c62fe`)
- Migration `0018_users_signup_security.sql` — adds `signup_ip`, `device_fingerprint`, `email_normalized` columns + UNIQUE INDEX on email_normalized.
- Layer 1: disposable email blocklist (~250 domains).
- Layer 2: Gmail+alias + dot normalization (`raja+1@gmail.com` → `raja@gmail.com`).
- Layer 4 (partial): IP capture via Cloudflare cf-connecting-ip.

### Day 5.5 — Abuse stack layers 4-7 + credit expiry (`e56d8fb`, `59df3bf`, `a413a1a`, `31f7b5c`)
- Layer 4 (full): IP /24 (or /48 IPv6) bucket throttle with admin-review queue.
- Layer 5: device fingerprint — `lib/auth/fingerprint.ts` (canvas + WebGL UNMASKED_VENDOR/RENDERER + screen + tz + hardware → SHA-256 hex).
- Layer 6: 7-day signup grant expiry — migration `0019_credit_ledger_expiry.sql` adds `expires_at datetime(3)` + covering index. New cron `/api/cron/expire-grants` (CRON_SECRET-gated, idempotent per ledger row, debit clamped to current balance).
- Layer 7: Cloudflare Turnstile — `lib/auth/turnstile.ts` server-side `verifyTurnstileToken()`. Fail-open when `TURNSTILE_SECRET_KEY` env var unset.

### Day 6 prep + Day 6 — Atomic 25→5 credit grant flip (`4e77504`, `cd3116d`, `22fe29c`, `da4ccae`, `e9c6109`, `bbcfb1b`, `d484ca8`, `c61c14f`, `958cbc5`)
- Day 6 prep: `lib/payments/signup-bonus.ts:grantSignupBonus(userId)` — default 5 credits / 7-day TTL, idempotency key `signup_bonus:${userId}` (exactly-once across user lifetime, handles credentials → OAuth re-link).
- Day 6 wire-in: registerAction + auth.ts `events.signIn` both call grantSignupBonus.
- Day 6 marketing copy sweep: "25 credits" → "5 credits, valid 7 days" across landing pages.
- Day 6.5: `OutOfCreditsAlert` component for 402 conversion. Wired into 9 of 10 AI tools (variant wrappers covered by `c61c14f`).

## 4. The 5 post-plan gaps (audit-driven, 2026-05-03)

After the plan landed at gross level, an honest audit identified 5 code-side gaps. All closed.

### Gap #1 — Defer signup bonus to /verify-email (`c635015`)
The 5-credit grant was firing in `registerAction` for the credentials path — meaning a bot that beat upstream layers could collect free credits without proving email ownership. Moved to `/verify-email` after `consumeVerificationToken` succeeds. OAuth path unchanged (Google verifies email server-side). CI guard `abuse-prevention` G6 enforces the new event name.

### Gap #2 — Per-op signup-bonus cap (`4f3a4c7`)
The 5 credits were pooled across all ops — a bot could redeem all 5 on one high-value run (e.g. one OCR on a 5-page PDF). Shipped Option A from `docs/GAP2_DESIGN_OPTIONS.md`: per-op N=2 cap on signup_bonus credits. Feature-flagged via `BONUS_PER_OP_CAP_ENABLED`, default OFF. Activated in production 2026-05-04.

### Gap #3 — Estimator badge wired into 6 remaining AI tools (`c635015`)
Day 2.5 had wired only 3 tools. Extended to 9/9 (Summarize, Rewrite, Table, Compare, Generate, Translate added).

### Gap #4 — Personalized recap on OutOfCreditsAlert (`8afefa5`)
New `GET /api/account/recent-usage` endpoint returns last 7 days top-3 op spend. OutOfCreditsAlert renders "Last 7 days you used N credits across X · Y · Z." Reframes upsell from "you're out, pay" to "you've been getting value, top up to keep going." Plus rate limit at 60/user/min on the endpoint (`acb7695`).

### Gap #5 — Admin grant/debit actions on /admin/users/[id] (`8afefa5`)
New `lib/admin/user-actions.ts:adminGrantCredits` + `adminDebitCredits`. Both call `requireAdmin()` first, capped at 1000 credits per action, audit-trail email stamp, second-aligned idempotency key, debit clamps to current balance. Mounted via `components/admin/AdminUserActions.tsx` ABOVE the abuse-signal panel. Ban deferred — needs migration + middleware + DPDP notice email (~2h design task).

## 5. CI guards added across the arc

| Guard | Assertions | Purpose |
|---|---|---|
| `no-supply-chain-leaks` | various | Catches Provenance footer regressions |
| `no-credit-number-hardcodes` | various | Catches re-introduction of "3 credits" hardcodes |
| `estimate` | 31 | Per-op multiplier semantics |
| `auth-hardening` | 21 | bcrypt cost, password strength, no-enumeration |
| `dpdp-endpoints` | 34 | Export + delete endpoint contracts |
| `abuse-prevention` | 50 | Layers 1, 2, 4 logic + structured events |
| `signup-bonus` | 20 | Idempotency + flag-disabled no-op |
| `out-of-credits-alert` | 21 | Detector + parser + 9 tool wire-ins |
| `expire-grants` | 21 | Cron contract + idempotency + clamping |
| `turnstile` | 25 | Verify helper + fail-open |
| `fingerprint` | 25 | Canvas + WebGL + entropy collection |
| `login-rate-limit` | 31 | Failure record + lockout + reset |
| `gap4-gap5` | 58 | Recent-usage endpoint + admin actions + page mount |
| `per-op-bonus-cap` | 26 | Helper surface + spendCredits wire-in |

Aggregator final state: **4462 passed / 0 failed across 77 suites in ~7s.**

## 6. Production activation (user-action items, completed 2026-05-04)

### Hostinger panel env vars
| Var | Value | Purpose |
|---|---|---|
| `CRON_SECRET` | `55a29ca5...` (64 hex chars) | Gates the 3 cron endpoints |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `0x4AAAAAADH0w8NFtw_mwWPx` | Captcha widget on /register |
| `TURNSTILE_SECRET_KEY` | `0x4AAAAAADH0wxWtlmi0hAi8-8HB-zOCYK8` | Server-side captcha verify |
| `BONUS_PER_OP_CAP_ENABLED` | `true` | Activates Gap #2 per-op cap |
| `SIGNUP_GRANT_ENABLED` | `true` | Activates the 5-credit grant |

(Plus `MYSQL_PASSWORD`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, etc. from earlier work.)

### cron-job.org schedules
| Job | Schedule (UTC) | URL |
|---|---|---|
| `expire-grants` | `0 3 * * *` | `/api/cron/expire-grants?secret=<CRON_SECRET>` |
| `reconcile-payments` | `0 3 * * *` | `/api/cron/reconcile-payments?secret=<CRON_SECRET>` |
| `ai-margin-rollup` | `15 0 * * *` | `/api/cron/ai-margin-rollup?secret=<CRON_SECRET>` |

All three configured with timezone=UTC, failure auto-disable safety toggle ON, verified 200 with auth + 401 without.

### Verified live behavior (2026-05-04 02:35 UTC)
- `/api/health` returns commit `29009bdb7251`, `ok:true`
- `/register` HTML contains the Turnstile site key (widget will render)
- `expire-grants` returns `{examined:0, expired:0}` (no aged signups yet)
- `reconcile-payments` returns clean state vs Razorpay
- `ai-margin-rollup` captures real production data: **81.6% margin on Anthropic Haiku 4.5 summarize, well above the 65% floor.** Green streak: 1 day.

## 7. Resilience tally (operations during the arc)

- **8 zombie-next-server cascades** triggered by code-bearing deploys; all recovered
- **3 auto-pull jams** resolved via empty-commit nudges
- **Zero data loss, zero rolled-back commits**
- Two cascade-recovery paths validated:
  - hPanel "Stop running process" (safest when reachable)
  - "Wait 5–10 min for kernel to drain pending threads" (last-resort, validated when SSH mass-kill saturated cgroup with `bash: fork: retry`)

Pattern hypothesis (from cascade timing data): zombie cascades correlate with **rapid code-bearing deploys**, not deploy frequency. Doc-only and test-only commits deploy clean; code-bearing commits trigger cascades at high rate. Env-var-only redeploys observed cascade-free. Worth a ~30-min investigation in a future session — see `docs/NEXT_SESSION.md` §2.

## 8. What this plan deliberately did NOT do

To keep the arc tight, these were out of scope:

- **Tax/invoice handling** (GST for India, EU VAT). Tracked in `docs/PLAN_GAP_ANALYSIS.md` T2-G1 / T2-G2. Paddle MoR (when KYC clears) absorbs the EU VAT side; GST for Indian Razorpay flow remains future work.
- **Chargeback clawback on already-spent credits.** Tracked in `docs/PLAN_GAP_ANALYSIS.md` T2-G7. Lower priority while the per-account economic value to a bot is bounded by the 5-credit cap.
- **Prompt-injection defense in AI ops.** Tracked in `docs/PLAN_GAP_ANALYSIS.md` T3-G1. Separate workstream.
- **Phone OTP layer.** Founder explicitly deprioritized: "as of now we cannot bear it" (cost concern).
- **Ban affordance for admin.** Needs `users.banned_at` migration + sign-in middleware + DPDP notice email — ~2h design task vs ~30min for grant/debit; deferred.

## 9. Where to go next

See `docs/NEXT_SESSION.md` for the ranked handoff. Three classes of remaining work:

1. **Investigation:** cascade-pattern experiment, `capExceeded` flag → friendlier per-tool copy, per-op cap admin observability.
2. **External-vendor blocked:** Paddle KYC verification (in progress at vendor, 3-7 day SLA).
3. **Documentation polish:** none currently outstanding (this doc + OPS_RUNBOOK + CRON_JOBS + ABUSE_PREVENTION + GAP2_DESIGN_OPTIONS now cover the full surface).

## 10. Related docs (the canonical doc set this arc produced)

- **`docs/STATUS.md`** — running timeline, cascade history, decision rationale.
- **`docs/NEXT_SESSION.md`** — ranked handoff for next session.
- **`docs/OPS_RUNBOOK.md`** — incident decision flows.
- **`docs/CRON_JOBS.md`** — scheduled-endpoint registry.
- **`docs/ABUSE_PREVENTION.md`** — 8-layer reference.
- **`docs/GAP2_DESIGN_OPTIONS.md`** — Gap #2 design + activation.
- **`docs/runbooks/data-breach.md`** — DPDP §8(6) protocol.
- **`CLAUDE.md`** — bootstrap (credentials, deployment flow, recovery playbook).
- **`docs/PLAN_GAP_ANALYSIS.md`** — older 42-gap audit; out-of-scope items tracked there.
