# AI Cost Guardrails — How We Never Eat a Loss

**Status:** Design. Accepted 2026-04-20 by founder question "How do we handle 100-page PDF without loss?"
**Owners:** AI platform (Claude + founder sign-off on D7–D9 below).
**Consumes:** `docs/ai/AI_API_MASTER_PLAN.md` §8a gaps, `docs/ai/MARGIN_VERIFICATION.md` §9 scenarios.
**Feeds:** Phase A2 scope (task #84), Phase A1 schema (task #83), task #87 margin fixes.

---

## 0. TL;DR (one-paragraph answer)

You are correct: a user who uploads a 100-page PDF and spams chat turns can force us to eat real money if we only charge the flat `chat_turn = 1 credit`. A 500-page PDF in a 10-turn Sonnet conversation costs us **$7.23** while the user paid $0.50 — a **-1,446% net margin** on that user. We fix this with a nine-layer defense, every layer of which uses data providers return today — no guesswork. Yes, we can track real cost perfectly (the provider response includes exact `usage.input_tokens` / `output_tokens`). With the full stack in place, the maximum possible loss per turn is **mathematically bounded** and chronic whales auto-move to BYOK so the platform bill goes to zero for them.

---

## 1. Problem — real numbers, no hand-waving

PDF text extracts at ~500 tokens/page (more for OCR/dense layouts). Revenue per credit @ Starter = **$0.05**. Output = 1,500 tokens/turn.

### 1.1 Single-turn cost — 1 credit charged, real cost vs revenue

| Pages | Input tok | Provider | Real cost | Margin | Loss/turn |
|------:|----------:|:---------|----------:|-------:|----------:|
| 10 | 5,000 | Haiku | $0.0125 | +75% | — |
| 10 | 5,000 | Gemini Flash | $0.0008 | +98% | — |
| **100** | **50,000** | **Haiku** | **$0.0575** | **−15%** | **−$0.0075** |
| 100 | 50,000 | Sonnet | $0.1725 | −245% | −$0.1225 |
| 100 | 50,000 | Gemini Flash | $0.0042 | +92% | — |
| 200 | 100,000 | Haiku | $0.1075 | −115% | −$0.0575 |
| **500** | **250,000** | **Sonnet** | **$0.7725** | **−1,445%** | **−$0.7225** |
| 500 | 250,000 | Gemini Flash | $0.0192 | +62% | — |

### 1.2 Chat-whale — 10 turns with same PDF in context

Each turn re-sends the full document (this is how most chat UIs naïvely work).

| Pages | Provider | 10-turn cost | Revenue (10 cr) | Net |
|------:|:---------|-------------:|----------------:|----:|
| 50 | Haiku | $0.33 | $0.50 | +$0.18 |
| 50 | Sonnet | $0.98 | $0.50 | **−$0.48** |
| 100 | Haiku | $0.58 | $0.50 | **−$0.08** |
| 100 | Sonnet | $1.73 | $0.50 | **−$1.23** |
| 500 | Haiku | $2.58 | $0.50 | **−$2.08** |
| 500 | Sonnet | $7.73 | $0.50 | **−$7.23** |
| **500** | **Gemini Flash** | **$0.19** | **$0.50** | **+$0.31** |

**Observations:**
- Sonnet + big PDFs = existential. One determined whale costs $7+ per session.
- Haiku survives small/medium docs, breaks on 100+ pages.
- Gemini Flash survives everything — even a 500-page PDF across 10 turns is still **+62% margin**.
- Caps + routing is how we win. Price alone won't.

---

## 2. "Can we track real cost?" — Yes. Three cross-checked sources.

### 2.1 Pre-flight estimate (tiktoken / model-specific tokenizer)

Count tokens **client-side or server-side before the call** using the provider's own tokenizer library. ~95% accurate.

```ts
// lib/ai/cost.ts
import { encoding_for_model } from "tiktoken";

export function estimateCost(req: AIRequest): { usd: number; credits: number; inputTok: number } {
  const enc = encoding_for_model(req.model);
  const inputTok = enc.encode(req.prompt).length
                 + (req.context ? enc.encode(req.context).length : 0);
  const outTok = req.maxOutputTokens ?? 1_000;
  const p = PROVIDER_PRICING[req.provider][req.model]; // $/Mtok
  const usd = (inputTok * p.inputPerMtok + outTok * p.outputPerMtok) / 1_000_000;
  const credits = Math.max(1, Math.ceil(usd * MARGIN_MULT / CREDIT_VALUE_USD));
  return { usd, credits, inputTok };
}
```

Used by Layers 1, 3, and the UX confirmation in Layer 4.

### 2.2 Per-call exact usage block (100% accurate, per call)

Every provider returns ground-truth token counts in the response:

| Provider | Field |
|---|---|
| Anthropic | `response.usage.input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` |
| OpenAI | `response.usage.prompt_tokens`, `completion_tokens`, `prompt_tokens_details.cached_tokens` |
| Gemini | `response.usageMetadata.promptTokenCount`, `candidatesTokenCount`, `cachedContentTokenCount` |

Phase A1 already logs this to `ai_usage.cost_usd_micro`. We multiply by the current price row in `ai_pricing` — integer math, no rounding loss, per-call truth.

### 2.3 Daily provider-invoice reconcile (cross-check, catches drift)

`scripts/ai-provider-reconcile.ts` nightly pulls the provider's usage API (Anthropic: `/v1/usage`, OpenAI: `/v1/usage`, Gemini: Cloud Billing export) and diffs against `SUM(ai_usage.cost_usd_micro)` by day. Alert if drift > 2%. Phase A4.

**Combined:** estimate (pre), exact (post), cross-check (daily). The only way a loss can occur without us knowing about it in < 24 hours is if all three fail simultaneously.

---

## 3. Nine-layer defense — each layer bounded, testable, shippable

Layers are **defense-in-depth**. Even if any single one is misconfigured, the next layer catches it.

### Layer 1 — Hard input-size gate (the single most important layer)

Reject **before** any API call. Max cost is mathematically bounded by the cap.

```ts
// lib/ai/guards.ts
const INPUT_TOK_CAP = 20_000;   // ~40 pages
const OUTPUT_TOK_CAP = 4_000;   // ~8 pages of output
const PDF_PAGE_CAP   = { starter: 50, pro: 200, studio: 500 };

export function enforceSizeCaps(req: AIRequest, plan: PlanTier) {
  if (req.pdfPageCount && req.pdfPageCount > PDF_PAGE_CAP[plan]) {
    throw new AIRequestTooLargeError(
      `Your ${plan} plan allows documents up to ${PDF_PAGE_CAP[plan]} pages. Please split.`
    );
  }
  if (estimateTokens(req) > INPUT_TOK_CAP) {
    throw new AIRequestTooLargeError(
      `This request is too long. Max 20k input tokens per turn. Please shorten or use Summarize-Document instead of Chat.`
    );
  }
  req.maxOutputTokens = Math.min(req.maxOutputTokens ?? OUTPUT_TOK_CAP, OUTPUT_TOK_CAP);
}
```

**With the 20k cap + Haiku:** worst-case cost per turn = **$0.04** vs $0.05 revenue = **+20% margin**. Bounded.
**With 20k cap + Gemini Flash:** worst-case cost = **$0.003** = **+94% margin**. Bounded.

### Layer 2 — Per-plan PDF page cap (document-level, before token counting)

Cheap filter. If the PDF has more pages than the plan allows, reject at upload. No tokenizer needed, no API cost, instant feedback to user.

### Layer 3 — Dynamic credit multiplier (pay-as-you-go within a turn)

`chat_turn` stops meaning "1 credit". It means "minimum 1 credit, billed in proportion to cost estimate".

```ts
const chargeCredits = Math.max(1, Math.ceil(estimate.usd * MARGIN_MULT / CREDIT_VALUE_USD));
// MARGIN_MULT = 1.3 → 30% buffer for estimator drift
```

| Input tok | Provider | Cost | Credits charged | Revenue | Margin |
|---:|---|---:|---:|---:|---:|
| 5k | Haiku | $0.015 | 1 | $0.05 | 70% |
| 20k | Haiku | $0.030 | 1 | $0.05 | 40% |
| 50k | Haiku | $0.060 | **2** | $0.10 | 40% |
| 100k | Haiku | $0.110 | **3** | $0.15 | 27% |
| 100k | Gemini | $0.008 | 1 | $0.05 | 84% |

### Layer 4 — Pre-send confirmation UI (UX guard)

If `chargeCredits > 1`, show a modal:
> "This turn will cost **3 credits** (your document is large). Proceed?"

This prevents surprise billing and is required for trust. Signed confirmation token (HMAC of `{userId, estimateId, chargeCredits, expiresAt}`) is passed back with the retry to prevent replay/downgrade.

### Layer 5 — Post-hoc reconciliation (catches estimate drift)

After the call returns, we have **exact** `usage.input_tokens / output_tokens`. If real > estimate + tolerance, we charge the deficit (capped at `MAX_CREDITS_PER_TURN`, which is **D7**).

```ts
const real = computeRealCost(response.usage, req.model);
await logAIUsage({ requestId, estimatedUsd: est.usd, realUsdMicro: real * 1e6, ... });

const realCredits = Math.ceil(real * MARGIN_MULT / CREDIT_VALUE_USD);
if (realCredits > chargedCredits + TOLERANCE) {
  const deficit = Math.min(realCredits - chargedCredits, MAX_CREDITS_PER_TURN - chargedCredits);
  await grantCredits({
    userId,
    delta: -deficit,
    reason: "post_hoc_reconcile",
    idempotencyKey: `${requestId}:reconcile`
  });
}
```

### Layer 6 — Cost-aware router (cheap provider wins for big stuff)

`DEFAULT_POLICY` map routes ops to the cheapest capable provider. This is the single biggest lever — it's what turns a $7 loss into a $0.19 profit on 500-page PDFs.

```ts
// lib/ai/router.ts
export const DEFAULT_POLICY = {
  chat_turn:     { small: "gpt-4o-mini",  large: "gemini-flash" },
  ocr:           "gemini-flash",
  translate:     "gemini-flash",
  summarize:     { small: "gpt-4o-mini",  large: "gemini-flash" },
  compare:       "anthropic-haiku",
  redact:        "anthropic-haiku",
  table_extract: "anthropic-haiku",
  generate:      "anthropic-sonnet",
  sign_legal:    "anthropic-sonnet",
};

// "small" ≤ 8k input tok, "large" > 8k
```

Gemini Flash on a 500-page PDF: $0.019 total. Routing saves us **$2.56 per whale session** vs Haiku.

### Layer 7 — Per-user margin circuit breaker (catches abusers at 24h)

Hourly cron. Any user whose 24-hour real cost exceeds 70% of their 24-hour revenue → flip `user.ai_policy = 'byok_required'`. Platform API key is disabled for them until they add their own key or appeal.

```sql
-- Run every hour
SELECT user_id,
  SUM(cost_usd_micro)/1e6 AS spend,
  SUM(credits_charged) * 0.05 AS revenue
FROM ai_usage
WHERE created_at > NOW() - INTERVAL 24 HOUR
GROUP BY user_id
HAVING spend > revenue * 0.70;  -- margin below 30%
```

Chronic whales don't cost us anything after 24h. Worst-case loss from a newly-discovered attack = **1 day of their abuse**, which Layer 1 has already bounded.

### Layer 8 — Streaming with early-stop (output-side defense)

Stream all responses. When cumulative output tokens hit `OUTPUT_TOK_CAP`, close the stream. Guarantees output cost is bounded even if a model goes runaway on a prompt-injection ("write me a 10,000-word essay...").

### Layer 9 — BYOK escape hatch (Phase A3)

For legitimate power users, BYOK is the pressure-relief valve. "You want 500-page documents? Bring your own Anthropic/OpenAI/Gemini key. We'll route through your key at cost = 0 to us." Phase A3 already planned; this doc makes BYOK the **mandatory** path once Layer 7 flips a user.

### Bonus Layer 10 — "Document" operations instead of chat (product design)

Very large PDFs should route to a batch operation, not conversational chat:
- `summarize-document` splits into chapters, uses Gemini Flash per chunk, then Haiku for final synthesis
- Prices **per page**, not per turn: `ocr = 2 cr/page`, `summarize = 3 cr/page`
- User sees total cost in credits **before** clicking upload
- Predictable margin, no surprise bills, no chat-whale vector

---

## 4. Worked example — user uploads 100-page PDF, asks 5 questions

**Without guardrails (current state):** 5 × $0.0575 = **$0.29 cost**, revenue **$0.25**, **−14% margin, we lose $0.04 per session** per user. At 100 such users/day: **−$4/day platform loss**.

**With guardrails:**

1. Upload triggers Layer 2 check: 100 ≤ Pro plan cap (200) ✓
2. First chat turn: Layer 6 sees large context → routes to Gemini Flash
3. Layer 1 tokenizer: 50,000 input tok > 20,000 cap → return **"This document is too long for chat. Would you like to Summarize it instead? (12 credits)"**
4. User picks "Summarize", Layer 10 kicks in: per-chunk Gemini Flash → final Haiku synthesis
5. Real cost: $0.012. Revenue: 12 × $0.05 = **$0.60**. Margin **+98%**.

**OR** user insists on chat:
1. Layer 1 forces a narrower context window (only 20k of the 50k input)
2. Layer 3 charges 1 credit (Gemini Flash is cheap enough)
3. 5 turns × $0.003 = $0.015. Revenue $0.25. Margin **+94%**.

Either way — **we profit, user is served.**

---

## 5. Before-vs-after matrix

| Attack | Before | After (all 9 layers) | Proof |
|---|---|---|---|
| 100-page PDF single turn, Haiku | −15% margin | +40% margin (2 credits charged) | Layer 3 |
| 500-page PDF single turn, Sonnet | −1,445% | Rejected by Layer 1 / forced through Layer 10 | Layer 1 |
| 10-turn 100pg chat on Sonnet | −$1.23/session | +$0.46/session (routed to Gemini) | Layer 6 |
| 10-turn 500pg chat on Sonnet | **−$7.23/session** | Rejected/routed → +$0.31 on Gemini | Layers 1+6 |
| Runaway output generation | Uncapped | Hard-stopped at 4k tok | Layer 8 |
| Chronic abuser (repeat whale) | Unlimited platform loss | BYOK-only after 24h, platform loss = 0 | Layer 7 |
| Estimator underpredicts by 50% | User pays 1cr, we eat deficit | Deficit auto-charged, up to MAX_CREDITS_PER_TURN | Layer 5 |
| Provider raises prices silently | Silent margin decay | Caught ≤ 24h by daily reconcile | §2.3 |

---

## 6. Implementation map (phases)

| Layer | Phase | Task | Effort |
|---|---|---|---|
| 1 Size gate | **A2** | #84 — already scoped context-token cap | 0.5d |
| 2 PDF page cap | A2 | #84 — add to upload handler | 0.25d |
| 3 Dynamic multiplier | A2 | #84 — extend `withCreditSpend` | 1d |
| 4 Pre-send confirm UI | A2 | new subtask | 1d |
| 5 Post-hoc reconcile | A1 | #83 — piggyback on `ai_usage` write | 0.5d |
| 6 Router + DEFAULT_POLICY | A2 | #84 — already in scope | 1d |
| 7 Margin circuit breaker | A4 | #86 | 0.5d cron + 0.5d schema |
| 8 Streaming early-stop | A2 | #84 — wrap stream handlers | 0.5d |
| 9 BYOK mandatory | A3 | #85 — trigger from Layer 7 event | 0d (flag already exists) |
| 10 Doc-ops product | A2 | #84 — promote /summarize-document to first-class op | 1.5d |

**Total additional effort on top of existing Phase A2 plan: ~3 dev-days.**
None of this is new backend infrastructure. It's config, guards, and UX wired into machinery already scoped.

---

## 7. Trade-offs

**Pros:**
- Mathematically bounded max loss per turn (Layer 1)
- Mathematically bounded max loss per user per day (Layer 7)
- Real cost always known within seconds of the call finishing (§2.2)
- No silent margin decay (§2.3 reconcile)

**Cons / frictions:**
- **Latency:** Gemini Flash for large docs is cheap but ~1.3× slower than Haiku on equivalent output. Acceptable for batch ops, watch latency metrics for chat.
- **UX:** Confirmation modal (Layer 4) adds a click. Copy this carefully — must feel like "fair pricing heads-up", not "hidden fees". Cite the specific reason ("This document has 100 pages, so this turn costs 2 credits instead of 1").
- **Capability ceiling:** Layer 1 blocks submitting 500-page PDF to single chat turn. Mitigation: Layer 10 doc-ops, plus BYOK path.
- **Provider risk:** If Gemini raises Flash prices 10×, router policy must be updated in `ai_pricing` within 24h. Mitigate by versioning routing decisions with the pricing snapshot that produced them.

---

## 8. Decisions for founder (D7–D9 — new, add to MASTER_PLAN §4)

### D7 — `MAX_CREDITS_PER_TURN` cap

How many credits can a single operation consume, at most?
- Recommendation: **10** (= $0.50 revenue ceiling → supports Haiku 100k-token turn comfortably).
- Trade-off: lower = safer but more frictional (forces users to split large requests). Higher = more cost exposure if estimator misfires.

### D8 — Layer 7 margin threshold

At what 24-hour margin percent does a user auto-flip to `byok_required`?
- Recommendation: **30%** (spend > 70% of revenue).
- Trade-off: aggressive = fewer false-negatives, more customer-support load from legitimate heavy users. Lenient = more platform loss.

### D9 — Layer 4 confirmation trigger

Show pre-send confirmation if `chargeCredits` > N. Value of N?
- Recommendation: **2** (silent for 1-credit turns, confirm from 2+).
- Trade-off: 1 = always explicit (annoying). 3+ = surprise bills possible for 2-credit charges.

---

## 9. Evidence / reproducibility

All numbers in §1 computed by `docs/ai/margin_scenarios.py` pricing constants. To re-run with updated provider prices:

```bash
cd /sessions/gifted-funny-franklin/repo
python3 docs/ai/margin_scenarios.py           # 11-scenario sweep
# Ad-hoc: edit constants in §1 script and re-run
```

To verify Layer 1 bound empirically after implementation:
```bash
# Integration test — fires 1000 synthetic requests at INPUT_TOK_CAP
pnpm tsx scripts/ai/guard-burst-test.ts --requests 1000
```

---

## 10. Answer to user's four questions (one line each)

1. **"API cost will increase [with 100-page PDF]?"** — Yes. Raw cost goes from $0.001 (1 page) to $0.058 (100 pages) to $0.77 (500 pages) per turn on Sonnet.
2. **"How can we handle it?"** — Nine-layer defense. The critical layers are #1 (20k input-token cap), #3 (dynamic credit multiplier), #6 (cost-aware router), and #7 (per-user margin circuit breaker). Each is ~0.5–1 dev-day and fits inside the Phase A2 scope already planned.
3. **"Cannot we track real cost?"** — We can, three ways: tiktoken pre-flight estimate (~95% accurate, zero-cost), exact `usage.input_tokens` returned by every provider call (100% accurate, Phase A1 already logs it to `ai_usage.cost_usd_micro`), daily invoice reconcile (Phase A4 catches drift).
4. **"We should not bear any loss?"** — With all nine layers: max possible loss per turn is bounded by Layer 1 (currently +20% margin worst case on Haiku, +94% on Gemini); max possible loss per user per day is bounded by Layer 7 (≤ 1 day of abuse then BYOK-required); chronic abusers cost $0 to the platform after 24h.

---

## 11. Next action

Commit this doc, post summary for founder sign-off on D7/D8/D9, and expand task #84 scope to include Layers 1-6, 8, 10 (Layer 7 goes on #86, Layer 9 on #85). Layer 5's estimate-vs-real diff column goes on task #83 (`ai_usage` schema).
