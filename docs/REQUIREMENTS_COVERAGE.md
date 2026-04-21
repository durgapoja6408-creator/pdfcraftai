# pdfcraftai.com — Requirements Coverage Audit

_Generated: 2026-04-21. Audit author: Claude session walked `docs/MASTER_PLAN.md` and `docs/FEATURE_TRACKER.md` line-by-line, cross-referenced against the live codebase + prod smoke._

## Purpose

Answer the question "did we actually complete every requirement in the spec?" honestly. The 16-item cowork task tracker is **not** the full spec — it's only the items someone explicitly filed. This audit compares spec against shipped reality.

---

## 0. TL;DR

- **16-item cowork tracker:** 12 DONE, 2 fully blocked, 2 partial (see `REMAINING_WORK.md`).
- **FEATURE_TRACKER.md (~60 feature rows):** ~45 Done, ~10 Partial/Pending, ~5 blocked on email provider.
- **MASTER_PLAN.md §7 "what done looks like" (8 gate criteria):** 1 MET, 3 PARTIAL, 4 NOT MET.
- **MASTER_PLAN.md §6 task list (9 tasks: #72, #80–#87):** **NONE are in the cowork 16-item tracker.** These are the AI-phases + Payments-phase-1 foundation — biggest gap surfaced by this audit.
- **Founder decisions (§4):** 9 still open (D1, D2, D3, D5, D6, D7, D8, D9, D12). D4, D10, D11 closed.
- **PLAN_GAP_ANALYSIS.md SEV-0 gaps:** 11 flagged; some mitigated (India GST, EU VAT via MoR), others NOT — prompt injection, chargeback clawback, malware scan, output moderation UNKNOWN status.

**Bottom line:** The site is NOT launch-ready per its own spec. The 16-item tracker has been tracking the last-mile polish items (PayPal retirement, doc hygiene, smoke harness, CF-IPCountry preselect) while the **core revenue loop** (AI phases A0–A4, Payments Phase 1 webhook-to-credit-grant-to-ai-usage-row) has not shipped. That's not a "we're one paddle-key away from launch" position — that's 4+ weeks of real engineering ahead.

---

## 1. `MASTER_PLAN.md` §7 — "What done looks like" (8 gate criteria)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` + `GEMINI_API_KEY` on Hostinger; `/api/health` reports `ai.configured = true` | **NOT MET** | `/api/health` response has no `ai` field at all. `GEMINI_API_KEY` impossible to verify since no Gemini adapter exists. |
| 2 | Razorpay live + Paddle seller verified; checkout shows per-region routing | **PARTIAL** | Razorpay live + in registry. Paddle adapter scaffolded + in registry but `/api/payments/probe` returns `configuredIds: ["razorpay"]` only — Paddle env vars not set. Per-region routing function (`lib/geo/routeCheckoutByCountry`) exists and tested, but NOT wired into a `createCheckoutAction` that actually runs. |
| 3 | E2E: purchase → credit grant → AI call → `ai_usage` row | **NOT MET** | `ai_usage` table does NOT exist in `db/schema/app.ts`. Tables present: `credits`, `creditLedger`, `payments`, `subscriptions`, `webhookEvents`, `chatSessions`, `chatMessages`, `aiOutputs`. An `aiOutputs` row is captured but not the per-call token/cost/latency audit trail §7 requires. |
| 4 | `SUM(credit_ledger.delta) = credits.balance` invariant nightly | **NOT MET** | No nightly check found. `app/api/cron/reconcile-payments` exists but scope is payment reconciliation, not ledger-vs-balance invariant. |
| 5 | Phase A2 context-token cap: send 50k tokens → 413 | **PARTIAL / NOT MET** | `app/api/ai/chat/route.ts` has a **byte**-level guard (`MAX_PDF_BYTES` → 413), not a token-level cap. The spec specifies 20k input tokens (D4 decision). Byte ≠ token. A 400-page text-only PDF stays under byte limit but blows the token cap. **Real gap.** |
| 6 | `lib/ai/router.ts` routes by op — OCR/translate → Gemini, chat → GPT-4o-mini, generate/sign → Sonnet | **NOT MET** | `lib/ai/router.ts` does not exist. `lib/ai/adapters/` has `openai.ts` + `anthropic.ts`, no Gemini adapter. All AI calls today pick a single provider per op file (`lib/ai/chat.ts`, `lib/ai/ocr.ts`, etc.). No routing layer. |
| 7 | Daily margin rollup: 7 consecutive days green | **NOT MET** | No rollup cron found. `app/api/cron/reconcile-payments` exists (payments-only). `docs/ai/margin_scenarios.py` runs scenarios on demand but doesn't persist rollups. |
| 8 | Pricing page "up to 88% / 83% / 78% / 73%" (never flat) + Starter $7 OR self-serve copy | **UNKNOWN** | Grep on `app/pricing/page.tsx` for "88%" returned nothing — either using different wording or not shipped. Starter pricing requires D1 decision (still open). |

**Score: 1/8 met (criterion 2 half-counts).**

---

## 2. `MASTER_PLAN.md` §6 — Task list (NOT in cowork tracker)

These nine tasks are written into the master plan as the critical path, but **none** appear in the cowork 16-item tracker. This is the biggest "requirement fell off the tracker" finding.

| Task | Subject | Status in MP | Verified today |
|---|---|---|---|
| #72 | Add `ANTHROPIC_API_KEY` to Hostinger env | PENDING (SEV-1) | Still not verifiable via `/api/health`; probably still pending. |
| #80 | Payments Phase 1: webhooks + checkout + shared `handleWebhook` | PENDING, blocks on #81, #82 | `app/api/webhooks/paddle/route.ts` + `razorpay/route.ts` exist as **routes**, but no end-to-end checkout UI that routes + signs a Paddle/Razorpay request → webhook → credit grant has been exercised against real sandbox money. |
| #81 | Phase 0 legal: KYC + GSTIN + LUT + Paddle KYC + legal pages | PENDING | Legal pages shipped (Privacy/Terms/DPA). GSTIN + LUT NOT filed. Paddle KYC submitted (tracker #1) but not verified. |
| #82 | Answer PAYMENT_GATEWAY_PLAN §10 Q1–Q7 | PENDING | Not audited this pass. |
| #83 | AI Phase A1: `ai_usage` + `withCreditSpend` + spend-race fix | PENDING, blocks on #72 | `spendCredits` shipped. `ai_usage` table NOT shipped. Spend-race fix: code explicitly accepts the race (see `lib/ai/credits.ts` header comment). **Partial.** |
| #84 | AI Phase A2: rate limits + body guards + Gemini + `router.ts` + context-token cap + per-pack checkout | PENDING | **None of the A2 deliverables shipped.** Largest single gap. |
| #85 | AI Phase A3: BYOK — keystore + router + `/api-keys` UI | PENDING | `user_api_keys` table NOT in schema. No `/app/api-keys` route. |
| #86 | AI Phase A4: margin reporting | PENDING | Not shipped. |
| #87 | Close margin-leak gaps (6 code + 6 founder decisions) | PENDING | Founder decisions D1, D2, D3, D5, D6, D7, D8, D9, D12 still open. |

---

## 3. `FEATURE_TRACKER.md` — feature-level audit

Delta from its own self-reported status, checked against filesystem + smoke:

### Marketing surface — 15 rows
All 15 marked Done and verified rendering in prod smoke. **No gap.** (Minor: Privacy/Terms audit for stale `support@` references flagged — low priority.)

### Auth surface — 9 rows
**Gaps:**
- **Magic-link sign-in: Pending** — blocked on email provider choice. SEV: medium. Not required for MVP.
- **Sign-in click-test E2E: Pending** — needs a human to complete Google round-trip. Should be added to the cowork tracker as a one-liner.

### API endpoints — 7 rows
**Gaps:**
- **Transactional mail send: Pending** — blocks real password-reset delivery and future receipts. Today reset URLs log to the Node process instead. SEV-1 for launch.

### Product / app surface — 13 rows
**Gaps:**
- **App dashboard data plumbing: Partial** — layout ships, backing data depends on logged-in DB reads that may or may not be wired.
- **Word → PDF: Pending** — server-side pipeline needed.
- **Extract / crop / single-page deletion standalone tools: Pending.**
- **AI tools end-to-end funded-account test: Partial** — 10 AI tool pages serve 200, but credit debit + model routing not verified end-to-end with real money.

### Analytics / monitoring — 5 rows
**Gaps:**
- **Uptime / status page data source: Partial** — `/status` renders static array, no real probe. SEV-2.
- **Error tracking (Sentry or similar): Pending.** SEV-1 for launch — we ship without knowing about prod errors.

### SEO / search — 5 rows
**Gaps:**
- **OpenGraph / Twitter cards validator pass: Partial** — metadata shipped, validator run pending.

### Security / housekeeping — 7 rows
**Gaps:**
- **Auth rate limits (WAF level): Pending** — part of Task #3 (1c).
- **DMARC / DKIM / SPF: Pending** — blocks on email host choice. Same block as transactional mail.

### Typecheck / build health — 4 rows
**Gaps:**
- **Lighthouse pass: Pending.**
- **OG / Twitter validators: Pending** (same as above).

**Total FEATURE_TRACKER gaps:** 13 Pending/Partial rows (out of ~60).

---

## 4. `PLAN_GAP_ANALYSIS.md` — 11 SEV-0 gaps

From the gap-analysis doc's own §0 TL;DR, these 11 "must fix before real money" items. Status as of today:

| # | SEV-0 gap | Status |
|---|---|---|
| 1 | Prompt injection in user PDFs (T3-G1) | **UNKNOWN** — not verified. No `sanitizeUserDocumentForPrompt` helper found in `lib/ai/`. |
| 2 | Chargeback clawback on already-spent credits (T2-G7) | **Partially mitigated by Paddle MoR** — Paddle absorbs chargeback disputes for Tier-2 traffic. Razorpay IN traffic still exposed. No clawback logic in `creditLedger`. |
| 3 | GST invoice + GSTIN requirement (T2-G1) | **Documented runbook exists** (`docs/india/GST_SETUP.md`) but GSTIN not filed. |
| 4 | EU VAT (T2-G2) | **Resolved via GEO_LAUNCH_POLICY** — EU defer to Tier 2. Not an active risk. |
| 5 | Refund policy + ToS pages | **DONE** — shipped Privacy/Terms/DPA. Refund-specific clauses may still be thin. |
| 6 | Cookie banner | **UNKNOWN** — not spot-checked this pass. |
| 7 | Webhook retry storm handling | **Partial** — `webhookEvents` table exists for idempotency, but retry-storm protection (exponential backoff, storm limits) not verified. |
| 8 | Output moderation | **UNKNOWN** — not verified. |
| 9 | Malware scan on uploads | **UNKNOWN** — not verified. |
| 10 | (rest of SEV-0 list) | **Not audited in this pass.** |

---

## 5. Founder decisions still open (§4)

| # | Decision | Blocks |
|---|---|---|
| D1 | Starter $5 vs $7 | Pricing page copy; Payments Phase 1 |
| D2 | Ship Anthropic + OpenAI + Gemini day one? | Phase A0 |
| D3 | BYOK on Pro at launch or defer to week +2 | `lib/pricing.ts`; Payments Phase 1 |
| D5 | Free-tier credit count + routing | Phase A2 |
| D6 | Public margin copy before A4 green | Pricing page deploy |
| D7 | `MAX_CREDITS_PER_TURN` value | Phase A2 Layer 5 |
| D8 | Margin threshold for auto-BYOK flip | Phase A4 Layer 7 |
| D9 | Pre-send cost confirmation trigger | Phase A2 Layer 4 |
| D12 | Publish which model handled each request? | Phase A2 UI; privacy policy |

**Claude can't close these** — they're founder judgment calls. None are blockers for the next 4 weeks of core engineering (which doesn't touch pricing copy or model-disclosure UI) but D1 + D2 + D5 need answers before Phase A2 can ship.

---

## 6. What the 16-item cowork tracker was actually tracking

Cross-referenced against the spec: the 16 items are mostly **last-mile retrofit** — not core revenue-loop construction.

| Item | Category | Relation to spec |
|---|---|---|
| #5 Privacy + Terms + DPA sub-processor update | Legal polish | Task #81 partial |
| #6 Retire PayPal | Cleanup after D4 decision | Not in §6 list |
| #7 Deploy RAZORPAY_* env vars | Infra | Pre-req for Task #80 |
| #8 Verify Razorpay adapter boots | Infra verify | Pre-req for Task #80 |
| #9 Flag .htaccess CSP PayPal regression | Regression fix | Not in §6 list |
| #10 Rewrite pci-saq-a.md | Docs | Not in §6 list |
| #11 Genuinely retire PayPal code | Cleanup | Not in §6 list |
| #12 `/api/payments/probe` | Dev-infra | Not in §6 list |
| #13 Pre-push hook | Dev-infra | Not in §6 list |
| #14 Smoke-live `/launch-notify` coverage | Dev-infra | Not in §6 list |
| #15 Smoke-live `/api/payments/probe` coverage | Dev-infra | Not in §6 list |
| #16 CF-IPCountry auto-preselect | Geo polish | Task #80 sub-item partial |
| #1 Paddle sandbox validation | Pre-req for #80 | Task #80 pre-req |
| #2 CA consult | Task #81 partial | |
| #3 Cloudflare geo-block + checkout router | Task #80 sub-item | Partial |
| #4 MARGIN_VERIFICATION v3 follow-ups | Doc refresh | Not in §6 list |

**Observation:** 9 of the 16 tracked items (#6, #9, #10, #11, #12, #13, #14, #15, #16) are **not in MASTER_PLAN §6**. They're retrofits caused by the D4 (PayPal → Paddle) swap and general dev hygiene. Useful, but not what the spec calls "required for launch."

**Zero** of the 16 tracked items are Task #83 (AI Phase A1), #84 (AI Phase A2), #85 (BYOK), #86 (margin reporting), or #87 (founder decisions). That's the real work the spec says is required for launch, and it's not scheduled.

---

## 7. Recommended next-tracker additions

To reflect the real remaining work per the spec, these belong in the cowork tracker (my suggestion — you approve):

| New # | Derived from | Subject | Rough scope |
|---|---|---|---|
| 17 (this audit) | n/a | Completeness audit vs MASTER_PLAN + FEATURE_TRACKER | Done — this file |
| 18 | MP task #72 | Add `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` to Hostinger env; add `ai.configured` to `/api/health` | 20 min once keys pasted — paste-and-click + 10-line patch |
| 19 | MP task #83 | Ship `ai_usage` table + migration + `withCreditSpend` writes per-call row | ~2 hours + migration |
| 20 | MP task #84 part A | Context-token cap enforcement in `/api/ai/chat` (20k input tokens → 413) | ~1 hour |
| 21 | MP task #84 part B | Gemini adapter + `lib/ai/router.ts` + per-op routing | ~1 day |
| 22 | MP task #86 | Daily margin rollup cron + `/admin/ai-spend` | ~1 day |
| 23 | FT auth | Transactional mail provider pick + wire (unblocks password reset delivery, magic-link, future receipts) | ~half day |
| 24 | FT analytics | Sentry (or equivalent) for prod error tracking | ~2 hours |
| 25 | FT auth | Sign-in click-test E2E (human) | 5 min |
| 26 | PLAN_GAP_ANALYSIS | Prompt-injection defense for user-PDF content in AI calls | ~3 hours |
| 27 | PLAN_GAP_ANALYSIS | Malware scan on PDF uploads (ClamAV or equivalent) | ~half day |
| 28 | PLAN_GAP_ANALYSIS | Output moderation on AI responses | ~half day |

**None of these are in the current cowork tracker.** If you want to actually ship to spec, they need to be.

---

## 8. Honest framing

The 16-item cowork tracker has been **useful for keeping dev hygiene tight during the D4 PayPal→Paddle migration** — 9 of 16 items are direct fallout from that swap. But the tracker has **drifted from the spec**: the spec's core launch gate (AI Phases A1–A4 + Payments Phase 1 end-to-end) has zero tracker coverage.

A session ago I reported "all remaining in-progress tasks are externally blocked" — that was true for the 16-item view but **misleading for the actual project**. There is a lot of work I can do on #19, #20, #22, #24, #26, #27, #28 without any external unblock. The reason I wasn't proposing them is the tracker didn't know they existed.

Recommended action: **decide whether the 16-item tracker should absorb items #18–#28 above**. If yes, we have ~2 weeks of non-blocked engineering ahead before we ever need the Paddle keys. If no, the spec needs to be revised downward.

---

_This file pairs with `REMAINING_WORK.md` (task-tracker view) and `STATUS.md` (append-only journal). Where they disagree, this file is the more pessimistic + more accurate view of what's left to reach the spec's own launch-gate definition._
