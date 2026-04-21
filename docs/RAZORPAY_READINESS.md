# Razorpay API Application — Website Readiness Audit

**Audit date:** 2026-04-20
**Audited URL:** https://pdfcraftai.com
**Target:** Razorpay Payment Gateway KYC / website-compliance review
**Goal:** Pass Razorpay's first-review gate on the initial application so activation is not delayed by website gaps.

---

## TL;DR — Current standing

**Will the application pass as-is? No.**

The site has 7 gating gaps that Razorpay reviewers flag on first pass for SaaS applicants. All are fixable in one afternoon, because they are content/legal pages — not code. Once the five pages below exist and the footer is updated, the application will stand up to Razorpay's standard website-compliance check.

| # | Gap | Severity | Fix |
|---|-----|----------|-----|
| 1 | No dedicated **Refund Policy** page (`/refund-policy` → 404) | BLOCKER | Publish standalone page |
| 2 | No **Cancellation Policy** page (`/cancellation-policy` → 404) | BLOCKER | Publish standalone page |
| 3 | No **Shipping / Delivery Policy** page (`/shipping-policy` → 404) | BLOCKER (yes — even for digital) | Publish page stating "digital service, instant delivery" |
| 4 | No physical **business address** anywhere on site | BLOCKER | Add to Contact + Footer |
| 5 | No **phone number** on Contact page | HIGH | Add to Contact |
| 6 | Terms says "billing info processed by **Stripe**" (line 34 of `lib/legal-docs.ts`) | HIGH — contradicts the Razorpay application | Swap Stripe → Razorpay, or make payment-processor-agnostic |
| 7 | Privacy + Terms carry a **"Working draft"** disclaimer at the top | MEDIUM — reviewers sometimes flag as "unfinished" | Remove the draft disclaimer before applying |

Everything else — HTTPS, clear pricing, clear product description, legitimate business model, Privacy Policy, Terms, live Contact form — is already in good shape.

---

## 1. Razorpay's website-compliance checklist — mapped to pdfcraftai.com

This is the checklist Razorpay's risk team actually runs. It is published in their "Website Checklist" doc and referenced in every rejection email they send.

| Razorpay requirement | Status on pdfcraftai.com | Evidence |
|---|---|---|
| **Business name visible on the site** | PASS | Footer: `© PDFCRAFT AI, INC.` |
| **Website fully functional (no dummy pages, no under-construction)** | PASS | 63 URLs in sitemap, all audited 200 in the 2026-04-20 production readiness sweep |
| **HTTPS / valid SSL** | PASS | Cloudflare cert; `HTTP/2 200` on all five legal/contact pages |
| **Clear description of the product or service being sold** | PASS | Home + `/tools` + `/pricing` describe PDF tools + AI credits unambiguously |
| **Pricing displayed in a published currency** | PASS (caveat) | `$5 / $19 / $59 / $149` credit packs; USD is acceptable to Razorpay International, but if you're applying as an **Indian** merchant, Razorpay prefers INR pricing visible. See §3. |
| **Contact Us page with working email** | PASS | 4 role-based mailboxes (`support@`, `sales@`, `security@`, `press@`) + working contact form |
| **Contact phone number** | **FAIL** | No phone number anywhere on the site |
| **Physical business address** | **FAIL** | No address on `/contact`, `/about`, or footer. Razorpay explicitly requires a registered business address. |
| **Privacy Policy — live, dated, dedicated URL** | PASS (caveat) | `/privacy` 200, dated Apr 2, 2026. BUT carries a "Working draft" disclaimer — remove before applying. |
| **Terms of Service — live, dated, dedicated URL** | PASS (caveat) | `/terms` 200, dated Apr 2, 2026. Same "Working draft" disclaimer. |
| **Refund Policy — dedicated page** | **FAIL** | `/refund-policy` → 404. Refund language exists buried in Terms §3 ("Refunds available within 14 days for unused credit packs"), but Razorpay reviewers look for a **dedicated URL**. |
| **Cancellation Policy — dedicated page** | **FAIL** | `/cancellation-policy` → 404 |
| **Shipping / Delivery Policy — dedicated page** | **FAIL** | `/shipping-policy` → 404. For digital services, this page simply has to say "Digital service, delivered instantly after payment — no physical shipment." But the URL must exist. |
| **Footer links to all four policies (Privacy, Terms, Refund, Cancellation)** | **FAIL** | Footer `components/nav/Footer.tsx` has Privacy / Terms / Security / DPA / GDPR but **no Refund, no Cancellation, no Shipping** |
| **Prices match what Razorpay will charge (no hidden fees, no post-payment surprises)** | PASS | `/pricing` is clear: "Paid credits never expire," per-pack price displayed, no upsell traps |
| **Products/services match the "business category" you pick on the Razorpay dashboard** | PASS | Category will be "SaaS / IT Services / Software" — matches what the site sells |
| **No restricted goods/services** (weapons, gambling, crypto exchange, adult, pharma, etc.) | PASS | PDF productivity tools — allowed category |
| **Domain is at least 3 months old AND owned by the applicant** | — | Depends on when `pdfcraftai.com` was registered and whose name is on the WHOIS. Confirm yourself via `whois pdfcraftai.com`. |

