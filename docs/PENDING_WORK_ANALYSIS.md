# Pending Work — Deep Analysis

_Comprehensive audit of what's outstanding across every dimension of the product and operation. Drafted 2026-05-04 after the multi-day arc closed all 5 post-plan code gaps + 7 Tier-1/2 plan items. This doc supersedes the scattered "remaining work" notes in `NEXT_SESSION.md` §2/§3 and `TOOL_IMPROVEMENT_PLAN.md` Tier 2/3._

## TL;DR — what's actually pending

After this arc, the codebase is healthy: all post-plan gaps closed, Gap #2 cap active, abuse stack live, telemetry + cron firing. But there's real outstanding work in **6 categories**:

1. **Compliance / legal — 6 SEV-0 items** that should be fixed before taking material payment volume (most haven't been audited since `PLAN_GAP_ANALYSIS.md` was written 2026-04-20).
2. **Operational / observability — 4 unfunded alerting + monitoring gaps** (Slack alerting wired but env var unset, no PagerDuty, no staging environment, no real cron failure escalation).
3. **Business model — 5 monetization gaps** (no annual plan, no enterprise tier, no team plan, no rest-of-world payment processor, no referral program).
4. **Architecture / tech debt — 4 known pieces** (Apache `.htaccess` not auto-deployed, 5 component files >900 LOC, 2 orphaned `TODO(Phase E)` markers, no staging environment).
5. **Product gaps — 6 real customer-facing items** (real PDF Compress, PDF/A converter, Edit Text, true OCR-then-searchable workflow, bulk processing, mobile UI hardening).
6. **AI quality + observability — 4 measurement gaps** (no human eval loop, no thumbs-up/down affordance, no per-user quality signal, no A/B testing infra).

**Estimated total:** 80-120 person-days of work to clear everything. Realistic prioritization gets the SEV-0 compliance + operational basics done in 2-3 weeks; the rest is multi-month roadmap territory.

---

## 1. Compliance / legal (6 SEV-0 items)

These items are tracked in `docs/PLAN_GAP_ANALYSIS.md` from 2026-04-20. Most are still open — that audit predates the Pricing/Telemetry plan which addressed DPDP + auth hardening but not tax/invoicing/policy items.

### 1a. GST invoice generation missing (T2-G1, SEV-0)

**Status:** open. **Risk:** Indian merchant approval requires GST-compliant invoices for B2B sales above ₹200; first audit triggers fine + back-tax collection.

**Required fields per Indian GST law:** GSTIN of merchant + buyer (if registered), HSN/SAC code (998314 for digital services), CGST + SGST split (intra-state) or IGST (inter-state), invoice number + date + place of supply, tax amount in words.

**Estimate:** ~3-5 days. Need invoicing template engine (`lib/invoicing/types.ts` already has the type scaffold — see `INV-YYYY-XXXXXXXX` shape). Wire to PDF render via existing pdf-lib pipeline. Email + downloadable from `/app/billing`.

**Currently:** `lib/invoicing/types.ts` defines the types but no renderer. Razorpay payment receipts come through but aren't tax invoices.

### 1b. EU VAT / MOSS not handled (T2-G2, SEV-0)

**Status:** open. **Risk:** EU B2C threshold is €10k/year total EU revenue → registration + per-country VAT remittance. If we cross this with even one EU customer and don't register, exposure scales as VAT-due × (1 + interest + penalties).

**Mitigation paths:**
- **Option A:** Block EU traffic at signup (cleanest, biggest revenue leak).
- **Option B:** Use a Merchant of Record (Paddle MoR is the in-flight option; KYC pending). Paddle absorbs VAT calculation + remittance.
- **Option C:** Self-register MOSS scheme via OSS (One-Stop Shop). Adds quarterly compliance work.

**Currently:** Paddle KYC in progress (per `CLAUDE.md` §6 "verification in progress, sandbox live, production gated behind Paddle KYC review"). No fallback if Paddle KYC is denied.

**Estimate:** zero Claude-work if Paddle KYC clears (just the integration, scaffolded already at `lib/payments/adapters/paddle.ts`). 5-10 days if we have to self-register MOSS.

### 1c. US sales-tax-nexus exposure (T2-G3, SEV-0)

**Status:** open. **Risk:** 30+ US states have economic nexus at $100k revenue OR 200 transactions/year. At $5-9/pack, we hit 200 txns long before $100k. Each nexus state = registration + quarterly filing + audit risk.

**Mitigation:** same as EU VAT — Paddle MoR absorbs US sales tax. Without it, we'd need to register in every state we cross threshold (currently 0, so this is forward-looking).

**Estimate:** Paddle covers it. Otherwise Avalara/TaxJar at ~$50-100/mo + per-jurisdiction fees.

### 1d. Refund policy legal page missing (T2-G4, SEV-0)

**Status:** **Resolved (probably).** A `/refund-policy` page exists at `app/refund-policy/page.tsx`. **Should audit content** — the `PLAN_GAP_ANALYSIS.md` claim that "no `/refund-policy` page" was written 2026-04-20; the page may have shipped since.

**Action:** verify the page content covers Razorpay's stated requirements (visible from checkout, clear timelines, refund eligibility criteria, exclusions). 30 min to audit.

### 1e. Cookie banner / GDPR consent (T2-G5, SEV-0)

**Status:** **Resolved (probably).** `components/compliance/CookieConsent.tsx` exists. Should audit:
- Reject-all button as prominent as Accept-all
- Per-purpose toggles (analytics, marketing, functional)
- Pre-consent state: GA4 + Clarity scripts blocked
- Stored consent + 12-month re-prompt

**Action:** 1 hour to audit + screenshot for compliance evidence.

### 1f. Webhook retry storm handling (T2-G6, SEV-0)

**Status:** open. **Risk:** Razorpay retries a 5xx-failing webhook 24 times over 24 hours. If our handler errors transiently (MySQL hiccup), we get 24 deliveries. Idempotency key prevents double-grant, but signed-by-Razorpay verification has timing windows.

**Currently:** `lib/payments/webhook-handler.ts` has idempotency keys but I haven't confirmed dead-letter behavior. After 5 retries, Razorpay marks the delivery failed and stops — but we've already accepted the user payment. Without a reconciliation layer, we'd silently fail to grant credits.

**Mitigation:** the `reconcile-payments` cron (now firing daily) catches these. So this is **probably mitigated** by the existing reconciliation, but should be explicitly tested with a synthetic 5xx storm.

**Action:** 2-3 hours to write a failure-injection test. Verify reconcile-payments correctly grants credits for webhooks that the live handler 5xx'd 5 times.

### 1g. (NEW) Annual security audit not scheduled

**Risk:** SOC 2 Type II requires an annual audit + interim controls testing. Indian DPDP compliance requires periodic security review. We have neither scheduled.

**Estimate:** Defer until ARR justifies (~$5k-15k/yr SOC 2 audit cost; meaningful only at >$100k ARR). For now, document the controls we DO have (`docs/security/` if it exists).

---

## 2. Operational / observability (4 gaps)

### 2a. Slack alerting unwired

**State:** `lib/ai/margin-rollup.ts:1224` reads `AI_SPEND_ALERT_SLACK_URL` env var. **Not set in Hostinger.**

**Impact:** when a margin slice goes red (cost > 65% of revenue), the alert logs to stdout but no human sees it. Today (2026-05-04) the first margin rollup ran green; first red day will be silent.

**Action:** 
1. Create a Slack webhook (channel: ops or dedicated #pdfcraftai-alerts).
2. Set `AI_SPEND_ALERT_SLACK_URL` in Hostinger panel.
3. Verify by manually running `/api/cron/ai-margin-rollup` against a synthetic red day.

**Estimate:** 30 min user-action + 30 min Claude verification.

### 2b. Cron failure escalation

**State:** cron-job.org has the failure-auto-disable toggle ON for all 3 schedules. If a cron fails 3+ times consecutively, it disables. **No alerting** — admin only finds out by manually checking cron-job.org dashboard.

**Mitigation paths:**
- cron-job.org has email-on-failure built in — enable it for the 3 schedules (5 min user-action)
- OR pipe the cron URLs through a healthcheck.io / dead-mans-switch (stronger; alerts when the cron *doesn't* fire, not just when it errors)

**Estimate:** 15 min user-action.

### 2c. No staging / preview environment

**State:** every deploy goes straight to prod via Hostinger's GitHub auto-pull. No staging surface.

**Impact:** the cascade pattern (~80% of code-bearing commits cascade) is partly because we have no buffer. A staging deploy would catch bugs before they hit users + let us validate the cascade-recovery playbook in a low-stakes environment.

**Mitigation:** spin up a `staging.pdfcraftai.com` Hostinger app on a separate plan + GitHub branch. Deploy `staging` branch before merging to `main`.

**Estimate:** 1 day to set up Hostinger staging + branch policy. Adds ~$3-5/mo hosting cost. Real-world value: cuts user-facing cascade frequency to near-zero (cascades happen on staging, never see prod).

### 2d. No PagerDuty / on-call

**State:** zero alerting on /api/health 503 (the cascade signature). Founder is the only on-call.

**Mitigation:** Healthchecks.io (free tier) pinging `/api/health` every 5 min, paging via SMS on >2 consecutive failures. Or PagerDuty free tier (1 user, 5 min response).

**Estimate:** 30 min user-action.

---

## 3. Business model gaps (5 monetization items)

### 3a. No annual plan (T1-5 from improvement plan)

**State:** pricing page only shows monthly Plus ($9 = 200 credits + rollover to 400). No annual discount.

**Industry standard:** 15-20% annual discount. $9/mo × 12 = $108/yr → ship at $89-90/yr.

**Estimate:** ~3 hours (pricing page + checkout flow + variant handling — already scaffolded in `lib/pricing.ts:annual` per the existing infrastructure).

### 3b. No team / multi-seat plan

**State:** every seat = separate account = separate credit balance. Real teams want shared credit pool, admin console, audit log, billing consolidation.

**Estimate:** 2-3 weeks for a real team plan with shared billing + per-seat permissions + SSO via Google Workspace.

### 3c. No enterprise contact path

**State:** pricing page tops out at $9/mo Plus. No "contact us" CTA for SMB asks. We turn away every conversation that starts with "we have 50 employees who need..."

**Estimate:** 1 hour. Add a `/enterprise` page with sales-qualified-lead form. Wire to founder email (or HubSpot if installed).

### 3d. Rest-of-world payment processor

**State:** Razorpay India-only. Paddle KYC pending. We can't take EU/US payments today.

**Estimate:** zero Claude-work — vendor blocked. Once Paddle KYC clears, the adapter at `lib/payments/adapters/paddle.ts` is scaffolded.

### 3e. No referral program

**State:** zero growth-loop infrastructure. Existing users have no incentive to refer.

**Estimate:** 1-2 weeks for a real referral program (referral codes, attribution, reward credit grants both sides, fraud detection).

---

## 4. Architecture / tech debt (4 items)

### 4a. `.htaccess` not auto-deployed (caught this session)

**State:** the live Apache `.htaccess` is the source-of-truth for production headers (CSP, HSTS, security headers). Hostinger's GitHub auto-pull does NOT sync it. Today's CSP-Turnstile fix had to be SSH-edited directly.

**Mitigation:** Hostinger has a "Deploy from repo" feature for static files. Need to investigate whether `.htaccess` can be in `public/` and auto-deployed. Alternative: a custom GitHub Action that SSH-syncs `public/.htaccess.prod-snapshot` → server `.htaccess` on every push.

**Risk:** any future CSP / security header change that's only made in `next.config.mjs` is silently ignored. We've now snapshotted the live state at `public/.htaccess.prod-snapshot` (commit `35abd8c`) but the snapshot isn't enforced.

**Estimate:** 1 day to wire a deploy-script that diffs the snapshot vs prod and SSH-syncs.

### 4b. 5 component files >900 LOC (T2-4)

**State:** 
- `SummarizeVariantTool.tsx` — 1,090 lines (serves ~30 AI variant tools)
- `SignPdfTool.tsx` — 952 lines
- `PdfSplitTool.tsx` — 926 lines
- `PageGridTool.tsx` — 874 lines
- `PdfAddLinksTool.tsx` — 862 lines

Large files = higher bug density. Refactor each into composed sub-components, move pure functions to lib helpers.

**Estimate:** 5-7 days.

### 4c. Orphaned `TODO(Phase E)` markers

**State:** 2 TODOs in code:
- `lib/payments/dunning.ts:236` — "persist DunningRow to a `subscription_dunning` table"
- `app/api/contact/route.ts:116` — "wire SendGrid / Postmark here"

Both are meaningful gaps. Dunning means subscribers whose payment failed don't get retried (we lose them). Contact form means submissions go to stdout/log only, not to ops.

**Estimate:** Dunning ~1 week (real flow: failed payment → 3-day grace → 7-day notice → 14-day cancel). Contact form ~2 hours (wire any transactional email provider).

### 4d. No feature flag system beyond env vars

**State:** every feature toggle is a Hostinger panel env var (e.g., `BONUS_PER_OP_CAP_ENABLED`, `SIGNUP_GRANT_ENABLED`, `MULTIPLIER_PRICING_ENABLED`). Toggling requires panel access + redeploy.

**Mitigation:** GrowthBook (free tier 100k events/mo) or Unleash. Lets us flip flags without redeploy + run real A/B tests.

**Estimate:** 2-3 days.

---

## 5. Product gaps (6 customer-facing items)

### 5a. Real PDF Compress (T2-1)

**State:** intentional gap (pdf-lib limitation). Two SEO landings + use case + 2 blog posts had bait-and-switch references; cleaned up this session. Now honest but the demand is real.

**Implementation:** server-side `qpdf --linearize` + `gs -sDEVICE=pdfwrite -dPDFSETTINGS=/screen`. Three levels (Light, Balanced, Strong). Run as a credit-priced AI op (~5 credits per doc) since it needs server compute.

**Estimate:** 5 days.

### 5b. PDF/A converter (not just check)

**State:** we have `/tool/pdf-a-check` (validates compliance) but no converter (makes a non-compliant PDF compliant). Real demand from compliance/archival users.

**Implementation:** server-side via Ghostscript (`gs -dPDFA=2 -sProcessColorModel=DeviceRGB ...`) or qpdf. Embed required color profiles, font subset, metadata.

**Estimate:** 3-4 days.

### 5c. Edit Text in PDFs

**State:** intentional gap (pdf-lib doesn't support text editing in existing pages). Add Text Box (overlay) is the closest current tool.

**Implementation:** Either deeper PDFium integration (read text frames, modify in place) or Apache PDFBox (Java sidecar service).

**Estimate:** 2-3 weeks. Significant complexity; deferred for good reason.

### 5d. True OCR-then-searchable workflow

**State:** we have `ai-ocr` (returns markdown) and `ai-searchable-pdf` (returns PDF with searchable text layer) as separate tools. No unified flow that takes a scanned PDF → OCRed + searchable PDF in one click.

**Implementation:** combine the two pipelines into one route `ai-ocr-searchable` that takes the OCR output + bakes it back into a searchable PDF using the original page imagery.

**Estimate:** 1 week.

### 5e. Bulk processing (T3-1)

**State:** every operation is single-file. Real workflows = "process 50 invoices."

**Implementation:** ZIP upload OR multi-select with shared config. Background job processing with progress UI. Per-file results table + bulk download as ZIP.

**Estimate:** 2-3 weeks.

### 5f. Mobile UI hardening (T1-4)

**State:** unaudited. Visual editors (PageEditorTool consumers) likely have poor touch behavior. ~40% of typical PDF tool traffic is mobile.

**Implementation:** Playwright mobile spec across 13 visual editors. Fix issues found. Add bottom-sheet config panel on small screens.

**Estimate:** 3-5 days.

---

## 6. AI quality + observability (4 measurement gaps)

### 6a. No human eval loop

**State:** AI outputs quality is measured only at the structured level (JSON shape compliance, response length sanity). No subjective quality grading.

**Implementation:** golden-set per op, weekly human grading (rubric: relevance, completeness, faithfulness, actionability). Compute per-(provider, model, op) quality score, recomputed daily.

**Estimate:** 2 weeks (golden-set curation alone is ~1 week).

### 6b. No thumbs-up/down affordance

**State:** users have no way to flag bad AI output.

**Implementation:** thumbs ↑/↓ buttons on every AI result card. Persist to new `ai_feedback` table. Surface in `/admin/tools/[id]` per-op stats. Use as eval signal for routing.

**Estimate:** 3-4 days.

### 6c. No per-user quality signal

**State:** when one user gets bad outputs (provider hiccup, prompt injection in their PDF, or genuine model failure), there's no way to detect this server-side except via support email.

**Implementation:** track `consecutive_negative_feedback` per user. After N (3? 5?) consecutive thumbs-down on AI ops, surface to admin or auto-route to a different provider.

**Estimate:** ~1 week (depends on 6b shipping first).

### 6d. No A/B testing infrastructure

**State:** every change is "ship to all users immediately." No way to test (e.g.) different OutOfCreditsAlert copy variants, different pricing display, different abuse layers.

**Implementation:** GrowthBook (4d above). Once installed, A/B tests are config changes. Stats engine built-in.

**Estimate:** 1-2 weeks (depends on 4d).

---

## 7. Marketing / SEO gaps

These are smaller but worth flagging:

### 7a. Stale content cadence
- Last blog posts: April 25 (9 days stale)
- No content calendar
- No backlink strategy
- No comparison content vs SmallPDF / iLovePDF / Adobe

### 7b. No affiliate / partner program
- Indian agencies + freelancers are a real channel; no incentive to promote us

### 7c. No tutorial / onboarding for first-time users
- New signup → /verify-email → ??? — no guided first-tool experience

---

## 8. Suggested execution sequence

If the founder picked one item per week for the next 8 weeks:

| Week | Item | Class | Estimate |
|---|---|---|---|
| 1 | Slack alerting + cron-job.org failure email + healthchecks.io | Operational | 2 hours user-action |
| 2 | Audit refund-policy + cookie banner + GST scaffold review | Compliance | 1-2 days |
| 3 | T1-5 annual plan + T1-6 Plus CTA on alert | Monetization | 1 day |
| 4 | Real PDF Compress (T2-1) — server-side qpdf+gs | Product | 5 days |
| 5 | Mobile UI hardening (T1-4) — Playwright mobile spec across 13 visual editors | Product | 3-5 days |
| 6 | Thumbs ↑/↓ affordance + ai_feedback table | AI quality | 3-4 days |
| 7 | Staging environment + GitHub branch policy | Operational | 1 day |
| 8 | Pick by data: bulk processing OR developer API tier | Strategic | 2-3 weeks (multi-week) |

**Critical path** (must do before scaling):
- Slack alerting (otherwise red margin days are silent)
- GST invoice generation (Indian merchant requirement)
- EU VAT path (Paddle KYC OR self-registration) — blocking for international expansion

**Nice-to-have but high leverage:**
- Real Compress (kills the bait-and-switch perception entirely)
- Annual plan (revenue lift with zero infrastructure cost)
- Thumbs feedback (data flywheel for AI quality)

---

## 9. What this analysis does NOT cover

- **Growth experiments** (paid acquisition, organic SEO improvements, content) — these are GTM not engineering
- **Hiring** — codebase complexity may eventually require a second engineer
- **Vendor negotiations** — Anthropic/OpenAI/Gemini volume discounts at scale
- **Legal entity / Indian company structure** — pdfcraftai.com vendor account is in `rajasekarjavaee@gmail.com`'s name; eventually needs a Pvt Ltd or LLP for tax efficiency

These are real outstanding items but outside the engineering-focused scope of this doc.

---

## 10. Related docs

- `docs/PRICING_AND_TELEMETRY_PLAN.md` — original plan that closed Days 1-6
- `docs/PLAN_GAP_ANALYSIS.md` — older 42-gap audit (April 20); some items addressed by this arc, most still open
- `docs/TOOL_IMPROVEMENT_PLAN.md` — 18-item Tier 1/2/3 roadmap (T1-1, T1-3, T2-5 shipped)
- `docs/STATUS.md` — running timeline
- `docs/NEXT_SESSION.md` — session-level handoff
- `docs/SESSION_2026-05-04_RETROSPECTIVE.md` — what shipped + lessons learned this arc
- `docs/OPS_RUNBOOK.md` — incident decision flows
- `CLAUDE.md` — bootstrap

The codebase + production are healthy. What's pending is genuine forward work, not unfinished plumbing — most items have estimates in days/weeks rather than hours, and several (compliance, Paddle KYC, growth) are partly external-vendor blocked. Pick by impact + dependency, not by item count.

---

## 11. Newly identified subtle issues

### 11a. Webhook audit-row insert before processing (PENDING §1f follow-up)

**State:** discovered while writing the webhook-reconcile-resilience CI
guard. `lib/payments/webhook-handler.ts` calls `recordWebhookEvent`
BEFORE `applyPaymentEvent`. If processing throws on first delivery:

1. Audit row inserts (recorded:true)
2. Processing throws → 500 → provider retries
3. On retry, audit dedupe sees existing row → recorded:false → 200 duplicate
4. Provider marks delivered. Processing never re-ran.

**Mitigation today:** the nightly reconciliation cron (commit
`f02c5b3`) catches this — it asks the provider "what happened in the
last 48h" and synthesizes any missing events through the same
idempotent path. Maximum credit-grant latency on a webhook-failure
event is ~24h.

**Real fix:** defer the audit row insert until AFTER `applyPaymentEvent`
succeeds, OR mark the row as "processing_failed" and update to
"processed" on success. The latter is more robust because it preserves
the audit trail of what we attempted.

**Risk:** medium — actual occurrence requires applyPaymentEvent to
throw on first delivery, which is rare (DB write inside a transaction;
either commits or rolls back fully). When it does happen, the
reconcile sweep recovers within 24h.

**Estimate:** ~2 hours (handler logic change + new test cases). Not
prioritized for this arc because the safety net works; tracking here
so the next compliance/payments review picks it up.
