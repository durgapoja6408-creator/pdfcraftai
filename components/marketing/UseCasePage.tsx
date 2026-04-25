// SEO Ship #4 (2026-04-25): use-case landing page renderer.
// Hero → numbered workflow steps → why it matters → pitfalls → tips →
// related use cases → FAQ → CTA. Emits HowTo + FAQPage + Article JSON-LD.

import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { FaqItem } from "@/components/marketing/FaqItem";
import { toolById } from "@/lib/tools";
import type { UseCaseData } from "@/lib/use-cases";
import { USE_CASES } from "@/lib/use-cases";

const SITE = "https://pdfcraftai.com";

export function UseCasePage({ data }: { data: UseCaseData }) {
  const pageUrl = `${SITE}/use-cases/${data.slug}`;

  // ----- JSON-LD --------------------------------------------------
  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: data.h1,
    description: data.sub,
    totalTime: data.totalTime,
    audience: { "@type": "Audience", audienceType: data.audience },
    step: data.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.detail,
      url: `${pageUrl}#step-${i + 1}`,
    })),
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: data.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      { "@type": "ListItem", position: 2, name: "Use cases", item: `${SITE}/use-cases` },
      { "@type": "ListItem", position: 3, name: data.h1, item: pageUrl },
    ],
  };
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: data.h1,
    description: data.sub,
    author: { "@type": "Organization", name: "pdfcraft ai", url: SITE },
    publisher: {
      "@type": "Organization",
      name: "pdfcraft ai",
      url: SITE,
      logo: { "@type": "ImageObject", url: `${SITE}/icon.svg` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
    datePublished: "2026-04-25",
    dateModified: "2026-04-25",
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />

      {/* Hero */}
      <section style={{ paddingTop: 80, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.3 }} className="grid-bg" />
        <div className="container-x" style={{ padding: "0 28px", position: "relative", maxWidth: 880 }}>
          <div
            className="row"
            style={{
              gap: 8,
              padding: "6px 12px",
              borderRadius: 999,
              background: "var(--blue-soft)",
              color: "var(--blue)",
              display: "inline-flex",
              fontSize: 12,
              fontWeight: 500,
              marginBottom: 20,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
            Use case · {data.totalTime}
          </div>
          <h1 style={{ fontSize: 48, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 20 }}>
            {data.h1}
          </h1>
          <p className="muted" style={{ fontSize: 18, lineHeight: 1.55, marginBottom: 28 }}>
            {data.sub}
          </p>
          <div className="muted" style={{ fontSize: 14, marginBottom: 24 }}>
            <strong>For:</strong> {data.audience}
          </div>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <Link href={`/tool/${data.steps[0]?.tool}`} className="btn btn-lg btn-primary">
              Start with step 1 <I.ArrowRight size={16} />
            </Link>
            <Link href="/tools" className="btn btn-lg btn-ghost">
              Browse all tools
            </Link>
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section style={{ padding: "80px 0", background: "var(--bg-1)", marginTop: 80 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 880 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            STEP BY STEP
          </div>
          <h2 style={{ fontSize: 32, letterSpacing: "-0.02em", marginBottom: 32 }}>The workflow</h2>
          <div style={{ display: "grid", gap: 16 }}>
            {data.steps.map((step, i) => {
              const tool = toolById(step.tool);
              const Ic = tool ? I[tool.icon] : I.ArrowRight;
              return (
                <div
                  key={i}
                  id={`step-${i + 1}`}
                  className="card"
                  style={{ padding: 24, display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 20, alignItems: "center" }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      background: "var(--accent)",
                      color: "white",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 600,
                      fontSize: 16,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 6 }}>{step.title}</div>
                    <div className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
                      {step.detail}
                    </div>
                  </div>
                  {tool && (
                    <Link
                      href={`/tool/${step.tool}`}
                      className="btn btn-ghost"
                      style={{ flexShrink: 0 }}
                    >
                      <Ic size={14} /> Open {tool.name}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why it matters */}
      <section style={{ padding: "80px 0" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 760 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            WHY IT MATTERS
          </div>
          <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", marginBottom: 16 }}>
            The case for doing this
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.7 }}>{data.whyItMatters}</p>
        </div>
      </section>

      {/* Pitfalls */}
      <section style={{ padding: "60px 0", background: "var(--bg-1)" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 880 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            COMMON MISTAKES
          </div>
          <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", marginBottom: 24 }}>
            What to avoid
          </h2>
          <div style={{ display: "grid", gap: 16 }}>
            {data.pitfalls.map((p, i) => (
              <div key={i} className="card" style={{ padding: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>{p.title}</div>
                <div className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
                  {p.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tips */}
      <section style={{ padding: "60px 0" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 880 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            TIPS FOR THE BEST RESULTS
          </div>
          <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", marginBottom: 24 }}>
            What works
          </h2>
          <div style={{ display: "grid", gap: 16 }}>
            {data.tips.map((t, i) => (
              <div key={i} className="card" style={{ padding: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>{t.title}</div>
                <div className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
                  {t.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Related use cases */}
      {data.related.length > 0 && (
        <section style={{ padding: "60px 0", background: "var(--bg-1)" }}>
          <div className="container-x" style={{ padding: "0 28px", maxWidth: 1080 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              RELATED WORKFLOWS
            </div>
            <h2 style={{ fontSize: 28, marginBottom: 24 }}>
              Other jobs people do with pdfcraft ai
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 12,
              }}
            >
              {data.related.map((slug) => {
                const r = USE_CASES[slug];
                if (!r) return null;
                return (
                  <Link
                    key={slug}
                    href={`/use-cases/${slug}`}
                    className="card card-hover"
                    style={{ padding: 20 }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
                      {r.h1}
                    </div>
                    <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                      {r.sub}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section style={{ padding: "80px 0" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 780 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            FAQ
          </div>
          <h2 style={{ fontSize: 32, marginBottom: 24 }}>Questions about this workflow</h2>
          <div>
            {data.faq.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ padding: "80px 0 120px" }}>
        <div className="container-x" style={{ padding: "0 28px", textAlign: "center", maxWidth: 640 }}>
          <h2 style={{ fontSize: 36, letterSpacing: "-0.02em", marginBottom: 12 }}>
            Try the workflow on a real PDF
          </h2>
          <p className="muted" style={{ fontSize: 16, marginBottom: 28 }}>
            Free tools run in your browser. No signup, no watermarks.
          </p>
          <Link
            href={`/tool/${data.steps[0]?.tool}`}
            className="btn btn-lg btn-primary"
          >
            Start with step 1 <I.ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}
