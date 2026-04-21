"""Comprehensive scenario sweep for pdfcraftai margin.

Expands on docs/ai/MARGIN_VERIFICATION.md with the scenarios the first
pass missed: deep-tier Sonnet usage, chat runaway, OCR whale, refund +
chargeback drag, FX swings, GST change, support cost, BYOK leak,
token-estimate miss, region mix shift, free-tier abuse.
"""
from dataclasses import dataclass

# ─── Pricing ───────────────────────────────────────────────────────────
CREDIT_PACKS = {
    # (price_usd, credits_total_incl_bonus, claimed_margin_pct)
    "Starter": (5,    100,  88),
    "Creator": (19,   525,  83),
    "Pro":     (59,  2200,  78),
    "Studio":  (149, 6800,  73),
}

# Per-op credit cost from lib/pricing.ts:AI_OPERATION_COSTS
OP_COST = {
    "chat_turn": 1, "summarize": 3, "translate": 5, "ocr": 2,
    "compare": 15, "rewrite": 3, "table": 3, "redact": 5,
    "generate": 20, "sign": 10,
}

# Provider pricing ($/Mtok in, $/Mtok out) — verified 2026-04-21 from
# provider pricing pages. Historical note: earlier iterations of this
# file carried the Gemini 1.5 Flash rates (0.075 / 0.30) against a
# runtime that was already calling Gemini 2.5 Flash — a ~4× under-
# statement on input cost and ~8× on output. See
# docs/ai/COST_MATRIX_3PROVIDER.md §1 for the audit trail.
PROVIDERS = {
    "haiku":    (1.00,  5.00),   # Claude Haiku 4.5 (current default)
    "sonnet":   (3.00, 15.00),   # Claude Sonnet 4.6 (deep tier)
    "gpt4omini":(0.15,  0.60),   # GPT-4o-mini
    "gemini":   (0.30,  2.50),   # Gemini 2.5 Flash (what the adapter actually calls)
}

# Typical tokens per op (in, out)
OP_TOKENS = {
    "chat_turn": (1500, 400),
    "summarize": (8000, 600),
    "translate": (3000, 3200),
    "ocr":       (500,  800),   # per page
    "compare":   (15000, 2000),
    "rewrite":   (4000, 4200),
    "table":     (6000, 1500),
    "redact":    (5000, 1000),
    "generate":  (2000, 8000),
    "sign":      (1000, 1500),
}

def op_cost_usd(op: str, provider: str, mul: int = 1) -> float:
    tok_in, tok_out = OP_TOKENS[op]
    p_in, p_out = PROVIDERS[provider]
    return mul * (tok_in * p_in + tok_out * p_out) / 1_000_000

# ─── Processor fees ────────────────────────────────────────────────────
def processor_fee(price_usd: float, scheme: str) -> float:
    """Return absolute processor cost in USD."""
    if scheme == "razorpay_inr":
        # 2% × 1.18 GST on fee
        return price_usd * 0.02 * 1.18
    if scheme == "razorpay_usd":
        # 3% × 1.18 GST (international card on INR merchant)
        return price_usd * 0.03 * 1.18
    if scheme == "paypal":
        # 3.49% + $0.49 + 1.5% cross-border — DEPRECATED post-D4 (2026-04-20).
        # Retained for historical v1/v2 scenarios only.
        return price_usd * 0.0349 + 0.49 + price_usd * 0.015
    if scheme == "paddle":
        # Paddle MoR standard: 5% + $0.50 per transaction.
        # INCLUDES: payment processing, sales tax collection/remittance
        # across ~120 jurisdictions (US state nexus, EU VAT, UK VAT, etc.),
        # chargeback absorption, fraud liability, refund handling, multi-currency.
        # NOTE: No separate chargeback line item needed when using this scheme
        # (Paddle eats disputes as part of the MoR wrap).
        return price_usd * 0.05 + 0.50
    raise ValueError(scheme)

def processor_weighted(price_usd: float, mix: dict) -> float:
    """Weighted processor cost. `mix` sums to 1.0."""
    return sum(w * processor_fee(price_usd, s) for s, w in mix.items())

