// Inline credit-estimate badge — shows "This will cost N credits" as
// soon as the client has measurable input (pageCount / charCount).
//
// Plan ref: docs/PRICING_AND_TELEMETRY_PLAN.md §5 + Day 2.5.
//
// Usage in a tool component:
//
//   <CreditEstimateBadge op="summarize" pageCount={pageCount} />
//
// Renders one of:
//   - nothing (no input yet)
//   - "Calculating cost…" (loading)
//   - "This will cost X credits. You have Y credits."
//   - "This will cost X credits. You have Y — top up to run." + Buy CTA
//   - silent on auth_required (the tool already gates anonymous users)
//
// Credits-only display per principle 1 — no rupee/dollar mentions per
// call. The /buy CTA is the only place the user sees rupees.

"use client";

import Link from "next/link";
import { useCreditEstimate } from "@/lib/client/use-credit-estimate";

interface Props {
  /** AIOperationId — must match the server-side op string. */
  op: string;
  pageCount?: number;
  charCount?: number;
  /** Optional human-readable verb for the message ("this summary"). */
  opLabel?: string;
}

export function CreditEstimateBadge({ op, pageCount, charCount, opLabel = "this run" }: Props) {
  const { credits, balance, canRun, loading, error } = useCreditEstimate(op, {
    pageCount,
    charCount,
  });

  // Auth-gate is owned by the tool component itself — render nothing.
  if (error === "auth_required") return null;

  // Soft network/rate errors — render nothing rather than scaring the
  // user with a banner. The Run button itself will surface real
  // failures with the full error UI.
  if (error && credits === null) return null;

  // No measurable input yet — silent.
  if (credits === null && !loading) return null;

  if (loading && credits === null) {
    return (
      <div className="muted" style={{ fontSize: 13, padding: "8px 0" }}>
        Calculating cost…
      </div>
    );
  }

  if (credits === null) return null;
  const cost = credits;
  const bal = balance ?? 0;
  const insufficient = canRun === false;

  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: insufficient
          ? "color-mix(in oklab, var(--accent) 8%, transparent)"
          : "var(--bg-2)",
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 13,
      }}
    >
      <div>
        <strong style={{ color: "var(--fg)" }}>
          {opLabel.charAt(0).toUpperCase() + opLabel.slice(1)} costs {cost} credit
          {cost === 1 ? "" : "s"}.
        </strong>
        <span className="muted" style={{ marginLeft: 6 }}>
          You have {bal}.
        </span>
        {insufficient && (
          <span className="muted" style={{ marginLeft: 6 }}>
            Top up <strong style={{ color: "var(--fg)" }}>{cost - bal}</strong> more
            to run.
          </span>
        )}
      </div>
      {insufficient && (
        <Link
          href="/app/credits"
          className="btn btn-sm btn-primary"
          style={{ textDecoration: "none" }}
        >
          Buy credits
        </Link>
      )}
    </div>
  );
}
