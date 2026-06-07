"use client";

// Anon → signup funnel (2026-06-07, upgrade plan #4). Shown ONLY to logged-out
// visitors on an AI tool page: instead of meeting a bare "Sign in" wall when
// they click Run, they see the value up front — 5 free credits, no card. One
// shared component injected once at the AI-tool page level (covers all AI
// tools). Renders nothing for authenticated users and during the session
// "loading" phase (avoids a flash-then-hide).

import Link from "next/link";
import { useSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";

export function AiFreeCreditsUpsell({ toolId }: { toolId: string }) {
  const { status } = useSession();
  if (status !== "unauthenticated") return null;
  const cb = encodeURIComponent(`/tool/${toolId}`);
  return (
    <div
      className="card"
      role="note"
      style={{
        marginTop: 24,
        padding: "14px 18px",
        display: "flex",
        gap: 14,
        alignItems: "center",
        flexWrap: "wrap",
        borderColor: "var(--accent-soft)",
        background: "color-mix(in oklab, var(--accent) 6%, transparent)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          background: "var(--accent-soft)",
          color: "var(--accent)",
        }}
      >
        <I.Sparkle size={18} />
      </span>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>New here? This AI tool is free to try.</div>
        <div className="muted" style={{ fontSize: 13 }}>
          Create an account and get 5 credits — no card, no daily limit.
        </div>
      </div>
      <div className="row" style={{ gap: 8, flexShrink: 0 }}>
        <Link href={`/register?callbackUrl=${cb}`} className="btn btn-primary btn-sm">
          Create free account
        </Link>
        <Link href={`/login?callbackUrl=${cb}`} className="btn btn-outline btn-sm">
          Sign in
        </Link>
      </div>
    </div>
  );
}
