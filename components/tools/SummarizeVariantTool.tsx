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
  | "financials"
  | "sentiment"
  | "bias"
  | "proofread"
  | "newsletter"
  | "video-script"
  | "ats-resume"
  | "action-items"
  | "gst-invoice"
  | "rental"
  | "syllabus"
  | "property"
  | "discharge"
  | "itr-form16"
  // Task #67 Tier 3 P0 wedges.
  | "cover-letter"
  | "jd-match"
  | "tnpsc"
  | "jee-neet"
  | "multi-bank";

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

  const onFiles = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError(null);
    setResult(null);
    setFile(f);
  }, []);

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
      if (props.queryField && query.trim()) {
        const cap = props.queryField.maxLength ?? 2000;
        form.append("query", query.trim().slice(0, cap));
      }
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
      pricingBlurb="ATS score + critical fixes + keyword gaps + format issues + suggested summary. 10 credits per resume. Tier 3 §3.6 HR & Recruitment."
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

export function GstInvoiceTool() {
  return (
    <SummarizeVariantTool
      depth="gst-invoice"
      toolId="ai-gst-invoice"
      callbackUrl="/tool/ai-gst-invoice"
      prompt="Drop a GST invoice PDF to extract GSTR-2-ready fields"
      runLabel="Extract invoice"
      busyLabel="Extracting…"
      successTitle="GST invoice extracted"
      pricingBlurb="Tier 3 §3.1 Finance: Invoice header / Supplier / Buyer / Line items / Totals — formatted for GSTR-2 filing. 25 credits per invoice."
      relatedHref={{ href: "/tool/ai-bank-statement", label: "Bank Statement Parser" }}
    />
  );
}

export function RentalAgreementTool() {
  return (
    <SummarizeVariantTool
      depth="rental"
      toolId="ai-rental"
      callbackUrl="/tool/ai-rental"
      prompt="Drop a rental agreement PDF to flag risks and missing clauses"
      runLabel="Analyse agreement"
      busyLabel="Analysing…"
      successTitle="Rental analysis ready"
      pricingBlurb="Tier 3 §3.2 Legal: Critical issues + missing standard clauses + negotiation points + state-specific notes (Karnataka / Maharashtra / Delhi / Tamil Nadu). 15 credits. Not legal advice."
      relatedHref={{ href: "/tool/ai-summarize", label: "AI Summarize (general docs)" }}
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
      pricingBlurb="Tier 3 §3.3 Education: Topic map + 12-week schedule with practice checkpoints + final-revision strategy. Tuned for TNPSC / UPSC / JEE / NEET / NCERT / university syllabi. 20 credits."
      relatedHref={{ href: "/tool/ai-study-notes", label: "PDF to Study Notes (per-doc deep notes)" }}
    />
  );
}

export function PropertyDocTool() {
  return (
    <SummarizeVariantTool
      depth="property"
      toolId="ai-property"
      callbackUrl="/tool/ai-property"
      prompt="Drop a property document (sale deed / khata / EC) to check for red flags"
      runLabel="Check property doc"
      busyLabel="Analysing…"
      successTitle="Property doc analysis ready"
      pricingBlurb="Tier 3 §3.5 Real Estate: Document type / property details / chain of title / encumbrances / red flags / missing standard documents. 30 credits. Not legal advice."
      relatedHref={{ href: "/tool/ai-rental", label: "Rental Agreement Analyzer" }}
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
      pricingBlurb="Tier 3 §3.4 Healthcare: Patient + family-friendly version with diagnoses / medications / follow-ups / warning signs in everyday language. 10 credits. Not medical advice."
      relatedHref={{ href: "/tool/ai-blood-test", label: "Blood Test Report Parser" }}
    />
  );
}

export function ItrAnalyzerTool() {
  return (
    <SummarizeVariantTool
      depth="itr-form16"
      toolId="ai-itr-form16"
      callbackUrl="/tool/ai-itr-form16"
      prompt="Drop a Form 16 / ITR / annual tax statement to analyse"
      runLabel="Analyse tax document"
      busyLabel="Analysing…"
      successTitle="Tax analysis ready"
      pricingBlurb="Tier 3 §3.1 Finance: Income summary + deductions claimed + tax computation + observations + suggested actions. 20 credits. Not tax advice — consult a CA."
      relatedHref={{ href: "/tool/ai-bank-statement", label: "Bank Statement Parser" }}
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
      pricingBlurb="Tier 3 §3.6 HR: 300–350 word tailored cover letter with 3-bullet customisation notes so you can swap in alternatives. 5 credits. Paste the JD for a tailored letter; leave blank for a generic-but-strong version."
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
      pricingBlurb="Tier 3 §3.6 HR: Fit score 0–100 + per-requirement alignment table + strengths + gaps + missing-keywords (ATS blockers) + concrete next steps. 5 credits per resume."
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

export function TnpscAnalyzerTool() {
  return (
    <SummarizeVariantTool
      depth="tnpsc"
      toolId="ai-tnpsc"
      callbackUrl="/tool/ai-tnpsc"
      prompt="Drop a TNPSC question paper or answer key"
      runLabel="Analyse TNPSC paper"
      busyLabel="Analysing…"
      successTitle="TNPSC analysis ready"
      pricingBlurb="Tier 3 §3.3 Education: Per-question breakdown with subject tag + correct answer + difficulty. Subject-wise distribution table. Topic frequency. Strategy notes specific to the TNPSC scheme. 15 credits."
      relatedHref={{ href: "/tool/ai-jee-neet", label: "JEE/NEET Previous-Year Analyzer" }}
    />
  );
}

export function JeeNeetAnalyzerTool() {
  return (
    <SummarizeVariantTool
      depth="jee-neet"
      toolId="ai-jee-neet"
      callbackUrl="/tool/ai-jee-neet"
      prompt="Drop a JEE Main / JEE Advanced / NEET-UG previous-year paper"
      runLabel="Analyse JEE/NEET paper"
      busyLabel="Analysing…"
      successTitle="JEE/NEET analysis ready"
      pricingBlurb="Tier 3 §3.3 Education: Per-question table + chapter-frequency tables per subject + high-yield topics + 12-week revision plan + score-maximisation strategy. 20 credits."
      relatedHref={{ href: "/tool/ai-syllabus", label: "Syllabus → Study Plan" }}
    />
  );
}

export function MultiBankMergerTool() {
  return (
    <SummarizeVariantTool
      depth="multi-bank"
      toolId="ai-multi-bank"
      callbackUrl="/tool/ai-multi-bank"
      prompt="Drop a multi-bank statement PDF (SBI / HDFC / ICICI / Axis / Kotak…)"
      runLabel="Merge statements"
      busyLabel="Parsing…"
      successTitle="Consolidated statement ready"
      pricingBlurb="Tier 3 §3.1 Finance: Parses statements from multiple Indian banks concatenated in one PDF. Outputs per-bank summaries + a consolidated transaction view with category breakdown. 20 credits."
      relatedHref={{ href: "/tool/ai-bank-statement", label: "Single Bank Statement Parser" }}
    />
  );
}
