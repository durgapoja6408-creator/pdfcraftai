# AI Model Catalogue + Multi-Key BYOK

**Companion to:** `docs/ai/PROVIDER_STRATEGY.md` (the routing + margin story) and `docs/ai/architecture.md` (the technical adapter layer).

**Knowledge-cutoff caveat:** Claude's training cutoff is end of May 2025. Some models listed below (Haiku 4.5, Sonnet 4.6, Opus 4.6, GPT-4.1-nano, Gemini 2.5, DeepSeek R1, etc.) were verified against what the system prompt and the repo's own `anthropic.ts` default reference. **Every `$/MTok` number must be re-verified against the vendor's pricing page on the day of GA.**

---

## Part 1 — Model catalogue (every model worth considering)

Grouped by provider. Columns:

- **Context** — max input tokens
- **$/MTok in / out** — pay-as-you-go list price per 1M tokens
- **Latency** — rough p50 for a 1k-output generation
- **Strengths** — what this model is actually good at
- **Use here** — which of our ops it suits

### 1.1 Anthropic (Claude)

| Model | Context | $/MTok in | $/MTok out | Latency | Strengths | Use here |
|---|---:|---:|---:|---|---|---|
| **Claude Haiku 3.5** | 200k | $0.80 | $4.00 | fast | Cheapest Claude; clean JSON; great PII posture | Default for `redact`, `table`, `compare` |
| **Claude Haiku 4.5** | 200k | ~$0.80–$1.00 | ~$4–$5 | very fast | Newer, better reasoning at same price class | Will replace Haiku 3.5 once we benchmark; current default in `anthropic.ts` |
| **Claude Sonnet 3.7** | 200k | $3.00 | $15.00 | medium | Extended thinking mode, strong reasoning | Escalation path for `generate` / `sign` |
| **Claude Sonnet 4** | 200k | $3.00 | $15.00 | medium | Balanced; Anthropic's default "good" tier | Same |
| **Claude Sonnet 4.6** | 200k (1M via beta header) | ~$3.00 | ~$15.00 | medium | Latest Sonnet with 1M-context beta | Long-doc `summarize (detailed)` |
| **Claude Opus 4 / 4.1 / 4.6** | 200k | $15.00 | $75.00 | slow | Strongest reasoning in the lineup | User-paid "Legal-grade" mode for `sign` / `generate` (3–5× credit cost) |

**Features that save us money on Anthropic:**

- **Prompt caching:** 90% discount on cached input tokens (5-min TTL; 1-hour at 2× write cost). Applies to the doc + system prompt in chat. First turn writes cache; turns 2–20 read it.
- **Batch API:** 50% off for async jobs (24-hour SLA). Candidate ops: long `translate` runs, bulk `redact`.
- **Token-efficient tool use:** (beta) reduces tool-use token overhead. Not relevant until we add tool use.

**Restrictions to design around:**

- Strong refusals on generating legal/medical advice → disclaimer-heavy prompt wrappers on `sign` and `generate`.
- Default rate limits: 4k RPM / 400k ITPM on tier 1; scales with spend. Request higher tiers via console.
- Organization-level TOS must be accepted before commercial use.

### 1.2 OpenAI (GPT + o-series)

| Model | Context | $/MTok in | $/MTok out | Latency | Strengths | Use here |
|---|---:|---:|---:|---|---|---|
| **GPT-3.5-turbo** | 16k | $0.50 | $1.50 | fast | Cheap legacy; avoid unless someone demands it | Skip |
| **GPT-4o-mini** | 128k | $0.15 | $0.60 | fast | Cheapest reliable mainstream model | Default for `chat_turn`, `summarize (short)`, `rewrite` |
| **GPT-4.1-nano** | 1M | $0.10 | $0.40 | very fast | 1M context, cheapest OpenAI frontier-adjacent | High-volume `chat_turn` on very long docs |
| **GPT-4.1-mini** | 1M | $0.40 | $1.60 | fast | 1M context with quality closer to 4o | Long-doc `summarize (detailed)` fallback |
| **GPT-4o** | 128k | $2.50 | $10.00 | medium | Balanced, strong JSON, vision | Fallback for `compare`, `generate` |
| **GPT-4.1** | 1M | $2.00 | $8.00 | medium | 1M context + frontier quality | Same class as 4o at slightly better price |
| **o3-mini** | 200k | $1.10 | $4.40 | medium (reasoning) | Strong reasoning at fraction of o-series cost | `compare`, `sign` (structured legal reasoning) |
| **o4-mini** | 200k | $1.10 | $4.40 | medium | Latest small reasoning model | Same, newer |
| **o1 / o3** | 200k | ~$15 / ~$60 | — | slow | Full reasoning; very expensive | User-paid "deep reasoning" mode only |
| **GPT-4o-audio / GPT-4o-realtime** | — | — | — | — | Realtime audio / voice | Not in our scope |

