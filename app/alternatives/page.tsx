import type { Metadata } from "next";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { COMPETITORS, COMPETITOR_SLUGS } from "@/lib/alternatives";

export const metadata: Metadata = {
  title: "PDF tool alternatives — honest comparisons · pdfcraft ai",
  description:
    "Side-by-side comparisons of pdfcraft ai with iLovePDF, Smallpdf, Adobe Acrobat, PDF24, and Sejda. Feature matrix, pricing, and migration guide for each.",
  alternates: { canonical: "/alternatives" },
};

// 2026-05-12 — CollectionPage + ItemList JSON-LD. Mirrors the pattern
// shipped on /tools (commit 430ba62) and /compare (commit 52adddc).
// Each competitor comparison becomes a ListItem with position + name
// + url + the one-line summary. Helps Google place individual
// comparisons in SERP when users search "<competitor> alternative".
//
// The list derives from COMPETITOR_SLUGS + COMPETITORS at render
// time — adding a new comparison auto-updates the schema.
const SITE = "https://pdfcraftai.com";
const COLLECTION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": `${SITE}/alternatives#collection`,
  url: `${SITE}/alternatives`,
  name: "PDF tool alternatives — honest comparisons",
  description:
    "Side-by-side comparisons of pdfcraftai with iLovePDF, Smallpdf, Adobe Acrobat, PDF24, and Sejda. Each comparison covers feature matrix, pricing, and migration guide.",
  isPartOf: { "@type": "WebSite", url: SITE, name: "pdfcraftai" },
  mainEntity: {
    "@type": "ItemList",
    numberOfItems: COMPETITOR_SLUGS.length,
    itemListElement: COMPETITOR_SLUGS.map((slug, idx) => {
      const c = COMPETITORS[slug];
      return {
        "@type": "ListItem",
        position: idx + 1,
        url: `${SITE}/alternatives/${slug}`,
        name: `${c.name} alternative`,
        // Truncate to 200 chars per Google's structured-data spec.
        description:
          c.oneLine.length > 200
            ? c.oneLine.slice(0, 197) + "..."
            : c.oneLine,
      };
    }),
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
      name: "Alternatives",
      item: `${SITE}/alternatives`,
    },
  ],
};

export default function AlternativesIndexPage() {
  return (
    <main>
      {/* CollectionPage + Breadcrumb JSON-LD — see comments above. */}
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
      <section style={{ paddingTop: 80, paddingBottom: 60 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 880 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            ALTERNATIVES
          </div>
          <h1 className="hero-major" style={{ marginBottom: 20 }}>
            Comparing pdfcraft ai to the alternatives
          </h1>
          <p className="hero-sub" style={{ marginTop: 0, marginBottom: 8 }}>
            We did the side-by-side work for you. Each comparison is honest about
            where the other tool still wins — and includes a migration guide for
            common workflows so you can switch (or not) with eyes open.
          </p>
        </div>
      </section>

      <section style={{ padding: "40px 0 120px" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 1080 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 16,
            }}
          >
            {COMPETITOR_SLUGS.map((slug) => {
              const c = COMPETITORS[slug];
              return (
                // #20 (2026-04-29): prefetch={false} on the alternatives
                // card grid. Same fix as the tool grids — disables the
                // viewport-enter RSC prefetch flood.
                <Link
                  key={slug}
                  href={`/alternatives/${slug}`}
                  prefetch={false}
                  className="card card-hover"
                  style={{ padding: 28 }}
                >
                  <div style={{ fontSize: 22, fontWeight: 500, marginBottom: 8 }}>
                    {c.name} alternative
                  </div>
                  <div
                    className="muted"
                    style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 16 }}
                  >
                    {c.oneLine}
                  </div>
                  <div
                    className="row"
                    style={{
                      gap: 6,
                      color: "var(--accent)",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    See the comparison <I.ArrowRight size={14} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
