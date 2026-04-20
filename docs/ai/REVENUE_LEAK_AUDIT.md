# Revenue Leak Audit — every penny accounted for

**Status:** Draft v1 — written 2026-04-20. Companion to `PROVIDER_STRATEGY.md`,
`MODELS_AND_MULTI_KEY.md`, and `BYOK_DECISION_MATRIX.md`. This document
enumerates every scenario where a penny could leak out of pdfcraftai.com
between the user's credit card and the provider invoice, and pins the
guardrail that stops each one.

If a leak is not in this doc, we have not thought about it yet. Any new
feature that touches pricing, credits, providers, or BYOK must add its
scenarios here **before** shipping.

---

## 0. Prime directive

> For every dollar Stripe deposits to our bank, we know exactly where it
> goes: Stripe fee, provider invoice, infrastructure cost, tax remittance,
> margin. The `ai_usage` table plus the credit ledger plus the Stripe
> ledger must reconcile to the penny at any point in time. If they don't,
> that delta is either a bug or a leak, and we stop shipping until we find
> which.

Corollary: every AI call must leave an audit row whose arithmetic is
independently verifiable. No "lossy" paths. No rounding that doesn't
round **up** to us.

---

## 1. The accounting identity

At any instant, for any user account, and in aggregate across the company:

```
  credits_purchased_usd
+ credits_granted_usd           (promo, referral, onboarding)
- credits_spent_usd             (at list rate $0.005/credit)
- credits_refunded_usd          (to credit balance, from failed calls)
= credits_on_balance_usd        (liability on our books until spent or expired)

  credits_spent_usd
- provider_cost_usd             (what we paid the upstream, from ai_usage)
- stripe_fee_on_purchase_usd    (2.9% + $0.30 on the matching credit pack)
- infra_cost_allocated_usd      (Hostinger + Cloudflare + storage amortized)
- tax_remitted_usd              (VAT/GST/sales tax, if collected)
= gross_margin_usd              (what we keep)
```

And for BYOK:

```
  infra_fee_charged_usd         (15% of base credits at list rate)
- 0                             (we pay nothing upstream — user's key)
- stripe_fee_on_purchase_usd    (allocated proportionally)
- infra_cost_allocated_usd
- tax_remitted_usd
= gross_margin_usd              (near 100% before infra/Stripe)
```

Every row in `ai_usage` contributes to the top-left side. Every Stripe
charge row contributes to `credits_purchased_usd`. Every provider invoice
line item (monthly, from Anthropic/OpenAI/Google consoles) must sum to
`provider_cost_usd` within rounding tolerance (typically ≤ $0.01/month
due to token-count edge cases on the provider side).

**If any of these identities drifts month-over-month, alert.** See §8.

---

## 2. Leak taxonomy

Sixteen categories. Each scenario is keyed (L-1…) and mapped to an
invariant (I-L1…) plus a test case (T-L1…) in §5 and §6.

### 2.1 Per-call cost > credits charged

**L-1.1 — Long-input prompt under-priced.**
The user pastes a 50-page PDF into `summarize_quick` (3 credits = $0.015
revenue). If we route to Haiku 3.5 at $0.80 input / $4 output per MTok, a
200k-token input is $0.16 input + $0.004 output = $0.164 upstream, i.e.
we pay ~11× what we charged.
**Mitigation:** enforce `max_input_tokens` per op in `ai_routes`. Reject
with a "too large — split the document" error before the provider call.
For chat, truncate to a sliding window based on `op.max_input_tokens`.
**Invariant I-L1:** `tokens_in * provider_input_rate + tokens_out *
provider_output_rate ≤ credits_charged * $0.005 * (1 - min_margin)` for
every platform-key call. If the check fails post-hoc, fire a monitoring
alert; if it fails more than once per 1000 calls in a rolling window,
freeze that op until re-priced.

**L-1.2 — Output token blowout.**
User asks `generate_deep` (20 credits = $0.10) and requests "a 50-page
contract." Sonnet 4 at $15/MTok output, 64k output tokens = $0.96 upstream
on a $0.10 charge.
**Mitigation:** hard-cap `max_output_tokens` per op. For `generate_deep`,
cap at 8k output tokens (Sonnet 4 → $0.12 max output cost, on $0.10 revenue
— still thin; bump op to 25 credits or cap harder at 4k output). Never
pass `max_tokens: null` to a provider.

**L-1.3 — Multi-modal surprise.**
User attaches three 4k images to a chat turn (1 credit = $0.005). Gemini
Flash charges ~$0.00002/image tile × 1548 tiles for a 4k image = $0.031
per image, $0.093 per turn. Revenue $0.005 → loss $0.088.
**Mitigation:** count images as synthetic tokens at route time. Multiply
credits charged for chat turns with images. Alternative: cap image
resolution (downscale to 1024×1024 before upload) so tile count is
bounded.

**L-1.4 — PDF vision cost.**
Anthropic charges per-page vision tokens for PDFs in document blocks. A
100-page PDF passed to `ocr` (2 credits per page = 200 credits = $1.00) is
~1.5k tokens × 100 pages = 150k input tokens → $0.12 upstream at Haiku
input rate. Fine, but we use Gemini for OCR ($0.30/MTok input) which is
cheaper. **Do not route OCR to Anthropic** unless the user pays pro tier.
**Mitigation:** ops with per-page pricing (OCR, redact, compare) must
route to Gemini Flash or Flash-Lite. Enforced in `ai_routes`.

