// components/marketing/PdfInspectorLongform.tsx
//
// Longform on-page content for the PDF Inspector (route /tool/page-count).
// Inspector P1 SEO bundle (2026-04-27): adds ~800 words of crawlable
// content + visible FAQ + use-case section. Pairs with the
// FAQPage / SoftwareApplication / BreadcrumbList / HowTo JSON-LD
// emitted from app/tool/[id]/page.tsx.
//
// Why this is a separate component, not inline in [id]/page.tsx:
//   - Per-tool longform may diverge by tool (PDF Inspector wants
//     different copy than, say, ai-summarize)
//   - Keeps the runner page focused on the runtime, not marketing
//   - Component composition makes A/B testing and per-tool overrides
//     straightforward
//
// Future tools that get bespoke longform get a sibling component
// next to this one. Generic longform fallback can ride on
// lib/seo-pages.ts for tools without a custom component.

import Link from "next/link";
import { I } from "@/components/icons/Icons";

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "How accurate is the page count?",
    a: "Exact. PDFium parses the document's page tree directly, the same way Adobe Acrobat and Chrome's PDF viewer do. The number you see matches what your PDF reader shows.",
  },
  {
    q: "Is my PDF uploaded anywhere?",
    a: "No. Everything happens inside your browser using Google's PDFium engine compiled to WebAssembly. The file never touches our servers — there is no upload step. You can verify this in your browser's Network tab while running the tool.",
  },
  {
    q: "What's the file size limit?",
    a: "100 MB. Larger files would risk freezing the browser tab during PDFium's parse step. For documents above 100 MB, split the PDF first (coming soon) or use the desktop pdf-lib CLI.",
  },
  {
    q: "Why does the word count show an asterisk for some PDFs?",
    a: "For documents over 100 pages, the word count is an estimate — we sample the first 20 and last 5 pages, average the words-per-page, and extrapolate. The asterisk and 'approx (sampled)' label flag this. For ≤100-page PDFs, every page is counted exactly.",
  },
  {
    q: "What does 'mixed page sizes' mean?",
    a: "We sample several pages and check if they share the same dimensions. If your PDF has, say, mostly Letter pages with a couple of Legal-sized inserts, we flag this — it usually trips up batch printing because most printers default to one paper size and silently scale or crop the mismatched pages.",
  },
  {
    q: "Why are the dimensions in inches?",
    a: "Most printers and document workflows in the US/UK use inches. Multiply by 25.4 for millimeters, or by 72 for PDF points (the unit PDFium uses internally). A4 portrait is 8.27 × 11.69 in / 595 × 842 pt.",
  },
  {
    q: "Can I count pages across multiple PDFs at once?",
    a: "Not yet — batch mode is on the roadmap (Inspector P2). For now, drop each PDF separately. If you need to count 50+ files for an invoice or audit, contact support — we can prioritize the batch upgrade.",
  },
  {
    q: "Does this work on encrypted (password-protected) PDFs?",
    a: "We can read the page count of a PDF with permission-only encryption (no open password). If the PDF requires a password to open, you'll need to unlock it first — Unlock PDF tool returning soon.",
  },
  {
    q: "What metadata can you see?",
    a: "PDFs carry an Info dictionary with up to eight fields: Title, Author, Subject, Keywords, Creator (the app that produced the source — Word, InDesign, etc.), Producer (the PDF library that wrote the file), CreationDate, and ModDate. The inspector parses whichever of these are populated. Modern producers also embed an XMP metadata stream (RDF/XML); we don't surface that yet.",
  },
  {
    q: "Why is some metadata missing for my PDF?",
    a: "Three common reasons. (1) The PDF was scrubbed — privacy-conscious workflows strip Info before sharing. (2) The PDF uses cross-reference streams (PDF 1.5+) that compress object locations in a way our byte parser can't follow. (3) The PDF is encrypted — we read the encryption flag but can't decrypt the Info dict. In all three, the inspector still shows pages, dimensions, word count, and reading time.",
  },
  {
    q: "Should I remove metadata before sharing a PDF?",
    a: "Often yes — Author, Creator, and dates can leak who made the file and when, which matters for redacted documents, anonymous submissions, or compliance workflows. The metadata you see in the inspector is the same metadata Acrobat or Preview would show. A dedicated remove-metadata tool is on the roadmap.",
  },
];

