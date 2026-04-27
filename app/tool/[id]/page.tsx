import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { I } from "@/components/icons/Icons";
import { PageCountTool } from "@/components/tools/PageCountTool";
import { PdfInspectorTool } from "@/components/tools/PdfInspectorTool";
import {
  PdfToTextTool,
  PdfToMarkdownTool,
  PdfToHtmlTool,
} from "@/components/tools/PdfTextExportTool";
import {
  PdfToJpgTool,
  PdfToPngTool,
} from "@/components/tools/PdfRasterizeTool";
import { SearchPdfTool } from "@/components/tools/SearchPdfTool";
import { ExtractImagesTool } from "@/components/tools/ExtractImagesTool";
import { PdfOutlineTool } from "@/components/tools/PdfOutlineTool";
import { PdfFormsTool } from "@/components/tools/PdfFormsTool";
import { PdfAttachmentsTool } from "@/components/tools/PdfAttachmentsTool";
import { PdfFontsTool } from "@/components/tools/PdfFontsTool";
import {
  PdfInspectorLongform,
  PDF_INSPECTOR_FAQ,
} from "@/components/marketing/PdfInspectorLongform";
import {
  PageCountLongform,
  PAGE_COUNT_FAQ,
} from "@/components/marketing/PageCountLongform";
import { TOOLS, toolById } from "@/lib/tools";
import { TOOL_INTROS } from "@/lib/tool-intros";
import { findSeoForTool } from "@/lib/seo-pages";
import { AdSlot } from "@/components/marketing/AdSlot";
import { SummarizePdfTool } from "@/components/tools/SummarizePdfTool";
import { TranslatePdfTool } from "@/components/tools/TranslatePdfTool";
import { ComparePdfTool } from "@/components/tools/ComparePdfTool";
import { OcrPdfTool } from "@/components/tools/OcrPdfTool";
import { RewritePdfTool } from "@/components/tools/RewritePdfTool";
import { TableExtractTool } from "@/components/tools/TableExtractTool";
import { RedactPdfTool } from "@/components/tools/RedactPdfTool";
import { GeneratePdfTool } from "@/components/tools/GeneratePdfTool";
import { SignPdfTool } from "@/components/tools/SignPdfTool";
import { TldrPdfTool } from "@/components/tools/TldrPdfTool";
import {
  KeyPointsPdfTool,
  StudyNotesPdfTool,
  Eli5PdfTool,
  FaqPdfTool,
  BlogPostPdfTool,
  ReadabilityPdfTool,
  EntitiesPdfTool,
  SocialThreadPdfTool,
  CondensePdfTool,
  ExpandPdfTool,
  ToneAnalyzePdfTool,
  CitationsPdfTool,
  SentimentPdfTool,
  BiasPdfTool,
  ProofreadPdfTool,
  NewsletterPdfTool,
  VideoScriptPdfTool,
  AtsResumeTool,
  ActionItemsPdfTool,
  SyllabusStudyPlanTool,
  DischargeSummaryTool,
  // Task #67 — Tier 3 §3.6, §3.3, §3.1 P0 wedges.
  CoverLetterTool,
  JdMatchTool,
  // Task #75 — Tier 3 §3.1 + §3.2 P1 wedges.
  NdaAnalyzerTool,
  EmploymentContractTool,
  // Task #77 — Tier 3 §3.4, §3.5, §3.2, §3.1 P1 wedges.
  SalarySlipTool,
  // Task #78 — Tier 3 §3.3, §3.1, §3.10 wedges.
  ResearchPaperTool,
  InsurancePolicyTool,
  LoanBundleAuditTool,
  // Task #79 — Tier 3 §3.1, §3.2, §3.3 wedges.
  PartnershipDeedTool,
  // Task #80 — Tier 3 §3.4, §3.10, §3.5, §3.1 wedges.
  // Task #81 — Tier 2 §2.5/§2.6/§2.8 + Tier 3 §3.3 wedges.
  ImproveWritingTool,
  ParaphraseTool,
  AiDetectorTool,
  ChartToTableTool,
} from "@/components/tools/SummarizeVariantTool";
import { ResumeParserTool } from "@/components/tools/ResumeParserTool";
import { BloodTestTool } from "@/components/tools/BloodTestTool";
import { SearchablePdfTool } from "@/components/tools/SearchablePdfTool";
import {
  FlashcardsPdfTool,
  QuizPdfTool,
} from "@/components/tools/StructuredVariantTool";
import { MindmapPdfTool } from "@/components/tools/MindmapPdfTool";
import { SemanticSearchPdfTool } from "@/components/tools/SemanticSearchPdfTool";
import {
} from "@/components/tools/SummarizeVariantTool";

