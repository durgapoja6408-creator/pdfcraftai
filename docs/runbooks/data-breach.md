# Data Breach Response Runbook

**Owner:** Raja Selvam (rajasekarjavaee@gmail.com) — operating as the de-facto Data Protection contact for pdfcraftai.com (no formal DPO designation per plan §8a item 13). Update when designation changes.

**Scope:** This runbook covers the response when personal data held by pdfcraft ai is suspected or confirmed to have been accessed, copied, modified, or deleted by an unauthorised party.

**Last reviewed:** 2026-05-02 (Day 1.6 plan landing).
**Next review:** 2026-08-01 (or earlier if any incident triggers a review).

---

## Legal context

Two regimes apply:

1. **DPDP Act 2023 (India)** — pdfcraftai.com is a Data Fiduciary under §2(i). Under §8(6) we must notify both:
   - The **Data Protection Board of India** (DPB) — every breach, no minimum threshold, "as soon as practicable".
   - **Affected Data Principals** (users) — within a "reasonable time" determined by the DPB's notified rules. Best practice = within 72 hours of confirmed breach.

2. **GDPR Art. 33-34 (EU/UK)** — applicable when EU/UK users are involved. Notify:
   - The relevant **Supervisory Authority** within 72 hours of becoming aware (Art. 33).
   - **Affected data subjects** without undue delay if the breach is high-risk to rights and freedoms (Art. 34).

The 72-hour clock starts at "confirmed breach", not "suspected". Investigation time is allowed if it doesn't extend beyond reasonable.

---

## Tier classification (decide within first hour)

### Tier 1 — Confirmed PII exfiltration
Database backup leaked, password hash dump posted publicly, email list extracted, credentials breach via stolen Hostinger SSH.
**Action:** Full notification cycle. Engage outside counsel.

### Tier 2 — Suspected exfiltration (no public evidence)
Anomalous DB query logs (large unbatched `SELECT * FROM users`), Hostinger SSH from unfamiliar IP, password-reset flood, login-attempt explosion from a single device.
**Action:** Investigate within 4 hours. If confirmed → Tier 1. If ruled out → close with internal incident report only.

### Tier 3 — Internal misuse / accidental exposure
Admin-page leak (e.g. /admin/users/[id] exposed without auth), debug log file with PII published, vendor/sub-processor breach.
**Action:** Tier 1 if user data reached non-authorised eyes. Tier 2 otherwise.

### Tier 4 — Vulnerability disclosure (no exploitation)
Researcher emails about an SQL injection in /admin endpoint; no evidence of exploitation.
**Action:** Tier 2 process. Patch within 24 hours. No notification unless Tier 1 confirmed.

---

## Hour-by-hour response

### 0-1 hours — Triage
1. **Acknowledge** the report internally. If from a researcher, reply within 1 hour: "Received. Investigating. Will update by [+24h]."
2. **Assess tier** per above.
3. **Stop the bleed**: rotate any compromised credential — Hostinger SSH key, GitHub PAT, MySQL password, NextAuth secret, AI provider API keys.
4. **Snapshot evidence**: save Hostinger logs, db query log, audit log if any. Preserve in `~/incident-evidence/${YYYY-MM-DD}-${shortid}/` on the prod server.

### 1-4 hours — Investigation
1. Determine **which user IDs were affected**. If unable to determine, treat as "all users".
2. Determine **what fields were exposed** (passwords? emails? PDF content? payment data?).
3. Determine **timeline** — when did the breach start? When was it stopped?
4. Identify **root cause** — query Hostinger nodejs/stderr.log for anomalous patterns; check `git log` for unauthorised commits; scan `/admin` route for missing auth gates.

### 4-24 hours — Containment
1. **Force password reset** for all affected users (or all users if scope unclear) — temporary token table entries with 24h expiry.
2. **Invalidate sessions** — bump `NEXTAUTH_SECRET` to invalidate every active JWT.
3. **Audit recent admin actions** — `SELECT * FROM credit_ledger WHERE created_at > [timestamp]` to spot manual credit grants by attacker.
4. **Patch root cause** — fix the vulnerability before any user notification (otherwise your notification IS the next-breach announcement).

### 24-72 hours — Notification
1. **Draft notification email** using the template in `docs/runbooks/data-breach-template.md` (TODO — create on first incident).
2. **DPB submission** — file via the [DPB online portal](https://www.dpdpa.in/) (URL placeholder, update when DPB portal launches officially). Include: nature of breach, categories of data, approximate user count, contact for queries, measures taken.
3. **GDPR notification** — only if EU/UK users affected. Submit to the relevant Supervisory Authority via EU's [breach notification portal](https://edpb.europa.eu/).
4. **Direct user emails** sent via support@pdfcraftai.com SMTP, NOT through any platform that could see the email content (no Mailchimp, no SendGrid for breach comms).

### Post-72 — Aftermath
1. **Public statement** if Tier 1 — short-form post to /blog/security-incident-{date}.
2. **Post-incident review** in `docs/runbooks/incidents/${date}.md` — what happened, what we did, what we'd do differently.
3. **Update this runbook** with lessons learned.

---

## Channels and contacts

- **Internal alert**: rajasekarjavaee@gmail.com (primary) + SMS to Raja's verified phone.
- **User-facing comms**: support@pdfcraftai.com (Hostinger SMTP).
- **DPB India contact**: TBD when DPB portal launches.
- **GDPR Supervisory Authority**: depends on EU member state of the affected user.
- **Outside counsel**: TBD when relationship established (target Q3 2026).
- **Hostinger support** (for infra-side breaches): hPanel → Support → New ticket. Phone +1-855-844-4870 (24/7).

---

## What we DO have logged

- All AI route invocations: `ai_usage` table (provider, model, latency, cost, success/error).
- All credit ledger entries: `credit_ledger` (every grant/spend with reason + idempotency key).
- All payments: `payments` (status, amount, refund history).
- All admin auth events: NextAuth's `accounts` + `sessions` tables.
- HTTP error logs: Hostinger nodejs/stderr.log + nodejs/stdout.log.
- Pre-deploy git history: GitHub repo `durgapoja6408-creator/pdfcraftai`.

## What we do NOT have logged

- Per-request user-IP correlation — we'd need to add request logging with privacy guards. NOT on roadmap.
- Per-query DB access logs (Hostinger doesn't expose MySQL general-log to shared-hosting users).
- File-content access (uploads delete within 60 minutes; no read-side audit).

These gaps mean that for some breach types we cannot fully reconstruct who accessed what. Notifications should disclose this honestly: "We are unable to confirm whether your specific PDF content was viewed, but the data was theoretically accessible during the breach window."

---

## What this runbook is NOT

It's not a substitute for legal counsel. The first call on any Tier 1 incident is to outside counsel (when established) or to rajasekarjavaee@gmail.com for an interim decision. This document is the operational checklist; the legal interpretation lives elsewhere.

---

## Cross-border data transfer note

pdfcraftai.com data is hosted on Hostinger EU (`us-imm-web534.main-hosting.eu`). Under DPDP Act §16, transfers outside India are permitted unless the destination country is on the Central Government's restricted list. As of 2026-05-02, no such list has been notified that affects EU. Privacy Policy discloses Hostinger EU as the data-residency location. If India publishes a restricted list including EU, we will need to migrate the database to a permitted region (estimated: 4-6 hours of work, requires SSH + db dump/restore).