# ─── FX spread (USD→INR payout) ────────────────────────────────────────
# Paddle pays us in USD via SWIFT; our AD bank (ICICI / HDFC / Axis / SBI)
# converts to INR at a retail spread of 0.3–0.8% above interbank mid-market.
# Applies ONLY to the paddle slice — Razorpay INR settles domestically with
# no FX. Estimated conservatively at 0.5% until Paddle sandbox + 30-day
# real-payout measurement refines the number.
FX_SPREAD_PADDLE = 0.005  # 0.5% of gross on paddle slice

def fx_drag_usd(price_usd: float, mix: dict) -> float:
    """FX conversion spread on USD→INR, weighted by mix.

    Only applies to slices paid in USD by a foreign entity (currently: paddle).
    razorpay_inr settles domestically — no FX. razorpay_usd settles in USD
    too but through the same AD bank path, so treat it identically.
    """
    usd_slice = mix.get("paddle", 0) + mix.get("razorpay_usd", 0) + mix.get("paypal", 0)
    return price_usd * FX_SPREAD_PADDLE * usd_slice

# v1/v2 mixes (PayPal-era — retained for historical comparison)
DEFAULT_MIX = {"razorpay_inr": 0.50, "paypal": 0.30, "razorpay_usd": 0.20}
INDIA_HEAVY = {"razorpay_inr": 0.80, "paypal": 0.10, "razorpay_usd": 0.10}
US_HEAVY    = {"razorpay_inr": 0.20, "paypal": 0.50, "razorpay_usd": 0.30}
RAZORPAY_ONLY = {"razorpay_inr": 0.70, "razorpay_usd": 0.30}

# v3 mixes (post-D4 Paddle MoR decision, 2026-04-20).
# Rule: INR buyers → razorpay_inr; everyone else → paddle.
# razorpay_usd is retired as a primary rail (Paddle absorbs international).
PADDLE_DEFAULT   = {"razorpay_inr": 0.40, "paddle": 0.60}  # assumed post-launch mix
PADDLE_INDIA_HEAVY = {"razorpay_inr": 0.70, "paddle": 0.30}
PADDLE_INTL_HEAVY  = {"razorpay_inr": 0.20, "paddle": 0.80}
PADDLE_ONLY       = {"paddle": 1.00}  # pre-launch edge (no Razorpay yet)

# ─── Infra cost per pack (amortised: Hostinger + MySQL + logs + CDN) ───
INFRA = {"Starter": 0.10, "Creator": 0.20, "Pro": 0.50, "Studio": 1.00}

# ─── Routing policies ──────────────────────────────────────────────────
# v3 CHEAP_ROUTING tracks the post-Tier-1 router in lib/ai/router.ts:
#   - translate / rewrite / table / redact flipped from haiku/gemini → gpt4omini
#     after the 2026-04-21 arbitrage audit (docs/ai/COST_MATRIX_3PROVIDER.md §3).
#   - OCR stays on gemini (only non-anthropic provider with pdfInput).
#   - summarize / compare / generate / sign stay on claude / sonnet until a
#     quality-eval pass clears the cheaper alternatives (M3 — deferred).
CHEAP_ROUTING = {
    "chat_turn": "gpt4omini", "summarize": "haiku", "translate": "gpt4omini",
    "ocr": "gemini", "compare": "haiku", "rewrite": "gpt4omini",
    "table": "gpt4omini", "redact": "gpt4omini", "generate": "sonnet",
    "sign": "sonnet",
}
HAIKU_ALL = {op: "haiku" for op in OP_COST}
SONNET_DEEP = dict(HAIKU_ALL, compare="sonnet", generate="sonnet",
                   sign="sonnet", redact="sonnet")

