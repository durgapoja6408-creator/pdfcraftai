// app/admin/promos/page.tsx — Promo codes surface.
//
// Task #25 / Phase D.
//
// Status: PLACEHOLDER.
//
// Why a placeholder instead of deferring the nav entry:
// -----------------------------------------------------
// The /admin nav is supposed to be the canonical index of "what
// operational surfaces does this business have?". Leaving promo codes
// off the nav entirely lets an operator believe there's no promo system
// planned — when in fact Task #27 is explicitly on the roadmap and
// merchants will start asking for discount codes the moment we pitch a
// B2B deal. So we ship the nav entry + an informative page that:
//
//   1. Confirms the feature is planned (not forgotten).
//   2. States the scope of Task #27 so the next session doesn't need to
//      re-derive it from master plan docs.
//   3. Points operators at the right workaround (direct credit grant via
//      support ticket) until the table exists.
//
// When Task #27 ships:
// --------------------
//   - Create migration 0015 adding a `promo_codes` table (code unique,
//     kind "percent"|"flat"|"bonus_credits", discount_value, starts_at /
//     expires_at, max_redemptions, per_user_limit, metadata JSON).
//   - Replace the placeholder below with real query wiring from
//     lib/admin/phase-d-queries.ts:getPromoCodes (to be added).
//   - Add a "Create code" action (admin-only) calling a server action in
//     lib/promos/actions.ts.
//   - Wire promo redemption into checkout-actions at the pack-selection
//     step (must happen before amount calc so the discount lands in the
//     Paddle/Razorpay order correctly).

import { SectionTitle } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function AdminPromosPage() {
  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Promos
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Promotional codes — discount %, flat $ off, and bonus-credit
          codes. <strong>Not yet live.</strong>
        </p>
      </header>

      <div
        className="card"
        style={{
          padding: 20,
          marginBottom: 24,
          borderColor: "#b7791f",
          background: "var(--bg-2)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "#b7791f",
            marginBottom: 8,
          }}
        >
          PHASE E PLACEHOLDER · TASK #27
        </div>
        <h2 style={{ fontSize: 18, margin: "0 0 8px 0" }}>
          Promo infrastructure will ship with annual-prepay + INR pricing
        </h2>
        <p style={{ marginBottom: 8 }}>
          Promo codes are tracked as part of Task #27 in the Net Margin
          Roadmap: <em>Annual-prepay tier + INR pricing + promo codes</em>.
          We bundled them because all three need the same checkout
          plumbing — a discount layer between pack selection and provider
          amount calculation.
        </p>
        <p style={{ margin: 0 }}>
          Until Task #27 ships, grant discounts via a direct credit
          adjustment through the support pipeline, and record the reason
          on the ledger row so{" "}
          <a href="/admin/credits" style={{ color: "inherit" }}>
            /admin/credits
          </a>{" "}
          shows the attribution.
        </p>
      </div>

      <section style={{ marginBottom: 32 }}>
        <SectionTitle>What Task #27 will add here</SectionTitle>
        <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
          <li>
            A <code>promo_codes</code> table (migration 0015) with{" "}
            <code>code</code> unique, <code>kind</code> in{" "}
            <code>percent</code> /<code>flat</code> /
            <code>bonus_credits</code>, <code>discount_value</code>,{" "}
            <code>starts_at</code> / <code>expires_at</code>,{" "}
            <code>max_redemptions</code>, <code>per_user_limit</code>, and
            a free-form <code>metadata</code> JSON.
          </li>
          <li>
            A <code>promo_redemptions</code> join table so we can audit
            "this user applied this code on this payment" without replaying
            all webhook events.
          </li>
          <li>
            Checkout integration: the promo lookup happens BEFORE
            <code> packAmountMinor(pack, currency)</code> so the discount
            is baked into the Paddle/Razorpay order and the receipt shows
            it correctly.
          </li>
          <li>
            An admin "Create code" form (server action) with code uniqueness
            check, expiry validation, and an audit-log row to{" "}
            <code>admin_actions</code>.
          </li>
          <li>
            A per-user view on <code>/app/account</code> showing codes
            applied in the user's own history.
          </li>
        </ul>
      </section>

      <section>
        <SectionTitle>Why no live table today</SectionTitle>
        <p>
          Shipping an empty promo table without the checkout plumbing
          would be strictly worse than this placeholder: the UI would
          suggest "codes work" and we'd get support tickets for codes that
          can't actually redeem. The right sequence is to land migration
          0015 + checkout-actions wiring + the redemption hook IN ONE
          PR under Task #27, which also covers annual-prepay and per-pack
          INR pricing so the checkout modifications are batched.
        </p>
      </section>
    </div>
  );
}
