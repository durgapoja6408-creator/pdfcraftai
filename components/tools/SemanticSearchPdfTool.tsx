"use client";

// SemanticSearchPdfTool — Tier 2 §2.1 P1.
//
// User drops a PDF, types a natural-language query, and gets back
// 3–8 verbatim passages from the document that match the query —
// each with page and a one-line relevance note. The backend is the
// same /api/ai/summarize route with depth=semantic-search and a
// `query` form field (Task #60 backend addition).
//
// Distinct from Chat with PDF: Chat is conversational (multi-turn,
// stateful context); Semantic Search is single-shot ("what does
// this doc say about X?") and returns the raw passages for
// copy-out, cite-back, or downstream use. Catalog prices Semantic
// Search at 2 credits per search vs Chat at 5 credits per 20
// questions.

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { classifyAiError } from "@/lib/ai/degradation";
import { useSession, getSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { useToolTracking } from "./useToolTracking";
import { mapPdfOpError } from "@/lib/pdf/error-messages";
import { fetchAiWithRetry } from "@/lib/client/fetch-ai-with-retry";

type Passage = {
  passage: string;
  page: number;
  relevance: string;
};

function extractJsonArray(markdown: string): unknown[] | null {
  const fence = markdown.match(/```json\s*([\s\S]*?)\s*```/);
  const raw = fence ? fence[1] : null;
  let text = raw;
  if (!text) {
    const first = markdown.indexOf("[");
    const last = markdown.lastIndexOf("]");
    if (first !== -1 && last > first) text = markdown.slice(first, last + 1);
  }
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function asPassages(arr: unknown[]): Passage[] {
  const out: Passage[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.passage !== "string") continue;
    out.push({
      passage: r.passage,
      page: typeof r.page === "number" ? r.page : 0,
      relevance: typeof r.relevance === "string" ? r.relevance : "",
    });
  }
  return out;
}

export function SemanticSearchPdfTool() {
  const trackTool = useToolTracking("ai-semantic-search", "AI");
  useEffect(() => trackTool.view(), [trackTool]);
  const router = useRouter();
  const { status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passages, setPassages] = useState<Passage[] | null>(null);
  const [meta, setMeta] = useState<{ creditCost: number; newBalance?: number } | null>(
    null
  );

  const onFiles = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setPassages(null);
    setMeta(null);
    setFile(f);
    trackTool.upload(f);
  }, [trackTool]);

  const reset = () => {
    setFile(null);
    setQuery("");
    setError(null);
    setPassages(null);
    setMeta(null);
  };

  const run = async () => {
    if (!file) {
      setError("Drop a PDF first.");
      return;
    }
    if (!query.trim()) {
      setError("Enter a search query.");
      return;
    }
    const fresh = await getSession();
    if (!fresh?.user) {
      trackTool.signupRedirect("/tool/ai-semantic-search");

      router.push("/login?callbackUrl=/tool/ai-semantic-search");
      return;
    }
    setBusy(true);
    setError(null);
    setPassages(null);
    setMeta(null);

    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ik-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

    try {
      const res = await fetchAiWithRetry("/api/ai/summarize", {
        // M20 (#193): retry on transient 5xx / network failures.
        // FormData is single-use; rebuild it on each attempt.
        bodyFactory: () => {
          const form = new FormData();
          form.append("pdf", file);
          form.append("depth", "semantic-search");
          form.append("query", query.trim().slice(0, 500));
          form.append("idempotencyKey", idempotencyKey);
          return form;
        },
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const processingMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);

      if (res.ok || res.status === 207) {
        const markdown = String(body.markdown ?? "");
        const parsed = extractJsonArray(markdown);
        if (!parsed) {
          trackTool.error({ errorCode: "parse_failed", depth: "semantic-search" });
          setError("Couldn't parse the AI's response. Usually resolves on retry.");
          return;
        }
        const list = asPassages(parsed);
        setPassages(list);
        setMeta({
          creditCost: Number(body.creditCost ?? 0),
          newBalance: typeof body.newBalance === "number" ? body.newBalance : undefined,
        });
        trackTool.success({ creditCost: Number(body.creditCost ?? 0), depth: "semantic-search", processingMs });
        return;
      }
      const classified = classifyAiError(res.status, body);
      setError(
        "userMessage" in classified
          ? classified.userMessage
          : "Something went wrong. Try again in a moment."
      );
      trackTool.error({ errorCode: `http_${res.status}`, depth: "semantic-search" });
    } catch (err) {
      console.error(err);
      setError(mapPdfOpError(err instanceof Error ? err.message : "Request failed."));
      trackTool.error({ errorCode: "network_error", depth: "semantic-search" });
    } finally {
      setBusy(false);
    }
  };

  const signedOut = status !== "loading" && status !== "authenticated";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone
          onFiles={onFiles}
          disabled={busy}
          prompt="Drop a PDF to search semantically"
        />
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

      <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <label htmlFor="semantic-query" style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)" }}>
          SEARCH QUERY
        </label>
        <input
          id="semantic-query"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && file && query.trim() && !busy) run();
          }}
          placeholder="e.g. 'what does this paper say about side effects?'"
          disabled={busy}
          maxLength={500}
          style={{
            padding: "10px 12px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border-strong)",
            background: "var(--bg-1)",
            color: "var(--fg)",
            fontSize: 14,
          }}
        />
        <div className="subtle" style={{ fontSize: 11 }}>
          Natural language — not keywords. 2 credits per search. Results are
          verbatim passages with page refs + one-line relevance notes.
        </div>
      </div>

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {passages && (
        <div
          className="card"
          style={{
            padding: 20,
            borderColor: "var(--accent)",
            background: "var(--accent-soft)",
          }}
        >
          <div className="row" style={{ gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent)", color: "var(--bg-1)", display: "grid", placeItems: "center" }}>
              <I.Search size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>
                {passages.length === 0 ? "No relevant passages found" : `${passages.length} passages matched`}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {meta?.creditCost} credits used
                {typeof meta?.newBalance === "number" && ` · ${meta.newBalance} left`}
              </div>
            </div>
          </div>
          {passages.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--fg-subtle)" }}>
              The document doesn't appear to address your query. Try rephrasing,
              broadening the search, or checking if the PDF is actually relevant.
            </div>
          ) : (
            <ol style={{ display: "flex", flexDirection: "column", gap: 12, padding: 0, margin: 0, listStyle: "none" }}>
              {passages.map((p, i) => (
                <li
                  key={i}
                  style={{
                    padding: 14,
                    background: "var(--bg-1)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                  }}
                >
                  <blockquote
                    style={{
                      margin: 0,
                      padding: "4px 10px",
                      borderLeft: "3px solid var(--accent)",
                      fontStyle: "italic",
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: "var(--fg)",
                    }}
                  >
                    "{p.passage}"
                  </blockquote>
                  <div
                    className="subtle"
                    style={{ marginTop: 8, fontSize: 12, display: "flex", gap: 10, flexWrap: "wrap" }}
                  >
                    <span>
                      <strong>Page:</strong> {p.page}
                    </span>
                    {p.relevance && (
                      <span>
                        <strong>Why it matches:</strong> {p.relevance}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
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
          <Link href="/login?callbackUrl=/tool/ai-semantic-search" className="btn btn-primary">
            Sign in to search
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!file || !query.trim() || busy}
            onClick={run}
          >
            {busy ? "Searching…" : "Search"}
          </button>
        )}
      </div>
    </div>
  );
}