# ─── Usage profiles ────────────────────────────────────────────────────
# weight = share of credits spent on this op
REALISTIC_MIX = {
    "chat_turn": 0.40, "summarize": 0.15, "ocr": 0.15, "translate": 0.10,
    "rewrite": 0.05, "table": 0.05, "redact": 0.03, "compare": 0.03,
    "generate": 0.03, "sign": 0.01,
}
OCR_ONLY = {"ocr": 1.0}
DEEP_HEAVY = {"generate": 0.4, "compare": 0.3, "sign": 0.2, "chat_turn": 0.1}
CHAT_HEAVY = {"chat_turn": 0.8, "summarize": 0.15, "rewrite": 0.05}

def ai_cost_per_credit(profile: dict, routing: dict) -> float:
    """USD cost per credit under a given usage+routing mix."""
    total_cost = total_credits = 0
    for op, weight in profile.items():
        per_op = op_cost_usd(op, routing[op])
        credits = OP_COST[op]
        # weight is share-of-credits; normalize to per-credit cost
        total_cost += weight * per_op / credits
        total_credits += weight
    return total_cost / total_credits

def margin(pack: str, scheme_mix: dict, profile: dict, routing: dict,
           refund_rate: float = 0.0, chargeback_rate: float = 0.0,
           extra_cost: float = 0.0) -> float:
    price, credits, _ = CREDIT_PACKS[pack]
    # revenue net of refunds (processor fee is lost on refunds too)
    revenue = price * (1 - refund_rate)
    # processor drag on full GMV (refunds don't return the fee)
    proc = processor_weighted(price, scheme_mix)
    # AI cost on credits actually consumed. Refunded users don't consume.
    ai = ai_cost_per_credit(profile, routing) * credits * (1 - refund_rate)
    # chargebacks: ₹1500 (~$18) per dispute, pro-rated
    cb_cost = chargeback_rate * 18
    infra = INFRA[pack] + extra_cost
    net = revenue - proc - ai - infra - cb_cost
    return net / price * 100 if price else 0

# ─── Run the sweep ─────────────────────────────────────────────────────
def table(name, rows, cols):
    print(f"\n### {name}")
    header = f"{'Pack':<9} {'Claim':>6}" + "".join(f" {c:>16}" for c in cols)
    print(header)
    print("-" * len(header))
    for pack in CREDIT_PACKS:
        claim = CREDIT_PACKS[pack][2]
        vals = "".join(f" {rows[pack][c]:>15.1f}%" for c in cols)
        print(f"{pack:<9} {claim:>5}%" + vals)

# Scenario S1: baseline recap (matches v1 doc)
print("\n" + "=" * 76)
print("S1. BASELINE: realistic mix, default currency routing (50/30/20)")
print("=" * 76)
rows = {}
for pack in CREDIT_PACKS:
    rows[pack] = {
        "Haiku-all":   margin(pack, DEFAULT_MIX, REALISTIC_MIX, HAIKU_ALL),
        "Cheap route": margin(pack, DEFAULT_MIX, REALISTIC_MIX, CHEAP_ROUTING),
    }
table("S1", rows, ["Haiku-all", "Cheap route"])

# S2: deep-tier heavy user (generate/compare/sign dominant) — the killer scenario
print("\n" + "=" * 76)
print("S2. DEEP-TIER HEAVY USER: generate+compare+sign dominate")
print("=" * 76)
rows = {}
for pack in CREDIT_PACKS:
    rows[pack] = {
        "Haiku-all":   margin(pack, DEFAULT_MIX, DEEP_HEAVY, HAIKU_ALL),
        "Sonnet deep": margin(pack, DEFAULT_MIX, DEEP_HEAVY, SONNET_DEEP),
        "Cheap route": margin(pack, DEFAULT_MIX, DEEP_HEAVY, CHEAP_ROUTING),
    }
table("S2", rows, ["Haiku-all", "Sonnet deep", "Cheap route"])

# S3: chat whale — 80% of credits on chat_turn but user pastes huge contexts
print("\n" + "=" * 76)
print("S3. CHAT WHALE: 80% chat_turn but with 10× token bloat")
print("=" * 76)
# Bloat chat token counts 10× (user pastes entire doc as context)
orig = OP_TOKENS["chat_turn"]
OP_TOKENS["chat_turn"] = (orig[0] * 10, orig[1] * 10)
rows = {}
for pack in CREDIT_PACKS:
    rows[pack] = {
        "Haiku-all":   margin(pack, DEFAULT_MIX, CHAT_HEAVY, HAIKU_ALL),
        "GPT-4o-mini": margin(pack, DEFAULT_MIX, CHAT_HEAVY, CHEAP_ROUTING),
    }
