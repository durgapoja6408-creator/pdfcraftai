"use client";

// Out-of-credits alert with conversion CTA (plan §9, Day 6.5).
//
// Reusable block shown inline when an AI op returns 402
// `insufficient_credits`. Replaces the plain-text error with a card
// that:
//   - Tells the user how many credits they need vs have (echoed from
//     the route's 402 response — credits-only, no rupees per call).
//   - Links to /buy with the deal-of-the-day featured.
//   - Mentions the 14-day refund policy as a soft-trust anchor.
//
// Why a component, not a modal
//   Tool runners already have a designated error slot in their JSX.
//   Swapping the plain `{error}` div for this component when the
//   error matches an insufficient-credits pattern lets tools opt in
//   without reorganising their layout. A modal would require a
//   global mount point + portal infrastructure that doesn't exist
//   today (no toast / dialog system mounted at app root). Future
//   commit can add that infrastructure if we want a true modal.
//
// Usage pattern in a tool component:
//
//   {error && (
//     isInsufficientCredits(error) ? (
//       <OutOfCreditsAlert
//         required={parseRequired(error)}
//         balance={parseBalance(error)}
//       />
//     ) : (
//       <div role="alert" className="card error-card">{error}</div>
//     )
//   )}
//
// The `is` + `parse` helpers below are pure-string regex against
// the message format that mapErrorBody() returns (e.g. "Not enough
// credits — this summary costs 3, you have 0. Top up on /app/billing.").
// Tools don't need to know the parse rules — just call the helpers.

import { useEffect, useState } from "react";
import Link from "next/link";
import { I } from "@/components/icons/Icons";

// 2026-05-03 plan §9 / Gap #4 — humanize an op id for the recap line.
// Mirrors the `cost: "3 credits per doc"` desc copy in lib/tools.ts but
// kept inline so the alert stays a leaf component (no cross-server
// import dance).
const OP_DISPLAY_NAMES: Record<string, string> = {
  summarize: "Summarize",
  rewrite: "Rewrite",
  table: "Table extract",
  compare: "Compare",
  generate: "Generate",
  translate: "Translate",
  ocr: "OCR",
  redact: "Redact",
  sign: "Sign",
  chat_turn: "Chat",
};

function displayOp(op: string): string {
  return OP_DISPLAY_NAMES[op] ?? op;
}

interface RecentUsageResponse {
  totalCredits: number;
  days: number;
  top: Array<{ op: string; credits: number; calls: number }>;
}

export interface OutOfCreditsAlertProps {
  /** Credits the failed op required. From the 402 response body. */
  required: number;
  /** User's current balance. From the 402 response body. */
  balance: number;
  /**
   * Optional tool name for personalised copy ("This summary needs 3
   * credits — you have 0"). Defaults to "operation" if omitted.
   */
  opLabel?: string;
  /**
   * 2026-05-04 (Plan T2-5) — set when the spend was blocked by the
   * per-op signup-bonus cap (Gap #2 / Option A) rather than a true
   * zero-balance situation. Activates the friendlier "Free trial cap
   * reached on this tool" heading + body copy. The Buy Credits CTA
   * still works — topping up bypasses the cap entirely.
   */
  capExceeded?: boolean;
}

/**
 * Test whether an error string matches the 402 insufficient-credits
 * pattern. Tool components call this to decide between the
 * OutOfCreditsAlert and the generic error block.
 *
 * Matches both the standard "Not enough credits" copy AND the
 * trial-cap variant which includes a `[trial-cap]` marker token —
 * see isCapExceededError below.
 */
export function isInsufficientCreditsError(msg: string): boolean {
  return /not\s+enough\s+credits/i.test(msg) || /\[trial-cap\]/i.test(msg);
}

/**
 * 2026-05-04 (Plan T2-5) — detect the per-op cap variant. Tool
 * components emit a marker `[trial-cap]` in the error string when
 * the route handler returned `capExceeded:true` in the 402 body.
 * Strips noise from the regex by anchoring on the literal token.
 */
export function isCapExceededError(msg: string): boolean {
  return /\[trial-cap\]/i.test(msg);
}

