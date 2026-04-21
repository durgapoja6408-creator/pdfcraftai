# PCI DSS Scope: SAQ-A

**Status:** in scope as SAQ-A merchant
**Last reviewed:** 2026-04-21
**Owner:** Raj (`rajasekarjavaee@gmail.com`)

> **2026-04-21 note:** PayPal was retired from the stack (commit `d6ded77`)
> and Paddle replaces it as the international / merchant-of-record rail.
> All references in this document have been swept accordingly. Razorpay
> remains the IN-only rail and its scope is unchanged.

This document is the source of truth for how pdfcraftai.com handles
cardholder data (CHD) and why we qualify for the lightest PCI DSS
self-assessment questionnaire (SAQ-A). Read this before touching
anything in `lib/payments/` or `app/api/webhooks/`, and before adding a
new third-party origin to the Content Security Policy in
`next.config.mjs`.

---

## 1. Scope statement

pdfcraftai.com is a merchant that accepts card payments exclusively
through fully outsourced, PCI DSS compliant service providers:

- **Razorpay** (Razorpay Checkout standard modal — IN rail only)
- **Paddle** (Paddle.js overlay checkout — MoR / international rail)

At no point do cardholder data elements (PAN, CVV, track data,
cardholder name alongside card, expiration date) enter pdfcraftai.com
systems. They are typed by the user into iframes hosted on provider
infrastructure and posted directly from the browser to the provider's
origin.

Our servers receive only:

- A provider order ID (opaque to us)
- Post-capture metadata: last4, card brand, funding country — none of
  which are CHD under PCI DSS §3
- Webhook payloads signed by the provider

Because the payment provider handles capture, transmission, storage,
and processing of CHD end-to-end, we meet the SAQ-A eligibility
criteria in PCI DSS §1.2 SAQ-A (v4.0):

| Criterion                                                              | Status |
|------------------------------------------------------------------------|--------|
| Merchant accepts only card-not-present (e-commerce) transactions       | ✓      |
| All CHD functions outsourced to PCI DSS validated third parties        | ✓      |
| Merchant website does not receive CHD but controls how users are redirected to / communicate with the provider | ✓ |
| Merchant does not electronically store, process, or transmit any CHD on its systems | ✓      |
| Merchant has confirmed that all payment providers are PCI DSS compliant | ✓ (attestations on file) |

---

## 2. Architectural controls

### 2.1 No direct card capture

- There is **no form in our codebase that asks for a card number, CVV,
  or expiration date.** Grep for these patterns before shipping:
  ```
  rg -i 'card.?number|cvv|cvc|pan(?!el)'  components/ app/
  ```
  A match in non-comment source is a regression and must be fixed
  before merge.

- The only way a user reaches a card field is by clicking
  `CheckoutButton` on `/pricing`. That button opens a provider-hosted
  iframe (Razorpay modal or Paddle.js overlay checkout). Card data is
  posted directly from the iframe to the provider's origin.

### 2.2 Content Security Policy

`next.config.mjs` installs a CSP that enforces the hosted-iframe model
at the browser layer:

- `script-src`: `'self' 'unsafe-inline'` + Razorpay + Paddle origins
  (`cdn.paddle.com`, `buy.paddle.com`, `checkout.paddle.com`, plus
  `sandbox-buy.paddle.com` and `sandbox-checkout.paddle.com` for the
  sandbox env). A compromised third-party script cannot inject a card
  form because its origin would be blocked.
- `frame-src`: whitelisted to Razorpay + Paddle origins plus `'self'`.
  No other site can host a card-capture frame embedded in our page.
- `connect-src`: whitelisted to the same provider origins. Exfiltration
  of any data — including a compromised script attempting to POST
  captured keystrokes elsewhere — is blocked by the browser.
- `Permissions-Policy: payment=(self "https://checkout.razorpay.com"
  "https://buy.paddle.com" "https://checkout.paddle.com")` — browsers
  refuse to expose the Payment Request API to any other origin.
- `frame-ancestors 'none'` + `X-Frame-Options: DENY`: our pages cannot
  be framed by a phishing clone.

**Rule:** adding any new origin to `script-src`, `frame-src`, or
`connect-src` requires a PCI scope re-assessment. Document the
justification in the PR description and update this file.

### 2.3 Data storage

We store the following in our database (see `db/schema/app.ts`):

| Field           | CHD? | Notes                                             |
|-----------------|------|---------------------------------------------------|
| `payments.providerId`    | No   | "razorpay" / "paddle"                    |
| `payments.providerRef`   | No   | Provider order id, opaque                |
| `payments.amountMinor`   | No   | Money amount in minor units              |
| `payments.currency`      | No   | ISO 4217                                 |
| `payments.packId`        | No   | Our pack catalog id                      |
| `payments.metadata`      | No   | JSON blob — **must pass through scrub()** |
| `webhookEvents.rawPayload` | No  | Provider webhook, **scrubbed**           |

We **never** store: PAN, CVV, track data, PIN, expiration date, or
cardholder name bound to card. Our `scrub()` utility
(`lib/payments/adapters/razorpay.ts`) walks every incoming webhook and
metadata payload before persistence and:

1. Replaces any key matching `/^(number|pan|cvv|cvc|card_number|
   security_code)$/i` with `"[REDACTED]"`.
2. Replaces any string value matching `/\b(?:\d[ -]*?){13,19}\b/`
   (PAN-shape) with `"[REDACTED]"`.