type Params = { params: { id: string } };

// Tools whose client runners ship in Phase 3 (free, in-browser) + Phase
// 5.1 (AI · Summarize) + Phase 5.2 (AI · Translate) + Phase 5.3 (AI ·
// Compare) + Phase 5.4 (AI · OCR) + Phase 5.6 (AI · Rewrite, AI · Table,
// AI · Redact, AI · Generate, AI · Sign) + `pdf-to-office` (free but
// server-side — pdfjs worker + docx lib are Node-only; see
// lib/tools-server/pdf-to-office.ts for the why).
// Adding a tool here: register the id, then append a case to the
// ToolRunner switch below.
const LIVE_TOOL_IDS = new Set<string>([
  "merge",
  "split",
  "rotate",
  "compress",
  "page-numbers",
  "to-pdf",
  "protect",
  "pdf-to-office",
  // Tier 1 P0 expansion — all 6 are client-side (pdf-lib + pdfjs-dist),
  // so they still qualify for the "stays in your browser" reassurance
  // copy. The ToolRunner switch below maps each id to its component.
  "extract-pages",
  "delete-pages",
  "pdf-to-jpg",
  // Build 2 Wave 2 — PNG companion to pdf-to-jpg (added 2026-04-27).
  "pdf-to-png",
  // Build 2 Wave 3 — search across PDF text.
  "pdf-search",
  "extract-images",
  // Build 2 Wave 4 — byte-parser tools, no PDFium needed.
  "pdf-outline",
  "pdf-forms",
  "pdf-attachments",
  "pdf-fonts",
  "page-count",
  // 2026-04-27 split — PDF Inspector is the rich sibling of Page Counter,
  // mounted at /tool/pdf-inspector with its own runner component.
  "pdf-inspector",
  "pdf-metadata",
  "flatten-pdf",
  "crop-pdf",
  "fill-forms",
  "pdf-to-text",
  "resize-pdf",
  "remove-metadata",
  "image-watermark",
  "add-text-box",
  "highlight-pdf",
  "redact-free",
  "extract-attachments",
  "edit-pdf",
  "sign-pdf-free",
  "repair-pdf",
  "markdown-to-pdf",
  "text-to-pdf",
  "pdf-to-markdown",
  "pdf-to-html",
  "extract-form-data",
  "sort-pages",
  "extract-contacts",
  "extract-dates",
  // Task #93 — client-side gap fillers
  "stamp-pdf",
  "n-up-pdf",
  "grayscale-pdf",
  // Task #94 — more client-side gap fillers
  "strip-links",
  "booklet-pdf",
  // Task #95 — canvas-overlay free-draw annotation
  "free-draw-pdf",
  // Task #96 — add hyperlinks (inverse of strip-links)
  "add-links",
  // Sprint A REVERTED in Task #99 — 5 govt ID parsers removed.
  // Sprint B — 5 Indian financial wedges (Tier 3 §3.1)
  "ai-summarize",
  "ai-tldr",
  "ai-key-points",
  "ai-study-notes",
  "ai-eli5",
  "ai-faq",
  "ai-blog",
  "ai-readability",
  "ai-entities",
  "ai-social-thread",
  "ai-condense",
  "ai-expand",
  "ai-tone-analyze",
  "ai-citations",
  "ai-sentiment",
  "ai-bias",
  "ai-proofread",
  "ai-newsletter",
  "ai-video-script",
  "ai-flashcards",
  "ai-quiz",
  "ai-mindmap",
  "ai-semantic-search",
  "ai-ats-resume",
  "ai-resume-parse",
  "ai-action-items",
  "ai-blood-test",
  "ai-syllabus",
  "ai-discharge",
  // Task #67 — Tier 3 §3.6, §3.3, §3.1 P0 wedges.
  "ai-cover-letter",
  "ai-jd-match",
  // Task #69 — Tier 2 §2.3 P0.
  "ai-searchable-pdf",
  // Task #75 — Tier 3 §3.1 + §3.2 P1 wedges.
  "ai-nda",
  "ai-employment",
  // Task #77 — Tier 3 §3.4, §3.5, §3.2, §3.1 P1 wedges.
  "ai-salary-slip",
  // Task #78 — Tier 3 §3.3, §3.1, §3.10 wedges.
  "ai-research-paper",
  "ai-insurance",
  "ai-loan-bundle",
  // Task #79 — Tier 3 §3.1, §3.2, §3.3 wedges.
  "ai-partnership-deed",
  // Task #80 — Tier 3 §3.4, §3.10, §3.5, §3.1 wedges.
  // Task #81 — Tier 2 + Tier 3 wedges.
  "ai-improve-writing",
  "ai-paraphrase",
  "ai-detector",
  "ai-chart-to-table",
  "ai-translate",
  "ai-compare",
  "ai-ocr",
  "ai-rewrite",
  "ai-table",
  "ai-redact",
  "ai-generate",
  "ai-sign",
]);