### 2.2 Retry & idempotency leaks

**L-2.1 — Client retry re-calls the provider.**
User's browser times out waiting on a slow stream, hits "retry." Without
idempotency, we call the provider twice, charge credits twice, return
two answers.
**Mitigation:** every `/api/ai/*` POST accepts an `Idempotency-Key` header
(UUIDv4 from the client). Server stashes `(user_id, key) → request_hash +
response + charge_state` for 24h. Replay returns the cached response
**without** calling the provider again. `spendCredits()` and
`spendInfraFee()` are no-ops on replay.
**Invariant I-L2:** `count(ai_usage WHERE idempotency_key = X AND
user_id = U) ≤ 1`. Enforced by unique constraint.

**L-2.2 — Server retry on 500 double-charges.**
Next.js middleware retries a failed request. Provider call already
succeeded, we billed, then we bill again.
**Mitigation:** retries must reuse the idempotency key. Charging happens
**after** provider success acknowledgement, keyed by
`(idempotency_key, attempt=final)`. Not after each attempt.

**L-2.3 — Stream aborted mid-way on provider error.**
Anthropic returns `error` event after 2k output tokens. We already paid
for those tokens. What do we charge the user?
**Mitigation:** partial refund policy. If `stop_reason` is `error`,
`overloaded`, or `rate_limit`, refund the full operation cost back to the
credit balance **if** the user has less than the full answer. If the
stream has emitted >80% of `max_output_tokens` before the error, charge
proportionally (per the credit ledger's `refundCredits(id, fraction)`
helper we need to add).
**Note:** we eat the provider cost on partial failures — that is the
price of reliability SLA. Budget L-14 for this.

**L-2.4 — Client abort eats our tokens.**
User closes the tab mid-stream. Provider keeps generating (Anthropic's
stream doesn't stop on socket close server-side; Vercel/Node does
usually cancel), and we've committed credits.
**Mitigation:** our `streamChat` uses `AbortController` tied to the
request's `signal`. On client disconnect, cancel the upstream fetch.
Charge for tokens actually received (not `max_tokens` ceiling).

**L-2.5 — Idempotency-key collision across users.**
Key is user-scoped, not global. A guessed key from user A does not unlock
user B's cached response.
**Mitigation:** unique constraint on `(user_id, idempotency_key)`, not on
`idempotency_key` alone. Tested in T-L5.

### 2.3 BYOK-specific leaks

**L-3.1 — User pastes the platform key as their "BYOK" key.**
They've seen our platform key somewhere (unlikely but possible — hostinger
env leak), paste it into `/app/api-keys`. They pay 15% infra fee; we pay
100% provider cost.
**Mitigation:** `byok_keys.key_fingerprint = HMAC-SHA256(BYOK_MASTER_KEY,
raw_key)`. On save, compare against the hashes of our platform keys. If
match, reject with "that key is ours, not yours." Re-check on every use
(platform keys can change after rotation).
**Invariant I-L3:** a BYOK call where `key_fingerprint ∈
{platform_key_fingerprints}` is rejected at resolve-time.

**L-3.2 — BYOK 401 silently falls back to platform.**
The user's key was revoked; provider returns 401. The adapter has the
platform key cached as default. Without care, the retry layer uses it.
**Mitigation:** BYOK failures **never** retry on the platform key unless
`byok_preferences.fallback_to_platform = true` AND the user has credits.
Default `fallback_to_platform = false`. Audit row says `key_source =
'byok'` and `outcome = 'failed:auth'`. Infra fee refunded.

**L-3.3 — Stripe chargeback on credit pack after BYOK infra fees used.**
User buys a credit pack (100 credits = $5), uses them exclusively on BYOK
(15% infra fee paid from credits = 0.15 × spend). Then chargebacks. We
already spent provider budget? **No — BYOK means user's provider budget.**
So we lose only the credits we refunded as infra fee (marginal), plus
Stripe's $15 chargeback fee (significant on $5 purchase).
**Mitigation:** Stripe Radar rules flag disposable-email + BYOK + within
72h of purchase. Reject or require 3DS. Track and cap chargeback exposure
per account.

**L-3.4 — BYOK key decrypted but provider charges us anyway.**
Should never happen — if we pass `apiKey: user_byok` in the SDK call,
Anthropic/OpenAI bill that key's owner. But a bug where we pass the
platform key by accident (cached client) bills us.
**Mitigation:** adapter refactor per `BYOK_DECISION_MATRIX.md` §2. The
refactored `chat(input, { apiKey })` path asserts `apiKey !== undefined`
when `keySource === 'byok'`. If undefined, throw with a loud log — do not
silently use platform key.
**Invariant I-L4:** adapter audit log: `assert(keySource === apiKeyOrigin)`
on every successful call. `keySource === 'byok'` ⇒ `apiKeyOrigin ===
'user_provided'`.

**L-3.5 — BYOK concurrency exceeds user's provider rate limit.**
User's Anthropic Tier 1 key: 5 RPM, 20k TPM. Our router hammers it from
their concurrent tabs, gets 429s, we retry, user's key is still billed
per call (no — 429 means no charge on provider side). Net: latency pain,
no dollar leak.
**Mitigation:** per-user-per-key concurrency cap in router. Prefer spacing
requests via token bucket to avoid 429 storms in our logs.

