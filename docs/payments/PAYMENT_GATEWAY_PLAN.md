# Payment Gateway Plan — Razorpay + PayPal, Portable Forever

**Date:** 2026-04-20
**Status:** Master plan, ordered by dependency. Every section is either a
checklist or a spec. Do not skip sections.
**Owner:** project lead (not Claude); Claude implements under direction.

---

## 0. Purpose

Ship paid-credit packs on pdfcraftai.com using **Razorpay** (primary,
Indian merchant, handles INR + USD) and **PayPal** (secondary,
international fallback). Do it without painting ourselves into a corner:
every layer must accept a **third** provider (Cashfree, Stripe, Paddle,
LemonSqueezy) with **zero changes to business code** — only a new
adapter file and four env vars.

The portability contract is already in `lib/payments/` (reviewed
2026-04-20). This plan closes the implementation and operational gaps
around it.

---

## 1. What exists today vs. what is missing

### 1.1 Already built (verified in-repo, 2026-04-20)

| Layer | File | State |
|---|---|---|
| Provider interface | `lib/payments/provider.ts` | Done. Portable, well-commented. |
| Provider types | `lib/payments/types.ts` | Done. `ProviderId` is open string; `NormalizedPaymentEvent` is discriminated union. |
| Env-driven registry | `lib/payments/registry.ts` | Done. Lazy adapters, per-process cache, `selectProvider({currency, mode, preferredId})`. |
| Razorpay adapter | `lib/payments/adapters/razorpay.ts` | Done. Orders API, subscriptions, webhooks (HMAC-SHA256), refunds, reconciliation iterator, PAN scrubber. |
| PayPal adapter | `lib/payments/adapters/paypal.ts` | Done (assumed same shape; audit in §10). |
| Checkout server action | `lib/payments/checkout-actions.ts` | Done. Mints internal UUID, writes pending row, calls adapter, returns `CheckoutSession`. |
| Refund server action | `lib/payments/refund-actions.ts` | Done. Resolves providerRef, calls `refundByProviderRef`. |
| Ledger writer | `lib/payments/ledger.ts` | Done. `grantCredits` (idempotent) + `applyPaymentEvent`. |
| DB schema | `db/schema/app.ts` | Done. `payments`, `credit_ledger`, `subscriptions`, `webhook_events` all present with correct unique indexes. |
| Pricing config | `lib/pricing.ts` | Done. `CREDIT_PACKS`, `AI_OPERATION_COSTS`. |

### 1.2 Missing (production blockers — this plan ships them)

| Layer | File (to create) | Blocker? |
|---|---|---|
| Webhook HTTP route (Razorpay) | `app/api/payments/webhook/razorpay/route.ts` | **P0** |
| Webhook HTTP route (PayPal) | `app/api/payments/webhook/paypal/route.ts` | **P0** |
| Checkout UI page | `app/pricing/checkout-button.tsx` (client) + SDK loaders | **P0** |
| Success/cancel return pages | `app/pricing/success/page.tsx`, `app/pricing/cancel/page.tsx` | **P0** |
| Reconciliation cron | `app/api/cron/reconcile-payments/route.ts` | **P1** |
| Dispute webhook handler | Add event branches to webhook routes | **P1** |
| Invoice generator | `lib/payments/invoice.ts` + stored PDFs in `files` table | **P1** (GST requirement) |
| Admin billing UI | `app/admin/billing/page.tsx` (manual grants, refund, audit) | **P2** |
| Currency/geo routing | `lib/payments/routing.ts` (IP→country→default currency + provider) | **P1** |
| INR pricing in packs | Extend `CREDIT_PACKS` with per-currency prices OR live FX | **P1** |
| Idempotency middleware | `lib/payments/idempotency.ts` for the checkout action | **P2** |
| Rate limit on checkout | Reuse `lib/rate-limit` (if exists) or add | **P2** |
| Unit + integration tests | `__tests__/payments/*.test.ts` + webhook fixtures | **P1** |
| Env vars in Hostinger | hPanel → Environment | **P0** |
| GST registration + LUT | gst.gov.in | **P0** (legal) |
| Razorpay International enablement | Razorpay dashboard | **P0** |
| PayPal Business account | paypal.com | **P0** |
| Legal pages (refund, service delivery, etc.) | `app/(marketing)/*` | **P0** |

