// Pricing data — credit packs, Plus plan, and FAQ.
// Ported verbatim from prototype pricing.jsx.

export type CreditPackId = "starter" | "creator" | "pro" | "studio";

/**
 * Variant of a credit pack purchase.
 *
 * Task #27 / Phase E introduces `"annual"` — a one-time purchase of
 * 12× credits at a 20% price discount. We model this as a variant of
 * the existing monthly pack rather than a separate SKU because:
 *
 *   (a) it reuses the same checkout plumbing (router, adapters,
 *       webhooks, ledger) — only the `amountMinor` + credits-granted
 *       numbers change,
 *   (b) it matches the /pricing FAQ line "Annual plans save 20%" that
 *       has been public since v1,
 *   (c) monthly and annual share the same underlying margin model:
 *       the AI cost per credit is invariant, so a 20% price discount
 *       on 12× credits lands us at Starter 86.5% / Creator 89.0% /
 *       Pro 87.8% / Studio 87.1% net margin (vs the monthly claims
 *       of 88% / 83% / 78% / 73%), verified in
 *       docs/ai/MARGIN_VERIFICATION.md §12.3 S1 margin table.
 *
 * Keeping this an explicit union (not a boolean flag) lets the UI,
 * checkout action, admin rollup, and DB row all speak the same
 * word — "annual" vs "monthly" — instead of inferring meaning from
 * a 0/1 that lands weird in logs.
 */
export type PackVariant = "monthly" | "annual";

/**
 * Annual-prepay price discount, in basis points (10_000 = 100%).
 *
 *   ANNUAL_DISCOUNT_BPS = 2000 → 20% off the 12× monthly equivalent.
 *
 * Rationale for 20% specifically:
 *   - Matches the longstanding /pricing FAQ claim (changing the number
 *     retroactively would be a copy-change + growth-post-mortem).
 *   - Anchored on the "annual discount" norm in SaaS pricing — 16–20%
 *     is the typical band (Basecamp 16%, Notion 20%, Linear 25%).
 *     Landing in the middle of that band keeps us competitive without
 *     pricing ourselves into a margin hole.
 *   - Our margin headroom under cheap routing can absorb
 *     a 20% discount across all four packs and still clear the 85%
 *     floor on Creator/Pro/Studio (see §12.3 S1). Starter dips to
 *     ~86.5% — still the healthiest credit pack in SaaS we know of.
 *
 * Multiplier for annual credits: 12 (12 months). We do NOT multiply
 * the `bonus` field because the bonus is positioned in UI as a
 * "buy this month, get X more" offer — layering it 12× on an annual
 * purchase would break the cost ratio sketched in MARGIN_VERIFICATION.
 */
