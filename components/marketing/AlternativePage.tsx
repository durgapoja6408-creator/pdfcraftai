// SEO Ship #3 (2026-04-25): comparison ("alternative to X") landing
// page renderer.
//
// Rendering strategy:
//
//   Hero ─ honest one-liner about the competitor + our value prop
//   What they do well ─ credibility-building section
//   Where we win / Where they win ─ side-by-side honesty
//   Feature matrix ─ multi-category comparison table
//   Pricing comparison ─ explicit numbers
//   Migration guide ─ workflow-by-workflow translation
//   FAQ ─ page-specific questions
//   CTA ─ try the free tools

import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { FaqItem } from "@/components/marketing/FaqItem";
import { AdSlot } from "@/components/marketing/AdSlot";
import { toolById, TOOL_STATS } from "@/lib/tools";
import type { CompetitorData } from "@/lib/alternatives";

const SITE = "https://pdfcraftai.com";

export function AlternativePage({ data }: { data: CompetitorData }) {
  const pageUrl = `${SITE}/alternatives/${data.slug}`;

  // ----- JSON-LD: BreadcrumbList + FAQPage + Article ----------
  // Comparison pages benefit from all three because (a) breadcrumbs
  // pull through to SERP, (b) the FAQ schema gives "People also ask"
  // exposure for question-shaped queries, and (c) Article schema
  // signals editorial content rather than a thin product page.
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      {
        "@type": "ListItem",
        position: 2,
        name: "Alternatives",
        item: `${SITE}/alternatives`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `${data.name} alternative`,
        item: pageUrl,
      },
    ],
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
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${data.name} alternative — pdfcraft ai`,
    description: data.oneLine,
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />

      {/* ===== Hero ===== */}
      <section style={{ paddingTop: 80, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.3 }} className="grid-bg" />
        <div className="container-x" style={{ padding: "0 28px", position: "relative", maxWidth: 880 }}>
          <div
            className="row"
            style={{
              gap: 8,
              padding: "6px 12px",
              borderRadius: 999,
              background: "var(--accent-soft)",
              color: "var(--accent)",
              display: "inline-flex",
              fontSize: 12,
              fontWeight: 500,
              marginBottom: 20,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
            {data.name} alternative · honest comparison
          </div>
          <h1 style={{ fontSize: 56, letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 20 }}>
            Looking for {indefiniteArticle(data.name)} {data.name} alternative?
          </h1>
          <p className="muted" style={{ fontSize: 19, lineHeight: 1.55, marginBottom: 28 }}>
            {data.oneLine} Here is an honest side-by-side comparison so you can decide whether to switch, stay, or use both.
          </p>
          <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 32 }}>
            <Link href="/tools" className="btn btn-lg btn-primary">
              Try the {TOOL_STATS.free} free tools <I.ArrowRight size={16} />
            </Link>
            <Link href="/pricing" className="btn btn-lg btn-ghost">
              See pricing
            </Link>
          </div>
          <div
            className="row"
            style={{ gap: 24, color: "var(--fg-subtle)", fontSize: 13, flexWrap: "wrap" }}
          >
            <span className="row" style={{ gap: 6 }}>
              <I.Check size={14} /> {TOOL_STATS.total} tools, {TOOL_STATS.ai}+ AI
            </span>
            <span className="row" style={{ gap: 6 }}>
              <I.Check size={14} /> No daily caps
            </span>
            <span className="row" style={{ gap: 6 }}>
              <I.Check size={14} /> Free tools run in browser
            </span>
            <span className="row" style={{ gap: 6 }}>
              <I.Check size={14} /> $4/month Pro
            </span>
          </div>
        </div>
      </section>

      {/* ===== What they do well — credibility ===== */}
      <section style={{ padding: "80px 0", background: "var(--bg-1)", marginTop: 80 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 880 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            CREDIT WHERE IT'S DUE
          </div>
          <h2 style={{ fontSize: 32, letterSpacing: "-0.02em", marginBottom: 24 }}>
            What {data.name} does well
          </h2>
          <p className="muted" style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 24 }}>
            {data.name} has been around since {data.founded} and is based in {data.hq}.
            They've earned a real user base for real reasons — here are the ones that matter.
          </p>
          <ul style={{ fontSize: 16, lineHeight: 1.7, paddingLeft: 24 }}>
            {data.whatTheyDoWell.map((item, i) => (
              <li key={i} style={{ marginBottom: 10 }}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ===== Where we win / where they win ===== */}
      <section style={{ padding: "80px 0" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 1100 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            HONEST COMPARISON
          </div>
          <h2 style={{ fontSize: 32, letterSpacing: "-0.02em", marginBottom: 32 }}>
            Where each tool actually wins
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: 20,
            }}
          >
            <div className="card" style={{ padding: 28, borderColor: "var(--accent)" }}>
              <div
                className="row"
                style={{
                  gap: 8,
                  marginBottom: 16,
                  color: "var(--accent)",
                  fontWeight: 600,
                }}
              >
                <I.Check size={18} /> Where pdfcraft ai wins
              </div>
              <ul style={{ fontSize: 15, lineHeight: 1.6, paddingLeft: 20, margin: 0 }}>
                {data.whereWeWin.map((item, i) => (
                  <li key={i} style={{ marginBottom: 10 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card" style={{ padding: 28 }}>
              <div className="row" style={{ gap: 8, marginBottom: 16, fontWeight: 600 }}>
                <I.Check size={18} /> Where {data.name} still wins
              </div>
              <ul style={{ fontSize: 15, lineHeight: 1.6, paddingLeft: 20, margin: 0 }}>
                {data.whereTheyWin.map((item, i) => (
                  <li key={i} style={{ marginBottom: 10 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Feature matrix ===== */}
      <section style={{ padding: "80px 0", background: "var(--bg-1)" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 1080 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            SIDE BY SIDE
          </div>
          <h2 style={{ fontSize: 32, letterSpacing: "-0.02em", marginBottom: 24 }}>
            pdfcraft ai vs {data.name}
          </h2>
          {data.matrix.map((cat, i) => (
            <div key={i} style={{ marginBottom: 32 }}>
              <h3 style={{ fontSize: 18, marginBottom: 12, color: "var(--fg-subtle)" }}>
                {cat.category}
              </h3>
              <div
                className="card"
                style={{ padding: 0, overflow: "hidden", borderRadius: 12 }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-2)", textAlign: "left" }}>
                      <th style={{ padding: "12px 16px", fontWeight: 500 }}>Feature</th>
                      <th style={{ padding: "12px 16px", fontWeight: 500, color: "var(--accent)" }}>
                        pdfcraft ai
                      </th>
                      <th style={{ padding: "12px 16px", fontWeight: 500 }}>{data.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.rows.map((row, j) => (
                      <tr
                        key={j}
                        style={{ borderTop: "1px solid var(--border)" }}
                      >
                        <td style={{ padding: "12px 16px" }}>
                          <div>{row.feature}</div>
                          {row.note && (
                            <div
                              className="muted"
                              style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}
                            >
                              {row.note}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <CellValue value={row.us} />
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <CellValue value={row.them} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Pricing comparison ===== */}
      <section style={{ padding: "80px 0" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 880 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            PRICING
          </div>
          <h2 style={{ fontSize: 32, letterSpacing: "-0.02em", marginBottom: 24 }}>
            What each one costs
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div className="card" style={{ padding: 24 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                Free tier
              </div>
              <div style={{ marginBottom: 12, fontSize: 14, lineHeight: 1.6 }}>
                <strong style={{ color: "var(--accent)" }}>pdfcraft ai:</strong>{" "}
                {data.pricing.free.us}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                <strong>{data.name}:</strong> {data.pricing.free.them}
              </div>
            </div>
            <div className="card" style={{ padding: 24 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                Cheapest paid plan
              </div>
              <div style={{ marginBottom: 12, fontSize: 14, lineHeight: 1.6 }}>
                <strong style={{ color: "var(--accent)" }}>pdfcraft ai:</strong>{" "}
                {data.pricing.paid.us}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                <strong>{data.name}:</strong> {data.pricing.paid.them}
              </div>
            </div>
          </div>
          <p
            className="muted"
            style={{ fontSize: 16, lineHeight: 1.6, fontStyle: "italic" }}
          >
            {data.pricing.summary}
          </p>
        </div>
      </section>

      {/* ===== Migration guide ===== */}
      <section style={{ padding: "80px 0", background: "var(--bg-1)" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 880 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            MIGRATION GUIDE
          </div>
          <h2 style={{ fontSize: 32, letterSpacing: "-0.02em", marginBottom: 12 }}>
            If you switch, here's what changes
          </h2>
          <p className="muted" style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
            Common workflows mapped from {data.name} to pdfcraft ai. You don't
            have to switch everything at once — many users keep both for a
            while and migrate piece by piece.
          </p>
          <div style={{ display: "grid", gap: 16 }}>
            {data.migration.map((m, i) => (
              <div key={i} className="card" style={{ padding: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 12 }}>
                  {m.workflow}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: 16,
                  }}
                >
                  <div>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                      {data.name} way
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6 }}>{m.theirWay}</div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        marginBottom: 6,
                        color: "var(--accent)",
                      }}
                    >
                      pdfcraft ai way
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6 }}>{m.ourWay}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Related tools to try ===== */}
      <section style={{ padding: "80px 0" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 1080 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            START HERE
          </div>
          <h2 style={{ fontSize: 28, marginBottom: 24 }}>
            Tools to try first if you're switching from {data.name}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {data.relatedTools.map((id) => {
              const t = toolById(id);
              if (!t) return null;
              const Ic = I[t.icon];
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
                      <Ic size={16} />
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

      {/* ===== FAQ ===== */}
      <section style={{ padding: "80px 0", background: "var(--bg-1)" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 780 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            FAQ
          </div>
          <h2 style={{ fontSize: 32, marginBottom: 24 }}>
            Questions about switching from {data.name}
          </h2>
          <div>
            {data.faq.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} defaultOpen={i === 0} />
            ))}
          </div>

          {/* AdSlot — house promo today (e.g. "50+ AI tools iLovePDF
              doesn't have"), Google AdSense once approved. Context =
              competitor slug for a tailored promo per competitor. */}
          <AdSlot slot="alternative-end" context={data.slug} />
        </div>
      </section>

      {/* ===== Final CTA ===== */}
      <section style={{ padding: "80px 0 120px" }}>
        <div
          className="container-x"
          style={{ padding: "0 28px", textAlign: "center", maxWidth: 640 }}
        >
          <h2 style={{ fontSize: 40, letterSpacing: "-0.02em", marginBottom: 12 }}>
            Try it on a real PDF
          </h2>
          <p className="muted" style={{ fontSize: 16, marginBottom: 28 }}>
            No signup. No watermarks. {TOOL_STATS.free} free tools, runs in your browser.
          </p>
          <Link href="/tools" className="btn btn-lg btn-primary">
            Browse all tools <I.ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}

// "a iLovePDF" reads wrong — pronounced "eye-Love-PDF", starts with a
// vowel sound. We can't rely on first-letter alone (Adobe = vowel, PDF24
// = consonant 'pee', etc.) so this is a per-name lookup.
function indefiniteArticle(name: string): "a" | "an" {
  // Names that pronounce starting with a vowel sound take "an".
  const VOWEL_SOUND = new Set([
    "iLovePDF",     // "eye-Love-PDF"
    "Adobe Acrobat", // "Adobe" starts with vowel
  ]);
  return VOWEL_SOUND.has(name) ? "an" : "a";
}

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span style={{ color: "var(--accent)", fontWeight: 500 }}>
        <I.Check size={16} /> Yes
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="muted" style={{ opacity: 0.6 }}>
        — No
      </span>
    );
  }
  return <span>{value}</span>;
}