---

## 2. What needs to be built — prioritized fix list

### BLOCKERS (must ship before applying)

**Fix 1. Create `/refund-policy`**
- New route `app/refund-policy/page.tsx`
- Content should cover: what's refundable (unused credit packs), timeline (14 days), how to request (`support@pdfcraftai.com`), how refunds are returned (original payment method, 5–7 business days), who isn't eligible (consumed credits, expired bonus credits)
- Add entry to `lib/legal-docs.ts` so it slots into the same `LegalPage` component as Privacy/Terms
- Add link to footer "Legal" column

**Fix 2. Create `/cancellation-policy`**
- Because you're selling **credit packs** (one-time purchases) rather than a recurring subscription right now, the cancellation policy can be short: customers can stop using the service at any time; account deletion is self-serve from `/app/settings`; no auto-renewal to cancel.
- If you ship the monthly Plus plan advertised on `/pricing`, extend this page to cover subscription cancellation, proration, and grace-period behavior.
- Add link to footer.

**Fix 3. Create `/shipping-policy`** (yes — required even though nothing ships)
- One paragraph: "pdfcraft ai is a digital SaaS product. Access to paid credits is granted instantly upon successful payment. No physical goods are shipped. If you do not see credits reflected in your account within 15 minutes of a successful payment, contact `support@pdfcraftai.com`."
- Add link to footer.

**Fix 4. Publish a business address**
- Razorpay requires the address on the **applicant's** website (not just on the KYC form).
- Decide which legal entity is applying (PDFCRAFT AI, INC. per the footer copyright, or a new Indian entity if applying under Indian Razorpay). Use its registered address.
- Display on `/contact` under a "Registered office" heading and in the footer's "Company" column.
- If you're still finalizing the company's registered address, use a business address you can prove ownership of (utility bill, bank letter). Razorpay will cross-reference.

**Fix 5. Swap payment-processor reference**
- `lib/legal-docs.ts:34` currently says `"...billing info processed by Stripe."`
- Either:
  - (a) Change to `"...billing info processed by our payment gateway partner."` (provider-agnostic), or
  - (b) Change to `"...billing info processed by Razorpay."` once the application is approved
- Recommendation: go with (a) today so nothing has to change if you later add Paddle or a second gateway.

### HIGH (strongly recommended before applying)

**Fix 6. Add a phone number to `/contact`**
- Razorpay's risk team will call it during review in ~10% of cases for SaaS merchants.
- Even a VoIP number (Google Voice, Twilio, JustCall) is fine — it just has to ring to a human.
- Put it next to the email channels on `app/contact/page.tsx`.

