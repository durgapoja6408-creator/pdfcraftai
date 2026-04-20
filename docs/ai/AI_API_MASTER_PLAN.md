# AI API + BYOK master plan — zero-leak, portable, ready to ship

**Status:** 2026-04-20. Paired with `PAYMENT_GATEWAY_PLAN.md`. This is the **final** implementation plan for the AI layer. Nothing in this doc is aspirational — every line is something we build, verify, or consciously defer.

**Prime directive (verbatim from `BYOK_DECISION_MATRIX.md`):**

> If a user has a valid BYOK key for a provider we'd route to, we use their key and charge them only the infra fee. Otherwise we use the platform key and charge full credits. **We never silently move a request from BYOK to platform, because that means their bill looks normal while our provider bill spikes.**

**Zero-leak definition.** For every AI operation the invariant `SUM(credit_ledger.delta WHERE user_id=X) = credits.balance` holds. Every provider call must either (a) debit credits before the call and commit on success, or (b) refund on provider error. No code path may both spend a credit and silently error without a matching refund or retry. No code path may call a provider without first proving credits were spent or an active BYOK key was selected.

---

## 1. State of the repo — what exists vs what's missing

### 1.1 Already built (DO NOT re-implement)

**Core interfaces & types:**

| File | Purpose | Status |
|---|---|---|
| `lib/ai/provider.ts` | `AIProvider` interface, `UnsupportedCapabilityError`, `AIProviderError` | ✅ Shipped |
| `lib/ai/types.ts` | `ChatInput`, `ChatResult`, `ChatChunk` discriminated union, `AICapabilities`, portable content blocks (text/image/document) | ✅ Shipped |
| `lib/ai/registry.ts` | Env-gated lazy adapter registry, `selectProvider({capability})`, `listConfiguredProviders()` | ✅ Shipped |
| `lib/ai/credits.ts` | `spendCredits`, `refundCredits`, idempotency-key protected, supports `multiplier` for per-page ops | ✅ Shipped |
| `lib/ai/idempotency.ts` | Deterministic key derivation for retries | ✅ Shipped |
| `lib/payments/ledger.ts` | `grantCredits({delta, idempotencyKey})` — the ledger primitive spendCredits wraps | ✅ Shipped |
| `lib/pricing.ts:AI_OPERATION_COSTS` | Flat per-op credit costs (chat 1, summarize 3, translate 5, ocr 2, compare 15, rewrite 3, table 3, redact 5, generate 20, sign 10) | ✅ Shipped |

**Adapters:**

| File | Provider | Status |
|---|---|---|
| `lib/ai/adapters/anthropic.ts` | Anthropic (Claude) — chat + streamChat, normalises stream events to `ChatChunk` | ✅ Shipped |
| `lib/ai/adapters/openai.ts` | OpenAI (GPT) — chat + streamChat | ✅ Shipped |

**Tool layer (10 operations, each with route + wrapper):**

| Route | Wrapper | Status |
|---|---|---|
| `app/api/ai/chat/route.ts` | `lib/chat-actions.ts` | ✅ Shipped |
| `app/api/ai/summarize/route.ts` | `lib/ai/summarize.ts` | ✅ Shipped |
| `app/api/ai/translate/route.ts` | `lib/ai/translate.ts` | ✅ Shipped |
| `app/api/ai/ocr/route.ts` | `lib/ai/ocr.ts` | ✅ Shipped |
| `app/api/ai/compare/route.ts` | `lib/ai/compare.ts` | ✅ Shipped |
| `app/api/ai/rewrite/route.ts` | `lib/ai/rewrite.ts` | ✅ Shipped |
| `app/api/ai/table/route.ts` | `lib/ai/table.ts` | ✅ Shipped |
| `app/api/ai/redact/route.ts` | `lib/ai/redact.ts` | ✅ Shipped |
| `app/api/ai/generate/route.ts` | `lib/ai/generate.ts` | ✅ Shipped |
| `app/api/ai/sign/route.ts` | `lib/ai/sign.ts` | ✅ Shipped |

**Supporting docs (authoritative, read before changing any of the above):**

- `docs/ai/architecture.md` — system design
- `docs/ai/PROVIDER_STRATEGY.md` — business case for multi-provider + BYOK
- `docs/ai/MODELS_AND_MULTI_KEY.md` — routing matrix + multi-key design
- `docs/ai/BYOK_DECISION_MATRIX.md` — the 7-step decision flow
- `docs/ai/REVENUE_LEAK_AUDIT.md` — the 28 ways money leaks + mitigations

### 1.2 What's missing (the P0/P1/P2 gap)

**P0 — SEV-1 blockers (site does not earn a penny until these clear):**

