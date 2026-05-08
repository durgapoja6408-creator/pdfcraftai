// /app/files/[id]/preview — view saved AI output (Phase 5.1).
//
// Renders the markdown stored in `ai_outputs.content_md` for a given file.
// Used today for summarize results; translate (5.2), compare (5.3), and
// OCR (5.3+) render through the same page — the `kind` column determines
// the header and small UX differences (e.g. compare shows the A-vs-B
// page counts, OCR will show a confidence chip).
//
// Auth model: reads `files` joined to `ai_outputs` filtered by the
// authed user's id. An attacker who guesses another user's fileId hits
// a 404 because the join on user_id returns zero rows. Same pattern as
// /app/files itself.
//
// Why a dedicated page vs. just surfacing the markdown in the tool
// runner: the tool runner is ephemeral (closing the tab drops state),
// and summaries need a stable URL for sharing within the user's own
// session (e.g. "I'll link you to the summary I ran last week"). The
// preview page re-renders the exact saved markdown — no re-summarize,
// no extra credit spend.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { I } from "@/components/icons/Icons";
import { renderMarkdown } from "@/lib/markdown-mini";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false },
};

type AiOutputMeta = {
  sourceName?: string;
  sourcePageCount?: number;
  depth?: "tldr" | "standard" | "detailed";
  providerId?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  wasTruncated?: boolean;
  creditCost?: number;
  /** Translate-specific (Phase 5.2) */
  targetLang?: string;
  targetLangLabel?: string | null;
  wasChunked?: boolean;
  chunkCount?: number;
  /** Compare-specific (Phase 5.3) — both sides visible in the header. */
  originalName?: string;
  originalPageCount?: number;
  originalChars?: number;
  revisedName?: string;
  revisedPageCount?: number;
  revisedChars?: number;
  /**
   * OCR-specific (Phase 5.4). `sourcePageCount` is the original PDF's
   * page count; `processedPageCount` is how many pages actually ran
   * through vision. They diverge only when the PDF is over MAX_OCR_PAGES
   * and `wasTruncated` is true — in that case we show both numbers so
   * the user knows exactly where the transcription stopped.
   */
  processedPageCount?: number;
  /**
   * Phase 5.6 — five new AI tools each persist with their own kind +
   * meta extras. Fields below are nullable across kinds (e.g. `mode`
   * is rewrite-only); the JSX below gates each on its owning kind so
   * we never render a stale value from a different op.
   */
  /** Rewrite-specific (Phase 5.6). Free-form per-route mode label. */
  mode?: string;
  /** Redaction-specific (Phase 5.6). */
  findingCount?: number;
  unmatchedCount?: number;
  /** Table-specific (Phase 5.6). */
  tableCount?: number;
  /** Signing-specific (Phase 5.6). */
  filledCount?: number;
  unfilledCount?: number;
  /**
   * Generation-specific (Phase 5.6). `sourceName` is the literal string
   * "prompt" for this kind — meaning the artifact wasn't derived from a
   * PDF, it was generated from a user prompt — so the JSX special-cases
   * generation BEFORE the meta.sourceName branch to avoid the awkward
   * "From prompt" string.
   */
  title?: string | null;
  docType?: string;
  length?: string;
  tone?: string;
  promptChars?: number;
  pageCount?: number;
};

