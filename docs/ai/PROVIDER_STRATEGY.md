# AI Provider Strategy — pdfcraftai.com

**Author:** Claude (session 2026-04-20)
**Complements:** `docs/ai/architecture.md` (technical), `lib/pricing.ts` (source of truth for credit costs).
**Status:** Proposal. Requires owner sign-off before implementation.
**Verify before GA:** Provider pricing and model names below are accurate as of May 2025 (Claude's knowledge cutoff). Re-check each vendor's pricing page before production cutover.

---

## 1. Current state (grounding)

### 1.1 What we have in code

Two adapters wired through a portable `AIProvider` interface in `lib/ai/`:

| Provider | Default model | Env var | Adapter file |
|---|---|---|---|
| Anthropic | `claude-haiku-4-5-20251001` | `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` | `lib/ai/adapters/anthropic.ts` |
| OpenAI | `gpt-4o-mini` | `OPENAI_API_KEY` + `OPENAI_MODEL` | `lib/ai/adapters/openai.ts` |

Registry is env-driven (`lib/ai/registry.ts`) — set a key, the adapter lights up. No code change needed to swap model strings.

### 1.2 Operations we charge for (`lib/pricing.ts`)

| Operation | Credits | Input pattern | Output pattern |
|---|---:|---|---|
| `chat_turn` | 1 | short prompt + doc context (cached) | 100–800 tokens |
| `summarize` | 3 | 5k–20k tokens (full PDF text) | 500–2,000 tokens |
| `translate` | 5 | 5k–20k tokens | ~same size out |
| `ocr` | 2 × pages | image pages | extracted text |
| `compare` | 15 | 2 × full-doc text | 500–1,500 tokens |
| `rewrite` | 3 | full-doc text | ~same size out |
| `table` | 3 | full-doc text | structured JSON |
| `redact` | 5 | full-doc text | masked doc + audit |
| `generate` | 20 | short prompt | 2k–4k tokens |
| `sign` | 10 | contract-style prompt | 1k–3k tokens |

### 1.3 Credit packs

Already in `lib/pricing.ts` — stated margins assume a provider cost envelope we have not yet pressure-tested against live traffic.

| Pack | USD | Credits | USD/credit | Stated margin |
|---|---:|---:|---:|---:|
| Starter | $5 | 100 | $0.050 | 88% |
| Creator | $19 | 500 + 25 bonus | $0.036 | 83% |
| Pro | $59 | 2,000 + 200 bonus | $0.027 | 78% |
| Studio | $149 | 6,000 + 800 bonus | $0.022 | 73% |

### 1.4 BYOK posture (aspirational, not yet built)

- `/app/api-keys` page exists but renders "API access is coming soon".
- `lib/pricing.ts` advertises: Pro = BYOK + 15% infra fee; Studio = unlimited BYOK + $49/seat/mo.
- No storage layer, no encryption layer, no validation ping. Everything is placeholder copy.

### 1.5 Blocker

Task #72 still pending: no `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` on Hostinger. Every AI route returns a `NoAIProviderConfiguredError`. Nothing in this strategy ships until that's resolved.

---

## 2. Provider landscape — options, prices, restrictions

Prices are per 1M tokens (MTok). "Good for" is a working recommendation, not a benchmark result.

### 2.1 Tier A — primary providers

| Provider / Model | Input $/MTok | Output $/MTok | Good for |
|---|---:|---:|---|
| **Anthropic Claude Haiku 3.5** | $0.80 | $4.00 | redact, compare, sign (strong structured output + safer refusals on PII) |
| **Anthropic Claude Sonnet 4** | $3.00 | $15.00 | `generate` "deep" mode; escalate path for low-confidence chat |
| **OpenAI GPT-4o-mini** | $0.15 | $0.60 | chat_turn, short summarize (cheapest reliable mainstream model) |
| **OpenAI GPT-4o** | $2.50 | $10.00 | fallback for complex summarize, high-quality translate |
| **Google Gemini 1.5 Flash** | $0.075 | $0.30 | OCR, translate (native PDF input + cheapest mainstream) |
| **Google Gemini 1.5 Pro** | $1.25 | $5.00 | hybrid doc + image tasks |

### 2.2 Tier B — economical / specialist

| Provider | Headline | Why consider |
|---|---|---|
| **Mistral (API or Azure)** | Mistral Large ~$2 / $6 per MTok; Codestral cheaper | EU data residency, GDPR-friendly, can be hosted in-region |
| **DeepSeek V3** | ~$0.27 / $1.10 per MTok | Dirt cheap. Trade-off: Chinese-origin provider — flag for enterprise buyers; avoid for health/legal/finance PII |
| **Groq (Llama 3.x hosted)** | ~$0.10 / $0.10 per MTok, ~10× faster | Great for low-latency chat; model ceiling lower than frontier |
| **xAI Grok** | Similar to GPT-4o pricing | Optional; no real PDF advantage over GPT-4o |
| **Azure OpenAI** | Same as OpenAI + Azure markup | Required for certain enterprise RFPs (BAA, private networking) |

### 2.3 Non-LLM specialist APIs worth buying instead of building

| Need | Option | Why |
|---|---|---|
| OCR (scanned PDFs) | **Mistral OCR** or Gemini 1.5 Flash with PDF input | Cheaper and more accurate than stitching `pdfjs-dist` + an LLM. Our current path extracts text via pdfjs and punts scanned PDFs to a 422 — the `FINDING A1` path from the 2026-04-20 E2E sweep |
| Embeddings (for RAG on long docs) | OpenAI `text-embedding-3-small` ($0.02/MTok) or Voyage v3 | Small, cheap. Lets us embed once per doc and collapse input tokens on repeat chat/summarize |
| Content moderation | OpenAI `omni-moderation` (free) | Defensive layer before user-generated prompts hit a paid provider |

### 2.4 Restrictions we must design around

**Anthropic**
- Refuses financial/legal/medical advice generation more aggressively than OpenAI → affects `sign` and parts of `generate`. Need disclaimer-heavy prompt wrappers.
- Strong refusals on PII extraction prompts → actually *good* for the `redact` use case.
- Default rate limits modest (e.g., 4,000 RPM, 400k ITPM). Requires written request for higher tiers.
- Requires organization TOS for commercial use; audit trails expected.

**OpenAI**
- More permissive on generation; adds weight to moderation classifier outputs → may soft-block outputs without warning.
- COPPA posture: cannot knowingly serve minors → affects marketing copy, not technical impl.
- Rate limits scale with organization spend tier. Easy to upgrade.

**Google Gemini**
- Requires a Google Cloud project, PAYG billing enabled, and an API key scoped to the Generative Language API.
- Free tier has 2 RPM — only useful for sandbox. Paid tier RPM is generous.
- Data retention: by default Google may use prompts for improvement on the *free* tier; PAYG is opted out. Verify per-region ToS.

**DeepSeek / Chinese-origin providers**
- Data residency: assume prompts leave PRC jurisdiction only per their ToS; enterprise buyers in EU/US will object. Keep off by default; optional BYOK path.

**Mistral**
- EU-hosted; cleanest GDPR story. Smaller ecosystem, fewer hosted dev tools.

**All of them**
- Abuse / TOS triggers: generating malware, CSAM, election misinformation, violent content. Our `generate` and `sign` routes need pre-flight input moderation (free via OpenAI Moderation) so a prompt like "draft a phishing email" doesn't get our shared key throttled or banned.
- Data residency for India: nothing in RBI/DPDP requires us to keep *AI prompt data* in India (payment data is different). Still, transparent ToS page and an EU-friendly provider option (Mistral) de-risk enterprise deals.

---

## 3. Max-profit architecture — routing table

Route each operation to the cheapest provider whose quality is "good enough". One operation → one default route + one escape hatch.

### 3.1 Recommended route

| Op | Primary | Fallback | Escalate-to on low confidence |
|---|---|---|---|
| `chat_turn` | GPT-4o-mini | Gemini 1.5 Flash | GPT-4o (on streaming error or user "regenerate") |
| `summarize` (tldr/standard) | GPT-4o-mini | Gemini 1.5 Flash | — |
| `summarize` (detailed) | Claude Haiku 3.5 | GPT-4o | Sonnet 4 (gated behind a "deep" checkbox, 2× credit cost) |
| `translate` | Gemini 1.5 Flash | GPT-4o-mini | — |
| `ocr` | Gemini 1.5 Flash (native PDF) | Mistral OCR | Tesseract local (free, offline) |
| `compare` | Claude Haiku 3.5 | GPT-4o | Sonnet 4 |
| `rewrite` | GPT-4o-mini | Claude Haiku 3.5 | — |
| `table` | Claude Haiku 3.5 (structured JSON strength) | GPT-4o-mini `response_format: json_schema` | — |
| `redact` | Claude Haiku 3.5 (PII refusal-friendly) | GPT-4o | — |
| `generate` | Claude Sonnet 4 (default) | GPT-4o | Opus on user-paid "Legal-grade" mode |
| `sign` | Claude Sonnet 4 | GPT-4o | — |

### 3.2 Unit economics (illustrative, Haiku 3.5 and 4o-mini prices above)

Assume "typical" summarize = 10k input + 1k output tokens.

- **Claude Haiku 3.5:** 10 × $0.00080 + 1 × $0.00400 = **$0.012**
- **GPT-4o-mini:** 10 × $0.00015 + 1 × $0.00060 = **$0.00210**
- **Gemini 1.5 Flash:** 10 × $0.000075 + 1 × $0.00030 = **$0.00105**

At `summarize` = 3 credits:

| Pack | Revenue per summarize | Margin vs GPT-4o-mini | Margin vs Haiku 3.5 |
|---|---:|---:|---:|
| Starter ($0.050/cr) | $0.150 | **98.6%** | 92.0% |
| Creator ($0.036/cr) | $0.108 | 98.1% | 88.9% |
| Pro ($0.027/cr) | $0.081 | 97.4% | 85.2% |
| Studio ($0.022/cr) | $0.066 | 96.8% | 81.8% |

Routing to GPT-4o-mini for standard summaries keeps margin ≥ 96% even at Studio's discounted per-credit rate. Anthropic Haiku for `redact`/`compare`/`sign` still lands 80%+ margin because those ops charge 5–15 credits.

### 3.3 Cost-cutters to layer on

1. **Prompt caching** (Anthropic, Gemini, OpenAI GPT-4.1+): cache the extracted PDF text and system prompt. Second chat turn on the same doc drops input cost ~90%. For a 20-turn chat session, net input spend falls from 20×10k tokens → ~20k tokens total. Adapter work: add `cache_control` blocks on the system + doc portion of the prompt.
2. **Batch API** (Anthropic + OpenAI): 50% off for non-realtime ops. Good candidates: `translate` on large docs if we add an async "we'll email you when done" mode. Low ROI until volume is there.
3. **Embeddings + RAG for chat**: embed the doc once (cost: ~$0.0002 for 10k tokens), then retrieve top-k chunks (~2k tokens) per turn instead of stuffing full text. Turns a 20-turn chat from `20 × 10k = 200k` input tokens into `1 × 10k (embed) + 20 × 2k = 50k`. 75% input token reduction. Requires `pgvector` or a vector store; out of scope for Phase 6, note for Phase 7.
4. **Output caps per op**: enforce `max_tokens` at the adapter level — summarize 1,500, translate 2,000, generate 4,000, sign 3,000. Kills the "runaway output" failure mode and caps worst-case cost per call.
5. **Input caps**: reject PDFs whose extracted text exceeds 50k tokens with a friendly "split this doc" error. Already partially there via `MAX_PDF_BYTES = 25MB`, but that doesn't bound tokens — a dense 25MB PDF can be 80k+ tokens. Add an explicit token ceiling after `extractPdfText`.
6. **Model downgrade on retry**: if the primary provider returns an overloaded / rate-limit error, retry on the fallback at adapter boundary. Already scaffolded in `AIProvider` per `docs/ai/architecture.md`; needs to be wired into the router.

---

## 4. Admin tracking & guardrails

### 4.1 Telemetry schema

Add `ai_usage` table — one row per provider call (including retries and fallbacks):

| Column | Type | Notes |
|---|---|---|
| `id` | char(26) | ULID |
| `user_id` | varchar(191) | nullable for system calls |
| `operation` | enum | matches `AIOperationId` |
| `provider_id` | enum | `anthropic` / `openai` / `gemini` / `mistral` / `deepseek` |
| `model` | varchar(128) | resolved model string |
| `key_source` | enum | `platform` / `byok` |
| `tokens_in` | int | |
| `tokens_out` | int | |
| `cached_tokens_in` | int | for prompt cache hits |
| `cost_usd_micro` | bigint | actual provider cost in 1/1,000,000 USD (avoids float) |
| `latency_ms` | int | wall clock |
| `status` | enum | `ok` / `error` / `refunded` |
| `error_code` | varchar(64) | adapter-level code |
| `idempotency_key` | varchar(191) | matches the ledger row |
| `credits_spent` | int | 0 for BYOK+Studio flat-fee |
| `ledger_id` | char(26) | FK into `credit_ledger` |
| `created_at` | datetime | |

This is the source of truth for margin analytics. The existing `credit_ledger` tells us revenue per op; `ai_usage` tells us cost. Join them for per-op margin.

### 4.2 Admin dashboard (`/admin/ai-usage`, owner-gated)

MVP views, all single-file React, all query from `ai_usage`:

- **Daily spend card:** total provider $ today, yesterday, 7d; delta vs 28d baseline.
- **Per-op P&L:** op × (revenue credits × blended $/credit) vs (provider cost) → margin %.
- **Per-provider share:** spend split across anthropic / openai / gemini / etc. Alerts if any single provider > 80% of spend (concentration risk).
- **Top-20 user spenders (by cost):** catches abuse and heavy users who may warrant reaching out.
- **Error/refund rate:** `status IN ('error','refunded')` over total calls. Alert if > 2%.
- **Model mix by op:** confirms routing decisions are firing as intended.

### 4.3 Budget guards

In `lib/ai/budget.ts` (new):

- Daily USD budget per provider (env: `AI_DAILY_BUDGET_USD_ANTHROPIC=50` etc.).
- Before each call, check `SUM(cost_usd_micro) WHERE provider_id=X AND created_at > today_start`.
- At 80%: log a warning + optional Slack/email webhook.
- At 100%: short-circuit the adapter with a `budget_exceeded` error; route fails over to the cheaper provider; if all budgets hit, 503 with "Service is temporarily unavailable" + ops alert.

This is the single biggest protection against a prompt-injection or abuse loop silently burning the AWS bill (or its Hostinger analog).

### 4.4 Cost attribution

`key_source` column separates:

- **Platform spend** — cost on *our* keys. Tracked against revenue from credits.
- **BYOK spend** — cost on the user's key. We record the volume for audit and rate-limit enforcement, but `cost_usd_micro` is zero on our ledger (they pay the provider directly).

---

## 5. BYOK for registered users — design

### 5.1 Goals

1. Pro+ customers can paste their own Anthropic / OpenAI / Gemini key and route requests through it.
2. Their keys never land in logs, never return to the UI, never leave our server unencrypted.
3. We still collect an "infra fee" (Pro: 15% of equivalent credits; Studio: flat $49/seat/mo) because orchestration (RAG, chunking, moderation, retries, audit) is our work.
4. A user's BYOK mistake (leaked key, rate limit) must not break other users.

### 5.2 Storage layer

Schema (`byok_keys` table):

| Column | Type | Notes |
|---|---|---|
| `id` | char(26) | ULID |
| `user_id` | varchar(191) | FK |
| `provider_id` | enum | `anthropic` / `openai` / `gemini` / ... |
| `key_ciphertext` | blob | AES-256-GCM ciphertext |
| `key_nonce` | binary(12) | GCM nonce |
| `key_tag` | binary(16) | GCM auth tag |
| `key_last4` | char(4) | for UI display ("sk-…xyz9") |
| `label` | varchar(64) | user-provided nickname |
| `status` | enum | `active` / `invalid` / `revoked` |
| `last_validated_at` | datetime | refreshed on validation ping |
| `last_used_at` | datetime | audit |
| `created_at` | datetime | |

### 5.3 Encryption

- Master key (`BYOK_MASTER_KEY`) lives in Hostinger env only. 32 random bytes, base64-encoded.
- **We use envelope encryption** *only once we have KMS*. Without KMS, we deliberately stay simple: master key → AES-256-GCM encrypt the user key directly.
- Rotate master key by (a) generating new, (b) running a migration that decrypts with old + encrypts with new, (c) retiring old. Document in `docs/security/SECRET_ROTATION.md`.
- **Never** log the plaintext key, the ciphertext, or the master key. Zeroize the plaintext buffer after every use (Node's `Buffer.fill(0)`).

### 5.4 Validation on add

When a user pastes a key:

1. Normalize / strip whitespace.
2. Send a probe request: Anthropic → `GET /v1/models`; OpenAI → `GET /v1/models`; Gemini → `GET /v1beta/models?key=...`. 1 token of spend or zero.
3. If 200: store encrypted, mark `active`.
4. If 401/403: show "key appears invalid" and refuse to store.
5. If 429/5xx: store as `pending` with a banner "we couldn't verify right now — try again"; background job retries.

### 5.5 Request-time flow (BYOK)

```
user hits POST /api/ai/summarize
  → auth()
  → user.plan in {pro, studio}?  no → fallback to platform key
  → byok_keys row active for this op's provider?  no → fallback
  → decrypt key into a Buffer
  → spendCredits(op × 0.15)                # Pro: 15% infra fee
    OR no-op and check seat subscription   # Studio
  → call adapter with { apiKey: <plaintext>, userId, op }
  → zero the plaintext buffer
  → log ai_usage row with key_source='byok', cost_usd_micro=0
  → return result
```

On adapter error with BYOK:

- 401 from provider → mark key `invalid`, refund any infra credits, show user "re-add your key".
- 429 from provider → surface to user as "your key is rate-limited — retry later". We do *not* auto-fallback to the platform key (that leaks their work onto our spend and may contravene their TOS with the provider).

### 5.6 Safety rails specific to BYOK

1. **Per-key concurrency cap** (3 in-flight requests). Without this, a BYOK user's buggy loop can saturate *their* provider quota and — if we shared keys across tenants via bugs — affect others.
2. **Moderation pre-flight** still applies (protects them from ToS violations → bans → our support burden).
3. **Daily usage ceiling** per BYOK key (e.g., 10,000 calls/day default, user-adjustable) so a credential exfiltrated from their codebase doesn't drain their account before they notice.
4. **BYOK disclosure on `/app/api-keys`**: plain-English note that their prompts go directly to the provider under their key; the provider's privacy policy applies; we retain only the usage metadata (not prompts).

### 5.7 UI on `/app/api-keys`

Replace the "coming soon" placeholder with:

- A table of saved keys: label, provider, `sk-…xyz9`, status dot, last-used, "Revoke".
- "Add key" modal: provider dropdown, key input (type=password, autocomplete="off"), optional label. Submit triggers §5.4 validation.
- Copy above the table: "Keys are encrypted at rest. We never show them again after you add them — save a copy in your password manager."
- Upsell if user is on Starter/Creator: "BYOK is available from Pro — [Upgrade]."

---

## 6. Regulatory / compliance considerations

- **India DPDP (2023):** Requires consent + notice for personal-data processing. Prompts containing PII → user must consent at signup. Our existing ToS/Privacy pages cover this generically; add a line: "If you use AI features, your input may be sent to a third-party AI provider (listed on our Sub-processors page)."
- **GDPR (for EU users if we expand):** Publish a Sub-processors list. Provide a DPA template for Pro/Studio. Mistral route available for buyers who require EU data residency.
- **Razorpay / India finance rules:** Unrelated to AI payload data, but any BYOK `usage_ceiling` billing event must still flow through the ledger for GST reporting.
- **Copyright on `generate` / `sign` outputs:** Add output-side disclaimer ("AI-generated draft; verify with a licensed professional before relying on it") in the route response + UI. Owner should decide whether we retain liability-shielding language in the ToS.

---

## 7. Implementation plan — 4-week rollout

### Phase 1 (week 1) — Unblock + observability

- [ ] **Close #72**: add `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` to Hostinger env (owner action; Claude cannot from sandbox).
- [ ] Create `ai_usage` table migration (Drizzle).
- [ ] Write row in every adapter on success + error paths.
- [ ] Add `lib/ai/budget.ts` with daily-budget guard (platform only; BYOK has no budget to us).
- [ ] Ship a tiny `/admin/ai-usage` dashboard behind `requireOwner()`.

### Phase 2 (week 2) — Routing + Gemini

- [ ] Add `lib/ai/adapters/gemini.ts` implementing `AIProvider`.
- [ ] Add `lib/ai/router.ts` encoding §3.1 routing table; make `chooseProvider(op, user)` the single entry used by every `app/api/ai/*/route.ts`.
- [ ] Re-route `ocr` and `translate` to Gemini; keep Anthropic on `redact`/`compare`/`sign`; keep 4o-mini on `chat_turn`/`summarize-short`.
- [ ] 1-week canary: compare `ai_usage.cost_usd_micro` and `status='error'` against baseline.

### Phase 3 (week 3) — BYOK v1

- [ ] `byok_keys` migration + encryption helper (`lib/security/byok-crypto.ts`).
- [ ] `/app/api-keys` real page: list / add / revoke + validation ping.
- [ ] Router honours BYOK when `user.plan ∈ {pro, studio}` and an active key exists.
- [ ] `infra_fee` credit charge (Pro) + Studio seat subscription check.
- [ ] Security review: attempt to exfiltrate plaintext via logs, error messages, client-side responses.

### Phase 4 (week 4) — Prompt caching + output caps

- [ ] `cache_control` wiring on Anthropic adapter for doc + system prompt blocks.
- [ ] OpenAI prompt-cache (auto on GPT-4.1+) tuning.
- [ ] Per-op `max_tokens` caps.
- [ ] Token-count pre-flight (reject or degrade prompts > 50k input tokens).

### Phase 5+ (month 2 onward)

- [ ] Embeddings + pgvector for RAG chat — first cost saver that compounds with usage.
- [ ] Batch API path for bulk `translate` / `redact` with a "notify me" UX.
- [ ] Mistral adapter for EU-tier enterprise deals.
- [ ] Moderation pre-flight on `generate` / `sign`.

---

## 8. Recommendation — the TL;DR

1. **Unblock #72 first** with `ANTHROPIC_API_KEY` + `OPENAI_API_KEY`. Nothing below matters until the AI routes stop 500-ing on `NoAIProviderConfiguredError`.
2. **Ship multi-provider routing** (§3.1). Use GPT-4o-mini for volume ops, Claude Haiku for quality ops, Gemini Flash for OCR/translate. Projected blended margin: **93–97% at Starter, 82–89% at Studio**.
3. **Layer prompt caching + output caps** — free 30–50% extra margin on chat and summarize.
4. **Track every call in `ai_usage`** with `cost_usd_micro` and `key_source`. Expose an owner-only admin dashboard. Enforce a daily provider budget.
5. **Ship BYOK behind Pro/Studio only.** AES-256-GCM at rest, never logged, per-user concurrency cap, validation ping on add. We charge infra credits (Pro) or seat subscription (Studio). Margin on BYOK calls is effectively 100% because we pay no inference cost.

Margin ceiling with this plan is bounded by (a) how much Gemini/OpenAI pricing drops over the next 12 months — expected to keep falling — and (b) whether we avoid running high-tier Sonnet/Opus on operations that don't need it. Discipline in `lib/ai/router.ts` is the single biggest lever.
