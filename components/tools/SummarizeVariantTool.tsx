"use client";

// SummarizeVariantTool — shared UI for Tier 2 §2.1/§2.4
// presentation-style variants of the Summarize backend. Configured
// via props so Key Points / Study Notes / ELI5 each get a dedicated
// registered tool + SEO landing without duplicating the upload +
// idempotency + error-mapping flow three times.
//
// The backend contract: POST /api/ai/summarize with `depth` set to
// one of the six VALID_DEPTHS. The route already handles persistence,
// credits, idempotency, truncation, moderation — we don't touch it.

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { classifyAiError } from "@/lib/ai/degradation";
import { useSession, getSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { renderMarkdown } from "@/lib/markdown-mini";

type Depth =
  | "key-points"
  | "study-notes"
  | "eli5"
  | "faq"
  | "blog"
  | "readability"
  | "entities"
  | "social-thread"
  | "condense"
  | "expand"
  | "tone-analyze"
  | "citations"
  | "financials";

type Result = {
  fileId?: string;
  filename?: string;
  markdown: string;
  creditCost: number;
  newBalance?: number;
  pageCount?: number;
  wasTruncated?: boolean;
};

export function SummarizeVariantTool(props: {
  depth: Depth;
  toolId: string;
  callbackUrl: string;
  prompt: string;
  runLabel: string;
  busyLabel: string;
  successTitle: string;
  pricingBlurb: string;
  relatedHref?: { href: string; label: string };
}) {
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
      setError("Attach a PDF first.");
      return;
    }
    const fresh = await getSession();
    if (!fresh?.user) {
      router.push(`/login?callbackUrl=${encodeURIComponent(props.callbackUrl)}`);
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
      form.append("depth", props.depth);
      form.append("idempotencyKey", idempotencyKey);
      const res = await fetch("/api/ai/summarize", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (res.ok) {
        setResult({
          fileId: typeof body.fileId === "string" ? body.fileId : undefined,
          filename: typeof body.filename === "string" ? body.filename : undefined,
          markdown: String(body.markdown ?? ""),
          creditCost: Number(body.creditCost ?? 0),
          newBalance: typeof body.newBalance === "number" ? body.newBalance : undefined,
          pageCount: typeof body.pageCount === "number" ? body.pageCount : undefined,
          wasTruncated: Boolean(body.wasTruncated),
        });
        return;
      }
      if (res.status === 207) {
        setResult({
          markdown: String(body.markdown ?? ""),
          creditCost: Number(body.creditCost ?? 0),
          wasTruncated: Boolean(body.wasTruncated),
        });
        return;
      }
      const classified = classifyAiError(res.status, body);
      setError(
        "userMessage" in classified
          ? classified.userMessage
          : "Something went wrong. Try again in a moment."
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  const signedOut = status !== "loading" && status !== "authenticated";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!file ? (
        <ToolDropzone onFiles={onFiles} disabled={busy} prompt={props.prompt} />
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

      <div
        className="card"
        style={{ padding: 14, fontSize: 13, lineHeight: 1.5, background: "var(--bg-2)" }}
      >
        {props.pricingBlurb}
        {props.relatedHref && (
          <>
            {" "}
            Also consider{" "}
            <Link href={props.relatedHref.href} style={{ color: "var(--accent)" }}>
              {props.relatedHref.label}
            </Link>
            .
          </>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}

      {result && (
        <div
          className="card"
          style={{
            padding: 20,
            borderColor: "var(--accent)",
            background: "var(--accent-soft)",
          }}
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
              <div style={{ fontWeight: 500, fontSize: 15 }}>{props.successTitle}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {result.creditCost} credit{result.creditCost === 1 ? "" : "s"} used
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
              ⚠ Output truncated — the source PDF exceeded the model's context
              window.
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
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(props.callbackUrl)}`}
            className="btn btn-primary"
          >
            Sign in to run
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!file || busy}
            onClick={run}
          >
            {busy ? props.busyLabel : props.runLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// Three concrete exports that pin the props for each registered tool.

export function KeyPointsPdfTool() {
  return (
    <SummarizeVariantTool
      depth="key-points"
      toolId="ai-key-points"
      callbackUrl="/tool/ai-key-points"
      prompt="Drop a PDF to extract its key points"
      runLabel="Extract key points"
      busyLabel="Extracting…"
      successTitle="Key points ready"
      pricingBlurb="Bulleted list only — 6–12 key points with page citations. 3 credits per PDF."
      relatedHref={{ href: "/tool/ai-summarize", label: "AI · Summarize PDF (with prose sections)" }}
    />
  );
}

export function StudyNotesPdfTool() {
  return (
    <SummarizeVariantTool
      depth="study-notes"
      toolId="ai-study-notes"
      callbackUrl="/tool/ai-study-notes"
      prompt="Drop a PDF to turn it into study notes"
      runLabel="Generate study notes"
      busyLabel="Generating…"
      successTitle="Study notes ready"
      pricingBlurb="Revision-grade notes — overview, key concepts, detailed sections with takeaways, self-check questions. 8 credits per PDF."
      relatedHref={{ href: "/tool/ai-key-points", label: "Key Points (quick bullet list)" }}
    />
  );
}

export function Eli5PdfTool() {
  return (
    <SummarizeVariantTool
      depth="eli5"
      toolId="ai-eli5"
      callbackUrl="/tool/ai-eli5"
      prompt="Drop a PDF to explain it like you're 12"
      runLabel="Explain it simply"
      busyLabel="Simplifying…"
      successTitle="Plain-language explanation ready"
      pricingBlurb="Plain-language explanation — big idea, simple bullets, why it matters. 3 credits per PDF."
      relatedHref={{ href: "/tool/ai-summarize", label: "AI · Summarize (formal voice)" }}
    />
  );
}

export function FaqPdfTool() {
  return (
    <SummarizeVariantTool
      depth="faq"
      toolId="ai-faq"
      callbackUrl="/tool/ai-faq"
      prompt="Drop a PDF to generate a FAQ from it"
      runLabel="Generate FAQ"
      busyLabel="Generating…"
      successTitle="FAQ ready"
      pricingBlurb="6–10 Q&A pairs inferred from the document. Each answer grounded in the source with page citations. Gaps flagged under 'Not covered'. 5 credits per PDF."
      relatedHref={{ href: "/tool/ai-chat", label: "Chat with PDF (ask your own questions)" }}
    />
  );
}

export function BlogPostPdfTool() {
  return (
    <SummarizeVariantTool
      depth="blog"
      toolId="ai-blog"
      callbackUrl="/tool/ai-blog"
      prompt="Drop a PDF to reformat as a blog post"
      runLabel="Generate blog post"
      busyLabel="Writing…"
      successTitle="Blog post draft ready"
      pricingBlurb="Full blog-post structure — title, lede, 3–5 H2 sections, conclusion. Factual fidelity preserved. 10 credits per PDF."
      relatedHref={{ href: "/tool/ai-rewrite", label: "AI · Rewrite (tone + voice shifts)" }}
    />
  );
}

export function ReadabilityPdfTool() {
  return (
    <SummarizeVariantTool
      depth="readability"
      toolId="ai-readability"
      callbackUrl="/tool/ai-readability"
      prompt="Drop a PDF to score its readability"
      runLabel="Analyse readability"
      busyLabel="Analysing…"
      successTitle="Readability report ready"
      pricingBlurb="Flesch-Kincaid grade level + complex-sentence callouts + jargon flags + 3–5 concrete edit suggestions. 3 credits per PDF."
      relatedHref={{ href: "/tool/ai-rewrite", label: "AI · Rewrite (to actually apply the fixes)" }}
    />
  );
}

export function EntitiesPdfTool() {
  return (
    <SummarizeVariantTool
      depth="entities"
      toolId="ai-entities"
      callbackUrl="/tool/ai-entities"
      prompt="Drop a PDF to extract names, places, orgs, and dates"
      runLabel="Extract entities"
      busyLabel="Extracting…"
      successTitle="Entities extracted"
      pricingBlurb="Four tables — People / Organisations / Places / Dates — with page citations and one-line role notes. 3 credits per PDF."
      relatedHref={{ href: "/tool/extract-contacts", label: "Extract Contacts (free regex version)" }}
    />
  );
}

export function SocialThreadPdfTool() {
  return (
    <SummarizeVariantTool
      depth="social-thread"
      toolId="ai-social-thread"
      callbackUrl="/tool/ai-social-thread"
      prompt="Drop a PDF to turn it into a 5–10 post social thread"
      runLabel="Generate thread"
      busyLabel="Drafting…"
      successTitle="Social thread ready"
      pricingBlurb="Numbered 5–10 post thread — hook, idea-per-post, takeaway close. ~240 chars each. LinkedIn or X ready. 5 credits per PDF."
      relatedHref={{ href: "/tool/ai-blog", label: "PDF to Blog Post (long-form)" }}
    />
  );
}

export function CondensePdfTool() {
  return (
    <SummarizeVariantTool
      depth="condense"
      toolId="ai-condense"
      callbackUrl="/tool/ai-condense"
      prompt="Drop a PDF to rewrite it tighter"
      runLabel="Condense"
      busyLabel="Rewriting…"
      successTitle="Condensed version ready"
      pricingBlurb="Tighter rewrite preserving every fact. ~40–60% of original length. Not a summary — the document itself, shorter. 3 credits per PDF."
      relatedHref={{ href: "/tool/ai-tldr", label: "TL;DR (one-paragraph summary instead)" }}
    />
  );
}

export function ExpandPdfTool() {
  return (
    <SummarizeVariantTool
      depth="expand"
      toolId="ai-expand"
      callbackUrl="/tool/ai-expand"
      prompt="Drop a PDF to elaborate every point"
      runLabel="Expand"
      busyLabel="Elaborating…"
      successTitle="Expanded version ready"
      pricingBlurb="Each bullet becomes a full paragraph with context + examples from the source. No invented facts. ~140–180% of original length. 5 credits per PDF."
      relatedHref={{ href: "/tool/ai-rewrite", label: "AI · Rewrite (tone shifts + more)" }}
    />
  );
}

export function ToneAnalyzePdfTool() {
  return (
    <SummarizeVariantTool
      depth="tone-analyze"
      toolId="ai-tone-analyze"
      callbackUrl="/tool/ai-tone-analyze"
      prompt="Drop a PDF to analyse its voice and writing style"
      runLabel="Analyse tone"
      busyLabel="Analysing…"
      successTitle="Tone + style report ready"
      pricingBlurb="Voice + audience + 6–10 style attributes + observations on tells and shifts. Doesn't rewrite — analyses. 3 credits per PDF."
      relatedHref={{ href: "/tool/ai-readability", label: "Readability Score (grade-level focus)" }}
    />
  );
}

export function CitationsPdfTool() {
  return (
    <SummarizeVariantTool
      depth="citations"
      toolId="ai-citations"
      callbackUrl="/tool/ai-citations"
      prompt="Drop a research PDF to extract its references as BibTeX"
      runLabel="Extract citations"
      busyLabel="Extracting…"
      successTitle="Citations extracted"
      pricingBlurb="BibTeX block + human-readable reference list. Auto-generated citation keys. 5 credits per PDF."
      relatedHref={{ href: "/tool/ai-entities", label: "Extract Entities (people/orgs/places/dates)" }}
    />
  );
}

export function FinancialsPdfTool() {
  return (
    <SummarizeVariantTool
      depth="financials"
      toolId="ai-financials"
      callbackUrl="/tool/ai-financials"
      prompt="Drop a financial PDF to extract its key numbers"
      runLabel="Extract financials"
      busyLabel="Extracting…"
      successTitle="Financials extracted"
      pricingBlurb="Metric / Value / Unit / Period / Page table. Handles INR crore + USD million + ratios + percentages. 5 credits per PDF."
      relatedHref={{ href: "/tool/ai-table", label: "AI · Table Extract (any table → Excel)" }}
    />
  );
}