### 1.3 Non-goals for v1

- No subscription billing in v1 — adapter supports it, but the checkout
  UI will only mint one-time pack purchases. Subscriptions roll out in a
  separate phase after packs stabilize.
- No MoR (Paddle / LemonSqueezy) in v1 — portable contract accepts one
  later when EU VAT volume justifies it.
- No crypto / Apple Pay / Google Pay beyond what Razorpay and PayPal
  expose natively through their hosted checkouts.

---

## 2. Architecture recap — the portability contract

```
          ┌─────────────────────────────────────────────────────┐
          │                  Next.js app                         │
          │                                                      │
          │   /pricing (client) ──► createCheckoutAction         │
          │                              │                       │
          │                              ▼                       │
          │                      selectProvider({currency,       │
          │                          mode, preferredId})         │
          │                              │                       │
          │                              ▼                       │
          │                      PaymentProvider (adapter)       │
          │                              │                       │
          │   ┌──────────────┬───────────┴─────────┬──────────┐  │
          │   ▼              ▼                     ▼          ▼  │
          │ Razorpay      PayPal               Cashfree    Stripe│
          │ adapter       adapter              (future)    (future)
          │                                                      │
          │   Webhook route ──► verifyWebhook() ─► applyPaymentEvent
          │                              │                       │
          │                              ▼                       │
          │                     NormalizedPaymentEvent           │
          │                              │                       │
          │                              ▼                       │
          │                     grantCredits (idempotent)        │
          │                              │                       │
          │                              ▼                       │
          │                   credit_ledger + credits             │
          └─────────────────────────────────────────────────────┘
```

### 2.1 The four rules no code change may violate

1. **Internal UUID is the primary key.** `payments.id` is the portability
   anchor. `providerRef` is metadata. Migrating providers mid-flight
   reuses the same internalPaymentId.
2. **`ProviderId` is an open string.** Never switch on it in business
   code. All per-provider behavior lives in adapters.
3. **Events normalize at the webhook boundary.** The ledger writer sees
   only `NormalizedPaymentEvent`, never a raw Razorpay or PayPal
   payload.
4. **PCI: card data never touches our servers.** Razorpay Checkout modal
   and PayPal hosted buttons keep PANs client-side (SAQ-A scope).
   Scrubbers belt-and-braces redact any leaked field.

### 2.2 Adding a third provider is exactly this

1. Write `lib/payments/adapters/<name>.ts` implementing `PaymentProvider`.
2. Add one row to `ADAPTERS` in `lib/payments/registry.ts`.
3. Set four env vars on Hostinger.
4. Add a webhook route at `app/api/payments/webhook/<name>/route.ts`
   that calls the same 10-line handler used by razorpay/paypal (shared
   helper — see §4.2).
