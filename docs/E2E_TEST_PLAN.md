# pdfcraftai.com — End-to-End Test Plan

_Single source of truth for manual + automated QA coverage across every surface._
_Keep this file updated alongside `docs/STATUS.md` — when a test case ships a regression suite, link it here._

---

## Legend

**Priority**

- **P0** — payment, auth, data-loss, security. Must pass before any release.
- **P1** — user-visible flows the paying customer touches weekly.
- **P2** — admin surface, operational tooling.
- **P3** — edge cases, empty states, rarely-exercised paths.

**Status**

- **[AUTO]** — covered by `npm test` (test-*.mjs assertions) + harness at `scripts/run-all-tests.mjs`.
- **[MANUAL]** — exercised by hand in Chrome MCP / curl during this session (2026-04-24 test pass).
- **[SMOKE]** — covered by `node scripts/smoke-live.mjs` nightly live smoke.
- **[BACKLOG]** — not yet covered; tracked in `docs/STATUS.md` Pending section.

---

## 1. Authentication (P0)

### 1.1 Email/password signup
- **1.1.a** — Fresh email signs up, verifies, lands on `/app/dashboard`. **[MANUAL]**
- **1.1.b** — Duplicate email rejected with "email already in use" (not 500). **[BACKLOG]**
- **1.1.c** — Weak password rejected (<8 chars, no number, etc.). **[BACKLOG]**
- **1.1.d** — Email with `+suffix` normalizes correctly (e.g. `foo+bar@gmail.com` → `foo@gmail.com` for admin allowlist). **[AUTO]** (ai-usage suite)

### 1.2 Google OAuth sign-in
- **1.2.a** — New Google account creates a user row + session JWT. **[BACKLOG]**
- **1.2.b** — Existing user re-authenticates without duplicate account creation. **[MANUAL]**
- **1.2.c** — Google account with `+suffix` variant (`rajasekarjavaee+10@gmail.com`) resolves admin gate. **[MANUAL]** Verified 2026-04-24.
- **1.2.d** — Revoked Google grant bounces back to `/login` with error. **[BACKLOG]**

### 1.3 Password reset
- **1.3.a** — `/forgot-password` accepts valid email and sends reset link. **[BACKLOG]**
- **1.3.b** — Invalid email shows neutral "if that email exists" message (no enumeration). **[BACKLOG]**
- **1.3.c** — Reset link expires after 1 hour. **[BACKLOG]**
- **1.3.d** — Used reset link rejected on 2nd attempt. **[BACKLOG]**

### 1.4 Sign out
- **1.4.a** — Click sign-out → session cookie cleared, `/api/auth/session` returns `null`. **[MANUAL]** Verified 2026-04-24.
- **1.4.b** — Post-signout `/admin` → 404 (anti-enumeration cloak). **[MANUAL]** Verified 2026-04-24.
- **1.4.c** — Post-signout `/app/dashboard` → 307 to `/login?callbackUrl=...`. **[MANUAL]** Verified 2026-04-24.

### 1.5 Session persistence
- **1.5.a** — "Keep me signed in" checkbox extends session past browser restart. **[BACKLOG]**
- **1.5.b** — Session expires after `NEXTAUTH_MAX_AGE` (default 30d). **[BACKLOG]**
- **1.5.c** — Session still valid after Hostinger Node restart (JWT-backed, no DB session table). **[MANUAL]** (verified — see Apr 24 deploy cycle)

### 1.6 Admin gate
- **1.6.a** — Founder email (raw) → `/admin` renders admin UI. **[AUTO]** (admin-margin suite)
- **1.6.b** — Founder email with `+10`, `+foo` suffix → normalizes via `isAdminEmail()` → admin UI renders. **[MANUAL]** Verified 2026-04-24.
- **1.6.c** — Non-admin signed-in user → `/admin` returns 404 (not 403). **[AUTO]** + **[MANUAL]**
- **1.6.d** — Unauthenticated user → `/admin` returns 404 (not 401, not redirect — hides existence). **[AUTO]** + **[MANUAL]**

---

## 2. Public marketing pages (P1)

Coverage: every public URL must return HTTP 200 with expected security headers.

### 2.1 URL matrix (hit every public route)
**[SMOKE]** + **[MANUAL]** sweep of 40+ URLs verified 2026-04-24 — all 200 or intended 404/307:

- `/`, `/pricing`, `/blog`, `/help`, `/login`, `/register`, `/forgot-password`, `/api`
- `/about`, `/contact`, `/status`, `/careers`, `/changelog`
- `/privacy`, `/terms`, `/security`, `/gdpr`, `/dpa`, `/cookies`, `/refund-policy`, `/cancellation-policy`, `/shipping-policy`
- `/tools`, `/agent`, `/macros`, `/bulk`, `/studio`, `/launch-notify`
- `/compress-pdf`, `/merge-pdf`, `/pdf-to-word`, `/split-pdf`, `/translate-pdf`
- `/sitemap.xml`, `/robots.txt`

