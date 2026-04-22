// app/admin/plans/page.tsx — Pricing & plans read-only surface.
//
// Task #25 / Phase D.
//
// What this page is:
// ------------------
// A single-pane audit of the three pricing surfaces an operator needs to
// reconcile BEFORE launching a change to public /pricing copy, a credit-
// cost change in AI_OPERATION_COSTS, or a promotional pack:
//
//   1. Credit packs (lib/pricing.ts:CREDIT_PACKS) — the four SKUs the
//      /pricing page currently advertises. We show price / credits /
//      per-credit / claimed margin side by side so an operator can sanity-
//      check that the claimed margin on /pricing matches what our cost
//      model actually predicts.
//
//   2. AI operation costs (lib/pricing.ts:AI_OPERATION_COSTS) — the flat
//      credit debit per tool invocation. A regression that silently drops
//      a cost from 5 → 1 is the class of bug that costs real money at
//      scale, so exposing the whole map on one screen makes it reviewable
//      without cloning the repo.
//
//   3. FX constant (USD_TO_INR_RATE) — surfaced on this page as a sanity
//      check against /admin/fx's observed rate. When they diverge by more
//      than ~3%, checkout INR pricing is stale and the pack list at
//      packAmountMinor(pack, "INR") is under- or over-charging IN users.
//
// Why pure-static (no DB query):
// -----------------------------
// Every value shown is imported from lib/pricing.ts. There's no user-
// specific state here — this is "what are our prices?" not "who bought
// what?". Transaction-level revenue lives at /admin/revenue and
// /admin/transactions; margin truth lives at /admin/margin.
//
// Future-facing (Task #27):
// -------------------------
// Annual-prepay tier + per-pack INR pricing + promo codes will extend
// what gets rendered here. The table columns are already sized for an
// extra "INR price" column once Task #27's per-pack INR table ships.

import {
  CREDIT_PACKS,
  AI_OPERATION_COSTS,
  USD_TO_INR_RATE,
  packAmountMinor,
} from "@/lib/pricing";
import {
  SectionTitle,
  StatCard,
  Td,
  Th,
  tableStyle,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function AdminPlansPage() {
  const totalPublishedPacks = CREDIT_PACKS.length;
  const averageMargin =
    CREDIT_PACKS.reduce((s, p) => s + p.margin, 0) / CREDIT_PACKS.length;
  const cheapestPpc = Math.min(...CREDIT_PACKS.map((p) => p.pp));
  const totalOps = Object.keys(AI_OPERATION_COSTS).length;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Plans &amp; pricing
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Read-only audit of the credit packs, per-op credit costs, and the
          USD→INR conversion constant. Change any of these via a commit to{" "}
          <code>lib/pricing.ts</code>, not this page.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Published packs"
          value={String(totalPublishedPacks)}
          hint="Shown on /pricing"
        />
        <StatCard
          label="Avg claimed margin"
          value={`${averageMargin.toFixed(1)}%`}
          hint="AI-cost-only headline (see pricing.ts comment)"
          tone={averageMargin >= 80 ? "good" : "warn"}
        />
        <StatCard
          label="Cheapest $/credit"
          value={`$${cheapestPpc.toFixed(3)}`}
          hint="Studio tier anchor"
        />
        <StatCard
          label="USD → INR rate"
          value={String(USD_TO_INR_RATE)}
          hint="Display-only; reconciliation uses webhook FX"
        />
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionTitle>Credit packs (CREDIT_PACKS)</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>ID</Th>
                <Th>Name</Th>
                <Th align="right">Credits</Th>
                <Th align="right">Bonus</Th>
                <Th align="right">Price (USD)</Th>
                <Th align="right">Price (INR)</Th>
                <Th align="right">$ / credit</Th>
                <Th align="right">Margin</Th>
                <Th>Popular</Th>
                <Th>Features</Th>
              </tr>
            </thead>
            <tbody>
              {CREDIT_PACKS.map((p) => {
                const inrMinor = packAmountMinor(p, "INR");
                const inrRupees = inrMinor / 100;
                return (
                  <tr key={p.id}>
                    <Td mono>{p.id}</Td>
                    <Td>{p.name}</Td>
                    <Td align="right" mono>
                      {p.credits.toLocaleString("en-US")}
                    </Td>
                    <Td align="right" mono>
                      {p.bonus
                        ? `+${p.bonus.toLocaleString("en-US")}${
                            p.bonusExpires ? ` (${p.bonusExpires}d)` : ""
                          }`
                        : "—"}
                    </Td>
                    <Td align="right" mono>
                      ${p.price}
                    </Td>
                    <Td align="right" mono>
                      ₹
                      {inrRupees.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </Td>
                    <Td align="right" mono>
                      ${p.pp.toFixed(3)}
                    </Td>
                    <Td align="right" mono>
                      {p.margin}%
                    </Td>
                    <Td>{p.popular ? "yes" : "—"}</Td>
                    <Td>
                      <ul
                        style={{
                          margin: 0,
                          paddingLeft: 16,
                          fontSize: 12,
                        }}
                      >
                        {p.features.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p
          className="muted"
          style={{ fontSize: 12, marginTop: 8 }}
        >
          Margin column is AI-cost-only under cheap routing. It does NOT
          subtract processor fees, support amortisation, refund drag, FX
          spread, or tax. Net margin after Paddle on realistic mix lives at{" "}
          <a href="/admin/margin" style={{ color: "inherit" }}>
            /admin/margin
          </a>
          .
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionTitle>
          AI operation costs (AI_OPERATION_COSTS — {totalOps} ops)
        </SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Operation</Th>
                <Th align="right">Credits</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {(
                Object.entries(AI_OPERATION_COSTS) as Array<
                  [string, number]
                >
              ).map(([op, credits]) => (
                <tr key={op}>
                  <Td mono>{op}</Td>
                  <Td align="right" mono>
                    {credits}
                  </Td>
                  <Td>
                    {op === "compare"
                      ? "Flat per-diff (not per-page). Bounded by combined-char budget."
                      : op === "generate"
                        ? "Most expensive op. Flat per-doc generation."
                        : op === "sign"
                          ? "Per-doc signing (includes LTV timestamp)."
                          : op === "redact"
                            ? "Per-doc redaction (metered-per-page is aspirational)."
                            : "Flat per-op."}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Flat per-op credit cost was chosen over token-metered billing for
          v1 simplicity — we debit once up front and refund once on error.
          Token-metered billing makes sense at scale; for now simplicity
          wins. See <code>lib/pricing.ts</code> commentary.
        </p>
      </section>

      <section>
        <SectionTitle>FX constant (USD_TO_INR_RATE)</SectionTitle>
        <p>
          Display-only USD→INR conversion used at checkout for INR-routed
          purchases. Last reviewed against RBI ref on{" "}
          <strong>2026-04-22</strong> (~83.3, rounded up to{" "}
          <strong>{USD_TO_INR_RATE}</strong> for headroom).
        </p>
        <p>
          Authoritative FX-at-capture lives in{" "}
          <code>credit_ledger.fx_rate_used</code> + the{" "}
          <a href="/admin/fx" style={{ color: "inherit" }}>
            /admin/fx
          </a>{" "}
          slippage surface. A persistent gap of &gt;3% between this
          constant and the observed Razorpay rate means this constant is
          stale — bump it in <code>lib/pricing.ts</code>.
        </p>
      </section>
    </div>
  );
}
