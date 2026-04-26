// TableExtractTool — Phase 5.6 client runner.
//
// User drops a PDF, we POST it to /api/ai/table, render the returned
// markdown + show a per-table card with Copy CSV / Download CSV buttons.
// Mirrors RewritePdfTool in shape but without a mode picker:
//
//   - Render-time auth gate (useSession). Anon visitors see a Sign-in CTA
//     instead of the Run button — the PDF is never uploaded before auth.
//     See SummarizePdfTool for the full rationale.
//   - Defense-in-depth getSession() probe inside run() for the rare
//     "session expired between render and click" case.
//   - Idempotency key per submit; matching server-side replay returns the
//     stored markdown + tables without re-charging.
//
// Result shape:
//   - markdown (GFM pipe tables) rendered below the per-table cards so
//     users can preview everything at once.
//   - tables[] carries {title, pageHint, csv} — each card offers Copy CSV
//     + Download .csv so power users don't have to parse the markdown.

"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, getSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { renderMarkdown } from "@/lib/markdown-mini";
import { classifyAiError } from "@/lib/ai/degradation";

type ExtractedTable = {
  title: string;
  pageHint: string;
  csv: string;
};

type TableResult = {
  fileId?: string;
  filename?: string;
  markdown: string;
  tables: ExtractedTable[];
  creditCost: number;
  newBalance?: number;
  pageCount?: number;
  providerId: string;
  model: string;
  wasTruncated: boolean;
  /** Non-empty on 207 — compute succeeded, persist failed. */
  persistWarning?: string;
};

// Pre-encoded Sign-in CTA target — see SummarizePdfTool for rationale.
const SIGN_IN_HREF =
  "/login?callbackUrl=" + encodeURIComponent("/tool/ai-table");

export function TableExtractTool() {
  const router = useRouter();
  // Anonymous-user gate — swap Run for Sign-in so the PDF isn't uploaded
  // before the server bounces a 401. See SummarizePdfTool for rationale.
  const { status: sessionStatus } = useSession();
  const isAnonymous = sessionStatus === "unauthenticated";

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TableResult | null>(null);

  const addFiles = useCallback((files: File[]) => {
    setError(null);
    setResult(null);
    setFile(files[0] ?? null);
  }, []);

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
  };

  const run = async () => {
    if (!file) {
      setError("Attach a PDF to extract tables from.");
      return;
    }

    // Defense-in-depth session probe — see SummarizePdfTool for detail.
    const fresh = await getSession();
    if (!fresh?.user) {
      router.push(SIGN_IN_HREF);
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);

    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ik-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      const form = new FormData();
      form.append("pdf", file);
      form.append("idempotencyKey", idempotencyKey);

      const res = await fetch("/api/ai/table", {
        method: "POST",
        body: form,
      });

      const body = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (res.ok) {
        setResult({
          fileId: typeof body.fileId === "string" ? body.fileId : undefined,
          filename:
            typeof body.filename === "string" ? body.filename : undefined,
          markdown: String(body.markdown ?? ""),
          tables: Array.isArray(body.tables)
            ? (body.tables as ExtractedTable[])
            : [],
          creditCost: Number(body.creditCost ?? 0),
          newBalance:
            typeof body.newBalance === "number" ? body.newBalance : undefined,
          pageCount:
            typeof body.pageCount === "number" ? body.pageCount : undefined,
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          wasTruncated: Boolean(body.wasTruncated),
        });
        return;
      }

      if (res.status === 207) {
        setResult({
          markdown: String(body.markdown ?? ""),
          tables: Array.isArray(body.tables)
            ? (body.tables as ExtractedTable[])
            : [],
          creditCost: Number(body.creditCost ?? 0),
          providerId: String(body.providerId ?? ""),
          model: String(body.model ?? ""),
          wasTruncated: Boolean(body.wasTruncated),
          persistWarning:
            typeof body.detail === "string"
              ? body.detail
              : "Tables extracted, but couldn't be saved to your files. Copy the CSVs below before leaving.",
        });
        return;
      }

      // Late-401 fallback — render-time gate + getSession() probe should
      // normally catch this earlier.
      if (res.status === 401) {
        router.push(SIGN_IN_HREF);
        return;
      }

      setError(mapErrorBody(res.status, body));
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Table extraction failed — check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={addFiles}
          prompt="Drop a PDF to extract tables"
          hint="Up to 25 MB · processed on our servers with credits."
        />
      ) : (
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
          }}
        >
          <span style={{ color: "var(--fg-subtle)" }}>
            <I.File size={16} />
          </span>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div
              title={file.name}
              style={{
                fontSize: 14,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {file.name}
            </div>
            <div className="subtle" style={{ fontSize: 12 }}>
              {humanSize(file.size)}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            aria-label="Remove"
            disabled={busy}
            onClick={() => setFile(null)}
            style={{ padding: 6, color: "var(--fg-subtle)" }}
          >
            <I.X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="card"
          style={{
            padding: 14,
            borderColor: "var(--red)",
            background: "var(--red-soft, rgba(220,38,38,0.08))",
            color: "var(--red)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      {result && <ResultCard result={result} />}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {file && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={reset}
          >
            Reset
          </button>
        )}
        {isAnonymous ? (
          <Link
            href={SIGN_IN_HREF}
            className="btn btn-primary"
            title="Sign in to use AI tools — credits are per-user."
          >
            Sign in to extract tables
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !file}
            onClick={run}
          >
            {/* Bundle G5: lib/tools.ts canonical "~3 credits per table" — table-billed,
                so formatActionCost() preserves the unit since table count varies per upload. */}
            {busy ? "Extracting…" : "Extract tables — ~3 credits / table"}
          </button>
        )}
      </div>
    </div>
  );
}