**Features that save us money on OpenAI:**

- **Prompt cache:** automatic on GPT-4.1 family; 50% discount on cached input. No explicit `cache_control` needed.
- **Batch API:** 50% off, 24-hour SLA. Same candidates as Anthropic.
- **`response_format: json_schema`:** kills retry-on-malformed-JSON for `table`, `redact` audit, structured `compare`.
- **Moderation API** (omni-moderation-latest): free. Ideal pre-flight before `generate`/`sign`.

**Restrictions:**

- Silent moderation classifier soft-blocks can occur (output suddenly terse or refusing). Watch `finish_reason=content_filter`.
- Rate limits scale with "tier" (spend). Tier 1 = 500 RPM / 60k TPM on GPT-4o-mini; grows to millions with spend.
- COPPA — cannot knowingly serve minors (marketing concern, not technical).

### 1.3 Google (Gemini)

| Model | Context | $/MTok in | $/MTok out | Latency | Strengths | Use here |
|---|---:|---:|---:|---|---|---|
| **Gemini 1.5 Flash-8B** | 1M | $0.0375 | $0.15 | very fast | **Cheapest mainstream model anywhere.** Great for classification | Pre-flight language detection, cheap `rewrite` |
| **Gemini 1.5 Flash** | 1M | $0.075 | $0.30 | fast | Native PDF input; strong multilingual | Default for `ocr`, `translate` |
| **Gemini 1.5 Pro** | 2M | $1.25 | $5.00 | medium | Huge context; strong on long docs | Fallback for very-long `summarize` |
| **Gemini 2.0 Flash** | 1M | $0.10 | $0.40 | fast | Newer, better reasoning at Flash tier | Replace 1.5 Flash once benchmarked |
| **Gemini 2.0 Flash-Lite** | 1M | $0.075 | $0.30 | very fast | Cost-optimized 2.0 | Highest-throughput `ocr` lane |
| **Gemini 2.5 Flash / Pro** | 1M / 2M | TBD | TBD | — | Latest generation | Verify pricing before switching |

**Features:**

- **Context caching:** 75% discount on cached tokens after a paid write. Best-in-class for long-doc workflows.
- **Native PDF input:** pass bytes of a PDF directly; Gemini does OCR + layout internally. Wins hard on scanned PDFs vs our `pdfjs-dist` path.
- **Free tier:** 2 RPM — useful for sandbox only. Production requires PAYG.

**Restrictions:**

- Requires Google Cloud project, PAYG billing enabled, Generative Language API enabled.
- Free-tier prompts may be retained for model improvement. PAYG is opted out by default. Verify per-region ToS.
- Region availability: not available in every country — keep Anthropic/OpenAI as fallback for regions Gemini blocks.

### 1.4 Mistral

| Model | Context | $/MTok in | $/MTok out | Latency | Strengths | Use here |
|---|---:|---:|---:|---|---|---|
| **Ministral 3B** | 128k | $0.04 | $0.04 | very fast | Cheapest Mistral | Cost-optimized `chat_turn` for EU users |
| **Ministral 8B** | 128k | $0.10 | $0.10 | fast | Good small-model baseline | `summarize (short)` EU lane |
| **Mistral Small 3** | 128k | $0.20 | $0.60 | fast | Strong general-purpose | `rewrite`, `table` EU lane |
| **Mistral Medium 3** | 128k | ~$0.40 | ~$2.00 | medium | Between Small and Large | Optional mid-tier |
| **Mistral Large 2** | 128k | $2.00 | $6.00 | medium | Multilingual, strong reasoning | Long-doc `compare` EU lane |
| **Codestral** | 32k | $0.20 | $0.60 | fast | Code-specialized | N/A for us |
| **Pixtral 12B / Large** | 128k | $2.00 | $6.00 | medium | Vision + text | Alternative `ocr` path |
| **Mistral OCR** | — | ~$1 per 1k pages | — | — | Specialized OCR API | **Best non-LLM OCR option** — compare with Gemini Flash |

