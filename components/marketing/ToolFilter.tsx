"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  NEW_TOOL_IDS,
  type ToolSort,
} from "@/lib/tool-sections";
import { matchesQuery, highlightSegments } from "@/lib/client/tools-search";
import { parseToolsQuery, buildToolsQuery } from "@/lib/client/tools-url";
import {
  getFavorites,
  getRecent,
  toggleFavorite,
  PREFS_EVENT,
} from "@/lib/client/tool-prefs";

type Filter = "all" | "free" | "ai";

const TOOLS_ORDER = [...FREE_SECTIONS, ...AI_SECTIONS];
const CATALOG: Tool[] = TOOLS.filter((t) => t.id !== "ai-chat");
const CATALOG_COUNT = CATALOG.length;
const BY_ID = new Map<string, Tool>(CATALOG.map((t) => [t.id, t]));
const POPULAR: Tool[] = POPULAR_TOOL_IDS
  .map((id) => BY_ID.get(id))
  .filter((t): t is Tool => !!t);

// tool id -> section label (search haystack + category matching).
const LABEL_OF = new Map<string, string>(
  CATALOG.map((t) => {
    const label = t.free
      ? FREE_SECTIONS.find((s) => s.group === t.group)?.label ?? t.group
      : AI_SECTIONS.find((s) => s.ids.includes(t.id))?.label ?? "AI";
    return [t.id, label];
  }),
);

// popularity rank for the "popular" sort.
const POP_RANK = new Map<string, number>(POPULAR_TOOL_IDS.map((id, i) => [id, i]));

function synonymIds(qq: string): Set<string> {
  const out = new Set<string>();
  for (const term in SEARCH_SYNONYMS) {
    if (qq.includes(term)) for (const id of SEARCH_SYNONYMS[term]) out.add(id);
  }
  return out;
}

function sortTools(tools: Tool[], sort: ToolSort): Tool[] {
  if (sort === "az") return [...tools].sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "popular") {
    return [...tools].sort((a, b) => {
      const ra = POP_RANK.has(a.id) ? (POP_RANK.get(a.id) as number) : 999;
      const rb = POP_RANK.has(b.id) ? (POP_RANK.get(b.id) as number) : 999;
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
    });
  }
  return tools;
}

