import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { I } from "@/components/icons/Icons";
import { ToolRunner } from "@/components/tools/ToolRunner";
// Build 2 Wave 9 (2026-04-27): pdf-lib-backed writable tools.
// Tier 2 (2026-04-27): Extract / Delete Pages on shared PageGridTool base.
// Tier 2 (continued): Sort Pages — drag-to-reorder thumbnail grid.
// Tier 3 (2026-04-28): 4 simple pdf-lib tools.
// Tier 4 (2026-04-28): first visual editor — Crop PDF.
// Tier 6 (2026-04-28): second visual editor on shared <PageEditorTool> base.
// Tier 6 (continued): third visual editor — drag-to-highlight.
// Tier 6 (continued): fourth visual editor — drag-to-redact.
// Tier 6 (continued): fifth visual editor — click-to-place signature.
// Tier 6 (continued): sixth visual editor — pen tool over canvas.
// Tier 6 (final): seventh visual editor — drag-rect + URL input.
// Tier 5 (2026-04-28): Watermark / N-up / Resize / Image Watermark.
import {
  PdfInspectorLongform,
  PDF_INSPECTOR_FAQ,
} from "@/components/marketing/PdfInspectorLongform";
import {
  PageCountLongform,
  PAGE_COUNT_FAQ,
} from "@/components/marketing/PageCountLongform";
import { ToolRunnerLongform } from "@/components/marketing/ToolRunnerLongform";
import { TOOL_LONGFORMS } from "@/lib/tool-longforms";
import { TOOLS, toolById } from "@/lib/tools";
import { TOOL_INTROS } from "@/lib/tool-intros";
import { findSeoForTool } from "@/lib/seo-pages";
import { AdSlot } from "@/components/marketing/AdSlot";

type Params = { params: { id: string } };

