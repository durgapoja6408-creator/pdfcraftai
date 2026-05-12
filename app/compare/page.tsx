// app/compare/page.tsx
//
// 2026-05-12 — TOOL_IMPROVEMENT_PLAN T2-6 (initial ship).
// Intent-router landing for visitors who know what they want to do
// with a PDF but don't know the exact tool name. Common cases:
// "Compress PDF" → which tool?, "Reduce PDF size" → ?, "Make my PDF
// smaller for email" → ?. Each of those maps to the same compress
// tool but a confused visitor bounces before finding it.
//
// Design choices:
//
// 1. Static-only page. No client state, no JS interactivity beyond
//    the standard Next.js Link prefetch. The intent map is a const
//    block; Next.js renders it server-side. This means the page
//    indexes cleanly in search engines and works without JavaScript.
//
// 2. Twelve intent groups covering the high-traffic decision points.
//    Each intent shows 1-3 tools with a short "when to pick this"
//    blurb. Where there's a meaningful free-vs-AI choice (summarize,
//    compare, translate), both options are surfaced side-by-side
//    so users see the tradeoff rather than being funneled into one.
//
// 3. The page is SEO-indexable (`alternates.canonical: "/compare"`)
//    and links into the sitemap by way of the long-tail keyword
//    coverage these intents capture. Search queries like "how to
//    reduce pdf size for email" or "how to extract pages from pdf"
//    plausibly land here rather than on a dead /compress-pdf or
//    /extract-pages SEO landing.
//
// 4. NO interactive decision tree on first ship. Static cards
//    are enough to validate that the page reduces bounce rate;
//    interactive "answer 3 questions" wizard is a follow-up if data
//    supports it. Keeping the surface small now keeps the cascade
//    risk small (this is a new route + a metadata entry + sitemap).
//
// 5. The hero question "What do you want to do with your PDF?" sets
//    expectation. The page below is organized by VERBS (combine,
//    split, convert, shrink, understand, chat, fill, sign, protect,
//    translate, redact, compare) — verbs are how users phrase intent
//    in search queries, not nouns ("PDF tool").

import type { Metadata } from "next";
import Link from "next/link";

const DESC =
  "Find the right PDF tool for what you want to do. Combine, split, convert, shrink, summarize, translate, sign, redact, compare — pdfcraftai groups 120+ tools by intent.";

export const metadata: Metadata = {
  title: "Which PDF tool do I need? — pdfcraftai.com",
  description: DESC,
  alternates: { canonical: "/compare" },
  openGraph: {
    title: "Which PDF tool do I need?",
    description: DESC,
    url: "/compare",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Which PDF tool do I need?",
    description: DESC,
  },
};

// Intent shape: a verb-led question + 1-3 candidate tools. When a
// meaningful free-vs-AI choice exists, the `kind` field marks the
// candidate so the UI can render the badge.
type Candidate = {
  href: string;
  title: string;
  blurb: string;
  kind: "free" | "ai";
};
type Intent = {
  id: string;
  question: string;
  candidates: Candidate[];
};