**Features:**

- EU-hosted (Paris / Frankfurt). Clean GDPR story with optional Azure EU hosting.
- JSON mode + structured outputs.

**Restrictions:**

- Smaller ecosystem; fewer community tools.
- No prompt caching to speak of yet.

### 1.5 DeepSeek

| Model | Context | $/MTok in | $/MTok out | Latency | Strengths | Use here |
|---|---:|---:|---:|---|---|---|
| **DeepSeek V3** | 64k | $0.27 | $1.10 | medium | Extremely cheap frontier-adjacent quality | Optional budget-tier lane |
| **DeepSeek R1** | 64k | $0.55 | $2.19 | slow (reasoning) | Open-weight reasoning; rivals o-series at 1/10 price | Alternative reasoning path for `compare` / `sign` |
| **DeepSeek Coder** | 64k | $0.14 | $0.28 | fast | Code-specialized | N/A |

**Cost-cutters:**

- **Off-peak pricing:** 50%+ discount during Asia off-peak (16:30–00:30 UTC). If we queue batch jobs, schedule them there.
- **Prompt caching:** 90% discount on cached input.

**Restrictions (important):**

- Chinese-origin provider; PRC data residency. Enterprise buyers in EU/US will object.
- Keep **off by default**, surface as BYOK-only for price-sensitive users.
- Avoid on `redact` / `sign` where PII or legal content is at stake.

### 1.6 Groq (fast hosting of open models)

| Model | Context | $/MTok in | $/MTok out | Latency | Strengths | Use here |
|---|---:|---:|---:|---|---|---|
| **Llama 3.1 8B** | 128k | $0.05 | $0.08 | ~10× faster than others | Lightning-fast small model | Low-latency `chat_turn` tier |
| **Llama 3.3 70B** | 128k | $0.59 | $0.79 | still very fast | Strong general-purpose | High-QPS `rewrite`, `summarize (short)` |
| **Llama 4 Scout / Maverick** | variable | TBD | TBD | — | Newer; verify current availability | — |
| **Mixtral 8x7B** | 32k | $0.24 | $0.24 | fast | Multilingual MoE | EU alternative |

**Use:** Perfect for interactive chat UX. 50 tokens/sec on Anthropic/OpenAI feels laggy on mobile; Groq at 300–800 tok/s feels instant. The catch is model ceiling — Llama 3.3 70B is good, but not Sonnet-4-good.

### 1.7 Other notables

| Provider | Model(s) | Why keep on the list |
|---|---|---|
| **xAI** | Grok 3, Grok 4 | Competitive pricing, 1M context; brand-sensitive |
| **Cohere** | Command R, Command R+ | Native RAG features, multilingual strong |
| **Perplexity** | Sonar / Sonar Pro | Built-in web search — could power "cite live sources" `summarize` |
| **Azure OpenAI** | Same models, private networking | Required for BAA-bound enterprise RFPs |
| **AWS Bedrock** | Claude, Llama, Mistral proxied | Alternative billing / procurement path |
| **Together.ai / Fireworks** | Open-weight models | BYO-host alternative if we want to fine-tune |

---

## Part 2 — Default model config + dynamic swap

### 2.1 Current state (to replace)

`lib/ai/registry.ts` hardcodes one model per provider at boot:

```ts
defaultModel: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001"
```

Switching a model = env var change + Hostinger restart. We want per-op routing that can change at runtime without a redeploy, with a safe rollback.

### 2.2 Proposed shape

Introduce a DB-backed routing table and a lookup service. Adapter signatures already accept `input.model` at call time — no adapter changes needed.

#### 2.2.1 `ai_routes` table

