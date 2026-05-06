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

### 2a. Slack alerting unwired — ✅ HELPER FOUNDATION SHIPPED (2026-05-04)

**Original state (audit time):** `lib/ai/margin-rollup.ts:1224` read `AI_SPEND_ALERT_SLACK_URL` env var inline. Var unset in Hostinger panel. Several other modules across the codebase had TODO markers for "post a Slack alert" without a shared helper to call.

**Helper foundation shipped** in commit (this session) — `lib/ops/slack-alert.ts` as the single home for the webhook URL read + canonical attachment payload format + never-throws fetch wrapper. Three exported pieces:
- `sendSlackAlert({severity, title, body, context?})` — async, returns a `SlackAlertResult` envelope, never throws (a Slack outage shouldn't crash the alerting target). Reads `SLACK_OPS_WEBHOOK_URL` env var (canonical name, replaces the per-call-site inline reads of `AI_SPEND_ALERT_SLACK_URL`).
- `formatSlackPayload(input)` — pure formatter (severity → color/emoji map, context fields with 200-char cap + null-drop, ts in unix-seconds). Tested via dynamic execution in the CI guard.
- `readSlackWebhookUrl()` — defensive validator (rejects non-https URLs).

**Founder action still pending** (this is the §2a work the original audit flagged):
1. Create a Slack webhook (channel: ops or dedicated #pdfcraftai-alerts).
2. Set `SLACK_OPS_WEBHOOK_URL` in the Hostinger panel — OR keep the legacy `AI_SPEND_ALERT_SLACK_URL` if that var is already set somewhere; both work.
3. ~~Migrate `lib/ai/margin-rollup.ts` from the inline `AI_SPEND_ALERT_SLACK_URL` read to `sendSlackAlert()` (~10-line code change once the helper is in place — separate commit).~~ ✅ DONE in the next commit after this one — the shared helper is now consumed by `postMarginAlertToSlack`, with `urlOverride` keeping the legacy env var name working for backward-compat.
4. Verify by manually running `/api/cron/ai-margin-rollup` against a synthetic red day.

The helper foundation + first consumer migration both lands ahead of the founder action. Until step 2 completes, `sendSlackAlert` returns `{ok:true, sent:false, reason:"no_webhook_configured"}` — graceful no-op.

**Estimate:** 30 min user-action (steps 1+2) + ~10 min Claude verification (step 4).

### 2b. Cron failure escalation — partially unblocked by §2a helper

**State:** cron-job.org has the failure-auto-disable toggle ON for all 3 schedules. If a cron fails 3+ times consecutively, it disables. **No alerting** — admin only finds out by manually checking cron-job.org dashboard.

**Mitigation paths (in increasing order of robustness):**
- cron-job.org has email-on-failure built in — enable it for the 3 schedules (5 min user-action).
- OR pipe the cron URLs through a healthcheck.io / dead-mans-switch (stronger; alerts when the cron *doesn't* fire, not just when it errors).
- Application-level: each cron route can call `sendSlackAlert({severity:"alarm", title:"Cron <name> failed", body, context:{...}})` from `lib/ops/slack-alert.ts` (foundation shipped 2026-05-04; see §2a). This catches application-level failures (assertion thrown, downstream API down) that wouldn't necessarily surface as a non-200 to cron-job.org.

**Estimate:** 15 min user-action (cron-job.org email) + ~30 min Claude follow-up to thread `sendSlackAlert` calls into the 3 cron route handlers once the env var lands.

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

### 3a. No annual plan (T1-5 from improvement plan) — ✅ ALREADY SHIPPED (re-discovered 2026-05-05)

**Audit-pass finding:** the original "estimate ~3 hours" turned out to be wrong-side-of-zero — the work had already shipped before the audit doc was written, and the doc was never refreshed.

**Verification (2026-05-05 grep pass against the live tree):**
- `lib/pricing.ts` — `PackVariant = "monthly" | "annual"` literal union, `ANNUAL_DISCOUNT_BPS = 2000` (20%), `ANNUAL_MONTHS = 12`, `packAmountMinor(pack, currency, { variant })` applies the 12× × 0.8 math, `creditsForPurchase(pack, "annual")` returns 12× credit grant.
- `components/billing/PackUpsellPanel.tsx` — UI toggle between "Monthly" and "Annual · 20% off" tabs, drives `variant` state into `CheckoutButton`.
- `components/billing/CheckoutButton.tsx` — accepts `packVariant: PackVariant` prop, threads it into the server action.
- `lib/payments/checkout-actions.ts` — records `annualVariant: variant === "annual" ? 1 : 0` on the payment row.
- `lib/payments/ledger.ts` — reads `variant` from the payment row (`purchase_annual` reason, ledger meta `annualVariant: 1`), grants `pack.credits × 12` on annual purchases.

**Concrete next steps (if any):**
- (Optional) Wire the `FEATURE_FLAGS.ANNUAL_PLAN` flag (registered in commit `a849c91` for exactly this) to gate the toggle visibility — useful if the founder wants A/B testing or partial rollout in a future commit. Today the toggle is hardcoded-visible. Estimate: ~30 min.
- (Optional) FAQ copy / pricing page content audit to make sure the "annual = 12× credits at 20% off" framing is consistent everywhere users encounter it.

### 3b. No team / multi-seat plan — ✅ FOUNDATION SHIPPED (2026-05-05)

**Original state (audit time):** every seat = separate account = separate credit balance. Real teams wanted shared credit pool, admin console, audit log, billing consolidation. Conversations starting with "we have N employees who need PDF tools" went nowhere beyond `/enterprise` (which captures the lead but doesn't sell anything).

**Foundation shipped** in this session — full storage + helper + admin viewer surface:
- Migration 0025 (`organizations` + `organization_members` + `organization_invites`) applied pre-push to prod via SSH HEREDOC. Three new tables; zero existing-row impact.
- Drizzle schema entries with full per-column docstrings.
- `lib/orgs/codes.ts` — `slugify(name)` (URL-safe slug from org name with collapse-runs/trim/64-char-truncate normalization) + `generateInviteToken()` (32-char base36 token, 36³² namespace). Pure functions.
- `lib/orgs/queries.ts` — 6 read-side helpers: `loadOrgsForUser` (M:N join through members for /app dashboard org switcher), `loadOrgMembers`, `loadOrgInvites` (filterable on accepted/pending), `lookupInvite` (with expired-invite filter so stale links can't be accepted), `loadAdminOrgStats`, `isMultiSeatEnabled` flag-check helper.
- `/admin/orgs` — read-only viewer with 4 summary cards (orgs / memberships / pending invites / accepted invites), top-10 leaderboard by member count, and a status banner showing `MULTI_SEAT` flag state.
- 91-assertion CI guard (`scripts/test-orgs-foundation.mjs`) covering migration DDL (three tables, slug/token/(org,user) uniques, all columns, no DROP/MODIFY/CHANGE), Drizzle schema parity, helper public surface, FEATURE_FLAGS.MULTI_SEAT pin, admin page export shape + read-only invariant, expired-invite filter, plus dynamic execution of `slugify` against 5 normalization invariants.

**Same staging discipline** as feature-flags / referrals / quality-signal: schema + read paths land NOW behind the MULTI_SEAT flag (already registered in lib/flags.ts §4d).

**Phase F core writers shipped 2026-05-05** (this session) — `lib/orgs/writers.ts` with three flag-gated functions:
- ✅ `recordOrgCreate({ownerUserId, name, billingMode?})` — atomic transaction inserts the org row + the owner's `organization_members` row (role="owner"). Slug generated via `slugify(name)` with bounded collision-retry (suffix `-2`, `-3`, …, max 16 attempts). Empty-slug fallback to `org-<random>` for names that produce no alphanumeric content (e.g. emoji-only names).
- ✅ `inviteMember({organizationId, email, role, invitedByUserId, ttlDays?})` — generates a 32-char base36 token, atomically replaces any prior pending invite for the same `(org, email)` (DELETE old → INSERT new in transaction so the prior email link goes dead immediately — important when the prior email might be in the wrong inbox). Email lowercased for case-insensitive matching. Role rejected unless `"admin" | "member"` (no "owner" via invite — owner role is set only at org creation).
- ✅ `acceptInvite({token, userId})` — validates token (not-expired + not-already-accepted), atomic INSERT into `organization_members` + UPDATE `acceptedAt` on the invite. 4 distinct error codes for the failure modes (`INVITE_NOT_FOUND` / `INVITE_EXPIRED` / `INVITE_ALREADY_ACCEPTED` / `ALREADY_MEMBER`) so the future `/invite/<token>` UI renders appropriate copy. ALREADY_MEMBER path marks the invite acceptedAt anyway so it doesn't hang as pending forever.

`OrgWriteError` class with codes `DISABLED | EMPTY_REQUIRED | SLUG_GENERATION_FAILED | INVITE_NOT_FOUND | INVITE_EXPIRED | INVITE_ALREADY_ACCEPTED | ALREADY_MEMBER | DB_ERROR`. `ORG_INVITE_DEFAULT_TTL_DAYS = 7` constant.

26-assertion guard expansion in CI Section G covering all three writers' public surface, flag-gates per function, transaction wrapping on recordOrgCreate + acceptInvite, slug-collision retry bounds, empty-slug fallback, role validation rejecting "owner" via invite, email-lowercase, all 4 acceptInvite error codes, and writers imported from the canonical query module (single source of truth on `isMultiSeatEnabled`).

**Phase F-2 user-facing surfaces shipped 2026-05-05** (this session):
- ✅ `/app/org/new` — create-org page with form (org name + billing-mode radio: central / per_seat / credit_pool). Server Action `createOrgAction` wraps `recordOrgCreate`. `ownerUserId` from session (anti-impersonation). Honest beta banner when `MULTI_SEAT` is off.
- ✅ `/invite/[token]` — accept-invite landing. Three states: not signed in → redirect to /login with callbackUrl preserved (round-trips back); signed in + valid invite → calls `acceptInvite` → redirect to dashboard with success copy; signed in + invalid/expired/already-accepted/already-member → graceful per-error-code copy.

**Phase F-3 org-landing + invite-form shipped 2026-05-05** (this session):
- ✅ `/app/org/[slug]` — auth-gated server component. Resolves slug → org via `loadOrgBySlug()`, checks membership via `getMemberRole()` (returns `notFound()` not 403 for non-members so we don't leak org existence to outsiders). Renders org header with role chip, member directory (highlighting "you"), pending invites section (owners + admins only), and inline invite form (owners + admins only). The create-org flow now redirects here on success.
- ✅ `InviteMemberForm` (client) — email + role-select + invite button. On success surfaces the generated invite URL with a Copy button (clipboard.writeText). On 7-day-replace path shows "re-sent (prior link revoked)" copy.
- ✅ `inviteMemberAction` (Server Action) — permission re-check at write time via `canManageMembers()` (defense-in-depth — render-time hide isn't enough). `invitedByUserId` from session, never input. Cheap email-shape validation. Maps writer errors to user copy.
- ✅ Three new query helpers in `lib/orgs/queries.ts`:
  - `loadOrgBySlug(slug)` — slug → org row
  - `getMemberRole(orgId, userId)` — membership check (returns null on miss)
  - `canManageMembers(orgId, userId)` — owner OR admin predicate

23-assertion guard expansion (Section H) covering: 3 new query exports + role-check shape (owner OR admin), page export shape, auth gate with callbackUrl preservation, `notFound()` not `forbidden()` for non-members (anti-existence-leak invariant), `canManage`-gated invite UI surface, pending-invites loaded ONLY when canManage (anti-leak), client-component shape, action `"use server"` directive + permission re-check + anti-impersonation (`invitedByUserId` from session not input) + email-shape validation.

**Phase F-4 role-management writers shipped 2026-05-05** (this session):
- ✅ `changeRole(orgId, byUserId, targetUserId, newRole)` — flag-gated, transactional. Validates `newRole ∈ {admin, member}` (cannot promote to owner via this path; must use `transferOwnership`). Rejects self-targeting. Pulls actor + target rows in one query, then enforces TWO permission predicates: **strict outrank** (`actorRank <= targetRank` → reject; admins cannot demote owners or peer admins) AND **authority-to-grant** (`actorRank < newRoleRank` → reject; members can't grant admin even if the type-system doesn't catch it through some future refactor).
- ✅ `removeMember(orgId, byUserId, targetUserId)` — flag-gated, transactional. Owner-protection invariant: `target.role === "owner"` → reject with "transfer ownership first" copy (prevents accidentally orphaning an org). Self-leave allowed for non-owners (members and admins can resign). Cross-user removal requires strict-outrank (`actorRank <= targetRank` → reject). DELETE returns affected-rows count for honest "not found" vs "did remove" branching.
- ✅ `transferOwnership(orgId, fromUserId, toUserId)` — flag-gated, 3-write atomic transaction. Verifies `organizations.owner_user_id` column matches `fromUserId` (column-not-role check — cheaper + the source of truth, since `organization_members.role='owner'` is meant to be redundant and could drift on writer bugs). Rejects self-transfer. Requires `toUserId` already a member (no auto-invite — the new owner must already be a recognized account on the org). Three writes: `organizations.owner_user_id` swap + former-owner row demoted to `admin` (NOT removed — they keep org access by default; an explicit `removeMember` is a separate step) + new-owner row promoted to `owner`. Whole thing inside `db.transaction` so a partial-state failure rolls back.
- ✅ `ROLE_RANK = { owner: 3, admin: 2, member: 1 }` constant + `rankOf(role)` helper used by all three writers — single source of truth for the role hierarchy. Pinned by CI (Section I, assertion I4) so a future PR can't quietly bump member to 2 and break the strict-outrank check semantics.
- 15-assertion guard expansion (Section I): writer exports + ROLE_RANK ordering + newRole allowlist (`'admin'|'member'` only) + self-targeting rejection + strict-outrank + authority-to-grant + owner protection on remove + self-leave allowed + transferOwnership atomicity + `owner_user_id` column verification + existing-member precondition + self-transfer rejection + former-owner-demoted-to-admin invariant.

**Phase F-4 still pending:**
- Role-change dropdown + transfer-ownership flow + settings page UI (writers shipped this turn; UI deferred to next push)
- Permission enforcement on tool routes (org-admin can see members' usage; org-member can only see their own)
- Email invite delivery (depends on SendGrid/Postmark — see §11 follow-on)
- Billing wire-up: `billing_mode` column has three placeholder values ("central" | "per_seat" | "credit_pool"); Phase F enforces semantics + plumbs the credit_ledger to bill against the org's payment method instead of the individual member's
- SSO via Google Workspace domain-match for auto-org-assignment (e.g. all `@acme.com` signups join the Acme org by default)

**Estimate Phase F → fully live:** ~2-3 weeks (matches the original audit estimate; no shortcut found, but the foundation removes ~1 week of schema + admin-tooling work that's now done).

### 3c. No enterprise contact path — ✅ ALREADY SHIPPED (re-discovered 2026-05-05)

**Original state (audit time):** assumed pricing page topped out at $9/mo Plus with no enterprise CTA.

**Verification (2026-05-05 grep pass against the live tree):**
- `app/enterprise/page.tsx` — sales-qualified-lead landing with `MarketingHero` + inline value sections + `ContactForm`
- Form posts to `/api/contact` (the existing route that persists to `contact_submissions` table — see "Founder still needs to wire transactional email" caveat carried into PENDING §11 follow-on, but capture works today)
- Page metadata: title "Enterprise & teams", canonical `/enterprise`, description references shared credit pool / admin console / audit log / SSO via Google Workspace
- Built during the T1-5 + T1-6 + Enterprise monetization batch (commit context shows the page was the "Plan T1-6" deliverable identified during this very audit doc's first round)

**Architecture note:** the page intentionally does NOT use a CRM yet (HubSpot etc.) — submissions land in the `contact_submissions` admin viewer (PENDING §11 / commit `52307a3`). The bottleneck on enterprise leads is qualification time, not capture surface, so logging-to-DB is enough for current volume.

### 3d. Rest-of-world payment processor

**State:** Razorpay India-only. Paddle KYC pending. We can't take EU/US payments today.

**Estimate:** zero Claude-work — vendor blocked. Once Paddle KYC clears, the adapter at `lib/payments/adapters/paddle.ts` is scaffolded.

### 3e. No referral program — ✅ END-TO-END SHIPPED (2026-05-05) — awaiting REFERRALS_ENABLED=1

**Original state (audit time):** zero growth-loop infrastructure. Existing users had no incentive to refer.

**Foundation shipped** in commit `6a49736` (this session) — full storage + helper + admin viewer surface:
- Migration 0024 (`referral_codes` + `referral_signups`) applied pre-push to prod via SSH HEREDOC pipe.
- Drizzle schema entries in `db/schema/app.ts` with full per-column docstrings.
- `lib/referrals/codes.ts` — 3 exports: `generateReferralCode` (pure RNG), `getOrCreateReferralCode` (idempotent fetch-or-create with collision retry), `lookupReferralCode` (case-insensitive). Alphabet excludes visually ambiguous 0/O/1/I/L; namespace ≈ 27.5B codes (31 chars × 7 positions).
- `lib/referrals/queries.ts` — 4 read-side helpers (`listRecentReferralSignups`, `loadReferrerStats`, `loadAdminReferralStats`, `isReferralsEnabled` env-flag check). No writers — they come in Phase E.
- `/admin/referrals/page.tsx` — read-only viewer with 4 summary cards, top 10 referrers leaderboard, 200-row attribution log, status banner showing whether `REFERRALS_ENABLED` is on or off.
- 73-assertion CI guard (`scripts/test-referrals-foundation.mjs`) covering migration DDL, schema parity, helper public surface, alphabet contents, admin page export hygiene + read-only invariant, and 200-sample dynamic execution of the code generator.

**Same staging discipline** as feature-flags / quality-signal / dunning / contact-submissions / ai-feedback: tables + read paths land NOW even though no signup-flow wire-up runs yet. Empty tables today by design — the read path is verified end-to-end against real prod schema, so when Phase E flips `REFERRALS_ENABLED=1` and adds the signup-flow attribution writer, the entire admin surface renders correctly with no further migration.

**Phase E follow-ons shipped 2026-05-05** (this session, all verified live):
- ✅ `/app/refer` user-facing page (commit `733cfc1`) — auth-gated, lazy-creates code, shows code + share URL + stats + honest beta banner
- ✅ `lib/referrals/writers.ts` (commit `8f4c899`) — three idempotent flag-gated writers: `recordReferralSignup` (race-safe with self-referral guard), `grantReferrerReward` / `grantReferredReward` (IS NULL re-check inside UPDATE for race-safe idempotency)
- ✅ Signup-flow wire-up (commit `97f12a8` after fix from `a9e006f`) — middleware-based cookie set on `/register?ref=CODE`, `events.signIn` handler in `auth.ts` reads cookie + looks up code + calls `recordReferralSignup` + clears cookie, all flag-gated. Confirmed live: `Set-Cookie: pdfcraft_ref=...; Max-Age=2592000; Secure; HttpOnly; SameSite=lax` on valid ref param; no cookie on invalid.

**Reward-trigger wire-up shipped 2026-05-05** (this session) — closes the last piece of Phase E:
- ✅ `lib/referrals/rewards.ts` — `triggerReferredReward(referredUserId)` and `triggerReferrerReward(referredUserId)` orchestrate `grantCredits` + the matching `grantXxxReward` writer. Both flag-gated, both idempotent on signup row's rewarded-at timestamps + grantCredits' idempotencyKey. Dedupe path (when grantCredits returns `{applied:false}` because the credit was already granted on a prior trigger) looks up the original ledger row by idempotencyKey to populate creditLedgerId on the signup. Hard-coded reward amounts: `REFERRED_REWARD_CREDITS = 25`, `REFERRER_REWARD_CREDITS = 25` (match `/app/refer` page copy).
- ✅ Email-verification wire-up in `app/verify-email/page.tsx` — fires `triggerReferredReward` after `grantSignupBonus` succeeds. try/catch guard so a referral-grant failure doesn't break the verify UX. Structured-log key `verify_email_referral_grant_failed`.
- ✅ First-purchase wire-up in `lib/payments/ledger.ts:handleCaptured` — fires `triggerReferrerReward(payment.userId)` at the end of the credit-pack capture path. Dynamic `await import()` keeps the module-load cycle clean. try/catch guard so a referral-grant failure mid-webhook doesn't throw (which would cause the provider to retry the capture and double-grant the buyer's credits). Structured-log key `payment_captured_referral_grant_failed`. "First purchase" detection isn't needed — the trigger is idempotent on `referrer_rewarded_at`, so calling on every capture only grants on the first.
- 28 new CI guard assertions in Sections M+N covering: rewards module public surface, flag-gates, idempotency-key shape, reason strings, writers/grantCredits imports, dedupe-path ledger lookup, verify-email + ledger.ts wire-ups, structured-log keys, try/catch coverage at both wire points.

**Cascade learning (this session):** `cookies().set()` from a server-component render path throws "Cookies can only be modified in a Server Action or Route Handler" (Next.js 14). Caught only at request-time in prod (`next build` doesn't execute). Fix: move cookie-write to middleware via `auth(fn)` wrapper that re-implements the gate logic. This is now pinned by CI guard Section L.

**Final activation (founder-side, no code change):**
- Set `REFERRALS_ENABLED=1` on Hostinger panel → "Save and redeploy" → the entire referral loop runs end-to-end. Existing `/app/refer` users see their copy switch from "beta" to "you both get 25 credits" on next visit.

**Optional Phase E follow-on:**
- Transactional email "you got 25 credits because Alice signed up using your link" depends on the SendGrid/Postmark wiring tracked separately under §11 contact-submissions.

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

### 4c. Orphaned `TODO(Phase E)` markers — ✅ FOUNDATION SHIPPED (2026-05-04)

**Original state (audit time):** 2 TODOs in code. Both meaningful gaps. Dunning means subscribers whose payment failed don't get retried (we lose them). Contact form means submissions go to stdout/log only, not to ops.

- ✅ `lib/payments/dunning.ts:236` — "persist DunningRow to a `subscription_dunning` table" — **FOUNDATION SHIPPED** in commit `76a0c82` (2026-05-04). Migration 0023, schema entry, three persist helpers (`loadDunningRow`, `persistDunningEvent`, `listDunningRows`), `/admin/dunning` read-only viewer, 59-assertion CI guard. Same staging discipline as ai-feedback (`d74fefe`) and contact-submissions (`52307a3`): the table + persist surface land now even though no Phase E webhook handler calls them yet, so when recurring plans ship the wire-up is a 1-file diff. Empty table by design today (no recurring SKUs); first row will land when Phase E wires `persistDunningEvent` into `webhook-handler.ts` on Razorpay `subscription.charged|pending|halted|cancelled` and Paddle `subscription.payment_succeeded|payment_failed|canceled` events.
- ✅ `app/api/contact/route.ts:116` — "wire SendGrid / Postmark here" — **FOUNDATION SHIPPED** in commit `52307a3` (2026-05-04). Submissions persist to `contact_submissions` (migration 0021) + `/admin/contact-submissions` read-only viewer. Founder still needs to wire transactional email provider for the email part.

**Remaining (Phase E proper):** the actual dunning automation logic (~1 week — failed payment → 3-day grace → 7-day notice → 14-day cancel, with retry orchestration + entitlement gating + email sequence) needs the recurring billing surface to exist first. The pure reducer + persist surface this commit ships are the foundation; the lifecycle automation is a Phase E feature, not a foundation gap.

### 4d. No feature flag system beyond env vars — ✅ FOUNDATION SHIPPED (2026-05-05)

**Original state:** every feature toggle was a one-off Hostinger panel env var (e.g., `BONUS_PER_OP_CAP_ENABLED`, `SIGNUP_GRANT_ENABLED`, `MULTIPLIER_PRICING_ENABLED`, `QUALITY_SIGNAL_AUTO_ROUTE_ENABLED`). Toggling required panel access + redeploy + zero gradual rollout. Each call site invented its own env-var name + parsing logic.

**Foundation shipped** in this session — `lib/flags.ts` consolidates the pattern. `isFeatureEnabled(flag, options)` resolves in priority order: per-flag override (`FEATURE_<FLAG>_OVERRIDE=on|off`) → user override list (`FEATURE_<FLAG>_USERS=u1,u2,u3`) → deterministic-percent rollout (`FEATURE_<FLAG>_PERCENT=25`, hash-bucketed by `(userId, flagName)` so different flags assign different buckets to the same user) → default off. Plus admin viewer at `/admin/feature-flags` showing each flag's current state. Flag registry at `lib/flags.ts:FEATURE_FLAGS` (typed constants prevent string-literal typo class).

**CI guard** (53 assertions across 6 sections, including 26 dynamic-execution checks): exercises all 5 pure helpers against canonical inputs, including the hash-bucket spread invariant (1000 sample users must hit ≥50 distinct buckets out of 100, confirming SHA-1 isn't degenerate).

**Remaining (full GrowthBook upgrade):** when active flag count exceeds ~10, the SaaS path becomes worth the integration cost (UI for non-engineers, real-time updates without redeploy, built-in A/B test stats). Until then, env-var-backed flags are simpler. The `isFeatureEnabled()` API surface is designed to be a drop-in pass-through to a future GrowthBook SDK call — call sites won't change.

**Estimate to GrowthBook:** 2-3 days when triggered (active flag count or operator-clarity demand).

---

## 5. Product gaps (6 customer-facing items)

### 5a. Real PDF Compress (T2-1) — ✅ FOUNDATION SHIPPED (2026-05-05)

**State pre-foundation:** intentional gap (pdf-lib can't compress). Two SEO landings + use case + 2 blog posts had bait-and-switch references; cleaned up earlier. Now honest but the demand is real.

**Discovery (de-risk):** SSH'd into the Hostinger box and verified `/usr/bin/gs` (Ghostscript 9.54.0) is available. `qpdf` is NOT, but Ghostscript alone covers all three quality levels (`-dPDFSETTINGS=/printer|/ebook|/screen`).

**Foundation shipped** in commit `27b1a1e` (this session) — server-side helper + flag-gated route + CI guard:
- `lib/tools/ghostscript/compress.ts` — `compressPdf()` async wrapper. Three levels (`light`→/printer, `balanced`→/ebook, `strong`→/screen). 50MB input cap, 60s timeout with SIGKILL (NOT SIGTERM — gs ignores SIGTERM mid-compression and creates zombies, learned from CLAUDE.md §5 zombie cleanup runbook). Always cleans up temp dir in `finally{}` regardless of throw/timeout/success. Bypass branch returns ORIGINAL bytes when gs achieves <5% savings (noise floor — anything below is within font-subset variance and not perceptually worth the trade-off). `GhostscriptError` class with categorized codes (TIMEOUT / EXIT_NONZERO / SPAWN_FAILED / INPUT_TOO_LARGE).
- `app/api/tools/compress/route.ts` — POST handler. Auth gate → `isFeatureEnabled(PDF_COMPRESS)` flag gate → multipart parse → size pre-check → mime-type guard → level whitelist → `%PDF` magic-header byte check → `compressPdf()` → JSON response with base64 outputBytes + bypass flag + size deltas + duration + suggested filename.
- `lib/flags.ts` — registers `FEATURE_FLAGS.PDF_COMPRESS = "pdf_compress"` so the per-user / per-percent rollout machinery is wired in.
- 45-assertion CI guard (`scripts/test-pdf-compress-foundation.mjs`) covering wrapper invariants (level→preset map, all 5 required gs flags, mkdtemp + finally{} cleanup, SIGKILL pinning, bypass branch), route invariants (auth gate, flag gate, size cap, magic-header check, level whitelist, error categorization), flag registration, and dynamic eval of the preset map literal.

**Same staging discipline** as feature-flags / referrals / quality-signal: foundation lands now, route is reachable but flag-gated to OFF (returns `feature_disabled` 404). Operator activates via Hostinger panel:
- `FEATURE_PDF_COMPRESS_OVERRIDE=on` (everyone gets it), OR
- `FEATURE_PDF_COMPRESS_USERS=<userId>,<userId>` (allowlist), OR
- `FEATURE_PDF_COMPRESS_PERCENT=10` (10% rollout, deterministic SHA-1 bucket so each user always gets the same answer)

**Verified live (2026-05-05 13:55 UTC):** deployed to commit `27b1a1e`. Anonymous POST returns `{"error":"not_authenticated"}` 401. Authenticated POST (with flag off) would return `{"error":"feature_disabled"}` 404 — expected foundation behavior.

**Remaining (Phase B follow-on, ~2 days):**
- `components/tools/PdfCompressTool.tsx` — client UI: ToolDropzone for input, three radio buttons for quality, progress + size-delta display, "couldn't make it smaller" copy when `bypassed=true`.
- `app/tool/compress-pdf/page.tsx` — tool page using ToolRunner pattern.
- Add registry entry to `lib/tools.ts` and update the "no compress" comment.
- `next.config.mjs` redirect cleanup: change `/compress-pdf` → `/tools` to `/compress-pdf` → `/tool/compress-pdf` once flag is on for everyone.
- (Maybe) credit pricing — defer until usage data justifies it. PENDING audit originally suggested 5 credits/doc.

**Estimate from foundation → full feature:** ~2 days (most of the work — Ghostscript wrapper + auth + abuse prevention — is done).

### 5b. PDF/A converter (not just check) — ✅ FOUNDATION SHIPPED (2026-05-05)

**State pre-foundation:** we had `/tool/pdf-a-check` (validates compliance) but no converter (makes a non-compliant PDF compliant). Real demand from compliance/archival users.

**Foundation shipped** in this session, parallel to §5a:
- `lib/tools/ghostscript/pdfa.ts` — `convertToPdfa()` async wrapper. PDF/A-2b only (intentionally not -1b/-3b/-2u/-2a — see source docstring for rationale per level). 50MB input cap (inherited from `COMPRESS_MAX_INPUT_BYTES`), 90s SIGKILL timeout (slower than compress because gs has to inspect every font, embed missing ones, validate transparency). Same temp-file + `finally{}` cleanup discipline as compress. Re-uses `GhostscriptError` from `compress.ts` to avoid two parallel error hierarchies.
- `app/api/tools/pdf-a/route.ts` — POST handler. Auth → `isFeatureEnabled(PDF_A_CONVERT)` flag gate → multipart parse → size pre-check → mime-type guard → `%PDF` magic-header check → `convertToPdfa()` → JSON response. NO `level` parameter exposed (only -2b ships).
- `lib/flags.ts` — adds `FEATURE_FLAGS.PDF_A_CONVERT = "pdf_a_convert"`.
- 39-assertion CI guard (`scripts/test-pdfa-foundation.mjs`) covering all four required PDF/A flags (`-dPDFA=2`, `-dPDFACompatibilityPolicy=1`, `-sProcessColorModel=DeviceRGB`, `-sOutputIntentProfile=...`), the inheritance pin (`PDFA_MAX_INPUT_BYTES = COMPRESS_MAX_INPUT_BYTES` not a literal), the route's read-only invariant (no user-controlled `level` parameter), and full feature-flag + auth + size-cap + magic-header check coverage.

**Critical Ghostscript invariant:** `-dPDFACompatibilityPolicy=1` is what makes the foundation honest. Without it, gs silently strips un-PDF/A-able content (embedded JS, encrypted streams, certain transparency groups) and produces files that LIE about conformance — file says it's PDF/A, archival validators reject it. The `=1` policy makes gs fail loudly instead, which surfaces as a `pdfa_failed 500` to the user; they at least know to fix the source PDF.

**Same staging discipline** as §5a: foundation lands now, route is reachable but flag-gated to OFF (returns `feature_disabled` 404). Operator activates via `FEATURE_PDF_A_CONVERT_OVERRIDE=on` (or per-user / per-percent flavors).

**Phase B UI completion shipped** in commit `c5042f4` (this session):
- `components/tools/PdfaConvertTool.tsx` — single-shot UI (no quality picker since we expose only -2b). Honest size-delta copy ("font embedding always adds some bytes" / "smaller because we cleaned up redundant data"). 500-error copy specifically calls out the most-common cause (un-PDF/A-able content rejected by `-dPDFACompatibilityPolicy=1`) and routes user to PDF/A Compliance Check.
- `lib/tools.ts` registry entry — slug `pdf-a-convert` (intentionally separate from `pdf-a-check`; different intents = different tools), group "Organize", icon "Shield".
- `lib/tool-intros.ts` + `lib/tool-longforms.ts` (5 use cases / 6 FAQs / 3-step how-it-works / CTA back to PDF/A Check).
- `lib/client/tool-suggestions.ts` — handoff: ["pdf-a-check", "sign-pdf-free", "merge"].
- ToolRunner case + LIVE_TOOL_IDS entry.

**Verified live** at commit `c5042f4` (2026-05-05 16:32 UTC):
- `/tool/pdf-a-convert` returns 200 (page renders, UI loads)
- `POST /api/tools/pdf-a` returns 401 (anonymous) or 404 feature_disabled (authed but flag off)
- Operator activation: `FEATURE_PDF_A_CONVERT_OVERRIDE=on` (or USERS=... or PERCENT=10) flips it live.

**Remaining (deferred, low priority):**
- ICC profile bundling — current code points at `/usr/share/ghostscript/9.54.0/iccprofiles/srgb.icc` (verified to exist on Hostinger). For belt-and-suspenders, ship a copy in the repo at `public/icc/srgb.icc` and pass via `iccProfilePath` option so a Ghostscript upgrade that moves the profile location doesn't break the route. Easy fix when needed.

### 5c. Edit Text in PDFs

**State:** intentional gap (pdf-lib doesn't support text editing in existing pages). Add Text Box (overlay) is the closest current tool.

**Implementation:** Either deeper PDFium integration (read text frames, modify in place) or Apache PDFBox (Java sidecar service).

**Estimate:** 2-3 weeks. Significant complexity; deferred for good reason.

### 5d. True OCR-then-searchable workflow — ✅ ALREADY SHIPPED (re-discovered 2026-05-05)

**Original state (audit time):** thought to be two separate flows (ai-ocr returns markdown, ai-searchable-pdf returns a PDF with text layer).

**Verification (2026-05-05 grep pass against the live tree):**
- `components/tools/SearchablePdfTool.tsx` (591 lines, last edit 2026-05-05) — single-click unified flow:
  1. POST the PDF to `/api/ai/ocr` (reuses existing credits / idempotency / kill-switch / refund-on-error)
  2. Split returned markdown into per-page text segments
  3. Load original PDF with pdf-lib client-side
  4. For each page: `drawText(textForThatPage, { opacity: 0 })` — invisible text layer in the content stream so Ctrl-F + copy/paste work, while the visual page stays identical to the scan
  5. Save → download with `-searchable` suffix
- Tool is registered as `/tool/ai-searchable-pdf` (verified via `SIGN_IN_HREF` constant in source)
- Credit cost: 2 credits/page (matches OcrPdfTool); page cap: 50

**Architecture note:** the original "Implementation" suggestion was to build a server-side `ai-ocr-searchable` route. The shipped version is even simpler — one client tool composes the existing `/api/ai/ocr` route + pdf-lib in the browser. No new route, no new credit ledger entries, no new kill-switch wire-up. The OCR pipeline is reused as-is.

**Limitation called out in the source comments:** word positions aren't exact — copy-paste yields a single text block per page, not word-by-word coordinates. Acrobat-grade word positioning would need bbox-aware OCR (Tesseract HOCR or similar) which is a future enhancement, not a blocker for the core "Ctrl-F finds matches" UX.

### 5e. Bulk processing (T3-1) — ✅ ALREADY SHIPPED (re-discovered 2026-05-05)

**Original state (audit time):** assumed every operation was single-file.

**Verification (2026-05-05 grep pass against the live tree):**
- `components/tools/PdfBatchProcessTool.tsx` (482 lines, dated 2026-05-01) — multi-PDF input + one operation across all files
- 8 supported batch operations via `BatchOpId`: `rotate-90` / `rotate-180` / `rotate-270` / `page-numbers` / `watermark` / `remove-metadata` / `flatten-forms` / `strip-links`
- `MAX_BATCH_SIZE = 50` (matches the "50 invoices" use case from the original spec)
- All 7 standardized hooks wired (handoff consumer, file-URL consumer, scroll-error, tool tracking, etc.)
- Output: per-file results + JSZip-bundled ZIP download
- Operation library at `lib/pdf/ops/batch.ts` (referenced via `BatchOpId` + `BatchOutputItem` type imports)

**Architecture note:** runs entirely client-side via pdf-lib (no server-side queue or background jobs needed). Progress UI updates synchronously per-file, error handling is per-file (one bad PDF doesn't fail the batch). This works because the included ops are all metadata/page-level transforms with bounded per-file cost.

**Genuinely-still-missing (deferred):** AI-op batching (e.g. "summarize 50 invoices") — that one DOES need a server-side queue because each op is 5-30s of LLM round-trips and a browser tab can't reliably hold 50× that. Tracked separately as part of OpenAI Batch API rollout (Phase A Task #13, already shipped for `summarize` + `translate` at the route level — UX wire-up to a "drop 50 PDFs" surface remains).

### 5f. Mobile UI hardening (T1-4) — ⚠️ AUDIT-PASS FOUNDATION SHIPPED (2026-05-05)

**State pre-foundation:** unaudited. Visual editors (PageEditorTool consumers) likely had poor touch behavior. ~40% of typical PDF tool traffic is mobile.

**Foundation shipped** in this session — two-layer coverage:
- **Static-parse guard** (`scripts/test-mobile-hostile-styles.mjs`) — scans every tool component in `components/tools/` for hardcoded `width:` / `minWidth:` values exceeding 380px (iPhone 14 viewport breathing room) WITHOUT a companion `maxWidth:`, plus `gridTemplateColumns: repeat(N+, …)` where N ≥ 4 without `minmax()` floor. Catches the bug class (horizontal scroll on mobile) at commit time. Result: 0 violations across 30+ tool components — tool runners are mobile-clean at the inline-style level.
- **Playwright mobile spec** (`tests/e2e/mobile-tools.spec.ts`) — iPhone 14 device emulation (390×844). 10 representative URLs (homepage + top 4 free tools + 3 AI tools + 2 visual editors). Three runtime asserts per URL: (1) `body.scrollWidth ≤ window.innerWidth + 1` — the no-horizontal-scroll invariant which is the #1 mobile UX anti-signal, (2) at least one button or link visible above the 844px fold (key CTA reachable without scroll), (3) no console errors from page code (third-party noise from Clarity / GA4 filtered out).

**What this foundation catches now:**
- A future PR that adds `style={{ width: 1200 }}` to a tool component fails the static guard at commit time
- A new tool that ships without responsive layout fails the Playwright spec on the URLs it covers
- An existing tool that regresses (e.g. a sidebar pushed outside the 390px viewport) fails the spec

**What this foundation does NOT cover** (Phase G):
- Touch gesture issues (drag-to-reorder, pinch-zoom on PDF preview). Playwright mobile emulation simulates click/tap but not multi-touch cleanly.
- Per-visual-editor touch-behavior audit (the 13 PageEditorTool consumers). Each needs a hand-test on real device to verify drag handles are reachable + stylus-friendly.
- Tablet (iPad) baselining. iPhone 14 covers the tightest constraint; passing it = tablet works.
- Bottom-sheet config-panel UX redesign on small screens (the original audit recommended this). That's a UI redesign decision, not a defect fix; defer until usage analytics indicate which tools actually need it.

**CI guard summary (Section A + B):** 9 assertions:
- A1: ≥30 tool components scanned (sanity check)
- A2: 0 inline-style width/minWidth/grid violations across the corpus (umbrella pass)
- B1-B6: Playwright spec exists, uses iPhone 14, asserts no-overflow + above-fold CTA, filters known third-party console noise, covers ≥5 URLs

**Estimate to full Phase G coverage:** ~3-5 days for the per-visual-editor manual touch-behavior audit + bottom-sheet redesign on tools where small-screen layout is actually constrained. The static + spec foundation makes regressions catchable at commit time, so the per-tool work doesn't have to happen all at once.

---

## 6. AI quality + observability (4 measurement gaps)

### 6a. No human eval loop — ✅ FOUNDATION SHIPPED (2026-05-05)

**State pre-foundation:** Phase A Task #14 (commit `f02c5b3`) shipped the AUTOMATED eval layer (golden-set fixtures + deterministic rubric checks + `ai_eval_runs` table + `scripts/run-ai-evals.mjs` CLI). What was missing was the SUBJECTIVE human-grading layer for weekly review.

**Foundation shipped** in this session:
- Migration 0026 (`eval_human_grades` table) applied pre-push to prod via SSH HEREDOC. One row per (golden-set fixture × provider × model × op × grader-user) combo with 4 score tinyints (relevance / completeness / faithfulness / actionability, each 1..5 Likert), free-text notes, 4KB output excerpt, app-layer ref to `ai_eval_runs.id` (nullable). UNIQUE on the 5-col combo, plus 3 indexes for the common admin queries.
- Drizzle schema entry — `evalHumanGrades` exported with `tinyint("…", { unsigned: true }).notNull()` for the 4 score columns.
- `lib/ai/eval/human-grades.ts` — read-side helpers: `listRecentHumanGrades(limit)`, `loadPerOpAverages({lookbackDays})` (sorted worst-first so red-flag combos surface immediately), `loadGraderActivity({lookbackDays})` (drives "is the team actually grading?" health card), `loadGradesForCombo(...)` (for the future Phase G grader UI), and `HUMAN_GRADE_FLOOR = 3.5` constant.
- `/admin/evals` admin viewer with 3 summary cards (total grades 30d / combos flagged red / active graders 7d), per-(provider × model × op) averages table sorted worst-first with red/neutral/green color coding pinned to `HUMAN_GRADE_FLOOR`, grader activity table with stale-cadence warning when 0 grades in 7 days, and recent grades audit table (200 latest).
- 66-assertion CI guard covering migration DDL (4 score tinyints, 5-col unique, 3 indexes, no DROP/MODIFY), Drizzle schema parity (per-field tinyint/notNull pin, unique on the 5-col combo), queries module public surface (read-only invariant, mean-of-4 overall calc, sort-ASC on overallAvg, default lookbacks), and admin viewer Page shape + read-only constraint + HUMAN_GRADE_FLOOR threshold pin.

**Same staging discipline** as the other 8 foundations: storage + read paths land NOW; writers + grader UI come later (Phase G). Empty-by-design today (no rows until Phase G adds the interactive grader UI). The "0 grades / 0 active graders" empty state itself is useful — confirms the read path works end-to-end against real prod schema.

**Phase G writer + API shipped 2026-05-05** (this session):
- ✅ `lib/ai/eval/human-grade-writer.ts` — `recordHumanGrade` (INSERT, throws DUPLICATE on the 5-col unique) + `replaceGrade` (transactional DELETE+INSERT for explicit overwrite). 1..5 Likert validation rejects out-of-range or non-integer scores (no silent clamp). HumanGradeWriteError class with codes INVALID_SCORE / EMPTY_REQUIRED / DUPLICATE / ROW_NOT_FOUND / DB_ERROR.
- ✅ `app/api/admin/evals/grade/route.ts` — POST handler. Auth-gated by admin email allowlist (mirrors /api/admin/reconcile pattern). graderUserId taken from session.user.id, **never from body** (load-bearing anti-impersonation guard pinned in CI Section F). Error codes mapped to HTTP status: INVALID_SCORE → 400, DUPLICATE → 409 Conflict (so client can retry with replace=true), DB_ERROR → 500. Replace-flag opt-in via `body.replace === true`.

**Phase G grader UI (basic) shipped 2026-05-05** (this session):
- ✅ `/admin/evals/grade` — basic form: text inputs for fixture metadata (golden-set id / operation / provider / model / optional eval-run-id) + 4 Likert dimensions as 1-5 button rows + notes + AI output excerpt textarea (4KB cap). POSTs to the now-shipped `/api/admin/evals/grade`. On 409 Conflict (grade already exists), surfaces a "Replace prior grade" button that re-POSTs with `replace=true`.

**Remaining (Phase G enhancements):**
- Side-by-side rich UI: golden-set dropdown + auto-fetch of fixture content + "regenerate output now" button that calls `route(op,…)` and shows the live AI output for grading. ~1-2 days
- `/admin/evals/<id>` per-grade drilldown (full output excerpt + grader notes) ~half day
- Per-op trend chart over time on `/admin/evals` ~half day
- Slack alerter when a (provider × model × op) overall average crosses below `HUMAN_GRADE_FLOOR` (depends on §2a Slack webhook)

**Estimate Phase G → fully usable for weekly review:** ~3-4 days of focused work. The grading loop (humans actually entering grades) requires golden-set curation in parallel — Phase A Task #14 shipped 6 ops × 1-2 fixtures each as v1 coverage; getting to 3+ fixtures per op for statistical signal is ~1 week of curation work that can happen alongside Phase G code.

### 6b. No thumbs-up/down affordance — ✅ ALREADY SHIPPED (re-discovered 2026-05-05)

**Original state (audit time):** users had no way to flag bad AI output.

**Verification (2026-05-05 grep pass against the live tree):**
- Migration `db/migrations/0022_ai_feedback.sql` applied — `ai_feedback` table persists thumbs ↑/↓ + per-row provenance (userId, aiUsageId, fileId, providerId, model, operation)
- Drizzle schema entry in `db/schema/app.ts`
- `components/feedback/FeedbackChip.tsx` — reusable chip component with optimistic UI + dedupe + rate-limit-friendly POST handler
- Wired into 18 AI tools (verified via `grep -rln FeedbackChip components/tools/ | wc -l`):
  - Stage 2 pilot: SummarizeTool
  - Batch C: TranslateTool, RewriteTool, OcrPdfTool
  - Batch D: TableExtractTool, ComparePdfsTool, GeneratePdfTool
  - Batch E: SignAiTool, RedactPdfTool
  - Plus: SearchablePdfTool, GenerateTool, Chat (per-message), and others
- Admin viewer at `/admin/ai-feedback/page.tsx`
- Eval signal: chip data already feeds `/admin/quality-signals` (§6c above) for per-user trailing-down detection

**Genuinely-still-missing:** the original spec also called for per-(provider, model, op) quality scores surfaced in `/admin/tools/[id]`. That admin slice is still TBD — the data is there (`ai_feedback` joined on `ai_usage`), it just isn't aggregated into the existing per-tool admin page yet. Tracked as a small follow-on (~1 day) once chip volume justifies the rollup.

### 6c. No per-user quality signal — ✅ FOUNDATION SHIPPED (2026-05-04)

**Original state (audit time):** when one user got bad outputs (provider hiccup, prompt injection, or genuine model failure), there was no way to detect this server-side except via support email.

**Foundation shipped** in commit `81087df` — `lib/ai/quality-signal.ts` with three pure helpers (`computeConsecutiveNegative`, `classifyQualitySignal`, `QUALITY_SIGNAL_POLICY` policy constants) + two read-side queries (`loadUserQualitySignal` for one user, `listFlaggedUsers` for the admin list view) + read-only `/admin/quality-signals` page surfacing every user with a trailing thumbs-down streak. No migration needed — derives from the existing `ai_feedback` table on every read, so there's no cache-vs-truth de-sync risk.

**Auto-routing wire-up shipped** in this commit (follow-up to `81087df`) — `applyQualityBiasIfEnabled` helper added to the same module, wired into `lib/ai/router.ts:route()` after `resolveLadder`. Behind default-off env flag `QUALITY_SIGNAL_AUTO_ROUTE_ENABLED`. When the flag is set AND the user is in the `flagged` bucket AND `recentProviders` is non-empty, the offending providers move to the END of the ladder — graceful degradation. Today every short-circuit path returns the canonical ladder unchanged: env-flag-off (the FIRST check, so no DB query fires), userId not provided, signal lookup throws, bucket !== "flagged", recentProviders empty.

**Thresholds (conservative, tunable):**
- `watchThreshold = 2` consecutive thumbs-down → bucket = `watch`
- `flaggedThreshold = 4` consecutive thumbs-down → bucket = `flagged`
- `recentWindow = 20` most-recent feedback rows considered

**Same staging discipline** as dunning + ai-feedback: foundation lands now, automation later. The `/admin/quality-signals` page is operator-only today — a human reads the list and decides whether to email the user, refund credits, or investigate. Auto-routing on flagged users is gated by `TODO(automation)` in the lib module; right thresholds + biasing behavior need 1-2 weeks of accumulated chip data before they can be confidently set.

**Remaining (Phase E proper):** auto-routing wiring into `lib/ai/router.ts` (~3 days once thresholds are confirmed), background alerter that pings Slack on new flagged users (~1 day after Slack alerting verification — PENDING §2a — completes), per-user notification email (~1 week including UX copy review).

**Estimate to go from foundation → full feature:** ~1-2 weeks once chip data accumulates enough to confirm threshold values.

### 6d. No A/B testing infrastructure — ⚠️ FOUNDATION UNBLOCKED (2026-05-05)

**Original state (audit time):** every change shipped to all users immediately. No way to A/B test OutOfCreditsAlert copy variants, pricing display, abuse layers, etc.

**What changed 2026-05-05:** `lib/flags.ts` foundation shipped (§4d) provides the deterministic-bucket primitive A/B tests need. `isFeatureEnabled(flag, { userId })` already gives sticky-per-user assignment via SHA-1 hash of `${flagName}:${userId}` — exactly the property A/B tests require so the same user always sees the same variant. `FEATURE_<FLAG>_PERCENT=50` cleanly splits a 50/50 test.

**Architecture path (no SaaS dependency required for v1):**
1. **Variant assignment**: already done — `isFeatureEnabled("test_xyz", { userId })` returns `true` for the 50% bucket, `false` for the other 50%.
2. **Outcome tracking**: instrument the conversion event (signup completed, credit purchase, AI op succeeded) with `flag_assignments` JSON column on `ai_usage` / `payments` / a new `signup_events` table. Persist `{ flag: "test_xyz", variant: true }` alongside the event.
3. **Stats**: nightly cron computes lift + p-value per flag from the joined `(assignments × outcomes)` view. No real-time dashboard needed for v1 — read off `/admin/ab-tests` page.

**Why GrowthBook isn't urgent yet:** at current volume (single-digit daily AI calls per op, dozens of monthly signups), even a 30%+ lift would take weeks to reach significance. The foundation we have now supports running 1-2 simultaneous tests; we'll need GrowthBook (or Unleash) when we want 10+ simultaneous tests with multivariate analysis. That trigger is months away.

**Estimate to v1 A/B test infrastructure (without GrowthBook):** ~3 days (outcome-tracking JSON column + nightly rollup + read-only admin view). Foundation already done.

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

### 11a. ~~Webhook audit-row insert before processing~~ ✅ FIXED 2026-05-04

**Original state:** `lib/payments/webhook-handler.ts` called
`recordWebhookEvent` BEFORE `applyPaymentEvent`. A first-delivery
processing failure persisted the audit row, then the retry's audit-
dedupe short-circuited to 200 duplicate without re-running
processing. Reconcile sweep covered within ~24h.

**Fix shipped (this commit):** invert the order — `applyPaymentEvent`
FIRST, then `recordWebhookEvent` AFTER success. Safe because the
ledger layer is idempotent on `${paymentId}:base|bonus|refund:${ref}|
:promo_bonus|:chargeback:${ref}` keys (per
`lib/payments/ledger.ts:204` contract); a retry that re-runs
processing no-ops at the ledger via UNIQUE on idempotency_key.
Failure path now skips the audit insert entirely → next retry
actually re-runs processing.

**Trade-off accepted:** lose handler-level dedup for retried-after-
success webhooks (each retry now redoes processing instead of
short-circuiting at the audit layer). Cost is bounded — applyPay-
mentEvent's hot path on a duplicate is a unique-key conflict +
early-return, ~ms. For our scale, correctness wins.

**Test surface:** `webhook-reconcile-resilience` Section F was
inverted to assert the post-fix ordering. F1 now verifies
applyPaymentEvent precedes recordWebhookEvent. F2 verifies the
catch path (processing_failed → 500) sits between them, so the
audit insert is unreachable from the failure path. F3 verifies
the success response distinguishes "ok" (fresh) from "duplicate"
(provider re-delivery).