const INTENTS: Intent[] = [
  {
    id: "combine",
    question: "I want to combine multiple PDFs into one",
    candidates: [
      {
        href: "/tool/merge",
        title: "Merge PDF",
        blurb:
          "Drop any number of PDFs and stitch them together. Drag thumbnails to reorder pages between files. Free, no limit.",
        kind: "free",
      },
    ],
  },
  {
    id: "split-extract",
    question: "I want to split a PDF or pull out specific pages",
    candidates: [
      {
        href: "/tool/split",
        title: "Split PDF",
        blurb:
          "One PDF into many — separate every page, or split by custom ranges like 1-3, 5, 7-9.",
        kind: "free",
      },
      {
        href: "/tool/extract-pages",
        title: "Extract pages",
        blurb:
          "Build a new PDF from just the pages you want, in any order. Use when you want one combined output, not many files.",
        kind: "free",
      },
      {
        href: "/tool/delete-pages",
        title: "Delete pages",
        blurb:
          "Faster when you want to keep most of the document and just drop a few pages (e.g. cover sheet, blanks).",
        kind: "free",
      },
    ],
  },
  {
    id: "convert-from-pdf",
    question: "I want to convert a PDF to another format",
    candidates: [
      {
        // 2026-05-12 — corrected: /tool/pdf-to-office is a 404 (no
        // catalog id; LibreOffice server-side rail is deferred per
        // KNOWN_DEAD_REFS). /pdf-to-word is the canonical SEO landing
        // that today 308-redirects to /tool/pdf-to-text.
        href: "/pdf-to-word",
        title: "PDF to Word",
        blurb:
          "Convert PDF text into editable Word format. Works on scans (OCR auto-applied).",
        kind: "free",
      },
      {
        href: "/tool/pdf-to-jpg",
        title: "PDF to images",
        blurb:
          "Convert pages to JPG or PNG at 1×/2×/3× resolution. Multi-page PDFs bundle to a zip.",
        kind: "free",
      },
      {
        href: "/tool/pdf-to-text",
        title: "PDF to Text",
        blurb:
          "Pull just the words out as a .txt file. Use for indexing, re-formatting, or feeding to another tool. Markdown and HTML variants also available.",
        kind: "free",
      },
    ],
  },
  {
    id: "convert-to-pdf",
    question: "I want to convert files INTO a PDF",
    candidates: [
      {
        href: "/tool/jpg-to-pdf",
        title: "Images to PDF",
        blurb:
          "Combine JPGs, PNGs, or both into a single PDF. Drag to reorder; pick page size; preserve native image resolution.",
        kind: "free",
      },
      {
        href: "/tool/text-to-pdf",
        title: "Text / Markdown / CSV to PDF",
        blurb:
          "Paginate plain text, markdown, or CSV as a styled, searchable PDF.",
        kind: "free",
      },
    ],
  },
  {
    id: "shrink",
    question: "I want to make my PDF smaller",
    candidates: [
      {
        href: "/tool/compress-pdf",
        title: "Compress PDF",
        blurb:
          "Light / Balanced / Strong levels. Balanced typically halves the file size while keeping print quality. Useful for email caps and upload portals.",
        kind: "free",
      },
      {
        href: "/tool/remove-metadata",
        title: "Strip metadata",
        blurb:
          "Removes author, software, history. Smaller savings than Compress, but a fast first-pass for privacy-sensitive distribution.",
        kind: "free",
      },
    ],
  },
  {
    id: "understand",
    question: "I want to read or understand a long PDF quickly",
    candidates: [
      {
        // 2026-05-12 — corrected: /tool/extract-text was a 404. The
        // canonical tool is /tool/pdf-to-text (free in-browser word
        // extraction via PDFium).
        href: "/tool/pdf-to-text",
        title: "Extract text (free)",
        blurb:
          "Free — pulls every word out so you can search, ctrl-F, or paste into another reader. No AI.",
        kind: "free",
      },
      {
        href: "/tool/ai-summarize",
        title: "AI Summarize",
        blurb:
          "TL;DR + key points + action items in seconds. Use when you need to brief a colleague or decide if a doc is worth reading.",
        kind: "ai",
      },
      {
        href: "/tool/ai-chat",
        title: "Chat with PDF",
        blurb:
          "Ask specific questions, get cited answers pinned to page numbers. Use when you have a long doc and a narrow question.",
        kind: "ai",
      },
    ],
  },
  {
    id: "fill-sign",
    question: "I want to fill in a form or sign a PDF",
    candidates: [
      {
        href: "/tool/pdf-form-fill",
        title: "Fill PDF Form",
        blurb:
          "Detects AcroForm fields and lets you type / tick / select. Flatten to lock values before sending.",
        kind: "free",
      },
      {
        // 2026-05-12 — corrected: /tool/ai-sign IS the AI sign-and-
        // fill flow (15 credits per doc), and there's a separate
        // free /tool/sign-pdf-free for visual signature placement
        // without AI. Splitting into two cards so the free vs AI
        // tradeoff is honest.
        href: "/tool/sign-pdf-free",
        title: "Sign PDF (free)",
        blurb:
          "Place a signature image on page 1 — click to position, slider for size. Visual signature only (not cryptographic).",
        kind: "free",
      },
      {
        // 2026-05-12 — corrected: /tool/ai-fill was a 404. The
        // canonical AI form-fill tool is /tool/ai-sign which is
        // marketed as "Sign & Fill Forms" — AI fills fields, you
        // sign and send. Same tool covers both intents.
        href: "/tool/ai-sign",
        title: "Sign & Fill Forms (AI)",
        blurb:
          "AI fills every relevant field, then you sign and send. Use on multi-page applications or forms that aren't proper AcroForms.",
        kind: "ai",
      },
    ],
  },
  {
    id: "security",
    question: "I want to unlock or protect a PDF",
    candidates: [
      {
        href: "/tool/unlock",
        title: "Unlock PDF",
        blurb:
          "Remove password protection from PDFs you own. Requires the password you set or have.",
        kind: "free",
      },
      {
        // 2026-05-12 — corrected: /tool/protect was a 404. Password
        // protection is not currently a shipped tool (the underlying
        // qpdf encryption rail is server-side and deferred). We
        // intentionally do NOT list a non-existent "Protect PDF"
        // card here. /tool/remove-metadata is the closest free
        // alternative for users who landed here looking for "make
        // this PDF less visible / less trackable before sending".
        href: "/tool/remove-metadata",
        title: "Strip metadata before sending",
        blurb:
          "Remove author / software / history fields. Reduces fingerprinting before you email a sensitive PDF. Not the same as encryption — for that, your OS or PDF reader can password-protect on save.",
        kind: "free",
      },
    ],
  },
  {
    id: "translate",
    question: "I want to translate a PDF",
    candidates: [
      {
        href: "/tool/ai-translate",
        title: "AI Translate",
        blurb:
          "90+ languages with layout preservation — tables, images, and basic formatting survive the translation.",
        kind: "ai",
      },
      {
        href: "/hindi-pdf-translator",
        title: "Hindi-specific translator",
        blurb:
          "Same engine, tuned defaults for English↔Hindi. Use if Hindi is your only target.",
        kind: "ai",
      },
      {
        href: "/tamil-pdf-translator",
        title: "Tamil-specific translator",
        blurb:
          "Tuned defaults for English↔Tamil. Same engine; convenience entry point.",
        kind: "ai",
      },
    ],
  },
  {
    id: "redact",
    question: "I want to remove or hide sensitive information",
    candidates: [
      {
        href: "/tool/ai-redact",
        title: "AI Redact",
        blurb:
          "Detect names, emails, phone numbers, addresses, IDs and black them out. Review before exporting; redactions are baked into the output PDF.",
        kind: "ai",
      },
      {
        href: "/tool/remove-metadata",
        title: "Remove metadata",
        blurb:
          "Author, software, history fields only. Doesn't touch document content. Pair with AI Redact when you need both.",
        kind: "free",
      },
    ],
  },
  {
    id: "compare",
    question: "I want to compare two PDFs",
    candidates: [
      {
        href: "/tool/pdf-diff",
        title: "Visual diff (free)",
        blurb:
          "Pixel-level comparison — output highlights where two PDFs differ visually. Use for layout regressions and visual reviews.",
        kind: "free",
      },
      {
        href: "/tool/ai-compare",
        title: "AI Compare (content)",
        blurb:
          "Summarises what CHANGED between two versions — clauses added, numbers shifted, paragraphs rewritten. Use for contract review and document tracking.",
        kind: "ai",
      },
    ],
  },
  {
    id: "annotate",
    question: "I want to annotate, highlight, or draw on a PDF",
    candidates: [
      {
        // 2026-05-12 — corrected: id is free-draw-pdf, not free-draw.
        href: "/tool/free-draw-pdf",
        title: "Free Draw",
        blurb:
          "Pen tool — click and drag to draw freehand on page 1. Multiple strokes, colour and width pickers, undo / clear all.",
        kind: "free",
      },
      {
        // 2026-05-12 — corrected: id is add-text-box, not add-text.
        href: "/tool/add-text-box",
        title: "Add Text",
        blurb:
          "Click on the page to place a text box, type your label, pick font size + colour. Stamps on every page at the same position.",
        kind: "free",
      },
    ],
  },
];

