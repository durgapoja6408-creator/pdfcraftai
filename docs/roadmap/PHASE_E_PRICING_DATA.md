# Phase E: Pricing data + prompt infra

_Scope: the optimization-loop layer. Prompt version registry + A/B testing so we can ship prompt changes safely. Annual-prepay tier + INR price discrimination for revenue expansion. Promo code infrastructure. Cohort analytics._

_This phase is where we start running deliberate experiments rather than one-off changes._

## Task #26 — Prompt version registry + A/B testing infra

### The problem today

Prompts live inline in `lib/ai/prompts/*.ts`. Every change is a code deploy. No A/B testing. No visibility into which prompt generation produced which output.

### What we build

**`prompt_versions` table:**
```
(id, op, version, prompt_text, is_active, is_draft, created_at, created_by, notes)
```

**`prompt_ab_tests` table:**
```
(id, op, control_version, variant_version, split_percent, started_at, ended_at, winner_version)
```

**Runtime:**
- Router consults `prompt_versions` for the active version per op.
- If an A/B test is active, user is assigned deterministically (hash(user_id + op) mod 100 < split_percent → variant).
- Every `ai_usage` row records `prompt_version_id` used.

**Admin UI `/admin/prompts`:**
- List ops. For each op: current active version + history.
- "New version" → form to edit prompt + save as draft.
- "Promote to active" → deactivates prior, activates new.
- "Start A/B test" → pick two versions, set split + duration.
- Live A/B results: quality score (from evals), cost/call, user satisfaction (if tracked).

### Integration with eval harness (Task #14)

- Every new prompt version auto-runs against the golden set before "Promote to active" is allowed.
- If any op's quality score drops below floor, promotion blocked (override with explicit checkbox + audit log entry).

### Files
- `db/schema.ts` — two new tables.
- `lib/ai/prompts/registry.ts` — fetch active version for op (+ A/B assignment).
- `lib/ai/prompts/*.ts` — refactor to fetch from registry at runtime (env-var fallback for local dev).
- `app/admin/prompts/page.tsx` — UI.
- `scripts/eval-prompt-version.mjs` — run goldens against a specific version.

### Acceptance

- Create new prompt version in admin → runs evals → shows pass/fail → promote button enabled only if pass.
- Start A/B test → user traffic splits deterministically → `ai_usage` rows tagged with version → results visible.
- Winner promote closes test and activates winner universally.

**Status:** planned.

---

## Task #27 — Annual-prepay tier + INR pricing + promo codes + cohort analytics

### Annual tier

**New `plans` x `intervals` matrix:**
- Each plan has both `monthly` and `annual` rows in `plan_prices`.
- Annual price typically 10 × monthly (2 months free) — configurable per plan.
- Annual signups pay upfront. Deferred revenue recognized monthly in `ai_daily_margin`.

### INR pricing

**INR prices set independently** (not FX conversion of USD). Standard anchors: ₹199, ₹499, ₹999, ₹1999.

**Effective pricing research note (informational only — you make the final call):**
- India willingness-to-pay on SaaS is typically 30–60% of US benchmark.
- PPP-adjusted: $1 USD spend = ~₹18–22 perceived spend for Indian consumers.
- So $8/mo USD ≠ ₹664/mo; more likely ₹299–₹399/mo for equivalent perceived value.

### Promo codes

**Infrastructure already scaffolded in Phase D (Task #25).** Phase E adds:
- First-time-only codes (one per user).
- Influencer attribution (code + affiliate tracking in `promo_redemptions.referral_source`).
- Auto-generated unique codes for campaigns.
- Admin analytics: redemption rate, LTV of promo users vs. organic.

### Cohort analytics

**View inside `/admin/margin`:**
- Heatmap: signup month × plan × month-N retention.
- Per-cohort LTV projection.
- Per-cohort contribution margin.
- Flag cohorts underperforming (e.g., Jan 2026 cohort has 40% lower LTV than Dec 2025 — investigate).

### Files
- `db/schema.ts` — extend `plans`, `plan_prices`.
- `lib/billing/pricing.ts` (new) — compute price for (plan, currency, interval).
- `app/admin/plans/page.tsx` — pricing editor (spec in catalog).
- `app/pricing/page.tsx` — public pricing page renders from database, not hardcoded.
- `lib/analytics/cohorts.ts` — cohort query builders.
- `app/admin/margin/page.tsx` — add cohort heatmap.

### Acceptance

- Admin adds annual price for a plan → checkout shows "Save 17%" toggle.
- Annual signups visible as separate line on `/admin/revenue` (deferred revenue section).
- INR + USD prices shown to correct users per Phase C routing.
- Cohort heatmap renders with real signup data.

**Status:** planned. Requires your pricing decisions (USD/INR/annual-discount-%) before launch.

---

## Phase E completion bar

- Prompt registry live; at least one A/B test run end-to-end.
- Annual tier purchasable.
- INR pricing set and working.
- Cohort analytics view shipped.
- `docs/STATUS.md` reflects Phase E completion.

## Longer-horizon ideas (not in this phase, but worth noting)

- **Model distillation.** Fine-tune a cheap open model on your top-5 op patterns. 6-month play.
- **Semantic de-duplication cache.** Same PDF → cached output across users. Needs careful TTL + privacy design.
- **Referral program.** "Give 30 credits, get 30 credits" — reduces CAC significantly if organic growth validates.
- **Enterprise tier.** Custom pricing, SSO, SAML, DPA, on-prem export. Only when you have inbound inquiries justifying it.
- **Regional CDN / edge inference.** Latency = quality for OCR + short-form ops. Opportunistic once Cloudflare Workers AI supports our models.
