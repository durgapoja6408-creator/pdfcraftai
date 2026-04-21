# pdfcraftai — master plan index

**Date:** 2026-04-20 (consolidation pass — v4, Phase-0 foundation merge: Paddle MoR + GST + TAX + GEO). **Purpose:** one door into every active planning document. Anyone picking up this project reads this file first, then the specific plan for the work they're doing.

---

## 1. The plan, in 90 seconds

**Product:** pdfcraftai.com — Next.js 14 SaaS on Hostinger. 10 AI-powered PDF tools (chat, summarize, translate, OCR, compare, rewrite, table, redact, generate, sign) charged in credits. Credits sold in four packs: Starter $5 / Creator $19 / Pro $59 / Studio $149.

**Revenue pipeline we're building:**

```
 user  ─┐                                                         ┌──▶  Razorpay (INR — IN buyers)
        │   /pricing  ──▶  /checkout  ──▶  PaymentProvider  ──────┤
        │                                  (portable adapter)     └──▶  Paddle MoR (RoW — USD/EUR/GBP/…)
        │                                      │
        │                                      ▼
        │                            webhook signature verify
        │                                      │
        │                                      ▼
        │                            grantCredits(delta=+N, idempotencyKey)
        │                                      │
        │                                      ▼
        └────────▶  /app  ──▶  /api/ai/*  ──▶  withCreditSpend(op, fn)
                                               │
                                               ▼
                                      lib/ai/router.ts
                                     (cheap routing policy)
                                               │
                          ┌────────────────────┼────────────────────┐
                          ▼                    ▼                    ▼
                    Anthropic           OpenAI (cheap)        Gemini (cheapest)
                    (Haiku/Sonnet)      (GPT-4o-mini)         (Flash)
                          │                    │                    │
                          └────────────────────┼────────────────────┘
                                               ▼
                                     ai_usage row (tokens, cost_usd_micro, latency)
                                               │
                                               ▼
                                     daily margin rollup cron (A4)
```

**Target go-live:** ~2026-05-17 (AI zero-leak bar + Payments Phase 1 webhooks).

