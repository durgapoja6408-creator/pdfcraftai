# Payments Migration Playbook

**Status:** active
**Last reviewed:** 2026-04-21
**Owner:** Raj (`rajasekarjavaee@gmail.com`)

This document is the reference for changing *who* processes our
payments. It covers adding a provider, switching between providers,
sunsetting a provider, and the things we've deliberately made easy vs.
hard.

Currently shipped: **Razorpay** (IN rail) and **Paddle** (MoR / international
rail). Either can be disabled by removing its env vars — the UI hides
the button, the registry stops loading the adapter, webhooks return 404.
(PayPal was retired in commit `d6ded77` per decision D4, 2026-04-20;
Paddle replaces it.)

---

## 1. The portability contract

The whole payments module is designed so swapping providers is an
*operations* change, not a code change. The rules that make that
possible are:

1. **One interface, one registry.** `lib/payments/provider.ts` defines
   `PaymentProvider`. Every adapter implements it and declares its
   capabilities. `lib/payments/registry.ts` is the only place that knows
   which providers exist — adding one is two edits (an adapter file plus
   a row in `ADAPTERS`).
2. **No provider types leak.** The interface speaks `Currency`, `Money`,
   `NormalizedPaymentEvent`, `CheckoutSession` — all declared in
   `lib/payments/types.ts`. Razorpay's `razorpay_order_id` and Paddle's
   `transaction_id` never appear outside the adapter. If they do, fix
   it before merge — downstream code is the first thing that breaks
   during a migration.
3. **Internal IDs are the source of truth.** Every `payments` row has
   our own UUID in `payments.id`. The provider's ID lives in
   `payments.providerRef`. Callers pass internal IDs around; adapters
   resolve to provider IDs at the boundary.
4. **Ledger writes are single-path.** Credits only change via
   `grantCredits()` in `lib/payments/ledger.ts`, keyed by an
   idempotency string. Webhooks, refunds, reconciliation — all of them
   call the same function with the same key scheme. That means a new
   provider doesn't need to understand the ledger; it just needs to
   hand us a `NormalizedPaymentEvent`.
5. **Env drives config.** A provider only loads if its env vars are
   set (see `isConfigured` in the registry). Rolling out Stripe to
   production is "set four env vars on Hostinger" — no deploy gate.

Keep those rules and the steps below stay cheap.

---

## 2. Adding a new provider (worked example: Stripe)

The flow is the same for any new provider. Stripe is the easiest to
describe because its API shape is close to ours.

### 2.1 Scope check — does this widen our PCI scope?

**Before anything else,** answer:

- Does the provider offer a **hosted payment page or iframe** where
  card data is entered *on their origin*? → SAQ-A stays intact.
- Does the provider require us to **host card fields ourselves**, even
  via their JS SDK's DOM elements that render inside our page? → We'd
  move to **SAQ-A-EP**. That's a paperwork + quarterly-scan change.
  Escalate to a QSA before proceeding. (For reference, Stripe
  Elements falls into this category; Stripe Checkout (hosted) does
  not.)

If adding the provider would change scope, stop and update
`docs/security/pci-saq-a.md` and the CSP in `next.config.mjs` first.
The `frame-src` / `script-src` expansion is a meaningful audit trail
and should land in its own PR with a clear justification.

### 2.2 Env vars

Add to `.env.local` (dev) and Hostinger dashboard (prod). By
convention:

```
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...          # server-only, never bundled
STRIPE_WEBHOOK_SECRET=whsec_...        # the endpoint-signing secret
```

Confirm the adapter file is marked `"server-only"` so webpack refuses
to bundle the secret into a client chunk. (Razorpay and Paddle
adapters both do this at the top of the file — copy that pattern.)

### 2.3 Adapter file

Create `lib/payments/adapters/stripe.ts`. Follow the shape of
`lib/payments/adapters/razorpay.ts`:

```ts
"use server-only";

import type { PaymentProvider } from "../provider";
import type { Money, /* … */ } from "../types";
import { scrub } from "./razorpay";  // shared scrubber — keep one copy

export class StripeProvider implements PaymentProvider {
  readonly id = "stripe" as const;
  readonly displayName = "Stripe";
  readonly capabilities = { oneTime: true, subscriptions: true, refunds: true };
  readonly supportedCurrencies = ["USD", "EUR", "INR"] as const;

  constructor(private cfg: { secretKey: string; webhookSecret: string }) {}

  async createCheckout(input) { /* mint Stripe Checkout Session */ }
  async verifyWebhook(input)  { /* verify signature, NORMALIZE, scrub */ }
  async cancelSubscription(id) { /* … */ }
  async refund(input) { /* delegate to refundByProviderRef */ }
  async refundByProviderRef(providerRef, amount?: Money) { /* … */ }
  async *listTransactionsSince(since: Date) { /* page through /charges */ }
}
```

Required behaviors (see `provider.ts` for the contract):

- **`verifyWebhook`** must run signature verification **before**
  JSON-parsing the body (invalid signatures return a 400 from the
  route handler so the provider retries, not a 2xx that would drop
  the event).