| Column | Type | Notes |
|---|---|---|
| `operation` | enum | PK part 1; matches `AIOperationId` |
| `tier` | enum | PK part 2; `default` / `deep` / `fastest` / `cheapest` |
| `provider_id` | enum | `anthropic` / `openai` / `gemini` / `mistral` / `deepseek` / `groq` |
| `model` | varchar(128) | resolved model string |
| `fallback_provider_id` | enum | nullable |
| `fallback_model` | varchar(128) | nullable |
| `max_input_tokens` | int | reject before sending if extracted text exceeds this |
| `max_output_tokens` | int | passed to adapter |
| `enabled` | boolean | kill switch |
| `canary_pct` | tinyint | 0–100; fraction of traffic routed to `canary_*` columns |
| `canary_provider_id` | enum | nullable |
| `canary_model` | varchar(128) | nullable |
| `updated_at` | datetime | |
| `updated_by` | varchar(191) | audit |

#### 2.2.2 `lib/ai/router.ts`

```ts
export async function chooseRoute(
  op: AIOperationId,
  opts: { tier?: Tier; userId?: string; keySource?: 'platform' | 'byok' }
): Promise<ResolvedRoute>
```

- Looks up `ai_routes` for the (op, tier) pair.
- Rolls dice against `canary_pct` and picks canary vs primary.
- If `keySource === 'byok'`, filters to providers the user has an active key for; picks first available per the user's preference order.
- Returns `{ providerId, model, fallback?, maxTokens, canaryHit }`.

#### 2.2.3 Admin UI — `/admin/ai-routes` (owner-gated)

Table editor with inline dropdowns for provider + model, number inputs for caps, percentage slider for canary, toggle for `enabled`. Every save writes to `ai_routes` + appends an audit row.

Why DB-backed beats env-only:

- Change model for one op without restarting Node.
- Canary a new model at 5% → 25% → 100% with no deploy.
- Per-tier routing (`default` / `deep`) lets users pay more for better models without code branching.
- Full audit trail of who changed what, when.

### 2.3 Seed routes — what we ship on day 1

Keys the user explicitly asked for — GPT-4o-mini / Haiku 3.5 / Gemini Flash — become the defaults, with cheaper alternates as `fastest`/`cheapest` tiers:

| Op | default | cheapest | deep |
|---|---|---|---|
| `chat_turn` | gpt-4o-mini | gemini-1.5-flash-8b | claude-sonnet-4.6 |
| `summarize` (short) | gpt-4o-mini | gemini-1.5-flash-8b | claude-sonnet-4.6 |
| `summarize` (detailed) | claude-haiku-3.5 | gpt-4o-mini | claude-sonnet-4.6 |
| `translate` | gemini-1.5-flash | mistral-small-3 | gpt-4o |
| `ocr` | gemini-1.5-flash | mistral-ocr | — |
| `compare` | claude-haiku-3.5 | gpt-4o-mini | o4-mini |
| `rewrite` | gpt-4o-mini | gemini-1.5-flash-8b | claude-haiku-3.5 |
| `table` | claude-haiku-3.5 | gpt-4o-mini (json_schema) | — |
| `redact` | claude-haiku-3.5 | gpt-4o | — |
| `generate` | claude-sonnet-4.6 | gpt-4.1 | claude-opus-4.6 |
| `sign` | claude-sonnet-4.6 | gpt-4o | claude-opus-4.6 |

`cheapest` tier gives users (or our routing) a manual lever to halve cost on the rare day of a provider outage or a pricing surprise. `deep` tier is user-visible and charges 2–3× credits.

---

## Part 3 — Multi-key BYOK architecture

The user's ask: *"cannot we have multiple option to enter api key? so we can use based on bandwidth?"*

Yes. Three dimensions:

1. **Multi-provider** — one user can add keys for Anthropic + OpenAI + Gemini + Mistral + Groq + DeepSeek all at once.
2. **Multi-key per provider** — the same user can register 2+ Anthropic keys (separate orgs, separate billing, or HA rotation).
3. **Load-balanced routing** — at call time, pick the healthiest, cheapest, within-quota key for the op's primary provider; fail over to the next provider in the user's preference list if all keys for the primary are exhausted.

### 3.1 Schema changes to `byok_keys`

Extend the v1 shape from `PROVIDER_STRATEGY.md §5.2`:

