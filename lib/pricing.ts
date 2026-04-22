// Pricing data — credit packs, Plus plan, and FAQ.
// Ported verbatim from prototype pricing.jsx.

export type CreditPackId = "starter" | "creator" | "pro" | "studio";

export type CreditPack = {
  id: CreditPackId;
  name: string;
  credits: number;
  price: number;
  pp: number; // price per credit
  tagline: string;
  popular?: boolean;
  bonus?: number;
  bonusExpires?: number; // days
  /**
   * Claimed gross margin percentage shown on the /pricing page.
   *
   * IMPORTANT: This number is an AI-cost-only headline figure under
   * "cheap routing" (Gemini Flash for OCR+translate, GPT-4o-mini for
   * chat+rewrite, Haiku for mid-tier, Sonnet for deep-tier). It does
   * NOT yet subtract:
   *   - processor fees (Razorpay INR 2%×1.18 on IN volume;
   *     Paddle MoR 5% + $0.50 on intl volume — per D4, 2026-04-20,
   *     see docs/payments/MOR_EVALUATION.md)
   *   - support cost amortisation (~$0.50–$1.50/paid-user/month)
   *   - refund / chargeback drag
   *   - FX spread on USD→INR payout
   *   - GST or income tax (pass-through, not cost)
   *
   * Actual net margin post-Paddle under realistic ops mix
   * (docs/ai/MARGIN_VERIFICATION.md §12.3 S1):
   *   Starter: 88.5% / Creator: 90.8% / Pro: 90.2% / Studio: 89.3%
   *
   * Until the routing policy + Gemini adapter ship (tasks #80 / A5 in
   * master plan), cheap routing is aspirational and Haiku-all routing
   * hits Starter ~84.7% / Creator ~85.1% / Pro ~82.5% / Studio ~79.9%
   * on realistic mix, dropping sharply under worst-case scenarios
   * (S3 chat whale, S7 support-heavy Starter — see §9 and §12).
   *
   * Public pricing copy MUST read "up to" this % until Phase A4 daily
   * margin rollup shows 7 consecutive green days at claim-or-better.
   */
  margin: number;
  features: string[];
};

