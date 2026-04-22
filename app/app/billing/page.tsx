import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { desc, eq } from "drizzle-orm";
import { I } from "@/components/icons/Icons";
import { CREDIT_PACKS, type CreditPackId } from "@/lib/pricing";
import { listConfiguredProviderIds } from "@/lib/payments/registry";
import { RefundButton } from "@/components/billing/RefundButton";
import { getPromoRedemptionHistoryAction } from "@/lib/promos/actions";

// 14-day refund window — must match REFUND_WINDOW_DAYS in refund-actions.ts.
const REFUND_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export const metadata: Metadata = {
  title: "Billing",
  robots: { index: false, follow: false },
};

// Payment rows change on every webhook; keep this page dynamic so users
// see up-to-date state after returning from a provider redirect.
export const dynamic = "force-dynamic";

const PROVIDER_DISPLAY: Record<string, string> = {
  razorpay: "Razorpay",
  paddle: "Paddle",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  captured: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  partial_refund: "Partial refund",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "var(--fg-subtle)",
  captured: "var(--accent)",
  failed: "#c00",
  refunded: "var(--fg-subtle)",
  partial_refund: "var(--fg-subtle)",
  cancelled: "var(--fg-subtle)",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: { status?: string; id?: string };
}) {
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;

  let balance = 0;
  let payments: Array<{
    id: string;
    providerId: string;
    status: string;
    amountMinor: number;
    currency: string;
    packId: string | null;
    createdAt: Date;
  }> = [];

  if (userId) {
    const [balanceRow] = await db
      .select({ balance: schema.credits.balance })
      .from(schema.credits)
      .where(eq(schema.credits.userId, userId))
      .limit(1);
    balance = balanceRow?.balance ?? 0;

    payments = await db
      .select({
        id: schema.payments.id,
        providerId: schema.payments.providerId,
        status: schema.payments.status,
        amountMinor: schema.payments.amountMinor,
        currency: schema.payments.currency,
        packId: schema.payments.packId,
        createdAt: schema.payments.createdAt,
      })
      .from(schema.payments)
      .where(eq(schema.payments.userId, userId))
      .orderBy(desc(schema.payments.createdAt))
      .limit(20);
  }

  const configuredProviderIds = listConfiguredProviderIds();
  const anyProviderConfigured = configuredProviderIds.length > 0;

  // Promo redemption history — a server action, but we call it
  // directly on the server since this is a server component. The
  // action handles the auth-gate, so signed-out sessions will get
  // ok:false and we hide the section entirely.
  const promoHistory = userId ? await getPromoRedemptionHistoryAction() : null;
  const promoRows =
    promoHistory && promoHistory.ok ? promoHistory.rows : [];

  // Toast-ish banner for post-redirect states.
  const banner = bannerFromStatus(searchParams?.status);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 820 }}
    >
      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>BILLING</div>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em" }}>
          Billing & credits
        </h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          Core PDF tools are free forever. You only pay for AI credits when
          you use them.
        </p>
      </header>

      {banner && (
        <div
          role="status"
          className="card"
          style={{
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderColor: banner.color,
            background: `color-mix(in oklab, ${banner.color} 8%, transparent)`,
          }}
        >
          <span style={{ color: banner.color }}>•</span>
          <span style={{ fontSize: 13 }}>{banner.text}</span>
        </div>
      )}

      {/* ===== Current balance ===== */}
      <div className="card" style={{ padding: 24 }}>
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 8,
          }}
        >
          <div className="eyebrow" style={{ margin: 0 }}>Current balance</div>
          <span style={{ color: "var(--fg-subtle)" }}>
            <I.Coin size={16} />
          </span>
        </div>
        <div
          style={{
            fontSize: 36,
            letterSpacing: "-0.02em",
            fontWeight: 500,
          }}
        >
          {balance.toLocaleString()}{" "}
          <span
            className="muted"
            style={{ fontSize: 14, fontWeight: 400 }}
          >
            credits
          </span>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          1 credit ≈ one AI operation (chat turn, summary, translation,
          redaction pass).
        </p>
        <div style={{ marginTop: 16 }}>
          <Link href="/pricing" className="btn btn-accent btn-sm">
            Top up credits
          </Link>
        </div>
      </div>

      {/* ===== Recent payments ===== */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div className="eyebrow" style={{ margin: 0 }}>Recent payments</div>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Last 20 checkout attempts. Pending rows settle once the provider
              webhook lands — usually within seconds.
            </p>
          </div>
        </div>

        {payments.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "var(--bg-2)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 12px",
                color: "var(--fg-subtle)",
              }}
            >
              <I.Receipt size={18} />
            </div>
            <p style={{ fontSize: 14, margin: 0 }}>No payments yet.</p>
            <p
              className="muted"
              style={{ fontSize: 13, marginTop: 6, marginBottom: 16 }}
            >
              {anyProviderConfigured
                ? "Pick a credit pack to get started."
                : "Payments are coming online shortly."}
            </p>
            {anyProviderConfigured && (
              <Link href="/pricing" className="btn btn-ghost btn-sm">
                See pricing
              </Link>
            )}
          </div>
        ) : (
          <div>
            {payments.map((p, i) => {
              const pack = p.packId
                ? CREDIT_PACKS.find((x) => x.id === (p.packId as CreditPackId))
                : undefined;
              const amount =
                p.currency === "USD"
                  ? `$${(p.amountMinor / 100).toFixed(2)}`
                  : `${(p.amountMinor / 100).toFixed(2)} ${p.currency}`;

              // Inline refund eligibility — we render the button only
              // when (status=captured, within 14-day window, pack is
              // known, user has unused credits to refund). The server
              // action double-checks before it actually calls the
              // provider, so this is a UX filter rather than a trust
              // boundary.
              const refundQuote = pack
                ? quoteRefund({
                    status: p.status,
                    createdAt: p.createdAt,
                    amountMinor: p.amountMinor,
                    totalPackCredits: pack.credits + (pack.bonus ?? 0),
                    balance,
                  })
                : null;

              return (
                <div
                  key={p.id}
                  className="row"
                  style={{
                    padding: "14px 20px",
                    gap: 16,
                    borderBottom:
                      i < payments.length - 1
                        ? "1px solid var(--border)"
                        : undefined,
                    alignItems: "center",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}
                    >
                      {pack ? pack.name : p.packId ?? "Credit pack"}
                      {pack && (
                        <span
                          className="muted"
                          style={{ fontWeight: 400, fontSize: 13, marginLeft: 8 }}
                        >
                          · {pack.credits.toLocaleString()} credits
                          {pack.bonus ? ` + ${pack.bonus} bonus` : ""}
                        </span>
                      )}
                    </div>
                    <div
                      className="muted mono"
                      style={{ fontSize: 12 }}
                    >
                      {formatDate(p.createdAt)} ·{" "}
                      {PROVIDER_DISPLAY[p.providerId] ?? p.providerId}
                    </div>
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 13, whiteSpace: "nowrap" }}
                  >
                    {amount}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 6,
                      minWidth: 120,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: STATUS_COLOR[p.status] ?? "var(--fg-subtle)",
                        textAlign: "right",
                      }}
                    >
                      {STATUS_LABEL[p.status] ?? p.status}
                    </div>
                    {refundQuote && pack && (
                      <RefundButton
                        paymentId={p.id}
                        refundableCredits={refundQuote.refundableCredits}
                        refundAmountMinor={refundQuote.refundAmountMinor}
                        currency={p.currency}
                        totalPackCredits={pack.credits + (pack.bonus ?? 0)}
                        expiresAt={refundQuote.expiresAt}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== Promo codes applied =====
          Task #27 / Phase E. Renders only when the user has at least
          one redemption — freshly signed-up users see nothing here,
          same posture as the empty-payments state above. Kept visually
          compact (single-row-per-redemption) because most users will
          have zero or one; the admin surface is where heavy drilldown
          lives. */}
      {promoRows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div className="eyebrow" style={{ margin: 0 }}>
              Promo codes applied
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Codes you've redeemed on past checkouts. Discount amounts are
              the actual discount that landed on the payment — not the
              sticker-published value on the code.
            </p>
          </div>
          <div>
            {promoRows.map((r, i) => {
              const symbol = r.currency === "INR" ? "₹" : "$";
              const discountLabel =
                r.kind === "bonus_credits"
                  ? `+${r.bonusCredits.toLocaleString()} credits`
                  : `${symbol}${(r.discountMicros / 1_000_000).toLocaleString(
                      "en-US",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )} off`;
              return (
                <div
                  key={r.id}
                  className="row"
                  style={{
                    padding: "14px 20px",
                    gap: 16,
                    alignItems: "center",
                    borderBottom:
                      i < promoRows.length - 1
                        ? "1px solid var(--border)"
                        : undefined,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        marginBottom: 2,
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}
                    >
                      {r.code}
                      {r.campaign && (
                        <span
                          className="muted"
                          style={{
                            fontWeight: 400,
                            fontSize: 13,
                            marginLeft: 8,
                            fontFamily: "inherit",
                          }}
                        >
                          · {r.campaign}
                        </span>
                      )}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {formatDate(r.redeemedAt)}
                      {r.annualVariant ? " · annual" : ""}
                      {r.packId ? ` · ${r.packId}` : ""}
                    </div>
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 13, whiteSpace: "nowrap" }}
                  >
                    {discountLabel}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function bannerFromStatus(
  status: string | undefined
): { text: string; color: string } | null {
  if (!status) return null;
  if (status === "success")
    return {
      text:
        "Payment submitted. Credits will land in your balance within a few seconds once the provider confirms.",
      color: "var(--accent)",
    };
  if (status === "processing")
    return {
      text:
        "Payment received — we're waiting on the provider to confirm. Your balance will update automatically.",
      color: "var(--accent)",
    };
  if (status === "cancelled")
    return {
      text: "Checkout cancelled. No charge was made.",
      color: "var(--fg-subtle)",
    };
  return null;
}

function formatDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * Server-side sibling of the refund eligibility check in refund-actions.ts.
 * Mirrors the same math but from the user's in-memory balance so the page
 * renders button-ready quotes without an extra round-trip per row.
 *
 * Returns null when the payment isn't refundable. The server action is
 * the enforcement boundary — this is just for UX.
 */
function quoteRefund(input: {
  status: string;
  createdAt: Date;
  amountMinor: number;
  totalPackCredits: number;
  balance: number;
}): { refundableCredits: number; refundAmountMinor: number; expiresAt: string } | null {
  if (input.status !== "captured") return null;
  const age = Date.now() - input.createdAt.getTime();
  if (age > REFUND_WINDOW_MS) return null;

  const refundableCredits = Math.min(
    input.totalPackCredits,
    Math.max(input.balance, 0)
  );
  if (refundableCredits <= 0) return null;

  const refundAmountMinor =
    refundableCredits === input.totalPackCredits
      ? input.amountMinor
      : Math.floor(
          (refundableCredits / input.totalPackCredits) * input.amountMinor
        );

  const expiresAt = new Date(
    input.createdAt.getTime() + REFUND_WINDOW_MS
  ).toISOString();

  return { refundableCredits, refundAmountMinor, expiresAt };
}