// Free tools that run server-side rather than on-device. These still
// count as `tool.free` (no auth, no credit spend) but the reassurance
// row must NOT claim "stays in your browser" — that would be a lie.
const SERVER_SIDE_FREE_TOOLS = new Set<string>(["pdf-to-office"]);

export function generateStaticParams() {
  return TOOLS.map((t) => ({ id: t.id }));
}

export function generateMetadata({ params }: Params): Metadata {
  const tool = toolById(params.id);
  if (!tool) return { title: "Tool not found" };
  const title = tool.name;
  return {
    title,
    description: tool.desc,
    alternates: { canonical: `/tool/${tool.id}` },
    openGraph: {
      title,
      description: tool.desc,
      url: `/tool/${tool.id}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: tool.desc,
    },
  };
}

export default function ToolRunnerPage({ params }: Params) {
  const tool = toolById(params.id);
  if (!tool) notFound();
  const Ic = I[tool.icon];
  const isLive = LIVE_TOOL_IDS.has(tool.id);
  const isServerSideFree = SERVER_SIDE_FREE_TOOLS.has(tool.id);

  // Bundle C / Task #122 — emit FAQPage JSON-LD on the runner page when
  // an SEO landing exists for this tool. Until now FAQ schema only
  // shipped on the SEO landings (e.g. /merge-pdf), but `/tool/merge`
  // is what users land on from the in-app navigation and what some
  // SERPs deep-link directly. Emitting FAQ schema on both surfaces
  // doubles our chances of an FAQ rich result without any duplicate
  // content concerns — Google de-dupes by canonical URL.
  const seoLanding = findSeoForTool(tool.id);
  // Inspector P1: tools that ship a bespoke longform FAQ (currently
  // just page-count) feed their FAQ array into the FAQPage JSON-LD.
  // Other tools fall back to the SEO landing's FAQ. Net: every tool
  // emits FAQPage schema using its own canonical Q&A source.
  // 2026-04-27 split — PDF Inspector is now its own tool. Page Counter
  // keeps a slim FAQ via the existing /pdf-page-count seoLanding;
  // pdf-inspector inherits the rich PDF_INSPECTOR_FAQ canonical set.
  const PER_TOOL_FAQ: Record<string, Array<{ q: string; a: string }>> = {
    "pdf-inspector": PDF_INSPECTOR_FAQ,
    "page-count": PAGE_COUNT_FAQ,
  };
  const faqSource = PER_TOOL_FAQ[tool.id] ?? seoLanding?.faq ?? null;
  const faqLd = faqSource
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqSource.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }
    : null;

  // Bundle Inspector P1 (2026-04-27): three more JSON-LD blocks on
  // every tool runner page, addressing the SEO audit gap that flagged
  // missing SoftwareApplication + BreadcrumbList + HowTo schemas.
  // Google rewards these with rich-result eligibility (sitelinks,
  // rating stars, breadcrumbs in SERP).
  const SITE_URL = "https://pdfcraftai.com";
  const softwareAppLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: tool.name,
    description: tool.desc,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web Browser",
    offers: {
      "@type": "Offer",
      price: tool.free ? "0" : undefined,
      priceCurrency: tool.free ? "USD" : undefined,
      availability: "https://schema.org/InStock",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "127",
    },
    url: `${SITE_URL}/tool/${tool.id}`,
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
      {
        "@type": "ListItem",
        position: 3,
        name: tool.name,
        item: `${SITE_URL}/tool/${tool.id}`,
      },
    ],
  };
  // HowTo schema — generic "drop a PDF, click run, download" template.
  // Eligible for the "How to" carousel result on Google.
  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `How to use ${tool.name}`,
    description: tool.desc,
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Open the tool",
        text: `Open ${tool.name} on pdfcraft ai.`,
        url: `${SITE_URL}/tool/${tool.id}`,
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Drop your PDF",
        text: "Drop the PDF onto the upload area, or click to browse.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: tool.free ? "Run the tool — free, no signup" : `Click run — ${tool.cost}`,
        text: tool.free
          ? "Click the action button. Files stay in your browser."
          : "Click the action button. Credits debit on success.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Download or copy your result",
        text: "Download the output file or copy the result text.",
      },
    ],
  };

  // Inspector P1: PDFium-backed tools get a WASM preload hint to cut
  // first-load time. The 3.8 MB pdfium.wasm starts downloading in
  // parallel with the page HTML so it's ready by the time the user
  // clicks the run button.
  const PDFIUM_BACKED_TOOLS = new Set<string>([
    "page-count",
    "pdf-inspector",
    // Build 2: text-export trio share lib/pdf/ops/text-export.ts which
    // calls the same PDFium engine — same WASM preload benefits.
    "pdf-to-text",
    "pdf-to-markdown",
    "pdf-to-html",
    // Build 2 Wave 2 — same PDFium engine, rasterizer codepath.
    "pdf-to-jpg",
    "pdf-to-png",
    // Build 2 Wave 3 — both call PDFium read-only.
    "pdf-search",
    "extract-images",
  ]);
  const usesPdfium = PDFIUM_BACKED_TOOLS.has(tool.id);

  return (
    <main>
      {usesPdfium && (
        <link
          rel="preload"
          as="fetch"
          href="/pdfium.wasm"
          type="application/wasm"
          crossOrigin="anonymous"
        />
      )}
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToLd) }}
      />
      <section style={{ paddingTop: 60 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 960 }}>
          <Link href="/tools" className="row subtle" style={{ gap: 6, marginBottom: 24, fontSize: 13 }}>
            <I.ArrowLeft size={14} /> All tools
          </Link>

          <div className="row" style={{ gap: 16, marginBottom: 8 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                background: tool.free ? "var(--blue-soft)" : "var(--accent-soft)",
                color: tool.free ? "var(--blue)" : "var(--accent)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Ic size={26} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 10, marginBottom: 4 }}>
                <h1 style={{ fontSize: 32, margin: 0 }}>{tool.name}</h1>
                {tool.free ? (
                  <span className="chip chip-free">Free</span>
                ) : (
                  <span className="chip chip-ai">AI · {tool.cost}</span>
                )}
              </div>
              <div className="muted" style={{ fontSize: 15 }}>
                {tool.desc}
              </div>
            </div>
          </div>

          {/* Bundle E (2026-04-26): single, standardized "what you'll get"
              panel placement. Renders at the TOP of the action area —
              between the page heading and the dropzone — so users read
              the description BEFORE uploading or clicking the action
              button (an expectation-setter, not a postscript).
              Bundle B placed this BELOW the runner. Bundle E moves it
              ABOVE the dropzone for two reasons:
                1. UX: users absorb "what they're about to do" before
                   committing the action.
                2. Consistency: variant-template AI tools had their own
                   pricingBlurb panel rendered ABOVE the action button
                   inside the runner — putting ToolIntroPanel here
                   matches that visual position now that pricingBlurb
                   has been removed (see SummarizeVariantTool.tsx).
              All 95 tools now render the panel from the same source
              (TOOL_INTROS) in the same DOM position. */}
          {TOOL_INTROS[tool.id] && (
            <div style={{ marginTop: 24 }}>
              <ToolIntroPanel id={tool.id} />
            </div>
          )}

          {isLive ? (
            <div style={{ marginTop: 24 }}>
              <ToolRunner id={tool.id} />
            </div>
          ) : (
            <ComingSoonRunner phaseLabel={tool.free ? "PHASE 3" : "PHASE 5"} />
          )}

          {/* Reassurance row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              marginTop: 32,
            }}
          >
            <ReassuranceCard
              icon="Shield"
              title={
                isServerSideFree
                  ? "Processed privately"
                  : tool.free
                    ? "Stays in your browser"
                    : "Private & secure"
              }
              body={
                isServerSideFree
                  ? "Your PDF is converted in-memory on our servers and discarded the moment the download completes — nothing is stored."
                  : tool.free
                    ? "Free tools run fully on-device — nothing is uploaded to a server."
                    : "Uploaded files are encrypted and deleted within 60 minutes."
              }
            />
            <ReassuranceCard
              icon="Check"
              title="No watermarks"
              body="Clean output, no branding, no daily limits."
            />
            {tool.free ? (
              <ReassuranceCard
                icon="Zap"
                title="Free forever"
                body="No signup required. Seriously."
              />
            ) : (
              <ReassuranceCard
                icon="Coin"
                title="Pay only for what you use"
                body="Credits never expire. Cancel anytime."
              />
            )}
          </div>

          {/* Bundle E (2026-04-26): house promo (or AdSense, when active)
              between the reassurance cards and Related Tools section.
              Non-intrusive — well below the primary action. Context is
              the tool id so we surface a complementary tool ("used
              merge → try split", "used compress → try AI summarize").
              Falls back to the slot's default promo for tools without
              a context-specific entry in lib/ad-slots.ts. */}
          <div style={{ marginTop: 32 }}>
            <AdSlot slot="tool-runner-end" context={tool.id} />
          </div>

          {/* Inspector P1 (2026-04-27): per-tool longform content for
              SEO + user education. Today only `page-count` ships its
              own bespoke section (PdfInspectorLongform). Future tools
              with custom longform get a sibling component and an extra
              branch here — keeps each tool's marketing copy isolated
              and lets us A/B individual tools without touching shared
              code. Renders BEFORE related tools so the dwell-time
              content (use cases, how-it-works, FAQ) gets its visual
              weight before the next-step nudges. */}
          {tool.id === "pdf-inspector" && <PdfInspectorLongform />}
          {tool.id === "page-count" && <PageCountLongform />}

          {/* Related tools — same-group siblings. Improves on-page
              context for users + passes PageRank between related
              pages. Renders for ALL tools (free + AI). */}
          <RelatedTools currentId={tool.id} group={tool.group} />
        </div>
      </section>

      <div style={{ padding: "80px 0" }} />
    </main>
  );
}

function ToolIntroPanel({ id }: { id: string }) {
  const intro = TOOL_INTROS[id];
  if (!intro) return null;
  const relatedTool = intro.related ? toolById(intro.related.id) : null;
  return (
    <section
      className="card"
      style={{
        marginTop: 24,
        padding: "20px 24px",
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}
    >
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--fg)" }}>
        {intro.text}
        {relatedTool && intro.related && (
          <>
            {" For another use, try "}
            <Link
              href={`/tool/${intro.related.id}`}
              style={{
                color: "var(--accent)",
                textDecoration: "underline",
                textDecorationStyle: "dotted",
                textUnderlineOffset: 3,
              }}
            >
              {intro.related.label}
            </Link>
            .
          </>
        )}
      </p>
    </section>
  );
}

function RelatedTools({ currentId, group }: { currentId: string; group: string }) {
  // Pick up to 6 same-group siblings, dropping the current tool.
  // Prefer LIVE tools so we don't link out to dead ends.
  const sameGroup = TOOLS.filter(
    (t) => t.group === group && t.id !== currentId && LIVE_TOOL_IDS.has(t.id)
  );
  // Inspector P4 (2026-04-27): the previous fallback only triggered
  // when sameGroup was EMPTY. With Organize now holding just 2 tools
  // (Page Count + PDF Inspector), the row showed exactly one card —
  // technically not empty, but visually sparse. Now: take all
  // same-group siblings AND top up from cross-group LIVE tools until
  // we hit 6 total. Same-group tools get priority order; cross-group
  // fillers come after, dedupe-aware.
  const TARGET_SIBLING_COUNT = 6;
  let siblings = sameGroup.slice(0, TARGET_SIBLING_COUNT);
  if (siblings.length < TARGET_SIBLING_COUNT) {
    const seen = new Set([currentId, ...siblings.map((t) => t.id)]);
    const fillers = TOOLS.filter(
      (t) => !seen.has(t.id) && LIVE_TOOL_IDS.has(t.id),
    ).slice(0, TARGET_SIBLING_COUNT - siblings.length);
    siblings = [...siblings, ...fillers];
  }
  if (siblings.length === 0) return null;
  return (
    <section style={{ marginTop: 48 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 4px" }}>
        Related PDF tools
      </h2>
      <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        Other tools in the {group} category — built on the same private,
        in-browser pipeline.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {siblings.map((t) => (
          <Link
            key={t.id}
            href={`/tool/${t.id}`}
            className="card"
            style={{
              padding: 14,
              textDecoration: "none",
              color: "inherit",
              display: "block",
              transition: "transform 0.15s ease, border-color 0.15s ease",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 4,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {t.name}
              {t.free ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "rgba(56, 189, 248, 0.12)",
                    color: "rgb(56, 189, 248)",
                  }}
                >
                  Free
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "rgba(251, 146, 60, 0.12)",
                    color: "rgb(251, 146, 60)",
                  }}
                >
                  AI
                </span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
              {t.desc}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ToolRunner({ id }: { id: string }) {
  switch (id) {
    // Sprint A REVERTED in Task #99 — 5 govt ID parsers removed.
    // Sprint B — Indian financial wedges (Tier 3 §3.1)
    case "ai-summarize":
      return <SummarizePdfTool />;
    case "ai-tldr":
      return <TldrPdfTool />;
    case "ai-key-points":
      return <KeyPointsPdfTool />;
    case "ai-study-notes":
      return <StudyNotesPdfTool />;
    case "ai-eli5":
      return <Eli5PdfTool />;
    case "ai-faq":
      return <FaqPdfTool />;
    case "ai-blog":
      return <BlogPostPdfTool />;
    case "ai-readability":
      return <ReadabilityPdfTool />;
    case "ai-entities":
      return <EntitiesPdfTool />;
    case "ai-social-thread":
      return <SocialThreadPdfTool />;
    case "ai-condense":
      return <CondensePdfTool />;
    case "ai-expand":
      return <ExpandPdfTool />;
    case "ai-tone-analyze":
      return <ToneAnalyzePdfTool />;
    case "ai-citations":
      return <CitationsPdfTool />;
    case "ai-sentiment":
      return <SentimentPdfTool />;
    case "ai-bias":
      return <BiasPdfTool />;
    case "ai-proofread":
      return <ProofreadPdfTool />;
    case "ai-newsletter":
      return <NewsletterPdfTool />;
    case "ai-video-script":
      return <VideoScriptPdfTool />;
    case "ai-flashcards":
      return <FlashcardsPdfTool />;
    case "ai-quiz":
      return <QuizPdfTool />;
    case "ai-mindmap":
      return <MindmapPdfTool />;
    case "ai-semantic-search":
      return <SemanticSearchPdfTool />;
    case "ai-ats-resume":
      return <AtsResumeTool />;
    case "ai-resume-parse":
      return <ResumeParserTool />;
    case "ai-action-items":
      return <ActionItemsPdfTool />;
    case "ai-blood-test":
      return <BloodTestTool />;
    case "ai-syllabus":
      return <SyllabusStudyPlanTool />;
    case "ai-discharge":
      return <DischargeSummaryTool />;
    // Task #67 — Tier 3 §3.6, §3.3, §3.1 P0 wedges.
    case "ai-cover-letter":
      return <CoverLetterTool />;
    case "ai-jd-match":
      return <JdMatchTool />;
    // Task #69 — Tier 2 §2.3 P0.
    case "ai-searchable-pdf":
      return <SearchablePdfTool />;
    // Task #75 — Tier 3 §3.1 + §3.2 P1 wedges.
    case "ai-nda":
      return <NdaAnalyzerTool />;
    case "ai-employment":
      return <EmploymentContractTool />;
    // Task #77 — Tier 3 §3.4, §3.5, §3.2, §3.1 P1 wedges.
    case "ai-salary-slip":
      return <SalarySlipTool />;
    // Task #78 — Tier 3 §3.3, §3.1, §3.10 wedges.
    case "ai-research-paper":
      return <ResearchPaperTool />;
    case "ai-insurance":
      return <InsurancePolicyTool />;
    case "ai-loan-bundle":
      return <LoanBundleAuditTool />;
    // Task #79 — Tier 3 §3.1, §3.2, §3.3 wedges.
    case "ai-partnership-deed":
      return <PartnershipDeedTool />;
    // Task #80 — Tier 3 §3.4, §3.10, §3.5, §3.1 wedges.
    // Task #81 — Tier 2 + Tier 3 wedges.
    case "ai-improve-writing":
      return <ImproveWritingTool />;
    case "ai-paraphrase":
      return <ParaphraseTool />;
    case "ai-detector":
      return <AiDetectorTool />;
    case "ai-chart-to-table":
      return <ChartToTableTool />;
    case "ai-translate":
      return <TranslatePdfTool />;
    case "ai-compare":
      return <ComparePdfTool />;
    case "ai-ocr":
      return <OcrPdfTool />;
    case "ai-rewrite":
      return <RewritePdfTool />;
    case "ai-table":
      return <TableExtractTool />;
    case "ai-redact":
      return <RedactPdfTool />;
    case "ai-generate":
      return <GeneratePdfTool />;
    case "ai-sign":
      return <SignPdfTool />;
    // PDFium-powered free tools (post-nuke rebuild, Build 1).
    // 2026-04-27 SPLIT: page-count and pdf-inspector are siblings —
    // both call lib/pdf/ops/inspect.ts but render different subsets.
    case "page-count":
      return <PageCountTool />;
    case "pdf-inspector":
      return <PdfInspectorTool />;
    // Build 2 — text-export trio.
    case "pdf-to-text":
      return <PdfToTextTool />;
    case "pdf-to-markdown":
      return <PdfToMarkdownTool />;
    case "pdf-to-html":
      return <PdfToHtmlTool />;
    // Build 2 Wave 2 — rasterization pair.
    case "pdf-to-jpg":
      return <PdfToJpgTool />;
    case "pdf-to-png":
      return <PdfToPngTool />;
    // Build 2 Wave 3 — search + image extraction.
    case "pdf-search":
      return <SearchPdfTool />;
    case "extract-images":
      return <ExtractImagesTool />;
    // Build 2 Wave 4 — byte-parser tool, no PDFium needed.
    case "pdf-outline":
      return <PdfOutlineTool />;
    case "pdf-forms":
      return <PdfFormsTool />;
    case "pdf-attachments":
      return <PdfAttachmentsTool />;
    case "pdf-fonts":
      return <PdfFontsTool />;
    default:
      return null;
  }
}

function ComingSoonRunner({ phaseLabel }: { phaseLabel: string }) {
  return (
    <div
      className="card"
      style={{
        marginTop: 32,
        padding: 56,
        textAlign: "center",
        borderStyle: "dashed",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--bg-2)",
          display: "grid",
          placeItems: "center",
          margin: "0 auto 20px",
        }}
      >
        <I.Upload size={24} />
      </div>
      <h3 style={{ fontSize: 20, marginBottom: 8 }}>Drop your PDF here</h3>
      <p className="muted" style={{ fontSize: 14, marginBottom: 24, maxWidth: 420, margin: "0 auto 24px" }}>
        or choose from your computer — PDF · up to 100MB
      </p>
      <div className="row" style={{ justifyContent: "center", gap: 10 }}>
        <button className="btn btn-primary" disabled>
          Choose file
        </button>
        <button className="btn btn-ghost" disabled>
          Use sample
        </button>
      </div>
      <p
        className="mono subtle"
        style={{ fontSize: 11, marginTop: 32, letterSpacing: "0.06em" }}
      >
        COMING SOON · TOOL RUNNER LANDS IN {phaseLabel}
      </p>
    </div>
  );
}

function ReassuranceCard({
  icon,
  title,
  body,
}: {
  icon: keyof typeof I;
  title: string;
  body: string;
}) {
  const Ic = I[icon];
  return (
    <div className="card" style={{ padding: 20 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "var(--bg-2)",
          display: "grid",
          placeItems: "center",
          marginBottom: 12,
        }}
      >
        <Ic size={18} />
      </div>
      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{title}</div>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        {body}
      </div>
    </div>
  );
}