- **`verifyWebhook`** must call `scrub()` on the raw payload before
  returning it in `providerRaw`. This is how we stay PCI-compliant
  if the provider ever sends more than we expect.
- **`refundByProviderRef`** omits the amount argument for a full
  refund. When present, `amount.currency` MUST equal the original
  capture currency — adapters must reject a mismatch rather than
  cross-convert.
- **`listTransactionsSince`** yields in `occurredAt` ascending order
  so the nightly reconciliation cron can checkpoint.

### 2.4 Register it

In `lib/payments/registry.ts`, add a row to `ADAPTERS`:

```ts
{
  id: "stripe",
  isConfigured: () =>
    Boolean(
      process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_WEBHOOK_SECRET
    ),
  load: async () => {
    const { StripeProvider } = await import("./adapters/stripe");
    return new StripeProvider({
      secretKey: process.env.STRIPE_SECRET_KEY!,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    });
  },
},
```

Also add `"stripe"` to the `ProviderId` union in `lib/payments/types.ts`.
TypeScript will then fail any exhaustive switch that forgot the new
case — fix those before merging; they're usually UI rendering of
display names.

### 2.5 Webhook route

Add `app/api/webhooks/stripe/route.ts`. Copy the shape of the
Razorpay route — they share almost all code via the central
`processWebhook()` in `lib/payments/webhook-handler.ts`. The route
handler should be ~15 lines:

```ts
export async function POST(req: NextRequest) {
  const provider = await getProvider("stripe");
  if (!provider) return new Response("Not configured", { status: 404 });
  return processWebhook(provider, req);
}
```

In Stripe's dashboard, add the endpoint at
`https://pdfcraftai.com/api/webhooks/stripe` and copy the signing
secret into `STRIPE_WEBHOOK_SECRET`. Pick events narrowly — we care
about `checkout.session.completed`, `charge.refunded`, and
`customer.subscription.deleted`; everything else is noise the
adapter should drop at normalize-time.

### 2.6 CSP + PCI docs

Open `next.config.mjs` and append Stripe origins to
`script-src`, `frame-src` (for Checkout), and `connect-src`:

```ts
const STRIPE_ORIGINS = [
  "https://js.stripe.com",
  "https://checkout.stripe.com",
  "https://api.stripe.com",
  "https://hooks.stripe.com",
];
```

Then update `docs/security/pci-saq-a.md` §2.2 to list Stripe as a new
whitelisted origin, and add the vendor's PCI attestation step to the
annual checklist in §4.

### 2.7 Pricing UI

`components/pricing/PricingClient.tsx` reads the configured providers
from `listConfiguredProviderIds()` and renders a button per provider.
The display name comes from `PROVIDER_DISPLAY` in the pricing client
and `/app/billing` page — add `stripe: "Stripe"` to both maps.

### 2.8 Test the round trip

Before enabling in prod:

- Sandbox env set in `.env.local`, run `npm run dev`.
- On `/pricing`, confirm the Stripe button appears.
- Click it — checkout opens at `checkout.stripe.com`.
- Complete a test payment with the `4242 4242 4242 4242` card.
- Confirm redirect back lands on `/app/billing?status=success`.
- Confirm the webhook fires and the payments row flips to `captured`.
- Confirm the ledger granted credits once (check
  `credit_ledger.idempotency_key` for exactly one row).
- Fire the webhook again manually via Stripe CLI and confirm it's a
  no-op (the idempotency key prevents a double grant).
- Request a partial refund via the billing page. Confirm the webhook
  lands, `payments.status` becomes `partial_refund`, and the ledger
  debit matches the prorated amount.

### 2.9 Production rollout

Set the prod env vars on Hostinger. The registry picks them up on the
next request; no restart needed beyond Next.js's Node process
recycle. Do one real $1 test payment, refund it, then announce.

---

## 3. Switching providers (e.g., Razorpay → Stripe for INR)

Same idea as adding, plus a *migration window* where both providers
are live and we drain pending state on the old one before turning it
off.

### 3.1 Plan the window

Decide on a cutover date at least 30 days out. Reasoning:

- **14-day refund window.** A payment captured on day 0 can be
  refunded until day 14. The old provider must stay reachable for at
  least that long after the last capture.
- **Subscription renewals.** If we have any recurring subs on the old
  provider, either (a) let them renew until natural end and
  short-cycle to the new provider, or (b) cancel + have the user
  re-subscribe on the new provider. Option (a) is less invasive.
- **Reconciliation grace.** The nightly cron pages history; give it
  at least 7 days after the last expected event to catch stragglers.

### 3.2 Stop new captures on the old provider

Two options, in increasing severity:

- **Soft:** Remove the old provider from the checkout UI by filtering
  `listConfiguredProviderIds()` in the pricing client. Env stays set
  so adapters still load for webhooks, refunds, and reconciliation —
  just no new button.
- **Hard:** Unset the env vars. Adapter deregisters; webhook route
  returns 404; any in-flight checkout that somehow escapes the UI
  filter will fail cleanly on server action. Don't do this until
  after the refund window has lapsed.

