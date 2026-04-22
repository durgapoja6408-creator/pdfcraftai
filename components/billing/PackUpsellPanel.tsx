// components/billing/PackUpsellPanel.tsx — annual / monthly toggle plus
// promo code input for the /pricing grid.
//
// Task #27 / Phase E.
//
// Why a separate panel and not inline on every pack card:
// -------------------------------------------------------
// The /pricing grid has four pack cards, and wiring an annual toggle +
// promo input into each one would either (a) explode the card markup
// 4×, or (b) force an awkward "promo applies to one pack, not the
// others" UX. Operators and users both benefit from treating annual +
// promo as a grid-level control: pick monthly or annual, pick a pack,
// type a promo once, done.
//
// State shape:
//   - `variant` — the toggle state. Defaults to monthly. Passed to
//     every CheckoutButton via the URL rewrite below.
//   - `promoCode` — the typed-in code. Trimmed-on-submit. Passed to
//     every CheckoutButton.
//   - Preview state — the panel calls applyPromoCodeAction on the
//     first selected pack to surface "you saved $X" copy before the
//     user clicks Buy, but the authoritative validation still happens
//     server-side at checkout time.
//
// Why not use formState / Action responses:
// -----------------------------------------
// The panel is a peer to the existing CREDIT_PACKS grid, which is
// server-rendered markup — we don't want to swap it for a client-
// rendered alternative just to thread state. So this client component
// wraps the grid and clones the inputs to each CheckoutButton via
// props. React context on the parent would work too, but a prop
// drill of two scalars is simpler than wiring a provider here.

"use client";

import { useState, useTransition } from "react";
import { CheckoutButton } from "./CheckoutButton";
import { I } from "@/components/icons/Icons";
import {
  CREDIT_PACKS,
  packAmountMinor,
  packCreditsForVariant,
  type CreditPack,
  type CreditPackId,
  type PackVariant,
} from "@/lib/pricing";
import { applyPromoCodeAction } from "@/lib/promos/actions";

type PanelCurrency = "USD" | "INR";

/**
 * Compact headline for "you saved $X" after a promo preview resolves.
 * Uses the pack's live subtotal so the number the user sees matches
 * what they'll actually be charged.
 */
type PreviewOk = {
  ok: true;
  code: string;
  kind: "percent" | "flat" | "bonus_credits";
  discountMicros: number;
  discountBps: number;
  bonusCredits: number;
  campaign: string | null;
};
type PreviewErr = { ok: false; message: string };
type PreviewState = null | PreviewOk | PreviewErr;

