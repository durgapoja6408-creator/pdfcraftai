# Phase C: Dual-rail payment (Paddle + Razorpay)

_Scope: add Razorpay as the INR rail alongside existing Paddle USD. Country-based routing at checkout. Ship the refund/chargeback/FX/tax admin pages that become meaningful once we have two rails._

_Depends on Phase B — the credit_ledger must already carry `provider` + `billing_currency` + tax columns before this lands._

## Task #20 — Razorpay adapter + dual-rail routing

### Adapter interface

**`lib/payments/adapter.ts`** (new, single source of truth for both rails):

```ts
export interface PaymentAdapter {
  id: "paddle" | "razorpay";
  createCheckoutSession(input: {
    userId: string;
    planId: string;
    currency: "USD" | "INR";
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ redirectUrl: string; sessionId: string }>;

  verifyWebhookSignature(req: Request): Promise<boolean>;

  parseWebhookEvent(req: Request): Promise<NormalizedPaymentEvent>;

  refund(transactionId: string, amountMicros: number, reason: string): Promise<RefundResult>;
}
```

Both `paddle.ts` and `razorpay.ts` implement this. Rest of the app only sees the interface.

### Razorpay-specific bits

**Files to touch.**
- `lib/payments/adapters/razorpay.ts` (new).
- `app/api/webhooks/razorpay/route.ts` (new) — HMAC-SHA256 signature verify.
- `app/api/checkout/razorpay/route.ts` (new) — creates order via Razorpay API, returns `order_id` for Razorpay.js modal.
- `components/checkout/RazorpayButton.tsx` (new) — loads Razorpay SDK, opens modal.
- Razorpay dashboard setup: account KYC (individual, no GSTIN yet), webhook URL, API keys.

**Env vars.**
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_ENV` — "test" or "live"

### Country-based routing

**`lib/payments/router.ts`** (new):

```ts
export function pickRail({
  billingCountry, // from checkout form
  ipCountry,      // from geolocation
  cardBin,        // optional, lookup for extra signal
  userChoice,     // explicit override button
}): { rail: "paddle" | "razorpay"; currency: "USD" | "INR"; confidence: "high"|"medium"|"low" }
```

Rules:
1. If `userChoice` set, use it (log `user_forced_rail: true`).
2. If `billingCountry === "IN"` AND `ipCountry === "IN"` → razorpay/INR, high confidence.
3. If `billingCountry === "IN"` OR `cardBin === "IN"` → razorpay/INR, medium confidence, show "Paying from outside India?" link.
4. Otherwise → paddle/USD.

### INR price table

**`db/schema.ts`** — `plan_prices` table:
```
(plan_id, currency, interval, amount_micros, is_active, effective_from, effective_until)
```

Populate with placeholder INR prices initially. Admin `/admin/plans` (Phase D) lets you edit.

### Acceptance criteria

- Indian user on Indian IP lands on checkout → sees INR pricing + Razorpay button.
- International user → sees USD pricing + Paddle button.
- Manual rail-switch link works.
- Razorpay test-mode transaction writes a credit_ledger row with `provider: razorpay`, `billing_currency: INR`, `tax_treatment: none` (or `forward` once GSTIN added).
- Refund via admin button hits the correct adapter's `refund()` method.

**Status:** planned.

---

## Task #21 — Admin pages for refunds / chargebacks / FX / tax

See `ADMIN_PAGES_CATALOG.md` for full spec. Summary:

- `/admin/refunds` — queue + approve/reject + reason codes. Auto-approved self-serve refunds (within 7d) shown read-only.
- `/admin/chargebacks` — dispute tracker pulling from both rails' webhook events.
- `/admin/fx` — FX rate history table + realized slippage. FX feed: add a free tier of ExchangeRate-API (or similar) as daily cron.
- `/admin/tax` — GST collected/remittable, ITC claimed, RCM ledger for Anthropic/OpenAI imports. GSTIN placeholder.

### New schema
- `refund_requests` (id, user_id, transaction_id, amount_micros, reason_code, reason_text, status, submitted_at, resolved_at, resolved_by)
- `chargebacks` (id, rail, external_id, transaction_id, amount_micros, status, evidence_uploaded_at, outcome)
- `fx_rates_daily` (date, pair, reference_rate, source)
- `rcm_ledger` (id, invoice_date, vendor, vendor_country, usd_amount, inr_equiv, rcm_gst_payable, rcm_gst_paid, itc_claimed)

### Acceptance
- Submit a refund request from user dashboard → appears in admin queue → approve → money refunded via adapter → credit_ledger reversal written.
- Simulated chargeback webhook from Paddle sandbox → appears in `/admin/chargebacks`.
- FX cron runs daily, populates `fx_rates_daily`.
- Every new Anthropic/OpenAI `ai_usage` row writes an RCM ledger entry (even at zero liability pre-GSTIN, for future ITC eligibility).

**Status:** planned.

---

## Phase C completion bar

- INR checkout working end-to-end in Razorpay test mode.
- Both webhook handlers writing unified credit_ledger rows.
- All 4 Phase C admin pages live.
- Simulated transaction from each rail verified in `/admin/transactions`.
- `docs/STATUS.md` and `docs/DEPLOYMENT_NOTES.md` updated.

## Gotchas

- **Razorpay auto-debit / subscriptions** require completed KYC with GSTIN on Razorpay's business plan. For early Phase C, scope is **one-time credit purchases only**. Subscription auto-renewal for INR users can land in Phase D or later alongside dunning work.
- **Currency display on UI** must be deterministic — same user, same session, same price. Use the rail router output to drive all price-display components.
- **Feature-flag rollout.** Gate Razorpay checkout behind `FEATURE_RAZORPAY=true` so you can disable in one env change if test-mode behaves unexpectedly in production.