/** Extract the `required` number from the message, falling back to 0. */
export function parseRequiredFromError(msg: string): number {
  const m = msg.match(/costs?\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

/** Extract the `balance` number from the message, falling back to 0. */
export function parseBalanceFromError(msg: string): number {
  const m = msg.match(/you\s+have\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

export function OutOfCreditsAlert({
  required,
  balance,
  opLabel = "this operation",
  capExceeded = false,
}: OutOfCreditsAlertProps) {
  const shortfall = Math.max(0, required - balance);

  // 2026-05-03 plan §9 / Gap #4 — fetch last-7-day usage recap on mount.
  // Soft-load: if the fetch fails or returns empty, we just hide the
  // recap section. The alert itself is still useful (CTA + balance copy)
  // without it.
  const [recap, setRecap] = useState<RecentUsageResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    fetch("/api/account/recent-usage", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: RecentUsageResponse | null) => {
        if (cancelled || !data) return;
        // Only show the recap if the user actually used something —
        // surfacing "you used 0 credits this week" to a brand-new
        // signup who just hit the cap is condescending, not helpful.
        if (data.totalCredits > 0 && data.top.length > 0) {
          setRecap(data);
        }
      })
      .catch(() => {
        // Network / abort — render nothing rather than scaring the
        // user with an "analytics failed" banner that doesn't help
        // them buy credits.
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  return (
    <div
      role="alert"
      className="card"
      style={{
        padding: 18,
        borderColor: "var(--accent)",
        background: "color-mix(in oklab, var(--accent) 8%, transparent)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "color-mix(in oklab, var(--accent) 18%, transparent)",
            color: "var(--accent)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <I.Coin size={16} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
            {capExceeded
              ? "Free trial cap reached on this tool"
              : "Not enough credits"}
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            {capExceeded ? (
              <>
                Your free trial allows up to{" "}
                <strong style={{ color: "var(--fg)" }}>{balance} credits</strong>{" "}
                on this tool. {opLabel} needs{" "}
                <strong style={{ color: "var(--fg)" }}>{required}</strong>. Top up
                to keep using it — paid credits don&apos;t have a per-tool cap.
              </>
            ) : (
              <>
                {opLabel} needs <strong style={{ color: "var(--fg)" }}>{required} credits</strong>.
                You have <strong style={{ color: "var(--fg)" }}>{balance}</strong>.
                {shortfall > 0 && (
                  <>
                    {" "}
                    Top up <strong style={{ color: "var(--fg)" }}>{shortfall} more</strong> to run.
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {recap && (
        // 2026-05-03 plan §9 / Gap #4 — personalized usage recap.
        // "Last 7 days you used N credits across X / Y / Z" reminds
        // users what their balance went toward and softens the
        // upsell ask into a "you've been getting value" frame.
        <div
          className="muted"
          style={{
            fontSize: 12,
            paddingLeft: 42,
            lineHeight: 1.5,
          }}
        >
          <span>Last {recap.days} days you used </span>
          <strong style={{ color: "var(--fg)" }}>
            {recap.totalCredits} credit{recap.totalCredits === 1 ? "" : "s"}
          </strong>
          <span> across </span>
          <strong style={{ color: "var(--fg)" }}>
            {recap.top.map((t) => displayOp(t.op)).join(" · ")}
          </strong>
          <span>.</span>
        </div>
      )}

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {/* Primary CTA → /app/credits (signed-in cash register).
            Secondary → /pricing (public catalog for visitors who
            land on this alert via a sign-out edge case). */}
        <Link
          href="/app/credits"
          className="btn btn-primary btn-sm"
          style={{ textDecoration: "none" }}
        >
          Buy credits
        </Link>
        <Link
          href="/pricing"
          className="btn btn-outline btn-sm"
          style={{ textDecoration: "none" }}
        >
          See packs
        </Link>
      </div>

      <div
        className="subtle"
        style={{
          fontSize: 11,
          paddingTop: 8,
          borderTop: "1px solid color-mix(in oklab, var(--accent) 18%, transparent)",
        }}
      >
        Purchased credits never expire. 14-day refund on unused credits.
      </div>
    </div>
  );
}