function formatMinor(minor: number, currency: PanelCurrency): string {
  const units = minor / 100;
  const symbol = currency === "INR" ? "₹" : "$";
  return `${symbol}${units.toLocaleString("en-US", {
    minimumFractionDigits: units < 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatMicros(micros: number, currency: PanelCurrency): string {
  // Round to nearest minor so the UI matches what the user is charged.
  const minor = Math.round(micros / 10_000);
  return formatMinor(minor, currency);
}

export function PackUpsellPanel({
  currency = "USD",
}: {
  currency?: PanelCurrency;
}) {
  const [variant, setVariant] = useState<PackVariant>("monthly");
  const [promoInput, setPromoInput] = useState("");
  const [preview, setPreview] = useState<PreviewState>(null);
  const [isPending, startTransition] = useTransition();

  // The "preview pack" is the pack we use when asking the server
  // "does this code apply to this subtotal?". Picking the Creator pack
  // (popular=true) matches the most common buy flow; if the code is
  // wrong-pack for Creator the UI will say so and the user can clear
  // and retry, and the per-pack CheckoutButton still re-validates
  // against the actual pack at click time.
  const previewPack: CreditPack =
    CREDIT_PACKS.find((p) => p.popular) ?? CREDIT_PACKS[0];
  const previewSubtotal = packAmountMinor(previewPack, currency, { variant });

  function handleApply(): void {
    const code = promoInput.trim();
    if (!code) {
      setPreview(null);
      return;
    }
    startTransition(async () => {
      const res = await applyPromoCodeAction({
        code,
        packId: previewPack.id,
        currency,
        variant,
        subtotalMinor: previewSubtotal,
      });
      if (res.ok) {
        setPreview({
          ok: true,
          code: res.code,
          kind: res.kind,
          discountMicros: res.discountMicros,
          discountBps: res.discountBps,
          bonusCredits: res.bonusCredits,
          campaign: res.campaign,
        });
      } else {
        setPreview({ ok: false, message: res.message });
      }
    });
  }

  function handleClear(): void {
    setPromoInput("");
    setPreview(null);
  }

  // Forwarded to every CheckoutButton in the grid below. Empty promo
  // code = undefined so the server action skips the resolver entirely
  // rather than logging a "empty_code" attempt per pack click.
  const appliedPromo =
    preview && preview.ok ? promoInput.trim() : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ===== Variant toggle ===== */}
      <div
        className="card"
        style={{
          padding: 16,
          display: "flex",
          gap: 14,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            BILLING PLAN
          </div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>
            Monthly pack or annual pre-pay
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Annual = 12× the credits at 20% off. One-time charge, not a
            subscription.
          </div>
        </div>
        <div
          role="tablist"
          aria-label="Billing plan"
          style={{ display: "inline-flex", gap: 6, flexShrink: 0 }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={variant === "monthly"}
            onClick={() => setVariant("monthly")}
            className={
              variant === "monthly" ? "btn btn-accent btn-sm" : "btn btn-sm"
            }
          >
            Monthly
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={variant === "annual"}
            onClick={() => setVariant("annual")}
            className={
              variant === "annual" ? "btn btn-accent btn-sm" : "btn btn-sm"
            }
          >
            Annual · 20% off
          </button>
        </div>
      </div>

      {/* ===== Promo code input ===== */}
      <div
        className="card"
        style={{
          padding: 16,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            PROMO CODE
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Have a code? Apply it here — it'll attach to your next
            checkout.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flex: 1,
            minWidth: 260,
          }}
        >
          <input
            type="text"
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
            placeholder="WELCOME10"
            disabled={isPending}
            className="input"
            style={{
              flex: 1,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
            aria-label="Promo code"
          />
          {preview && preview.ok ? (
            <button
              type="button"
              onClick={handleClear}
              className="btn btn-outline btn-sm"
              disabled={isPending}
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              onClick={handleApply}
              className="btn btn-accent btn-sm"
              disabled={isPending || !promoInput.trim()}
            >
              {isPending ? "Checking…" : "Apply"}
            </button>
          )}
        </div>
      </div>

      {/* ===== Promo preview message ===== */}
      {preview ? (
        <div
          className="card"
          style={{
            padding: 12,
            borderColor: preview.ok ? "var(--accent)" : "#c00",
            background: preview.ok
              ? "color-mix(in oklab, var(--accent) 8%, transparent)"
              : "color-mix(in oklab, #c00 8%, transparent)",
            fontSize: 13,
          }}
          role="status"
        >
          {preview.ok ? (
            <span>
              <strong style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                {preview.code}
              </strong>
              {" "}applied ·{" "}
              {preview.kind === "bonus_credits"
                ? `${preview.bonusCredits.toLocaleString()} bonus credits at capture`
                : `you save ${formatMicros(preview.discountMicros, currency)} on ${previewPack.name}`}
              {preview.campaign ? (
                <span className="muted"> · {preview.campaign}</span>
              ) : null}
            </span>
          ) : (
            <span>{preview.message}</span>
          )}
        </div>
      ) : null}

      {/* ===== Pack grid (prop-drilled) ===== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {CREDIT_PACKS.map((p) => (
          <PackCard
            key={p.id}
            pack={p}
            variant={variant}
            promoCode={appliedPromo}
            currency={currency}
          />
        ))}
      </div>
    </div>
  );
}

function PackCard({
  pack,
  variant,
  promoCode,
  currency,
}: {
  pack: CreditPack;
  variant: PackVariant;
  promoCode: string | undefined;
  currency: PanelCurrency;
}) {
  const amountMinor = packAmountMinor(pack, currency, { variant });
  const { paid, bonus } = packCreditsForVariant(pack, variant);
  const totalCredits = paid + bonus;

  // For annual, show both the annual price and the "per month" equivalent
  // so the user can compare at a glance.
  const perMonthMinor = variant === "annual" ? Math.round(amountMinor / 12) : null;

  return (
    <div
      className="card"
      style={{
        padding: 24,
        position: "relative",
        ...(pack.popular
          ? {
              borderColor: "var(--accent)",
              boxShadow: "0 0 0 1px var(--accent) inset",
            }
          : {}),
      }}
    >
      {pack.popular && (
        <div
          className="chip chip-ai"
          style={{
            position: "absolute",
            top: -10,
            right: 16,
            background: "var(--accent)",
            color: "var(--accent-fg)",
            letterSpacing: "0.08em",
          }}
        >
          POPULAR
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
          {pack.name}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {pack.tagline}
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <div className="row" style={{ alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em" }}>
            {formatMinor(amountMinor, currency)}
          </span>
          <span className="muted" style={{ fontSize: 13 }}>
            {variant === "annual" ? "/year" : "one-time"}
          </span>
        </div>
        <div className="mono subtle" style={{ fontSize: 12, marginTop: 4 }}>
          {totalCredits.toLocaleString()} credits
          {bonus ? ` (${paid.toLocaleString()} + ${bonus} bonus)` : ""}
        </div>
        {variant === "annual" && perMonthMinor !== null ? (
          <div className="mono subtle" style={{ fontSize: 11, marginTop: 2 }}>
            ≈ {formatMinor(perMonthMinor, currency)}/mo · 20% off 12×
          </div>
        ) : null}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, marginBottom: 20 }}>
        {pack.features.map((f) => (
          <li
            key={f}
            className="row"
            style={{ gap: 8, fontSize: 13, marginBottom: 8, alignItems: "flex-start" }}
          >
            <I.Check size={14} style={{ marginTop: 3, flexShrink: 0, color: "var(--accent)" }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <CheckoutButton
        packId={pack.id as CreditPackId}
        packVariant={variant}
        promoCode={promoCode}
        label={variant === "annual" ? "Buy annual" : "Buy pack"}
        variant={pack.popular ? "accent" : "outline"}
        size="lg"
        fullWidth
      />
    </div>
  );
}
