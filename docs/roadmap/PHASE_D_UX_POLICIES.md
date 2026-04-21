# Phase D: UX + policies + legal

_Scope: the safety-net layer. Graceful degradation when the router exhausts. Self-serve refunds. Dunning retries for failed renewals. PDF receipts/invoices. ToS + Privacy Policy + cookie consent. Fraud protection. The admin pages that control all of it._

_This phase makes the product resilient and compliant. Lower code complexity than B or C, but several of these items need your approval on copy and policy before they ship._

## Task #22 — Degradation UX + self-serve refund UI + dunning + fraud dedup

### Degradation UX

**When router exhausts the ladder** (all providers failed, all kill-switched, or all over budget), user today sees a 500 error. Replace with:
- 200 response with `degraded: true` flag.
- Clear UI state: "We're experiencing high demand. Please try again in 30 seconds." + retry button.
- Opt-in: "Email me when this is resolved" → writes to `pending_retries` queue.

**Files.**
- `app/api/ai/*/route.ts` — catch `NoRoutableProviderError` + return degraded response.
- `components/AIOpForm.tsx` (or equivalent) — handle degraded state.
- `cron/retry-degraded.ts` — on recovery, email opt-ins.

### Self-serve refund UI

**7-day window from purchase, one-click, no approval needed.** After 7 days → routes to admin queue (`/admin/refunds`).

**Files.**
- `app/account/billing/refund/[txId]/page.tsx` (new) — confirmation screen.
- `app/api/account/refund/route.ts` — writes to `refund_requests` (status: auto_approved); adapter.refund() runs; ledger reversal written.

### Dunning retry

**Failed renewal charges retry D+1, D+3, D+7 (total 3 attempts).** After 3 fails: subscription cancelled, user emailed, credits revoked at period-end.

**Files.**
- `cron/dunning.ts` — reads `failed_charges`, retries per schedule.
- `db/schema.ts` — `failed_charges` table (id, user_id, transaction_id, attempt_count, next_retry_at, status).

**Stats target:** 30–40% recovery rate on retries (industry benchmark).

### Card fingerprint dedup (fraud prep)

**Each credit_ledger row stores `card_fingerprint` (hash of card BIN + last 4 + issuer, never full PAN).** Flag: same fingerprint > 3 accounts → review queue.

**Files.**
- `lib/payments/fraud.ts` (new) — `computeCardFingerprint(cardData)` + `checkForDuplicates(fingerprint)`.
- Both payment adapters populate `card_fingerprint` on successful charge.

### Acceptance

- Forcing all providers to fail (kill-switch all three) → user gets friendly degraded message, not 500.
- Refund within 7d is instant. Refund after 7d routes to admin.
- Simulate failed renewal → retry fires D+1 correctly.
- Create 4 accounts with same test card → 4th flagged in `/admin/fraud`.

**Status:** planned.

---

## Task #23 — Receipt / invoice generator + GSTIN config

### Receipt mode (pre-GSTIN)

**Every successful transaction emits a PDF receipt, emailed to user within 60s.**
Fields: your legal name (individual), address, user name/email, transaction date, items, currency, amount, payment method (Paddle/Razorpay).

### Tax invoice mode (post-GSTIN)

**Once GSTIN populated**, receipts upgrade to "Tax Invoice":
- GSTIN number
- HSN/SAC code (SAC 998314 for software services)
- GST breakdown (CGST + SGST for intra-state, IGST for inter-state/export)
- Place of supply
- Invoice number series (sequential, per-year — no gaps, per GST rules)

### Files
- `lib/invoicing/generator.ts` — PDF generator (use `pdf-lib` or `@react-pdf/renderer`, not jsPDF for quality).
- `lib/invoicing/templates.ts` — receipt + tax-invoice templates.
- `cron/email-receipt.ts` — fires on webhook success.
- `db/schema.ts` — `invoices` table (id, txn_id, invoice_number, user_id, pdf_url, issued_at, type: "receipt"|"tax_invoice").
- `app/admin/invoicing/page.tsx` — config (GSTIN, company name, address, logo), bulk re-send tool, template editor.

### Acceptance

