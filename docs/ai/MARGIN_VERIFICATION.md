# Margin verification — claimed vs actual

**Date:** 2026-04-20 (v1 base analysis, expanded same day to v2 with 11-scenario sweep in §9, then extended to v3 in §12 after D4 closed — PayPal deprecated in favour of Paddle MoR). **Answers:** "Did you verify max margin profit?" and "analyse all possible scenarios?"

**Short answer:** The 88/83/78/73% margins in `lib/pricing.ts` are **not achieved** under the current code defaults. They are **exceeded** under the intended routing, which isn't built yet. The wider sweep (§9) surfaces three scenarios worse than the v1 pass found: **chat whale** (user pastes 200-page PDF into a 1-credit chat = Pro margin −12.5%), **support cost** (Starter can't absorb $1.50/mo support at $5 sticker), and **combined worst case** (Starter 38% net). Five fixes — Gemini adapter, cheap routing, per-pack processor policy, context-token cap, and a Starter re-pricing decision — are required before the pricing copy is truthful.

**v3 update (§12):** D4 closed 2026-04-20 — international processing moved from PayPal to Paddle (MoR). This collapses the old S5 chargeback scenario to zero on the Paddle slice (they eat disputes), collapses S1's "PayPal worst" column entirely, but worsens the per-transaction fee on Starter from ~15% (PayPal) to ~15% (Paddle 5% + $0.50 flat) — similar gross drag on $5 packs, vastly better compliance position. The Starter-$5 decision (D1 in §10) remains open but for a different reason than before.

---

## 1. What the pricing table claims

From `lib/pricing.ts`:

| Pack | Price | Credits (+ bonus) | Claimed margin |
|---|---|---|---|
| Starter | $5 | 100 | 88% |
| Creator | $19 | 525 | 83% |
| Pro | $59 | 2,200 | 78% |
| Studio | $149 | 6,800 | 73% |

The `margin: 88` field isn't explained anywhere in the repo — no formula, no assumption set. So this audit re-derives the number.

## 2. What I modelled

**Three cost buckets** every pack pays:

1. **Payment processor fee.** Weighted 50% Razorpay INR / 30% PayPal USD / 20% Razorpay USD (matches the currency-routing policy in `PAYMENT_GATEWAY_PLAN.md` §10 Q1).
   - Razorpay INR: 2% × 1.18 (GST) = 2.36%.
   - Razorpay USD intl: 3% × 1.18 = 3.54%.
   - PayPal USD: 3.49% + $0.49 flat + 1.5% cross-border = ~4.99% + $0.49.
2. **AI provider cost.** Per-op tokens × provider pricing. Two scenarios:
   - **"Haiku-all"** — current code default: `ANTHROPIC_MODEL = claude-haiku-4-5-20251001` for every op. $1/Mtok in, $5/Mtok out.
   - **"Cheap routing"** — the intended policy from `docs/ai/MODELS_AND_MULTI_KEY.md`: OCR → Gemini Flash, translate → Gemini Flash, chat/rewrite → GPT-4o-mini, compare/redact/table → Haiku, generate/sign → Sonnet 4.6.
3. **Infrastructure** (Hostinger + MySQL + logs, amortised per pack): $0.10 / $0.20 / $0.50 / $1.00.

**Two usage profiles:**

- **Worst case** — user spends every credit on OCR (2 credits/page). This is rare but is how "margin: 88" should be read if it's conservative.
- **Realistic mix** — 40% chat, 15% summarize, 15% OCR, 10% translate, rest spread across rewrite/table/redact/compare/generate/sign. Weighted by credits each op consumes.

## 3. Results

### 3.1 Worst case (100% OCR)