**Critical unknowns still blocking:**
1. `ANTHROPIC_API_KEY` not on Hostinger (task #72) — every AI call 503s today.
2. Razorpay KYC in progress, **Paddle** KYC not yet started (task #81; PayPal deprecated by D4 resolution — see below).
3. **Ten** founder decisions open (see §4) — D1–D6 on pricing/margin + D7–D9 on cost guardrails + **D12** on transparency. **D10 (EU defer) and D11 (US allow via Paddle MoR) are now CLOSED** via `docs/GEO_LAUNCH_POLICY.md`. **D4 (payment stack)** is now **CLOSED** — Razorpay + Paddle per `docs/payments/MOR_EVALUATION.md`.
4. **11 SEV-0 gaps** identified in PLAN_GAP_ANALYSIS.md must be closed before public launch — including prompt-injection defense, chargeback clawback handling, refund/ToS pages, cookie banner, webhook retry storm, output moderation, malware scan on uploads. **T2-G1 (India GST) and T2-G2 (EU VAT) now have documented remediation plans** in `docs/india/GST_SETUP.md` and `docs/GEO_LAUNCH_POLICY.md` respectively.

**Loss-bounding guarantees added 2026-04-20:** See `COST_GUARDRAILS.md`. A 500-page PDF × 10-turn Sonnet chat goes from −$7.23/session loss to either bounded positive margin or forced BYOK. Max per-turn cost is mathematically capped by Layer 1 (20k input-token gate).

**Gap-analysis audit added 2026-04-20:** See `PLAN_GAP_ANALYSIS.md`. 42 previously-unmapped scenarios across adversarial, regulatory, operational, product, and financial axes — classified SEV-0..SEV-3 and fed back into phase scoping.

**Phase 0 foundation docs added 2026-04-20:** Four docs closing the payments + geography + tax + GST compliance arc:
- `docs/payments/MOR_EVALUATION.md` — Paddle chosen as international MoR over Lemon Squeezy, FastSpring, Paypro Global, Gumroad, DodoPayments. Razorpay remains on the IN rail. 6-vendor weighted scoring + sandbox validation plan + Plan B/C fallbacks.
- `docs/GEO_LAUNCH_POLICY.md` — Tier 1 (allow: IN + US + UK + CA + AU + NZ + SG + UAE + rest of APAC + LatAm + MEA), Tier 2 (defer: EU + CH + NO + IS + LI + CN + RU + BY), Tier 3 (block: OFAC-sanctioned). Cloudflare WAF + checkout-gate implementation.
- `docs/india/TAX_MODEL.md` — 3-regime comparison (44ADA / 44AD / regular books), net-take-home scenarios at $50k / $100k / $250k ARR, multi-year regime-transition roadmap, 7 CA-confirmation questions.
- `docs/india/GST_SETUP.md` — GSTIN registration runbook, LUT filing, HSN/SAC 998313, invoice templates for IN + export rails, monthly GSTR-1/3B calendar, CA artefact checklist.

These four resolve D4, D10, D11, and provide the Phase 0 legal runbook that was previously enumerated but not documented.

---

## 2. Document map — read in this order

### 2.1 Bootstrap (read first, always)

| Doc | Purpose | Size |
|---|---|---|
| [`CLAUDE.md`](../CLAUDE.md) | Session bootstrap — PAT, SSH key, repo IDs, known gotchas | 4 KB |
| [`docs/STATUS.md`](./STATUS.md) | **Live punch list** — DONE / PENDING, owners, verification evidence | 88 KB |
| [`docs/DEPLOYMENT_NOTES.md`](./DEPLOYMENT_NOTES.md) | Env vars, integration status, recovery playbook | 4 KB |

### 2.2 Payments layer

| Doc | Purpose | Size |
|---|---|---|
| [`docs/payments/MOR_EVALUATION.md`](./payments/MOR_EVALUATION.md) | **MoR decision record** — Paddle chosen over Lemon Squeezy / FastSpring / Paypro / Gumroad / Dodo. 6-vendor weighted scoring, India-payout reliability analysis, sandbox validation plan. | 10 KB |
| [`docs/payments/PAYMENT_GATEWAY_PLAN.md`](./payments/PAYMENT_GATEWAY_PLAN.md) | Portable `PaymentProvider` adapter, Razorpay + ~~PayPal~~ (superseded by Paddle for international), 4-week timeline to go-live | 29 KB |
| [`docs/payments/migration-playbook.md`](./payments/migration-playbook.md) | How we replace a gateway without migrating user data (the internal-UUID trick) | 16 KB |
| [`docs/RAZORPAY_READINESS.md`](./RAZORPAY_READINESS.md) | KYC status, merchant underwriting notes, timeline | 12 KB |

### 2.2a India compliance

| Doc | Purpose | Size |
|---|---|---|
| [`docs/india/TAX_MODEL.md`](./india/TAX_MODEL.md) | **Income tax model** — 44ADA / 44AD / regular regime comparison, net take-home at $50k/$100k/$250k ARR, multi-year projection, 7 CA confirmation questions. | 15 KB |
| [`docs/india/GST_SETUP.md`](./india/GST_SETUP.md) | **GST operations runbook** — GSTIN registration, LUT filing, HSN/SAC codes, invoice templates, monthly return calendar, foreign-supplier RCM. | 18 KB |

### 2.2b Geographic launch policy

| Doc | Purpose | Size |
|---|---|---|
| [`docs/GEO_LAUNCH_POLICY.md`](./GEO_LAUNCH_POLICY.md) | **Country tiering** — Tier 1 (allow, target) / Tier 2 (defer: EU, CN, RU, BY) / Tier 3 (block: OFAC). Cloudflare WAF + checkout-gate router + compliance prep queue. | 12 KB |

### 2.3 AI layer

Read these in dependency order:

| Order | Doc | Purpose | Size |
|---|---|---|---|
| 1 | [`docs/ai/AI_API_MASTER_PLAN.md`](./ai/AI_API_MASTER_PLAN.md) | **The** AI plan — phases A0–A5, zero-leak definition, 6-week timeline, Gemini adapter promoted to Phase A2 | 43 KB |
| 2 | [`docs/ai/MARGIN_VERIFICATION.md`](./ai/MARGIN_VERIFICATION.md) | 11-scenario margin sweep + decision points needing founder sign-off (§10) | 22 KB |
| 3 | [`docs/ai/margin_scenarios.py`](./ai/margin_scenarios.py) | Deterministic model behind the margin numbers — reproducible | 14 KB |
| 4 | [`docs/ai/PROVIDER_STRATEGY.md`](./ai/PROVIDER_STRATEGY.md) | Business case for multi-provider + BYOK | 22 KB |
| 5 | [`docs/ai/MODELS_AND_MULTI_KEY.md`](./ai/MODELS_AND_MULTI_KEY.md) | Per-op routing matrix (which model handles which tool) | 28 KB |
| 6 | [`docs/ai/BYOK_DECISION_MATRIX.md`](./ai/BYOK_DECISION_MATRIX.md) | 7-step decision flow for every request: platform key vs user key | 29 KB |
| 7 | [`docs/ai/REVENUE_LEAK_AUDIT.md`](./ai/REVENUE_LEAK_AUDIT.md) | 28 ways money can leak + mitigations, mapped to phase | 47 KB |
| 8 | [`docs/ai/COST_GUARDRAILS.md`](./ai/COST_GUARDRAILS.md) | Nine-layer defense against chat-whale + 100-page-PDF attacks — worked math, phase map, D7–D9 | 17 KB |
| 9 | [`docs/ai/architecture.md`](./ai/architecture.md) | Existing system design (pre-BYOK; still authoritative on adapters) | 90 KB |

### 2.4 Verification / ops

| Doc | Purpose | Size |
|---|---|---|
| [`docs/PLAN_GAP_ANALYSIS.md`](./PLAN_GAP_ANALYSIS.md) | **42-gap deep audit** across all 3 tiers + cross-cutting — SEV-0..SEV-3 with remediation | 29 KB |
| [`docs/TEST_PLAN.md`](./TEST_PLAN.md) | Prioritized E2E checklist (P0 auth → P4 SEO) | 8 KB |
| [`docs/E2E_SMOKE_2026-04-20.md`](./E2E_SMOKE_2026-04-20.md) | Latest production sweep notes | 22 KB |
| [`docs/FEATURE_TRACKER.md`](./FEATURE_TRACKER.md) | What's built, what's stubbed | 12 KB |
| [`docs/security/`](./security/) | CSP, CSRF, rate-limiting notes | varies |

---

## 3. Architecture in one picture — the portability bar

Everything below is tested against one rule: **adding a new provider (payment or AI) must touch ≤ 7 files, zero changes in route handlers, zero changes in UI.**

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │  Routes (app/api/*)                                                 │
 │  auth → guard → withPayment / withCreditSpend → provider call       │
 └──────────┬──────────────────────────────────────┬───────────────────┘
            ▼                                      ▼
 ┌────────────────────┐                 ┌────────────────────────────┐
 │ lib/payments/      │                 │ lib/ai/                    │
 │   registry.ts      │                 │   registry.ts              │
 │   providers.ts     │                 │   router.ts   (new, A2)    │
 │   webhook-handler  │                 │   credits.ts (spend/refund)│
 └────────┬───────────┘                 │   byok/keystore.ts (A3)    │
          ▼                             └────────┬───────────────────┘
 ┌──────────────────────┐                        ▼
 │ PaymentProvider IFC  │               ┌─────────────────────────┐
 │   createCheckout     │               │ AIProvider interface    │
 │   verifyWebhook      │               │   chat / streamChat     │
 │   refund / cancel    │               │   per-call apiKey arg   │
 └────────┬─────────────┘               └─────────┬───────────────┘
          ▼                                       ▼
 ┌──────────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────┐
 │ razorpay.ts      │  │ paddle.ts    │  │ anthropic   │  │ openai   │  │ gemini   │
 │ (shipped)        │  │ (shipped)    │  │ (shipped)   │  │ (shipped)│  │ (A2)     │
 └──────────────────┘  └──────────────┘  └─────────────┘  └──────────┘  └──────────┘
                              │                 │                │            │
                              ▼                 ▼                ▼            ▼
                       Normalized webhook event / ChatChunk stream (no SDK types leak past this line)
                              │
                              ▼
                    credit_ledger (+/- delta, idempotencyKey)
                    ai_usage (tokens, cost_usd_micro, key_source)
```

**Why this shape survives a gateway change:**
- Internal payment UUID (`internalPaymentId`) is the portability anchor. Razorpay's `order_id` and Paddle's `transaction_id` are stored for lookup, but the ledger uses the internal ID. Migrating gateways is: new adapter, cutover checkout routing. Zero existing-user data changes.
- `AIProviderId` is an open string type. Adding Gemini = 7 files (per master plan §9). Adding Mistral after that = same 7 files.

---

## 4. Open decisions requiring founder sign-off

These twelve decisions are blocking the public pricing copy, the A2/A3 builds, and the launch geo-scope:

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| D1 | Keep Starter pack at $5 or raise to $7? | **Raise to $7.** Scenario S7 shows $5 can't absorb $1.50/mo support cost — margin collapses to 59%. | Pricing page copy; Payments Phase 1 |
| D2 | Ship Anthropic + OpenAI + Gemini keys on day one? | **Yes, all three.** Chat-whale scenario (S3) pushes Pro to −12.5% without cheap routing. Cost to provision: $0. | Phase A0 |
| D3 | BYOK on Pro at launch or defer to week +2? | **Defer.** Remove "+15% infra fee" bullet from `lib/pricing.ts:60` until A3 lands. | `lib/pricing.ts` edit; Payments Phase 1 |
| D4 | Context-token cap on `chat_turn`? | **20k input tokens (~12 pages).** Larger → redirect to `summarize`. | Phase A2 |
| D5 | Free-tier credit count + routing? | **10 credits, force Gemini Flash.** Reduces abuse cost 43×. | Phase A2 |
| D6 | Public margin copy before A4 green? | **"Up to 88%" wording.** Revisit after 7 consecutive daily-rollup green days. | Pricing page deploy |
| D7 | `MAX_CREDITS_PER_TURN` cap value? | **10 credits (= $0.50 revenue ceiling).** Covers Haiku 100k-token turn; bounds estimate-miss risk. | Phase A2 (Layer 5 reconciliation) |
| D8 | Margin threshold that auto-flips user to BYOK-required? | **30%** — any user whose 24-hour spend exceeds 70% of their revenue gets moved to BYOK-only. Chronic whales stop costing the platform within 24 hours. | Phase A4 (Layer 7 circuit breaker) |
| D9 | Trigger threshold for pre-send cost confirmation UI? | **≥ 2 credits** — silent for normal 1-credit turns, explicit confirmation for anything larger. | Phase A2 (Layer 4) |
| D10 | ~~Serve EU customers at launch?~~ | **CLOSED 2026-04-20 → GEO_LAUNCH_POLICY.md** — Geo-block EU (Tier 2 defer) until MRR > $5k. | Phase 0 legal; checkout geo-gate |
| D11 | ~~Serve US customers at launch (risk of sales-tax nexus)?~~ | **CLOSED 2026-04-20 → GEO_LAUNCH_POLICY.md + MOR_EVALUATION.md** — Geo-allow US via Paddle MoR. Paddle handles 50-state sales tax registration + remittance, so nexus is Paddle's problem, not ours. | Phase 0 legal; monitoring dashboard |
| D12 | Publish which model handled each request? | **No.** Disclose provider list generically in ToS ("we route across Anthropic, OpenAI, Google"), but hide per-call model in UI. Protects router.ts as trade secret; users see "AI-powered" not "GPT-4o-mini answered this". | Phase A2 UI; privacy policy |

**Also newly closed 2026-04-20:**

| # | Decision | Resolution | Closed in |
|---|---|---|---|
| D4 | Payment stack for international customers | **CLOSED → Razorpay (IN) + Paddle (RoW).** Paddle was picked over Lemon Squeezy, FastSpring, Paypro Global, Gumroad, Dodo based on India-payout reliability + subscription-feature maturity + tax-jurisdiction coverage. PayPal dropped from plan. | `docs/payments/MOR_EVALUATION.md` |

D1–D6 tracked in task [#87](#). D7–D9 added 2026-04-20 from `COST_GUARDRAILS.md` §8 — they gate Phase A2 Layer 1/3/5/7 implementation. D10–D12 added 2026-04-20 from `PLAN_GAP_ANALYSIS.md` §6; **D10 + D11 closed same day** via GEO_LAUNCH_POLICY.md. D4 reframed and **closed same day** via MOR_EVALUATION.md. Remaining open: D1, D2, D3, D5, D6, D7, D8, D9, D12 (nine decisions).

---

## 5. Phase timeline — one chart

Assuming D1–D6 resolve this week and Razorpay KYC clears by 2026-04-25:

| Week | Phase | Output |
|---|---|---|
| W0 (now — 04-20) | Planning complete | This doc + AI_API_MASTER_PLAN + PAYMENT_GATEWAY_PLAN + MARGIN_VERIFICATION — all committed |
| W1 (04-21 — 04-27) | Payments Phase 0 + AI Phase A0 | KYC docs, legal pages, GSTIN, Paddle KYC + sandbox keys; ANTHROPIC/OPENAI/GEMINI keys on Hostinger; `margin:` field + pricing copy fixed |
| W2 (04-28 — 05-04) | Payments Phase 1 + AI Phase A1 | Webhook routes + checkout UI with per-pack processor policy; `ai_usage` table + `withCreditSpend`; spend-race fix |
| W3 (05-05 — 05-11) | AI Phase A2 | Rate limits + body guards + **context-token cap (Layer 1)** + **Gemini adapter + router.ts (Layer 6)** + **dynamic credit multiplier (Layer 3)** + **pre-send confirmation UI (Layer 4)** + **post-hoc reconcile (Layer 5)** + **streaming early-stop (Layer 8)** + **doc-ops /summarize-document (Layer 10)** — see COST_GUARDRAILS.md |
| W4 (05-12 — 05-17) | AI Phase A3 (BYOK) | `user_api_keys` table, `lib/ai/byok/keystore.ts`, `/app/api-keys` UI, Pro/Studio paths |
| W5 (05-18 — 05-21) | AI Phase A4 | Daily margin rollup cron, `/admin/ai-spend` page, per-provider cost dashboard, **per-user margin circuit breaker (Layer 7)**, **provider invoice reconcile** |
| W5+ | GA readiness | 7 consecutive green days on margin rollup before "up to" copy becomes flat claim |

**Zero-leak bar:** hit when every row in §12 of AI_API_MASTER_PLAN.md's definition-of-done turns green. Planned for 2026-05-21.

---

## 6. Task list pointer

Active tasks tracked in the cowork task manager (not a repo file — it's the shared state):

| Task # | Owns | Status |
|---|---|---|
| #72 | Add `ANTHROPIC_API_KEY` to Hostinger env | PENDING (SEV-1) |
| #80 | Payments Phase 1: webhooks + checkout + shared handleWebhook | PENDING, blocked by #81, #82 |
| #81 | Phase 0 legal: KYC + GSTIN + LUT + Paddle KYC + legal pages | PENDING |
| #82 | Answer PAYMENT_GATEWAY_PLAN.md §10 Q1–Q7 | PENDING |
| #83 | AI Phase A1: `ai_usage` + `withCreditSpend` + fix spend race | PENDING, blocked by #72 |
| #84 | AI Phase A2: rate limits + body guards + **Gemini adapter** + **router.ts** + **context-token cap** + **per-pack checkout** | PENDING, blocked by #83 |
| #85 | AI Phase A3: BYOK (keystore + router + `/api-keys` UI) | PENDING, blocked by #80, #84 |
| #86 | AI Phase A4: margin reporting | PENDING, blocked by #83 |
| #87 | Close margin-leak gaps (6 code fixes + 6 founder decisions) | PENDING, blocks public pricing copy |

---

## 7. What "done" looks like

The site is ready to take real revenue when **all eight** of these are green simultaneously:

1. `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` + `GEMINI_API_KEY` present on Hostinger; `/api/health` reports `ai.configured = true`.
2. Razorpay merchant live + Paddle seller verified (post-KYC); checkout UI shows per-region gateway routing (IN → Razorpay, RoW → Paddle).
3. At least one end-to-end purchase → credit grant → AI call → `ai_usage` row, verified on the test account.
4. `SUM(credit_ledger.delta) = credits.balance` invariant passes for 100% of users on nightly check.
5. Phase A2 context-token cap enforced (try to send 50k tokens to `chat_turn` → 413).
6. `lib/ai/router.ts` routes OCR and translate to Gemini, chat to GPT-4o-mini, generate/sign to Sonnet (verified by `ai_usage.model` distribution on staging).
7. Daily margin rollup has run 7 consecutive days without breaching the per-op floor set in `PROVIDER_STRATEGY.md`.
8. Public pricing page displays "up to 88% / 83% / 78% / 73%" (never flat-claimed), and Starter either reads $7 or has self-serve-only support copy.

Until all eight are green, the site is **not** ready to advertise the full margin claim or take high-volume traffic.

---

## 8. Recent commits for the paper trail

| SHA | Title | Files |
|---|---|---|
| `289f520` | docs(compliance): scrub PayPal from live compliance + ops docs post-D4 — 9 files, 68 insertions / 36 deletions. Regulatory first: `pci-saq-a.md` 10 edits (CSP + Permissions-Policy + scrub() audit-trail + secrets list + annual-attestation URL) — closes line-113 audit-trail regression where SAQ-A pointed at `lib/payments/adapters/paypal.ts` deleted in d6ded77. Operational: `migration-playbook.md` 4 edits, `RAZORPAY_READINESS.md`, `TEST_PLAN.md`, `AI_API_MASTER_PLAN.md §5`. Historical-note headers on `E2E_SMOKE_2026-04-20.md` + `PLAN_GAP_ANALYSIS.md`. `MASTER_PLAN.md` 5 operational refs (W1 timeline, task #81, done-looks-like #2, architecture diagrams, portability anchor). `STATUS.md` Last-Updated prepend. Intentionally retained as historical: `PAYMENT_GATEWAY_PLAN.md` (SUPERSEDED banner), `MARGIN_VERIFICATION.md §1-§11`, `REVENUE_LEAK_AUDIT.md §1-§10`, `MOR_EVALUATION.md`, `margin_scenarios.py`. `npx tsc --noEmit` clean (doc-only). | docs/security/pci-saq-a, docs/payments/migration-playbook, RAZORPAY_READINESS, E2E_SMOKE_2026-04-20, TEST_PLAN, PLAN_GAP_ANALYSIS, MASTER_PLAN, AI_API_MASTER_PLAN, STATUS |
| `d6ded77` | retire(payments): PayPal — D4 cleanup (Paddle replaces on intl rail) — deletes `lib/payments/adapters/paypal.ts` + `app/api/webhooks/paypal/route.ts`, strips PayPal origins from `next.config.mjs` CSP + Permissions-Policy, swaps `.env.example` + README + billing UI refs to Paddle; Razorpay IN rail untouched | lib/payments/*, app/api/webhooks/*, next.config.mjs, .env.example, README.md, app/app/billing, components/billing, app/api/cron/reconcile-payments |
| `7bdcb9e` | docs(legal): Paddle MoR + named sub-processors on privacy/terms/dpa — fixes "No third-party trackers" line that went stale on GA4 + Clarity ship, adds Paddle MoR acknowledgment and 6-entity sub-processor list ahead of Paddle KYC verification crawl | lib/legal-docs.ts, STATUS |
| `7caa568` | feat(payments): Paddle MoR adapter scaffold + webhook route + registry — Seller ID `320957` signup 2026-04-21 | lib/payments/adapters/paddle.ts, lib/payments/registry.ts, app/api/webhooks/paddle/route.ts, STATUS, MASTER_PLAN |
| `37dbe74` | docs(india): CA_CONSULT_PREREAD — deep-research pre-read memo for 15 tax+GST questions | india/CA_CONSULT_PREREAD |
| `fbe5fe9` | docs: v3 gap-close — pricing.ts docstring + FX drag model + PAYMENT_GATEWAY supersede | pricing.ts, margin_scenarios.py, MARGIN_VERIFICATION, PAYMENT_GATEWAY_PLAN |
| `a5d4a71` | docs: MASTER_PLAN paper trail — record 03847ef + 5f52166 commit SHAs | MASTER_PLAN |
| `03847ef` | docs: v3 refresh — MARGIN + REVENUE_LEAK + AI_API_MASTER_PLAN for Paddle MoR era | MARGIN_VERIFICATION, REVENUE_LEAK_AUDIT, AI_API_MASTER_PLAN, margin_scenarios.py, STATUS |
| `5f52166` | docs: MASTER_PLAN paper trail — record 89e9775 commit SHA | MASTER_PLAN |
| `89e9775` | docs: Phase 0 foundation — MoR eval + geo policy + India tax & GST | MOR_EVALUATION, GEO_LAUNCH_POLICY, india/TAX_MODEL, india/GST_SETUP, MASTER_PLAN, STATUS |
| `b1c2bce` | docs: master plan v3 — integrate PLAN_GAP_ANALYSIS + 3 new decisions D10-D12 | MASTER_PLAN |
| `d5ca52a` | docs: add PLAN_GAP_ANALYSIS.md — 42-gap deep audit across all 3 tiers | PLAN_GAP_ANALYSIS |
| `f569c3c` | docs: update MASTER_PLAN.md to v2 — integrate COST_GUARDRAILS refs + D7–D9 | MASTER_PLAN |
| `8ee3a62` | docs(ai): cost guardrails — nine-layer defense against chat-whale + large-PDF attacks | COST_GUARDRAILS |
| `5e0026c` | docs: consolidate all planning work into MASTER_PLAN.md front-door index | MASTER_PLAN |
| `f4751af` | docs(ai): expand margin verification to 11 scenarios + wire gaps into master plan | AI_API_MASTER_PLAN, MARGIN_VERIFICATION, margin_scenarios.py |
| `2264712` | docs(ai): verify claimed margins against provider + processor costs | MARGIN_VERIFICATION (initial) |
| `24cf61c` | docs(ai): master plan for AI API + BYOK — zero-leak, portable, shippable | AI_API_MASTER_PLAN (initial) |
| `2002251` | docs(payments): master plan for Razorpay + PayPal, portable for future providers | PAYMENT_GATEWAY_PLAN |
| `9e5bbda` | docs(ai): correct revenue leak audit — Razorpay + PayPal, not Stripe | REVENUE_LEAK_AUDIT |
| `7bf191c` | docs(ai): add revenue leak audit — every penny accounted for | REVENUE_LEAK_AUDIT (initial) |
| `fa6d998` | docs(ai): add BYOK decision matrix — every path pinned | BYOK_DECISION_MATRIX |

---

## 9. How to use this doc

**Starting a new session:**
1. Read `CLAUDE.md` (credentials + infra IDs).
2. Read `docs/STATUS.md` (live punch list).
3. Read this file.
4. Read the specific plan for the work you're doing.

**Making a planning change:**
1. Edit the relevant plan doc.
2. Update this file if the change affects the phase timeline, the decision list, or the "done" definition.
3. Commit both together so future sessions see a consistent picture.

**Presenting to founders:**
- §1, §4, §5, §7 are the four sections most suitable for a 5-minute standup.
- §3 is the architecture diagram if asked "is this portable?"
- §4 is the decision list that needs their sign-off to unblock the team.

---

*This file is the durable consolidation of every planning decision made in the 2026-04-20 planning sprint. Everything in it is traceable to a commit in `main`; nothing is aspirational.*
