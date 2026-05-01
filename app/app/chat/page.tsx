// /app/chat — the session list.
//
// Lists all non-archived chat sessions newest-first, with a primary
// "New chat" button that creates a session and redirects. Archived
// sessions surface behind a query-param toggle (?archived=1) so users
// can find them without clogging the main view.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull, isNotNull } from "drizzle-orm";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { I } from "@/components/icons/Icons";
import { NewChatButton } from "@/components/app/chat/NewChatButton";
import { ChatRowActions } from "@/components/app/chat/ChatRowActions";

export const metadata: Metadata = {
  title: "Chat",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ChatListPage({
  searchParams,
}: {
  searchParams?: { archived?: string };
}) {
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) redirect("/login?callbackUrl=%2Fapp%2Fchat");

  const showArchived = searchParams?.archived === "1";

  const rows = await db
    .select({
      id: schema.chatSessions.id,
      title: schema.chatSessions.title,
      fileId: schema.chatSessions.fileId,
      providerId: schema.chatSessions.providerId,
      model: schema.chatSessions.model,
      archivedAt: schema.chatSessions.archivedAt,
      createdAt: schema.chatSessions.createdAt,
      updatedAt: schema.chatSessions.updatedAt,
    })
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.userId, userId),
        showArchived
          ? isNotNull(schema.chatSessions.archivedAt)
          : isNull(schema.chatSessions.archivedAt)
      )
    )
    .orderBy(desc(schema.chatSessions.updatedAt))
    .limit(200);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>CHAT</div>
          <h1 style={{ fontSize: 28, letterSpacing: "-0.02em" }}>
            {showArchived ? "Archived chats" : "Your chats"}
          </h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
            {showArchived
              ? "Archived sessions. Unarchive to bring them back."
              : "Conversations with the AI assistant. Attach a PDF in any turn to ground answers in your document."}
          </p>
        </div>
        <NewChatButton />
      </header>

      <section>
        {rows.length === 0 ? (
          <div
            className="card"
            style={{
              padding: 32,
              textAlign: "center",
              borderStyle: "dashed",
            }}
          >
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>
              {showArchived
                ? "No archived chats."
                : "No chats yet. Click New chat to start one."}
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {rows.map((r, i) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <span style={{ color: "var(--fg-subtle)" }}>
                  <I.Chat size={16} />
                </span>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <Link
                    href={`/app/chat/${r.id}`}
                    style={{
                      fontSize: 14,
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: "var(--fg)",
                      textDecoration: "none",
                    }}
                    title={r.title}
                  >
                    {r.title || "Untitled chat"}
                  </Link>
                  <div className="subtle" style={{ fontSize: 12 }}>
                    {new Date(r.updatedAt).toLocaleString()}
                    {r.providerId ? ` · ${providerLabel(r.providerId)}` : ""}
                    {r.fileId ? " · attached document" : ""}
                  </div>
                </div>
                <ChatRowActions
                  id={r.id}
                  title={r.title}
                  archived={Boolean(r.archivedAt)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <footer>
        <Link
          href={showArchived ? "/app/chat" : "/app/chat?archived=1"}
          className="btn btn-ghost btn-sm"
          style={{ color: "var(--fg-subtle)" }}
        >
          {showArchived ? "← Back to active chats" : "View archived chats →"}
        </Link>
      </footer>
    </div>
  );
}

function providerLabel(id: string): string {
  if (id === "anthropic") return "Anthropic";
  if (id === "openai") return "OpenAI";
  return id;
}