export function PdfInspectorLongform() {
  return (
    <>
      {/* Use cases */}
      <section style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>
          Why people use PDF Inspector
        </h2>
        <p className="muted" style={{ fontSize: 14, marginTop: 0, marginBottom: 24 }}>
          A page count looks simple, but the document around it tells you a
          lot about what to do next. PDF Inspector packs everything you
          actually need from a free PDF info viewer into one screen.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {[
            // Build 2 Wave 6 (2026-04-27): differentiated from Page
            // Count. PDF Inspector is the COMPREHENSIVE-ANALYSIS
            // tool — multi-stat audit of an entire document. Use
            // cases emphasize whole-document forensics, not single-
            // fact lookups. Page Count handles the quick-answer
            // workflows separately.
            {
              icon: "Shield" as const,
              title: "Pre-print quality audit",
              text: "Before sending a PDF to print: are all pages the same size? Are the fonts embedded? Is the file size reasonable? One drop, every check at once. Catches failures BEFORE they cost reprint money.",
            },
            {
              icon: "Search" as const,
              title: "Forensic / tamper review",
              text: "Mismatched page sizes hint at exhibits inserted after signing. Metadata reveals authoring software and timestamps. Hybrid scan/text detection catches partial OCR. All the signals investigators look for.",
            },
            {
              icon: "Eye" as const,
              title: "Document health check",
              text: "Is this PDF healthy? Searchable text, consistent dimensions, embedded fonts, clean metadata, modern PDF version, reasonable file size, appropriate encryption posture — six dimensions, scored at a glance.",
            },
            {
              icon: "Edit" as const,
              title: "Pre-publish QA",
              text: "Before publishing a PDF whitepaper, brochure, or annual report: scrub PII from metadata, verify all pages match the master template, confirm fonts are embedded for archive compliance.",
            },
            {
              icon: "Convert" as const,
              title: "Ingest pipeline validation",
              text: "Drop a PDF before feeding it into a downstream pipeline (translation, summarization, archival). Detect scans needing OCR, hybrid pages with partial text, encryption blocking access — fail fast with clear signals.",
            },
            {
              icon: "Receipt" as const,
              title: "JSON export for batch audits",
              text: "Auditors processing 50 PDFs can drop each, download the JSON, and feed into a spreadsheet or pipeline. Schema-stable output means your tooling keeps working as we add fields.",
            },
          ].map((c) => {
            const Ic = (I as Record<string, React.FC<{ size?: number }>>)[c.icon] ?? I.Sparkle;
            return (
              <div
                key={c.title}
                className="card"
                style={{ padding: 16, background: "var(--bg-1)" }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    display: "grid",
                    placeItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Ic size={14} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  {c.title}
                </div>
                <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                  {c.text}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>
          How PDF Inspector works
        </h2>
        <p className="muted" style={{ fontSize: 14, marginTop: 0, marginBottom: 24 }}>
          Three steps, no signup, no uploads.
        </p>
        <ol
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            paddingLeft: 0,
            margin: 0,
            listStyle: "none",
          }}
        >
          {[
            {
              step: "1",
              title: "Drop your PDF",
              text: "Drag & drop or click to select. Files up to 100 MB.",
            },
            {
              step: "2",
              title: "Click Inspect",
              text: "Google PDFium loads in your browser (one-time, ~3.8 MB) and parses the document.",
            },
            {
              step: "3",
              title: "Copy or move on",
              text: "Get page count, file size, dimensions, word count, and reading time. Copy the number or jump to a related tool.",
            },
          ].map((s) => (
            <li
              key={s.step}
              className="card"
              style={{ padding: 16, background: "var(--bg-1)" }}
            >
              <div
                className="mono subtle"
                style={{ fontSize: 11, marginBottom: 6, letterSpacing: "0.05em" }}
              >
                STEP {s.step}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                {s.title}
              </div>
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                {s.text}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* What makes us different */}
      <section style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 16px" }}>
          What makes pdfcraft ai different
        </h2>
        <ul
          style={{
            paddingLeft: 0,
            margin: 0,
            listStyle: "none",
            display: "grid",
            gap: 12,
          }}
        >
          {[
            ["Same engine Chrome uses", "PDFium is Google's PDF engine — the one that powers Chrome's built-in PDF viewer. We compile it to WebAssembly so it runs in your browser at near-native speed."],
            ["100% local processing", "Most free PDF tools upload your file to a server, process it, and stream the result back. We don't. Your file lives in your browser tab and never touches our infrastructure. Verifiable in your browser's Network panel."],
            ["No watermark, no signup, no daily limit", "Inspect 1 PDF or 1,000. We don't gate on volume because there's nothing to gate on — the engine runs on your machine."],
            ["Beyond just page count", "iLovePDF and Smallpdf show you a number. We show you size, dimensions, word count, reading time, and flag mixed-orientation issues — same single PDF parse, much more value."],
            ["Open standards, free engines", "PDFium is BSD/Apache licensed (free for any use). We don't pay vendor license fees and pass that savings on to you (and to ourselves) as a free, ad-supported tool with no upgrade-to-pro pressure."],
          ].map(([title, body]) => (
            <li
              key={title}
              className="row"
              style={{ gap: 12, alignItems: "flex-start" }}
            >
              <span
                style={{
                  color: "var(--accent)",
                  marginTop: 2,
                  flexShrink: 0,
                }}
              >
                <I.Check size={16} />
              </span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
                <div className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginTop: 2 }}>
                  {body}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* PDF health checklist — Inspector P9 (2026-04-27).
          Educational section that ties the inspector's outputs back
          to a "healthy PDF" framework. Targets a different search
          intent ("is my PDF correct/healthy/QC-passing?") than the
          existing longform sections cover. Each item maps to
          something the Inspector actually surfaces, so it's not just
          generic advice — it's "here's what to check, here's what
          we'll tell you about it."

          Why this is here, not as a separate page: it's only ~250
          words and works best alongside the Inspector itself —
          users read it AFTER seeing their result and learn what to
          act on. Standalone, it'd be thin content. */}
      <section style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>
          PDF health checklist — what makes a PDF actually healthy?
        </h2>
        <p className="muted" style={{ fontSize: 14, marginTop: 0, marginBottom: 24 }}>
          A "healthy" PDF prints cleanly, lets readers search and copy
          text, doesn&apos;t leak metadata, and opens reliably across
          viewers. Here&apos;s what to check, and what PDF Inspector
          flags for you.
        </p>

        <ul
          style={{
            paddingLeft: 0,
            margin: 0,
            listStyle: "none",
            display: "grid",
            gap: 14,
          }}
        >
          {[
            {
              t: "Searchable text on every page",
              b: "Image-only pages (typical of scans) make Ctrl-F useless and break copy-paste, summaries, and translation. Even a single scanned page in an otherwise digital PDF can sink a downstream workflow.",
              s: "Inspector flags fully-scanned PDFs (“Looks like a scanned PDF”) and hybrid PDFs where some pages are scanned (“N of M pages have extractable text”), with a one-click CTA to make the PDF searchable.",
            },
            {
              t: "Consistent page size and orientation",
              b: "Mixed page sizes break batch printing — most printers default to one paper size and silently scale or crop the rest. Mixed orientation messes up two-up reading and ePaper devices.",
              s: "Inspector confirms when all pages share dimensions (“✓ All pages share the same size and orientation”) and warns when they don’t.",
            },
            {
              t: "Clean, accurate metadata",
              b: "Title, Author, and Creator can leak who made the file and when. That matters for redacted documents, anonymous submissions, and compliance workflows. Conversely, missing metadata makes documents harder to search in DMS tools.",
              s: "Inspector parses the full Info dictionary (Title, Author, Subject, Keywords, Creator, Producer, CreationDate, ModDate) so you can audit before sharing.",
            },
            {
              t: "Modern PDF version",
              b: "PDF 1.4 (Acrobat 5, c. 2001) is still legal but lacks features modern viewers expect. PDF 1.7 (ISO 32000-1) is the current baseline. PDF 2.0 (ISO 32000-2) is the future. Older versions can fail in newer viewers and miss security improvements.",
              s: "Inspector shows the PDF version as a chip in the metadata block.",
            },
            {
              t: "Reasonable file size",
              b: "Bloat usually comes from unoptimized embedded images. A 50-page text-only PDF should be under 1 MB; 50 pages with one image per page might run 5–10 MB. Anything dramatically larger means images aren’t being compressed.",
              s: "Inspector shows the file size so you can spot outliers; pair it with a Compress PDF tool when needed.",
            },
            {
              t: "Appropriate encryption posture",
              b: "Permission-only encryption (“you can read it but not print”) is fine for share-restricted documents. Open-password encryption blocks readers entirely, including search engines and accessibility tools, so use it sparingly.",
              s: "Inspector surfaces an “Encrypted” badge in the metadata block when an /Encrypt entry is present.",
            },
          ].map((item) => (
            <li
              key={item.t}
              className="row"
              style={{ gap: 12, alignItems: "flex-start" }}
            >
              <span
                style={{
                  color: "var(--accent)",
                  marginTop: 2,
                  flexShrink: 0,
                }}
              >
                <I.Check size={16} />
              </span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{item.t}</div>
                <div
                  className="muted"
                  style={{ fontSize: 13, lineHeight: 1.55, marginTop: 2 }}
                >
                  {item.b}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.5,
                    marginTop: 6,
                    color: "var(--accent)",
                    fontStyle: "italic",
                  }}
                >
                  {item.s}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 16px" }}>
          Frequently asked questions
        </h2>
        <div style={{ display: "grid", gap: 8 }}>
          {FAQ.map((f) => (
            <details
              key={f.q}
              className="card"
              style={{ padding: 0, background: "var(--bg-1)" }}
            >
              <summary
                style={{
                  padding: "14px 16px",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: 14,
                  listStyle: "none",
                }}
              >
                {f.q}
              </summary>
              <div
                className="muted"
                style={{
                  padding: "0 16px 14px",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {f.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Soft CTA to next step */}
      <section style={{ marginTop: 48 }}>
        <div
          className="card"
          style={{
            padding: 24,
            textAlign: "center",
            background: "var(--bg-1)",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            Need more than a page count?
          </h3>
          <p className="muted" style={{ fontSize: 14, marginTop: 8, marginBottom: 16 }}>
            PDF Inspector is one of {">"}50 tools on pdfcraft ai. Most are
            free, all are private.
          </p>
          <Link href="/tools" className="btn btn-outline">
            Browse all tools <I.ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </>
  );
}

/**
 * Re-export the FAQ array so the JSON-LD generator in
 * app/tool/[id]/page.tsx can consume the same source-of-truth.
 * Avoids duplicate FAQ definitions drifting between schema and UI.
 */
export const PDF_INSPECTOR_FAQ = FAQ;
