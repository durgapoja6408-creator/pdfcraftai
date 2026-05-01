// /app/chat/[id] — single chat session page.
//
// Server component: loads the session + messages once, then hands off
// to the <ChatClient/> client component for live streaming. The list of
// historical messages is the source of truth for the render — the client
// appends to it as new turns come in.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { ChatClient } from "@/components/app/chat/ChatClient";

export const metadata: Metadata = {
  title: "Chat",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ChatSessionPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent(`/app/chat/${params.id}`)}`);

  const [row] = await db
    .select({
      id: schema.chatSessions.id,
      title: schema.chatSessions.title,
      fileId: schema.chatSessions.fileId,
      providerId: schema.chatSessions.providerId,
      model: schema.chatSessions.model,
    })
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.id, params.id),
        eq(schema.chatSessions.userId, userId)
      )
    )
    .limit(1);

  if (!row) notFound();

  const messages = await db
    .select({
      id: schema.chatMessages.id,
      role: schema.chatMessages.role,
      content: schema.chatMessages.content,
      stopReason: schema.chatMessages.stopReason,
      providerId: schema.chatMessages.providerId,
      model: schema.chatMessages.model,
      createdAt: schema.chatMessages.createdAt,
    })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.sessionId, params.id))
    .orderBy(asc(schema.chatMessages.createdAt))
    .limit(200);

  // Look up attached file (if any) for the header chip.
  let attached: { id: string; name: string } | null = null;
  if (row.fileId) {
    const [f] = await db
      .select({ id: schema.files.id, name: schema.files.name })
      .from(schema.files)
      .where(
        and(eq(schema.files.id, row.fileId), eq(schema.files.userId, userId))
      )
      .limit(1);
    if (f) attached = f;
  }

  // Serialize Date to ISO strings for the client — Date objects crossing
  // the server/client boundary cause hydration warnings in some React
  // builds.
  const initialMessages = messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    stopReason: m.stopReason,
    createdAtIso: m.createdAt.toISOString(),
  }));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 960,
        height: "calc(100vh - 140px)",
      }}
    >
      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>CHAT</div>
        <h1 style={{ fontSize: 22, letterSpacing: "-0.02em", margin: 0 }}>
          {row.title}
        </h1>
        <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>
          {row.providerId ? providerLabel(row.providerId) : "Provider chosen on first turn"}
          {row.model ? ` · ${row.model}` : ""}
          {attached ? (
            <>
              {" · attached: "}
              <Link href="/app/files" style={{ color: "var(--accent)" }}>
                {attached.name}
              </Link>
            </>
          ) : null}
        </div>
      </header>

      <ChatClient
        sessionId={row.id}
        initialMessages={initialMessages}
        attachedFileName={attached?.name ?? null}
      />

      <footer>
        <Link href="/app/chat" className="subtle" style={{ fontSize: 12 }}>
          ← All chats
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
