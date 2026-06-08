# Email deliverability — SPF / DKIM / DMARC for pdfcraftai.com

**Last revised: 2026-06-08**

## Why this doc exists

The app sends real transactional email through Hostinger SMTP
(`smtp.hostinger.com`, from `support@pdfcraftai.com` — see
`lib/auth/smtp.ts`). `SMTP_PASS` is set in Hostinger, so sending
already works. **What's missing is DNS authentication.** Without
SPF, DKIM, and DMARC records, mailbox providers (Gmail, Outlook,
Yahoo) treat the mail as unauthenticated and route a meaningful
share of it to spam — Hostinger's own SMTP docs estimate ~10-15%.

This matters now because six account-essential emails depend on it:

| Email | Trigger | Code |
|---|---|---|
| Verification | signup | `lib/auth/email-verification.ts` |
| Password reset | forgot-password | `app/api/auth/forgot-password/route.ts` |
| Welcome | first email verification | `lib/email/transactional.ts` |
| Receipt | successful purchase | `lib/email/transactional.ts` |
| Low-credit nudge | balance crosses below threshold | `lib/email/transactional.ts` |
| Payment-failed | failed checkout | `lib/email/transactional.ts` |

A verification or receipt email in spam is a silent activation and
revenue leak. **Do this before flipping Razorpay to live keys**
(see `docs/RAZORPAY_LIVE_SWAP.md`).

## Important: the records go in CLOUDFLARE, not Hostinger

`pdfcraftai.com` DNS is managed by **Cloudflare** (full proxy — see
`CLAUDE.md`). Even though the mailbox is hosted at Hostinger, the
authoritative nameservers are Cloudflare's, so all three records
below are added in the **Cloudflare dashboard -> DNS -> Records**, not
in Hostinger's DNS editor. (Anything added in Hostinger's DNS panel
has no effect while Cloudflare is authoritative.)

All three are `TXT` records and must be **DNS only** (grey cloud) —
Cloudflare can't proxy TXT records anyway, but double-check the
cloud icon is grey.

## Step 1 — Get the real values from Hostinger

Hostinger generates a domain-specific DKIM key and publishes the
exact SPF/DKIM values you should use:

1. Log in to **hPanel -> Emails -> `pdfcraftai.com` -> Email accounts**
   (or **Email -> Configuration / DNS records**).
2. Find the **DNS records / "Configure DNS"** panel. Hostinger lists
   the exact SPF, DKIM, and (sometimes) DMARC records it recommends
   for this mailbox. Copy these exact strings — they are the source
   of truth. The values below are typical Hostinger values for
   reference, but **use what hPanel shows** if it differs.

## Step 2 — Add the records in Cloudflare

In **Cloudflare -> DNS -> Records -> Add record** (Type = TXT each time):

### SPF (authorizes Hostinger to send for your domain)

- **Name:** `@`  (i.e. `pdfcraftai.com`)
- **Content (typical Hostinger value):**
  `v=spf1 include:_spf.mail.hostinger.com ~all`
- One SPF record only. If an SPF TXT already exists, MERGE the
  `include:` into it rather than adding a second SPF record — two
  SPF records is itself a failure.

### DKIM (cryptographically signs each message)

- Hostinger gives you a **selector** (e.g. `hostingermail1` or
  `default`) and a long public-key value.
- **Name:** the selector host Hostinger specifies, typically
  `hostingermail1._domainkey` (so the full host is
  `hostingermail1._domainkey.pdfcraftai.com`).
- **Content:** the exact `v=DKIM1; k=rsa; p=...` value from hPanel
  (it's long — copy it whole, no line breaks).
- Hostinger sometimes provides DKIM as a **CNAME** instead of a TXT
  (pointing at a Hostinger-hosted key). If so, add it as a CNAME with
  the host + target hPanel shows, grey cloud.

### DMARC (tells receivers what to do + sends you reports)

- **Name:** `_dmarc`  (full host `_dmarc.pdfcraftai.com`)
- **Content (start in monitor mode):**
  `v=DMARC1; p=none; rua=mailto:support@pdfcraftai.com; fo=1`
- Start at `p=none` (monitor only — nothing gets blocked). After a
  week of clean reports showing SPF+DKIM aligned and passing, tighten
  to `p=quarantine`, and later `p=reject` for full protection.

## Step 3 — Wait for propagation

TXT changes through Cloudflare are usually live in minutes, but allow
up to ~1 hour. Check with:

```
dig +short TXT pdfcraftai.com                              # SPF
dig +short TXT hostingermail1._domainkey.pdfcraftai.com    # DKIM (use your selector)
dig +short TXT _dmarc.pdfcraftai.com                       # DMARC
```

## Step 4 — Verify deliverability

1. **mail-tester.com** — open it, copy the throwaway address it
   gives you, and trigger a real send to that address. Simplest
   trigger: go to `/register`, sign up with the mail-tester address,
   and let the verification email fire. Then check the score — aim
   for **9-10/10** with SPF, DKIM, and DMARC all ticked green.
2. **Gmail "Show original"** — send any of the emails to a Gmail
   account, open it, then ⋮ -> "Show original". You want:
   `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.

## Notes

- `lib/auth/smtp.ts` already sets RFC-8058 `List-Unsubscribe` +
  `List-Unsubscribe-Post` headers, which Gmail/Yahoo bulk-sender
  rules expect — that part is done; it's only the DNS auth that's
  outstanding.
- If you ever move off Hostinger SMTP (e.g. to Resend/SES), the SPF
  `include:` and the DKIM selector change — re-do steps 1-2 with the
  new provider's values. DMARC stays.
- Volume ceiling: Hostinger Premium is ~300 emails/hour, ~7,000/day —
  fine for current scale. Revisit if lifecycle volume approaches it.

## Sources

- `lib/auth/smtp.ts` — transport config + from address + List-Unsubscribe
- `lib/email/transactional.ts` — welcome / receipt / low-credit / payment-failed
- `lib/email/templates.ts` — pure email bodies
- `docs/RAZORPAY_LIVE_SWAP.md` — do this before going live
