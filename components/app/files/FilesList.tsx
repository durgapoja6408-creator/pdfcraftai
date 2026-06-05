"use client";

// Client-side findability for /app/files (2026-06-05). The page used to render
// a flat, uncapped-feeling list of up to 100 rows with no search/sort — a heavy
// user couldn't find a file and rows past the cap silently vanished. This owns
// search-by-name + sort + source filter over the server-loaded rows, and
// honestly surfaces "{shown} of {total}" with a cap note when total > loaded.

import { useMemo, useState } from "react";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { toolById } from "@/lib/tools";
import { DeleteFileButton } from "@/components/app/files/DeleteFileButton";
import { OpenInChatButton } from "@/components/app/files/OpenInChatButton";

// AI tool ids whose outputs have a dedicated preview page (kept in sync with
// the page-level set that was here before the extraction).
const AI_PREVIEWABLE_TOOL_IDS = new Set<string>([
  "ai-summarize",
  "ai-translate",
  "ai-compare",
  "ai-ocr",
]);

export type FileRow = {
  id: string;
  name: string;
  mime: string | null;
  sizeBytes: number;
  source: "upload" | "tool" | null;
  toolId: string | null;
  createdAt: string; // ISO — serialized across the RSC boundary
};

type SortKey = "newest" | "oldest" | "name" | "size";
type SourceFilter = "all" | "upload" | "tool";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesList({ rows, total }: { rows: FileRow[]; total: number }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [source, setSource] = useState<SourceFilter>("all");

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (source === "upload" && r.source === "tool") return false;
      if (source === "tool" && r.source !== "tool") return false;
      if (needle && !r.name.toLowerCase().includes(needle)) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "size") return b.sizeBytes - a.sizeBytes;
      const ta = Date.parse(a.createdAt), tb = Date.parse(b.createdAt);
      return sort === "oldest" ? ta - tb : tb - ta;
    });
    return out;
  }, [rows, q, sort, source]);

  const searching = q.trim().length > 0 || source !== "all";
  const FILTERS: { key: SourceFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "upload", label: "Uploads" },
    { key: "tool", label: "Tool outputs" },
  ];

  return (
    <section>
      {/* Toolbar */}
      <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div
          className="row"
          style={{ flex: "1 1 240px", minWidth: 0, height: 38, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 10, padding: "0 12px", gap: 8 }}
        >
          <I.Search size={15} style={{ color: "var(--fg-subtle)", flexShrink: 0 }} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search files by name…"
            aria-label="Search files by name"
            style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", padding: 0, color: "var(--fg)", outline: "none", fontSize: 14 }}
          />
          {searching && (
            <button type="button" aria-label="Clear filters" onClick={() => { setQ(""); setSource("all"); }} style={{ background: "transparent", border: "none", color: "var(--fg-subtle)", cursor: "pointer", display: "flex", padding: 0 }}>
              <I.X size={15} />
            </button>
          )}
        </div>
        <div className="row" style={{ gap: 3, height: 38, boxSizing: "border-box", background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 10, padding: "0 4px" }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setSource(f.key)}
              aria-pressed={source === f.key}
              className="btn"
              style={{ height: 30, padding: "0 12px", background: source === f.key ? "var(--bg-2)" : "transparent", border: "none", color: source === f.key ? "var(--fg)" : "var(--fg-subtle)", fontSize: 13 }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="row" style={{ height: 38, boxSizing: "border-box", gap: 8, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 10, padding: "0 12px" }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--fg-subtle)", letterSpacing: "0.04em" }}>SORT</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort files" style={{ background: "transparent", border: "none", color: "var(--fg)", fontSize: 13, cursor: "pointer", outline: "none" }}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name (A–Z)</option>
            <option value="size">Size</option>
          </select>
        </label>
      </div>

      {/* Count line */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, letterSpacing: "-0.01em", margin: 0 }} role="status" aria-live="polite">
          {searching ? `${view.length} of ${rows.length} shown` : `${total} file${total === 1 ? "" : "s"}`}
        </h2>
        {!searching && total > rows.length && (
          <span className="subtle" style={{ fontSize: 12 }}>showing the {rows.length} most recent — search to find older</span>
        )}
      </div>

      {view.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: "center", borderStyle: "dashed" }}>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            {searching ? "No files match your filters." : "Files you register above will show up here."}
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {view.map((f, i) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
              <span style={{ color: "var(--fg-subtle)" }}><I.File size={16} /></span>
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                <div style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={f.name}>{f.name}</div>
                <div className="subtle" style={{ fontSize: 12 }}>{humanSize(f.sizeBytes)} · {new Date(f.createdAt).toLocaleString()}</div>
              </div>
              <SourceChip source={f.source} toolId={f.toolId} />
              {f.source === "tool" && f.toolId && AI_PREVIEWABLE_TOOL_IDS.has(f.toolId) ? (
                <Link href={`/app/files/${f.id}/preview`} aria-label="View" title="View" className="btn btn-ghost btn-sm" style={{ padding: 6, color: "var(--fg-muted)" }}>
                  <I.Eye size={14} />
                </Link>
              ) : null}
              {f.mime === "application/pdf" ? <OpenInChatButton fileId={f.id} fileName={f.name} /> : null}
              <DeleteFileButton id={f.id} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SourceChip({ source, toolId }: { source: FileRow["source"]; toolId: string | null }) {
  if (source === "tool" && toolId) {
    const tool = toolById(toolId);
    const label = tool ? tool.name : toolId;
    return (
      <span className="chip" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent)" }} title={`Produced by the ${label} tool`}>
        {label}
      </span>
    );
  }
  return (
    <span className="chip" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", background: "var(--bg-2)", color: "var(--fg-subtle)", borderColor: "var(--border)" }}>
      Upload
    </span>
  );
}