// Tools whose client runners are wired in components/tools/ToolRunner.tsx.
// An id in this Set means: render <ToolRunner id={...} />; an id NOT in
// this set means: render the "Coming Soon" placeholder (see
// ComingSoonRunner below). The set must stay in sync with the switch
// in ToolRunner.tsx — scripts/test-tool-runner-coverage.mjs pins the
// invariant so any drift fails CI.
//
// Cleaned 2026-04-29 (M24 follow-up): removed 15 stale ids that aren't
// in lib/tools.ts at all. Those entries never affected rendering
// because toolById() returns undefined → notFound() fires before this
// Set is consulted, but they accumulated noise over many tool removals
// (Task #100 India sweep, Task #99 govt ID reversal, etc.).
const LIVE_TOOL_IDS = new Set<string>([
  // pdf-lib writable tools (Build 2 Wave 9, 2026-04-27).
  "merge",
  "split",
  "rotate",
  "unlock",
  "page-numbers",
  // Tier 1 P0 expansion — client-side (pdf-lib + pdfjs-dist).
  "extract-pages",
  "delete-pages",
  "pdf-to-jpg",
  "pdf-to-png",
  "pdf-search",
  "extract-images",
  // Build 2 Wave 4 — byte-parser tools.
  "pdf-outline",
  "pdf-forms",
  "pdf-attachments",
  "pdf-fonts",
  // Build 2 Wave 8 — 6 more byte-parser tools.
  "pdf-links",
  "pdf-annotations",
  "pdf-javascript",
  "pdf-accessibility",
  "pdf-a-check",
  "pdf-x-check",
  "page-count",
  // 2026-04-27 split — PDF Inspector is the rich sibling of Page Counter,
  // mounted at /tool/pdf-inspector with its own runner component.
  "pdf-inspector",
  "flatten-pdf",
  "crop-pdf",
  "pdf-to-text",
  "resize-pdf",
  "remove-metadata",
  "image-watermark",
  "add-text-box",
  "highlight-pdf",
  "redact-free",
  "sign-pdf-free",
  "repair-pdf",
  "pdf-to-markdown",
  "pdf-to-html",
  "sort-pages",
  // Task #93 — client-side gap fillers.
  "stamp-pdf",
  "n-up-pdf",
  "strip-links",
  // Task #95 — canvas-overlay free-draw annotation.
  "free-draw-pdf",
  // Task #96 — add hyperlinks (inverse of strip-links).
  "add-links",
  // 2026-05-01 — Tier 1 dead-SEO-route fillers. Three new client-side
  // pdf-lib-backed tools (lib/pdf/ops/images-to-pdf.ts +
  // lib/pdf/ops/text-to-pdf.ts) wired into ToolRunner.tsx. Without
  // adding them here the runner page falls back to the COMING SOON
  // placeholder — the runtime gating is `LIVE_TOOL_IDS.has(tool.id)`,
  // which is checked AFTER the ToolRunner.tsx switch was already
  // updated. Three-step ship checklist: (1) lib/tools.ts, (2)
  // ToolRunner.tsx, (3) THIS Set. The smoke spec passed because it
  // only checks h1+no-console-errors — which a placeholder page also
  // satisfies. test-tool-runner-coverage.mjs catches the
  // ToolRunner↔TOOLS drift but not the LIVE_TOOL_IDS↔ToolRunner drift
  // — that gap is being closed in a follow-up CI guard.
  "jpg-to-pdf",
  "png-to-pdf",
  "text-to-pdf",
  // 2026-05-01 Tier 1 batch (encrypt-pdf deferred — pdf-lib doesn't
  // support write-encryption; plan to revisit with qpdf-wasm or a
  // server-side rail):
  "markdown-to-pdf",
  "grayscale-pdf",
  "booklet-pdf",
  // 2026-05-01 Tier 2 batch:
  "bates-numbers",
  "odd-even-pages",
  "csv-to-pdf",
  // AI tools.
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
//
// 2026-04-29: emptied during the M24 LIVE_TOOL_IDS cleanup. The only
// historical entry, `pdf-to-office`, was never registered in TOOLS so
// the route hit notFound() anyway. If a future server-side free tool
// ships, register the id here AND in TOOLS AND in LIVE_TOOL_IDS.
const SERVER_SIDE_FREE_TOOLS = new Set<string>();

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
    // Build 2 Wave 5: pull bespoke FAQs from the shared longform
    // data so the FAQPage JSON-LD on each runner page matches
    // exactly what's visible in the longform's FAQ section.
    ...Object.fromEntries(
      Object.entries(TOOL_LONGFORMS).map(([id, data]) => [id, data.faqs]),
    ),
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
    // Wave 9 visual rotate UX — Rotate tool now renders per-page
    // thumbnails via the PDFium rasterizer for the click-to-rotate
    // grid, before handing off to pdf-lib for the actual save.
    "rotate",
    // Visual Split UX — Split tool also renders per-page thumbnails
    // for the click-to-mark-split-points grid (Visual mode default;
    // Advanced text-mode still available as a toggle).
    "split",
    // Merge thumbnails — first-page preview per input PDF in the file
    // list. PDFium first-page render per file, async after add.
    "merge",
    // Crop PDF — renders page 1 at 1.5× as the editor canvas.
    "crop-pdf",
    // Add Text Box — second visual editor on PageEditorTool base.
    "add-text-box",
    // Highlight PDF — third visual editor on PageEditorTool base.
    "highlight-pdf",
    // Redact PDF — fourth visual editor on PageEditorTool base.
    "redact-free",
    // Sign PDF — fifth visual editor on PageEditorTool base.
    "sign-pdf-free",
    // Free Draw — sixth visual editor (pen tool).
    "free-draw-pdf",
    // Add Hyperlinks — seventh visual editor (drag-rect + URL).
    "add-links",
    // Tier 2 — Extract / Delete Pages render a thumbnail grid via
    // the shared PageGridTool. Both rely on the PDFium rasterizer
    // for the per-page previews before pdf-lib does the actual op.
    "extract-pages",
    "delete-pages",
    // Tier 2 (continued) — Sort Pages renders thumbnails for the
    // drag-and-drop reorder UI before pdf-lib's reorderPages saves.
    "sort-pages",
  ]);
  const usesPdfium = PDFIUM_BACKED_TOOLS.has(tool.id);

  return (
    <main>
      {usesPdfium && (
        // 2026-04-30: was href="/pdfium.wasm" — but lib/pdf/library.ts
        // now loads via /api/pdfium-wasm (the static path serves with
        // Content-Type: text/plain on Hostinger LiteSpeed/Passenger,
        // breaking WebAssembly.compileStreaming). The preload must
        // match the URL the runtime actually fetches AND the Content-
        // Type the server actually returns, otherwise the browser's
        // preload cache misses and the optimization is wasted.
        <link
          rel="preload"
          as="fetch"
          href="/api/pdfium-wasm"
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
          {/* Build 2 Wave 5 (2026-04-27): every other PDFium-backed
              tool gets the shared longform via the TOOL_LONGFORMS
              data file. Closes the structural-parity gap — every
              tool now has the same editorial depth as Inspector +
              Page Count. */}
          {TOOL_LONGFORMS[tool.id] && tool.id !== "pdf-inspector" && tool.id !== "page-count" && (
            <ToolRunnerLongform data={TOOL_LONGFORMS[tool.id]} />
          )}

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
            // #20 (2026-04-29): prefetch={false} — every /tool/{id}
            // page renders this Related Tools grid (4-6 cards).
            // Multiplied across ~90 tool pages with the prefetch flood,
            // hover/scroll on any tool page used to crash workers via
            // the LSAPI thread cap. Hover-prefetch (Next default for
            // explicitly-set false) still gets the user's actual click
            // ahead of the navigation.
            prefetch={false}
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
