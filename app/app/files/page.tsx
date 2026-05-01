import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { eq, desc } from "drizzle-orm";
import { FileDropzone } from "@/components/app/files/FileDropzone";
import { DeleteFileButton } from "@/components/app/files/DeleteFileButton";
import { OpenInChatButton } from "@/components/app/files/OpenInChatButton";
import { I } from "@/components/icons/Icons";
import { toolById } from "@/lib/tools";

// Tool ids whose outputs are stored in ai_outputs.content_md and have a
// dedicated preview page at /app/files/[id]/preview. Keep in sync with
// the AI op ids in lib/ai/{summarize,translate,compare}.ts and the
// /api/ai/* routes as new ones ship.
const AI_PREVIEWABLE_TOOL_IDS = new Set<string>([
  "ai-summarize",
  "ai-translate",
  "ai-compare",
  "ai-ocr",
]);

export const metadata: Metadata = {
  title: "Files",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function FilesPage() {
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) redirect("/login?callbackUrl=%2Fapp%2Ffiles");

  const rows = await db
    .select({
      id: schema.files.id,
      name: schema.files.name,
      mime: schema.files.mime,
      sizeBytes: schema.files.sizeBytes,
      sha256: schema.files.sha256,
      status: schema.files.status,
      source: schema.files.source,
      toolId: schema.files.toolId,
      createdAt: schema.files.createdAt,
    })
    .from(schema.files)
    .where(eq(schema.files.userId, userId))
    .orderBy(desc(schema.files.createdAt))
    .limit(100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>
      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>FILES</div>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em" }}>Your files</h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          Drop PDFs to register them, or run a browser-side tool — results you produce while signed in show up here.
        </p>
      </header>

      <FileDropzone />

      <section>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, letterSpacing: "-0.01em", margin: 0 }}>
            {rows.length > 0 ? `${rows.length} file${rows.length === 1 ? "" : "s"}` : "No files yet"}
          </h2>
        </div>

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
              Files you register above will show up here.
            </p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {rows.map((f, i) => (
              <div
                key={f.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <span style={{ color: "var(--fg-subtle)" }}>
                  <I.File size={16} />
                </span>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div
                    style={{
                      fontSize: 14,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={f.name}
                  >
                    {f.name}
                  </div>
                  <div className="subtle" style={{ fontSize: 12 }}>
                    {humanSize(Number(f.sizeBytes ?? 0))} · {new Date(f.createdAt).toLocaleString()}
                  </div>
                </div>
                <SourceChip source={f.source} toolId={f.toolId} />
                {f.source === "tool" &&
                f.toolId &&
                AI_PREVIEWABLE_TOOL_IDS.has(f.toolId) ? (
                  <Link
                    href={`/app/files/${f.id}/preview`}
                    aria-label="View"
                    title="View"
                    className="btn btn-ghost btn-sm"
                    style={{ padding: 6, color: "var(--fg-muted)" }}
                  >
                    <I.Eye size={14} />
                  </Link>
                ) : null}
                {f.mime === "application/pdf" ? (
                  <OpenInChatButton fileId={f.id} fileName={f.name} />
                ) : null}
                <DeleteFileButton id={f.id} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SourceChip({
  source,
  toolId,
}: {
  source: "upload" | "tool" | null | undefined;
  toolId: string | null | undefined;
}) {
  if (source === "tool" && toolId) {
    const tool = toolById(toolId);
    const label = tool ? tool.name : toolId;
    return (
      <span
        className="chip"
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          background: "var(--accent-soft)",
          color: "var(--accent)",
          borderColor: "var(--accent)",
        }}
        title={`Produced by the ${label} tool`}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className="chip"
      style={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        background: "var(--bg-2)",
        color: "var(--fg-subtle)",
        borderColor: "var(--border)",
      }}
    >
      Upload
    </span>
  );
}