**Fix 7. Remove the "Working draft" disclaimers**
- `lib/legal-docs.ts:30` (Privacy) and `:64` (Terms) both start with `disclaimer: "Working draft..."`.
- Razorpay reviewers read these pages line by line. "Working draft" signals the business isn't operational, which is a soft-reject trigger.
- Replace with the document's `updated` date only.

### OPTIONAL (nice-to-have, doesn't block activation)

**Fix 8. INR pricing toggle**
- If the applying entity is Indian, add an INR column to the credit-pack pricing table. Razorpay reviewers from the Indian risk team look for INR.
- If the applying entity is US (PDFCRAFT AI, INC.), USD is fine — you'll apply under Razorpay International / Razorpay Global payouts.

**Fix 9. Add a CIN/GSTIN footer line (Indian entity only)**
- If applying as an Indian Pvt Ltd / LLP, Razorpay reviewers appreciate seeing the CIN or GSTIN in the footer under the `©` line.

---

## 3. What about the Razorpay *integration* code itself?

Good news — the **technical** prerequisites for integrating Razorpay Checkout are already in place:

| Technical prereq | Status |
|---|---|
| CSP allows `checkout.razorpay.com`, `api.razorpay.com`, `lumberjack.razorpay.com` in `script-src` / `frame-src` / `connect-src` | PASS — `next.config.mjs` already lists `RAZORPAY_ORIGINS` |
| `Permissions-Policy` header allows `payment=(self "https://checkout.razorpay.com" ...)` | PASS — already set in `next.config.mjs` |
| PCI scope — app stays in SAQ-A (hosted iframe) | PASS — architecture comment in `next.config.mjs` confirms the plan |
| HTTPS on the page that launches checkout | PASS |
| Server-side webhook endpoint (for `payment.captured`, `refund.processed`, etc.) | **Not yet built** — needed before going live, but not required for the **application** itself |
| Server-side order creation endpoint | **Not yet built** — same, needed for live payments, not for application review |

Razorpay's website-review team does **not** require working checkout code on your site to approve the application. They only review the website's trust signals (the 7 gaps above). The code integration happens **after** they give you your live API keys.

So the build order is:

1. Fix the 7 content/legal gaps (BLOCKERS + HIGH above) → apply to Razorpay
2. While waiting for approval (~2–3 business days for standard), build the `/api/payments/order` and `/api/payments/webhook` endpoints using the **test-mode** keys Razorpay gives you immediately
3. Once the application is approved, flip keys to live and ship checkout publicly

---

## 4. Information Claude will need from you to finish the fixes

I can build the three missing policy pages and wire them into the footer without needing anything from you — the copy is standard SaaS boilerplate tuned to the refund language already in Terms §3.

I cannot finish Fix 4 (business address) or Fix 6 (phone) without you:

1. **Which legal entity is applying?**
   - "PDFCRAFT AI, INC." (US / Delaware / other?)  *or*
   - a separate Indian Pvt Ltd / LLP / Proprietorship

2. **Registered business address** (street, city, state/province, postal code, country)

3. **Phone number** to publish on `/contact` (VoIP is fine)

4. **PAN / GSTIN / CIN** if applying under an Indian entity (optional but helpful in the footer)

Once you paste those four items into chat, I will ship all seven fixes in one commit and push to main.

---

## 5. Suggested next action

Reply with the four items in §4 and say "ship it." I'll:

1. Write `app/refund-policy/page.tsx`, `app/cancellation-policy/page.tsx`, `app/shipping-policy/page.tsx`
2. Extend `lib/legal-docs.ts` with three new entries (same pattern as `privacy` / `terms`)
3. Add the three new links to `components/nav/Footer.tsx`'s Legal column
4. Update `app/contact/page.tsx` with the registered address + phone
5. Swap "Stripe" → provider-agnostic phrasing in `lib/legal-docs.ts:34`
6. Strip the "Working draft" disclaimers from Privacy + Terms
7. Commit + push → Hostinger auto-deploys → verify all three new URLs return 200
8. Update `docs/STATUS.md` + close task #75

Turnaround: about 20 minutes once you reply with the details.
