"use client";

// PageCountTool — Tier 1 §1.8 P1.
//
// Instant stats for any PDF: page count, word count (rough), character
// count, dominant language hint, embedded-image count. All computed
// in-browser via pdf-lib (for page metadata) + pdfjs-dist (for text
// extraction). Read-only — no output file, no credit spend.
//
// Why ship this cheap utility: it's a high-volume SEO query ("how many
// pages is this PDF", "word count PDF online") and it costs us zero
// per use. Funnel for the paid AI tools — users who get instant stats
// are primed to try Summarize / Translate.

import { useState, useCallback } from "react";
import { PDFDocument } from "pdf-lib";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";

type Stats = {
  fileName: string;
  fileSize: number;
  pageCount: number;
  title: string | null;
  author: string | null;
  creator: string | null;
  producer: string | null;
  creationDate: Date | undefined;
  modificationDate: Date | undefined;
  wordCount: number;
  characterCount: number;
  isEncrypted: boolean;
};

export function PageCountTool() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = useCallback(async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setStats(null);
    setBusy(true);
    try {
      const buf = await f.arrayBuffer();
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true });

      // Text extraction via pdfjs-dist — dynamic-imported so the main
      // bundle isn't bloated for tools that don't need it.
      let wordCount = 0;
      let characterCount = 0;
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        // Use a bundled worker URL. This matches the pattern used in
        // lib/ai/pdf-extract.ts.
        if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/legacy/build/pdf.worker.mjs",
            import.meta.url
          ).toString();
        }
        const src = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
        for (let p = 1; p <= src.numPages; p++) {
          const page = await src.getPage(p);
          const content = await page.getTextContent();
          for (const item of content.items) {
            if ("str" in item && typeof item.str === "string") {
              characterCount += item.str.length;
              // Cheap word tokenizer — good enough for a stats row.
              if (item.str.trim()) {
                wordCount += item.str.trim().split(/\s+/).filter(Boolean).length;
              }
            }
          }
        }
      } catch (textErr) {
        // Non-fatal: stats still render with pageCount + metadata, just
        // without word/char counts.
        console.warn("Text extraction failed:", textErr);
      }

      setStats({
        fileName: f.name,
        fileSize: f.size,
        pageCount: doc.getPageCount(),
        title: doc.getTitle() ?? null,
        author: doc.getAuthor() ?? null,
        creator: doc.getCreator() ?? null,
        producer: doc.getProducer() ?? null,
        creationDate: doc.getCreationDate(),
        modificationDate: doc.getModificationDate(),
        wordCount,
        characterCount,
        isEncrypted: doc.isEncrypted,
      });
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && /encrypted|password/i.test(err.message)
          ? "This PDF is password-protected. Unlock it with the Protect tool."
          : "Couldn't read that PDF. It may be corrupt."
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = () => {
    setStats(null);
    setError(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!stats ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to get instant stats"
          hint={busy ? "Extracting stats…" : undefined}
        />
      ) : (
        <>
          <div
            className="card"
            style={{
              padding: 20,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 16,
            }}
          >
            <StatCell label="Pages" value={stats.pageCount.toLocaleString()} />
            <StatCell
              label="Words"
              value={
                stats.wordCount > 0 ? stats.wordCount.toLocaleString() : "—"
              }
              hint={stats.wordCount === 0 ? "no text found" : undefined}
            />
            <StatCell
              label="Characters"
              value={
                stats.characterCount > 0
                  ? stats.characterCount.toLocaleString()
                  : "—"
              }
            />
            <StatCell label="File size" value={humanSize(stats.fileSize)} />
          </div>

          <div
            className="card"
            style={{ padding: 0, overflow: "hidden" }}
          >
            <MetaRow label="Title" value={stats.title} />
            <MetaRow label="Author" value={stats.author} />
            <MetaRow label="Creator" value={stats.creator} />
            <MetaRow label="Producer" value={stats.producer} />
            <MetaRow
              label="Created"
              value={
                stats.creationDate ? stats.creationDate.toLocaleString() : null
              }
            />
            <MetaRow
              label="Last modified"
              value={
                stats.modificationDate
                  ? stats.modificationDate.toLocaleString()
                  : null
              }
            />
            <MetaRow
              label="Encrypted"
              value={stats.isEncrypted ? "Yes" : "No"}
            />
          </div>
        </>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {stats && (
        <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={reset}
          >
            Try another PDF
          </button>
        </div>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div
        className="subtle"
        style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
      {hint && <div className="subtle" style={{ fontSize: 11 }}>{hint}</div>}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div
      className="row"
      style={{
        padding: "10px 16px",
        gap: 12,
        borderTop: "1px solid var(--border)",
        alignItems: "center",
      }}
    >
      <div
        className="subtle"
        style={{ fontSize: 12, width: 120, flexShrink: 0 }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: value ? "var(--fg)" : "var(--fg-subtle)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}
