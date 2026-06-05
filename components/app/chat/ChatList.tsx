"use client";

// Client-side title search over the chat session list (2026-06-05). The list
// can hold up to 200 sessions — scroll-only before this. Search shows only
// when there are enough rows to warrant it. Empty-when-no-sessions stays on
// the page (server), this owns the populated list + search-empty.

import { useMemo, useState } from "react";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { ChatRowActions } from "@/components/app/chat/ChatRowActions";

export type ChatRow = {
  id: string;
  title: string | null;
  fileId: string | null;
  providerId: string | null;
  archived: boolean;
  updatedAt: string; // ISO
};

function providerLabel(id: string): string {
  if (id === "anthropic") return "Anthropic";
  if (id === "openai") return "OpenAI";
  return id;
}

export function ChatList({ rows }: { rows: ChatRow[] }) {
  const [q, setQ] = useState("");
  const view = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter((r) => (r.title || "Untitled chat").toLowerCase().includes(n));
  }, [rows, q]);

  return (
    <>
      {rows.length > 5 && (
        <div
          className="row"
          style={{ height: 38, background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 10, padding: "0 12px", gap: 8, marginBottom: 12 }}
        >
          <I.Search size={15} style={{ color: "var(--fg-subtle)", flexShrink: 0 }} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats by title…"
            aria-label="Search chats by title"
            style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", padding: 0, color: "var(--fg)", outline: "none", fontSize: 14 }}
          />
          {q.trim().length > 0 && (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")} style={{ background: "transparent", border: "none", color: "var(--fg-subtle)", cursor: "pointer", display: "flex", padding: 0 }}>
              <I.X size={15} />
            </button>
          )}
        </div>
      )}

      {view.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: "center", borderStyle: "dashed" }}>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>No chats match your search.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {view.map((r, i) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
              <span style={{ color: "var(--fg-subtle)" }}><I.Chat size={16} /></span>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <Link href={`/app/chat/${r.id}`} style={{ fontSize: 14, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--fg)", textDecoration: "none" }} title={r.title ?? "Untitled chat"}>
                  {r.title || "Untitled chat"}
                </Link>
                <div className="subtle" style={{ fontSize: 12 }}>
                  {new Date(r.updatedAt).toLocaleString()}
                  {r.providerId ? ` · ${providerLabel(r.providerId)}` : ""}
                  {r.fileId ? " · attached document" : ""}
                </div>
              </div>
              <ChatRowActions id={r.id} title={r.title ?? ""} archived={r.archived} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
