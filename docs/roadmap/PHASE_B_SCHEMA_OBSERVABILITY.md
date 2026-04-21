# Phase B: Schema + observability

_Scope: unify the financial schema so net margin is computable, wire Paddle webhooks to populate it, amortize infra cost per call, and ship the 14-page admin dashboard. User dashboard audited + stripped of leaks._

_This is the single largest phase — no point optimizing margin we can't measure. Expect 2–3 focused days._

## Task #15 — Expand credit_ledger schema (fee / tax / FX / net columns)

**What.** Every credit_ledger row becomes self-describing: gross charge, fees taken, taxes collected/remittable, FX leg realized, net revenue to our books.

**New columns on `credit_ledger`.**
| Column | Type | Purpose |
|---|---|---|
| `gross_charge_micros` | bigint | What the customer was billed (their currency) |
| `billing_currency` | char(3) | "USD" or "INR" |
| `provider` | enum | "paddle" / "razorpay" / "manual" / "refund_reversal" |
| `processor_fee_micros` | bigint | Paddle/Razorpay fee taken before payout |
| `tax_collected_micros` | bigint | GST/VAT/sales tax collected |
| `tax_treatment` | enum | "mor" (Paddle absorbs), "forward" (Razorpay charges GST), "rcm" (foreign-buyer RCM), "none" |
| `tax_remittable_micros` | bigint | Of `tax_collected`, how much we owe to a tax authority (0 for MoR, full amount for Razorpay) |
| `fx_rate_used` | decimal(18,8) | The FX rate applied to convert to USD for accounting |
| `fx_slippage_micros` | bigint | Cost of FX conversion vs. reference rate |
| `net_revenue_micros` | bigint | `gross_charge_micros - processor_fee_micros - tax_remittable_micros - fx_slippage_micros`, expressed in USD micros |
| `card_fingerprint` | varchar(64) nullable | For fraud dedup (Phase D) |

**Files to touch.**
- `db/schema.ts` — extend `credit_ledger` table.
- `db/migrations/NNNN_credit_ledger_financials.sql` — Drizzle-generated migration.
- `lib/payments/ledger.ts` (new or refactor existing) — `recordPayment(...)` accepts the full object, writes all columns.
- Backfill script `scripts/backfill-credit-ledger.mjs` — pulls Paddle API history for existing rows.

**Acceptance criteria.**
- Migration runs on staging without data loss.
- Every existing row has either: real data from backfill, OR a synthetic estimate with `data_source: "estimate"` flag (new column).
- New column `data_source` enum: "webhook" (real) / "backfill_api" (from Paddle API) / "estimate" (synthesized).

**Status:** planned.

---

## Task #16 — Paddle webhook handler populates ledger columns

**What.** Receive Paddle webhook events (transaction.completed, subscription.cancelled, etc.), verify signature, write fully-populated credit_ledger rows.

**Files to touch.**
- `app/api/webhooks/paddle/route.ts` (new) — verify `paddle-signature` header against `PADDLE_WEBHOOK_SECRET`; idempotency key on `event.id`.
- `lib/payments/adapters/paddle.ts` — map Paddle event payload → `recordPayment` call.
- Events to handle: `transaction.completed`, `transaction.updated`, `subscription.created`, `subscription.cancelled`, `adjustment.created` (refunds).

**Sandbox first.** `PADDLE_ENV=sandbox` routes to sandbox API. Live mode gated on Paddle KYC completion (currently in progress per CLAUDE.md §6).

**Acceptance criteria.**
- Sandbox test transaction produces a credit_ledger row with all financial columns populated from Paddle's actual payload (not estimates).
- Signature verification blocks unsigned + wrong-signed requests.
- Idempotent — duplicate webhook delivery doesn't double-count.

**Status:** planned.

---

## Task #17 — Infra per-call amortization + refund reserve + breakage

**What.** Three finishing touches to make the net-margin math honest.

**Infra amortization.**
- Monthly infra fixed cost constant: `INFRA_MONTHLY_USD_MICROS` in env (e.g., 15000000 for ~$15/mo Hostinger + CF).
- Daily rollup divides by prior-day call count and stores as `infra_cost_per_call_micros`.
- Subtracted from `net_revenue_micros` in `/admin/margin` view.

**Refund reserve.**
- New column `refund_reserve_micros` on `ai_daily_margin`.
- Each day's rollup accrues 3% of net revenue as reserve (configurable `REFUND_RESERVE_BPS` env).
- Refunds consume reserve; over/under-reserve tracked.

**Credit breakage.**
- `credit_ledger` rows with `credits_remaining > 0` and `created_at < NOW() - INTERVAL 12 MONTH` → recognized as breakage revenue (no COGS).
- `BREAKAGE_RECOGNITION_MONTHS` env default 12.
- Breakage shown as positive-margin line on `/admin/margin`.

**Files to touch.**
- `lib/ai/margin-rollup.ts` — add all three computations to `runDailyRollup`.
- `db/schema.ts` — extend `ai_daily_margin`.
- `cron/daily-rollup.ts` — ensure it runs after midnight UTC.

**Status:** planned.

---

## Task #18 — Admin dashboard v2 (13 pages)

**What.** Ship `/admin/*` per the catalog. Use Next.js app router layout. Admin role gate in `middleware.ts`.

**Files.**
- `app/admin/layout.tsx` — admin shell with nav + role check.
- `app/admin/page.tsx` — overview.
- `app/admin/revenue/page.tsx`, `costs/`, `margin/`, `users/`, `users/[id]/`, `ops/`, `providers/`, `router/`, `alarms/`, `transactions/`, `credits/`, `deploy/`, `logs/` — one page each per catalog.
- `lib/admin/auth.ts` — `requireAdmin()` helper.
- `lib/admin/queries.ts` — SQL queries for each widget.

**UI library.** Use existing Tailwind setup. Add recharts for visualizations (already available in package.json — verify).

**Each page must have.**
- Role gate applied (404 if non-admin).
- Date range filter (where applicable).
- CSV export.
- Clear empty-state when no data.

**Status:** planned.

---

## Task #19 — User dashboard v2 (credits/plan/usage only)

**What.** Refactor `/account/*` to remove any provider/cost/margin surface. Leak audit.

**Audit checklist (every page):**
- [ ] No provider name anywhere.
- [ ] No per-op cost (money or credits? credits only).
- [ ] No margin metric.
- [ ] No cost matrix reference.
- [ ] No router decision.
- [ ] No raw AI response metadata that could hint at provider.

**Files.**
- `app/account/page.tsx` — credits remaining, plan, renewal, last 10 usage events (op category only).
- `app/account/usage/page.tsx` — usage bars by op, credit consumption trend.
- `app/account/billing/page.tsx` — invoices, payment methods, plan change, cancel.
- `app/account/settings/page.tsx` — profile, password, notifications, data export/delete.

**Tests.**
- E2E test: log in as regular user, load every `/account/*` page, grep response for "anthropic", "openai", "gemini", "margin", "cost_micros" — should find nothing.

**Status:** planned.

---

## Phase B completion bar

- All 5 tasks shipped.
- `/admin/margin` shows a real net margin number (not AI gross margin).
- Paddle sandbox webhook delivers signed events that populate credit_ledger correctly.
- User-facing leak audit passes (automated grep).
- `docs/STATUS.md` updated; `docs/DEPLOYMENT_NOTES.md` commit SHA bumped.
