# docs/ — Map

_Last updated: 2026-04-21._

One-page index of every doc in the `docs/` tree plus `CLAUDE.md` at repo root. Each entry is a one-liner; follow the link for full content. Files are grouped by the question they answer.

---

## Start here

| File | Answers |
|---|---|
| [`/CLAUDE.md`](../CLAUDE.md) | Session bootstrap — GitHub PAT, Hostinger SSH, infra IDs, deploy flow. **Every new session reads this first.** |
| [`STATUS.md`](./STATUS.md) | Append-only project journal — what was done, when, and how it was verified. |
| [`REMAINING_WORK.md`](./REMAINING_WORK.md) | Always-current view of what's left — DONE / BLOCKED / READY-TO-WORK with unblock owners. |

---

## Deploy + infrastructure

| File | Answers |
|---|---|
| [`DEPLOYMENT_NOTES.md`](./DEPLOYMENT_NOTES.md) | Hostinger env vars, Cloudflare state, Google OAuth config, known gotchas (503-after-deploy recovery). |
| [`DEV_SETUP.md`](./DEV_SETUP.md) | Local dev setup — clone, install, run, test. |
| [`E2E_SMOKE_2026-04-20.md`](./E2E_SMOKE_2026-04-20.md) | Snapshot of the 2026-04-20 end-to-end smoke run (historical — current state lives in `STATUS.md`). |
| [`TEST_PLAN.md`](./TEST_PLAN.md) | Test coverage strategy — unit / smoke / E2E / production assertions. |

---

## Master plans (strategy)

| File | Answers |
|---|---|
| [`MASTER_PLAN.md`](./MASTER_PLAN.md) | The one-shot plan spanning infra, payments, AI, tax, geo. Top-level narrative. |
| [`PLAN_GAP_ANALYSIS.md`](./PLAN_GAP_ANALYSIS.md) | Adversarial third pass — 42 gaps across regulatory, operational, product, financial angles. _Has 2026-04-21 historical note re: PayPal→Paddle swap._ |
| [`FEATURE_TRACKER.md`](./FEATURE_TRACKER.md) | Product-level feature checklist (OCR, merge/split, compress, etc.). |

---

## Payments (Razorpay live, Paddle scaffolded)

| File | Answers |
|---|---|
| [`RAZORPAY_READINESS.md`](./RAZORPAY_READINESS.md) | Razorpay go-live checklist — keys, webhooks, CSP, adapter boot verification. |
| [`payments/PAYMENT_GATEWAY_PLAN.md`](./payments/PAYMENT_GATEWAY_PLAN.md) | Dual-gateway architecture (Razorpay IN + Paddle MoR global), registry pattern, adapter interface. |
| [`payments/MOR_EVALUATION.md`](./payments/MOR_EVALUATION.md) | Why Paddle MoR over PayPal/Stripe/LemonSqueezy — tax absorption, chargeback handling, fee math. |
| [`payments/migration-playbook.md`](./payments/migration-playbook.md) | The D4 PayPal→Paddle migration runbook (now historical — cutover complete). |

---

## India tax (GST, OIDAR, export-of-service)

| File | Answers |
|---|---|
| [`india/TAX_MODEL.md`](./india/TAX_MODEL.md) | Tax math per scenario — GST collection, OIDAR classification, zero-rated exports. |
| [`india/GST_SETUP.md`](./india/GST_SETUP.md) | GSTIN registration mechanics — which state, QRMP eligibility, e-invoicing threshold. |
| [`india/CA_CONSULT_PREREAD.md`](./india/CA_CONSULT_PREREAD.md) | 7 tax questions + 8 GST questions for the CA appointment (Task #2 pre-read). |

---

## AI cost model + margin verification

| File | Answers |
|---|---|
| [`ai/architecture.md`](./ai/architecture.md) | Top-level AI stack — providers, models, routing, safety. |
| [`ai/AI_API_MASTER_PLAN.md`](./ai/AI_API_MASTER_PLAN.md) | Phased AI rollout plan across features. |
| [`ai/PROVIDER_STRATEGY.md`](./ai/PROVIDER_STRATEGY.md) | OpenAI vs Anthropic vs others — per-feature provider pick and fallback order. |
| [`ai/MODELS_AND_MULTI_KEY.md`](./ai/MODELS_AND_MULTI_KEY.md) | Model selection by feature + multi-key rotation for rate-limit spread. |
| [`ai/BYOK_DECISION_MATRIX.md`](./ai/BYOK_DECISION_MATRIX.md) | Bring-your-own-key tier decision — when to allow, pricing implications. |
| [`ai/MARGIN_VERIFICATION.md`](./ai/MARGIN_VERIFICATION.md) | v3 margin model — processor fees, AI costs, net-per-conversion table. |
| [`ai/COST_GUARDRAILS.md`](./ai/COST_GUARDRAILS.md) | Per-user / per-feature spend caps + alerting thresholds. |
| [`ai/REVENUE_LEAK_AUDIT.md`](./ai/REVENUE_LEAK_AUDIT.md) | Places margin can leak (refunds, chargebacks, abuse, over-provisioning). |
| [`ai/margin_scenarios.py`](./ai/margin_scenarios.py) | Executable scenario runner for margin math. |

---

## Geography + checkout routing

| File | Answers |
|---|---|
| [`GEO_LAUNCH_POLICY.md`](./GEO_LAUNCH_POLICY.md) | Tier-1 / Tier-2 / Tier-3 country classification + what each tier sees (block / waitlist / buy). |
| [`ops/CLOUDFLARE_GEOBLOCK_SETUP.md`](./ops/CLOUDFLARE_GEOBLOCK_SETUP.md) | Cloudflare WAF rule definition + dashboard steps for Task #3 sub-item (1c). |

---

## Security + compliance

| File | Answers |
|---|---|
| [`security/pci-saq-a.md`](./security/pci-saq-a.md) | PCI-DSS SAQ-A self-assessment — Razorpay-only post-D4, no PAN touches our servers. |

---

## Quick lookups

- **"Where's the prod commit SHA?"** → [`DEPLOYMENT_NOTES.md`](./DEPLOYMENT_NOTES.md) §Production environment.
- **"What's blocking me?"** → [`REMAINING_WORK.md`](./REMAINING_WORK.md) §2.
- **"Why did we pick Paddle?"** → [`payments/MOR_EVALUATION.md`](./payments/MOR_EVALUATION.md).
- **"What's the margin per sale?"** → [`ai/MARGIN_VERIFICATION.md`](./ai/MARGIN_VERIFICATION.md) v3 table.
- **"Which country sees the waitlist?"** → [`GEO_LAUNCH_POLICY.md`](./GEO_LAUNCH_POLICY.md) tier tables.
- **"Did I rotate the PAT?"** → [`/CLAUDE.md`](../CLAUDE.md) §2(a), line with `Expires:`.
- **"What questions for the CA?"** → [`india/CA_CONSULT_PREREAD.md`](./india/CA_CONSULT_PREREAD.md).

---

_When adding a new doc, add a row to the right section here. This file is the table of contents — keep it honest._
