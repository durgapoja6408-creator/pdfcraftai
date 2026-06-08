# Razorpay test → live key swap

**Last revised: 2026-06-08**

## Why this doc exists

Production currently runs on Razorpay **TEST mode** keys
(`RAZORPAY_KEY_ID=rzp_test_*`, verified via `/proc/<pid>/environ`
on Hostinger 2026-05-12). The live checkout flow at
<https://pdfcraftai.com/pricing> opens a Razorpay test-mode
iframe for every visitor. **No real money is currently
collected.**

When the founder is ready to flip to live revenue collection,
follow this playbook. The swap is a 10-minute env-var change in
Hostinger's panel, but there are knock-on effects on the prod-E2E
suite that need handling at the same time.

## Pre-flight checklist

1. **Razorpay KYC complete.** Verify in the Razorpay dashboard:
   Settings → Account & Settings → KYC verification status
   should read "Verified."
2. **Payment-method coverage.** UPI, card, netbanking enabled.
   Pricing page assumes all three.
3. **Refund policy live.** `/refund-policy` should be reachable
   and accurate. Razorpay's onboarding flagged 7 disclosures
   that must be present; the SEV-1 commit `78a0277` (2026-05-04)
   shipped these.
4. **GST registration complete** (if collecting from Indian
   businesses). CA-dependent paperwork — separate track.
5. **Webhook secret rotated.** The test webhook secret cannot
   be reused for live. Generate a fresh one in the Razorpay
   dashboard under Settings → Webhooks → Generate signing key.

## The swap itself

1. Open Hostinger panel → `pdfcraftai.com` → **Node.js Web App**
   → **Environment Variables**.
2. Replace these three env vars:
   - `RAZORPAY_KEY_ID` → live `rzp_live_*` key
   - `RAZORPAY_KEY_SECRET` → matching live secret
   - `RAZORPAY_WEBHOOK_SECRET` → fresh live webhook secret
3. Click **Save and Redeploy**. Wait ~2-3 min for the runtime
   to restart.
4. Verify via `/api/health` — `commit` should still be the
   latest SHA, no errors.
5. Visit <https://pdfcraftai.com/pricing> in an incognito
   window. Click "Buy pack". The Razorpay widget should open
   in **live** mode (header reads "Razorpay" without "TEST"
   badge).
6. **Don't actually pay yet.** Close the widget. Watch
   `/admin/margin` for the next 30 minutes to confirm no
   anomalies in the pending_order stream.

## Transactional emails go live with the swap

The moment a live payment captures, the webhook fires the **receipt
email** (`sendReceiptEmail` in `lib/email/transactional.ts`) to a REAL
buyer. Before flipping to live keys, confirm email deliverability is
set up — a receipt that lands in spam on someone's first paid purchase
is a bad first impression and a support ticket.

**Do this first:** follow `docs/EMAIL_DELIVERABILITY.md` to add the
SPF / DKIM / DMARC DNS records for `pdfcraftai.com` and confirm a
mail-tester.com score of 9–10/10. SMTP itself is already live
(`SMTP_PASS` is set in Hostinger), so the only gap is DNS
authentication. This also covers the welcome, low-credit, and
payment-failed lifecycle emails shipped 2026-06-08.

## Scope of "going live" (IN only, for now)

Flipping to `rzp_live_*` enables real card/UPI/netbanking collection
for **India** traffic only. Non-IN visitors still hit the Tier-2
"defer" surface (launch-notify waitlist) because the international
rail is not yet approved — see `lib/payments/checkout-actions.ts`
(`createCheckoutAction`, geo routing). Nothing about this swap changes
non-IN behaviour; it only turns the existing IN rail from test to live.

## prod-E2E suite knock-on effects

Phase 4 of the prod-E2E suite (`tests/e2e-prod/payments-flow.spec.ts`)
currently exercises the live `/pricing → Buy pack` flow against
the prod Razorpay test-mode keys. After the swap, that flow
becomes LIVE — and the test would create REAL pending orders
on every weekly run.

**Three options to handle this:**

### Option A: provision a Razorpay sub-account for E2E (recommended)

1. In the Razorpay dashboard, create a **sub-account** under
   the main account. Sub-accounts are still test mode-capable
   even when the parent is live.
2. Generate test-mode keys for the sub-account:
   `rzp_test_*` and the matching webhook secret.
3. Build a new env-overlay in the prod codebase that lets the
   test account specifically use the sub-account keys.
   Implementation sketch:
   - Add `RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET`,
     `RAZORPAY_TEST_WEBHOOK_SECRET` env vars on Hostinger.
   - There is NO REST `create-order` route — order creation is the
     `createCheckoutAction` server action in
     `lib/payments/checkout-actions.ts`. Branch there on the test
     user-id (the same seam the existing
     `E2E_CHECKOUT_GEO_OVERRIDE_USER_ID` env already uses to scope
     behaviour to one account) — if it's the test account, resolve
     the test keys; otherwise the live keys.
   - The webhook handler at `app/api/webhooks/razorpay/route.ts`
     accepts BOTH signing keys (try test first, fall back to
     live) — Razorpay's account-mode signal in the webhook
     payload tells the handler which path to take.
4. Activate Phase 4 again with the new test sub-account keys
   stored as a GH secret (`PROD_E2E_RAZORPAY_TEST_KEY_ID` etc.).

### Option B: skip Phase 4 in CI, run manually only

If the engineering work for Option A isn't a fit:

1. In `.github/workflows/prod-e2e.yml`, remove `payments`
   from the cron paths (keep it as a `workflow_dispatch`
   option only).
2. Run Phase 4 manually against staging once per release with
   `gh workflow run prod-e2e.yml -f phases=payments -f url=https://staging.pdfcraftai.com`.

### Option C: skip Phase 4 entirely

Lowest engineering cost. Phase 4 catches "Razorpay checkout
opens at all" which is also caught by Phase 1's `/pricing`
smoke test (which verifies the Razorpay script tag loads on
the page). Trade-off: you lose coverage of the
`createCheckoutAction` order-creation success path (the
`payments-flow` spec's assertion that a checkout returns a usable order).

Recommend Option A. It's ~half a day of engineering and
restores full Phase 4 confidence post-swap.

## Post-swap cleanup

After the swap, the test-mode pending orders from earlier
weekly runs accumulate in the `payments` table. Run this once
to clear them out:

```sql
DELETE FROM payments
WHERE user_id = '6b303c3b-ddfd-48fc-9162-2556d077fece' -- test account
  AND provider_id = 'razorpay'
  AND status = 'pending';
```

(Replace the UUID with the actual test account ID if it's
rotated.)

## Sources

- `tests/e2e-prod/payments-flow.spec.ts` — Phase 4 spec
- `tests/e2e-prod/README.md` — full activation matrix
- `lib/payments/checkout-actions.ts` — `createCheckoutAction` server
  action (order creation; there is no REST create-order route)
- `lib/payments/registry.ts` — reads `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET`
  and registers the provider only when all three are present
- `lib/payments/adapters/razorpay.ts` — adapter wiring
- `app/api/webhooks/razorpay/route.ts` — webhook handler (correct path;
  earlier revisions of this doc cited a stale `/api/payments/razorpay-webhook`)