| Column | Type | Notes |
|---|---|---|
| `id` | char(26) | PK |
| `user_id` | varchar(191) | FK |
| `provider_id` | enum | same |
| `key_ciphertext` | blob | AES-256-GCM ciphertext |
| `key_nonce` | binary(12) | GCM nonce |
| `key_tag` | binary(16) | GCM auth tag |
| `key_last4` | char(4) | display |
| `label` | varchar(64) | user-provided |
| `priority` | tinyint | 0 = primary, 1 = secondary, etc. User-adjustable per provider |
| `weight` | tinyint | relative weight for weighted-round-robin at same priority (default 1) |
| `monthly_budget_usd_micro` | bigint | nullable; if set, router skips key when projected month-to-date spend exceeds it |
| `daily_call_cap` | int | nullable; hard ceiling on calls/day for this key |
| `concurrency_cap` | tinyint | in-flight limit per key (default 3) |
| `status` | enum | `active` / `invalid` / `revoked` / `rate_limited` / `over_budget` |
| `last_validated_at` | datetime | |
| `last_used_at` | datetime | |
| `cooldown_until` | datetime | when to try again after rate-limit / 5xx |
| `created_at` | datetime | |

Plus a `byok_preferences` table keyed by `user_id`:

| Column | Type | Notes |
|---|---|---|
| `user_id` | varchar(191) | PK |
| `provider_order` | json | array of provider_ids in user's preferred order for ALL ops, e.g. `["anthropic", "openai", "gemini"]` |
| `op_overrides` | json | optional: per-op override map, e.g. `{"translate": "gemini", "redact": "anthropic"}` |
| `balancing_strategy` | enum | `priority` (respect priority field strictly) / `weighted` (weighted-round-robin across priority 0 keys) / `least_loaded` (pick key with lowest in-flight count) |

### 3.2 Health tracking

In-memory Map on the Node process (populated from `byok_keys.status` at boot, mutated on every call):

```ts
type KeyHealth = {
  keyId: string;
  inFlight: number;          // current concurrent requests
  successLast10: boolean[];  // rolling window
  rateLimitResetAt?: number; // epoch ms from Retry-After header
  lastErrorCode?: string;
  monthToDateSpendMicro: number;
};
```

On every adapter response we update:
- `inFlight` (decrement)
- `successLast10.push(...)`
- `rateLimitResetAt` if the provider returned a 429 with `Retry-After`
- `monthToDateSpendMicro` from `ai_usage.cost_usd_micro`

### 3.3 Router algorithm

For one call:

```
1. resolvedRoute = chooseRoute(op, { tier: 'default' })
2. providerPref = byok_preferences.op_overrides[op]
              ?? byok_preferences.provider_order
              ?? [resolvedRoute.providerId]  // platform fallback
3. for each provider in providerPref:
     keys = byok_keys WHERE user_id=? AND provider_id=? AND status='active'
     ORDER BY priority ASC, last_used_at ASC
   if no keys in any provider: fall back to platform key (charge full credits)
4. within the chosen provider, pick key per balancing_strategy:
     'priority':     lowest priority number; tie-break least_loaded
     'weighted':     weighted-round-robin across priority 0 keys
     'least_loaded': min(inFlight)
5. pre-flight checks on the selected key:
     - status != 'active' → skip, try next key
     - cooldown_until > now → skip
     - daily_call_cap exceeded → skip
     - monthly_budget_usd_micro exceeded → mark 'over_budget', skip
   if all keys skipped in this provider → try next provider in providerPref
6. call adapter with { apiKey: decrypt(key), model: resolvedRoute.model }
7. on 429: set cooldown_until = now + Retry-After; mark status='rate_limited' (auto-recovers on cooldown expiry)
   on 401/403: mark status='invalid'; notify user via in-app banner
   on 5xx: cooldown 30s and retry on next key
   on success: update health; write ai_usage row
```

### 3.4 UI on `/app/api-keys`

Per-provider section. Example for Anthropic:

```
Anthropic                                         [+ Add another key]
┌─────────────────────────────────────────────────────────────────┐
│ ◉ "Prod primary"       sk-ant-api03-…abc9      P0  wt:2  ●     │
│ ○ "Prod secondary"     sk-ant-api03-…xyz1      P0  wt:1  ●     │
│ ○ "Dev sandbox"        sk-ant-api03-…q2f7      P1  wt:1  ○     │
└─────────────────────────────────────────────────────────────────┘
  Budget:  $50/mo (per key) · Concurrency: 3 per key
```

Elements:

- **"Add another key"** button per provider → modal with key input, label, priority dropdown, weight slider, monthly budget input.
- **Radio group** showing which P0 key is the current routing target (visual only; router picks per strategy).
- **Status dot** — green (`active`), yellow (`rate_limited`/`cooldown`), red (`invalid`/`over_budget`), gray (`revoked`).
- **Global knobs** (top of page):
  - Provider order drag-list: "Anthropic → OpenAI → Gemini → ..."
  - Per-op override table (collapsed by default): "Translate: Gemini", "Redact: Anthropic" — lets power users pin ops.
  - Balancing strategy radio: priority / weighted / least-loaded.

### 3.5 Bandwidth awareness (why multi-key helps)

Three failure modes multi-key solves that single-key BYOK cannot:

1. **Provider RPM ceiling** — Anthropic tier-1 caps at 4k RPM. Two keys = 8k RPM effective, three = 12k. For a team running bulk `redact` jobs this is the difference between "done in an hour" and "done in a day".
2. **Monthly spend ceilings** — Enterprises set spend caps on API keys. Falling back to a secondary key lets the job complete instead of 429ing.
3. **Regional / org-scoped keys** — Some customers keep a EU-region OpenAI key for GDPR data and a US key for other data. Per-op overrides route `translate` to EU-tenant key for docs flagged as EU-scope.

### 3.6 Abuse / TOS safety

Multi-key expands blast radius if we're sloppy. Rules we enforce at the router:

- **Per-key concurrency cap** (default 3). A runaway loop can't saturate one key before we throttle.
- **No silent fallback off BYOK to platform** — if all user keys are exhausted, 429 the user with a clear message; never charge our key silently.
- **Output moderation pre-flight** still runs on BYOK calls. Cheaper for us to pay $0.0001 for the moderation check than to have a BYOK prompt injection generate content that gets the user's key banned → support ticket.
- **Zero plaintext on the wire to the client** — the only BYOK view is `key_last4`. Reveal on re-add = impossible; user must paste again.

---

## Part 4 — Code sketch (for the next implementation session)

### 4.1 Minimal router skeleton

```ts
// lib/ai/router.ts
import "server-only";
import { getProvider } from "./registry";
import { chooseRoute } from "./routes";
import { pickByokKey, decryptKey } from "./byok";
import type { AIOperationId } from "@/lib/pricing";

export type RouterInput = {
  userId: string;
  op: AIOperationId;
  tier?: "default" | "deep" | "fastest" | "cheapest";
  keySource?: "auto" | "platform" | "byok";
};

export type RouterHandle = {
  providerId: AIProviderId;
  model: string;
  apiKey: string;       // short-lived, zeroize after call
  keySource: "platform" | "byok";
  byokKeyId?: string;   // for audit
  maxOutputTokens: number;
};

export async function resolve(input: RouterInput): Promise<RouterHandle> {
  const route = await chooseRoute(input.op, input.tier ?? "default");
  const wantsBYOK = input.keySource !== "platform";

  if (wantsBYOK) {
    const byok = await pickByokKey(input.userId, input.op);
    if (byok) return {
      providerId: byok.providerId,
      model: route.model,         // admin-controlled model, user-controlled key
      apiKey: decryptKey(byok),
      keySource: "byok",
      byokKeyId: byok.id,
      maxOutputTokens: route.maxOutputTokens,
    };
  }
  // Platform fallback
  return {
    providerId: route.providerId,
    model: route.model,
    apiKey: process.env[`${route.providerId.toUpperCase()}_API_KEY`]!,
    keySource: "platform",
    maxOutputTokens: route.maxOutputTokens,
  };
}
```

### 4.2 Route call site

```ts
// app/api/ai/summarize/route.ts (excerpt)
const handle = await resolve({ userId, op: "summarize", tier: depth === "detailed" ? "deep" : "default" });
const provider = await getProvider(handle.providerId);
try {
  const result = await provider.chat({
    apiKey: handle.apiKey,            // <-- NEW: adapter accepts per-call key
    model: handle.model,
    messages: [...],
    maxOutputTokens: handle.maxOutputTokens,
  });
  await recordUsage({ userId, op: "summarize", handle, result });
  return json(200, { markdown: result.text });
} finally {
  zeroize(handle.apiKey);             // crypto.zeroize(Buffer)
}
```

