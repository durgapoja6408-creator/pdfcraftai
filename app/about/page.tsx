import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { I } from "@/components/icons/Icons";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "About pdfcraft ai",
  description:
    "Why we built pdfcraft ai: every PDF tool you need in one place, free forever for the basics, pay-as-you-go for AI.",
  canonical: "/about",
});

const VALUES: Array<{ icon: keyof typeof I; title: string; body: string }> = [
  {
    icon: "Shield",
    title: "Privacy is not a tier",
    body: "Files auto-delete in 60 minutes. We don't train on your documents. There's no upsell to a &quot;privacy plan&quot; — everyone gets the same protection.",
  },
  {
    icon: "Coin",
    title: "Free should mean free",
    body: "Merge, split, convert, and compress are free forever — no watermarks, no daily caps, no credit card. AI features cost credits, not a subscription.",
  },
  {
    icon: "Zap",
    title: "Built for people who work in PDFs",
    body: "The defaults match what legal, ops, and finance teams actually want. No &quot;upgrade to export&quot; traps.",
  },
];

export default function AboutPage() {
  return (
    <>
      <MarketingHero
        eyebrow="ABOUT"
        title={
          <>
            We think PDF tools should{" "}
            <span style={{ color: "var(--accent)" }}>feel like 2026.</span>
          </>
        }
        subtitle="pdfcraft ai is a small team shipping the PDF toolbox we always wanted — private by default, free where it should be free, and AI-powered where AI actually helps."
        primaryCta={{ href: "/register", label: "Try it free" }}
        secondaryCta={{ href: "/contact", label: "Get in touch" }}
      />

      <section style={{ padding: "80px 28px", borderTop: "1px solid var(--border)" }}>
        <div className="container-narrow">
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            WHY WE BUILT THIS
          </div>
          <h2 style={{ fontSize: 32, letterSpacing: "-0.02em", marginTop: 0 }}>
            Every other PDF site hides the free tools behind a paywall.
          </h2>
          <div
            style={{
              display: "grid",
              gap: 16,
              fontSize: 16,
              lineHeight: 1.7,
              color: "var(--fg-muted)",
            }}
          >
            <p>
              We kept hitting the same wall: upload a PDF to merge two pages, get redirected to a
              pricing page with a &quot;Download as watermarked PDF&quot; button. Or an OCR tool that
              silently trains on your invoice.
            </p>
            <p>
              pdfcraft ai flips that. The eight free tools — merge, split, compress, rotate, page
              numbers, watermark, JPG↔PDF — stay free forever with no account required. AI features
              (chat, summarize, translate, OCR, redact) cost credits, not a monthly subscription.
            </p>
            <p>
              We&apos;re building Agent and Macros on top so the tools fade into the background and
              the outcome is what you ask for.
            </p>
          </div>
        </div>
      </section>

      <section
        style={{
          padding: "80px 28px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-1)",
        }}
      >
        <div className="container-x">
          <div style={{ maxWidth: 640, marginBottom: 32 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              WHAT WE OPTIMIZE FOR
            </div>
            <h2 style={{ fontSize: 32, letterSpacing: "-0.02em", margin: 0 }}>
              Three values that drive every decision.
            </h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 18,
            }}
          >
            {VALUES.map((v) => {
              const Ic = I[v.icon as keyof typeof I] ?? I.Check;
              return (
                <article key={v.title} className="card" style={{ padding: 24 }}>
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
                    {v.title}
                  </h3>
                  <p
                    className="muted"
                    style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}
                    dangerouslySetInnerHTML={{ __html: v.body }}
                  />
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ padding: "80px 28px", textAlign: "center" }}>
        <div className="container-narrow">
          <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 10px" }}>
            Want to talk?
          </h2>
          <p className="muted" style={{ fontSize: 15, marginBottom: 22 }}>
            Questions, partnerships, or bugs — we read everything.
          </p>
          <div className="row" style={{ justifyContent: "center", gap: 12 }}>
            <Link href="/contact" className="btn btn-lg btn-accent">
              Contact the team <I.ArrowRight size={16} />
            </Link>
            <Link href="/help" className="btn btn-lg btn-outline">
              Help center
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
