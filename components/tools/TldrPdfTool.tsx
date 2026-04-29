"use client";

// TldrPdfTool — Tier 2 §2.1 P0.
//
// One-paragraph executive summary of any PDF. Thin UI wrapper over
// the existing /api/ai/summarize backend with `depth=tldr` locked —
// no backend changes needed, the Summarize route already supports
// this mode.
//
// Why a separate tool instead of "just use Summarize with TL;DR
// picker":
//   - SEO: dedicated landing for "tl;dr pdf", "pdf executive
//     summary", "one-sentence pdf summary" etc.
//   - UX: zero-decision — users wanting a TL;DR don't want a
//     depth picker, they want the answer.
//   - Credits: catalog prices TL;DR at 2 credits (lower than
//     Summarize's 3). The backend accepts the override; see
//     /api/ai/summarize for the ledger semantics.
//
// Mirrors SummarizePdfTool's auth/idempotency/error-mapping pattern,
// stripped of the macro bar and depth picker.

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { classifyAiError } from "@/lib/ai/degradation";
import { useSession, getSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { renderMarkdown } from "@/lib/markdown-mini";
import { mapPdfOpError } from "@/lib/pdf/error-messages";

const SIGN_IN_HREF = "/login?callbackUrl=/tool/ai-tldr";

type Result = {
  fileId?: string;
  filename?: string;
  markdown: string;
  creditCost: number;
  newBalance?: number;
  pageCount?: number;
  providerId?: string;
  wasTruncated?: boolean;
};

export function TldrPdfTool() {
  const router = useRouter();
  const { status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const onFiles = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setFile(f);
  }, []);

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
  };

  const run = async () => {
    if (!file) {
      setError("Drop a PDF first.");
      return;
    }

    // Fresh session probe — sessions can expire between page load
    // and click. If anon, redirect before any upload work.
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
      form.append("depth", "tldr");
      form.append("idempotencyKey", idempotencyKey);

      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (res.ok) {
        setResult({
          fileId: typeof body.fileId === "string" ? body.fileId : undefined,
          filename: typeof body.filename === "string" ? body.filename : undefined,
          markdown: String(body.markdown ?? ""),
          creditCost: Number(body.creditCost ?? 0),
          newBalance: typeof body.newBalance === "number" ? body.newBalance : undefined,
          pageCount: typeof body.pageCount === "number" ? body.pageCount : undefined,
          providerId: String(body.providerId ?? ""),
          wasTruncated: Boolean(body.wasTruncated),
        });
        return;
      }

      if (res.status === 207) {
        // Compute succeeded, persist failed — show markdown anyway.
        setResult({
          markdown: String(body.markdown ?? ""),
          creditCost: Number(body.creditCost ?? 0),
          wasTruncated: Boolean(body.wasTruncated),
        });
        return;
      }

      // Everything else → structured error.
      const classified = classifyAiError(res.status, body);
      setError(
        "userMessage" in classified
          ? classified.userMessage
          : "Something went wrong running TL;DR. Try again in a moment."
      );
    } catch (err) {
      console.error(err);
      setError(mapPdfOpError(err instanceof Error ? err.message : "TL;DR failed."));
    } finally {
      setBusy(false);
    }
  };

  const signedOut = status !== "loading" && status !== "authenticated";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone onFiles={onFiles} disabled={busy} prompt="Drop a PDF for a one-paragraph TL;DR" />
      ) : (
        <div
          className="card"
          style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}
        >
          <span style={{ color: "var(--fg-subtle)" }}>
            <I.File size={18} />
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
            <div className="subtle" style={{ fontSize: 12 }}>{humanSize(file.size)}</div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={busy}
            onClick={reset}
            aria-label="Remove file"
          >
            <I.X size={14} />
          </button>
        </div>
      )}

      <div className="card" style={{ padding: 14, fontSize: 13, lineHeight: 1.5, background: "var(--bg-2)" }}>
        <strong>What you'll get:</strong> a tight 2–4 sentence executive summary.
        Catalog price: <strong>2 credits</strong> per PDF. For richer output with
        section headings and bullet points, use{" "}
        <Link href="/tool/ai-summarize" style={{ color: "var(--accent)" }}>AI · Summarize PDF</Link>.
      </div>

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {result && (
        <div
          className="card"
          style={{ padding: 20, borderColor: "var(--accent)", background: "var(--accent-soft)" }}
        >
          <div className="row" style={{ gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--accent)",
                color: "var(--bg-1)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <I.Check size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>TL;DR ready</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {result.creditCost} credit{result.creditCost === 1 ? "" : "s"}{" "}
                used
                {typeof result.newBalance === "number" && ` · ${result.newBalance} left`}
                {result.fileId && (
                  <>
                    {" · "}
                    <Link href="/app/files" style={{ color: "var(--accent)" }}>
                      saved to your Files
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
          <div
            style={{
              padding: 16,
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: 14,
              lineHeight: 1.6,
            }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(result.markdown) }}
          />
          {result.wasTruncated && (
            <div className="subtle" style={{ fontSize: 11, marginTop: 8 }}>
              ⚠ Output was truncated — the source PDF exceeded the model's context
              window. Use AI · Summarize with depth=detailed for chunked handling.
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
        {file && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={reset}>
            Reset
          </button>
        )}
        {signedOut ? (
          <Link href={SIGN_IN_HREF} className="btn btn-primary">
            Sign in to run
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!file || busy}
            onClick={run}
          >
            {busy ? "Generating…" : "Generate TL;DR"}
          </button>
        )}
      </div>
    </div>
  );
}
