"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { I } from "@/components/icons/Icons";
import { TOOLS, type Tool } from "@/lib/tools";
import { AI_SECTIONS, FREE_SECTIONS, ALL_SECTION_KEYS, buildSections } from "@/lib/tool-sections";

// Homepage showcase = collapsible category accordion, AI-first (matches the
// "AI for the impossible" headline + the page's long-standing AI-first order).
// Shares the section model with /tools (lib/tool-sections) so the 52-tool AI
// sub-grouping can't drift. Default all-expanded (parity with /tools; SSR keeps
// every tool card/link in the homepage HTML for SEO). Section headers are <h3>
// (they sit under this section's <h2> in ToolsShowcase). Collapse is a client
// action; cards stay rendered via React state, just hidden when closed.
const HOME_ORDER = [...AI_SECTIONS, ...FREE_SECTIONS];

export function ToolsShowcaseGroups() {
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(ALL_SECTION_KEYS));

  const sections = useMemo(
    () => buildSections(TOOLS.filter((t) => t.id !== "ai-chat"), HOME_ORDER),
    [],
  );

  const toggle = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const anyOpen = sections.some((s) => openKeys.has(s.key));
  const setAll = (open: boolean) => setOpenKeys(open ? new Set(ALL_SECTION_KEYS) : new Set());

  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setAll(!anyOpen)}
          className="tool-group-allbtn mono"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--fg-subtle)",
            fontSize: 12,
            letterSpacing: "0.04em",
            cursor: "pointer",
            padding: "4px 6px",
          }}
        >
          {anyOpen ? "COLLAPSE ALL" : "EXPAND ALL"}
        </button>
      </div>

      {sections.map((s) => {
        const open = openKeys.has(s.key);
        const panelId = `home-group-panel-${s.key}`;
        const btnId = `home-group-btn-${s.key}`;
        return (
          <div key={s.key} style={{ marginBottom: 12, borderTop: "1px solid var(--border)" }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>
              <button
                type="button"
                id={btnId}
                className="tool-group-toggle"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(s.key)}
              >
                <I.ChevronDown
                  size={18}
                  className="tool-group-chevron"
                  style={{
                    color: "var(--fg-subtle)",
                    transition: "transform 0.18s ease",
                    transform: open ? "rotate(0deg)" : "rotate(-90deg)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 18, fontWeight: 600 }}>{s.label}</span>
                {s.isAI ? (
                  <span className="chip chip-ai" style={{ fontSize: 10 }}>
                    Credits
                  </span>
                ) : (
                  <span className="chip chip-free" style={{ fontSize: 10 }}>
                    Free
                  </span>
                )}
                <span className="mono subtle" style={{ fontSize: 12, marginLeft: "auto" }}>
                  {s.tools.length} tools
                </span>
              </button>
            </h3>
            {open && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={btnId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 12,
                  padding: "4px 0 20px",
                }}
              >
                {s.tools.map((t) => (
                  <HomeToolCard key={t.id} tool={t} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function HomeToolCard({ tool: t }: { tool: Tool }) {
  const Ic = I[t.icon];
  return (
    // prefetch={false}: the homepage tool grid is the highest-traffic
    // contributor to the LSAPI 503 cascade (CLAUDE.md section 5). Hover/focus
    // prefetch still makes navigation feel instant once a user aims at a card.
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
      {t.cost && (
        <div className="mono" style={{ marginTop: 16, fontSize: 11, color: "var(--fg-subtle)" }}>
          {t.cost}
        </div>
      )}
    </Link>
  );
}
