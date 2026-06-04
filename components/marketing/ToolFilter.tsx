"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { I } from "@/components/icons/Icons";
import { TOOLS, type Tool } from "@/lib/tools";

type Filter = "all" | "free" | "ai";

// ---------------------------------------------------------------------------
// Section model
// ---------------------------------------------------------------------------
// The catalog renders as a flat list of collapsible sections. The five free
// categories come straight from each tool's data-level `group` field. The AI
// side is one big `group: "AI"` in the data, so we sub-group it HERE in the UI
// (by tool id) into themed sections - without touching `tool.group` (that's
// validated by test-tool-id-conventions.mjs). Every catalog AI tool must land
// in exactly one bucket; anything unmapped falls into "More AI tools" so a
// newly-added AI tool can never silently disappear.
//
// 2026-06-04: collapsible accordion + AI sub-grouping (user request). Each
// section is an accessible disclosure (h2 > button[aria-expanded]). Default
// is all-expanded so the SSR snapshot contains every tool card/link (good for
// crawl + in-page find); collapsing is a client action. Typing in search
// force-opens every matching section so results are never hidden.

type FreeSection = { kind: "free"; key: string; label: string; group: Tool["group"] };
type AiSection = { kind: "ai"; key: string; label: string; ids: readonly string[] };
type SectionDef = FreeSection | AiSection;

const SECTIONS: readonly SectionDef[] = [
  { kind: "free", key: "Organize", label: "Organize", group: "Organize" },
  { kind: "free", key: "Convert", label: "Convert", group: "Convert" },
  { kind: "free", key: "Edit", label: "Edit & annotate", group: "Edit" },
  { kind: "free", key: "Optimize", label: "Optimize", group: "Optimize" },
  { kind: "free", key: "Security", label: "Security & redaction", group: "Security" },
  {
    kind: "ai",
    key: "ai-understand",
    label: "Summarize & Understand",
    ids: [
      "ai-summarize", "ai-tldr", "ai-key-points", "ai-study-notes", "ai-eli5",
      "ai-faq", "ai-mindmap", "ai-flashcards", "ai-quiz", "ai-syllabus",
      "ai-research-paper", "ai-semantic-search",
    ],
  },
  {
    kind: "ai",
    key: "ai-write",
    label: "Write & Rewrite",
    ids: [
      "ai-blog", "ai-newsletter", "ai-video-script", "ai-social-thread",
      "ai-condense", "ai-expand", "ai-improve-writing", "ai-paraphrase",
      "ai-rewrite", "ai-proofread", "ai-generate",
    ],
  },
  {
    kind: "ai",
    key: "ai-analyze",
    label: "Analyse & Extract",
    ids: [
      "ai-entities", "ai-tone-analyze", "ai-citations", "ai-sentiment",
      "ai-bias", "ai-readability", "ai-detector", "ai-action-items",
      "ai-chart-to-table", "ai-table", "ai-compare",
    ],
  },
  {
    kind: "ai",
    key: "ai-docs",
    label: "Documents & Convert",
    ids: ["ai-translate", "ai-ocr", "ai-searchable-pdf", "ai-redact", "ai-sign"],
  },
  {
    kind: "ai",
    key: "ai-careers",
    label: "Careers",
    ids: ["ai-ats-resume", "ai-resume-parse", "ai-jd-match", "ai-cover-letter"],
  },
  {
    kind: "ai",
    key: "ai-legal-health",
    label: "Legal & Health",
    ids: [
      "ai-nda", "ai-employment", "ai-partnership-deed", "ai-court-order",
      "ai-loan-bundle", "ai-insurance", "ai-salary-slip", "ai-blood-test",
      "ai-discharge",
    ],
  },
];

// id -> AI section key (built once). Used to route AI tools into sub-sections.
const AI_SECTION_OF: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const s of SECTIONS) {
    if (s.kind === "ai") for (const id of s.ids) m.set(id, s.key);
  }
  return m;
})();