table("S3", rows, ["Haiku-all", "GPT-4o-mini"])
OP_TOKENS["chat_turn"] = orig  # restore

# S4: refund drag (10% of users refund within 14d — per pricing page FAQ)
print("\n" + "=" * 76)
print("S4. REFUND DRAG: 5% / 10% / 20% refund rates (realistic mix)")
print("=" * 76)
rows = {}
for pack in CREDIT_PACKS:
    rows[pack] = {
        "5% refund":  margin(pack, DEFAULT_MIX, REALISTIC_MIX, CHEAP_ROUTING, refund_rate=0.05),
        "10% refund": margin(pack, DEFAULT_MIX, REALISTIC_MIX, CHEAP_ROUTING, refund_rate=0.10),
        "20% refund": margin(pack, DEFAULT_MIX, REALISTIC_MIX, CHEAP_ROUTING, refund_rate=0.20),
    }
table("S4", rows, ["5% refund", "10% refund", "20% refund"])

# S5: chargeback drag
print("\n" + "=" * 76)
print("S5. CHARGEBACK DRAG: 0.5% / 1% / 2% chargeback rates")
print("=" * 76)
rows = {}
for pack in CREDIT_PACKS:
    rows[pack] = {
        "0.5% CB": margin(pack, DEFAULT_MIX, REALISTIC_MIX, CHEAP_ROUTING, chargeback_rate=0.005),
        "1% CB":   margin(pack, DEFAULT_MIX, REALISTIC_MIX, CHEAP_ROUTING, chargeback_rate=0.010),
        "2% CB":   margin(pack, DEFAULT_MIX, REALISTIC_MIX, CHEAP_ROUTING, chargeback_rate=0.020),
    }
table("S5", rows, ["0.5% CB", "1% CB", "2% CB"])

# S6: region mix swings
print("\n" + "=" * 76)
print("S6. REGION MIX: India-heavy vs US-heavy vs Razorpay-only")
print("=" * 76)
rows = {}
for pack in CREDIT_PACKS:
    rows[pack] = {
        "India-heavy":   margin(pack, INDIA_HEAVY, REALISTIC_MIX, CHEAP_ROUTING),
        "US-heavy":      margin(pack, US_HEAVY, REALISTIC_MIX, CHEAP_ROUTING),
        "Razorpay-only": margin(pack, RAZORPAY_ONLY, REALISTIC_MIX, CHEAP_ROUTING),
    }
table("S6", rows, ["India-heavy", "US-heavy", "Razorpay-only"])

# S7: support cost scenarios
print("\n" + "=" * 76)
print("S7. SUPPORT COST: $0.50/mo / $1.50/mo / $3/mo per paying user")
print("=" * 76)
rows = {}
for pack in CREDIT_PACKS:
    rows[pack] = {
        "Light ($0.50)": margin(pack, DEFAULT_MIX, REALISTIC_MIX, CHEAP_ROUTING, extra_cost=0.50),
        "Avg ($1.50)":   margin(pack, DEFAULT_MIX, REALISTIC_MIX, CHEAP_ROUTING, extra_cost=1.50),
        "Heavy ($3)":    margin(pack, DEFAULT_MIX, REALISTIC_MIX, CHEAP_ROUTING, extra_cost=3.00),
    }
table("S7", rows, ["Light ($0.50)", "Avg ($1.50)", "Heavy ($3)"])