/** ------------------------------------------------------------------ */

function ResultCard({ result }: { result: TableResult }) {
  const noTables = result.tables.length === 0;

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        borderColor: result.persistWarning
          ? "var(--amber, #d97706)"
          : "var(--accent)",
      }}
    >
      {/* Header */}
      <div
        className="row"
        style={{
          gap: 12,
          alignItems: "center",
          padding: "14px 18px",
          background: result.persistWarning
            ? "var(--amber-soft, rgba(217,119,6,0.08))"
            : "var(--accent-soft)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: result.persistWarning
              ? "var(--amber, #d97706)"
              : "var(--accent)",
            color: "var(--bg-1)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {result.persistWarning ? (
            <I.Info size={16} />
          ) : (
            <I.Check size={16} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>
            {result.persistWarning
              ? `Tables extracted (not saved)`
              : noTables
                ? `No tables found`
                : `Found ${result.tables.length} table${result.tables.length === 1 ? "" : "s"}`}
          </div>
          <div className="subtle" style={{ fontSize: 12 }}>
            {result.pageCount
              ? `${result.pageCount} page${result.pageCount === 1 ? "" : "s"} · `
              : ""}
            {result.creditCost} credit
            {result.creditCost === 1 ? "" : "s"} spent
            {typeof result.newBalance === "number"
              ? ` · ${result.newBalance} left`
              : ""}
            {result.wasTruncated ? " · truncated (very long doc)" : ""}
          </div>
        </div>
        {result.fileId && (
          <Link
            href={`/app/files/${result.fileId}/preview`}
            className="btn btn-sm btn-ghost"
            title="View on Files"
          >
            <I.Eye size={14} />
            <span>View</span>
          </Link>
        )}
      </div>

      {result.persistWarning && (
        <div
          style={{
            padding: "10px 18px",
            fontSize: 13,
            color: "var(--fg-muted)",
            background: "var(--amber-soft, rgba(217,119,6,0.06))",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {result.persistWarning}
        </div>
      )}

      {/* Per-table cards with CSV copy/download */}
      {!noTables && (
        <div
          style={{
            padding: "16px 18px 4px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            borderBottom: "1px solid var(--border)",
          }}
        >
          {result.tables.map((t, idx) => (
            <TableCsvRow
              key={idx}
              idx={idx}
              table={t}
              sourceFilename={result.filename}
            />
          ))}
          <div style={{ height: 8 }} />
        </div>
      )}

      {/* Rendered markdown body — handles the "no tables" case too. */}
      <div
        className="prose-mini"
        style={{ padding: "20px 22px", fontSize: 14, lineHeight: 1.65 }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(result.markdown) }}
      />

      {/* Provenance footer */}
      <div
        className="subtle mono"
        style={{
          padding: "10px 18px",
          fontSize: 11,
          letterSpacing: "0.04em",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-2)",
        }}
      >
        {result.providerId.toUpperCase()} · {result.model}
      </div>
    </div>
  );
}

