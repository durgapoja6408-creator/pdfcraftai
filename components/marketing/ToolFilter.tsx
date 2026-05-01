"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { I } from "@/components/icons/Icons";
import { TOOLS, type Tool } from "@/lib/tools";

type Filter = "all" | "free" | "ai";

export function ToolFilter() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    return TOOLS.filter((t) => {
      // 2026-05-01 — ai-chat is intentionally excluded from the /tools
      // catalog. Chat is a multi-turn product (lives at /app/chat for
      // logged-in users; /chat-with-pdf for public discovery) and
      // doesn't fit the single-shot /tool/[id] shape every other
      // catalog entry uses. It now has its own first-class nav slot
      // alongside "Tools" / "Pricing" in components/nav/TopNav.tsx.
      // The TOOL_STATS.ai count still includes it (chat IS an AI
      // feature) — only the catalog UI hides the card.
      if (t.id === "ai-chat") return false;
      if (filter === "free" && !t.free) return false;
      if (filter === "ai" && t.free) return false;
      if (!q) return true;
      const qq = q.toLowerCase();
      return t.name.toLowerCase().includes(qq) || t.desc.toLowerCase().includes(qq);
    });
  }, [q, filter]);

  return (
    <>
      {/* Search + filter pills */}
      <div
        className="row"
        style={{
          gap: 12,
          marginBottom: 32,
          flexWrap: "wrap",
        }}
      >
        <div
          className="row"
          style={{
            flex: 1,
            minWidth: 260,
            background: "var(--bg-1)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "0 12px",
            gap: 8,
          }}
        >
          <I.Search size={16} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tools…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              padding: "12px 0",
              color: "var(--fg)",
              outline: "none",
              fontSize: 14,
            }}
          />
        </div>

        <div className="row" style={{ gap: 4, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 10, padding: 4 }}>
          {(["all", "free", "ai"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="btn"
              style={{
                padding: "8px 14px",
                background: filter === f ? "var(--bg-2)" : "transparent",
                border: "none",
                color: filter === f ? "var(--fg)" : "var(--fg-subtle)",
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                fontWeight: 500,
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Results grid */}
      {filtered.length === 0 ? (
        <div
          className="muted"
          style={{
            textAlign: "center",
            padding: "64px 0",
            fontSize: 15,
          }}
        >
          No tools match &ldquo;{q}&rdquo;
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          {filtered.map((t) => (
            <ToolCard key={t.id} tool={t} />
          ))}
        </div>
      )}
    </>
  );
}

function ToolCard({ tool: t }: { tool: Tool }) {
  const Ic = I[t.icon];
  return (
    // #20 (2026-04-29): prefetch={false} disables Next.js's default
    // viewport-enter RSC prefetch. /tools renders ~94 cards; without
    // this, scrolling triggers ~94 parallel RSC requests in production
    // and saturates Hostinger LSAPI's cgroup thread budget — that's
    // the recurring 503 cascade pattern (CLAUDE.md §5). Users still
    // get fast navigation: Next.js prefetches on hover/focus, so
    // the moment a user actually aims for a card the RSC payload
    // is in flight. The visual flood is what kills the workers, not
    // the eventual click.
    <Link href={`/tool/${t.id}`} prefetch={false} className="card card-hover" style={{ padding: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: t.free ? "var(--blue-soft)" : "var(--accent-soft)",
            color: t.free ? "var(--blue)" : "var(--accent)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Ic size={18} />
        </div>
        {t.free ? <span className="chip chip-free">Free</span> : <span className="chip chip-ai">AI</span>}
      </div>
      <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 4 }}>{t.name}</div>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
        {t.desc}
      </div>
      <div
        style={{
          borderTop: "1px solid var(--border)",
          marginTop: 16,
          paddingTop: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>
          {t.free ? "FREE · UNLIMITED" : t.cost}
        </span>
        <I.ArrowRight size={14} />
      </div>
    </Link>
  );
}
