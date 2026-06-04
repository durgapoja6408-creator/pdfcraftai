import type { Metadata } from "next";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { HelpSearch } from "@/components/marketing/HelpSearch";
import { HELP_TOPICS } from "@/lib/help-topics";
import { DEFAULT_OG_IMAGES } from "@/lib/og-defaults";

export const metadata: Metadata = {
  title: "Help center",
  description:
    "Answers, guides, and troubleshooting for pdfcraft ai. Search articles or browse topics.",
  alternates: { canonical: "/help" },
  openGraph: {
    title: "Help center",
    description: "Answers, guides, and troubleshooting for pdfcraft ai.",
    url: "/help",
    type: "website",
    images: DEFAULT_OG_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "Help center",
    description: "Answers, guides, and troubleshooting for pdfcraft ai.",
    images: DEFAULT_OG_IMAGES.map((i) => i.url),
  },
};

// 2026-05-12 — CollectionPage + ItemList JSON-LD for the help center.
// Topics become ListItems (not individual articles — there are ~24
// articles which would bloat the schema; the topic level is the right
// granularity for index-level discovery). BreadcrumbList covers Home
// → Help center.
const SITE = "https://pdfcraftai.com";
const COLLECTION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": `${SITE}/help#collection`,
  url: `${SITE}/help`,
  name: "pdfcraftai Help Center",
  description:
    "Answers, guides, and troubleshooting for pdfcraftai. Search articles or browse topics.",
  isPartOf: { "@type": "WebSite", url: SITE, name: "pdfcraftai" },
  mainEntity: {
    "@type": "ItemList",
    numberOfItems: HELP_TOPICS.length,
    itemListElement: HELP_TOPICS.map((t, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${SITE}/help#${t.slug}`,
      name: t.name,
      description:
        t.blurb.length > 200 ? t.blurb.slice(0, 197) + "..." : t.blurb,
    })),
  },
};

const BREADCRUMB_JSONLD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE },
    {
      "@type": "ListItem",
      position: 2,
      name: "Help center",
      item: `${SITE}/help`,
    },
  ],
};

export default function HelpPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(COLLECTION_JSONLD),
        }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(BREADCRUMB_JSONLD),
        }}
      />
      {/* Hero + search */}
      <section style={{ paddingTop: 80, paddingBottom: 48 }}>
        <div className="container-x" style={{ padding: "0 28px", textAlign: "center" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            HELP CENTER
          </div>
          <h1 className="hero-standard" style={{ marginBottom: 16 }}>
            How can we help?
          </h1>
          <p
            className="muted"
            style={{ fontSize: 17, marginBottom: 32, maxWidth: 560, margin: "0 auto 32px" }}
          >
            Search articles, browse topics, or ping the team. Most answers are 30 seconds away.
          </p>
          <HelpSearch />
        </div>
      </section>

      {/* Topics grid */}
      <section style={{ paddingBottom: 64 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <h2 className="sr-only">Help topics</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 20,
            }}
          >
            {HELP_TOPICS.map((topic) => {
              const Icon = I[topic.icon];
              return (
                <div
                  key={topic.slug}
                  id={topic.slug}
                  className="card"
                  style={{ padding: 28, scrollMarginTop: 100 }}
                >
                  <div
                    className="row"
                    style={{ gap: 12, marginBottom: 10, alignItems: "center" }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: "var(--accent-soft)",
                        color: "var(--accent)",
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      {Icon ? <Icon size={20} /> : null}
                    </div>
                    <h3 style={{ fontSize: 18, margin: 0 }}>{topic.name}</h3>
                  </div>
                  <p
                    className="muted"
                    style={{ fontSize: 13, lineHeight: 1.5, margin: "0 0 14px" }}
                  >
                    {topic.blurb}
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {topic.arts.map((art) => (
                      <li
                        key={art.slug}
                        style={{
                          borderTop: "1px solid var(--border)",
                          fontSize: 14,
                        }}
                      >
                        <Link
                          href={`/help/${art.slug}`}
                          className="row"
                          style={{
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "10px 0",
                            textDecoration: "none",
                            color: "inherit",
                          }}
                        >
                          <span>{art.title}</span>
                          <I.ArrowRight size={13} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact card */}
      <section style={{ paddingBottom: 120 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div
            className="card"
            style={{
              padding: 40,
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) auto",
              gap: 24,
              alignItems: "center",
            }}
          >
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                STILL STUCK?
              </div>
              <h2 style={{ fontSize: 24, marginBottom: 8, letterSpacing: "-0.02em" }}>
                Talk to a human.
              </h2>
              <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>
                Email{" "}
                <a
                  href="mailto:support@pdfcraftai.com"
                  style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}
                >
                  support@pdfcraftai.com
                </a>
                . We reply within one business day — usually faster.
              </p>
            </div>
            <Link href="mailto:support@pdfcraftai.com" className="btn btn-primary btn-lg">
              Email support
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