export function ToolFilter() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<ToolSort>("curated");
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(ALL_SECTION_KEYS));
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [condensed, setCondensed] = useState(false);
  const [activeKey, setActiveKey] = useState<string>("");
  const [cat, setCat] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Client-only state after mount (avoids hydration mismatch): favourites +
  // recent from localStorage, filter/search from the URL, mobile collapse,
  // keyboard shortcuts, cross-tab prefs sync.
  useEffect(() => {
    setMounted(true);
    setFavorites(getFavorites());
    setRecent(getRecent());

    const parsed = parseToolsQuery(window.location.search);
    if (parsed.q) setQ(parsed.q);
    if (parsed.filter === "free" || parsed.filter === "ai") setFilter(parsed.filter);

    const isMobile = window.matchMedia("(max-width: 640px)").matches;
    if (isMobile) {
      const keep = new Set<string>([FREE_SECTIONS[0].key]);
      if (parsed.cat) keep.add(parsed.cat);
      setOpenKeys(keep);
    }
    if (parsed.cat) {
      setCat(parsed.cat);
      if (!isMobile) setOpenKeys((prev) => new Set(prev).add(parsed.cat));
      requestAnimationFrame(() =>
        document.getElementById(`cat-${parsed.cat}`)?.scrollIntoView({ block: "start" }),
      );
    }

    const onPrefs = () => {
      setFavorites(getFavorites());
      setRecent(getRecent());
    };
    window.addEventListener(PREFS_EVENT, onPrefs);

    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && el === inputRef.current) {
        setQ("");
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener(PREFS_EVENT, onPrefs);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // state -> URL (replaceState: shareable + reload-safe, no history spam).
  useEffect(() => {
    if (!mounted) return;
    const qs = buildToolsQuery({ q: q.trim(), filter, cat });
    window.history.replaceState(null, "", window.location.pathname + qs + window.location.hash);
  }, [q, filter, cat, mounted]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const forced = qq ? synonymIds(qq) : null;
    return CATALOG.filter((t) => {
      if (filter === "free" && !t.free) return false;
      if (filter === "ai" && t.free) return false;
      if (!qq) return true;
      if (forced && forced.has(t.id)) return true;
      return matchesQuery(`${t.name} ${t.desc} ${LABEL_OF.get(t.id) || ""}`, qq);
    });
  }, [q, filter]);

  const sections = useMemo(() => {
    const built = buildSections(filtered, TOOLS_ORDER);
    return sort === "curated"
      ? built
      : built.map((s) => ({ ...s, tools: sortTools(s.tools, sort) }));
  }, [filtered, sort]);

  const favTools = useMemo(
    () => favorites.map((id) => BY_ID.get(id)).filter((t): t is Tool => !!t),
    [favorites],
  );
  const recentTools = useMemo(
    () =>
      recent
        .map((id) => BY_ID.get(id))
        .filter((t): t is Tool => !!t)
        .slice(0, 8),
    [recent],
  );

  const searching = q.trim().length > 0;
  const showPopular = filter === "all" && !searching;
  const showFav = mounted && showPopular && favTools.length > 0;
  const showRecent = mounted && showPopular && recentTools.length > 0;

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

  const jumpTo = (key: string) => {
    setCat(key);
    setOpenKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    requestAnimationFrame(() => {
      document.getElementById(`cat-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const onToggleFav = (id: string) => setFavorites(toggleFavorite(id));

  // Scroll-spy: highlight the jump chip for the section nearest the top.
  useEffect(() => {
    if (!mounted || searching) return;
    const els = sections
      .map((s) => document.getElementById(`cat-${s.key}`))
      .filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const spy = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActiveKey(vis[0].target.id.replace("cat-", ""));
      },
      { rootMargin: "-130px 0px -55% 0px", threshold: 0 },
    );
    els.forEach((el) => spy.observe(el));
    return () => spy.disconnect();
  }, [mounted, sections, searching]);

  // Condense the sticky header once the user scrolls past the top sentinel.
  useEffect(() => {
    if (!mounted) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setCondensed(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [mounted]);

  const count = filtered.length;
  const countText = searching
    ? `${count} ${count === 1 ? "match" : "matches"} for “${q.trim()}”`
    : `${count} tools`;
  const CTRL_H = 44;

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
      <div className={`tools-sticky${condensed ? " tools-sticky--condensed" : ""}`}>
        {/* Search — full width */}
        <div
          className="row"
          style={{ height: CTRL_H, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 10, padding: "0 14px", gap: 10 }}
        >
          <I.Search size={16} style={{ color: "var(--fg-subtle)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${CATALOG_COUNT} tools…`}
            aria-label="Search tools"
            style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", padding: 0, color: "var(--fg)", outline: "none", fontSize: 14 }}
          />
          {searching ? (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")} style={{ background: "transparent", border: "none", color: "var(--fg-subtle)", cursor: "pointer", display: "flex", padding: 0 }}>
              <I.Plus size={16} style={{ transform: "rotate(45deg)" }} />
            </button>
          ) : (
            <span className="tools-kbd mono" aria-hidden="true">/</span>
          )}
        </div>

        {/* Controls — filter group + sort + Browse-by-task, height-matched */}
        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div className="row" style={{ gap: 3, height: CTRL_H, boxSizing: "border-box", background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 10, padding: "0 4px" }}>
            {(["all", "free", "ai"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className="btn"
                style={{ height: 34, padding: "0 14px", background: filter === f ? "var(--bg-2)" : "transparent", border: "none", color: filter === f ? "var(--fg)" : "var(--fg-subtle)", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 500 }}
              >
                {f}
              </button>
            ))}
          </div>
          <label className="row tools-sortwrap" style={{ height: CTRL_H, boxSizing: "border-box", gap: 8, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 10, padding: "0 12px" }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)", letterSpacing: "0.04em" }}>SORT</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as ToolSort)}
              aria-label="Sort tools"
              className="tools-sort"
            >
              <option value="curated">Curated</option>
              <option value="az">A–Z</option>
              <option value="popular">Popular</option>
            </select>
          </label>
          <Link
            href="/compare"
            className="btn btn-outline"
            style={{ height: CTRL_H, boxSizing: "border-box", display: "inline-flex", alignItems: "center", gap: 8, padding: "0 16px", whiteSpace: "nowrap", fontSize: 13.5 }}
          >
            Browse by task <I.ArrowRight size={14} />
          </Link>
        </div>

        {/* Category jump-bar — wraps; active chip tracks scroll (hidden while searching) */}
        {!searching && sections.length > 1 && (
          <nav className="tools-jumpbar" aria-label="Jump to category">
            {sections.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`tools-jumpchip${activeKey === s.key ? " is-active" : ""}`}
                aria-current={activeKey === s.key ? "true" : undefined}
                onClick={() => jumpTo(s.key)}
              >
                {s.label}
                <span className="mono" style={{ opacity: 0.55, marginLeft: 6 }}>{s.tools.length}</span>
              </button>
            ))}
          </nav>
        )}

        {/* Meta row — count + collapse */}
        <div className="tools-meta row" style={{ justifyContent: "space-between", marginTop: 14, gap: 12 }}>
          <span className="muted" role="status" aria-live="polite" style={{ fontSize: 12 }}>{countText}</span>
          {!searching && (
            <button type="button" onClick={() => setAll(!anyOpen)} className="tool-group-allbtn mono" style={{ background: "transparent", border: "none", color: "var(--fg-subtle)", fontSize: 12, letterSpacing: "0.04em", cursor: "pointer", padding: 0 }}>
              {anyOpen ? "COLLAPSE ALL" : "EXPAND ALL"}
            </button>
          )}
        </div>
      </div>

      {/* Favourites — pinned by the user (client-only, after mount) */}
      {showFav && (
        <section style={{ margin: "8px 0 20px" }}>
          <h2 className="tools-extra-h2">
            <I.Star size={17} style={{ color: "var(--accent)" }} />
            Favourites <span className="mono" style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{favTools.length}</span>
          </h2>
          <div className="tools-grid">
            {favTools.map((t) => (
              <ToolCard key={t.id} tool={t} fav onFav={onToggleFav} q="" />
            ))}
          </div>
        </section>
      )}

      {/* Recently used — pills (client-only, after mount) */}
      {showRecent && (
        <section style={{ margin: "0 0 22px" }}>
          <h2 className="tools-extra-h2">
            <I.Clock size={16} style={{ color: "var(--fg-subtle)" }} />
            Recently used
          </h2>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {recentTools.map((t) => {
              const Ic = I[t.icon];
              return (
                <Link key={t.id} href={`/tool/${t.id}`} prefetch={false} className="tools-recent-pill">
                  <Ic size={14} style={{ color: t.free ? "var(--blue)" : "var(--accent)" }} />
                  {t.name}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Popular / Start here — default (all, unsearched) view only */}
      {showPopular && (
        <section style={{ margin: "8px 0 20px" }}>
          <h2 className="tools-extra-h2">
            Popular <span className="mono" style={{ fontSize: 12, color: "var(--fg-subtle)" }}>start here</span>
          </h2>
          <div className="tools-grid">
            {POPULAR.map((t) => (
              <ToolCard key={t.id} tool={t} fav={favorites.includes(t.id)} onFav={onToggleFav} q="" />
            ))}
          </div>
        </section>
      )}

      {/* Results — collapsible category sections (first omits top border: single divider) */}
      {sections.length === 0 ? (
        <div className="muted" style={{ textAlign: "center", padding: "56px 0", fontSize: 15 }}>
          <p style={{ margin: "0 0 16px" }}>No tools match “{q.trim()}”.</p>
          <Link href="/compare" className="btn btn-primary">
            Not sure? Find a tool by task <I.ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        sections.map((s, i) => {
          const open = isOpen(s.key);
          const panelId = `tool-group-panel-${s.key}`;
          const btnId = `tool-group-btn-${s.key}`;
          const blurb = SECTION_BLURBS[s.key];
          return (
            <section key={s.key} id={`cat-${s.key}`} style={{ marginBottom: 12, borderTop: i === 0 ? "none" : "1px solid var(--border)", scrollMarginTop: 130 }}>
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
                  <div className="tools-grid">
                    {s.tools.map((t) => (
                      <ToolCard key={t.id} tool={t} fav={favorites.includes(t.id)} onFav={onToggleFav} q={q.trim()} />
                    ))}
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

function ToolCard({ tool: t, fav, onFav, q }: { tool: Tool; fav: boolean; onFav: (id: string) => void; q: string }) {
  const Ic = I[t.icon];
  const isNew = NEW_TOOL_IDS.has(t.id);
  const footer = t.free
    ? SERVER_SIDE_IDS.has(t.id)
      ? "FREE · UNLIMITED"
      : "FREE · UNLIMITED · IN-BROWSER"
    : t.cost;
  const nameSegs = q ? highlightSegments(t.name, q) : null;
  return (
    <div className="card card-hover" style={{ position: "relative", padding: 18 }}>
      <button
        type="button"
        className={`tool-star${fav ? " is-on" : ""}`}
        aria-pressed={fav}
        aria-label={fav ? `Remove ${t.name} from favourites` : `Add ${t.name} to favourites`}
        onClick={() => onFav(t.id)}
      >
        <I.Star size={16} />
      </button>
      <Link href={`/tool/${t.id}`} prefetch={false} style={{ display: "block", color: "inherit", textDecoration: "none" }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: t.free ? "var(--blue-soft)" : "var(--accent-soft)", color: t.free ? "var(--blue)" : "var(--accent)", display: "grid", placeItems: "center" }}>
          <Ic size={18} />
        </div>
        <div className="row" style={{ gap: 8, margin: "9px 0 4px", flexWrap: "wrap", paddingRight: 22 }}>
          <span style={{ fontWeight: 500, fontSize: 15 }}>
            {nameSegs
              ? nameSegs.map((seg, i) => (seg.hit ? <mark key={i} className="tool-hl">{seg.t}</mark> : <span key={i}>{seg.t}</span>))
              : t.name}
          </span>
          {t.free ? <span className="chip chip-free">Free</span> : <span className="chip chip-ai">AI</span>}
          {isNew && <span className="chip chip-new">NEW</span>}
        </div>
        <div className="muted tool-card-desc" style={{ fontSize: 13, lineHeight: 1.45 }}>{t.desc}</div>
        <div style={{ borderTop: "1px solid var(--border)", marginTop: 16, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{footer}</span>
          <I.ArrowRight size={14} />
        </div>
      </Link>
    </div>
  );
}