- Test transaction produces a PDF receipt with correct data.
- Setting GSTIN in admin → next invoice is tax-invoice format.
- Invoice numbering is sequential, persisted, gap-free per Indian tax rules.
- Admin can bulk download a date range (ZIP of PDFs).

**Status:** planned.

---

## Task #24 — ToS + Privacy Policy + cookie consent (DPDP + GDPR)

### Terms of Service updates
- Two payment rails disclosed (Paddle = MoR for international, Razorpay = for India).
- Refund policy (7-day self-serve, admin-approved after).
- Credits expiration (12 months breakage rule).
- Acceptable use (no ToS violations like training competing models on our outputs).
- Governing law + jurisdiction (Indian law once incorporated; until then, your individual capacity).

### Privacy Policy updates
- Clarity + GA4 + Razorpay + Paddle listed as data processors.
- India DPDP Act 2023 compliance: purpose limitation, data minimization, notice, consent, user rights (access, correction, erasure, grievance officer).
- EU GDPR (if you have EU users): lawful basis per processing activity, DPO contact (can be you as individual).
- US state privacy (CCPA etc.): "Do not sell" link (you don't sell, so compliance is straightforward).

### Cookie consent banner
- Explicit opt-in for analytics (Clarity + GA4) per DPDP + GDPR.
- Granular controls (necessary / analytics / marketing).
- Preference stored in user profile (if logged in) + cookie (if anonymous).
- Default: OFF for analytics. Load tags only after consent.

### Files
- `app/legal/terms/page.tsx` — updated ToS.
- `app/legal/privacy/page.tsx` — updated Privacy Policy.
- `components/CookieConsent.tsx` — banner.
- `lib/consent.ts` — consent state management + conditional tag loading.

### Acceptance

- Cookie consent banner blocks Clarity + GA4 until user opts in.
- Opt-in choice persists across sessions.
- ToS + Privacy Policy reviewed by you before publishing (draft → your review → publish).
- Grievance officer section has your contact (required in DPDP).

**Status:** planned. Requires your review of drafts.

---

## Task #25 — Admin pages for plans / promos / compliance / fraud / rate-limits / settings

See `ADMIN_PAGES_CATALOG.md` for per-page spec. Summary:

- `/admin/plans` — pricing editor (USD + INR × monthly + annual × per plan).
- `/admin/promos` — promo code manager + redemption analytics.
- `/admin/compliance` — DPDP/GDPR data export + delete requests (admin approves, actual export job runs).
- `/admin/fraud` — flagged accounts review, manual block/unblock.
- `/admin/rate-limits` — per-user cost ceiling overrides.
- `/admin/settings` — admin allow-list, audit log, company config.
- `/admin/invoicing` — covered under Task #23.

### Schema additions
- `plans` (id, name, is_active)
- `plan_prices` (Phase C already added) + extended with `is_active`, `deprecated_at`
- `promo_codes` (code, type, value, expiry, max_redemptions, applies_to_*)
- `promo_redemptions` (id, code, user_id, used_at, txn_id)
- `compliance_requests` (id, user_id, type: export|delete, status, requested_at, completed_at)
- `fraud_flags` (id, user_id, reason, severity, created_at, resolved_at)
- `user_rate_limits` (Phase A already added)
- `admin_users` (email, role, created_at)
- `admin_audit_log` (id, admin_email, action, target_type, target_id, diff, at, ip)

### Acceptance

- Change a plan price in admin → new checkouts use new price; existing subscriptions grandfathered until renewal.
- Create a promo code → user redeems it → redemption logged, discount applied, admin sees analytics.
- DPDP export request → ZIP generated within 30 days (target 1 hour), emailed.
- Fraud flag → user next login sees a block screen with support email.
- Rate limit override for single user takes effect on next call.
- Every admin action writes to audit log.

**Status:** planned.

---

## Phase D completion bar

- All four tasks shipped.
- Router exhaust now lands a friendly UI state.
- Self-serve refund tested end-to-end.
- Dunning cron catches a simulated failed renewal.
- First real receipt emailed from production.
- ToS + Privacy Policy + consent banner live after your review.
- All Phase D admin pages functional.
- `docs/STATUS.md` updated.