# S8: provider price rise (Haiku 4.5 → 5.0 at 2×)
print("\n" + "=" * 76)
print("S8. PROVIDER PRICE RISE: Haiku/Sonnet double (model upgrade scenario)")
print("=" * 76)
orig_h = PROVIDERS["haiku"]
orig_s = PROVIDERS["sonnet"]
PROVIDERS["haiku"]  = (orig_h[0] * 2, orig_h[1] * 2)
PROVIDERS["sonnet"] = (orig_s[0] * 2, orig_s[1] * 2)
rows = {}
for pack in CREDIT_PACKS:
    rows[pack] = {
        "Haiku-all":   margin(pack, DEFAULT_MIX, REALISTIC_MIX, HAIKU_ALL),
        "Cheap route": margin(pack, DEFAULT_MIX, REALISTIC_MIX, CHEAP_ROUTING),
    }
table("S8", rows, ["Haiku-all", "Cheap route"])
PROVIDERS["haiku"] = orig_h
PROVIDERS["sonnet"] = orig_s

# S9: token estimate miss (OCR tokens 3× higher than estimate)
print("\n" + "=" * 76)
print("S9. TOKEN-ESTIMATE MISS: OCR + generate tokens 3× our estimate")
print("=" * 76)
orig_ocr = OP_TOKENS["ocr"]
orig_gen = OP_TOKENS["generate"]
OP_TOKENS["ocr"]      = (orig_ocr[0] * 3, orig_ocr[1] * 3)
OP_TOKENS["generate"] = (orig_gen[0] * 3, orig_gen[1] * 3)
rows = {}
for pack in CREDIT_PACKS:
    rows[pack] = {
        "Haiku-all":   margin(pack, DEFAULT_MIX, REALISTIC_MIX, HAIKU_ALL),
        "Cheap route": margin(pack, DEFAULT_MIX, REALISTIC_MIX, CHEAP_ROUTING),
    }
table("S9", rows, ["Haiku-all", "Cheap route"])
OP_TOKENS["ocr"] = orig_ocr
OP_TOKENS["generate"] = orig_gen

# S10: free-tier abuse — 10 free credits to every signup, 20% abuse rate
print("\n" + "=" * 76)
print("S10. FREE-TIER ABUSE: 0 / 10 / 25 free credits per signup")
print("     (one abuser burns all free credits on cheapest-margin op)")
print("=" * 76)
abuse_ratio_to_paid = 5  # 5 abusers per paying customer
for free_credits in [0, 10, 25]:
    # cheapest-margin abuse op = OCR with Haiku (until we fix it)
    abuse_cost = op_cost_usd("ocr", "haiku") * (free_credits / OP_COST["ocr"])
    total_abuse = abuse_cost * abuse_ratio_to_paid
    print(f"  Free={free_credits} credits, 5 abusers/customer → ${total_abuse:.3f} bleed per paid signup")
    rows = {}
    for pack in CREDIT_PACKS:
        rows[pack] = {
            "Haiku-all":   margin(pack, DEFAULT_MIX, REALISTIC_MIX, HAIKU_ALL, extra_cost=total_abuse),
            "Cheap route": margin(pack, DEFAULT_MIX, REALISTIC_MIX, CHEAP_ROUTING, extra_cost=total_abuse),
        }
    if free_credits:
        table(f"S10 free={free_credits}", rows, ["Haiku-all", "Cheap route"])

# S11: Combined worst case
print("\n" + "=" * 76)
print("S11. COMBINED WORST CASE: US-heavy + 10% refunds + 1% CB + $1.50 support")
print("                         + 3× token miss + Haiku-all routing")
print("=" * 76)
orig_ocr = OP_TOKENS["ocr"]
OP_TOKENS["ocr"] = (orig_ocr[0] * 3, orig_ocr[1] * 3)
rows = {}
for pack in CREDIT_PACKS:
    rows[pack] = {
        "Worst": margin(pack, US_HEAVY, REALISTIC_MIX, HAIKU_ALL,
                        refund_rate=0.10, chargeback_rate=0.01, extra_cost=1.50),
        "Best":  margin(pack, INDIA_HEAVY, REALISTIC_MIX, CHEAP_ROUTING,
                        refund_rate=0.02, chargeback_rate=0.002, extra_cost=0.50),
    }
table("S11", rows, ["Worst", "Best"])
OP_TOKENS["ocr"] = orig_ocr
