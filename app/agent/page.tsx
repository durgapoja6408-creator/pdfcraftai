import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { I } from "@/components/icons/Icons";

export const metadata: Metadata = {
  title: "Agent Mode — describe the outcome, skip the steps",
  description:
    "Agent Mode plans and runs multi-tool PDF workflows from a single prompt. OCR → categorize → redact → summarize → send, with visible cost and an audit trail.",
  openGraph: {
    title: "Agent Mode · pdfcraft ai",
    description:
      "Describe the outcome. Agent plans the steps, shows the cost, and runs it end-to-end.",
  },
  alternates: { canonical: "/agent" },
};

const USE_CASES: Array<{ icon: keyof typeof I; title: string; body: string; credits: string }> = [
  {
    icon: "Scan",
    title: "Expense report from 30 receipts",
    body: "Drop a folder. Agent OCRs, extracts vendor/date/total, categorizes, and drafts an 18-page expense report with a one-click CSV export.",
    credits: "~50 credits",
  },
  {
    icon: "Shield",
    title: "Redact a 200-page deposition",
    body: "Agent finds every name, address, DOB and account number, redacts them, logs what it changed, and hands you a reviewable diff before publishing.",
    credits: "~120 credits",
  },
  {
    icon: "Translate",
    title: "Translate a contract set for review",
    body: "Point Agent at a folder of PDFs in five languages. It detects, translates, preserves layout, and pairs each page side-by-side with the original.",
    credits: "~80 credits",
  },
  {
    icon: "Flow",
    title: "Reconcile a vendor invoice bundle",
    body: "Agent extracts line items, compares against the PO, flags mismatches over $25, and drops a reconciliation sheet into your Files.",
    credits: "~60 credits",
  },
];

const HOW: Array<{ step: string; title: string; body: string }> = [
  {
    step: "01",
    title: "Describe the outcome",
    body: "Use plain English. No macros to record, no scripts to write — just say what you want the finished document set to look like.",
  },
  {
    step: "02",
    title: "Review the plan",
    body: "Agent shows you the exact tool chain it will run, an itemized credit estimate, and any irreversible steps (share, send, delete) before it starts.",
  },
  {
    step: "03",
    title: "Run with a full audit trail",
    body: "Every tool call, input, output, and token count is logged. Re-run the same plan next month or export it as a reusable Macro.",
  },
];

export default function AgentPage() {
  return (
    <>
      <MarketingHero
        chip={{ label: "NEW", tone: "new" }}
        eyebrow="AGENT MODE"
        title={
          <>
            Describe the outcome.
            <br />
            <span style={{ color: "var(--accent)" }}>Skip the steps.</span>
          </>
        }
        subtitle="Type what you need in plain English. Agent plans a multi-tool workflow, shows the cost before it runs, and produces auditable output — from OCR to redact to translate to send."
        primaryCta={{ href: "/register", label: "Start for free" }}
        secondaryCta={{ href: "/pricing", label: "See pricing" }}
      />

      {/* Use cases */}
      <section style={{ padding: "80px 28px", borderTop: "1px solid var(--border)" }}>
        <div className="container-x">
          <div style={{ maxWidth: 640, marginBottom: 40 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              WHAT PEOPLE RUN ON DAY ONE
            </div>
            <h2 style={{ fontSize: 36, letterSpacing: "-0.02em", margin: 0 }}>
              One prompt. Dozens of tool calls. A clean deliverable.
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 18,
            }}
          >
            {USE_CASES.map((u) => {
              const Ic = I[u.icon];
              return (
                <article key={u.title} className="card" style={{ padding: 24 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      display: "grid",
                      placeItems: "center",
                      marginBottom: 14,
                    }}
                  >
                    <Ic size={18} />
                  </div>
                  <h3 style={{ fontSize: 17, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
                    {u.title}
                  </h3>
                  <p
                    className="muted"
                    style={{ fontSize: 14, lineHeight: 1.55, margin: "0 0 14px" }}
                  >
                    {u.body}
                  </p>
                  <span className="chip chip-ai">
                    <I.Coin size={10} /> {u.credits}
                  </span>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        style={{
          padding: "80px 28px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-1)",
        }}
      >
        <div className="container-x">
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              HOW AGENT WORKS
            </div>
            <h2 style={{ fontSize: 36, letterSpacing: "-0.02em", margin: 0 }}>
              Plan, price, run, audit.
            </h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 24,
            }}
          >
            {HOW.map((h) => (
              <div key={h.step}>
                <div
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: "var(--accent)",
                    letterSpacing: "0.1em",
                    marginBottom: 10,
                  }}
                >
                  {h.step}
                </div>
                <h3 style={{ fontSize: 18, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
                  {h.title}
                </h3>
                <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                  {h.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ padding: "80px 28px", textAlign: "center" }}>
        <div className="container-narrow">
          <h2 style={{ fontSize: 36, letterSpacing: "-0.02em", margin: "0 0 12px" }}>
            Ready to stop clicking through tools?
          </h2>
          <p className="muted" style={{ fontSize: 16, marginBottom: 24 }}>
            25 AI credits on signup. Free tools stay free forever.
          </p>
          <div className="row" style={{ justifyContent: "center", gap: 12 }}>
            <Link href="/register" className="btn btn-lg btn-accent">
              Start for free <I.ArrowRight size={16} />
            </Link>
            <Link href="/macros" className="btn btn-lg btn-outline">
              Or explore Macros
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
