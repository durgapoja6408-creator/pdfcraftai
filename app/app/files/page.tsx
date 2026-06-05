import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { eq, desc, sql } from "drizzle-orm";
import { FileDropzone } from "@/components/app/files/FileDropzone";
import { FilesList, type FileRow } from "@/components/app/files/FilesList";

export const metadata: Metadata = {
  title: "Files",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Load cap. Search/sort happen client-side over what we load (FilesList);
// the true total is shown so rows past the cap aren't silently hidden, with
// a "search to find older" hint. (A server-side paged fetch is a future
// follow-up if accounts routinely exceed this.)
const LOAD_LIMIT = 200;

export default async function FilesPage() {
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) redirect("/login?callbackUrl=%2Fapp%2Ffiles");

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: schema.files.id,
        name: schema.files.name,
        mime: schema.files.mime,
        sizeBytes: schema.files.sizeBytes,
        source: schema.files.source,
        toolId: schema.files.toolId,
        createdAt: schema.files.createdAt,
      })
      .from(schema.files)
      .where(eq(schema.files.userId, userId))
      .orderBy(desc(schema.files.createdAt))
      .limit(LOAD_LIMIT),
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(schema.files)
      .where(eq(schema.files.userId, userId)),
  ]);

  const total = Number(countRow?.n ?? rows.length);

  // Serialize to a plain, client-safe shape (Date -> ISO, bigint -> number).
  const fileRows: FileRow[] = rows.map((f) => ({
    id: f.id,
    name: f.name,
    mime: f.mime ?? null,
    sizeBytes: Number(f.sizeBytes ?? 0),
    source: (f.source as FileRow["source"]) ?? null,
    toolId: f.toolId ?? null,
    createdAt: new Date(f.createdAt).toISOString(),
  }));

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

      <FilesList rows={fileRows} total={total} />
    </div>
  );
}