const AI_FALLBACK_KEY = "ai-more";
const ALL_SECTION_KEYS: readonly string[] = [...SECTIONS.map((s) => s.key), AI_FALLBACK_KEY];

export function ToolFilter() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // Which sections are open. Default = all open (matches SSR; no persistence,
  // so there's no hydration mismatch and no on-load layout shift).
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(ALL_SECTION_KEYS));

  const filtered = useMemo(() => {
    return TOOLS.filter((t) => {
      // ai-chat is intentionally excluded from the catalog (multi-turn product
      // living at /app/chat + /chat-with-pdf). See TopNav.
      if (t.id === "ai-chat") return false;
      if (filter === "free" && !t.free) return false;
      if (filter === "ai" && t.free) return false;
      if (!q) return true;
      const qq = q.toLowerCase();
      return t.name.toLowerCase().includes(qq) || t.desc.toLowerCase().includes(qq);
    });
  }, [q, filter]);

  // Build the ordered, non-empty sections from the filtered set.
  const sections = useMemo(() => {
    const byKey = new Map<string, Tool[]>();
    for (const t of filtered) {
      const key = t.free ? t.group : AI_SECTION_OF.get(t.id) ?? AI_FALLBACK_KEY;
      const arr = byKey.get(key) ?? [];
      arr.push(t);
      byKey.set(key, arr);
    }
    const out: { key: string; label: string; isAI: boolean; tools: Tool[] }[] = [];
    for (const s of SECTIONS) {
      const tools = byKey.get(s.key) ?? [];
      if (tools.length) out.push({ key: s.key, label: s.label, isAI: s.kind === "ai", tools });
    }
    // Safety net: any AI tool that wasn't mapped to a sub-group.
    const more = byKey.get(AI_FALLBACK_KEY) ?? [];
    if (more.length) out.push({ key: AI_FALLBACK_KEY, label: "More AI tools", isAI: true, tools: more });
    return out;
  }, [filtered]);

  const searching = q.trim().length > 0;
  // While searching, every shown section is force-open so matches aren't hidden.
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

  return (
    <>
      {/* Search + filter pills */}
      <div className="row" style={{ gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
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
            aria-label="Search tools"
            style={{
              flex: 1,
              minWidth: 0,
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
              aria-pressed={filter === f}
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

      {/* Expand/collapse all - hidden while searching (everything is forced open) */}
      {!searching && sections.length > 0 && (
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: 16 }}>
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
      )}

      {/* Results - collapsible sections, each an accessible disclosure */}
      {sections.length === 0 ? (
        <div className="muted" style={{ textAlign: "center", padding: "64px 0", fontSize: 15 }}>
          No tools match &ldquo;{q}&rdquo;
        </div>
      ) : (
        sections.map((s) => {
          const open = isOpen(s.key);
          const panelId = `tool-group-panel-${s.key}`;
          const btnId = `tool-group-btn-${s.key}`;
          return (
            <section key={s.key} style={{ marginBottom: 12, borderTop: "1px solid var(--border)" }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>
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
                  {s.isAI && (
                    <span className="chip chip-ai" style={{ fontSize: 10 }}>
                      AI
                    </span>
                  )}
                  <span className="mono" style={{ fontSize: 12, color: "var(--fg-subtle)", marginLeft: "auto" }}>
                    {s.tools.length}
                  </span>
                </button>
              </h2>
              {open && (
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 12,
                    padding: "4px 0 24px",
                  }}
                >
                  {s.tools.map((t) => (
                    <ToolCard key={t.id} tool={t} />
                  ))}
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
  return (
    // #20 (2026-04-29): prefetch={false} disables Next.js's default
    // viewport-enter RSC prefetch. /tools renders ~94 cards; without
    // this, scrolling triggers ~94 parallel RSC requests in production
    // and saturates Hostinger LSAPI's cgroup thread budget - that's
    // the recurring 503 cascade pattern (CLAUDE.md section 5). Users still
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