export const CREDIT_PACKS: readonly CreditPack[] = [
  {
    id: "starter",
    name: "Starter",
    credits: 100,
    price: 5,
    pp: 0.05,
    tagline: "Try the AI tools",
    margin: 88,
    features: ["100 credits", "Never expire", "All AI tools", "Email support"],
  },
  {
    id: "creator",
    name: "Creator",
    credits: 500,
    price: 19,
    pp: 0.036,
    tagline: "Most popular",
    popular: true,
    bonus: 25,
    bonusExpires: 30,
    margin: 83,
    features: [
      "500 credits + 25 bonus",
      "Paid credits never expire",
      "Priority processing",
      "Share with team",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    credits: 2000,
    price: 59,
    pp: 0.027,
    tagline: "For power users",
    bonus: 200,
    bonusExpires: 30,
    margin: 78,
    features: [
      "2000 + 200 bonus",
      "BYOK unlocked (+15% infra fee)",
      "Priority processing",
      "API access · 99.9% SLA",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    credits: 6000,
    price: 149,
    pp: 0.022,
    tagline: "For small teams",
    bonus: 800,
    bonusExpires: 30,
    margin: 73,
    features: [
      "6000 + 800 bonus",
      "BYOK unlimited · $49/seat infra",
      "Team workspace & pooling",
      "SSO · audit log · DPA",
    ],
  },
] as const;

// --- Dual-rail currency conversion (Phase C / Task #20) -------------------
//
// Approximate USD→INR conversion used ONLY at display/checkout time to
// price an IN-routed purchase in INR paise. This is intentionally a
// const, not a live FX feed:
//
//   - The actual charge is fixed in INR at checkout creation time;
//     fluctuation after that is irrelevant (the customer sees one price).
//   - The adapter's reconciliation path captures the real fee/tax/FX
//     breakdown from the provider webhook and records it in
//     credit_ledger.fx_rate_used + fx_slippage_micros (Task #15 cols).
//     That's the audit-correct rate, not this display approximation.
//   - A per-pack INR pricing table lives in Task #27 ("Annual-prepay
//     tier + INR pricing + promo codes"). When that ships, this helper
//     gets replaced with a per-pack lookup; the const stays only as a
//     fallback for packs the INR table doesn't yet enumerate.
//
// Revision cadence: bump when the mid-market rate moves > 3% for a
// sustained week. Last reviewed 2026-04-22 (RBI ref ~83.3 INR/USD,
// rounded up for headroom).
export const USD_TO_INR_RATE = 84;

/**
 * Pack price in the smallest currency unit for the rail's billing currency.
 *
 *   - "USD" → cents (pack.price × 100) — the Paddle path.
 *   - "INR" → paise (pack.price × USD_TO_INR_RATE × 100, rounded) — Razorpay path.
 *
 * A Currency this module doesn't recognize falls back to USD cents so
 * callers fail closed to the existing Paddle-rail math rather than
 * throwing mid-checkout.
 */
export function packAmountMinor(
  pack: CreditPack,
  currency: "USD" | "INR"
): number {
  if (currency === "INR") {
    return Math.round(pack.price * USD_TO_INR_RATE * 100);
  }
  return pack.price * 100;
}

// --- AI operation costs (Phase 5) -----------------------------------------

/**
 * Stable ID for every AI operation we charge credits for. Stored against
 * ledger rows (`credit_ledger.reason` is free-form text, but we match
 * against these for audit). Add a new entry here BEFORE shipping a new
 * feature — the route handler imports `AI_OPERATION_COSTS[op]` and a
 * missing entry is a TS error at build time.
 */
export type AIOperationId =
  | "chat_turn"
  | "summarize"
  | "translate"
  | "ocr"
  | "compare"
  // Phase 5.6 — five new AI tools.
  | "rewrite"
  | "table"
  | "redact"
  | "generate"
  | "sign";

/**
 * Flat per-operation credit cost. Single number, no metered variant —
 * the user picked "flat per-op cost" in scoping so a 1-credit chat turn
 * is always 1 credit whether the response is 50 tokens or 800.
 *
 * Rationale:
 *   - Predictable for users. They can see the count on every button.
 *   - Implementation simpler: we debit once up front, refund once on
 *     error. No mid-stream proration.
 *   - Cost to us averages out over a day of usage. Token-metered
 *     billing makes sense at scale; for now simplicity wins.
 *
 * If we ever want metered billing, swap the value for a function
 * `(usage) => credits` — the call sites take `AI_OPERATION_COSTS[op]`
 * as-is, so a number→function change is a narrow refactor.
 */
export const AI_OPERATION_COSTS: Record<AIOperationId, number> = {
  chat_turn: 1,
  summarize: 3,
  translate: 5,
  ocr: 2,
  // Compare is flat-priced per diff (not per-page) because the work is
  // bounded by a combined-char budget on the input side and a single
  // structured prompt on the output side — independent of page count.
  compare: 15,
  // Phase 5.6 — flat per-doc costs to match the registry's user-facing
  // labels. ai-rewrite/ai-redact charge per-doc (not per-page) for v1
  // simplicity; the metered "~3/page" / "~2/page" UI strings in
  // lib/tools.ts are aspirational. We can switch to multiplier-based
  // metering by calling spendCredits({ multiplier: pageCount }) once we
  // have a pricing committee.
  rewrite: 3,
  table: 3,
  redact: 5,
  generate: 20,
  sign: 10,
};

export const PRICING_FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Do credits expire?",
    a: "Paid credits never expire. Bonus credits from promotional packs expire 30 days after purchase.",
  },
  {
    q: "Are the free tools actually free?",
    a: "Yes — they run entirely in your browser via WebAssembly. No signup, no watermarks, no daily limits, no server cost to us, no data leaves your device.",
  },
  {
    q: "How is credit cost calculated?",
    a: "Each tool has a base credit cost plus metered usage (pages, output tokens). We always round up to the nearest credit, and we apply a small overhead floor to cover pipeline costs. Exact formula shown before every run.",
  },
  {
    q: "Can I bring my own API key?",
    a: "Yes, from the Pro tier. Pro charges a flat 15% infra fee for the orchestration layer (RAG, chunking, retries, caching, audit log). Studio is $49/seat/mo for unlimited BYOK with no per-call fee.",
  },
  {
    q: "What happens to my files?",
    a: "Encrypted in transit and at rest, auto-deleted within 60 minutes. Zero-retention AI endpoints — nothing you send is ever used for training.",
  },
  {
    q: "Do you offer refunds?",
    a: "Unused credits are refundable within 14 days. Consumed credits are non-refundable.",
  },
  {
    q: "Do you have volume discounts?",
    a: "Yes — accounts spending $500+/mo auto-qualify for Pro pricing. Annual plans save 20%. Enterprise contracts start at $2k/mo.",
  },
  {
    q: "Do you have an API?",
    a: "REST + webhooks, SDKs for JS/Python/Go. Free tier: 200 calls/month. Paid usage metered in credits, same rates as the web app.",
  },
];