### 2.2 Security headers (P0 on `/`)
- **2.2.a** — HSTS: `max-age ≥ 31536000; includeSubDomains; preload`. **[MANUAL]**
- **2.2.b** — CSP: `frame-ancestors 'none'; object-src 'none'; base-uri 'self'`. **[MANUAL]**
- **2.2.c** — CSP allows Razorpay + Paddle origins in `script-src` / `frame-src` / `connect-src`. **[MANUAL]**
- **2.2.d** — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`. **[MANUAL]**
- **2.2.e** — Auth cookies use `__Host-` prefix, HttpOnly, Secure, SameSite=Lax. **[MANUAL]**

### 2.3 Legal + policy page freshness
- **2.3.a** — Every policy page has a "last updated" date within last 12 months. **[BACKLOG]**
- **2.3.b** — `/privacy` links `[DPA contact]` to a valid mailto. **[BACKLOG]**
- **2.3.c** — `/terms` references current legal entity name + address. **[BACKLOG]**

### 2.4 SEO + discovery
- **2.4.a** — `/sitemap.xml` lists every public route with `<lastmod>`. **[AUTO]** (smoke-live)
- **2.4.b** — `/robots.txt` allows search, disallows `/api/`, `/app/`, `/admin/`, `/_next/`. **[AUTO]**
- **2.4.c** — Every page has `<title>` + `<meta description>` + OpenGraph tags. **[BACKLOG]**
- **2.4.d** — Canonical URLs point at apex (not `www`). **[BACKLOG]**

---

## 3. Pricing + Checkout flows (P0)

### 3.1 Pricing page rendering
- **3.1.a** — 4 credit packs render: Starter / Creator / Pro / Studio. **[MANUAL]**
- **3.1.b** — Monthly Plus subscription card renders. **[MANUAL]**
- **3.1.c** — BYOK card renders with "+15% infra fee" copy. **[MANUAL]**
- **3.1.d** — Monthly / Annual toggle swaps prices. **[BACKLOG]**
- **3.1.e** — Annual variant shows "20% off" badge + "12× credits" copy. **[MANUAL]**
- **3.1.f** — Per-operation cost table shows Chat/Summarize/Translate/OCR/Rewrite pricing. **[MANUAL]**

### 3.2 Currency detection (geo routing)
- **3.2.a** — IN IP → INR prices (₹399, ₹1499, ₹4999, ₹12499). **[AUTO]** (geo-router suite)
- **3.2.b** — US IP → USD prices ($5, $19, $59, $149). **[AUTO]**
- **3.2.c** — EU27 / EEA / CH / CN / RU / BY IP → defer to `/launch-notify` (Tier-2). **[AUTO]** (geo-waitlist suite, 248 pass)
- **3.2.d** — Override via `?country=XX` query param (admin/support tool). **[BACKLOG]**

### 3.3 Promo code entry
- **3.3.a** — Valid code applies discount + shows "— Xx% off" banner. **[AUTO]** (promos suite, 93 pass)
- **3.3.b** — Unknown code rejected with "That promo code isn't recognized." **[AUTO]**
- **3.3.c** — Expired code rejected with "That promo code has expired." **[AUTO]**
- **3.3.d** — Wrong-currency code rejected. **[AUTO]**
- **3.3.e** — Wrong-pack code rejected. **[AUTO]**
- **3.3.f** — Wrong-variant (monthly-only on annual) code rejected. **[AUTO]**
- **3.3.g** — User-limit exhausted rejected. **[AUTO]**
- **3.3.h** — Global max-redemptions exhausted rejected. **[AUTO]**
- **3.3.i** — Code discount correctly reflected in Razorpay `amount_minor`. **[BACKLOG]**
- **3.3.j** — Bonus-credit promos grant extra credits on capture (separate ledger row). **[AUTO]** (ledger-financials)

### 3.4 Checkout initiation (Buy pack click)
- **3.4.a** — Click "Buy pack" on Starter → order created + Razorpay modal opens. **[MANUAL]** Verified 2026-04-24.
- **3.4.b** — Click on Creator → order creates with ₹1499 (monthly). **[MANUAL]**
- **3.4.c** — Click on Pro → order creates with ₹4999. **[MANUAL]** (historical capture confirms)
- **3.4.d** — Click on Studio → order creates with ₹12499. **[MANUAL]** (historical capture confirms)
- **3.4.e** — Click with Annual toggle → order creates with 12× monthly × 80% amount. **[BACKLOG]**
- **3.4.f** — Click while unauthenticated → redirect to `/login?callbackUrl=/pricing`. **[BACKLOG]**
- **3.4.g** — Modal shows correct merchant name "pdfcraft ai". **[MANUAL]**
- **3.4.h** — Razorpay `publicConfig.key` matches `process.env.RAZORPAY_KEY_ID`. **[AUTO]** (razorpay-handoff)

### 3.5 Checkout positive flow — Razorpay rail
- **3.5.a** — UPI QR scanned → captured webhook → status=captured, credits granted. **[MANUAL]** (historical captures exist)
- **3.5.b** — Card (test 4111) → 3DS → captured → credits granted. **[MANUAL]** (intermittent — see Task #22)
- **3.5.c** — Netbanking → simulated bank PASS → captured → credits. **[MANUAL]** Verified 2026-04-24 (₹399 Starter).
- **3.5.d** — Wallet (Mobikwik etc.) → captured → credits. **[BACKLOG]**
- **3.5.e** — Pay Later → captured → credits. **[BACKLOG]**
- **3.5.f** — Captured webhook idempotent (replay doesn't double-credit). **[AUTO]** (credit-ledger-financials)
- **3.5.g** — Captured row gets proper `invoice_number` for Indian GST compliance. **[AUTO]** (invoicing suite, 188 pass)
- **3.5.h** — GSTIN validation with Mod-36 checksum. **[AUTO]**
- **3.5.i** — Indian state → correct CGST/SGST split; inter-state → IGST. **[AUTO]**
- **3.5.j** — Export (Indian → foreign buyer) → 0% tax + LUT footer. **[AUTO]**

### 3.6 Checkout negative flow — Razorpay rail
- **3.6.a** — Card blocked by domain allowlist → payment_failed webhook → status=failed. **[MANUAL]** Reproduced 2026-04-24 (Task #22 open).
- **3.6.b** — Netbanking cancelled by user mid-flow → payment_failed (`payment_cancelled`) → status=failed. **[MANUAL]**
- **3.6.c** — Card declined (wrong OTP, insufficient funds, test card 4000...) → payment_failed → status=failed. **[BACKLOG]**
- **3.6.d** — User closes modal without attempt → row stays `pending`, UI ages out to "Expired" after 30 min. **[MANUAL]** + **[AUTO]** (billing-pending-ageout) Verified 2026-04-24.
- **3.6.e** — Razorpay order expires (~15 min TTL) with no payment attempt → row eventually reconciled to `expired` by cron. **[BACKLOG — Task #24]**
- **3.6.f** — Webhook with bad signature → 400, no DB mutation. **[AUTO]**
- **3.6.g** — Webhook duplicate (same `x-razorpay-event-id`) → 200 "duplicate", no double-credit. **[AUTO]** (webhook_events unique index)

### 3.7 Retry flow (critical edge case)
- **3.7.a** — Card fails → user retries on netbanking → SAME order_id, different pay_id → row promotes `failed → captured`. **[AUTO]** (razorpay-retry-promotion, 17 assertions) Verified 2026-04-24.
- **3.7.b** — Retry metadata captures losing pay_id in `priorAttempts[]`. **[AUTO]** + **[MANUAL]** (DB inspected).
- **3.7.c** — Late `payment_failed` after `payment_captured` does NOT demote captured row. **[AUTO]** (razorpay-retry-promotion E1/E2)
- **3.7.d** — Refunded row + late capture event → NOT re-captured (silently un-refunding is a financial bug). **[AUTO]** (retry-promotion B4)

### 3.8 Checkout positive flow — Paddle rail (INTERNATIONAL)
- **3.8.a** — US customer → Paddle transaction.completed → captured + credits. **[AUTO]** (paddle-webhook-financials, 79 pass)
- **3.8.b** — Paddle fees/tax decomposition populated on credit_ledger. **[AUTO]**
- **3.8.c** — Paddle MoR tax treatment flagged correctly. **[AUTO]**
- **3.8.d** — Paddle test-mode captures NOT in prod. **[AUTO]** (test-mode mode=sandbox flag)
- **3.8.e** — Live Paddle flow — BLOCKED on KYC completion (user action, not code). **[BACKLOG]**

### 3.9 Monthly Plus subscription
- **3.9.a** — Subscribe → monthly $9 charge → 200 credits granted. **[AUTO]** (partial — subscription_event in ledger)
- **3.9.b** — Monthly renewal webhook → 200 more credits (rollover up to 400). **[BACKLOG]**
- **3.9.c** — Cancel subscription → no more charges, credits stay. **[BACKLOG]**
- **3.9.d** — Pause/unpause. **[BACKLOG]**
- **3.9.e** — Failed renewal → dunning email + grace period. **[AUTO]** (dunning.ts scaffold, degradation-ux suite)

### 3.10 Refund flow
- **3.10.a** — Click Refund within 14-day window with unused credits → order refunded + credits debited. **[BACKLOG — manual UI test]**
- **3.10.b** — Refund of captured row → status=refunded, credit_ledger `delta = -granted_credits`. **[AUTO]** (paddle-webhook-financials D1)
- **3.10.c** — Partial refund → `status=partial_refund`, proportional credit debit. **[AUTO]**
- **3.10.d** — Refund reject if >14 days old. **[BACKLOG]**
- **3.10.e** — Refund reject if user already spent the credits down. **[BACKLOG]**
- **3.10.f** — Refund button hidden on non-captured rows. **[MANUAL]**

---

## 4. In-app signed-in surface (P1)

### 4.1 Dashboard (`/app/dashboard`)
- **4.1.a** — Shows current credit balance. **[MANUAL]**
- **4.1.b** — Shows last 7d / last 30d call count. **[MANUAL]**
- **4.1.c** — Recent activity list (5 most recent files). **[MANUAL]**
- **4.1.d** — Empty state when user has no files. **[BACKLOG]**
- **4.1.e** — "Drop a PDF" affordance links to `/tools` or `/app/files`. **[MANUAL]**

### 4.2 Files (`/app/files`)
- **4.2.a** — List user's uploaded files + results. **[MANUAL]**
- **4.2.b** — Upload a PDF → appears in list. **[BACKLOG]**
- **4.2.c** — Download a file. **[BACKLOG]**
- **4.2.d** — Delete a file (with confirmation). **[BACKLOG]**
- **4.2.e** — 60-min auto-delete policy applied. **[BACKLOG]**
- **4.2.f** — Other users' files NOT visible. **[AUTO]** (user-dashboard-v2, via userId scoping)

### 4.3 Chat (`/app/chat`)
- **4.3.a** — List existing chat sessions. **[MANUAL]**
- **4.3.b** — Click "New chat" → new session row created. **[BACKLOG]**
- **4.3.c** — Send chat turn → 1 credit debited + `ai_usage` row + `chat_messages` row. **[MANUAL]** + **[AUTO]** (ai-usage) Verified 2026-04-24.
- **4.3.d** — Streamed SSE response renders token-by-token. **[BACKLOG]**
- **4.3.e** — Attach PDF → grounded answer with page citations. **[BACKLOG]**
- **4.3.f** — Chat history limited to 40 turns (HISTORY_WINDOW). **[AUTO]** (chat-context-cap)
- **4.3.g** — Archive chat. **[BACKLOG]**
- **4.3.h** — Delete chat. **[BACKLOG]**
- **4.3.i** — Other user's chat_session_id → 404 on direct URL. **[AUTO]** (ai-router ownership)

### 4.4 Usage (`/app/usage`)
- **4.4.a** — Shows per-operation breakdown (chat / summarize / …). **[MANUAL]**
- **4.4.b** — Time window selector (7d / 30d / 90d). **[BACKLOG]**
- **4.4.c** — Charts render without JS errors. **[BACKLOG]**

### 4.5 Billing (`/app/billing`)
- **4.5.a** — Current balance display. **[MANUAL]**
- **4.5.b** — Recent payments — last 20 rows. **[MANUAL]**
- **4.5.c** — Status labels: Pending / Paid / Failed / Expired / Refunded. **[MANUAL]** Verified 2026-04-24.
- **4.5.d** — Pending rows > 30 min → "Expired" muted. **[AUTO]** (billing-pending-ageout) Verified live.
- **4.5.e** — Refund button on eligible captured rows (14d, unused credits). **[MANUAL]**
- **4.5.f** — "Top up credits" button → `/pricing`. **[MANUAL]**
- **4.5.g** — Banner "Payment received — waiting on webhook" after redirect. **[MANUAL]**

### 4.6 Receipts (`/app/receipts`)
- **4.6.a** — Each captured row has "Download PDF" link. **[AUTO]** (invoicing — wiring pin)
- **4.6.b** — PDF downloads with Indian GST invoice (if INR + Indian buyer). **[AUTO]**
- **4.6.c** — Invoice number monotonic in `INV-YYYY-NNNNN` format, FY-aware. **[AUTO]** (deriveInvoiceNumber)
- **4.6.d** — Receipts URL scoped by userId — 404 on mismatch. **[AUTO]** (invoice route authz)

### 4.7 Plan (`/app/plan`)
- **4.7.a** — Shows active subscription (if any) + next renewal date. **[BACKLOG]**
- **4.7.b** — Pause / resume / cancel actions. **[BACKLOG]**

### 4.8 Credits (`/app/credits`)
- **4.8.a** — Full ledger history with delta/reason. **[BACKLOG]**
- **4.8.b** — Filter by reason (purchase / ai_chat_turn / ai_summarize / refund / bonus). **[BACKLOG]**
- **4.8.c** — CSV export. **[BACKLOG]**

### 4.9 Settings (`/app/settings`)
- **4.9.a** — Update display name. **[BACKLOG]**
- **4.9.b** — Change password (with current password check). **[BACKLOG]**
- **4.9.c** — Delete account (with confirmation + 30d grace). **[BACKLOG]**
- **4.9.d** — Export data (GDPR). **[BACKLOG]**
- **4.9.e** — Update billing address + GSTIN. **[AUTO]** (invoicing — seller surface)

### 4.10 API Keys (`/app/api-keys`)
- **4.10.a** — Create a key → shown once, never again. **[BACKLOG]**
- **4.10.b** — Revoke a key. **[BACKLOG]**
- **4.10.c** — Key usage attributed to user in `ai_usage`. **[BACKLOG]**

---

## 5. AI operations (P0)

For each of the 10 ops: auth-gated, rate-limited, idempotent, metered.

### 5.1 Per-op happy path (× 10)
- **5.1.a** — **Chat** (`/api/ai/chat`): multipart POST → SSE stream → assistant message persisted. **[MANUAL]** Verified 2026-04-24.
- **5.1.b** — **Summarize** (`/api/ai/summarize`): PDF in → summary out → 3 credits debited. **[MANUAL]** (historical)
- **5.1.c** — **Translate** (`/api/ai/translate`): PDF + target lang → translated doc → 5 credits. **[BACKLOG]**
- **5.1.d** — **OCR** (`/api/ai/ocr`): scanned PDF → searchable text → ~2 credits/page. **[BACKLOG]**
- **5.1.e** — **Compare** (`/api/ai/compare`): 2 PDFs → diff output. **[BACKLOG]**
- **5.1.f** — **Generate** (`/api/ai/generate`): prompt + template → new document. **[BACKLOG]**
- **5.1.g** — **Sign** (`/api/ai/sign`): PDF + signature placement → signed PDF. **[BACKLOG]**
- **5.1.h** — **Rewrite** (`/api/ai/rewrite`): PDF + style → rewritten. **[BACKLOG]**
- **5.1.i** — **Table** (`/api/ai/table`): PDF → structured table extraction. **[BACKLOG]**
- **5.1.j** — **Redact** (`/api/ai/redact`): PDF + patterns → redacted. **[BACKLOG]**

### 5.2 Auth gates (× 11 routes including batch)
- **5.2.a** — POST unauthenticated → 401 `not_authenticated`. **[MANUAL]** All 10 ops + batch/submit verified 2026-04-24.
- **5.2.b** — Valid session → passes gate. **[AUTO]** (ai-router)
- **5.2.c** — Session from revoked user → 401. **[BACKLOG]**

### 5.3 Metering invariants
- **5.3.a** — Every successful call writes `ai_usage` row with `cost_micros ≥ 0`. **[AUTO]** (ai-usage, 139 pass) + **[MANUAL]** Verified 2026-04-24.
- **5.3.b** — `cost_micros` = provider billed µUSD; `credits_spent` = pricing markup. **[AUTO]** (ai-margin-rollup)
- **5.3.c** — `input_tokens` + `output_tokens` + `latency_ms` + `stop_reason` populated. **[AUTO]** + **[MANUAL]**
- **5.3.d** — `prompt_version` set for Anthropic models. **[AUTO]** (prompt-registry)
- **5.3.e** — `cached_input_tokens` + `cache_creation_input_tokens` set on prompt-caching paths. **[AUTO]**

### 5.4 Credit ledger invariants
- **5.4.a** — Every AI op writes matching `credit_ledger` row with `delta < 0`. **[AUTO]** + **[MANUAL]** Verified 2026-04-24.
- **5.4.b** — `idempotency_key` prevents double-debit on replay. **[AUTO]** (razorpay-retry-promotion F1)
- **5.4.c** — Spend happens BEFORE AI call (fail-closed: insufficient balance → 402, no AI call). **[AUTO]** (route-guards)

### 5.5 Rate limits
- **5.5.a** — Per-user daily cost cap ($0.50 default via `USER_DAILY_COST_MICROS_CAP`) hit → 429. **[AUTO]** (ai-router + guardAiRoute)
- **5.5.b** — Per-user override in `user_rate_limits` table takes precedence. **[AUTO]**
- **5.5.c** — `AI_KILL_PROVIDER=openai` → all OpenAI ops 503. **[AUTO]**
- **5.5.d** — `AI_KILL_OP=chat` → chat returns 503 across all providers. **[AUTO]**
- **5.5.e** — Kill switches read at request time (hot toggle without deploy). **[AUTO]**

### 5.6 Router / fallback
- **5.6.a** — Primary provider errors → router tries next provider in ladder. **[AUTO]** (ai-router)
- **5.6.b** — All providers fail → 503 with generic error (no provider leak). **[AUTO]**
- **5.6.c** — Dual-rail routing (summarize: anthropic primary, openai secondary). **[AUTO]** (dual-rail-routing)
- **5.6.d** — Stop reason `max_tokens` truncates cleanly with `response_truncated=1`. **[AUTO]** (ai-usage)

### 5.7 Output safety
- **5.7.a** — Moderation catches unsafe outputs. **[AUTO]** (output-moderation, 126 pass)
- **5.7.b** — Prompt injection attempts blocked. **[AUTO]** (prompt-safety, 132 pass)
- **5.7.c** — Untrusted PDF text wrapped in `<user_content>` boundary. **[AUTO]**

### 5.8 Input validation
- **5.8.a** — PDF > 25 MB rejected with 413. **[BACKLOG]**
- **5.8.b** — Non-PDF file (e.g. .exe renamed) rejected. **[BACKLOG]**
- **5.8.c** — Encrypted PDF without password → 400 with clear error. **[BACKLOG]**
- **5.8.d** — Empty PDF → 400. **[BACKLOG]**
- **5.8.e** — Input tokens > `OP_MAX_INPUT_TOKENS[op]` → 413. **[AUTO]** (ai-usage)

### 5.9 OpenAI Batch API (Task #13 — deferred)
- **5.9.a** — Submit batch → `batch_jobs` row created, Azure job id returned. **[BACKLOG]**
- **5.9.b** — Poll status → row updated. **[BACKLOG]**
- **5.9.c** — Completed batch → credits debited at 50% discount. **[BACKLOG]**

---

## 6. Free client-side (WASM) tools (P1)

All 8 run in the browser; zero server cost.

- **6.1** — Merge PDF: multiple PDFs → single. **[BACKLOG]**
- **6.2** — Split PDF: single → multiple. **[BACKLOG]**
- **6.3** — Compress PDF: size reduction preserves fidelity. **[BACKLOG]**
- **6.4** — PDF to Word / Excel / PPT: via `/api/tools/pdf-to-office`. **[BACKLOG]**
- **6.5** — Rotate pages. **[BACKLOG]**
- **6.6** — Add watermark. **[BACKLOG]**
- **6.7** — Convert (server-side for non-WASM). **[BACKLOG]**
- **6.8** — Bulk mode (up to 500 PDFs → zip). **[BACKLOG]**

For each: page loads, upload affordance visible, no CSP violations on load. **[MANUAL]** (page loads verified 2026-04-24, upload flow backlog).

---

## 7. Admin surface (P2)

All 23 `/admin/*` pages verified render ADMIN-UI for admin gate-pass, 404 for non-admin. **[MANUAL]** + **[AUTO]** (admin-phase-c, admin-phase-d, admin-dashboard). Detail below:

### 7.1 Money
- **7.1.a** — `/admin` Overview: Net revenue, AI cost, Infra, Margin, Signups, Call volume (30d). **[MANUAL]**
- **7.1.b** — `/admin/revenue`: breakdown by pack/currency/period. **[AUTO]**
- **7.1.c** — `/admin/costs`: cost waterfall (AI + infra + reserve). **[AUTO]**
- **7.1.d** — `/admin/margin`: margin history chart; green-days calculation. **[AUTO]**
- **7.1.e** — `/admin/transactions`: paginated list of all payments. **[MANUAL]**
- **7.1.f** — `/admin/credits`: credit-ledger audit. **[AUTO]**
- **7.1.g** — `/admin/refunds`: refunded rows + initiator. **[AUTO]**
- **7.1.h** — `/admin/chargebacks`: provider disputes. **[AUTO]**
- **7.1.i** — `/admin/fx`: FX rates + slippage. **[AUTO]**
- **7.1.j** — `/admin/tax`: tax breakdown + CSV export (P1 for compliance). **[AUTO]** (invoicing)
- **7.1.k** — `/admin/invoicing`: invoice-run history. **[AUTO]**

### 7.2 Pricing
- **7.2.a** — `/admin/plans`: pack config. **[MANUAL]**
- **7.2.b** — `/admin/promos`: create / edit / revoke. **[AUTO]** (promos, 93 pass)

### 7.3 Operations
- **7.3.a** — `/admin/ops`: operation-health table with green-day %. **[AUTO]** (admin-phase-c)
- **7.3.b** — `/admin/providers`: provider-health (Anthropic / OpenAI / Gemini). **[AUTO]**
- **7.3.c** — `/admin/alarms`: active alerts + history. **[AUTO]**
- **7.3.d** — `/admin/users`: user P&L by tenant. **[AUTO]** (admin-phase-d)
- **7.3.e** — `/admin/logs`: error / warn feed. **[MANUAL]**
- **7.3.f** — `/admin/compliance`: SOC2-ish audit log. **[AUTO]** (compliance, 110 pass)

### 7.4 Trust
- **7.4.a** — `/admin/fraud`: suspicious-activity flags. **[BACKLOG]**
- **7.4.b** — `/admin/rate-limits`: per-user override management. **[MANUAL]**
- **7.4.c** — `/admin/router`: AI routing-decision inspector. **[AUTO]**

### 7.5 Infrastructure
- **7.5.a** — `/admin/deploy`: last commit, uptimeSec, db latency. **[MANUAL]**
- **7.5.b** — `/admin/prompts`: prompt registry + version history. **[AUTO]** (prompt-registry, 79 pass)

### 7.6 Non-admin user
- **7.6.a** — `/app/admin/kill-switches` + `/app/admin/margin`: user-scope admin surfaces. **[MANUAL]**

---

## 8. API endpoints (P0 for auth + webhooks, P2 for introspection)

### 8.1 Health + introspection
- **8.1.a** — `GET /api/health` → 200 JSON with `commit`, `uptimeSec`, `db.ok`, `ai.configured`. **[SMOKE]**
- **8.1.b** — `GET /api/payments/probe` → 200 JSON with configured payment providers. **[SMOKE]** + **[AUTO]**
- **8.1.c** — `GET /api/auth/session` → `null` if unauth, `{user: {email, id}}` if auth. **[MANUAL]**
- **8.1.d** — `GET /api/auth/providers` → Google provider with callback at apex domain. **[AUTO]**
- **8.1.e** — `GET /api/auth/csrf` → valid CSRF token with `__Host-authjs.csrf-token` cookie. **[MANUAL]**

### 8.2 Webhooks
- **8.2.a** — `POST /api/webhooks/razorpay` with valid signature → 200. **[AUTO]** (indirectly via ledger)
- **8.2.b** — Missing `x-razorpay-signature` → 400 `verification_failed`. **[MANUAL]** Verified 2026-04-24.
- **8.2.c** — Wrong signature → 400. **[BACKLOG — manual with mismatched HMAC]**
- **8.2.d** — Duplicate `x-razorpay-event-id` → 200 `duplicate`, no DB mutation. **[AUTO]**
- **8.2.e** — `POST /api/webhooks/paddle` — analogous. **[AUTO]** (paddle-webhook-financials)
- **8.2.f** — Unknown provider → 404. **[MANUAL]**

### 8.3 Cron
- **8.3.a** — `POST /api/cron/ai-margin-rollup` with valid `x-cron-secret` → 200 + margin rows. **[BACKLOG — blocked on CRON_SECRET]**
- **8.3.b** — `POST /api/cron/reconcile-payments` with valid secret → reconciles stale rows. **[BACKLOG — Task #24]**
- **8.3.c** — Missing `CRON_SECRET` env → 500. **[MANUAL]** Reproduced 2026-04-24.
- **8.3.d** — Wrong secret → 401 `unauthorized`. **[BACKLOG]**

### 8.4 Miscellaneous
- **8.4.a** — `POST /api/contact` — basic input validation (≥10 chars message). **[MANUAL]** Verified 2026-04-24.
- **8.4.b** — `POST /api/contact` — captcha / rate-limit prevents spam. **[BACKLOG]**
- **8.4.c** — `POST /api/geo/waitlist` happy path → 200 + `geo_waitlist` row. **[AUTO]** (geo-waitlist, 248 pass)
- **8.4.d** — `POST /api/geo/waitlist` invalid country / missing consent → 400. **[AUTO]**
- **8.4.e** — `GET /api/invoices/{paymentId}` — ownership gate, 404 cloak. **[AUTO]** (invoicing)
- **8.4.f** — `GET /api/admin/tax/export.csv` — admin gate, clampDays 1–90. **[AUTO]**

---

## 9. Security (P0)

### 9.1 Anti-enumeration
- **9.1.a** — `/admin` → 404 for non-admin (not 403). **[AUTO]** + **[MANUAL]**
- **9.1.b** — `/api/admin/*` → 404 cloak. **[MANUAL]**
- **9.1.c** — `/api/invoices/{someone-elses-id}` → 404 (not 403). **[AUTO]**
- **9.1.d** — Chat session URL guessing → 404 (not 403). **[AUTO]** (ai-router ownership)

### 9.2 Input sanitization
- **9.2.a** — HTML in prompt → rendered as text, not HTML. **[AUTO]** (output-moderation)
- **9.2.b** — SQL injection attempts bounce via Drizzle parameterization. **[AUTO]** (implicit — Drizzle prepared statements)
- **9.2.c** — XSS in file name → rendered escaped. **[BACKLOG]**
- **9.2.d** — Prompt injection via PDF content → wrapped in `<user_content>`. **[AUTO]** (prompt-safety)

### 9.3 CSRF
- **9.3.a** — NextAuth sign-in/out uses CSRF token. **[MANUAL]**
- **9.3.b** — POST /api/contact requires CSRF (Next.js server actions auto-protect). **[AUTO]** (implicit)

### 9.4 Rate limits
- **9.4.a** — Auth endpoints rate-limited at IP level. **[BACKLOG]**
- **9.4.b** — AI ops rate-limited per-user. **[AUTO]** (guardAiRoute)

### 9.5 Supply chain
- **9.5.a** — `npm audit` shows zero critical vulns. **[BACKLOG]**
- **9.5.b** — CSP locks script-src to specific origins (not wildcard). **[MANUAL]**

---

## 10. Observability (P2)

- **10.1** — Microsoft Clarity loads without CSP violation. **[MANUAL]** (partial — clarity.js sometimes 503 via LSAPI recycling — Task #20)
- **10.2** — GA4 pageview fires on navigation. **[MANUAL]** (partial — collect endpoint 503 under worker recycling — Task #20)
- **10.3** — Sentry / error tracking → BACKLOG (not wired yet)
- **10.4** — Hostinger Node logs capture `console.error` from webhook failures. **[MANUAL]**

---

## 11. Edge cases + polish (P3)

### 11.1 Empty states
- **11.1.a** — No payments → "No payments yet" with See pricing CTA. **[MANUAL]**
- **11.1.b** — No files → empty-state image + upload CTA. **[BACKLOG]**
- **11.1.c** — No chats → "Start a new chat" CTA. **[BACKLOG]**
- **11.1.d** — No credits + tries AI op → "Top up credits" prompt. **[BACKLOG]**

### 11.2 Error states
- **11.2.a** — 500 from backend → friendly error page with retry. **[BACKLOG]**
- **11.2.b** — Network offline during upload → retry banner. **[BACKLOG]**
- **11.2.c** — Stripe-style "something went wrong" with correlation id. **[BACKLOG]**

### 11.3 Responsive / mobile
- **11.3.a** — /, /pricing, /app/dashboard render on 375px viewport. **[BACKLOG]**
- **11.3.b** — Modal opens full-screen on mobile. **[BACKLOG]**

### 11.4 Accessibility (WCAG 2.1 AA)
- **11.4.a** — All interactive elements keyboard-navigable. **[BACKLOG]**
- **11.4.b** — Focus rings visible. **[BACKLOG]**
- **11.4.c** — Color contrast ≥ 4.5:1 for body text. **[BACKLOG]**
- **11.4.d** — Form labels properly associated. **[BACKLOG]**
- **11.4.e** — Screen-reader: landmarks + skip-to-content. **[BACKLOG]**

### 11.5 Performance
- **11.5.a** — Homepage TTI < 3s on 4G. **[BACKLOG]**
- **11.5.b** — Lighthouse score ≥ 90 / 90 / 90 / 90. **[BACKLOG]**
- **11.5.c** — No layout shift on dynamic content. **[BACKLOG]**

---

## 12. Deployment + infrastructure (P1 for deploy path, P2 for drift)

### 12.1 Deploy
- **12.1.a** — `git push main` → Hostinger auto-pulls within 3 min. **[MANUAL]** (repeated this session)
- **12.1.b** — `/api/health` reports new `commit` after deploy. **[MANUAL]**
- **12.1.c** — Post-deploy 503 window < 5 min. **[MANUAL]** (observed — Task #20)

### 12.2 Migrations
- **12.2.a** — All `db/migrations/*.sql` files applied in order on prod. **[BACKLOG — Task #28]**
- **12.2.b** — New columns don't break pre-existing code paths. **[AUTO]** (credit-ledger-financials — NULL-safe)
- **12.2.c** — Rollback plan exists for every destructive migration. **[BACKLOG]**

### 12.3 Env var hygiene
- **12.3.a** — `process.env.X` fallbacks never leak dev values to prod. **[AUTO]** (health-ai — provider config)
- **12.3.b** — Secrets (API keys, webhook secrets) never logged. **[MANUAL]**

---

## Summary: coverage scorecard (2026-04-24)

| Area | P0 | P1 | P2 | P3 | Total cases | % covered |
|---|---|---|---|---|---|---|
| Auth | 16 | 8 | 0 | 0 | 24 | ~40% |
| Public pages | 0 | 35 | 0 | 0 | 35 | ~80% |
| Pricing + Checkout | 28 | 12 | 0 | 10 | 50 | ~55% |
| In-app surface | 0 | 42 | 0 | 8 | 50 | ~40% |
| AI operations | 15 | 18 | 0 | 12 | 45 | ~55% |
| Free WASM tools | 0 | 8 | 0 | 0 | 8 | ~10% |
| Admin (23 pages) | 0 | 0 | 25 | 0 | 25 | ~80% |
| API endpoints | 12 | 8 | 0 | 0 | 20 | ~60% |
| Security | 10 | 5 | 0 | 0 | 15 | ~65% |
| Observability | 0 | 0 | 4 | 0 | 4 | ~25% |
| Edge cases | 0 | 0 | 0 | 18 | 18 | ~5% |
| Deploy/infra | 0 | 5 | 4 | 0 | 9 | ~45% |
| **Total** | **81** | **141** | **33** | **48** | **303** | **~50%** |

Automated tests currently cover **2,682 assertions across 29 suites** — that's the AUTO baseline. Gaps are mostly in the MANUAL + BACKLOG columns above. Highest-ROI next rings of coverage:

1. **Free WASM tools** — near zero coverage today; users touch these weekly.
2. **Refund flow** — financial impact, tested only at the ledger layer.
3. **Monthly Plus subscription** — renewal / pause / cancel paths untested.
4. **Accessibility** — zero coverage; run axe-core in smoke suite.
5. **Mobile viewport** — zero coverage; Playwright mobile emulation.

---

_Last updated: 2026-04-24_
_Maintainer: see `CLAUDE.md` for ownership. Update this doc whenever a new test suite is added to `scripts/run-all-tests.mjs`._