### 4.3 Adapter change (already supported shape)

Adapters currently take `apiKey` at construction time. Refactor to accept an optional `apiKey` on each call and fall back to the constructor-time default. Minimal diff — ~10 lines per adapter.

---

## Part 5 — Rollout phases

Extends the 4-week plan in `PROVIDER_STRATEGY.md §7`.

**Phase A (week 1, parallel with #72 unblock):**
- [ ] Migration: `ai_routes` + seed 33 rows (11 ops × 3 tiers).
- [ ] `lib/ai/router.ts` reading from `ai_routes`.
- [ ] Refactor 10 AI route handlers to call `resolve()` instead of `getProvider()` directly.
- [ ] Admin UI `/admin/ai-routes` (read-write, owner-gated).

**Phase B (week 2):**
- [ ] Gemini adapter (`lib/ai/adapters/gemini.ts`).
- [ ] Adapter `chat()` signature gains optional `apiKey` per call.
- [ ] Switch defaults to the table in §2.3. Canary at 10% for 48 hours.

**Phase C (week 3):**
- [ ] Migration: `byok_keys` (with multi-key columns from §3.1) + `byok_preferences`.
- [ ] Encryption helper `lib/security/byok-crypto.ts` (AES-256-GCM).
- [ ] `/app/api-keys` real UI — add / list / revoke / priority / budget.
- [ ] Router honours BYOK with single-key-per-provider.

**Phase D (week 4):**
- [ ] Multi-key per provider + balancing strategies.
- [ ] Health tracker (in-memory + periodic flush).
- [ ] Per-op overrides UI.

**Phase E (month 2):**
- [ ] Mistral + Groq + DeepSeek adapters (BYOK-first; no platform key).
- [ ] Prompt caching on Anthropic + Gemini.
- [ ] Embeddings + RAG for chat.
- [ ] Batch API path for `translate` / `redact`.

---

## Part 6 — Risks and open questions

1. **Model name drift.** `claude-haiku-4-5-20251001` locks a date; the string will rot. Admin UI must allow pasting new model strings without a deploy. Store in DB, not env.
2. **Cost attribution on fallback chains.** If we start on BYOK and fall over to a secondary BYOK key or a platform key, we need to log *which* path actually ran. Hence `byok_key_id` in `ai_usage`.
3. **Provider parity gaps.** Not every provider supports every feature (tool use, vision, PDF input). Before adding a model to the routing table we have to verify the op's feature set is covered. Existing `AICapabilities` type helps; extend with `pdfInput`, `jsonSchemaOutput`, `promptCaching` booleans.
4. **Token counting mismatch.** Different providers tokenize differently. Our 50k-token input ceiling should be tokenizer-aware per-provider, not a flat Claude-tokenizer number.
5. **BYOK and tool TOS.** Some providers' ToS forbid using the key through a re-broker that masks the user's identity. Our architecture does *not* mask — we just pass through — but the ToS pages should be re-read before we market BYOK publicly.
6. **Race on monthly budget update.** Multiple concurrent calls on the same BYOK key can both see "under budget" and both commit. Same race as `credits.ts` — accept small overspend or add a Redis reservation if it becomes a problem.

---

## Part 7 — TL;DR

1. **Keep GPT-4o-mini, Haiku 3.5, Gemini Flash as defaults** (the user's pick is sound), but **move them from env vars to a DB-backed `ai_routes` table** with per-op tiers and canary controls. This makes model changes a 1-click admin action, not a deploy.
2. **Support 3 tiers per op**: `cheapest`, `default`, `deep`. Users see this as "Fast / Standard / High-quality" in the UI; we charge more credits for `deep`.
3. **BYOK v2 lets one user register many keys** — multiple providers, and multiple keys per provider with priority + weight + per-key budget + per-key concurrency cap.
4. **Router picks the best available key** on each call: primary-first, least-loaded, respects cooldowns and budgets. Falls over to the next provider in the user's preference list. Never silently falls to the platform key.
5. **Admin dashboard** tracks everything: per-op margin, per-provider spend share, per-key health, canary performance.

Net result: you change any model in any op from `/admin/ai-routes` in 3 seconds and zero redeploys, power users run their own keys at near-100% margin to us, and one bad provider day costs us nothing because every op fails over.