/** One per-table row: title + page hint + Copy CSV + Download CSV buttons. */
function TableCsvRow({
  idx,
  table,
  sourceFilename,
}: {
  idx: number;
  table: ExtractedTable;
  sourceFilename: string | undefined;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(table.csv);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — silent fall-through.
    }
  };

  const download = () => {
    const blob = new Blob([table.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = sourceFilename
      ? sourceFilename.replace(/\s*—\s*Tables\.md$/i, "").trim()
      : "tables";
    a.href = url;
    a.download = `${base} — Table ${idx + 1}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4_000);
  };

  return (
    <div
      className="row"
      style={{
        gap: 12,
        alignItems: "center",
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-2)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={table.title}
        >
          Table {idx + 1} — {table.title}
        </div>
        <div className="subtle" style={{ fontSize: 12 }}>
          {table.pageHint}
        </div>
      </div>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={copy}
        title="Copy CSV"
      >
        <I.Copy size={14} />
        <span>{copied ? "Copied" : "Copy CSV"}</span>
      </button>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={download}
        title="Download .csv"
      >
        <I.Download size={14} />
        <span>.csv</span>
      </button>
    </div>
  );
}

/** ------------------------------------------------------------------ */

function mapErrorBody(
  status: number,
  body: Record<string, unknown>
): string {
  const code = typeof body.error === "string" ? body.error : "";
  const detail = typeof body.detail === "string" ? body.detail : "";

  // Tool-specific 502 — takes precedence over the shared classifier
  // because `table_parse_failed` is a parse-layer issue, not an
  // upstream provider outage; copy is "retry" rather than "down".
  if (status === 502 && code === "table_parse_failed") {
    return (
      detail ||
      "The AI returned output we couldn't parse. We've refunded your credits — please retry."
    );
  }

  // Shared AI-degradation band (401 / 429 / 502 / 503). See
  // lib/ai/degradation.ts for the full rationale.
  const degraded = classifyAiError(status, body, {
    opLabel: "table extraction",
  });
  if (degraded.kind !== "unknown") return degraded.userMessage;

  switch (status) {
    case 402: {
      const required = typeof body.required === "number" ? body.required : 3;
      const balance = typeof body.balance === "number" ? body.balance : 0;
      return `Not enough credits — this extract costs ${required}, you have ${balance}. Top up on /app/billing.`;
    }
    case 409:
      return (
        detail ||
        "This request is already in flight or has been processed. Check /app/files for the result."
      );
    case 413:
      return "PDF is too large — the extractor accepts up to 25 MB.";
    case 422:
      if (code === "no_extractable_text") {
        return (
          detail ||
          "We couldn't find text in this PDF — it looks scanned. Run OCR first, then try again."
        );
      }
      return detail || "Couldn't process this PDF.";
    case 400:
      return detail || "That file doesn't look like a valid PDF.";
    default:
      return detail || `Table extraction failed (status ${status}).`;
  }
}