`scrub()` runs on every adapter's webhook body. The canonical
implementation lives in `lib/payments/adapters/razorpay.ts` and is
re-exported for reuse; `lib/payments/adapters/paddle.ts` imports it
from there. Centralize here to keep the single scrubber on the audit
trail — do not fork or re-implement the regex per adapter.

### 2.4 Transmission

- All traffic is HTTPS. HSTS header `max-age=63072000; preload` blocks
  HTTP downgrades.
- Webhook endpoints verify provider signatures BEFORE parsing the body
  (`verifyWebhook` in each adapter). Invalid signatures return HTTP 400,
  which is important: a 2xx on a spoofed webhook would cause the
  provider to mark it "delivered" and our audit trail would be wrong.

### 2.5 Secrets

Provider secrets (`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
`PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET`) live
in environment variables only. They are never logged, never
committed, and never sent to the browser. The `scrub()` utility does
not protect against us leaking our *own* secret — that's a code-review
concern. Current safeguards:

- Adapters are marked `"server-only"` so webpack refuses to bundle them
  into a client chunk.
- Error messages returned from `createCheckoutAction` and
  `requestRefundAction` are generic strings; provider error text is
  truncated server-side and logged, never echoed to the client.

---

## 3. Data flow

```
  +----------+            +----------------+             +----------+
  | Browser  |  HTTPS     |  pdfcraftai    |  HTTPS      | Provider |
  | (client) |----------->|  Next.js       |------------>|  API     |
  +----+-----+            +-------+--------+             +----+-----+
       |                          |                           |
       |                          | (1) createCheckout        |
       |                          +-------------------------->|
       |                          |                           |
       |                          |<-- providerRef ---------- |
       |                          |                           |
       |<-- CheckoutSession ------+                           |
       |                          |                           |
       | (2) load provider SDK from provider origin           |
       +----------------->[ Razorpay / Paddle iframe ]<-------+
       |                          |                           |
       | (3) user types PAN/CVV inside iframe                 |
       |   --------- CHD NEVER TOUCHES OUR SERVER ---------   |
       |                          |                           |
       | (4) iframe posts CHD directly to provider            |
       +-----------------> provider origin (TLS) <------------+
       |                          |                           |
       |                          |<-- webhook (signed) ------|
       |                          |    (no CHD in payload)    |
       |                          |                           |
       |                          |--> ledger.applyPaymentEvent
       |                          |    credits granted
```

**Step (3) is the bright line.** Card data flows from keyboard → iframe
→ provider origin. It does not flow through our Next.js server, our
database, or our logs.

---

## 4. Annual attestation checklist

When renewing SAQ-A annually, work through this list and attach
screenshots / logs to the attestation record:

- [ ] Confirm Razorpay PCI DSS attestation is current
      (https://razorpay.com/docs/security/ — download and save PDF).
- [ ] Confirm Paddle PCI DSS attestation is current
      (https://www.paddle.com/legal/dss — download and save PDF).
- [ ] Grep for card-field patterns in source (see §2.1).
- [ ] Verify CSP in production (curl -I https://pdfcraftai.com | grep -i content-security).
- [ ] Confirm no PAN/CVV-shaped strings in `webhook_events.raw_payload`
      — run the scan query in §5.
- [ ] Confirm all third-party scripts loaded on `/pricing` and
      `/app/billing` are in the CSP whitelist (Chrome devtools →
      Network, filter by scripts).
- [ ] Review this document for anything new that could widen scope.

---

## 5. Regression checks

### 5.1 Scrubbed webhook storage scan

Run quarterly against the production `webhook_events` table:

```sql
-- Any row whose raw_payload contains a 13–19 digit sequence is a
-- scrub regression. Expected result: zero rows.
SELECT id, provider_id, event_type, created_at
FROM webhook_events
WHERE CAST(raw_payload AS CHAR) REGEXP '[0-9]{13,19}'
LIMIT 20;
```

If rows return:
1. Identify the leaking field.
2. Add it to the scrubber's `SENSITIVE_KEY_RX` in
   `lib/payments/adapters/razorpay.ts`.
3. Null out the `raw_payload` on the affected rows (preserve the
   headers and status, not the payload).

### 5.2 CSP smoke test

Deploy-gate: if any `X-Content-Security-Policy-Report-Only` violations
fire on `/pricing` after a deploy, roll back. (Report-only channel is
pending a Sentry CSP endpoint — tracked in `docs/todo.md` as of
2026-04-19.)

---

## 6. What would push us out of SAQ-A

Any of the following would drop us into SAQ-A-EP (or heavier):

- Adding our own card-input form — even if the submit posts to a
  provider. The moment PAN touches our HTML, SAQ-A does not apply.
- Proxying provider requests through our server (e.g. forwarding a
  provider API call from our Node runtime). Our server sits in the CHD
  transmission path → SAQ-A-EP.
- Storing any data element in the CHD definition.
- Accepting card-present (POS) payments.
- Embedding a non-provider script on `/pricing` that could rewrite the
  checkout button's URL.

If the team is ever considering any of the above, escalate to a QSA
before merging.

---

## 7. References

- PCI DSS v4.0: https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4_0.pdf
- SAQ-A v4.0: https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-A.pdf
- Razorpay PCI compliance: https://razorpay.com/docs/security/
- Paddle PCI compliance: https://www.paddle.com/legal/dss