**L-3.6 — BYOK budget exhausted during a session.**
User sets `monthly_budget_usd_micro = 10_000_000` ($10) on their BYOK
entry. Mid-session, their next call would exceed $10.
**Mitigation:** router estimates upstream cost pre-call (using
`ai_routes.max_input_tokens` × provider rate as an upper bound). If
estimate + spent_this_month > budget, reject pre-call with
`BYOK_BUDGET_EXCEEDED`. Do **not** fall back to platform unless flag set.

**L-3.7 — BYOK key removed by user mid-request.**
User DELETEs key during an in-flight request. The request resolved at
step 1 with their key; halfway through we'd still succeed (we have the
decrypted bytes in memory). But a retry couldn't use it.
**Mitigation:** soft-delete (`status = 'revoked'`, row kept) so in-flight
requests continue. Hard-delete only after 7 days no-use.

### 2.4 Pricing / model drift

**L-4.1 — Provider raises prices.**
OpenAI announces GPT-4o-mini goes from $0.15/MTok input to $0.25/MTok.
Our margin on Starter plan drops below target.
**Mitigation:** `ai_routes` stores `credit_multiplier` per op-tier. Admin
bumps multiplier for affected ops within 24h of price-change notice.
Monitoring: weekly job pulls provider price tables and diffs against our
cached rates in `ai_provider_rates` table; alert on change.

**L-4.2 — Auto-upgrade path hits pricier model.**
`anthropic:claude-haiku-3-5` is deprecated; Anthropic silently routes
newer `-latest` aliases to Haiku 4.5 which is 2× more expensive.
**Mitigation:** **pin explicit model versions** in `ai_routes`. Never
store `-latest`. Watch for deprecation emails and canary-test new models
before switching (§L-5).

**L-4.3 — Canary routes a % of traffic to an expensive model.**
`ai_routes.canary_pct = 5` + `canary_model = gpt-4.1` on
`chat_turn:cheapest` → 5% of chat calls cost 100× more.
**Mitigation:** canary rows must satisfy `canary_cost_per_op ≤
2 × primary_cost_per_op` or admin UI rejects them. Canary aggregate cost
tracked separately in ai_usage (`canary_hit = true`), budgeted at < $20/day.

**L-4.4 — Tier mismatch between admin default and plan gating.**
Admin sets `translate:default → GPT-4.1` for all plans. Starter users
(priced for cheap tier) get expensive model.
**Mitigation:** plan-scoped routes. `ai_routes.plan_scope ENUM('all',
'free','starter','creator','pro','studio')`. Router composes user's plan
with op-tier. Starter users on a `default` route may be downgraded to
`cheapest` tier if the default's cost > 2× the cheapest tier.

### 2.5 Token accounting drift

**L-5.1 — Provider's token count > our estimate.**
We estimate 10k input tokens with `@anthropic-ai/tokenizer`; provider
actually counts 12k. We priced off 10k.
**Mitigation:** **always** use the provider's reported `usage.input_tokens`
from the response for `ai_usage.tokens_in`. Never our local estimate.
Estimates are for pre-flight budget guards only.

**L-5.2 — Streaming usage missing.**
Some provider SDKs report `usage` only on message_start (input) and
message_delta (output). If the stream errors before any `message_delta`,
we have input tokens only and we bill as if no output.
**Mitigation:** for errored streams, record `tokens_out = 0` but set
`outcome = 'failed:stream_error'` so audits know this row's margin is
underspecified. Monthly reconciliation uses provider invoice totals as
ground truth.

**L-5.3 — Tool-use tokens invisible until we wire it up.**
`toolUse: false` today. When flipped on, tool definitions add input
tokens. Our pricer must include them.
**Mitigation:** when `capabilities.toolUse` flips `true`, ai_usage adds
`tool_tokens_in` column and the credit multiplier per op reflects the
inflation.

**L-5.4 — Embeddings for RAG are not free.**
OpenAI `text-embedding-3-small` is $0.02/MTok. Indexing a 1M-token
corpus = $20. If the user triggers indexing on upload and never chats,
we ate $20 for zero revenue.
**Mitigation:** defer indexing until first chat turn for accounts under
$5 lifetime revenue. Cap per-doc embedding cost at a function of plan
(Starter: indexing off; Creator: 200-page docs; Pro: unlimited). Store
embeddings keyed by `doc_hash` so re-upload of same bytes doesn't
re-embed.

### 2.6 Abuse vectors

**L-6.1 — Free-trial credits harvested.**
We grant 10 free credits on signup. Attacker creates 10k accounts with
disposable emails, runs `generate_deep` (20 credits each? No — capped at
10). Still 100k free credits = $500 of upstream spend.
**Mitigation:** (a) require email verification before free credits.
(b) Stripe's payment-method-required trial (user enters card, no charge,
but Radar signals are gathered). (c) Rate-limit signups per IP /ASN /
email domain via Cloudflare Turnstile. (d) Free credit cap per account:
5 credits, only for ops ≤ 3 credits each (no `generate_deep`).