export default async function FilePreviewPage({ params }: Params) {
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent(`/app/files/${params.id}/preview`)}`);

  // One round trip — join files → ai_outputs on file_id. Filter by the
  // authed user's id so a guessed fileId for someone else's file just
  // returns zero rows (404).
  const rows = await db
    .select({
      fileId: schema.files.id,
      fileName: schema.files.name,
      fileCreatedAt: schema.files.createdAt,
      toolId: schema.files.toolId,
      kind: schema.aiOutputs.kind,
      contentMd: schema.aiOutputs.contentMd,
      meta: schema.aiOutputs.meta,
      outputCreatedAt: schema.aiOutputs.createdAt,
    })
    .from(schema.files)
    .innerJoin(schema.aiOutputs, eq(schema.aiOutputs.fileId, schema.files.id))
    .where(
      and(eq(schema.files.id, params.id), eq(schema.files.userId, userId))
    )
    .limit(1);

  const row = rows[0];
  if (!row) notFound();

  const meta = (row.meta ?? {}) as AiOutputMeta;
  const kind = row.kind;
  const html = renderMarkdown(row.contentMd);

  // Mirrors the `kind` enum in db/schema/app.ts. Adding a new kind
  // requires adding a label here OR the eyebrow renders `undefined`.
  // The CI guard scripts/test-preview-page-kind-parity.mjs asserts
  // every member of the schema enum has an entry in this map.
  //
  // Original 4-kind ternary chain (summary/translation/comparison/OCR)
  // was the silent bug: 5 kinds added in Phase 5.6 (rewrite/table/
  // redaction/generation/signing) all fell through to the trailing
  // ":" branch and rendered as "AI · OCR" — wrong label, looks broken
  // when /app/ai-history surfaces an artifact and clicks through here.
  const KIND_LABELS: Record<typeof row.kind, string> = {
    summary: "Summary",
    translation: "Translation",
    ocr: "OCR",
    comparison: "Comparison",
    rewrite: "Rewrite",
    table: "Table extract",
    redaction: "Redaction",
    generation: "Generation",
    signing: "Signed form",
  };
  const kindLabel = KIND_LABELS[kind];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 820 }}>
      <Link
        href="/app/files"
        className="row subtle"
        style={{ gap: 6, fontSize: 13 }}
      >
        <I.ArrowLeft size={14} />
        All files
      </Link>

      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          AI · {kindLabel.toUpperCase()}
        </div>
        <h1 style={{ fontSize: 24, letterSpacing: "-0.02em", margin: 0 }}>
          {row.fileName}
        </h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          {kind === "comparison" && (meta.originalName || meta.revisedName) ? (
            <>
              <span style={{ color: "var(--fg-muted)" }}>
                {meta.originalName ?? "Original"}
              </span>
              {" vs "}
              <span style={{ color: "var(--fg-muted)" }}>
                {meta.revisedName ?? "Revised"}
              </span>
              {typeof meta.originalPageCount === "number" &&
              typeof meta.revisedPageCount === "number"
                ? ` · ${meta.originalPageCount} / ${meta.revisedPageCount} pages`
                : ""}
              {meta.wasTruncated ? " · truncated" : ""}
            </>
          ) : kind === "generation" ? (
            // Generation is the only kind whose `meta.sourceName` is the
            // literal "prompt" — it wasn't derived from a PDF. Branch
            // before the sourceName check so we don't render the awkward
            // "From prompt" line.
            <>
              {meta.title ? (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>{meta.title}</span>
                  {" · "}
                </>
              ) : null}
              {meta.docType ? `${meta.docType}` : "Generated from prompt"}
              {meta.tone ? ` · ${meta.tone}` : ""}
              {typeof meta.pageCount === "number"
                ? ` · ${meta.pageCount} page${meta.pageCount === 1 ? "" : "s"}`
                : ""}
              {meta.wasTruncated ? " · truncated" : ""}
            </>
          ) : meta.sourceName ? (
            <>
              From <span style={{ color: "var(--fg-muted)" }}>{meta.sourceName}</span>
              {meta.sourcePageCount
                ? ` · ${meta.sourcePageCount} page${meta.sourcePageCount === 1 ? "" : "s"}`
                : ""}
              {meta.depth && kind === "summary" ? ` · ${humanDepth(meta.depth)}` : ""}
              {meta.targetLang && kind === "translation"
                ? ` · ${meta.targetLangLabel ? `${meta.targetLangLabel} (${meta.targetLang})` : meta.targetLang}`
                : ""}
              {meta.wasChunked && typeof meta.chunkCount === "number" && kind === "translation"
                ? ` · ${meta.chunkCount} chunks`
                : ""}
              {kind === "ocr" &&
              typeof meta.processedPageCount === "number" &&
              meta.wasTruncated
                ? ` · first ${meta.processedPageCount} transcribed`
                : ""}
              {/* Phase 5.6 kind-specific detail lines. Each gates on
                  its own kind so a meta field set by one op never
                  leaks into another op's header. */}
              {kind === "rewrite" && meta.mode ? ` · ${meta.mode}` : ""}
              {kind === "table" && typeof meta.tableCount === "number"
                ? ` · ${meta.tableCount} table${meta.tableCount === 1 ? "" : "s"}`
                : ""}
              {kind === "redaction" && typeof meta.findingCount === "number"
                ? ` · ${meta.findingCount} finding${meta.findingCount === 1 ? "" : "s"}`
                : ""}
              {kind === "redaction" &&
              typeof meta.unmatchedCount === "number" &&
              meta.unmatchedCount > 0
                ? ` · ${meta.unmatchedCount} unmatched`
                : ""}
              {kind === "signing" && typeof meta.filledCount === "number"
                ? ` · ${meta.filledCount} field${meta.filledCount === 1 ? "" : "s"} filled`
                : ""}
              {kind === "signing" &&
              typeof meta.unfilledCount === "number" &&
              meta.unfilledCount > 0
                ? ` · ${meta.unfilledCount} unfilled`
                : ""}
              {meta.wasTruncated && kind !== "ocr" ? " · truncated" : ""}
              {kind === "ocr" && meta.wasTruncated ? " · clipped at 50 pages" : ""}
            </>
          ) : (
            <>
              Generated {new Date(row.outputCreatedAt).toLocaleString()}
            </>
          )}
        </p>
      </header>

      {/* Rendered content */}
      <article
        className="card prose-mini"
        style={{
          padding: "24px 28px",
          fontSize: 15,
          lineHeight: 1.7,
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Provenance footer */}
      {(meta.providerId || meta.model || meta.creditCost) && (
        <footer
          className="subtle mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.04em",
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          {meta.providerId && <span>{meta.providerId.toUpperCase()}</span>}
          {meta.model && <span>{meta.model}</span>}
          {typeof meta.creditCost === "number" && (
            <span>
              {meta.creditCost} credit{meta.creditCost === 1 ? "" : "s"}
            </span>
          )}
          {typeof meta.tokensIn === "number" && typeof meta.tokensOut === "number" && (
            <span>
              {meta.tokensIn} in · {meta.tokensOut} out
            </span>
          )}
        </footer>
      )}
    </div>
  );
}

function humanDepth(depth: "tldr" | "standard" | "detailed"): string {
  switch (depth) {
    case "tldr":
      return "TL;DR";
    case "standard":
      return "Standard";
    case "detailed":
      return "Detailed";
  }
}