// 2026-05-12 — schema.org FAQPage JSON-LD. Each intent group is a
// natural-language question with one or more candidate tools as the
// answer. Google's structured-data spec accepts this exact shape
// (`@type: "FAQPage"` → `mainEntity: [{ @type: "Question", name,
// acceptedAnswer: { @type: "Answer", text }}, ...]`) and surfaces
// the questions as expandable answer cards in search results when
// the page ranks for a matching long-tail query.
//
// Answer text concatenates the candidate blurbs into a single
// human-readable paragraph. Search engines prefer plain prose to
// HTML lists in FAQ answers — the snippet renderer flattens markup
// anyway, and the spec explicitly warns against marketing copy or
// links in the answer text. Keeping it tool-name + description-only.
const SITE = "https://pdfcraftai.com";
const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${SITE}/compare#faq`,
  mainEntity: INTENTS.map((intent) => ({
    "@type": "Question",
    name: intent.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: intent.candidates
        .map((c) => `${c.title}: ${c.blurb}`)
        .join(" "),
    },
  })),
};

// BreadcrumbList — Home → Find your tool. Mirrors the pattern from
// /blog/[slug] and /alternatives/[competitor]. Helps Google place
// the page in its sitelinks rather than treating it as a standalone
// leaf.
const BREADCRUMB_JSONLD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE },
    {
      "@type": "ListItem",
      position: 2,
      name: "Find your tool",
      item: `${SITE}/compare`,
    },
  ],
};