export const ANNUAL_DISCOUNT_BPS = 2000;
export const ANNUAL_MONTHS = 12;

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
   * Per-pack INR price for the Razorpay rail (Task #27 / Phase E).
   *
   * `undefined` falls back to `price × USD_TO_INR_RATE` (the legacy
   * Task #20 conversion). Explicit non-undefined values override —
   * this is where we anchor region-appropriate pricing (typically
   * at or below the raw conversion to match the Indian SaaS market
   * norm). Reviewed alongside every USD_TO_INR_RATE bump.
   *
   * Units: whole INR (NOT paise). `packAmountMinor(pack, "INR")`
   * multiplies by 100 to get paise, matching Razorpay's amount
   * convention.
   */
  inrPrice?: number;
  /**
   * Claimed gross margin percentage shown on the /pricing page.
   *
   * IMPORTANT: This number is an AI-cost-only headline figure under
   * "cheap routing" (Gemini Flash for OCR+translate, GPT-4o-mini for
   * chat+rewrite, Haiku for mid-tier, Sonnet for deep-tier). It does
   * NOT yet subtract:
   *   - processor fees (Razorpay INR 2%×1.18 on IN volume;
   *     international rail TBD — Paddle was retired 2026-05-01 and
   *     the next gateway's processor-fee structure will land here
   *     when wired)
   *   - support cost amortisation (~$0.50–$1.50/paid-user/month)
   *   - refund / chargeback drag
   *   - FX spread on USD→INR payout
   *   - GST or income tax (pass-through, not cost)
   *
   * Actual net margin (Razorpay rail) under realistic ops mix
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
    // Task #27: anchor Starter at ₹399 — below the raw USD×84 = ₹420
    // conversion. Indian market norm is sub-₹500 for a try-it SKU,
    // and the better INR checkout conversion (Razorpay 2% flat) keeps
    // unit economics healthy.
    inrPrice: 399,
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
    // Task #27: Creator at ₹1,499 — raw conversion says ₹1,596. The
    // round-number discount ("under ₹1.5k") is a documented Indian
    // SaaS anchor pattern, and the margin model in §12.3 S1
    // accommodates it.
    inrPrice: 1499,
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
    // Task #27: Pro at ₹4,999 — raw conversion ₹4,956, rounded up to
    // the natural psychological anchor. Pro's margin is tightest so
    // we don't undercut the conversion here.
    inrPrice: 4999,
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
    // Task #27: Studio at ₹12,499 — raw conversion ₹12,516. Team SKU,
    // typically a procurement purchase not a credit-card impulse, so
    // we don't PPP-discount further.
    inrPrice: 12499,
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
 *   - "USD" → cents (pack.price × 100) — the international rail path
 *             (currently unused; reserved for the next gateway).
 *   - "INR" → paise (pack.inrPrice × 100) if the pack has a dedicated
 *             INR anchor (Task #27), else the legacy
 *             pack.price × USD_TO_INR_RATE × 100 fallback — Razorpay path.
 *
 * Task #27 / Phase E extensions:
 *   - `opts.variant` = "annual" applies a 12× multiplier to the base
 *     price and then a 20% discount (ANNUAL_DISCOUNT_BPS), giving the
 *     user 12 months of the pack's credits in one charge for 80% of
 *     the 12-month price.
 *   - `opts.promoDiscountMicros` subtracts an absolute discount (in
 *     the billing currency's micros) after the variant pricing. Promo
 *     applies to the post-variant subtotal — so an ANNUAL promo
 *     doesn't double-dip on the base annual discount unless the
 *     campaign explicitly stacks.
 *   - `opts.promoDiscountBps` applies a percentage discount (in basis
 *     points) after the variant pricing. Resolver picks exactly one
 *     of `promoDiscountMicros` / `promoDiscountBps` depending on
 *     promo kind; the other is undefined. Both-undefined = no promo.
 *
 * Return value is floored at 0 — a 100%-off promo on an annual Starter
 * returns `0` rather than a negative amount (which would fail the
 * adapter at the provider side).
 *
 * A Currency this module doesn't recognize falls back to USD cents so
 * callers fail closed to deterministic math rather than throwing
 * mid-checkout.
 */
export function packAmountMinor(
  pack: CreditPack,
  currency: "USD" | "INR",
  opts?: {
    variant?: PackVariant;
    promoDiscountMicros?: number;
    promoDiscountBps?: number;
  }
): number {
  const variant: PackVariant = opts?.variant ?? "monthly";

  // Base price in whole units of the target currency.
  let basePrice: number;
  if (currency === "INR") {
    basePrice = pack.inrPrice ?? pack.price * USD_TO_INR_RATE;
  } else {
    basePrice = pack.price;
  }

  // Annual variant: 12× months, minus the annual discount.
  // Formula chosen to keep intermediate math in whole-unit land:
  //   monthly_subtotal × 12 × (10_000 − ANNUAL_DISCOUNT_BPS) / 10_000
  // For ANNUAL_DISCOUNT_BPS = 2000 this gives × 9.6.
  let subtotalMinor: number;
  if (variant === "annual") {
    const annualSubtotal =
      (basePrice * ANNUAL_MONTHS * (10_000 - ANNUAL_DISCOUNT_BPS)) / 10_000;
    subtotalMinor = Math.round(annualSubtotal * 100);
  } else {
    subtotalMinor = Math.round(basePrice * 100);
  }

  // Promo discount — exactly one of the two forms will be set; both
  // being undefined means "no promo".
  if (typeof opts?.promoDiscountBps === "number") {
    const disc = Math.floor(
      (subtotalMinor * opts.promoDiscountBps) / 10_000
    );
    subtotalMinor = Math.max(0, subtotalMinor - disc);
  }
  if (typeof opts?.promoDiscountMicros === "number") {
    // promoDiscountMicros is billing-currency micros (1e-6 units);
    // our subtotal is in minors (1e-2 units). Convert before subtracting.
    const discMinor = Math.floor(opts.promoDiscountMicros / 10_000);
    subtotalMinor = Math.max(0, subtotalMinor - discMinor);
  }

  return subtotalMinor;
}

/**
 * Credits granted for a pack purchase, accounting for annual variant.
 *
 * Monthly: pack.credits (+ pack.bonus if present, expiring).
 * Annual: pack.credits × 12 (+ pack.bonus once, NOT multiplied — see
 *         ANNUAL_DISCOUNT_BPS JSDoc for rationale).
 *
 * Returns { paid, bonus, bonusExpiresDays } so the ledger grant in
 * lib/payments/ledger.ts can split paid vs bonus credits (paid never
 * expire; bonus expires after bonusExpiresDays). Matches the shape
 * of the existing ledger.ts grant logic.
 */
export function packCreditsForVariant(
  pack: CreditPack,
  variant: PackVariant
): { paid: number; bonus: number; bonusExpiresDays: number | null } {
  const bonusExpiresDays = pack.bonusExpires ?? null;
  if (variant === "annual") {
    return {
      paid: pack.credits * ANNUAL_MONTHS,
      bonus: pack.bonus ?? 0,
      bonusExpiresDays,
    };
  }
  return {
    paid: pack.credits,
    bonus: pack.bonus ?? 0,
    bonusExpiresDays,
  };
}

/**
 * Display-layer helper for the /pricing page.
 *
 * Returns `{ monthly, annual }` prices in whole units of the given
 * currency. Used by the pack card component to render the "annual
 * saves 20%" toggle without duplicating the variant math at the UI
 * layer.
 */
export function packDisplayPrices(
  pack: CreditPack,
  currency: "USD" | "INR"
): { monthly: number; annual: number; annualSavings: number } {
  const monthly = packAmountMinor(pack, currency, { variant: "monthly" });
  const annual = packAmountMinor(pack, currency, { variant: "annual" });
  // What the user "would have paid" at 12× the monthly — annual is
  // 80% of that. The savings in minor units is the gap.
  const annualFullPrice = monthly * ANNUAL_MONTHS;
  return {
    monthly,
    annual,
    annualSavings: annualFullPrice - annual,
  };
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

// --- Multiplier pricing feature flag (2026-05-02, plan §3 + §14) ----------
//
// PLAN §3 schedules translate/redact/sign to switch from flat per-doc
// pricing to a size-based multiplier (chunkCount for translate,
// pageCount for redact + sign). The actual route refactor (move text
// extraction + chunking BEFORE spendCredits so we can compute the
// multiplier upfront) is deferred to a follow-up commit (Day 1.7) —
// it's a 3-route refactor that touches text extraction order and
// spend/refund correctness; landing it under the same commit as the
// supply-chain scrub + badge removal would mix risk profiles.
//
// What ships TODAY:
//   - This env-var helper, exported and ready to consume.
//   - Default value `true` so the flag is on the moment Day 1.7 wires
//     the multiplier-aware spend calls (no second deploy needed to
//     activate once the route work lands).
//   - Day 1.7 callers will gate the multiplier with this helper:
//
//       const mult = isMultiplierPricingEnabled() ? pageCount : 1;
//       await spendCredits({ ..., multiplier: mult });
//
//     If complaints spike post-deploy, flip MULTIPLIER_PRICING_ENABLED
//     to "false" via Hostinger panel — no redeploy, ~30s effect window
//     (Next.js process picks up the new env var on the next request
//     evaluation; older worker pools may need a restart but the panel
//     toggle handles that automatically).
//   - Removing the helper after 14 days of clean margin data is the
//     completion criterion for this part of the plan.
//
// IMPORTANT: this helper does NOT read `process.env` at module-load
// time. It reads on every call so a Hostinger-panel toggle takes
// effect on the next request — no rebuild required.
export function isMultiplierPricingEnabled(): boolean {
  // Treat anything but explicit "false" as enabled. This makes the
  // default behaviour (env var unset) match production's intended
  // post-Day-1.7 state. To roll back, set MULTIPLIER_PRICING_ENABLED=false.
  return process.env.MULTIPLIER_PRICING_ENABLED !== "false";
}

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
    a: "Free tools run entirely in your browser — files never leave your device. With AI tools, uploads are encrypted in transit and the document itself is never stored (only metadata); the results you generate are saved to your history and deletable anytime. Nothing you send is ever used for training.",
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
    a: "Not yet — a public REST API is on our roadmap. Today, Pro+ users can bring their own OpenAI, Anthropic or Google key (BYOK) to run on their own model quotas at a flat 15% infra fee.",
  },
];
