"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { I } from "@/components/icons/Icons";
import { TOOLS, type Tool } from "@/lib/tools";
import {
  FREE_SECTIONS,
  AI_SECTIONS,
  ALL_SECTION_KEYS,
  buildSections,
  POPULAR_TOOL_IDS,
  SECTION_BLURBS,
  SEARCH_SYNONYMS,
  SERVER_SIDE_IDS,
} from "@/lib/tool-sections";

type Filter = "all" | "free" | "ai";

const TOOLS_ORDER = [...FREE_SECTIONS, ...AI_SECTIONS];
const POPULAR: Tool[] = POPULAR_TOOL_IDS
  .map((id) => TOOLS.find((t) => t.id === id))
  .filter((t): t is Tool => !!t && t.id !== "ai-chat");

// Expand a query through the synonym/alias map (combine->merge, shrink->
// compress, turn->rotate, …) so intent words that aren't in a tool's
// name/desc still surface the right tools.
function synonymIds(qq: string): Set<string> {
  const out = new Set<string>();
  for (const term in SEARCH_SYNONYMS) {
    if (qq.includes(term)) for (const id of SEARCH_SYNONYMS[term]) out.add(id);
  }
  return out;
}

export function ToolFilter() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(ALL_SECTION_KEYS));

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const forced = qq ? synonymIds(qq) : null;
    return TOOLS.filter((t) => {
      if (t.id === "ai-chat") return false;
      if (filter === "free" && !t.free) return false;
      if (filter === "ai" && t.free) return false;
      if (!qq) return true;
      return (
        t.name.toLowerCase().includes(qq) ||
        t.desc.toLowerCase().includes(qq) ||
        (forced != null && forced.has(t.id))
      );
    });
  }, [q, filter]);

  const sections = useMemo(() => buildSections(filtered, TOOLS_ORDER), [filtered]);

  const searching = q.trim().length > 0;
  const showPopular = filter === "all" && !searching;
  const isOpen = (key: string) => searching || openKeys.has(key);
  const toggle = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const anyOpen = sections.some((s) => openKeys.has(s.key));
  const setAll = (open: boolean) => setOpenKeys(open ? new Set(ALL_SECTION_KEYS) : new Set());

  // Jump to a category: ensure it's open, then smooth-scroll to its anchor.
  const jumpTo = (key: string) => {
    setOpenKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    requestAnimationFrame(() => {
      document.getElementById(`cat-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const count = filtered.length;
  const countText = searching ? `${count} ${count === 1 ? "match" : "matches"} for “${q.trim()}”` : `${count} tools`;

  return (
    <>
      {/* Sticky header: search + filter + quick links + category jump-bar */}
      <div className="tools-sticky">
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div
            className="row"
            style={{ flex: 1, minWidth: 220, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 10, padding: "0 12px", gap: 8 }}
          >
            <I.Search size={16} />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tools…  (try “combine”, “shrink”, “sign”)"
              aria-label="Search tools"
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", padding: "12px 0", color: "var(--fg)", outline: "none", fontSize: 14 }}
            />
          </div>

          <div className="row" style={{ gap: 4, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 10, padding: 4 }}>
            {(["all", "free", "ai"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className="btn"
                style={{ padding: "8px 14px", background: filter === f ? "var(--bg-2)" : "transparent", border: "none", color: filter === f ? "var(--fg)" : "var(--fg-subtle)", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 500 }}
              >
                {f}
              </button>
            ))}
          </div>

          <Link href="/compare" className="btn btn-sm btn-outline" style={{ whiteSpace: "nowrap" }}>
            Browse by task <I.ArrowRight size={13} />
          </Link>
        </div>

        {/* Category jump-bar — one horizontally-scrollable row (hidden while searching) */}
        {!searching && sections.length > 1 && (
          <nav className="tools-jumpbar" aria-label="Jump to category">
            {sections.map((s) => (
              <button key={s.key} type="button" className="tools-jumpchip" onClick={() => jumpTo(s.key)}>
                {s.label}
                <span className="mono" style={{ opacity: 0.6, marginLeft: 6 }}>{s.tools.length}</span>
              </button>
            ))}
          </nav>
        )}

        <div className="row" style={{ justifyContent: "space-between", marginTop: 8, gap: 12 }}>
          <span className="muted" role="status" aria-live="polite" style={{ fontSize: 12 }}>{countText}</span>
          <div className="row" style={{ gap: 14 }}>
            {filter !== "free" && (
              <Link href="/pricing" className="muted" style={{ fontSize: 12, textDecoration: "none" }}>
                What’s a credit? <I.ArrowRight size={11} />
              </Link>
            )}
            {!searching && (
              <button type="button" onClick={() => setAll(!anyOpen)} className="tool-group-allbtn mono" style={{ background: "transparent", border: "none", color: "var(--fg-subtle)", fontSize: 12, letterSpacing: "0.04em", cursor: "pointer", padding: 0 }}>
                {anyOpen ? "COLLAPSE ALL" : "EXPAND ALL"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Popular / Start here — only on the default (all, unsearched) view */}
      {showPopular && (
        <section style={{ margin: "8px 0 20px" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", margin: "0 0 14px" }}>
            Popular <span className="mono" style={{ fontSize: 12, color: "var(--fg-subtle)" }}>start here</span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {POPULAR.map((t) => <ToolCard key={t.id} tool={t} />)}
          </div>
        </section>
      )}

      {/* Results — collapsible category sections */}
      {sections.length === 0 ? (
        <div className="muted" style={{ textAlign: "center", padding: "56px 0", fontSize: 15 }}>
          <p style={{ margin: "0 0 16px" }}>No tools match “{q.trim()}”.</p>
          <Link href="/compare" className="btn btn-primary">
            Not sure? Find a tool by task <I.ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        sections.map((s) => {
          const open = isOpen(s.key);
          const panelId = `tool-group-panel-${s.key}`;
          const btnId = `tool-group-btn-${s.key}`;
          const blurb = SECTION_BLURBS[s.key];
          return (
            <section key={s.key} id={`cat-${s.key}`} style={{ marginBottom: 12, borderTop: "1px solid var(--border)", scrollMarginTop: 130 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>
                <button type="button" id={btnId} className="tool-group-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => toggle(s.key)}>
                  <I.ChevronDown size={18} className="tool-group-chevron" style={{ color: "var(--fg-subtle)", transition: "transform 0.18s ease", transform: open ? "rotate(0deg)" : "rotate(-90deg)", flexShrink: 0 }} />
                  <span style={{ fontSize: 18, fontWeight: 600 }}>{s.label}</span>
                  {s.isAI && <span className="chip chip-ai" style={{ fontSize: 10 }}>AI</span>}
                  <span className="mono" style={{ fontSize: 12, color: "var(--fg-subtle)", marginLeft: "auto" }}>{s.tools.length}</span>
                </button>
              </h2>
              {open && (
                <div id={panelId} role="region" aria-labelledby={btnId} style={{ padding: "0 0 24px" }}>
                  {blurb && <p className="muted" style={{ fontSize: 13, margin: "0 0 14px", maxWidth: 720 }}>{blurb}</p>}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                    {s.tools.map((t) => <ToolCard key={t.id} tool={t} />)}
                  </div>
                </div>
              )}
            </section>
          );
        })
      )}
    </>
  );
}

function ToolCard({ tool: t }: { tool: Tool }) {
  const Ic = I[t.icon];
  const footer = t.free
    ? (SERVER_SIDE_IDS.has(t.id) ? "FREE · UNLIMITED" : "FREE · UNLIMITED · IN-BROWSER")
    : t.cost;
  return (
    // #20 (2026-04-29): prefetch={false} avoids the viewport-enter RSC
    // prefetch flood that saturates Hostinger's LSAPI thread budget (the
    // recurring 503 cascade, CLAUDE.md §5). Hover/focus prefetch still fires.
    <Link href={`/tool/${t.id}`} prefetch={false} className="card card-hover" style={{ padding: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: t.free ? "var(--blue-soft)" : "var(--accent-soft)", color: t.free ? "var(--blue)" : "var(--accent)", display: "grid", placeItems: "center" }}>
          <Ic size={18} />
        </div>
        {t.free ? <span className="chip chip-free">Free</span> : <span className="chip chip-ai">AI</span>}
      </div>
      <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 4 }}>{t.name}</div>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>{t.desc}</div>
      <div style={{ borderTop: "1px solid var(--border)", marginTop: 16, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{footer}</span>
        <I.ArrowRight size={14} />
      </div>
    </Link>
  );
}