**L-6.2 — High-credit op spam.**
`compare` (15 credits) on two tiny PDFs. Operator pays $0.005×15 = $0.075;
Sonnet 4 cost is ~$0.003. Margin fine. But if the user loops: 100× compare
calls in a second. We're rate-limited by provider (no problem), but we've
burned 1500 credits.
**Mitigation:** per-user per-op rate limits in ai_routes
(`max_calls_per_minute`). Plus overall "sanity" rate limit: 60 AI ops /
min per user.

**L-6.3 — Credit-refund abuse.**
User triggers an op, the stream "times out" (they click abort at 2s).
Our policy refunds on `abort` within 5s. They repeat this to extract
credits.
**Mitigation:** no refund on client abort. Refunds only on
provider-reported `error`, `overloaded`, `rate_limit`, or
`internal_server`. Client aborts that land after any output token has
been sent count as partial use (no refund).

**L-6.4 — Chargeback-after-use ("friendly fraud").**
User buys 6000-credit pack ($149), uses 5800 credits, disputes the
charge with Stripe.
**Mitigation:** (a) Stripe Radar with custom rules flagging high-usage +
<72h-old accounts + mismatched billing geography. (b) Dispute evidence
packet auto-assembled from `ai_usage` rows + IP logs + `signed_tos_at`
timestamp. (c) chargeback_exposure_usd per account tracked; accounts with
>$50 exposure require 3DS re-auth before the next pack purchase.
**Note:** we cannot block chargebacks; we can only win them with
evidence. Typical win rate: 40%. Budget L-14 assumes 60% loss rate on
disputed large packs.

**L-6.5 — Promo-code stacking.**
Two codes: WELCOME10 (10 free) + LAUNCH5 (5 free). Meant to be
mutually exclusive. Form accepts both.
**Mitigation:** credit-ledger idempotency key = `(user_id,
promo_code)`. Database-level exclusivity: one row per promo code per
user. Plus server-side "max one promo per account lifetime" unless admin
override.

**L-6.6 — Referral-bounty > referee's margin.**
Refer a friend, get 50 credits ($0.25 cost to us). Friend buys Starter
($5, ~$3.50 margin). Net positive per referral. But: abuser creates 50
accounts, "refers" between them, harvests 2500 credits.
**Mitigation:** referral bounty credits fungible only with paid packs
(not free), vested after referee's first paid purchase, max 10
referrals lifetime per account. Plus: detect account-cluster sybil
(shared IP, shared device fingerprint, shared payment method).

### 2.7 Infrastructure leaks

**L-7.1 — Outbound bandwidth on large PDFs.**
User uploads a 50MB PDF; we base64-encode and stream it to Anthropic.
Hostinger charges past the bandwidth cap.
**Mitigation:** PDF size cap at 25MB (Anthropic's limit is 32MB anyway).
For docs >10MB, use Anthropic's file upload API (one-time upload, reuse
by ID) so we pay egress once per doc per day.

**L-7.2 — Log storage blows up.**
`ai_usage` with 1k rows/day/user × 10k users = 10M rows/day ≈ 3GB/day
with indexes. At 12 months retention, 1TB.
**Mitigation:** partition `ai_usage` by month. Roll cold partitions to
S3 (or Hostinger file storage) after 90 days. Dashboard queries the
last 90 days hot; older queries use the rollup tables
(`ai_usage_monthly_by_user_op`).

**L-7.3 — Admin/QA accounts burn credits.**
Internal team tests destructive flows, burns through platform credits
on the "real" admin account.
**Mitigation:** internal accounts flagged `is_internal = true`. All ai
calls from internal accounts go through a platform-owned BYOK key (yes,
even us) billed to a separate budget line ("R&D"). Production credit
ledger shows $0 for internal accounts. Public metrics exclude them.

**L-7.4 — Moderation calls are "free" until they're not.**
OpenAI omni-moderation is free in April 2026. What if they paywall it?
**Mitigation:** budget sentinel — if moderation pricing changes to
non-zero, auto-disable moderation pre-flight for BYOK users (their
risk), keep it for platform-key users but bump `credit_multiplier` on
affected ops to compensate. Alerts in §8.

### 2.8 Accounting / ledger leaks

**L-8.1 — Stripe fee not subtracted pre-margin.**
User buys Starter $5. Stripe takes 2.9% + $0.30 = $0.445. We book $5 in
revenue, report 88% margin on spend, but real margin is
($5 - $0.445 - provider) / $5 = ~78%.
**Mitigation:** every margin report in admin dashboard computes
**net** margin post-Stripe and post-tax. `stripe_ledger.fee_usd` column
fed from Stripe webhook `charge.succeeded`. Projections in
`PROVIDER_STRATEGY.md` should note: "before Stripe fees."

**L-8.2 — Credit expiration on paid packs.**
Starter credits "expire in 12 months." User buys a pack, uses 50, leaves
50 to expire. Is expiration legal in their jurisdiction?
**Mitigation:** US — allowed if disclosed pre-purchase (we do). EU — may
violate consumer protection (Germany, UK treat prepaid as money
equivalent). Legal review before launch in EU. Default policy: paid
credits **do not expire**; only promo credits expire. Update ToS.

**L-8.3 — Refund to credit balance vs Stripe refund mismatch.**
Provider outage refunds 5 credits to user's balance. Two weeks later
user Stripe-refunds the pack those 5 credits came from. Ledger drifts:
user has 5 "phantom" credits with no corresponding purchase.
**Mitigation:** Stripe refund event → revoke unused credits from
balance at FIFO pack order. If user has already spent them, credit
balance goes negative (disallowed — clamp to 0) and margin takes the
hit. Flag to support for manual review.

