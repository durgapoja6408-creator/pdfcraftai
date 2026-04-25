import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { FaqItem } from "@/components/marketing/FaqItem";
import { toolById, TOOL_STATS } from "@/lib/tools";
import type { SeoPageData } from "@/lib/seo-pages";

export function SeoLandingPage({ data }: { data: SeoPageData }) {
  const tool = toolById(data.tool);
  if (!tool) return null;
  const Ic = I[tool.icon];

  const firstWord = tool.name.split(" ")[0].toLowerCase();

  // ---------- JSON-LD structured data (Task #72) -------------------
  //
  // Two schemas per landing — both eligible for rich results in
  // Google SERPs and both directly built from data we already carry:
  //
  //   1. HowTo  — the 3-step howTo[] array maps 1:1 onto schema.org
  //      HowToStep entries. When Google grants the rich result, the
  //      step list shows directly under our title in search.
  //   2. FAQPage — the faq[] array maps onto schema.org Question /
  //      Answer entries. Eligible for the "People also ask" treatment
  //      and an expandable FAQ block under our SERP entry.
  //
  // We also include a SoftwareApplication object so the tool itself
  // gets identified as software (offer field uses Free vs Paid based
  // on tool.free). Helps Google classify the page beyond a generic
  // article.
  //
  // All emitted via <script type="application/ld+json"> blocks at the
  // top of <main> — Google's structured-data parser reads from any
  // depth in the body, but rendering near the top keeps them above
  // the fold of the parser pass.
  const SITE = "https://pdfcraftai.com";
  const pageUrl = `${SITE}${data.canonical}`;
  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: data.h1,
    description: data.sub,
    totalTime: "PT2M", // ~2-min ballpark for any of these tools
    step: data.howTo.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.t,
      text: s.d,
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
  const appLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: data.h1,
    description: data.sub,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: pageUrl,
    offers: tool.free
      ? { "@type": "Offer", price: "0", priceCurrency: "USD" }
      : { "@type": "Offer", priceCurrency: "USD", description: tool.cost },
    publisher: { "@type": "Organization", name: "pdfcraft ai", url: SITE },
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }}
      />
      {/* ===== Hero ===== */}
      <section style={{ paddingTop: 80, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.3 }} className="grid-bg" />
        <div
          className="container-x"
          style={{ padding: "0 28px", position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 48 }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) minmax(0,420px)",
              gap: 48,
              alignItems: "center",
            }}
            className="seo-hero-grid"
          >
            {/* Left copy */}
            <div>
              <div
                className="row"
                style={{
                  gap: 8,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: tool.free ? "var(--blue-soft)" : "var(--accent-soft)",
                  color: tool.free ? "var(--blue)" : "var(--accent)",
                  display: "inline-flex",
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 20,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "currentColor",
                  }}
                />
                {tool.free ? "Free forever · no signup" : "AI · pay only for what you use"}
              </div>
              <h1 style={{ fontSize: 56, letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 20 }}>
                {data.h1}
              </h1>
              <p className="muted" style={{ fontSize: 18, lineHeight: 1.55, marginBottom: 28 }}>
                {data.sub}
              </p>
              <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                <Link href={`/tool/${tool.id}`} className="btn btn-lg btn-primary">
                  <Ic size={16} /> Open {tool.name} <I.ArrowRight size={16} />
                </Link>
                <a href="#how-it-works" className="btn btn-lg btn-ghost">
                  How it works
                </a>
              </div>
              <div
                className="row"
                style={{
                  gap: 24,
                  color: "var(--fg-subtle)",
                  fontSize: 13,
                  flexWrap: "wrap",
                }}
              >
                <span className="row" style={{ gap: 6 }}>
                  <I.Check size={14} /> No watermarks
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <I.Check size={14} /> No signup
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <I.Check size={14} /> Files deleted in 60 min
                </span>
              </div>
            </div>

            {/* Right inline drop card */}
            <div
              className="card"
              style={{
                padding: 32,
                textAlign: "center",
                borderStyle: "dashed",
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 10,
                  background: tool.free ? "var(--blue-soft)" : "var(--accent-soft)",
                  color: tool.free ? "var(--blue)" : "var(--accent)",
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto 16px",
                }}
              >
                <Ic size={24} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>Drop your PDF here</div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 20 }}>
                or choose a file
              </div>
              <Link href={`/tool/${tool.id}`} className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                Choose file
              </Link>
              <div
                className="mono subtle"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  marginTop: 16,
                }}
              >
                {tool.free ? "FREE · UNLIMITED · NO LIMITS" : tool.cost?.toUpperCase()}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section id="how-it-works" style={{ padding: "80px 0", background: "var(--bg-1)", marginTop: 80 }}>
        <div className="container-x" style={{ padding: "0 28px", textAlign: "center" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            HOW IT WORKS
          </div>
          <h2 style={{ fontSize: 36, marginBottom: 48 }}>Three steps. No surprises.</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
              textAlign: "left",
            }}
          >
            {data.howTo.map((step, i) => (
              <div key={i} className="card" style={{ padding: 24 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 16,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>{step.t}</div>
                <div className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>
                  {step.d}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Why pdfcraft ai ===== */}
      <section style={{ padding: "80px 0" }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            WHY PDFCRAFT AI
          </div>
          <h2 style={{ fontSize: 32, maxWidth: 560, marginBottom: 32 }}>
            Not just {tool.name.toLowerCase()}. A whole PDF stack.
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
            }}
          >
            <WhyCard
              icon="Menu"
              title={`${TOOL_STATS.total} tools`}
              body={`Every PDF task in one place. ${TOOL_STATS.free} free forever, ${TOOL_STATS.ai} AI.`}
            />
            <WhyCard icon="Flow" title="Macros" body="Chain steps. Schedule them. Never do the same job twice." />
            <WhyCard icon="Code" title="API + SDKs" body="TypeScript, Python, Go, Ruby, PHP. Batch endpoint for scale." />
            <WhyCard icon="Shield" title="Secure by default" body="Encrypted in transit and at rest. 60-min auto-delete. Zero-retention AI." />
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section style={{ padding: "80px 0", background: "var(--bg-1)" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 780 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            FAQ
          </div>
          <h2 style={{ fontSize: 32, marginBottom: 24 }}>Questions people actually ask.</h2>
          <div>
            {data.faq.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      </section>

      {/* ===== Related tools ===== */}
      <section style={{ padding: "80px 0" }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            RELATED TOOLS
          </div>
          <h2 style={{ fontSize: 28, marginBottom: 24 }}>What people do next.</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {data.related.map((id) => {
              const t = toolById(id);
              if (!t) return null;
              const TIc = I[t.icon];
              return (
                <Link key={id} href={`/tool/${id}`} className="card card-hover" style={{ padding: 18 }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: t.free ? "var(--blue-soft)" : "var(--accent-soft)",
                        color: t.free ? "var(--blue)" : "var(--accent)",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <TIc size={16} />
                    </div>
                    <span className={t.free ? "chip chip-free" : "chip chip-ai"}>
                      {t.free ? "Free" : "AI"}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{t.name}</div>
                  <div className="mono subtle" style={{ fontSize: 11 }}>
                    {t.free ? "FREE · UNLIMITED" : t.cost}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== Final CTA ===== */}
      <section style={{ padding: "80px 0 120px" }}>
        <div
          className="container-x"
          style={{
            padding: "0 28px",
            textAlign: "center",
            maxWidth: 640,
          }}
        >
          <h2 style={{ fontSize: 40, letterSpacing: "-0.02em", marginBottom: 12 }}>
            Ready to {firstWord} your first PDF?
          </h2>
          <p className="muted" style={{ fontSize: 16, marginBottom: 28 }}>
            No signup. No watermarks. Your file stays private.
          </p>
          <Link href={`/tool/${tool.id}`} className="btn btn-lg btn-primary">
            Open {tool.name} <I.ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}

function WhyCard({ icon, title, body }: { icon: keyof typeof I; title: string; body: string }) {
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
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{title}</div>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        {body}
      </div>
    </div>
  );
}