5. Update `docs/payments/PROVIDER_MATRIX.md` (this plan's companion).

No other file in the app changes. That is the portability goal.

---

## 3. Phase plan (chronological)

### Phase 0 — Legal + account prereqs (days 1–7, blocking)

| # | Task | Owner | Time |
|---|---|---|---|
| 0.1 | Publish 6 legal pages: Terms, Privacy, Refund, Service Delivery, Contact, Pricing | dev | 1 day |
| 0.2 | Open Razorpay account, complete domestic KYC | founder | 3–10 days |
| 0.3 | Register GSTIN (`gst.gov.in`, voluntary, Aadhaar-auth for 3–7 day approval) | founder | 3–7 days |
| 0.4 | File LUT (RFD-11) for FY 2026–27 — zero-rate exports | founder | same-day |
| 0.5 | Open PayPal Business account (India) | founder | 1–3 days |
| 0.6 | After domestic Razorpay live: request International Payments | founder | 7–15 days |
| 0.7 | Update pricing footer + invoice template with GSTIN | dev | 1 hr |

**Gate:** no payment code ships live until 0.1, 0.2, 0.3, 0.5 are green.

### Phase 1 — Wire the HTTP skin (days 8–12)

Goal: full end-to-end test-mode checkout for a $5 Starter pack, with
credits granted to the test account.

| # | Task | Files | Notes |
|---|---|---|---|
| 1.1 | Razorpay webhook route | `app/api/payments/webhook/razorpay/route.ts` | Reads `req.text()` (raw body), calls `provider.verifyWebhook`, on ok calls `applyPaymentEvent`, writes `webhook_events` row keyed on `(providerId, providerEventId)`. Returns 400 on bad sig, 200 on ok. |
| 1.2 | PayPal webhook route | `app/api/payments/webhook/paypal/route.ts` | Same shape; `providerEventId` is the `id` in PayPal's body. |
| 1.3 | Shared webhook helper | `lib/payments/webhook-handler.ts` | Factors the 40 lines both routes share into one function. Next provider's route is 10 lines. |
| 1.4 | Checkout client component | `app/pricing/checkout-button.tsx` | On click → server action → branches on `session.kind`. `client`: dynamic-import Razorpay/PayPal SDK and mount; `redirect`: `window.location = session.url`. |
| 1.5 | SDK loader modules | `lib/payments/sdk/razorpay-sdk.ts`, `lib/payments/sdk/paypal-sdk.ts` | Each exports `loadSdk(): Promise<void>` that `<script>`-injects from CDN once, resolves on `onload`. |
| 1.6 | Success return page | `app/pricing/success/page.tsx` | Reads `?payment_id=<internal uuid>`, shows pending/captured state, polls once for webhook-delivered credits (UX — not authoritative). |
| 1.7 | Cancel return page | `app/pricing/cancel/page.tsx` | Stub. Marks `payments` row as `cancelled` if still `pending`. |
| 1.8 | Env vars on Hostinger | hPanel | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV=sandbox`. |
| 1.9 | Razorpay + PayPal webhook endpoints registered in provider dashboards | dashboards | URLs: `https://pdfcraftai.com/api/payments/webhook/{razorpay,paypal}`. |
| 1.10 | Test-mode E2E: 1 purchase each provider | browser | See §7 test plan. |

### Phase 2 — Reconciliation + disputes (days 13–17)

Goal: withstand a webhook outage or a chargeback without a single
dropped grant or silent dispute.

| # | Task | Files | Notes |
|---|---|---|---|
| 2.1 | Reconciliation cron | `app/api/cron/reconcile-payments/route.ts` | Iterates `listTransactionsSince(lastRun)` for each configured provider. For every tx not in `payments`, logs a `reconciliation_alerts` row. For every tx in `payments` with mismatched status, queues a repair. |
| 2.2 | Cron invocation | hPanel cron OR external (cron-job.org) | Hourly. Authenticated via `CRON_SECRET`. |
| 2.3 | Dispute branches in webhook route | `razorpay.ts` + `paypal.ts` adapter `normalize()` | Add `dispute_opened` kind to `NormalizedPaymentEvent`. Razorpay: `payment.dispute.created`. PayPal: `CUSTOMER.DISPUTE.CREATED`. |
| 2.4 | Dispute auto-response bundle | `lib/payments/dispute-evidence.ts` | Assembles user's IP log, invoice PDF, ai_usage extract, T&C acceptance timestamp. Files to `/admin/disputes/<id>/` for human review before submission. |
| 2.5 | Cron for stale pending | same cron | Any `payments` row in `pending` state for >24h is force-checked against provider; promoted to captured or marked failed. |

### Phase 3 — GST compliance + invoicing (days 18–22)

| # | Task | Files | Notes |
|---|---|---|---|
| 3.1 | Invoice PDF generator | `lib/payments/invoice.ts` | On `payment_captured`, generate a GST-compliant PDF (GSTIN, HSN/SAC, IGST/CGST/SGST split or "Export of Services — Zero-rated"). Store in `files` table; email to user. |
| 3.2 | Invoice storage | `files` table | `kind: 'invoice'` + `paymentId` FK. |
| 3.3 | Invoice download route | `app/api/payments/invoice/[id]/route.ts` | Streams the PDF with auth check. |
| 3.4 | Currency detection on checkout | `lib/payments/routing.ts` | Geo-IP → country → default currency. Show INR to IN users, USD to rest. |
| 3.5 | INR prices in packs | `lib/pricing.ts` | Add `priceInr` per pack. For now hard-code (₹419, ₹1599, ₹4,899, ₹12,399). Later: FX-service-derived daily. |
| 3.6 | GSTR-1 + GSTR-3B export | `app/api/admin/gstr-export/route.ts` | Admin-only CSV: invoice#, date, amount, GST, customer country. Monthly. |

### Phase 4 — Go live (day 23)

| # | Task | Notes |
|---|---|---|
| 4.1 | Flip Razorpay + PayPal from **sandbox** to **live** env vars | hPanel redeploy |
| 4.2 | Update CSP `frame-src` to live razorpay + paypal domains | `.htaccess` or middleware |
| 4.3 | Small-amount smoke test ($5 pack, real card, real account) | founder |
| 4.4 | Monitor first 24h: webhook queue, ledger identity, dispute rate | Grafana/Clarity |
| 4.5 | Announce on-site + email existing users | marketing |

### Phase 5 — Hardening (days 24–35)

| # | Task | Why |
|---|---|---|
| 5.1 | Add `idempotency-key` header to checkout server action | Prevent double-charge on rage clicks |
| 5.2 | Rate-limit `createCheckoutAction` per user (5/min) | Spam + abuse |
| 5.3 | Admin billing UI: manual grant, full refund, export | Support tooling |
| 5.4 | Monthly reconciliation doc + journal entries | Accounting |
| 5.5 | Per-provider net-margin dashboard | Decide when to add third provider |

---

## 4. Technical specs

### 4.1 Checkout request flow

```
User clicks "Buy Starter" on /pricing
  ↓
React client component gets user's preferred currency
  ↓
calls createCheckoutAction({ packId, preferredProviderId? })
  ↓
[SERVER ACTION]
  ├─ auth()  → redirect /login if anon
  ├─ lookup pack in CREDIT_PACKS
  ├─ selectProvider({ currency, mode: 'one_time', preferredId })
  ├─ INSERT payments row (pending, UUID, packId, amount, providerId)
  ├─ provider.createCheckout({ internalPaymentId, ... })
  ├─ UPDATE payments SET providerRef = result.providerRef
  └─ return { session, providerId, internalPaymentId }
  ↓
[CLIENT]
  ├─ if session.kind === 'client':
  │     await loadSdk(session.sdk)
  │     provider JS opens modal
  │     on success: window.location = /pricing/success?payment_id=<uuid>
  │     on fail:    window.location = /pricing/cancel?payment_id=<uuid>
  └─ if session.kind === 'redirect':
        window.location = session.url
```

### 4.2 Shared webhook handler

```ts
// lib/payments/webhook-handler.ts
import { getProvider } from "./registry";
import { applyPaymentEvent } from "./ledger";
import { db, schema } from "@/db/client";
import type { ProviderId } from "./types";

export async function handleWebhook(
  providerId: ProviderId,
  req: Request
): Promise<Response> {
  const provider = await getProvider(providerId);
  if (!provider) return new Response("provider not configured", { status: 503 });

  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  const result = await provider.verifyWebhook({ rawBody, headers });
  if (!result.ok) {
    // 400 (NOT 2xx) so the provider retries on legitimate failures.
    return new Response(result.reason, { status: 400 });
  }

  // Idempotency: webhook_events is unique on (providerId, providerEventId).
  // A duplicate delivery is a cheap UNIQUE violation, not a double-grant.
  const providerEventId = extractEventId(result.event);
  try {
    await db.insert(schema.webhookEvents).values({
      id: crypto.randomUUID(),
      providerId,
      providerEventId,
      eventType: result.event.kind,
      normalizedKind: result.event.kind,
      paymentId: result.event.internalPaymentId ?? null,
      rawPayload: result.event.providerRaw ?? null,
    });
  } catch (e: unknown) {
    if (isDuplicateKey(e)) return new Response("duplicate", { status: 200 });
    throw e;
  }

  await applyPaymentEvent(result.event);
  return new Response("ok", { status: 200 });
}
```

Per-provider route shrinks to:

```ts
// app/api/payments/webhook/razorpay/route.ts
import { handleWebhook } from "@/lib/payments/webhook-handler";
export async function POST(req: Request) { return handleWebhook("razorpay", req); }
```

### 4.3 Currency + provider routing

```ts
// lib/payments/routing.ts
import type { Currency, ProviderId } from "./types";

/**
 * Default provider + currency for a given visitor country code.
 * The checkout UI can override with a "preferredProviderId" the user
 * clicks, but this is what we render by default.
 */
export function defaultRouteForCountry(
  country: string | null
): { currency: Currency; preferredProviderId: ProviderId } {
  if (country === "IN") {
    return { currency: "INR", preferredProviderId: "razorpay" };
  }
  // Everyone else: Razorpay USD first (cheaper on small packs),
  // PayPal visible as alt button.
  return { currency: "USD", preferredProviderId: "razorpay" };
}
```

The checkout page renders **both** Razorpay and PayPal buttons for
non-IN users, but pre-selects Razorpay. User can switch with one click.

### 4.4 Ledger invariant check (run in CI + monthly)

```sql
-- For every user, total credits on hand must equal the net of
-- ledger deltas. Any drift = bug; halt payments immediately.
SELECT u.id, c.balance, COALESCE(SUM(l.delta), 0) AS ledger_sum
FROM users u
LEFT JOIN credits c ON c.user_id = u.id
LEFT JOIN credit_ledger l ON l.user_id = u.id
GROUP BY u.id
HAVING c.balance != ledger_sum;
```

---

## 5. Env var checklist

### 5.1 Hostinger runtime

```bash
# Razorpay (required for India; international tier ON in dashboard)
RAZORPAY_KEY_ID=rzp_live_xxx              # "rzp_test_..." in sandbox
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxx # set in Razorpay dashboard → Webhooks

# PayPal
PAYPAL_CLIENT_ID=xxx
PAYPAL_CLIENT_SECRET=xxx
PAYPAL_WEBHOOK_ID=WH-xxxxxxx              # from PayPal dashboard
PAYPAL_ENV=live                           # "sandbox" in test

# Cron auth (reconciliation + stale-pending sweeps)
CRON_SECRET=<32-byte random hex>

# Optional (Phase 1 nicety, Phase 2 requirement)
GEOIP_PROVIDER_KEY=<ipinfo / ipapi>       # for currency routing
```

### 5.2 Provider dashboards

**Razorpay:**
- Settings → Webhooks → add `https://pdfcraftai.com/api/payments/webhook/razorpay`
- Events to subscribe: `payment.authorized`, `payment.captured`, `payment.failed`, `refund.created`, `refund.processed`, `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `subscription.paused`, `subscription.halted`, `payment.dispute.created`, `order.paid`
- Secret: matches `RAZORPAY_WEBHOOK_SECRET`
- Settings → Tax Settings: set GSTIN
- Settings → International Payments: enabled (after KYC + LUT)

**PayPal:**
- Dashboard → Apps & Credentials → REST API app → copy Client ID + Secret
- Dashboard → Webhooks → add `https://pdfcraftai.com/api/payments/webhook/paypal`
- Events: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`, `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.RESOLVED`
- Copy Webhook ID → `PAYPAL_WEBHOOK_ID`

---

## 6. Legal + compliance checklist

Everything in this list must be green before going live (not just
before enabling Razorpay):

| # | Item | Rule |
|---|---|---|
| 6.1 | GSTIN on invoice | GST Rules, Rule 46 |
| 6.2 | Service Delivery (Shipping) Policy page on site | Razorpay activation requirement |
| 6.3 | Refund Policy explicitly states 14-day unused-credit refund window | CREDIT_PACKS FAQ already has this; replicate on /refund page |
| 6.4 | Privacy Policy discloses payment processors by name | GDPR Art. 13 + DPDP Act |
| 6.5 | Terms of Service covers "credits are consumables, not currency" | Avoid gift-card regulatory trap |
| 6.6 | LUT filed for current FY | Avoids 18% GST on exports |
| 6.7 | Invoice format includes HSN/SAC code 998314 | GST Rules, Rule 46 |
| 6.8 | Export invoices labeled "Supply meant for export on payment of IGST / LUT" | GST Rules, Rule 46(e)(ii) |
| 6.9 | Data residency disclosure for EU customers | DPA Art. 28 if we're a processor |
| 6.10 | Contact page with business name + address + phone + email | Razorpay + PayPal requirement |
| 6.11 | Display GSTIN in footer | GST visibility rule |
| 6.12 | PayPal User Agreement for India accepted | account opening |
| 6.13 | RBI declaration — "service export under LRS" for USD settlements | at PayPal onboarding |

---

## 7. Test plan

### 7.1 Unit tests (add to CI, `__tests__/payments/*.test.ts`)

| # | Test | Asserts |
|---|---|---|
| U1 | `razorpay.verifyWebhook` with wrong secret | returns `{ok: false}`, route → 400 |
| U2 | `razorpay.verifyWebhook` with correct sig, known event | returns normalized event |
| U3 | `paypal.verifyWebhook` cert chain valid | returns normalized event |
| U4 | `scrub` strips `number` / `pan` / `cvv` keys | deeply nested |
| U5 | `applyPaymentEvent` replayed twice | ledger row exists exactly once |
| U6 | `applyPaymentEvent` with unknown packId | payment marked captured, alert row written, no credits granted |
| U7 | `selectProvider({currency: 'INR', mode: 'one_time'})` | returns razorpay |
| U8 | `selectProvider({currency: 'USD', preferredId: 'paypal'})` | returns paypal when configured |
| U9 | `selectProvider` with no configured provider | returns null |

### 7.2 Integration tests (sandbox)

| # | Test | Outcome |
|---|---|---|
| I1 | Razorpay test-card (`4111 1111 1111 1111`) → Starter pack | 100 credits granted, invoice PDF generated |
| I2 | PayPal sandbox buyer → Starter pack | 100 credits granted |
| I3 | Webhook delivered twice (replay from dashboard) | credits granted once, second webhook 200 + `duplicate` reason |
| I4 | Capture followed by full refund via dashboard | refund event processed, credits debited, balance never negative |
| I5 | Buy pack, close tab before success page | reconciliation cron promotes row on next run |
| I6 | Force checkout with `preferredProviderId=cashfree` (not configured) | action falls back to razorpay; no error |
| I7 | Dispute opened in Razorpay dashboard → webhook received | `dispute_opened` event written, evidence bundle queued |
| I8 | LUT-enabled INR export (non-IN customer paying USD via Razorpay) | invoice shows "Export of Services — Zero-rated" |

### 7.3 Live smoke test (day 23)

1. Create new account with fresh email.
2. Buy Starter pack ($5) via Razorpay USD.
3. Confirm 100 credits appear within 30 seconds.
4. Confirm invoice PDF arrives via email.
5. Run one AI operation (summarize) that spends 3 credits.
6. Confirm balance = 97.
7. Refund from admin UI.
8. Confirm balance = 0 (all debited back) + refund row in ledger + refund webhook in `webhook_events`.
9. Repeat 1–8 with PayPal.
10. Repeat 1–4 with Razorpay INR (from an IN IP).

Only after all three providers pass, announce publicly.

---

## 8. Operations — day-2 playbook

### 8.1 Monitoring signals (each alerts to on-call)

| Signal | Query | Threshold |
|---|---|---|
| Webhook 400 rate | `webhook_events` inserts per `provider_id` per minute vs. 400 returns in logs | > 1% sustained |
| Pending payments aging | `SELECT COUNT(*) FROM payments WHERE status='pending' AND createdAt < NOW() - INTERVAL 1 HOUR` | > 5 rows |
| Ledger identity drift | the SQL in §4.4 | any row |
| Dispute rate | `payments` captured → `dispute_opened` conversion | > 1% over 30 days |
| Provider 5xx rate | adapter `call` errors | > 5% over 15 min |

### 8.2 Monthly reconciliation (first business day)

Already specified in `docs/ai/REVENUE_LEAK_AUDIT.md` §7. Summary:

1. Export Razorpay Settlement Report CSV + PayPal Transactions CSV.
2. `SUM(payments.amount) WHERE status='captured'` per provider per month.
3. Match to CSVs within 1% tolerance. Investigate exceptions.
4. File GSTR-1 + GSTR-3B by 11th / 20th of following month.
5. Post journal entries: revenue, COGS (LLM invoices), processor fees +
   GST on fees, FX adjustments (PayPal), breakage (expired bonus
   credits).

### 8.3 Dispute SLA

- **Within 24 hours** of dispute webhook: evidence bundle auto-assembled
  and filed in `/admin/disputes/`.
- **Within 48 hours**: human review + submission to Razorpay/PayPal.
- Razorpay evidence window: 7 days. PayPal: 10 days. Alert fires at
  Day 5 / Day 7 respectively if not submitted.

### 8.4 Incident: webhook outage

1. Provider dashboard shows failed webhook deliveries.
2. Reconciliation cron catches them within the hour.
3. If the backlog is >100 events, trigger the manual resync script:
   `npx tsx scripts/resync-payments.ts --provider razorpay --since "2026-04-20T00:00:00Z"` — calls
   `listTransactionsSince` and promotes any missing payments.

---

## 9. Adding a third provider (future)

Exactly this many files change:

1. **New:** `lib/payments/adapters/<name>.ts` — implements `PaymentProvider`.
2. **Edit:** `lib/payments/registry.ts` — one new row in `ADAPTERS`.
3. **New:** `app/api/payments/webhook/<name>/route.ts` — 2 lines:
   ```ts
   import { handleWebhook } from "@/lib/payments/webhook-handler";
   export async function POST(req: Request) { return handleWebhook("<name>", req); }
   ```
4. **Env:** 3–4 new env vars on Hostinger.
5. **Dashboard:** configure the new provider's webhook URL.
6. **Tests:** add unit tests for the new adapter + an integration run.
7. **Update:** `docs/payments/PROVIDER_MATRIX.md`.

**Nothing else.** That is the measurable portability goal. If step 7+8
ever grow into step 1–N, something has leaked out of the adapter and
must be refactored back in.

Candidate providers already evaluated (in `docs/payments/PROVIDER_COMPARISON.md`, to write next):

| Provider | When to add |
|---|---|
| Cashfree | India volume > ₹5L/month (0.3pp cheaper than Razorpay) |
| Paddle / LemonSqueezy | International B2B SaaS revenue > $10k/month (MoR offloads EU VAT) |
| Stripe | After incorporating US/UK subsidiary — direct card rails, cheaper |
| Crypto (Coinbase Commerce) | Enterprise customer demand |

---

## 10. Open questions to confirm before Phase 1

| # | Question | Decision needed from |
|---|---|---|
| Q1 | Are we running sandbox webhooks through a public tunnel (ngrok) or only hitting `/api/payments/webhook/*` on a staging subdomain? | dev |
| Q2 | Is there an existing rate-limiter lib, or do we need `lib/rate-limit.ts`? | dev |
| Q3 | Auto-issue invoice PDFs immediately on capture, or on first `GET /account/invoices`? | founder |
| Q4 | Show INR prices pre-checkout for IN users, or show USD with a "we accept INR at checkout" note? Simpler v1: latter. | founder |
| Q5 | Do we need partial refunds in v1, or full-only? (Adapters support partial; UI can hide it.) | founder |
| Q6 | Admin emails for dispute alerts — single inbox or per-founder? | founder |
| Q7 | Audit `lib/payments/adapters/paypal.ts` — does it have the same shape as razorpay.ts (orders, subscriptions, refundByProviderRef, listTransactionsSince, scrub)? | dev |

---

## 11. Timeline summary

```
Week 1 (Apr 21–27):  Legal + account prereqs (Phase 0)
Week 2 (Apr 28–May 4): HTTP routes + checkout UI (Phase 1)
Week 3 (May 5–11):   Reconciliation + disputes + invoicing (Phases 2–3)
Week 4 (May 12–18):  Live cutover + hardening (Phases 4–5)
```

**Earliest realistic live-payments date:** May 18, 2026 — assuming
Razorpay domestic KYC clears in 7 days and international in another 14.

---

## 12. Definition of "done" for this plan

Every item in §1.2 (missing list) ships **and**:

- [ ] All tests in §7.1 + §7.2 pass in CI.
- [ ] Live smoke (§7.3) passes for both providers.
- [ ] Monthly reconciliation (§8.2) runs clean for one full month.
- [ ] Ledger identity (§4.4) passes nightly, zero drift.
- [ ] Adding a third provider has been **rehearsed** against a Cashfree
      sandbox even if we don't ship it — if that rehearsal touches any
      file outside §9's list, refactor until it doesn't.

---

## 13. References

- `docs/ai/REVENUE_LEAK_AUDIT.md` — every penny-loss scenario + invariants.
- `docs/ai/BYOK_DECISION_MATRIX.md` — AI provider selection logic that
  interacts with billing when infra fees kick in.
- `docs/RAZORPAY_READINESS.md` — pre-application audit.
- `lib/payments/provider.ts` — the portability contract in code.
- `lib/payments/registry.ts` — add-a-provider entry point.