**L-8.4 — EU VAT / GST not collected.**
UK VAT 20%, Germany 19%, Australia GST 10%. Selling digital services
cross-border triggers VAT registration thresholds in several
jurisdictions.
**Mitigation:** use Stripe Tax (automated). Thresholds tracked per
country. When any country nears threshold ($10k/yr typical), register
VAT number. Credits sold pre-threshold are taxable at origin rate.
Legal review before scaling beyond ~$50k ARR.

**L-8.5 — Failed payment but credits already granted.**
Stripe webhook delivery retries. We credit the user on
`checkout.session.completed`. Chargeback 90 days later.
**Mitigation:** credit grant is keyed to `payment_intent.succeeded`,
not session completion. Stripe retries make the ledger idempotent via
`stripe_event_id` unique key.

**L-8.6 — Currency conversion float.**
User pays £4.99 (our GBP-priced Starter), we collect in GBP, provider
bills us in USD. FX swings cut into margin.
**Mitigation:** Stripe converts at daily rate; we book revenue in
account currency (USD), provider invoice in USD. FX difference lives in
Stripe balance. Monitor FX exposure monthly; accept it as noise up to
2%. Above that, consider dynamic repricing.

### 2.9 Caching / batching leaks

**L-9.1 — First-message cache miss at 1.25× cost.**
Anthropic prompt caching: cache writes cost 1.25× list rate; cache hits
cost 0.1×. Net saving kicks in after 2 uses of the same cached prefix.
**Mitigation:** only enable prompt caching on flows where the prefix
reuses within 5 minutes ≥ 2 times (chat sessions, multi-page summarize).
Never on one-shot ops.

**L-9.2 — Cache invalidated mid-session.**
User edits system prompt mid-chat → cache key changes → next call
re-writes at 1.25×.
**Mitigation:** detect prefix change; skip caching on that call;
re-enable on the next stable prefix.

**L-9.3 — Batch API returns after 24h; user already refunded.**
We offer batch (50% discount) for non-urgent ops (e.g., overnight
generate). User files a complaint at hour 20, we refund. At hour 25 the
batch completes and we get charged anyway.
**Mitigation:** refunds on batched ops require 25h cooldown, OR we eat
the cost (document it in the ops budget). We will not launch batch for
user-facing flows at v1.

### 2.10 Failure-mode leaks

**L-10.1 — Partial stream charged in full.**
Already covered in L-2.3. Re-listed here as a leak category because the
**default** policy should be "refund or nothing" — never "charge in full
despite partial output" unless >80% threshold.

**L-10.2 — Provider 500 after committed spend.**
We pre-debit credits on resolve, call provider, provider 500s.
**Mitigation:** credits are debited **after** provider success
(captured in `chat.done` event for streams, or post-return for
non-streams). If the pattern "pre-debit, then refund on failure" is
used for concurrency reasons, the refund path is idempotent and
automatic (no support ticket).

**L-10.3 — Provider timeout > our 30s Vercel limit.**
Deep generate takes 45s, Vercel kills the function at 30s, we never
receive the final token count, provider bills us for 45s of generation.
**Mitigation:** (a) route deep-generate through a background worker
(Hostinger cron + queue, or ai-job polling) for flows that exceed 25s.
(b) pre-flight check: if `op = generate_deep` AND model is Sonnet, queue
it and email the user when done. Otherwise fail fast.

**L-10.4 — SDK bug double-emits usage.**
A buggy Anthropic SDK version emits two `message_delta` events with the
same `usage.output_tokens`. Our accumulator sums them and over-bills.
**Mitigation:** accumulator uses `max(existing, new)` not `+=`, because
Anthropic's `output_tokens` is cumulative per their docs. This matches
current `anthropic.ts` line 242-244 behavior — verified in code review.

### 2.11 Multi-tenancy leaks

**L-11.1 — Org pool pilferage.**
Studio plan: 6000 credits shared across N seats. One seat burns them
all on day 2.
**Mitigation:** per-seat daily cap in org settings (admin defines, e.g.,
200 credits/seat/day). Workspace admin sees heat map of per-seat
spend. Auto-pause seat at cap.

**L-11.2 — Seat-count inflation.**
Studio plan bills $49/seat/month. Admin invites 50 seats, uses 3.
**Mitigation:** seat count auto-adjusts to monthly active (used at
least one AI op). Invite ≠ seat. Billable seats = active seats +
pending-ack within 14 days.

**L-11.3 — Left-employee credits walk.**
Employee leaves, still has credits linked to personal email → org loses
them.
**Mitigation:** SSO-linked workspaces; credits belong to the workspace,
not the user. Per-seat credit grant is a UI convenience, storage is
central.

### 2.12 Regulatory / legal leaks

**L-12.1 — GDPR deletion purges ai_usage rows.**
User exercises right to erasure → we delete their `ai_usage` rows → we
lose the provider cost records for their activity → our reconciliation
breaks.
**Mitigation:** anonymize, don't delete. `user_id → NULL` or pseudonym.
Cost/tokens/op/provider kept in aggregate. `pii_text_preview` columns
purged. Reconciliation still works.

