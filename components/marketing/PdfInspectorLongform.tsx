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
            {
              icon: "Receipt" as const,
              title: "Billing & timesheets",
              text: "Print shops, paralegals, and freelancers bill by the page. PDF Inspector gives you the exact number and a one-click copy — no more counting in Acrobat then re-typing into a spreadsheet.",
            },
            {
              icon: "Shield" as const,
              title: "Compliance & audit",
              text: "Quickly verify that a contract submitted by a vendor has the right page count before signing or filing. Mismatched dimensions hint at inserted-after-the-fact pages — a useful tamper signal.",
            },
            {
              icon: "Book" as const,
              title: "Reading & study planning",
              text: "Word count plus reading-time estimate (250 wpm) lets you budget how long a research paper, textbook chapter, or whitepaper will take. Useful before committing to dig in.",
            },
            {
              icon: "File" as const,
              title: "Print prep",
              text: "Mixed page sizes break batch printing — most printers default to one paper size and silently scale the rest. We flag mixed dimensions so you can fix the source PDF before sending it to print.",
            },
            {
              icon: "Sparkle" as const,
              title: "Document handoff",
              text: "When passing a PDF to a colleague, paste the inspector's stats into the email so they know what they're getting before they download. Saves a round-trip.",
            },
            {
              icon: "Search" as const,
              title: "Validation in workflows",
              text: "Quickly check that a generated PDF (from a payroll system, e-signature flow, or report builder) has the expected page count before forwarding. Catches truncation bugs early.",
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
