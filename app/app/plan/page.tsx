// app/app/plan/page.tsx — Current subscription plan (user-facing).
//
// Contract: shows the signed-in user their own active subscription, if any.
// If no active subscription, shows a CTA to /pricing. Plan details shown:
//   - plan code (display-name only, never internal rate card)
//   - status (active / paused / pending)
//   - current period start/end (next renewal date)
//   - cancel-at-period-end flag (if cancelledAt is set but currentPeriodEnd
//     is still in the future, the sub is "scheduled to end")
//
// Does NOT display:
//   - provider reference ID (internal)
//   - processor fee, tax treatment, FX — all admin-only
//   - plan cost breakdown at the provider level (we show the amount the
//     user paid on receipts, not the MoR split)
//
// Phase B/5 — Task #19.

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getActiveSubscription } from "@/lib/user/queries";
import {
  formatRelative,
  humanizeStatus,
  humanizePackId,
} from "@/lib/user/format";

export const metadata: Metadata = {
  title: "Plan",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PlanPage() {
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) redirect("/login?callbackUrl=%2Fapp%2Fplan");

  const { data: sub, error } = await getActiveSubscription(userId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 720 }}>
      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>PLAN</div>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>
          Your plan
        </h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          Subscription details and renewal schedule. To change your plan,
          pick a new one on{" "}
          <Link
            href="/pricing"
            style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            pricing
          </Link>
          .
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="card"
          style={{
            padding: "10px 14px",
            borderColor: "#c00",
            background: "color-mix(in oklab, #c00 6%, transparent)",
            fontSize: 13,
          }}
        >
          Couldn’t load plan details: {error}
        </div>
      ) : null}

      {sub ? <ActivePlanCard sub={sub} /> : <NoPlanCard />}

      <section>
        <h2 style={sectionTitleStyle}>How credits work</h2>
        <ul style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.6, paddingLeft: 18 }}>
          <li>One credit ≈ one AI operation (chat turn, summary, translation, redaction pass).</li>
          <li>Credit packs are one-time purchases and don’t expire until used.</li>
          <li>Subscription credits top up monthly on the renewal date.</li>
          <li>You can always top up on <Link href="/pricing" style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}>pricing</Link> regardless of plan.</li>
        </ul>
      </section>
    </div>
  );
}

function ActivePlanCard({
  sub,
}: {
  sub: NonNullable<Awaited<ReturnType<typeof getActiveSubscription>>["data"]>;
}) {
  const scheduledToEnd =
    sub.cancelledAt !== null &&
    sub.currentPeriodEnd !== null &&
    sub.currentPeriodEnd.getTime() > Date.now();

  return (
    <div className="card" style={{ padding: 20 }}>
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}
      >
        <div className="eyebrow" style={{ margin: 0 }}>Current plan</div>
        <StatusPill status={sub.status} />
      </div>
      <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em" }}>
        {humanizePackId(sub.planCode)}
      </div>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "10px 16px",
          fontSize: 13,
          marginTop: 14,
          marginBottom: 0,
        }}
      >
        <dt className="muted">Status</dt>
        <dd style={{ margin: 0 }}>{humanizeStatus(sub.status)}</dd>

        <dt className="muted">Period start</dt>
        <dd style={{ margin: 0 }}>
          {sub.currentPeriodStart
            ? sub.currentPeriodStart.toLocaleDateString()
            : "—"}
        </dd>

        <dt className="muted">{scheduledToEnd ? "Ends on" : "Next renewal"}</dt>
        <dd style={{ margin: 0 }}>
          {sub.currentPeriodEnd
            ? `${sub.currentPeriodEnd.toLocaleDateString()} (${formatRelative(sub.currentPeriodEnd)})`
            : "—"}
        </dd>

        {sub.cancelledAt ? (
          <>
            <dt className="muted">Cancelled</dt>
            <dd style={{ margin: 0 }}>
              {formatRelative(sub.cancelledAt)}
              {scheduledToEnd ? " — still active until period end" : ""}
            </dd>
          </>
        ) : null}
      </dl>

      <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
        <Link href="/pricing" className="btn btn-ghost btn-sm">
          Change plan
        </Link>
        <Link href="/app/billing" className="btn btn-ghost btn-sm">
          See billing
        </Link>
      </div>
    </div>
  );
}

function NoPlanCard() {
  return (
    <div
      className="card"
      style={{
        padding: 32,
        textAlign: "center",
        borderStyle: "dashed",
      }}
    >
      <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>
        No active subscription
      </p>
      <p className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 16 }}>
        Core PDF tools are free forever. Pick a credit pack or subscribe when
        you’re ready for AI features.
      </p>
      <Link href="/pricing" className="btn btn-accent btn-sm">
        See pricing
      </Link>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const good = status === "active";
  const warn = status === "pending" || status === "paused";
  const tone = good ? "#2f855a" : warn ? "#b7791f" : "var(--fg-subtle)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        color: tone,
        border: `1px solid ${tone}`,
        background: "var(--bg-2)",
      }}
    >
      {humanizeStatus(status)}
    </span>
  );
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--fg-subtle)",
  margin: "0 0 10px 0",
};