**L-12.2 — DMCA takedown on generated content.**
User files DMCA claiming AI-generated contract infringes a template.
Legal requires us to remove + possibly refund.
**Mitigation:** ToS disclaimer: AI output is on user's responsibility;
we do not indemnify. Plan-specific indemnification available as a paid
add-on for Studio tier (future).

**L-12.3 — EU AI Act compliance cost.**
From August 2026, general-purpose AI deployer obligations apply. May
require risk assessments, logging, human-oversight controls.
**Mitigation:** `ai_usage` + moderation pre-flight + BYOK consent dialog
already cover most obligations. Budget $2k/yr for legal review.

### 2.13 FX / currency leaks

Covered in L-8.6.

### 2.14 Buffer / sizing leaks

**L-14.1 — `max_tokens` always billed at ceiling.**
False for most providers. Anthropic and OpenAI bill actual output
tokens, not `max_tokens`. Gemini same. No leak here.
**Sanity check:** every provider adapter integration test asserts that
`usage.output_tokens ≤ max_tokens` and that `cost = output_tokens *
rate` not `max_tokens * rate`.

**L-14.2 — Auto-retry with larger `max_tokens` on truncation.**
User output truncated at 1024. UI offers "expand". This re-runs at
4096. If credits aren't additionally charged, we eat the extra.
**Mitigation:** expand = new op = new credit charge. No implicit
continuation on our dime.

### 2.15 Administrative leaks

**L-15.1 — Promo stacking.**
See L-6.5.

**L-15.2 — Free credits never revoked.**
Beta testers from 2026 Q1 still have 1000 free credits in Q3. They
churn → credit liability stays on books.
**Mitigation:** free credits have an expiration date (`expires_at`).
On expiration, credit balance decrements and a journal entry moves the
amount from "liability: unused credits" to "revenue: breakage." This
is the only legitimate "free money" path and it's a known line item.

**L-15.3 — Manual admin credit grants not logged.**
Support grants 20 credits to a complaining user; no row in ledger = no
way to explain negative margin next month.
**Mitigation:** admin credit grants are a first-class ledger entry
(`grant_reason ENUM('promo','support_refund','beta','internal_qa')`).
Required reason string. Dashboard shows total granted, by reason.

**L-15.4 — Referral bounty → sybil.**
See L-6.6.

### 2.16 Security incident leaks

**L-16.1 — Platform API key stolen.**
Attacker burns through our Anthropic budget.
**Mitigation:** each platform key has a **per-day budget cap**
(`AI_DAILY_BUDGET_USD_ANTHROPIC = 500` etc) enforced by Anthropic's
built-in limits AND by a monitoring job that revokes the key if daily
spend > 2× forecast. Key rotation quarterly. Keys never in git; Hostinger
env only; `.env.local` in sandbox only, gitignored.

**L-16.2 — User BYOK key stolen from us.**
Our encryption broken → attacker exfiltrates BYOK keys → user's
Anthropic bill explodes → user claims against us.
**Mitigation:** AES-256-GCM with per-row nonce + master key in Hostinger
env (NOT in DB). Envelope encryption planned for v2 (master key in KMS).
Insurance line item for aggregate BYOK breach exposure. Publish disclosed
encryption scheme; don't roll our own crypto.

**L-16.3 — SSRF via document URLs.**
User chat turn embeds a URL to their own internal resource; we try to
fetch as tool use; attacker links to AWS metadata endpoint.
**Mitigation:** tool use is `false` today. When enabled, tool that
fetches URLs must use a strict allowlist (http/https, no private IPs, no
localhost, no metadata.google.internal etc).

**L-16.4 — Log exfiltration.**
Logs contain raw BYOK keys for debugging. Leak.
**Mitigation:** adapter-level rule: **never log api keys**. Tested by
scanning recent log output for regex matching key prefixes (`sk-`,
`gsk-`). Part of CI.

---

## 3. Invariants checklist (L-invariants layer)

Add these to the invariant list in `BYOK_DECISION_MATRIX.md` (which has
I-1 through I-10 for correctness). These are **financial** invariants:

| ID | Invariant | Where enforced |
|----|-----------|----------------|
| I-L1 | Platform-key call: `upstream_cost ≤ credits_charged × $0.005 × (1 − min_margin)`. Min margin defaults to 50%. | Monitoring job runs hourly; op auto-disabled on sustained breach. |
| I-L2 | `COUNT(ai_usage WHERE user_id=U AND idempotency_key=K) ≤ 1`. | Unique constraint. |
| I-L3 | BYOK key fingerprint never equals any platform-key fingerprint. | Pre-save check + pre-use check. |
| I-L4 | `ai_usage.key_source = adapter_reported_key_origin` on every row. | Adapter assertion + audit row. |
| I-L5 | `credit_ledger.sum = credits_purchased + credits_granted − credits_spent + credits_refunded` for every user, computed at rest. | Nightly reconciliation job. |
| I-L6 | `sum(ai_usage.provider_cost_micro_usd) ± 1% = provider_invoice_total` per month per provider. | Monthly reconciliation. |
| I-L7 | `stripe_ledger.net_received = sum(credit_packs.gross) − sum(stripe_fee) − sum(refunds)`. | Daily Stripe webhook reconciliation. |
| I-L8 | No `ai_usage` row has `provider_cost_micro_usd > 0` AND `key_source = 'byok'`. (BYOK is the user's bill.) | Data-level check. |
| I-L9 | No `ai_usage` row has `credits_charged = 0` UNLESS `op = internal_qa` OR `key_source = 'byok' AND infra_fee_waived = true`. | Data-level check. |
| I-L10 | Admin grants + promo grants + referral credits = `sum(credit_ledger WHERE kind != 'purchase')`. | Monthly journal entry. |
| I-L11 | `chargeback_exposure` per account never exceeds `lifetime_paid × 1.0`. | Stripe Radar + ledger check. |
| I-L12 | Free-trial accounts cannot invoke ops with `base_credits > 3`. | Plan gate in router. |

---

## 4. Priority ranking

### P0 — must fix before ENABLE_BYOK goes true

- L-1.1, L-1.2: input/output token caps per op in `ai_routes`.
- L-2.1, L-2.2, L-2.5: idempotency end-to-end, per-user unique key.
- L-3.1: BYOK-key-fingerprint ≠ platform-key-fingerprint check.
- L-3.2: BYOK-to-platform silent fallback is impossible by default.
- L-3.4: adapter refactor for per-call apiKey, with assertion on origin.
- L-5.1: always use provider-reported token counts, not local estimates.
- L-8.5: credit grant keyed to `payment_intent.succeeded` + `stripe_event_id` unique.
- L-15.3: admin credit grants are ledger entries with mandatory reason.
- L-16.4: no API keys in logs; CI scan for key patterns.

### P1 — fix before >100 paid users

- L-1.3, L-1.4: multi-modal synthetic tokens; OCR only on Gemini.
- L-2.3: partial-stream refund policy.
- L-3.3: Stripe Radar rules for BYOK + new-account combinations.
- L-3.6: BYOK pre-flight budget check.
- L-4.1, L-4.2: weekly provider-price diff job; pin explicit model versions.
- L-6.1: free-credit cap + op-restriction.
- L-6.4: chargeback evidence auto-assembly.
- L-8.1: net margin reporting post-Stripe, post-tax.
- L-10.3: background worker for >25s ops.

### P2 — monitor, address before $50k ARR

- L-5.4: embeddings indexing deferral + caching.
- L-7.1, L-7.2: bandwidth + log storage optimization.
- L-8.4: Stripe Tax full activation, VAT registration planning.
- L-12.3: EU AI Act compliance review.
- L-16.2: envelope encryption / KMS for BYOK key storage.

---

## 5. Test cases (T-L series, add to CI)

| ID | Scenario | Expected |
|----|----------|----------|
| T-L1 | Post `summarize_quick` with 300k-token input. | 413 rejection, 0 credits charged, no provider call. |
| T-L2 | Post `generate_deep` with max_tokens override 64k. | Server clamps to 8k (or op's cap), 20 credits charged once. |
| T-L3 | Post chat turn with 3 images of 4k resolution. | Either downscaled or credit-multiplied; final credits charged ≥ estimate. |
| T-L4 | Double POST same idempotency key. | Second POST returns cached response, 0 additional credits, 0 new ai_usage row. |
| T-L5 | User A's idempotency key posted by user B. | User B gets a fresh execution; no cache leak. |
| T-L6 | BYOK key saved; hash matches platform-key hash. | Reject at save time. |
| T-L7 | BYOK key returns 401; `fallback_to_platform = false`. | Request fails; no platform call; infra fee refunded. |
| T-L8 | BYOK key returns 401; `fallback_to_platform = true`; user has credits. | Platform key used; full credits charged (not infra fee); ai_usage shows two rows (failed BYOK + platform success). |
| T-L9 | Stripe webhook `payment_intent.succeeded` delivered twice. | Credits granted once; second delivery idempotent. |
| T-L10 | Client aborts stream after 10% output. | No refund; charged in full (partial-output policy). |
| T-L11 | Provider returns error mid-stream at 30% output. | Refund per partial-stream policy (full if <80%). |
| T-L12 | Admin grants 100 credits with no reason. | Rejected at API; mandatory `reason`. |
| T-L13 | Free-trial account invokes `generate_deep`. | Rejected; plan gate. |
| T-L14 | Logs scanned for `sk-` or `gsk-` prefix in last 1000 log lines. | No match. |
| T-L15 | Monthly reconciliation job run against fake Stripe/provider data. | Ledger matches; identity in §1 holds to $0.01. |
| T-L16 | Provider price-diff job run with a mock price bump. | Alert fires; `ai_routes` not auto-mutated. |
| T-L17 | User deletes BYOK key mid-request. | In-flight completes; next request fails (no key). |
| T-L18 | User exercises GDPR deletion; rerun monthly reconciliation. | Still balances (rows anonymized, not deleted). |
| T-L19 | Referral bounty granted before referee's first paid purchase. | Rejected; vesting gate. |
| T-L20 | Free credits hit `expires_at`. | Balance decrements; journal entry posted to "breakage." |

---

## 6. Monitoring & alerts (what fires PagerDuty)

| Signal | Threshold | Action |
|--------|-----------|--------|
| Hourly op margin < 50% for any op on platform key | Two consecutive hours | Auto-disable op; alert admin. |
| Provider daily spend > 2× 7-day rolling avg | Any single day | Freeze affected provider; alert admin. |
| `credit_ledger` integrity check fails (sum ≠ purchased − spent + refunded + granted) | Any user, any time | Freeze user's credit ops; alert support. |
| Stripe chargeback opened on an account with > $50 usage | Event received | Auto-pause account; queue dispute evidence. |
| BYOK key 401 rate > 10% over 1 hour | Rolling window | User notified via email; key marked `degraded`. |
| Platform daily spend approaching cap | 80% of `AI_DAILY_BUDGET_USD_*` | Alert admin; at 100%, return 503 on ops. |
| Log line matches API-key regex | Any hit in last hour | Page on-call; rotate leaked key. |
| Provider invoice - `ai_usage` sum drift | > $1.00 or > 1% | Reconciliation failure; manual review. |

---

## 7. Monthly reconciliation procedure

Run first business day of each month, for the prior month:

1. **Export provider invoices.** Anthropic, OpenAI, Google console →
   total $ spent by month, by API key.
2. **Pull platform ai_usage sum.** `SUM(provider_cost_micro_usd) WHERE
   key_source='platform' GROUP BY provider_id, month`.
3. **Reconcile** each provider_id: `abs(invoice − ai_usage_sum) < $1 or
   < 1% (whichever is greater)`. Document every exception.
4. **Export Stripe payouts + fees + refunds + chargebacks** for the month.
5. **Pull credit_ledger purchases** for the month. Reconcile to Stripe
   `payment_intent.succeeded` webhook records.
6. **Compute gross margin** using the §1 identity. Compare to forecasted
   margin by plan; any deviation > 10% is investigated.
7. **Post journal entries**:
   - Breakage (expired promo credits) → revenue.
   - Provider invoice → COGS.
   - Stripe fees → payment processing expense.
   - Chargebacks → chargeback loss.
8. **Write the reconciliation report** to `docs/ops/recon-YYYY-MM.md`.
   Required sections: identities balanced (Y/N), exceptions, actions.
9. **If any identity breaks**, do not publish the margin number to the
   board until root-caused.

---

## 8. Change management

Any code change that touches:
- `lib/ai/router.ts` / `lib/ai/registry.ts` / `lib/ai/credits.ts`
- `lib/ai/adapters/*.ts`
- `lib/pricing.ts`
- `drizzle/migrations/*_ai_*` / `drizzle/migrations/*_byok_*` /
  `drizzle/migrations/*_credit_*`
- `app/api/ai/*/route.ts`

...requires:

1. A PR description that references the L-scenario(s) it affects (even
   if "none — internal refactor").
2. T-L tests passing in CI.
3. A review checklist including: "does this change the accounting
   identity in §1? If yes, reconciliation doc updated?"
4. Canary deploy for 24h on 5% traffic before full rollout; canary
   bucket separately tracked in `ai_usage.canary_hit`.
5. On rollback, credits/provider-costs must remain reconciled; the
   rollback PR reruns the reconciliation job for the affected window.

---

## 9. Open questions (to resolve before v1)

- **Q1.** Do we price chat turns by token count or by turn count?
  Turn count is simpler but under-priced for 200k-token prompts (L-1.1).
  Decision likely: **turn-count up to a cap**, over which we decline.
- **Q2.** Minimum margin — 50% or 40%?
  Starter plan's 88% leaves room, but `compare_deep` (15 credits) at deep
  tier (Sonnet 4 at $15/MTok output) is thin on big inputs. Likely: **50%
  floor**, ops below it get re-priced.
- **Q3.** Partial-stream refund threshold — 80%?
  Trade-off: generous refund policy = more chargebacks prevented; too
  generous = abuse vector. Likely: **80% threshold**, with a per-account
  rate limit on refund requests.
- **Q4.** Promo credit `expires_at` default — 30, 60, 90 days?
  Shorter = fewer liabilities on books; longer = better user experience.
  Likely: **60 days** with email reminders at 14 and 7 days.
- **Q5.** Do we support BYOK for Studio seat users?
  Yes, per plan table in `PROVIDER_STRATEGY.md`. But: who owns the BYOK
  key — the seat user or the workspace admin? **Likely: workspace admin
  owns and chooses whether to share; seat users can also add personal
  keys that override workspace-level.**
- **Q6.** Chargeback policy for Stripe disputes: auto-accept or auto-dispute?
  Likely: **auto-dispute with assembled evidence** for transactions >$50;
  auto-accept + block account for transactions <$10 (dispute economics
  are adverse).

---

## 10. Bottom line

Every leak in this doc has an owner (invariant), a test (T-L series), a
monitor (§6), and a reconciliation path (§7). None of them are
theoretical once the system scales: all 16 categories have happened at
other SaaS companies. The ones that bite hardest are idempotency
(L-2.x), BYOK silent fallback (L-3.2), and chargebacks (L-6.4 / L-8.5).

**We will not flip `ENABLE_BYOK=true` until P0 items ship and T-L tests
pass.** We will not open Studio seats until P1 ships. We will not scale
beyond $50k ARR until P2 ships. The budget for "expected leak" (partial
refunds, won chargebacks, breakage, FX) is modeled into the
`PROVIDER_STRATEGY.md` margin table at ~3% and must be tracked
separately as `expected_leak_usd` in the monthly reconciliation.

If a new scenario surfaces that isn't in this doc, it goes in as
**L-N.M** before the fix ships.
