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

import { useState, useCallback, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { classifyAiError } from "@/lib/ai/degradation";
import { useSession, getSession } from "next-auth/react";
import { I } from "@/components/icons/Icons";
import { ToolDropzone } from "./ToolDropzone";
import { humanSize } from "@/lib/client/pdf-utils";
import { renderMarkdown } from "@/lib/markdown-mini";
import { track } from "@/lib/analytics";

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
  | "sentiment"
  | "bias"
  | "proofread"
  | "newsletter"
  | "video-script"
  | "ats-resume"
  | "action-items"
  | "syllabus"
  | "discharge"
  // Task #67 Tier 3 P0 wedges.
  | "cover-letter"
  | "jd-match"
  // Task #75 Tier 3 P1 wedges.
  | "nda"
  | "employment"
  // Task #77 Tier 3 P1 wedges.
  | "salary-slip"
  // Task #78 Tier 3 wedges.
  | "research-paper"
  | "insurance"
  | "loan-bundle"
  // Task #79 Tier 3 wedges.
  | "partnership-deed"
  // Task #80 Tier 3 wedges.
  // Task #81 Tier 2 + Tier 3 wedges.
  | "improve-writing"
  | "paraphrase"
  | "ai-detector"
  | "chart-to-table"
  // Sprint A REVERTED in Task #99 — 5 govt ID parsers removed.
  // Sprint B — 5 Indian financial wedges (Tier 3 §3.1).
  | "stamp-duty";

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
  pricingBlurb: ReactNode;
  relatedHref?: { href: string; label: string };
  /**
   * Task #67 — optional query field. When present, the tool renders
   * a textarea above the pricing blurb and sends its value as the
   * `query` form field on submit. Used by cover-letter (optional JD)
   * and jd-match (required JD).
   */
  queryField?: {
    label: string;
    placeholder: string;
    /** When true, Run button disables until the textarea has content. */
    required?: boolean;
    /** Default 2000 — matches the backend cap for JD-driven depths. */
    maxLength?: number;
    /** Helper caption shown under the textarea. */
    helperText?: string;
  };
}) {
  const router = useRouter();
  const { status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Task #87 — tool_view event on mount. Fires once per page load
  // for the GA4 conversion funnel.
  useEffect(() => {
    track({
      event: "tool_view",
      tool_id: props.toolId,
      tool_group: "AI",
      from: "tool_runner",
    });
  }, [props.toolId]);

  const onFiles = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setFile(f);
    // Task #87 — tool_upload event when user attaches a file.
    // Funnel step 2 of 3 (view → upload → run).
    track({
      event: "tool_upload",
      tool_id: props.toolId,
      file_size_kb: Math.round(f.size / 1024),
    });
  }, [props.toolId]);

  const reset = () => {
    setFile(null);
    setQuery("");
    setError(null);
    setResult(null);
  };

  const run = async () => {
    if (!file) {
      setError("Attach a PDF first.");
      return;
    }
    if (props.queryField?.required && !query.trim()) {
      setError(`${props.queryField.label} is required.`);
      return;
    }
    const fresh = await getSession();
    if (!fresh?.user) {
      // Task #87 — anonymous user hit the run button. This is the
      // single highest-intent moment for signup conversion: they've
      // uploaded a file AND clicked run, then bounced to login.
      track({
        event: "signup_redirect",
        tool_id: props.toolId,
        from_path: props.callbackUrl,
      });
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

    // Task #87 — capture wall-clock for processing_ms.
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

    try {
      const form = new FormData();
      form.append("pdf", file);
      form.append("depth", props.depth);
      form.append("idempotencyKey", idempotencyKey);
      if (props.queryField && query.trim()) {
        const cap = props.queryField.maxLength ?? 2000;
        form.append("query", query.trim().slice(0, cap));
      }
      const res = await fetch("/api/ai/summarize", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const tEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
      const processing_ms = Math.round(tEnd - t0);

      if (res.ok) {
        const credit = Number(body.creditCost ?? 0);
        const pageCount =
          typeof body.pageCount === "number" ? body.pageCount : undefined;
        setResult({
          fileId: typeof body.fileId === "string" ? body.fileId : undefined,
          filename: typeof body.filename === "string" ? body.filename : undefined,
          markdown: String(body.markdown ?? ""),
          creditCost: credit,
          newBalance: typeof body.newBalance === "number" ? body.newBalance : undefined,
          pageCount,
          wasTruncated: Boolean(body.wasTruncated),
        });
        // Task #87 — tool_run_success event. Funnel step 3 of 3.
        track({
          event: "tool_run_success",
          tool_id: props.toolId,
          depth: props.depth,
          credit_cost: credit,
          page_count: pageCount,
          processing_ms,
        });
        return;
      }
      if (res.status === 207) {
        const credit = Number(body.creditCost ?? 0);
        setResult({
          markdown: String(body.markdown ?? ""),
          creditCost: credit,
          wasTruncated: Boolean(body.wasTruncated),
        });
        // 207 = compute succeeded, persist failed. Still a successful
        // run from the user's perspective.
        track({
          event: "tool_run_success",
          tool_id: props.toolId,
          depth: props.depth,
          credit_cost: credit,
          processing_ms,
        });
        return;
      }
      const classified = classifyAiError(res.status, body);
      setError(
        "userMessage" in classified
          ? classified.userMessage
          : "Something went wrong. Try again in a moment."
      );
      // Task #87 — tool_run_error event for funnel drop-off analysis.
      track({
        event: "tool_run_error",
        tool_id: props.toolId,
        depth: props.depth,
        error_code: `http_${res.status}`,
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Request failed.");
      track({
        event: "tool_run_error",
        tool_id: props.toolId,
        depth: props.depth,
        error_code: "network_error",
      });
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

      {props.queryField && (
        <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <label
            htmlFor={`${props.toolId}-query`}
            style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-subtle)" }}
          >
            {props.queryField.label.toUpperCase()}
            {props.queryField.required ? " *" : " (OPTIONAL)"}
          </label>
          <textarea
            id={`${props.toolId}-query`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={props.queryField.placeholder}
            disabled={busy}
            maxLength={props.queryField.maxLength ?? 2000}
            rows={6}
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border-strong)",
              background: "var(--bg-1)",
              color: "var(--fg)",
              fontSize: 13,
              lineHeight: 1.5,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
          {props.queryField.helperText && (
            <div className="subtle" style={{ fontSize: 11 }}>{props.queryField.helperText}</div>
          )}
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
            disabled={
              !file ||
              busy ||
              (props.queryField?.required ? !query.trim() : false)
            }
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


export function SentimentPdfTool() {
  return (
    <SummarizeVariantTool
      depth="sentiment"
      toolId="ai-sentiment"
      callbackUrl="/tool/ai-sentiment"
      prompt="Drop a PDF to analyse its sentiment"
      runLabel="Analyse sentiment"
      busyLabel="Analysing…"
      successTitle="Sentiment analysis ready"
      pricingBlurb="Overall verdict + per-section table with evidence + notable shifts between sections. 3 credits per PDF."
      relatedHref={{ href: "/tool/ai-tone-analyze", label: "Tone & Style Analyzer (voice + register)" }}
    />
  );
}

export function BiasPdfTool() {
  return (
    <SummarizeVariantTool
      depth="bias"
      toolId="ai-bias"
      callbackUrl="/tool/ai-bias"
      prompt="Drop a PDF to audit for inclusive language"
      runLabel="Audit bias"
      busyLabel="Auditing…"
      successTitle="Bias audit ready"
      pricingBlurb="Gendered language + outdated terminology + stereotyping + accessibility-framing + concrete edit suggestions. 5 credits per PDF."
      relatedHref={{ href: "/tool/ai-proofread", label: "AI · Proofread (grammar + spelling)" }}
    />
  );
}

export function ProofreadPdfTool() {
  return (
    <SummarizeVariantTool
      depth="proofread"
      toolId="ai-proofread"
      callbackUrl="/tool/ai-proofread"
      prompt="Drop a PDF to proofread it"
      runLabel="Proofread"
      busyLabel="Checking…"
      successTitle="Proofreading report ready"
      pricingBlurb="Error table — Page / Error / Type / Suggested Fix. Genuine errors only (spelling, grammar, agreement, punctuation). 5 credits per PDF."
      relatedHref={{ href: "/tool/ai-rewrite", label: "AI · Rewrite (apply the fixes automatically)" }}
    />
  );
}

export function NewsletterPdfTool() {
  return (
    <SummarizeVariantTool
      depth="newsletter"
      toolId="ai-newsletter"
      callbackUrl="/tool/ai-newsletter"
      prompt="Drop a PDF to reformat as an email newsletter"
      runLabel="Draft newsletter"
      busyLabel="Drafting…"
      successTitle="Newsletter draft ready"
      pricingBlurb="Subject line + preheader + 3–5 sections + sign-off. Direct voice, no sales-speak. 8 credits per PDF."
      relatedHref={{ href: "/tool/ai-blog", label: "PDF to Blog Post (longer form)" }}
    />
  );
}

export function VideoScriptPdfTool() {
  return (
    <SummarizeVariantTool
      depth="video-script"
      toolId="ai-video-script"
      callbackUrl="/tool/ai-video-script"
      prompt="Drop a PDF to turn it into a talking-head video script"
      runLabel="Draft script"
      busyLabel="Writing…"
      successTitle="Video script ready"
      pricingBlurb="Opening hook + 3–5 × 90s segments + closing CTA. Bracketed stage cues. 10 credits per PDF."
      relatedHref={{ href: "/tool/ai-social-thread", label: "PDF to Social Thread (shorter-form distillation)" }}
    />
  );
}

export function AtsResumeTool() {
  return (
    <SummarizeVariantTool
      depth="ats-resume"
      toolId="ai-ats-resume"
      callbackUrl="/tool/ai-ats-resume"
      prompt="Drop your resume PDF to audit it for ATS compatibility"
      runLabel="Audit resume"
      busyLabel="Auditing…"
      successTitle="ATS audit ready"
      pricingBlurb="ATS score + critical fixes + keyword gaps + format issues + suggested summary. 10 credits per resume. "
      relatedHref={{ href: "/tool/ai-resume-parse", label: "Resume Parser (export to CSV)" }}
    />
  );
}

export function ActionItemsPdfTool() {
  return (
    <SummarizeVariantTool
      depth="action-items"
      toolId="ai-action-items"
      callbackUrl="/tool/ai-action-items"
      prompt="Drop a PDF (meeting notes, spec, brief) to extract its action items"
      runLabel="Extract action items"
      busyLabel="Extracting…"
      successTitle="Action items extracted"
      pricingBlurb="Markdown table of actionable TODOs — Task / Owner / Due / Priority / Page. Owners and deadlines blank when not in source. 3 credits per PDF."
      relatedHref={{ href: "/tool/extract-dates", label: "Extract Dates → Calendar (for deadlines)" }}
    />
  );
}



export function SyllabusStudyPlanTool() {
  return (
    <SummarizeVariantTool
      depth="syllabus"
      toolId="ai-syllabus"
      callbackUrl="/tool/ai-syllabus"
      prompt="Drop a syllabus PDF to generate a week-by-week study plan"
      runLabel="Build study plan"
      busyLabel="Planning…"
      successTitle="Study plan ready"
      pricingBlurb="Topic map + 12-week schedule with practice checkpoints + final-revision strategy. Tuned for TNPSC / UPSC / JEE / NEET / NCERT / university syllabi. 20 credits."
      relatedHref={{ href: "/tool/ai-study-notes", label: "PDF to Study Notes (per-doc deep notes)" }}
    />
  );
}


export function DischargeSummaryTool() {
  return (
    <SummarizeVariantTool
      depth="discharge"
      toolId="ai-discharge"
      callbackUrl="/tool/ai-discharge"
      prompt="Drop a hospital discharge summary to rewrite in plain language"
      runLabel="Simplify summary"
      busyLabel="Rewriting…"
      successTitle="Plain-language discharge summary ready"
      pricingBlurb="Patient + family-friendly version with diagnoses / medications / follow-ups / warning signs in everyday language. 10 credits. Not medical advice."
      relatedHref={{ href: "/tool/ai-blood-test", label: "Blood Test Report Parser" }}
    />
  );
}


// Task #67 — Tier 3 §3.6, §3.3, §3.1 P0 wedges.

export function CoverLetterTool() {
  return (
    <SummarizeVariantTool
      depth="cover-letter"
      toolId="ai-cover-letter"
      callbackUrl="/tool/ai-cover-letter"
      prompt="Drop your resume as a PDF — we'll tailor a cover letter"
      runLabel="Draft cover letter"
      busyLabel="Writing…"
      successTitle="Cover letter ready"
      pricingBlurb="300–350 word tailored cover letter with 3-bullet customisation notes so you can swap in alternatives. 5 credits. Paste the JD for a tailored letter; leave blank for a generic-but-strong version."
      queryField={{
        label: "Job description",
        placeholder:
          "Paste the JD here — role, responsibilities, required skills, company context. Leave blank for a generic strong letter.",
        required: false,
        maxLength: 2000,
        helperText:
          "Optional. Up to 2000 characters. The letter will highlight the resume lines that best map to the JD's requirements.",
      }}
      relatedHref={{ href: "/tool/ai-jd-match", label: "Resume → JD Matcher" }}
    />
  );
}

export function JdMatchTool() {
  return (
    <SummarizeVariantTool
      depth="jd-match"
      toolId="ai-jd-match"
      callbackUrl="/tool/ai-jd-match"
      prompt="Drop your resume — we'll score it against the JD"
      runLabel="Run fit analysis"
      busyLabel="Scoring…"
      successTitle="Fit analysis ready"
      pricingBlurb="Fit score 0–100 + per-requirement alignment table + strengths + gaps + missing-keywords (ATS blockers) + concrete next steps. 5 credits per resume."
      queryField={{
        label: "Job description",
        placeholder:
          "Paste the full JD — role, responsibilities, required skills, qualifications, nice-to-haves, company context.",
        required: true,
        maxLength: 2000,
        helperText:
          "Required. Up to 2000 characters. Paste the JD exactly as it appears on the job post — we map every listed requirement to your resume.",
      }}
      relatedHref={{ href: "/tool/ai-ats-resume", label: "ATS Resume Optimizer" }}
    />
  );
}




// Task #75 — five more Tier 3 P1 wedges.



export function NdaAnalyzerTool() {
  return (
    <SummarizeVariantTool
      depth="nda"
      toolId="ai-nda"
      callbackUrl="/tool/ai-nda"
      prompt="Drop an NDA / confidentiality agreement to audit"
      runLabel="Audit NDA"
      busyLabel="Analysing…"
      successTitle="NDA audit ready"
      pricingBlurb="Parties + type + risk flags (severity-rated) + negotiation points + missing standard clauses. Common red flags surfaced — embedded non-competes, indefinite terms, IP assignment in NDAs. 15 credits. Not legal advice."
      relatedHref={{ href: "/tool/ai-employment", label: "Employment Contract Review" }}
    />
  );
}


export function EmploymentContractTool() {
  return (
    <SummarizeVariantTool
      depth="employment"
      toolId="ai-employment"
      callbackUrl="/tool/ai-employment"
      prompt="Drop an employment / appointment contract to review"
      runLabel="Review contract"
      busyLabel="Analysing…"
      successTitle="Contract review ready"
      pricingBlurb="Compensation + term + termination + risk flags (non-compete, IP assignment, training bond) + missing protections + negotiation points. 20 credits. Not legal advice."
      relatedHref={{ href: "/tool/ai-nda", label: "NDA Analyzer" }}
    />
  );
}

// Task #77 — five more Tier 3 P1 wedges.




// EncumbranceCertTool removed in Task #99 (govt-related: Sub-Registrar EC).

export function SalarySlipTool() {
  return (
    <SummarizeVariantTool
      depth="salary-slip"
      toolId="ai-salary-slip"
      callbackUrl="/tool/ai-salary-slip"
      prompt="Drop an Indian salary slip / pay slip"
      runLabel="Parse slip"
      busyLabel="Parsing…"
      successTitle="Salary slip parsed"
      pricingBlurb="Structured JSON with employer / employee / period / earnings / deductions / totals / YTD. Preserves idiosyncratic component names (Special Allowance, LTA, etc.) for accurate YoY comparison. 10 credits."
      relatedHref={{ href: "/tool/ai-itr-form16", label: "ITR / Form 16 Analyzer" }}
    />
  );
}

// Task #78 — five more Tier 3 wedges.


export function ResearchPaperTool() {
  return (
    <SummarizeVariantTool
      depth="research-paper"
      toolId="ai-research-paper"
      callbackUrl="/tool/ai-research-paper"
      prompt="Drop an academic research paper"
      runLabel="Summarise paper"
      busyLabel="Summarising…"
      successTitle="Research paper summary ready"
      pricingBlurb="APA citation + BibTeX + research question + methods + key results (with magnitudes preserved) + limitations (acknowledged + implied) + cite-this examples + related reading. 15 credits."
      relatedHref={{ href: "/tool/ai-citations", label: "Extract Citations" }}
    />
  );
}


export function InsurancePolicyTool() {
  return (
    <SummarizeVariantTool
      depth="insurance"
      toolId="ai-insurance"
      callbackUrl="/tool/ai-insurance"
      prompt="Drop an Indian insurance policy (health / life / motor / home / travel / term)"
      runLabel="Analyse policy"
      busyLabel="Analysing…"
      successTitle="Insurance policy analysis ready"
      pricingBlurb="Coverage + premiums + exclusions + waiting periods + claim process + renewal/portability + risk flags (room-rent capping, sub-limits, missing day-care list, restoration absent). 20 credits. Not insurance advice."
      relatedHref={{ href: "/tool/ai-medical-bill", label: "Medical Bill Analyzer" }}
    />
  );
}

export function LoanBundleAuditTool() {
  return (
    <SummarizeVariantTool
      depth="loan-bundle"
      toolId="ai-loan-bundle"
      callbackUrl="/tool/ai-loan-bundle"
      prompt="Drop a stack of loan-application docs (concatenated PDF)"
      runLabel="Audit bundle"
      busyLabel="Auditing…"
      successTitle="Loan bundle audit ready"
      pricingBlurb="Detects loan type + audits docs against typical lender checklist (PAN, Aadhaar, salary slips, bank statements, ITR/Form 16, property docs, etc.) + flags missing items + income snapshot + eligibility-affecting issues. 15 credits. Not pre-approval."
      relatedHref={{ href: "/tool/ai-bank-statement", label: "Bank Statement Parser" }}
    />
  );
}

// Task #79 — five more Tier 3 wedges.



export function PartnershipDeedTool() {
  return (
    <SummarizeVariantTool
      depth="partnership-deed"
      toolId="ai-partnership-deed"
      callbackUrl="/tool/ai-partnership-deed"
      prompt="Drop a partnership / LLP deed"
      runLabel="Analyse deed"
      busyLabel="Analysing…"
      successTitle="Partnership deed analysis ready"
      pricingBlurb="Partners table + capital + profit/loss share + decision-making + admission/retirement rules + risk flags + missing standard clauses (arbitration, IP/goodwill, succession). 20 credits."
      relatedHref={{ href: "/tool/ai-employment", label: "Employment Contract Review" }}
    />
  );
}



// Task #80 — five more Tier 3 wedges.






// Task #81 — five more wedges.

export function ImproveWritingTool() {
  return (
    <SummarizeVariantTool
      depth="improve-writing"
      toolId="ai-improve-writing"
      callbackUrl="/tool/ai-improve-writing"
      prompt="Drop a document to improve clarity and concision"
      runLabel="Improve writing"
      busyLabel="Editing…"
      successTitle="Improved writing ready"
      pricingBlurb="Rewrites for clarity + concision (~20-30% shorter) without changing facts, register, or claims. Edit-summary surfaces the kinds of changes made (passive→active, redundant qualifiers cut, etc.). 5 credits."
      relatedHref={{ href: "/tool/ai-paraphrase", label: "Paraphrase" }}
    />
  );
}

export function ParaphraseTool() {
  return (
    <SummarizeVariantTool
      depth="paraphrase"
      toolId="ai-paraphrase"
      callbackUrl="/tool/ai-paraphrase"
      prompt="Drop a document to paraphrase"
      runLabel="Paraphrase"
      busyLabel="Rewording…"
      successTitle="Paraphrased version ready"
      pricingBlurb="Re-words preserving every claim + number + conclusion. Same length as input. Technical terms preserved when no plainer synonym would be accurate. NOT a substitute for citation. 5 credits."
      relatedHref={{ href: "/tool/ai-improve-writing", label: "Improve Writing" }}
    />
  );
}

export function AiDetectorTool() {
  return (
    <SummarizeVariantTool
      depth="ai-detector"
      toolId="ai-detector"
      callbackUrl="/tool/ai-detector"
      prompt="Drop a PDF to detect AI-generated text (ChatGPT / Claude / Gemini / etc.)"
      runLabel="Detect AI"
      busyLabel="Analysing…"
      successTitle="AI detection ready"
      pricingBlurb="Heuristic AI-content detector — surfaces well-documented LLM stylistic fingerprints (formulaic openers, hedging overuse, em-dash patterns, register-too-polished, three-item rhetoric, transitional clichés). 10 credits. Honest caveat: heuristic only, not a courtroom-grade classifier. False positives + negatives possible."
      relatedHref={{ href: "/tool/ai-improve-writing", label: "Improve Writing" }}
    />
  );
}

export function ChartToTableTool() {
  return (
    <SummarizeVariantTool
      depth="chart-to-table"
      toolId="ai-chart-to-table"
      callbackUrl="/tool/ai-chart-to-table"
      prompt="Drop a PDF with charts / graphs to extract as data tables"
      runLabel="Extract chart data"
      busyLabel="Reading charts…"
      successTitle="Chart data extracted"
      pricingBlurb="Reads charts visually (bar / line / pie / scatter / stacked), extracts data points faithfully with axis labels and units. For values it can't read precisely, returns a range with confidence note. 5 credits."
      relatedHref={{ href: "/tool/ai-table", label: "AI Table Extract" }}
    />
  );
}


// Sprint A REVERTED in Task #99 — 5 Indian govt ID wrapper
// components removed (AadhaarParserTool, PanCardParserTool,
// DrivingLicenseParserTool, VoterIdParserTool, PassportParserTool).

// Sprint B — 5 Indian financial wedges (Tier 3 §3.1).