export default function ComparePage() {
  return (
    <main>
      {/* FAQPage structured data — unlocks expandable answer cards
          in Google search results when the page ranks for a matching
          long-tail query like "how to combine multiple pdfs". */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(BREADCRUMB_JSONLD),
        }}
      />
      <section style={{ paddingTop: 80 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            FIND YOUR TOOL
          </div>
          <h1 className="hero-standard" style={{ marginBottom: 12 }}>
            What do you want to do with your PDF?
          </h1>
          <p
            className="muted"
            style={{
              fontSize: 16,
              maxWidth: 680,
              marginBottom: 40,
              lineHeight: 1.55,
            }}
          >
            A big catalog is a lot to browse. Pick the verb that matches
            what you want, and we'll show one to three tools that solve it.
            Where there's both a free way and an AI way to do it, we list
            both so you can choose.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 40,
            }}
          >
            {INTENTS.map((intent) => (
              <section key={intent.id} id={intent.id}>
                <h2
                  style={{
                    fontSize: 22,
                    letterSpacing: "-0.015em",
                    margin: "0 0 16px",
                  }}
                >
                  {intent.question}
                </h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 12,
                  }}
                >
                  {intent.candidates.map((c) => (
                    <Link
                      key={c.href}
                      href={c.href}
                      className="card card-hover"
                      style={{
                        padding: 18,
                        textDecoration: "none",
                        color: "inherit",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div
                        className="row"
                        style={{
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 15 }}>
                          {c.title}
                        </div>
                        <span
                          className="subtle"
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background:
                              c.kind === "ai"
                                ? "var(--accent-soft)"
                                : "var(--bg-2)",
                            color:
                              c.kind === "ai"
                                ? "var(--accent)"
                                : "var(--fg-subtle)",
                          }}
                        >
                          {c.kind === "ai" ? "AI" : "Free"}
                        </span>
                      </div>
                      <p
                        className="muted"
                        style={{
                          fontSize: 13,
                          margin: 0,
                          lineHeight: 1.5,
                        }}
                      >
                        {c.blurb}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 56,
              padding: "20px 0",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div className="muted" style={{ fontSize: 13 }}>
              Didn't find it? Browse the full catalog.
            </div>
            <Link
              href="/tools"
              className="btn btn-outline btn-sm"
              style={{ textDecoration: "none" }}
            >
              See all 120+ tools →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
