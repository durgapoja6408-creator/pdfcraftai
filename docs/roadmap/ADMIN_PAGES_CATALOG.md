# Admin Pages Catalog

_Single source of truth for every admin page. Every entry includes route, purpose, features, data source, permissions, status, and phase._

## Permission model

All `/admin/*` routes are role-gated. The auth layer checks `session.user.role === "admin"` (or `session.user.email` in an allow-list) before rendering. Non-admin sessions get 404 (not 403 — we do not advertise admin surfaces exist).

**Never displayed to non-admin users under any circumstances:**
- Provider names (anthropic/openai/gemini)
- Per-op cost or margin
- Cost matrix
- Router decisions
- AI_usage rows
- Other users' data

## Phase A pages (code-only, ship with Phase A tasks)

### `/admin/kill-switches`
**Purpose:** Emergency off-switches for providers, ops, and features.
**Features:** Toggle AI_KILL_{ANTHROPIC,OPENAI,GEMINI} + AI_KILL_{OP} + FEATURE_KILL_{NAME}; shows current env values; "last toggled by" audit entry.
**Data source:** Server env + audit log table.
**Status:** planned (Task #12).

### `/admin/evals` (scaffold)
**Purpose:** Eval harness results + per-op quality floor.
**Features (Phase A):** Read-only table of last eval run per op × provider; quality score per golden-set case; pass/fail against floor. (Fuller A/B features land in Phase E.)
**Data source:** `eval_runs` table (populated by `scripts/eval-ops.mjs`).
**Status:** planned (Task #14).

## Phase B pages (schema-dependent)

### `/admin` (overview dashboard)
**Purpose:** Single-glance health. Home page for admins.
**Features:** MRR (30d), net margin %, open alarms, primary-share %, today's signups, today's AI cost, deploy commit SHA, any red-line alerts.
**Data source:** `ai_daily_margin` + `credit_ledger` + `alarms` + runtime env.
**Status:** planned (Task #18).

### `/admin/revenue`
**Purpose:** Where the money comes from.
**Features:** Revenue by rail (Paddle/Razorpay), by currency (USD/INR), by plan, by period (D/W/M/Q/Y). Stacked bar + CSV export.
**Data source:** `credit_ledger` with the new fee/tax/FX columns.
**Status:** planned (Task #18).

### `/admin/costs`
**Purpose:** Where the money goes.
**Features:** AI cost per op, per provider, per day. Infra amortized. Tax outflow. Refund reserve accrual. Waterfall from gross → net.
**Data source:** `ai_usage` + `ai_daily_margin` + `credit_ledger` tax/FX columns.
**Status:** planned (Task #18).

### `/admin/margin`
**Purpose:** The number that matters.
**Features:** Gross margin vs. contribution margin vs. net margin (three lines). Per-op waterfall. Per-rail split. Per-cohort LTV. Day/week/month trending.
**Data source:** Derived from `ai_daily_margin` + `credit_ledger`.
**Status:** planned (Task #18).

### `/admin/users`
**Purpose:** Per-user P&L ranking.
**Features:** Sortable table — email, signup date, plan, MRR, LTV, 30d AI cost, 30d net revenue, 30d margin %. Flag loss-making users.
**Data source:** `users` + `credit_ledger` + `ai_usage` (aggregated per user).
**Status:** planned (Task #18).

### `/admin/users/[id]`
**Purpose:** Single-user drilldown.
**Features:** Profile, full transaction history, credit ledger, usage by op, support tickets link, manual credit grant button (logged), rate-limit override button, flag-as-fraud button. Read-only view of session/login history.
**Data source:** `users` + related tables.
**Status:** planned (Task #18).

### `/admin/ops`
**Purpose:** Per-op health.
**Features:** For each of the 10 ops (ocr/translate/chat/summarize/compare/generate/sign/rewrite/table/redact): 30d call volume, median latency, p99 latency, cost per call, quality score from evals, primary-share %, error rate.
**Data source:** `ai_usage` + `eval_runs`.
**Status:** planned (Task #18).

### `/admin/providers`
**Purpose:** Per-provider health.
**Features:** For each provider (anthropic/openai/gemini): 30d call volume, cost per call, error rate, latency percentiles, kill-switch status, current pricing $/Mtok (from cost matrix), last price-change date.
**Data source:** `ai_usage` + `docs/ai/COST_MATRIX_3PROVIDER.md`.
**Status:** planned (Task #18).

### `/admin/router`
**Purpose:** Live routing policy transparency.
**Features:** Current `ROUTING_POLICY` table rendered as a matrix (op × provider × priority). Env-var overrides (`AI_ROUTER_{OP}`) shown inline. Primary-share metric per op (target: >70%). Link to edit policy (opens PR workflow — no direct edit from admin UI).
**Data source:** `lib/ai/router.ts` source + runtime env + `ai_usage` aggregated.
**Status:** planned (Task #18).

### `/admin/alarms`
**Purpose:** Alarm feed.
**Features:** Active alarms (margin_drift, primary_share, dark_routing, new ones), history, ack button, resolve button, assignee field. Link from each alarm to its SQL in `docs/ai/REVENUE_LEAK_AUDIT.md`.
**Data source:** `alarms` + `alarm_events` tables.
**Status:** planned (Task #18).

### `/admin/transactions`
**Purpose:** Payment log (both rails).
**Features:** Chronological table of every Paddle + Razorpay transaction. Columns: time, user, rail, currency, gross, fee, tax, net, status. Filter by status, rail, date range. Link to admin refund action.
**Data source:** `credit_ledger` (new columns).
**Status:** planned (Task #18).

### `/admin/credits`
**Purpose:** Credit ledger + breakage tracking.
**Features:** All credit grants (paid/promo/refund) and consumption events. Breakage rate per cohort. Outstanding deferred-revenue balance. Aged credits heat-map.
**Data source:** `credit_ledger` + `credit_consumption` tables.
**Status:** planned (Task #18).

### `/admin/deploy`
**Purpose:** Deploy awareness without leaving the admin panel.
**Features:** Current commit SHA, last 10 commits with deploy times, health-check status per route, manual redeploy link (opens Hostinger), link to GitHub Actions (if configured later).
**Data source:** `/api/health` + GitHub API (read-only).
**Status:** planned (Task #18).

### `/admin/logs`
**Purpose:** Recent error search.
**Features:** Structured log search (server errors, failed webhooks, router exhausted events). Filter by level, route, user. Last 7 days retention in-app (longer in Hostinger).
**Data source:** Server-side structured log writer (new).
**Status:** planned (Task #18).

## Phase C pages

### `/admin/refunds`
**Purpose:** Refund approval queue.
**Features:** User-initiated requests awaiting admin review; reason code + free text; approve → hit Paddle/Razorpay refund API + write to ledger; reject with note. Read-only view of auto-approved refunds (within 7-day self-serve window).
**Data source:** `refund_requests` table + `credit_ledger` reversals.
**Status:** planned (Task #21).

### `/admin/chargebacks`
**Purpose:** Dispute tracker.
**Features:** Incoming chargebacks from both rails; evidence upload slot; status (new/contested/won/lost); aggregate chargeback rate (target <0.5%).
**Data source:** `chargebacks` table + webhooks from Paddle/Razorpay dispute events.
**Status:** planned (Task #21).

### `/admin/fx`
**Purpose:** FX rate history + realized slippage.
**Features:** Daily USD↔INR reference rate (from an FX feed — TBD: ExchangeRate-API or equivalent); realized rate per transaction; cumulative FX slippage $/₹; breakdown by rail.
**Data source:** `fx_rates_daily` table + `credit_ledger.fx_slippage_micros`.
**Status:** planned (Task #21).

### `/admin/tax`
**Purpose:** GST tracker + RCM ledger.
**Features:** GST collected on forward-charge invoices (Razorpay); GST remitted (monthly filings); ITC claimed (input credits from AI APIs, hosting); RCM liability on Anthropic/OpenAI imports (self-assessed 18%); net GST position.
**Data source:** `credit_ledger` tax columns + `rcm_ledger` new table for imports.
**Status:** planned (Task #21). Requires GSTIN to go live (otherwise shows "not registered" placeholder with accrued-but-unclaimed ITC).

## Phase D pages

### `/admin/plans`
**Purpose:** Pricing editor.
**Features:** USD + INR price tables per plan; monthly/annual toggle; effective date; deprecation flow (grandfathering existing customers). Preview price change impact on MRR before applying.
**Data source:** `plans` + `plan_prices` tables.
**Status:** planned (Task #25). Requires your pricing decisions before going live.

### `/admin/promos`
**Purpose:** Promo code manager.
**Features:** Create/edit codes (percent-off or credits-grant), set expiry, max redemptions, applies_to_plan, applies_to_rail. Redemption analytics — conversion lift, LTV of promo users vs. non.
**Data source:** `promo_codes` + `promo_redemptions` tables.
**Status:** planned (Task #25).

### `/admin/compliance`
**Purpose:** GDPR + India DPDP Act requests.
**Features:** Data-export requests (auto-generate ZIP of user's data); delete requests (soft-delete → hard-delete after 30d); consent audit log.
**Data source:** `compliance_requests` table + user data joins.
**Status:** planned (Task #25).

### `/admin/fraud`
**Purpose:** Flagged account review.
**Features:** Card fingerprint dedup hits (same card, multiple accounts); velocity anomalies; manual flag/unflag; block list.
**Data source:** `fraud_flags` table + `credit_ledger.card_fingerprint`.
**Status:** planned (Task #25).

### `/admin/rate-limits`
**Purpose:** Per-user cost ceiling management.
**Features:** Default daily/monthly cost ceilings from env. Per-user override (higher or lower). Hard block when hit — graceful error to user, alert in admin.
**Data source:** `user_rate_limits` table + env defaults.
**Status:** planned (Task #25).

### `/admin/settings`
**Purpose:** Admin users + audit log.
**Features:** Admin allow-list (email addresses). Role assignment (admin/readonly). Full audit log of every admin action (who, when, what, IP). Required for SOC-2-ish hygiene even pre-certification.
**Data source:** `admin_users` + `admin_audit_log` tables.
**Status:** planned (Task #25).

### `/admin/invoicing`
**Purpose:** Receipt/invoice generator + GSTIN config.
**Features:** GSTIN field (null → "Receipt" mode; populated → "Tax Invoice" mode). Invoice template editor. Bulk download receipts for a date range. Manual re-send invoice to user.
**Data source:** `invoice_config` table + template engine.
**Status:** planned (Task #23 / Task #25 for admin UI).

## Phase E pages

### `/admin/prompts`
**Purpose:** Prompt version registry + A/B testing.
**Features:** For each op, list of prompt versions with deploy status (active/archived/draft); A/B test config (split %, duration); per-version quality + cost metrics from evals; promote/rollback controls.
**Data source:** `prompt_versions` + `prompt_ab_tests` + `eval_runs`.
**Status:** planned (Task #26).

### Cohort analytics (view inside `/admin/margin`)
**Purpose:** Signup-month × plan × LTV × margin.
**Features:** Heatmap of cohort retention. Per-cohort contribution margin. Flag cohorts underperforming.
**Data source:** Aggregated from existing tables — no new schema.
**Status:** planned (Task #27).

## User-facing pages (hard wall — audit each for leaks)

### `/account` (home)
**Shows:** Credits remaining, plan name, renewal date, last 10 usage events (by op category only — no provider).
**Never shows:** Provider name, cost, margin, router decision.

### `/account/usage`
**Shows:** Monthly usage bars by op (OCR / Translate / Summarize / etc.), credit consumption trend.
**Never shows:** Cost per op, provider, tokens.

### `/account/billing`
**Shows:** Invoices, payment methods, plan upgrade/downgrade, cancellation flow.
**Never shows:** Processor fee, tax breakdown beyond what's legally required on the invoice.

### `/account/settings`
**Shows:** Profile, password, notifications, data export/delete (DPDP/GDPR).

**Leak audit acceptance for Phase B:** Every `/account/*` page manually reviewed. Any field that could infer cost or provider is either removed, aggregated, or replaced with a credit-unit surface.