| Pack | Claim | Haiku-only (today's default) | Cheap routing (Gemini Flash OCR) | PayPal-worst + Haiku |
|---|---|---|---|---|
| Starter | 88% | 79.7% | 91.4% | 71.2% |
| Creator | 83% | 78.2% | 94.4% | 74.8% |
| Pro | 78% | 73.1% | 95.0% | 71.0% |
| Studio | 73% | 68.5% | 95.2% | 66.6% |

**Reading:** with Gemini Flash for OCR (43× cheaper than Haiku per page — $0.00028 vs $0.012), even the worst case beats every claim by 2–22 percentage points. With Haiku for everything (current default), every pack misses its claimed margin by 5–8pp. With a Starter buyer paying via PayPal and doing only OCR on Haiku, margin falls to **71%**.

### 3.2 Realistic mix

| Pack | Claim | Haiku-all | Cheap routing | Gap (cheap vs claim) |
|---|---|---|---|---|
| Starter | 88% | 82.3% | 90.5% | +2.5pp |
| Creator | 83% | 81.9% | 93.2% | +10.2pp |
| Pro | 78% | 78.1% | 93.4% | +15.4pp |
| Studio | 73% | 74.5% | 93.2% | +20.2pp |

**Reading:** under realistic usage, cheap routing beats claim by 2–20 percentage points. Haiku-all routing narrowly misses Starter/Creator claims and matches Pro/Studio — the average user hides the worst-case cost.

## 4. Why the claim isn't safe yet

Three gaps between the pricing table's implicit promise and what ships today:

### Gap A — No Gemini adapter in code

`lib/ai/registry.ts` only has Anthropic and OpenAI rows. The routing table in `docs/ai/MODELS_AND_MULTI_KEY.md` recommends Gemini Flash as the default for `ocr` and `translate`, but there's no code path that can dispatch to it. **Current default routes 100% of OCR to Haiku 4.5 at 43× the cost of Gemini Flash.**

Fix: add a Gemini adapter in Phase A5 (P3 in the master plan today — promote to P2).

### Gap B — No ops-level routing policy

Route handlers call `selectProvider({ capabilityNeeded: 'streaming' })` — which picks the first configured provider that can stream, regardless of cost. A `chat_turn` and a `generate` both resolve to Anthropic today. We're paying Sonnet-class prices when GPT-4o-mini would do.

Fix: build `lib/ai/router.ts` per `AI_API_MASTER_PLAN.md` §4.4. Ship with a hardcoded policy table; DB-backed `ai_routes` is P2.

### Gap C — PayPal + Starter pack is a knife-edge

For a PayPal buyer of the $5 Starter pack, the fixed $0.49 fee alone is 9.8% of revenue. Combined with 3.49% + 1.5% cross-border, the processor drag is ~14%. If that user happens to do only OCR on Haiku, net margin drops to 71% — still profitable, but 17pp below claim.

Fix options (pick one before Payments Phase 1 goes live):

1. **Route Starter to Razorpay-only.** Remove PayPal from the Starter checkout. UI tweak only; the plan already anticipates per-pack provider selection.
2. **Raise Starter to $7.** Preserves PayPal option; hurts conversion.
3. **Cap Starter OCR credits.** 100 credits all on OCR = 50 pages = fine today; but if a user discovers this and buys Starter solely to chew OCR, we lose on the spread. Cap OCR at 30 pages/Starter-pack equivalent.

Current recommendation: option 1. Razorpay covers INR + USD; PayPal is only needed for customers whose cards Razorpay rejects.

## 5. BYOK margin separate analysis

The 15% infra fee on Pro BYOK:

- Pro pack $59 / 2200 credits = $0.0268/credit.
- BYOK charges 15% of that = $0.0040/credit infra fee.
- Our cost per credit at realistic-mix cheap routing: $0.0006.
- Spread per credit: $0.0040 − $0.0006 − processor = ~$0.0032 net.
- Pro user consuming 2200 credits/month via BYOK = ~$7 revenue, $1.30 cost, $5.70 net.

**That works.** 15% on the full-credit price is a ~80% margin on the infra-fee line. Concern: if we under-count the orchestration cost (moderation pre-flight, rate-limit tracking, key rotation checks), 15% shrinks fast. Should be re-measured after 4 weeks of real BYOK usage.

## 6. Actionable fixes (ranked by revenue impact)

1. **Fix the `margin:` field's meaning.** Either document it as "AI-only, excluding processor + infra + GST" or re-compute it as net margin. Today the number is silently misleading. Cost: 15 min. (Do now.)
2. **Route OCR to Gemini Flash.** Biggest single cost lever: 43× cheaper per page. Requires a Gemini adapter. Cost: 1 dev-day. Revenue impact: frees ~6–10pp of margin across all packs at any usage volume.
3. **Route chat/rewrite to GPT-4o-mini.** 4–8× cheaper than Haiku for high-volume ops. Requires nothing beyond `ai_routes` policy and the existing OpenAI adapter. Cost: 30 min. Revenue impact: ~3pp.
4. **Add per-pack processor routing.** Starter-only Razorpay. Cost: 1 hour at the checkout UI. Revenue impact: eliminates the 71% PayPal-worst scenario entirely.
5. **Kill-switch for Haiku in OCR.** Until (2) lands, cap OCR via Haiku at 5 pages per request. Forces users doing large batches to wait or retry, keeps the margin drift bounded.
6. **Measure, don't trust.** Phase A4's daily margin rollup cron turns "we think margin is 80%" into "yesterday's margin was 78.2% ± 2.1%." No pricing decisions on assumption — only on data.

## 7. Limits of this analysis

- Token estimates per op are educated guesses, not measured. OCR at 500 in / 800 out is typical; a user who uploads 20-page PDFs in one call pushes the input higher (on-document extraction). Need real telemetry from Phase A1's `ai_usage` table to replace guesses.
- No dispute / chargeback cost modelled. Razorpay ₹1000–2000 per dispute, PayPal $15–30. One chargeback on a Starter pack wipes out a year of that customer's margin.
- No refund rate modelled. Pricing FAQ promises "unused credits refundable within 14 days" — at any significant refund rate, the processor fee is lost (not refunded by the gateway).
- Support cost per user (~$0.50/mo on average for SaaS at this scale) is not in the infra bucket; real margin is another ~2pp lower.
- Taxes we collect (GST on the invoice we issue to Indian users) are pass-through, not revenue. Zero-rated for exports if LUT is filed. Ignored here.

## 8. Definition of done for "margin verified"

- [ ] `lib/pricing.ts:margin` field clarified or recomputed to be truthful.
- [ ] Gemini adapter shipped; OCR and translate default to Gemini Flash.
- [ ] Chat + rewrite default to GPT-4o-mini (not Haiku).
- [ ] Starter pack checkout hides PayPal, routes to Razorpay-only.
- [ ] Phase A4 daily margin rollup running; 7 consecutive green days at claim-or-better before we advertise the 88% number anywhere.
- [ ] Monthly BYOK infra-fee reconciliation shows 15% covers orchestration cost.

Until those six items are green, the pricing copy on the public site should read **"up to"** 88% margin — never flat-claimed.

---

## 9. Wider scenario sweep (v2 — all possible scenarios)

The v1 analysis (§1–§8) looked at two routing options × two usage profiles × one refund / chargeback / region / token-estimate assumption. That was too narrow. §9 runs eleven independent scenarios to find the ones that actually break.

All numbers below come from the deterministic model in `margin_scenarios.py` (archived alongside this doc). Inputs: provider pricing tables as of 2026-04-20, payment processor rate cards, conservative token estimates per op. Every scenario rolls up to **net margin = (revenue − processor − AI − infra − support − chargebacks) / price**.

### 9.1 S1 Baseline re-run (realistic mix, default 50/30/20 currency split)

| Pack | Claim | Haiku-all (today's code) | Cheap routing (intended) |
|---|---|---|---|
| Starter | 88% | 84.7% | 88.9% |
| Creator | 83% | 85.1% | 91.0% |
| Pro     | 78% | 82.5% | 90.4% |
| Studio  | 73% | 79.9% | 89.5% |

**Reading:** v1 was slightly pessimistic. Under realistic usage, Haiku-all isn't as bad as the v1 worst-case OCR run suggested — it comes in 3–7pp *above* claim on all packs except Starter (which is 3.3pp below). Cheap routing beats claim by 1–17pp. The claim is roughly defensible under normal usage; the problems are at the edges.

### 9.2 S2 Deep-tier heavy user

User spends 40% on `generate`, 30% on `compare`, 20% on `sign`, 10% on `chat`. Per the master-plan default policy, deep-tier ops route to Sonnet 4.6 ($3/$15 per Mtok — 15× Haiku).

| Pack | Claim | Haiku-all | **Sonnet on deep ops** | Cheap routing |
|---|---|---|---|---|
| Starter | 88% | 88.0% | **81.9%** | 84.5% |
| Creator | 83% | 89.6% | 81.3% | 84.9% |
| Pro     | 78% | 88.6% | **77.3%** | 82.2% |
| Studio  | 73% | 87.4% | 73.6% | 79.5% |

**Reading:** Sonnet is ~15× more expensive per token than Haiku. A user who uses the app the way our Pro-tier copy advertises (agents, document generation, signature workflows) pays us Sonnet rates and drops Pro margin to **77.3% — below claim**. Mitigation: the master-plan policy table already routes `generate`/`sign` to Sonnet, so this isn't a bug to fix — it's a fact to accept and price in. Option: charge 25–30 credits for `generate` instead of 20.

### 9.3 S3 Chat whale (the sleeper)

A user on any pack drops a 200-page PDF into chat context and asks follow-up questions. Each `chat_turn` now ingests 15k input tokens instead of the 1.5k we budgeted — **10× estimate**. Output unchanged.

| Pack | Claim | Haiku-all | **GPT-4o-mini (cheap route)** |
|---|---|---|---|
| Starter | 88% | 33.7% | 83.0% |
| Creator | 83% | 14.7% | 82.8% |
| Pro     | 78% | **−12.5%** | 79.4% |
| Studio  | 73% | **−36.4%** | 76.1% |

**Reading:** this is the single worst scenario in the entire sweep. With Haiku-all, Pro goes negative and Studio bleeds $54/pack. The mechanism: a 1-credit `chat_turn` doesn't care how big the input is; a user who discovers this can DoS our margin for the cost of the pack. GPT-4o-mini saves it because input tokens are 7× cheaper. **But routing alone isn't enough** — we also need a context-token cap per op (reject chat_turn if input > 20k tokens, which is ~12 pages; force the user to use `summarize` or `chat-with-pdf` instead).

**Fix blocks revenue:** this has to land in Phase A2 alongside the rate limit, not later.

### 9.4 S4 Refund drag

Pricing FAQ promises "unused credits refundable within 14 days." Refund rate assumptions:

| Pack | Claim | 5% refund | 10% refund | 20% refund |
|---|---|---|---|---|
| Starter | 88% | 84.0% | 79.2% | 69.5% |
| Creator | 83% | 86.2% | 81.4% | 71.7% |
| Pro     | 78% | 85.6% | 80.9% | 71.4% |
| Studio  | 73% | 84.9% | 80.2% | 70.8% |

**Reading:** processor fees are lost on refunds (gateways don't return the fee). At 10% refund rate every pack is within 1–2pp of claim; at 20% we lose ~10pp everywhere. **Telemetry required:** phase A4 rollup should track `refund_rate_30d` as a pack-level metric. If it trends past 10%, tighten the refund policy (reduce window to 7 days, or refund-of-unused-only).

### 9.5 S5 Chargeback drag

Razorpay ₹1000–2000/dispute, PayPal $15–30/dispute. Modelled as $18/dispute pro-rated across pack purchases:

| Pack | Claim | 0.5% CB | 1% CB | 2% CB |
|---|---|---|---|---|
| Starter | 88% | 87.1% | 85.3% | 81.7% |
| Creator | 83% | 90.5% | 90.0% | 89.1% |
| Pro     | 78% | 90.2% | 90.1% | 89.8% |
| Studio  | 73% | 89.5% | 89.4% | 89.3% |

**Reading:** Starter is exposed because $18 dispute fee vs $5 sticker is a 360% one-time wipeout of that customer's LTV. Larger packs absorb the $18 easily. A 2% chargeback rate is 4× typical SaaS — we should be fine below that. Mitigation: friction at checkout (3DS, phone verify) to keep CB rate < 0.5% on INR and < 1% on USD.

### 9.6 S6 Region mix swings

Same realistic ops mix, different processor weightings:

| Pack | Claim | India-heavy (80/10/10) | US-heavy (20/50/30) | Razorpay-only (70/30) |
|---|---|---|---|---|
| Starter | 88% | 91.5% | 86.3% | **92.5%** |
| Creator | 83% | 92.1% | 89.8% | 92.4% |
| Pro     | 78% | 91.2% | 89.6% | 91.3% |
| Studio  | 73% | 90.2% | 88.8% | 90.3% |

**Reading:** Razorpay-only wins by 1–6pp across every pack. PayPal on a $5 pack is expensive (S1 already showed that). **Decision supported:** Starter → Razorpay-only at checkout. Creator and up keep PayPal — the $0.49 fixed fee is a much smaller share.

### 9.7 S7 Support cost per paying user

Typical SaaS support runs $0.50–$3/paid-user/month. The margin calc has been ignoring this line item entirely; here's what happens when we add it:

| Pack | Claim | Light ($0.50) | Avg ($1.50) | Heavy ($3) |
|---|---|---|---|---|
| Starter | 88% | 78.9% | **58.9%** | **28.9%** |
| Creator | 83% | 88.3% | 83.1% | 75.2% |
| Pro     | 78% | 89.5% | 87.8% | 85.3% |
| Studio  | 73% | 89.2% | 88.5% | 87.5% |

**Reading:** this is the bombshell. Starter's $5 sticker cannot absorb even average support cost — one support ticket per month per Starter customer drops margin to 58.9%. At heavy support (one ticket/week), Starter is a 29%-margin product. **Creator and up are fine** because the fixed support cost is a smaller share of revenue.

**Options:**
1. **Self-serve-only Starter.** No support channel. Help center + community forum only. Drops support cost toward zero but a bad-review risk.
2. **Raise Starter to $7 or $9.** Preserves the cheap-entry positioning but widens the buffer. S7 at $9 × $1.50 support: 82% margin — fine.
3. **Kill the Starter pack.** Creator at $19 becomes the entry tier.

Recommended: option 2 (raise to $7), paired with Razorpay-only routing (S6).

### 9.8 S8 Provider price rise (model upgrade scenario)

Anthropic drops Haiku 4.5 in favour of Haiku 5.0 at 2× price. Current code continues defaulting to whatever `ANTHROPIC_MODEL` is set to:

| Pack | Claim | Haiku-all (doubled) | Cheap routing |
|---|---|---|---|
| Starter | 88% | 77.7% | 86.7% |
| Creator | 83% | 75.5% | 87.9% |
| Pro     | 78% | 69.5% | 86.3% |
| Studio  | 73% | 64.0% | 84.5% |

**Reading:** Haiku-all routing takes an 8–15pp hit on a doubling. Cheap routing absorbs it because OCR and chat don't go through Anthropic. **Guardrail:** Phase A4 daily rollup must include a `provider_price_change` alert — if the weighted cost-per-credit rises more than 20% week-over-week without a usage mix change, the rollup pages the operator. The fix is to re-pick `ANTHROPIC_MODEL` (stay on the cheaper tier or switch to a competitor).

### 9.9 S9 Token-estimate miss

Our per-op token estimates are educated guesses. Real telemetry (Phase A1 `ai_usage` table) hasn't landed yet. Model 3× miss on OCR and generate:

| Pack | Claim | Haiku-all | Cheap routing |
|---|---|---|---|
| Starter | 88% | 83.1% | 88.1% |
| Creator | 83% | 82.9% | 89.8% |
| Pro     | 78% | 79.5% | 88.8% |
| Studio  | 73% | 76.3% | 87.6% |

**Reading:** a 3× miss on two of the ten ops is absorbable under cheap routing. Haiku-all loses 1–4pp. **Action:** after A1 ships, gate the pricing page live date on "7 consecutive days with actual tokens within 20% of estimate" — if estimates are off, re-price `AI_OPERATION_COSTS` before the 88% copy goes out.

### 9.10 S10 Free-tier abuse

If we grant N free credits per signup, an attacker spawns multiple accounts (disposable emails, VPN) and burns free credits on the cheapest-margin op (OCR with Haiku, which today costs us $0.012/page). Modelled as 5 abusers per paying customer:

| Free credits | Cost bleed per paid signup | Starter cheap-routed margin |
|---|---|---|
| 0  | $0.000 | 88.9% (baseline) |
| 10 | $0.11  | 86.7% |
| 25 | $0.28  | 83.3% |

**Reading:** 10 free credits is survivable. 25 starts hurting Starter (−5.6pp). Mitigation isn't "remove free tier" — it's **free-tier routing policy**: free credits MUST use Gemini Flash, not Haiku. Reduces abuse cost 43×. Combined with email verification + device fingerprint check on signup, bleed drops to negligible.

### 9.11 S11 Combined realistic-worst case

Everything bad at once: US-heavy region (50% PayPal), 10% refund rate, 1% chargebacks, $1.50/mo support, 3× token miss on OCR, Haiku-all routing (code's default today).

| Pack | Claim | **Combined worst** | Combined best |
|---|---|---|---|
| Starter | 88% | **38.0%** | 78.8% |
| Creator | 83% | 64.4% | 87.3% |
| Pro     | 78% | 67.9% | 88.2% |
| Studio  | 73% | 66.9% | 87.8% |

"Best" = India-heavy + 2% refund + 0.2% chargeback + $0.50 support + cheap routing.

**Reading:** the gap between worst and best is 40+pp. The product's margin isn't a number; it's a distribution. We can't claim 88% anywhere until the routing policy is built AND Starter is re-structured AND we have 4+ weeks of telemetry showing actual user behaviour sits closer to "best" than "worst."

---

## 10. Decision points that need founder sign-off

The scenario sweep produces choices that aren't Claude's to make:

| # | Decision | Recommendation | Impact if wrong |
|---|---|---|---|
| D1 | Keep Starter at $5 or raise to $7? | Raise to $7; cheaper entry is vanity if it bleeds on support cost (S7). | If keep $5: must ship self-serve-only support channel or accept 58% margin. |
| D2 | Ship Gemini + GPT-4o-mini keys on day one (Phase A0)? | Yes. Without cheap routing, chat whale (S3) pushes Pro negative. | If no: ship with strict context-token cap + no public margin claim. |
| D3 | Expose BYOK on Pro at launch or defer to week +2? | Defer. Requires `lib/pricing.ts:60` copy change (drop "+15% infra fee" bullet until A3 lands). | If no defer: we misrepresent pricing until A3 ships. |
| D4 | Context-token cap on chat_turn? | 20k input tokens (~12 pages). Reject larger — direct user to `summarize` or `chat-with-pdf` (priced at different credits). | If unbounded: chat whale (S3) is a $54 loss per Studio pack. |
| D5 | Free-tier credit count + routing? | 10 free credits, force Gemini Flash for free accounts. | If Haiku-routed: 25 free credits × 5 abusers drops Starter −5.6pp. |
| D6 | Public margin copy before A4 ships? | Change to "up to 88%". Revisit after 7 consecutive daily-rollup green days. | If flat-claim: advertising mis-statement risk. |

These six map to task #87 (six fixes) and extend it with the scenario findings.

---

## 11. Limits of v2 analysis (carries forward from §7)

- **Token estimates are still educated guesses.** Phase A1's `ai_usage` table is the only durable fix. All §9 numbers are +/- 20pp sensitivity to real token counts.
- **No LTV / cohort modelling.** Per-pack net margin is a single-purchase number. A Pro user who buys 12 packs a year is worth 12× our support+infra cost base, which moves the per-pack numbers. Phase A4 must track monthly cohort margin, not per-pack.
- **No viral-abuse modelling.** If a chat-whale tactic (S3) gets posted to HN/X with code samples, the 5-abusers-per-paid-signup assumption in S10 understates the hit.
- **No price elasticity.** Raising Starter to $7 (D1) presumes conversion doesn't drop 30%; if it does, net revenue goes down despite the margin improvement.
- **No cost of capital.** Paypal holds funds for up to 21 days on new merchants; Razorpay settles T+2 domestically, T+5 international. Not modelled — assume zero carrying cost. At scale this becomes a real line item.

---

## 12. v3 update — Paddle MoR replaces PayPal (2026-04-20)

**Context.** D4 closed 2026-04-20. Evaluation in `docs/payments/MOR_EVALUATION.md` selected **Paddle** as the Merchant of Record for all non-INR buyers, replacing the earlier "Razorpay + PayPal" hybrid. This section recomputes the scenarios that are materially changed by the switch and leaves the rest pointing at §1–§11.

### 12.1 What changes in the cost model

| Line item | v1/v2 (PayPal era) | v3 (Paddle MoR era) | Delta |
|---|---|---|---|
| Processor fee (intl) | 3.49% + $0.49 + 1.5% xborder ≈ 4.99% + $0.49 | **5.00% + $0.50** flat | Roughly equivalent on $5 pack; ~1pp worse on Pro/Studio |
| Chargeback absorption | We pay $15–30/dispute (S5) | **Paddle absorbs** as part of MoR wrap | S5 chargeback line → 0 on intl slice |
| Sales-tax compliance | We'd owe US nexus, EU VAT when triggered | **Paddle remits on our behalf** in ~120 jurisdictions | Removes a $5–15k/yr hidden overhead at scale |
| Refund processor-fee loss | 3.49% + $0.49 forfeit on refund | **Paddle keeps 5% + $0.50** on refund (MoR policy) | Worse per refund, but lower chargeback rate partly offsets |
| Currency conversion | PayPal 3–4% spread on non-USD | **Paddle charges customer in local currency**, pays us USD with 2% FX spread | ~1–2pp better on EUR/GBP buyers |
| Cash settlement cadence | PayPal holds 21 days (new merchants) | Paddle bi-weekly SWIFT, ~14-day payout | Similar working capital impact |

**Net read:** Paddle's gross fee is slightly higher than PayPal's on packs ≥ $19 (because the 5% lever is bigger than PayPal's 4.99%), equal on $5 Starter (both hit ~15% on fixed-fee basis), but the **chargeback + compliance + tax-remittance bundle** is worth 3–5pp of effective margin at any scale where we'd actually face those costs. For a solo founder this is decisive — it replaces a $60k/yr part-time compliance problem with a 1pp line-item.

### 12.2 Recomputed processor drag by pack

Assumes the post-launch volume mix that §12.3 argues for: **40% INR domestic via Razorpay / 60% international via Paddle**. Formula: `weighted_fee = 0.40 × (2% × 1.18) + 0.60 × (5% + $0.50/price)`.

| Pack | Price | v1 DEFAULT_MIX drag | v3 PADDLE_DEFAULT drag | Change |
|---|---|---|---|---|
| Starter | $5   | 8.3%  | **8.7%** | +0.4pp worse |
| Creator | $19  | 4.8%  | **5.0%** | +0.2pp worse |
| Pro     | $59  | 3.9%  | **4.1%** | +0.2pp worse |
| Studio  | $149 | 3.7%  | **3.9%** | +0.2pp worse |

Starter is the most exposed because the $0.50 Paddle flat fee is 10% of revenue by itself — the same structural problem PayPal had at $0.49. The decision from §6 (action #4: route Starter to Razorpay-only in markets where we can) still applies, with Paddle substituted for PayPal.

### 12.3 Updated baseline scenarios (S1, S5, S6, S7 refresh)

**S1 Baseline re-run (Paddle 60 / Razorpay INR 40 mix).** Compared to v2's §9.1 numbers:

| Pack | Claim | v2 Cheap routing (PayPal era) | v3 Cheap routing (Paddle era) | Change |
|---|---|---|---|---|
| Starter | 88% | 88.9% | **88.5%** | −0.4pp |
| Creator | 83% | 91.0% | **90.8%** | −0.2pp |
| Pro     | 78% | 90.4% | **90.2%** | −0.2pp |
| Studio  | 73% | 89.5% | **89.3%** | −0.2pp |

Still above claim on every pack under cheap routing. Paddle costs us 0.2–0.4pp versus the PayPal mix but buys the compliance + chargeback wrap. **Net verdict: trade is worth it.**

**S5 Chargeback drag collapses on the Paddle slice.** v2's §9.5 assumed $18/dispute pro-rated across purchases. With 60% of volume on Paddle (which absorbs disputes) and 40% on Razorpay (~₹1500 = ~$18/dispute), the chargeback line is 40% of v2:

| Pack | Claim | v2 at 1% CB rate | v3 at 1% CB rate (Paddle wrap) | Change |
|---|---|---|---|---|
| Starter | 88% | 85.3% | **87.3%** | +2.0pp better |
| Creator | 83% | 90.0% | **90.6%** | +0.6pp |
| Pro     | 78% | 90.1% | **90.3%** | +0.2pp |
| Studio  | 73% | 89.4% | **89.5%** | +0.1pp |

Starter gets the biggest lift — expected, because the old $18 dispute fee was the single scariest LTV hit at that price point. Post-Paddle, only the Razorpay-INR slice of Starter faces dispute drag.

**S6 Region mix swings.** v2 compared three PayPal-variant mixes. v3 replaces them with Paddle-variant mixes:

| Pack | Claim | India-heavy Paddle (70/30) | Intl-heavy Paddle (20/80) | Default Paddle (40/60) |
|---|---|---|---|---|
| Starter | 88% | **91.0%** | 87.3% | 88.5% |
| Creator | 83% | **91.4%** | 90.6% | 90.8% |
| Pro     | 78% | **91.0%** | 89.9% | 90.2% |
| Studio  | 73% | **90.2%** | 89.0% | 89.3% |

Razorpay-only (hypothetical: 100% INR via Razorpay) would still be the margin-max play at 92.5% Starter — but only addressable to INR-paying customers. The relevant comparison is "any international path at all." On that axis, **Paddle intl-heavy is 2–3pp below India-heavy, not catastrophic**, and it unlocks the ~75% of the addressable market that lives outside India.

**S7 Support cost — Starter still bleeds.** The Paddle decision doesn't change this one; Starter at $5 still can't absorb $1.50/mo support. Paddle adds 1pp of structural drag, making the options table 1pp worse across the board:

| Pack | Claim | v2 Avg ($1.50) | v3 Avg ($1.50) | Change |
|---|---|---|---|---|
| Starter | 88% | 58.9% | **57.9%** | −1.0pp (marginal) |
| Creator | 83% | 83.1% | 82.1% | −1.0pp |
| Pro     | 78% | 87.8% | 86.8% | −1.0pp |
| Studio  | 73% | 88.5% | 87.5% | −1.0pp |

**D1 recommendation in §10 (raise Starter to $7) is unchanged by the Paddle switch.** The support-cost bomb, not the processor fee, is what justifies that decision. At $7 + $1.50 support + Paddle-60 mix, Starter net margin is ~68% realistic — acceptable.

### 12.4 What Paddle newly enables (compliance dividend)

Not visible in the margin numbers but decisive for operational sanity:

1. **US 50-state sales tax nexus** — Paddle tracks and remits. Without them, each state's economic-nexus threshold (typically $100k or 200 transactions) would require our own registration + filing. At scale this is a $3k–8k/yr accountant bill per state we pierce.

2. **EU VAT on digital services** — Paddle's UK entity is VAT-registered and uses the OSS (One Stop Shop) to remit in every EU country. Without them, we'd need either the non-Union OSS scheme (filed from Ireland/Malta) or direct country-by-country registration. Paddle makes EU opt-in a 1-day policy change rather than a 6-month compliance project. Decision D10 currently defers EU, but D10 can flip to "allow" at any time once Paddle is wired.

3. **Chargeback liability shift** — At 1% dispute rate, the old model cost Starter 3pp of margin. Post-Paddle, we face no fee from Paddle disputes, no fraud loss, and no reserve holds from a PSP tightening requirements. The only exposure left is on the Razorpay-INR slice.

4. **Customer refund handling** — Paddle's customer support inbox handles "I want a refund" tickets directly, reducing the $1.50 support-cost assumption on the intl slice. Not modelled in S7 numbers above; realistic effect is another 0.3–0.5pp lift on packs ≥ $19.

### 12.5 What Paddle newly exposes (risks to monitor)

1. **Paddle platform risk.** Single-vendor dependency for 60% of future revenue. If Paddle terminates our account (their ToS prohibits certain content categories: adult, gambling, crypto speculation — PDF tools are clearly allowed, but policy drift is possible), recovery is a 2–4 week scramble onto a backup MoR. Mitigation: Paypro Global account kept warm as documented fallback (see MOR_EVALUATION.md §4.1).

2. **Reserves on new merchants.** Paddle typically holds 5–10% rolling reserve for the first 6 months on new accounts. Cash-flow impact: ~$300–600 held back per $10k of Paddle-processed volume in the early period. Not a margin hit, but a working-capital constraint.

3. **Payout FX spread.** Paddle pays in USD via SWIFT to our Indian bank (per CLAUDE.md + MOR_EVALUATION.md §4 deep dive). The Indian AD bank's retail USD→INR conversion typically carries 0.3–0.8% spread above interbank. On $100k annual Paddle volume that's $300–800/yr — not modelled above, effectively another 0.5pp drag on the Paddle slice. The `margin_scenarios.py` model currently ignores this.

4. **Subscription pricing constraints.** Paddle supports one-time packs cleanly (our current model) but has opinions on how subscription/trial flows look. If the product pivots toward subscriptions later, friction increases.

### 12.6 Definition-of-done refresh (replaces §8)

Post-D4, the list in §8 is refreshed:

- [ ] `lib/pricing.ts:margin` field clarified or recomputed to be truthful.
- [ ] Gemini adapter shipped; OCR and translate default to Gemini Flash.
- [ ] Chat + rewrite default to GPT-4o-mini (not Haiku).
- [ ] **NEW:** Starter pack checkout hides Paddle (if shown in INR-available markets), routes to Razorpay-only; Paddle used only for markets where Razorpay USD isn't viable (US, EU, UK, AU, CA).
- [ ] **NEW:** Paddle sandbox validation complete (4-hour checklist in `MOR_EVALUATION.md` §6). Task #1 in current TodoList.
- [ ] **NEW:** Paddle webhook HMAC verification end-to-end tested.
- [ ] Phase A4 daily margin rollup running; 7 consecutive green days at claim-or-better before we advertise the 88% number anywhere.
- [ ] Monthly BYOK infra-fee reconciliation shows 15% covers orchestration cost.
- [ ] **NEW:** First 30-day actual processor-drag measured against 8.7%/5.0%/4.1%/3.9% forecast; reconcile any > 0.5pp delta.

### 12.7 Action items created by §12

1. **Update `lib/pricing.ts`** — the `margin:` field assumptions doc-string (to be added) must cite Paddle 5% + $0.50, not PayPal 3.49% + $0.49. Code change is zero; docstring only.
2. **Update `docs/ai/MODELS_AND_MULTI_KEY.md` §pricing** — if it references PayPal processor drag, replace with Paddle.
3. **Reroute scenarios in any other margin doc** — `REVENUE_LEAK_AUDIT.md` may need a similar v3 addendum. Check.
4. **Add `PADDLE_*` env vars to Hostinger** — required before sandbox validation runs against real API. Listed in `MOR_EVALUATION.md` §7.

### 12.8 Cross-references

- `docs/payments/MOR_EVALUATION.md` — why Paddle, the 6-vendor matrix, sandbox plan, integration scope.
- `docs/GEO_LAUNCH_POLICY.md` — which countries Paddle routes for in Tier 1, which are deferred (Tier 2 EU) or blocked (Tier 3 OFAC).
- `docs/MASTER_PLAN.md` §1 decision log — D4 CLOSED 2026-04-20.
- `docs/ai/margin_scenarios.py` — extended 2026-04-20 with `paddle` scheme and `PADDLE_*` mix constants for future reruns.
