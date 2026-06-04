// components/marketing/PageCountLongform.tsx
//
// Inspector P11 (2026-04-27): parallel longform component for the
// /tool/page-count runner, matching the structural depth of
// PdfInspectorLongform (Why / How / Different / FAQ / CTA).
//
// Page Count is intentionally a simpler tool than PDF Inspector,
// so the longform is leaner — 5 use-case cards instead of 6, a 3-step
// how-it-works, the same 5-bullet differentiator block as Inspector
// (shared messaging across the brand), 5 FAQs, and a CTA up to
// Inspector for users who realise mid-flow they want richer stats.
//
// What's deliberately omitted vs Inspector:
//   - "PDF health checklist" — that section is about document QA
//     and belongs with the inspector, not the page counter.
// Everything else has a parallel: Page Count gets its own editorial
// surface so /tool/page-count isn't a thin-content runner page.

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
    a: "100 MB. Larger files would risk freezing the browser tab during the parse step. For documents above 100 MB, split the PDF first or count pages with a desktop tool.",
  },
  {
    q: "Does it work on scanned PDFs?",
    a: "Yes — page count works regardless of whether the pages are text or images. The page tree counts pages by structure, not by readable content. If your PDF is scanned and you also need extractable text, run Make PDF Searchable to OCR it.",
  },
  {
    q: "Does it work on encrypted (password-protected) PDFs?",
    a: "We can read the page count of a PDF with permission-only encryption (no open password). If the PDF requires a password to open, you'll need to unlock it first.",
  },
  {
    q: "Why a separate Page Count tool when PDF Inspector also shows the count?",
    a: "Different jobs. Page Count is for users who searched 'page count' and want one number to copy — fastest path. PDF Inspector adds page dimensions, word count, reading time, metadata, and warnings — same engine, much richer answer. Both are free; pick the one that matches your intent.",
  },
];

export function PageCountLongform() {
  return (
    <>
      {/* Use cases */}
      <section style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>
          Why people use Page Count
        </h2>
        <p className="muted" style={{ fontSize: 14, marginTop: 0, marginBottom: 24 }}>
          A page count is one of the most common PDF questions, and
          getting an accurate answer fast saves real time.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {[
            // Build 2 Wave 6 (2026-04-27): differentiated from PDF
            // Inspector. Page Count is the SPEED tool — get a number,
            // copy it, move on. Use cases emphasize quick-answer
            // workflows where waiting for a richer inspector would
            // be friction. PDF Inspector covers the comprehensive-
            // analysis angle separately.
            {
              icon: "Receipt" as const,
              title: "Quick invoicing",
              text: "Print shops, paralegals, and freelancers bill by the page. One drop, copy the number, paste into your invoice tool — under five seconds. No need to open Acrobat.",
            },
            {
              icon: "File" as const,
              title: "Page-limit verification",
              text: "Hard caps from courts, journals, grant applications, employer reviews — '50 pages max' is everywhere. Drop the PDF before you submit, confirm the count fits the rule.",
            },
            {
              icon: "Send" as const,
              title: "Email handoff",
              text: "Paste the page count in the email body so your recipient knows what they're getting before they download. 'Attached: 87-page report' beats 'Attached: report'.",
            },
            {
              icon: "Search" as const,
              title: "Generated-PDF spot-check",
              text: "Payroll systems, CRM exports, e-signature flows produce PDFs that should match an expected count. Drop, count, confirm — catches truncation bugs in seconds.",
            },
            {
              icon: "Book" as const,
              title: "Reading-time triage",
              text: "Got 10 minutes? A 5-page brief works. A 200-page report doesn't. Drop, see the count, decide whether to read now or save for later. Faster than scrolling to the last page.",
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
          How Page Count works
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
              title: "Click Count pages",
              text: "Google PDFium loads in your browser (one-time, ~3.8 MB) and parses the document's page tree.",
            },
            {
              step: "3",
              title: "Copy the number",
              text: "One-click copy. Paste into your invoice, email, or filing system.",
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

      {/* What makes us different — same content as Inspector by design.
          Cross-page consistency reinforces the brand position. */}
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
            ["No watermark, no signup, no daily limit", "Count 1 PDF or 1,000. We don't gate on volume because there's nothing to gate on — the engine runs on your machine."],
            ["One job, done well", "Page Count does one thing: count pages. No upsell to a paid tier, no trial expiry, no feature creep. If you need more, jump to PDF Inspector — same engine, richer answer."],
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

      {/* CTA — upgrade path to PDF Inspector */}
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
            Need more than just a count?
          </h3>
          <p className="muted" style={{ fontSize: 14, marginTop: 8, marginBottom: 16 }}>
            PDF Inspector adds page dimensions, word count, reading
            time, metadata, and mixed-size warnings — same single
            PDFium parse, in your browser.
          </p>
          <Link href="/tool/pdf-inspector" className="btn btn-outline">
            Try PDF Inspector <I.ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </>
  );
}

/**
 * Re-export the FAQ array so the FAQPage JSON-LD generator in
 * app/tool/[id]/page.tsx can consume the same source-of-truth.
 * Mirrors the PDF_INSPECTOR_FAQ pattern.
 */
export const PAGE_COUNT_FAQ = FAQ;