1. **Platform API key on Hostinger.** `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) is not in the production env. Every `/api/ai/*` call returns 503 today. This is Task #72.
2. **Credit top-up has no webhook.** `PAYMENT_GATEWAY_PLAN.md` Phase 1 must land first — otherwise users can't even acquire credits to spend.
3. **No `ai_usage` table.** We can't compute per-op margin, detect anomalies, or settle BYOK disputes without per-call ledger of provider-side cost_usd_micro, tokens in/out, latency, key_source.

**P1 — revenue-leak blockers:**

4. **`spendCredits` pre-flight race.** Current code reads balance, then debits. Two concurrent spends on a balance of 2 can both pass and land the user at -1. Fix: move to conditional UPDATE that fails if `balance < cost` (single round trip, no reservation table).
5. **No provider-side cost tracking.** Adapters emit `usage.inputTokens` / `usage.outputTokens` on the terminal chunk, but no caller persists them. Without this, we cannot reconcile "what did we pay Anthropic?" against "what did users pay us?"
6. **No BYOK code at all.** Every AI call uses the platform key. Pro tier advertises "BYOK unlocked (+15% infra fee)" in `lib/pricing.ts:60`, so we are **misrepresenting pricing**. Either build BYOK before Pro launches, or strip that feature from the Pro pack copy.
7. **Refund-on-error is inconsistent across routes.** Some routes (`chat`) refund via `refundCredits`; others (`generate`, `sign`, `compare`) catch provider errors but don't always reach the refund path. Needs a shared `withCreditSpend(op, fn)` helper.
8. **No rate limit on `/api/ai/*`.** A user with 10k credits can fire 10k OCR calls in parallel. Anthropic will rate-limit us before we finish debiting. Result: provider errors + partial refunds + angry user.
9. **No request-body size guard.** `chat/route.ts` accepts arbitrary JSON — a 50MB message body fans out to an arbitrary token count, which the flat 1-credit chat cost can't cover.
10. **Idempotency keys are sometimes client-supplied.** If a client omits or reuses a key, we either double-charge on retry or silently collapse two distinct requests. Server must mint keys from `(session_id, turn_id)` and reject client-supplied values unless they match the session.

**P2 — operational/observability:**

11. **No provider cost dashboard.** Operators can't answer "what did we spend on Anthropic yesterday?" without logging into the Anthropic console.
12. **No anomaly alerting.** A runaway OCR job (1000 pages × 2 credits) that the user hasn't explicitly confirmed should page someone.
13. **No kill switch per operation.** If Anthropic has an outage, we need to flip `ai_summarize` → off without redeploying. Today we'd have to delete `ANTHROPIC_API_KEY` and accept that ALL ops break.
14. **No model rotation.** `ANTHROPIC_MODEL` is set once at boot. Switching from Haiku to Sonnet requires a restart. Fine for now; becomes a gap at scale.

**P3 — growth features (post-revenue):**

15. **Tool use / function calling** — required for `/agent` to orchestrate multiple AI calls in one session. Stub in `AICapabilities.toolUse: false` today.
16. **Image input** — OCR currently rasterises PDFs server-side; passing image blocks natively is cheaper. `AICapabilities.imageInput: false` across the board today.
17. **Embeddings + vector store** — for chat-with-PDF on 100+ page docs. Currently `lib/ai/pdf-extract.ts` does naïve truncation.

---

## 2. Architecture — the portable contract

```
  ┌───────────────────────────────────────────────────────────────────┐
  │                    app/api/ai/<op>/route.ts                       │
  │   auth → size/rate limits → router.resolve() → withCreditSpend()  │
  │                  → provider.streamChat() → log                    │
  └──────────┬────────────────────────────────────────┬───────────────┘
             ▼                                        ▼
  ┌────────────────────┐                 ┌────────────────────────────┐
  │  lib/ai/router.ts  │  ───consults───▶│  lib/ai/byok/keystore.ts   │
  │  { providerId,     │                 │  decrypt user BYOK key     │
  │    model, apiKey,  │                 │  return plaintext + id     │
  │    keySource,      │                 │  (zeroize after call)      │
  │    byokKeyId }     │                 └────────────────────────────┘
  └────────┬───────────┘
           ▼
  ┌────────────────────────┐   ┌───────────────────────────────────┐
  │ lib/ai/registry.ts     │──▶│  lib/ai/adapters/<provider>.ts    │
  │ returns AIProvider     │   │  AIProvider interface only.       │
  │ (platform-keyed when   │   │  Accepts per-call apiKey override │
  │  apiKey not given)     │   │  so one adapter serves platform   │
  └────────────────────────┘   │  + BYOK without duplication.      │
                               └────────────────────┬──────────────┘
                                                    ▼
                ┌────────────────────────────────────────────┐
                │  Anthropic / OpenAI / <future provider>    │
                └────────────────────────────────────────────┘

    At the boundary: every request writes ai_usage (provider,
    model, key_source, byok_key_id, tokens_in, tokens_out,
    cost_usd_micro, credits_spent, latency_ms, result).
```

### 2.1 Four immutable rules

These are the rules that let us add a third provider (Google Gemini, Mistral, Groq, whatever) in ~7 files without rewriting the app.

**Rule 1 — the platform owns routing; adapters are interchangeable.**
Route selection lives in `lib/ai/router.ts` and `ai_routes` DB config. Adapters expose capability, never policy. A caller never names a provider directly; it names a capability.

**Rule 2 — `AIProviderId` is an open string.**
Already enforced in `lib/ai/types.ts:24`. Today it's a literal union of `"anthropic" | "openai"`; **change it to `string`** during P1 (same migration as payments did). Adding a new adapter must not require a type change in callers.

**Rule 3 — per-call apiKey, not per-adapter singleton.**
Adapters' `chat()` / `streamChat()` accept an optional `apiKey` parameter. When absent, they fall back to the constructor-time platform key. This is the ONE change that enables BYOK without duplicating adapters. See §4.1.

**Rule 4 — every provider call writes exactly one `ai_usage` row before the response returns.**
No "fire and log later." If we can't persist the usage row, we refund the credit and fail the request. This is the single anchor that makes margin reconciliation, BYOK billing audits, and anomaly detection tractable.

### 2.2 Why this shape specifically

- Mirrors the payments layer exactly, so there's one mental model: `registry → provider → adapter → normalized event → ledger`.
- No provider SDK types leak past the adapter boundary. An Anthropic SDK version bump cannot ripple into route handlers.
- BYOK fits as a key-source decision, not a second code path. One code path, two key sources. Prior BYOK designs that built a parallel adapter tree died of maintenance burden.
- The `ai_usage` table is where both margin reporting and BYOK disputes are resolved. Making it mandatory on the request path prevents "we'll add it later" drift.

---

## 3. Phased timeline — 6 weeks to the zero-leak bar

Phase numbering follows `PAYMENT_GATEWAY_PLAN.md` so the cross-refs are unambiguous. AI Phase N runs **in parallel** with Payments Phase N where possible, since they share the credit ledger.

### Phase A0 — unblock revenue (3 days, parallel with Payments Phase 0)

Goal: the platform can earn a single penny.

- [ ] **Task #72** — add `ANTHROPIC_API_KEY` to Hostinger env. Verify `/api/health` reports `ai.configured = true`. (Blocker for everything downstream.)
- [ ] Optional: add `OPENAI_API_KEY` too, so we have a fallback provider from day one.
- [ ] Redeploy, run `/api/ai/chat` smoke against test account with free credits. Expect a response and exactly one `credit_ledger` row with `reason = 'ai_chat_turn'`.
- [ ] If Pro pack won't launch with BYOK, **edit `lib/pricing.ts:60`** to remove the "BYOK unlocked (+15% infra fee)" feature string. Pricing page must not lie.

### Phase A1 — observability bed (4 days, concurrent with Payments Phase 1)

Goal: every AI call is accounted for, even the failed ones.

- [ ] **Create `ai_usage` table** (schema in §4.2). One row per request, written before response flush.
- [ ] **Add `withCreditSpend(op, multiplier, fn)` helper** in `lib/ai/credits.ts`. Wraps spend → call → log. Single refund path. Replace the 10 route handlers' ad-hoc try/catch with this. See §4.3.
- [ ] **Persist `usage` from terminal chunk.** Adapters already emit `tokensIn` + `tokensOut`; `withCreditSpend` captures them from the terminal `ChatChunk` and inserts the `ai_usage` row.
- [ ] **Fix the spend-check race.** Change `spendCredits` pre-flight to a single `UPDATE credits SET balance = balance - ? WHERE user_id = ? AND balance >= ?` returning `affectedRows`. No separate SELECT.
- [ ] Backfill any existing `chat_messages` rows with `NULL` into `ai_usage` (one-time migration — not required if table is new).

### Phase A2 — harden the request path (4 days)

Goal: an abusive client can't drain the platform key.

- [ ] **Rate limit `/api/ai/*`** per `(user_id, operation, minute)` and `(user_id, day)`. 60 req/min per op, 5k req/day per user. Use Redis if we have it, MySQL if we don't (LOCK + INSERT…ON DUPLICATE KEY UPDATE). Return 429 with Retry-After.
- [ ] **Size-limit request bodies.** `app/api/ai/chat/route.ts` already has some guards; lift them into shared middleware in `lib/api/guard.ts`: 1 MB JSON body max, 10 MB multipart. Reject 413 before any AI call.
- [ ] **Mint idempotency keys server-side.** For every op, derive from stable request identifiers (session id + turn id for chat; upload id + op for tools). Reject client-supplied keys unless they start with the server-minted prefix.
- [ ] **Kill switches per op.** Add `ai_op_enabled` row per op in settings table. If false, route returns 503 without touching credits. Default true.
- [ ] **Timeout every provider call.** Adapter `AbortSignal` wiring — already hinted at in `lib/ai/provider.ts:65`; verify it's plumbed. Default 60s for chat, 120s for OCR, 180s for generate.

### Phase A3 — BYOK implementation (6 days, after Payments Phase 1 — because Pro/Studio must be on sale first)

Goal: Pro users can point the platform at their own Anthropic/OpenAI key and pay a flat 15% infra fee instead of full credits.

- [ ] **`user_api_keys` table.** Schema: `id uuid pk, user_id fk, provider_id string, key_fingerprint char(12), ciphertext bytes, nonce bytes, created_at, last_used_at, revoked_at nullable`. Encryption: libsodium secretbox with a server-side KDK (key-derivation key) stored in env (`BYOK_ENCRYPTION_KEY`, 32 bytes). Ciphertext never leaves the server.
- [ ] **`lib/ai/byok/keystore.ts`** — `storeKey(userId, providerId, plaintext)`, `getActiveKey(userId, providerId)`, `revokeKey(keyId)`, `listKeys(userId)`. Plaintext only exists in-memory for the duration of a single request; zeroize after adapter call returns.
- [ ] **`lib/ai/router.ts`** — consolidates today's `selectProvider` + BYOK decision into one `resolve(userId, op, tier) → { providerId, model, apiKey, keySource, byokKeyId }`. Uses `ai_routes` for policy (out of scope for A3 — use hard-coded defaults initially).
- [ ] **Adapter per-call apiKey override.** Modify `AnthropicProvider.chat/streamChat` to accept `apiKey?: string` param. If present, build a per-call Anthropic client; else use `this.client` (platform key). Same for OpenAI.
- [ ] **`lib/ai/credits.ts:spendInfraFee`** — charges `max(1, ceil(unitCost × 0.15))` with reason `ai_<op>_infra`. Studio seat path writes `amount=0, note='studio_seat'` for audit.
- [ ] **`/app/api-keys` UI** — add / test / revoke keys. Rate-limit the "test" button (3/min) to avoid abuse of the keystore decrypt path.
- [ ] **Route handler wiring** — replace `selectProvider({capability})` with `router.resolve(userId, op, tier)`; pass `apiKey` to adapter method; branch credit path on `keySource`.
- [ ] **Never silently fall back.** If BYOK call 401s (user rotated their key without updating us), **fail the request with a precise error**. Do not retry on platform key — that would violate the prime directive.

### Phase A4 — margin reporting (3 days, after A1)

Goal: we know our true margin per op and per user, daily.

- [ ] **Daily provider cost rollup cron** — query `ai_usage` for the previous day grouped by `(provider_id, model, op)`; post to admin Slack + persist to `ai_daily_margin`.
- [ ] **Per-op margin target.** Declared in `docs/ai/PROVIDER_STRATEGY.md`. Alert if 3-day moving avg falls below target.
- [ ] **BYOK infra-fee reconciliation.** For every user on Pro, monthly total of `ai_<op>_infra` credits × pack price should cover our cost of running the orchestration layer. If it doesn't, the 15% is too low.
- [ ] **Admin UI** — `/admin/ai-spend` page showing last 30 days by provider, model, op, user (top 20). Operators use this to spot anomalies before they invoice.

### Phase A5 — hardening / P3 features (continuous)

- [ ] Tool use (function calling) in adapter interface + capability flag.
- [ ] Native image input instead of raster.
- [ ] Embeddings + vector store for long-doc chat.
- [ ] Model rotation (`ai_routes.model` hot-reload without restart).
- [ ] Canary traffic percentages.

---

## 4. Technical specs

### 4.1 Per-call apiKey override (the BYOK enabler)

```ts
// lib/ai/adapters/anthropic.ts  — change delta
export class AnthropicProvider implements AIProvider {
  // existing constructor-baked client kept for platform path
  private readonly platformClient: Anthropic;
  constructor(opts: { apiKey: string; defaultModel: string }) {
    this.platformClient = new Anthropic({ apiKey: opts.apiKey });
    this.platformApiKey = opts.apiKey;
  }

  // NEW: per-call client factory. Cheap (no network).
  private clientFor(apiKey?: string): Anthropic {
    if (!apiKey || apiKey === this.platformApiKey) return this.platformClient;
    return new Anthropic({ apiKey });
  }

  async *streamChat(input: ChatInput, opts?: { apiKey?: string }) {
    const client = this.clientFor(opts?.apiKey);
    // ... existing streaming code, but reading from `client` instead of
    //     `this.client`. Everything else unchanged.
  }
}
```

**Why this specific shape:**
- No duplicate adapter classes. The BYOK path is one extra arg.
- Platform calls pay zero construction overhead (reuses cached client).
- Per-call clients are not cached by user-id — that would leak a key across requests. They're built, used, dropped. Node's GC is fast enough at our scale.
- Zero change to the `AIProvider` interface signature at today's callers — the `opts` arg is optional.

### 4.2 `ai_usage` table

```sql
CREATE TABLE ai_usage (
  id               CHAR(36) PRIMARY KEY,              -- uuid
  user_id          CHAR(36) NOT NULL,
  operation        VARCHAR(32) NOT NULL,              -- matches AIOperationId
  provider_id      VARCHAR(32) NOT NULL,              -- matches AIProviderId
  model            VARCHAR(64) NOT NULL,              -- "claude-haiku-4-5-20251001"
  key_source       ENUM('platform','byok') NOT NULL,
  byok_key_id      CHAR(36) NULL,                     -- FK user_api_keys.id
  tokens_in        INT NOT NULL DEFAULT 0,
  tokens_out       INT NOT NULL DEFAULT 0,
  cost_usd_micro   BIGINT NOT NULL DEFAULT 0,         -- our side-of-the-ledger cost
  credits_spent    INT NOT NULL DEFAULT 0,            -- what we charged user
  latency_ms       INT NOT NULL,
  result           ENUM('ok','provider_error','user_abort','refund') NOT NULL,
  ledger_id        CHAR(36) NULL,                     -- FK credit_ledger.id
  idempotency_key  VARCHAR(128) NOT NULL,
  request_id       CHAR(36) NULL,                     -- for tracing
  created_at       TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY ux_idempotency (idempotency_key),        -- one row per logical request
  INDEX ix_user_created (user_id, created_at),
  INDEX ix_provider_created (provider_id, created_at),
  INDEX ix_op_created (operation, created_at)
);
```

**Why `cost_usd_micro` not cost_usd:**
Integer math, no float drift. 1 USD = 1,000,000 micro-USD. Anthropic's Haiku at $0.25/Mtok input gives us 0.25 µUSD per token — still exact integers.

**Why unique on `idempotency_key`:**
Makes `INSERT ai_usage` the natural point of request dedup. Replayed requests upsert rather than create a second row, so margin rollups never double-count.

### 4.3 `withCreditSpend` helper

```ts
// lib/ai/credits.ts — adds to existing file
export async function withCreditSpend<T>(args: {
  userId: string;
  operation: AIOperationId;
  multiplier?: number;
  idempotencyKey: string;
  keySource: 'platform' | 'byok';
  byokKeyId?: string;
  run: (ctx: SpendContext) => Promise<{ result: T; tokensIn: number; tokensOut: number; model: string; providerId: string }>;
}): Promise<{ ok: true; value: T } | { ok: false; reason: SpendFailure }> {
  // 1. Spend (full credits on platform, infra fee on BYOK, 0 on studio seat)
  const spend = args.keySource === 'platform'
    ? await spendCredits({ ... })
    : await spendInfraFee({ ... });
  if (!spend.ok) return { ok: false, reason: spend.reason };

  // 2. Call the AI via callback
  const start = Date.now();
  try {
    const out = await args.run(/* SpendContext with ledgerId */);

    // 3. Log ai_usage atomically
    await insertAiUsage({
      ledgerId: spend.ledgerId,
      tokensIn: out.tokensIn,
      tokensOut: out.tokensOut,
      costUsdMicro: computeProviderCost(out.providerId, out.model, out.tokensIn, out.tokensOut),
      creditsSpent: spend.creditsSpent,
      latencyMs: Date.now() - start,
      result: 'ok',
      ...
    });

    return { ok: true, value: out.result };

  } catch (err) {
    // 4. Refund credits, log usage row with result='refund'
    await refundCredits({ userId: args.userId, operation: args.operation, originalIdempotencyKey: args.idempotencyKey, multiplier: args.multiplier });
    await insertAiUsage({ ..., result: 'refund', latencyMs: Date.now() - start });
    throw err;  // route handler surfaces 502 / 503 to client
  }
}
```

**What this replaces:**
Every `app/api/ai/*/route.ts` has its own try/catch around `spendCredits` → `provider.chat()` → `refundCredits` in the error path. Some call the refund from the catch block, some from a finally, a couple don't refund at all. `withCreditSpend` is the single surface that guarantees every error ends in a refund and every success ends in a logged usage row.

### 4.4 Router resolution

```ts
// lib/ai/router.ts — new file
export async function resolve(userId: string, operation: AIOperationId, tier: 'default' | 'deep' = 'default'): Promise<{
  providerId: AIProviderId;
  model: string;
  apiKey: string;         // plaintext, caller zeroizes after use
  keySource: 'platform' | 'byok';
  byokKeyId: string | null;
  creditMultiplier: number;
}> {
  // 1. Eligibility: what plan is the user on?
  const plan = await getUserPlan(userId);
  const byokAllowed = plan === 'pro' || plan === 'studio';

  // 2. Policy lookup (later: ai_routes table; for A3 use hardcoded defaults).
  const policy = DEFAULT_POLICY[operation][tier]; // { providerId, model, creditMultiplier }

  // 3. BYOK decision.
  if (byokAllowed) {
    const key = await keystore.getActiveKey(userId, policy.providerId);
    if (key) return { ...policy, apiKey: key.plaintext, keySource: 'byok', byokKeyId: key.id };
  }

  // 4. Fallback: platform key from registry.
  const platformKey = process.env[PLATFORM_ENV_FOR[policy.providerId]];
  if (!platformKey) throw new AIProviderError(policy.providerId, 'configuration', 'no platform key configured');
  return { ...policy, apiKey: platformKey, keySource: 'platform', byokKeyId: null };
}
```

The route handler becomes:

```ts
// app/api/ai/summarize/route.ts (after A3)
const session = await requireSession();
const route = await router.resolve(session.userId, 'summarize');
const provider = await registry.getProvider(route.providerId);

const result = await withCreditSpend({
  userId: session.userId,
  operation: 'summarize',
  idempotencyKey: mintKey('summarize', body.uploadId),
  keySource: route.keySource,
  byokKeyId: route.byokKeyId,
  run: async () => {
    const res = await provider.chat({ ...input, model: route.model }, { apiKey: route.apiKey });
    return {
      result: res.text,
      tokensIn: res.usage.inputTokens,
      tokensOut: res.usage.outputTokens,
      model: route.model,
      providerId: route.providerId,
    };
  },
});
```

Every AI route has this same 5-line shape after A3.

---

## 5. Env var checklist

Already set (or required by Payments plan):
- `MYSQL_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_*`, `RAZORPAY_*`, `PAYPAL_*`

To add during Phase A0:
- [ ] `ANTHROPIC_API_KEY` — platform Anthropic key (required for chat/summarize/translate/ocr/compare/rewrite/table/redact/generate/sign). Set to the `sk-ant-api03-…` from the Anthropic console. Task #72.
- [ ] `ANTHROPIC_MODEL` — optional override. Default `claude-haiku-4-5-20251001`.
- [ ] `OPENAI_API_KEY` — optional. Platform fallback.
- [ ] `OPENAI_MODEL` — optional override. Default `gpt-4o-mini`.

To add during Phase A3:
- [ ] `BYOK_ENCRYPTION_KEY` — 32-byte libsodium secret. Generate with `openssl rand -base64 32`. **DO NOT ROTATE without a migration plan** (existing ciphertexts become unreadable).

To add during Phase A4:
- [ ] `AI_SPEND_ALERT_SLACK_URL` — Slack webhook for daily margin alerts.

---

## 6. Test plan

### 6.1 Unit tests (in repo)

| # | Case | Assertion |
|---|---|---|
| A1 | `spendCredits` on balance 5, op cost 3 | balance becomes 2, ledger row -3 |
| A2 | `spendCredits` × 2 concurrent on balance 5, op cost 3 | exactly one succeeds, one returns `insufficient` (after race fix) |
| A3 | `spendCredits` same idempotency key twice | second returns `duplicate`, balance unchanged |
| A4 | `refundCredits` on valid ledger row | balance increases, refund row inserted |
| A5 | `withCreditSpend` on provider throwing | credit refunded, ai_usage row has result='refund' |
| A6 | `withCreditSpend` on successful call | one ledger row + one ai_usage row + no duplicates |
| A7 | `withCreditSpend` with BYOK keySource | infra fee row (reason=ai_<op>_infra) not full-cost row |
| A8 | BYOK key decrypt then re-encrypt roundtrip | plaintext matches input, ciphertext differs each time (nonce) |
| A9 | `router.resolve` on Starter plan | keySource='platform' regardless of stored BYOK key |
| A10 | `router.resolve` on Pro plan with active BYOK | keySource='byok' |
| A11 | `router.resolve` on Pro plan, no BYOK key | keySource='platform' |
| A12 | Adapter per-call apiKey override | platform client not used; ephemeral client instantiated |

### 6.2 Integration tests

| # | Case | Assertion |
|---|---|---|
| I1 | `/api/ai/chat` end-to-end with test credits | response 200, ledger -1, ai_usage result=ok, tokens_in > 0 |
| I2 | `/api/ai/chat` with 0 credits | 402 `insufficient_credits`, no provider call, no ai_usage row |
| I3 | `/api/ai/summarize` with Anthropic unreachable (mock 500) | 502 to client, credit refunded, ai_usage row with result='refund' |
| I4 | `/api/ai/ocr` on 5-page PDF | ledger -10 (ocr=2, multiplier=5), ai_usage row with credits_spent=10 |
| I5 | `/api/ai/chat` rate limit breach | 429 with Retry-After, no ledger row |
| I6 | `/api/ai/chat` body > 1MB | 413, no ledger row |
| I7 | BYOK request with revoked key | 400 `byok_key_revoked`, NOT silent platform fallback |
| I8 | BYOK request with invalid key (provider 401) | 502 `byok_provider_auth`, NOT silent platform fallback, infra fee refunded |
| I9 | Two concurrent /api/ai/chat for same user | no ledger inconsistency; both succeed if balance sufficient |

### 6.3 Live smoke (production, post-deploy checklist)

1. Sign in as test account, verify `/api/health` reports `ai.configured = true` + commit SHA matches.
2. Hit chat with "hello" → 200 with text response.
3. Check admin: one `credit_ledger` row (-1), one `ai_usage` row with tokens_in≈10.
4. Intentionally revoke `ANTHROPIC_API_KEY` via env change; hit chat → 502, credits NOT debited.
5. Re-add key, redeploy, hit chat → 200. No orphaned `ai_usage` rows from step 4.
6. Exceed rate limit with curl loop → 429 after threshold; no partial debits.

---

## 7. Operations playbook

### 7.1 Monitoring signals

| Signal | Threshold | Action |
|---|---|---|
| `/api/ai/*` 5xx rate | > 2% over 10 min | Page; check provider status page; flip kill switch if needed |
| Daily provider cost | > $X (founder-picked; see Q2) | Page; check for abusive user; consider rate-limit tightening |
| Provider p95 latency | > 20s for 10 min | Warn; consider falling back to secondary provider |
| `ai_usage` rows per user per hour | > 500 | Alert: possible runaway; throttle that user's key |
| BYOK call 401 rate per user | > 5 in 24h | Email user to update/rotate their key |
| Refund-to-success ratio | > 5% per op over 1h | Page; adapter or provider is broken |

### 7.2 Monthly margin check

First of every month:
1. Run `ai_daily_margin` rollup for previous month.
2. For each op, compute `SUM(credits_spent × avg_credit_price_usd) - SUM(cost_usd_micro / 1e6)`.
3. If any op margin < target, either (a) raise `AI_OPERATION_COSTS`, (b) switch default model, or (c) cap per-day per-user.
4. For BYOK: verify `SUM(infra fee credits)` covers our infrastructure cost for that user's volume. Adjust the 15% if needed.

### 7.3 Incident response

**Provider outage:**
1. Confirm via provider status page.
2. If fallback provider configured: flip `AI_PREFERRED_PROVIDER` env (Phase A5) — requires redeploy OR hot-reload if wired.
3. If no fallback: flip kill switch for affected ops. Users see 503 "temporarily unavailable"; no credits charged.
4. Post-incident: audit refund completeness. `ai_usage` rows with `result='refund'` must each have a matching positive `credit_ledger` row.

**Leaked platform API key:**
1. Revoke in provider console immediately.
2. Rotate the env var on Hostinger.
3. Rolling deploy — short window where some containers have old key, some have new; both valid until the old one is revoked, so fine.
4. Audit last 24h of `ai_usage` for unusual cost spikes.

**Leaked user BYOK key:**
1. User reports via support.
2. `UPDATE user_api_keys SET revoked_at = NOW() WHERE id = ?` — takes effect on next call (router re-checks every request per BYOK_DECISION_MATRIX §2).
3. Email user to confirm + add a new key.

---

## 8. Revenue-leak checklist (the "no single penny" bar)

Maps 1:1 to the 28 leaks in `REVENUE_LEAK_AUDIT.md`. A shippable AI layer closes at least L1–L20 (the ones tagged P0/P1 in that doc).

| Leak | Closed by |
|---|---|
| L-1.1 Credit grant without payment | Payments Phase 1 (webhook idempotency) |
| L-1.2 Credit grant larger than payment | Payments §4 normalized event validation |
| L-2.1 AI call without credit debit | `withCreditSpend` wrapper mandates spend-before-call |
| L-2.2 AI call credited twice | Idempotency key on `spendCredits` + unique on `ai_usage.idempotency_key` |
| L-2.3 AI call fails, no refund | `withCreditSpend` catch block refunds + logs result='refund' |
| L-2.4 Client retries mid-stream | Server-minted idempotency keys; route handlers reject client values |
| L-3.3 BYOK fraud (invalid key, charge infra fee anyway) | Adapter auth check pre-flight; if key invalid, refund infra fee |
| L-4.x Reconciliation gaps | `ai_usage` + Payments recon cron cross-check |
| L-5.x Overdraft | `spendCredits` conditional UPDATE (Phase A1) |
| L-6.x Dispute evidence | `ai_usage` row is the evidence; 90-day retention |
| L-7.x Subscription entitlement | Studio seat check in router; audit via ledger reason='ai_*_infra' with amount=0 |
| L-8.x Margin erosion | Daily rollup + alert (Phase A4) |
| L-9.x Webhook dedup | Payments Phase 1 |
| L-10.x Currency / FX drift | Pay scheme is credits-based, decoupled from FX |
| L-11.x Abuse / runaway | Rate limits + size limits (Phase A2) |
| L-12.x Refund-to-cash fraud | Only credits refunded, never cash; cash refunds go through `refund-actions.ts` with reconciliation |
| L-13.x Anomaly detection | Per-user-per-hour threshold alert (Phase A4) |

L-14 through L-28 are either covered by the Payments plan or are P3 (post-revenue).

---

## 9. Adding a third AI provider (future-proof check)

Test: adding Google Gemini as a provider should touch **exactly 7 files**:

1. `lib/ai/types.ts` — add `"gemini"` to `AIProviderId` (or already `string` after Rule 2 → zero change here).
2. `lib/ai/adapters/gemini.ts` — new file, implements `AIProvider`.
3. `lib/ai/registry.ts` — one new ADAPTERS row, `isConfigured: () => Boolean(process.env.GEMINI_API_KEY)`.
4. `lib/ai/router.ts:DEFAULT_POLICY` — add Gemini to any op where it's the policy winner.
5. `lib/ai/credits.ts:computeProviderCost` — add Gemini pricing table.
6. Hostinger env — set `GEMINI_API_KEY`.
7. `docs/ai/MODELS_AND_MULTI_KEY.md` — document routing decisions.

Zero changes to: route handlers, `withCreditSpend`, the ledger, the payments layer, any UI file. **If any of those need edits, we broke the portability contract.**

---

## 10. Open questions (need founder / dev decision before Phase A3 starts)

| # | Question | Status |
|---|---|---|
| Q1 | Do we ship **OpenAI as fallback** from day one, or Anthropic-only? Costs $0 to add the key, but we then own the routing decision. | Decide before Phase A1 |
| Q2 | What's the daily provider-cost page threshold? ($50? $200?) Affects how we size the budget alerts. | Decide before Phase A4 |
| Q3 | Do we keep "BYOK unlocked (+15% infra fee)" in the Pro pack copy if BYOK ships 2 weeks later than Pro goes on sale? | **Blocker for Payments Phase 1 if yes.** Fix: edit `lib/pricing.ts:60` to remove the bullet until A3 lands. |
| Q4 | Studio seat = $49/mo is advertised — but we have no seat table. Does Studio ship as "unlimited BYOK, 0 credits" or as "flat credit refill"? | Decide before Phase A3 |
| Q5 | Where does `ai_routes` config live? DB row editable via `/admin`, or hardcoded in `lib/ai/router.ts`? | DB-backed is P2; hardcoded for A3 works fine. |
| Q6 | Do we retain full request/response bodies in `ai_usage` for audit, or just tokens/latency? Full body = 10× storage, enables perfect dispute resolution. | Default: tokens + latency only. Add `ai_usage_full` opt-in table for debug. |
| Q7 | Who owns the "abuse" page when a user's OCR call fires 1000× in an hour? | Same owner as Payments dispute SLA (see Payments Q4). |

---

## 11. Timeline summary

Assuming Payments Phase 0 clears by 2026-04-25:

| Phase | Days | Earliest start | Earliest complete |
|---|---|---|---|
| A0 platform key live | 1 | 2026-04-21 (today +1) | 2026-04-22 |
| A1 observability bed | 4 | 2026-04-28 (after Payments Phase 1 starts) | 2026-05-02 |
| A2 harden request path | 4 | 2026-05-03 | 2026-05-07 |
| A3 BYOK | 6 | 2026-05-11 (after Payments Phase 1 done) | 2026-05-17 |
| A4 margin reporting | 3 | 2026-05-18 | 2026-05-21 |
| A5 P3 features | — | ongoing | — |

**AI layer zero-leak bar reached: ~2026-05-17** (same week as Payments go-live).

---

## 12. Definition of done

The AI layer is "zero-leak shippable" when:

1. ✅ Every row in `credit_ledger` with `reason LIKE 'ai_%'` has a matching `ai_usage` row.
2. ✅ Every `ai_usage` row with `result='ok'` has `credits_spent > 0` (or `key_source='byok'` and a matching infra-fee row).
3. ✅ `SUM(credit_ledger.delta WHERE user_id=X) = credits.balance[X]` for every user, proven by a nightly invariant check cron.
4. ✅ Every `/api/ai/*` route goes through `withCreditSpend`.
5. ✅ No route handler calls an adapter directly (grep test: `grep -r "provider\.streamChat\|provider\.chat" app/api/ai` returns only calls wrapped in `withCreditSpend`).
6. ✅ Rate limit + body size guard is enforced before any credit touch.
7. ✅ BYOK key material is never logged, never returned to client, never persisted in plaintext.
8. ✅ Daily margin rollup runs green for 7 consecutive days before GA.

---

## 13. References

- `docs/ai/architecture.md`
- `docs/ai/PROVIDER_STRATEGY.md`
- `docs/ai/MODELS_AND_MULTI_KEY.md`
- `docs/ai/BYOK_DECISION_MATRIX.md`
- `docs/ai/REVENUE_LEAK_AUDIT.md`
- `docs/payments/PAYMENT_GATEWAY_PLAN.md`

This is the file to read at the start of any AI-layer work. Every other AI doc in `docs/ai/` is a deeper dive on one section of this plan.