Flip soft → hard in two separate PRs with at least 14 days between.

### 3.3 Reconciliation coverage

Before going hard, run a manual reconciliation for the old provider
covering the entire migration window:

```
npm run cron:reconcile -- --provider=razorpay --since=2026-03-01
```

Any discrepancy (provider says captured, our DB says pending) is a
signal to delay the cutoff. Resolve before hard-disabling.

### 3.4 Post-migration

- Keep the old adapter code in the repo for at least 90 days after
  hard-disable, in case a historical refund dispute needs its
  `refundByProviderRef`.
- Remove after that. Drop the row from `ADAPTERS`, drop the route,
  drop the origins from CSP, update the SAQ-A doc.

---

## 4. Currency / regional expansion

Adding a currency the current providers already support is a UI
change — drop the new option into `CREDIT_PACKS` in `lib/pricing.ts`
with its `currency` and `amountMinor`. The registry's `selectProvider`
will find a provider whose `supportedCurrencies` includes it.

Adding a currency **no existing provider supports** is a new-provider
migration (see §2). Don't try to cross-convert inside an adapter —
that hides FX risk in code and breaks refund math (refund has to be
in the same currency as capture).

---

## 5. Things we deliberately did NOT make easy

If any of these come up in a migration discussion, push back. The
friction is load-bearing.

- **Dual-ledger writes.** There is exactly one function that moves
  credits. Don't add a "quick" provider-specific ledger update path
  for a migration — you'll silently diverge from reconciliation math.
- **Writing ledger rows from server actions.** Actions initiate
  refunds/captures; webhooks update the ledger. This single-path
  design means idempotency has one key scheme. See the comment in
  `refund-actions.ts` for why.
- **Cross-currency math in adapters.** Refunds must match capture
  currency. If a customer paid in INR and the provider won't refund
  INR directly anymore, raise it as a business problem, not a code
  fix.
- **Client-side secrets.** Webhook secrets, API secrets, and refund
  tokens live in env only. The adapters import `"server-only"` to
  force webpack to refuse bundling them. Keep that.
- **Calling `provider.refund()` from the browser.** Refunds go through
  `requestRefundAction()` → adapter → provider API. There is no
  client path. Don't add one.

---

## 6. Rollback plan

For any provider change, have this ready before merging:

1. **Revert commit.** The code path for backing out (the inverse of
   the registry + UI edits). Have it pre-written in a branch.
2. **Env keys** for the previous provider still in the Hostinger
   vault; deleting is a separate cleanup step *after* the new
   provider has been live for 30 days.
3. **Webhook endpoints** on both providers' dashboards; we can't
   delete the old one until after the refund window.
4. **Monitoring signal.** The nightly reconciliation cron emits a
   failure count — if it spikes right after the cutover, roll back
   before the next window.

The worst outcome of a bad migration is a user paid and didn't get
credits (or paid twice). Both are caught by reconciliation inside 24
hours; both have playbooks in §7 below.

---

## 7. Incident playbooks

### 7.1 "User paid but didn't get credits"

1. Look up the payment by email or `providerRef`.
2. If the `payments` row is `captured` but `credit_ledger` has no row
   with matching `idempotencyKey`, manually call `grantCredits({
   paymentId, delta: pack.total, idempotencyKey:
   "${paymentId}:base:manual-${YYYYMMDD}" })`. The idempotency key
   prefix makes the manual grant distinguishable from the webhook
   path's automatic grant; collisions between them are impossible by
   construction.
3. File a bug on the adapter — it should have happened automatically.

### 7.2 "User paid twice"

1. Look up both `payments` rows. Confirm both are captured.
2. Issue a refund on the duplicate via `/app/billing` (14-day window
   permitting). If outside the window, use the provider's dashboard
   manually and write a `credit_ledger` row with negative delta and
   `reason: "duplicate_payment_manual"` keyed on
   `${paymentId}:refund:manual-${YYYYMMDD}`.
3. File a bug on our checkout flow — it shouldn't have let the user
   start two sessions.

### 7.3 "Provider webhook stopped delivering"

1. Check the provider dashboard for failed delivery counts.
2. Check Hostinger access logs for the webhook endpoint — are we
   returning 5xx?
3. Run the reconciliation cron manually to catch up:
   `npm run cron:reconcile -- --provider=<id> --since=<last-good>`.
4. Fix the route issue (usually a deploy that changed CSP or
   middleware), redeploy, unpause webhook delivery in the provider
   dashboard.

---

## 8. References

- `lib/payments/provider.ts` — the interface.
- `lib/payments/registry.ts` — env-driven loader.
- `lib/payments/ledger.ts` — single-path credit mutation.
- `lib/payments/webhook-handler.ts` — the shared webhook processor.
- `lib/payments/reconcile.ts` — nightly cron.
- `lib/payments/refund-actions.ts` — server actions behind the
  billing page.
- `docs/security/pci-saq-a.md` — PCI scope (read before adding a new
  provider).
- `next.config.mjs` — CSP; add new provider origins here.
