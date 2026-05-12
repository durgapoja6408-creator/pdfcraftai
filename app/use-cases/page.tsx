import type { Metadata } from "next";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { USE_CASES, USE_CASE_SLUGS } from "@/lib/use-cases";

export const metadata: Metadata = {
  title: "PDF use cases — workflow guides · pdfcraft ai",
  description:
    "Step-by-step guides for the jobs people actually do with PDFs: combining bank statements for an accountant, redlining contracts, OCRing archives, translating handbooks, and more.",
  alternates: { canonical: "/use-cases" },
};

// 2026-05-12 — CollectionPage + ItemList JSON-LD. Same pattern shipped
// on /tools (commit 430ba62) and /alternatives (commit 8b97455).
// Each USE_CASES entry becomes a ListItem with name + url + sub.
// Derived from USE_CASE_SLUGS at render time.
const SITE = "https://pdfcraftai.com";
const COLLECTION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": `${SITE}/use-cases#collection`,
  url: `${SITE}/use-cases`,
  name: "PDF use cases — workflow guides",
  description:
    "Step-by-step guides for the jobs people actually do with PDFs: combining bank statements for an accountant, redlining contracts, OCRing archives, translating handbooks, and more.",
  isPartOf: { "@type": "WebSite", url: SITE, name: "pdfcraftai" },
  mainEntity: {
    "@type": "ItemList",
    numberOfItems: USE_CASE_SLUGS.length,
    itemListElement: USE_CASE_SLUGS.map((slug, idx) => {
      const u = USE_CASES[slug];
      return {
        "@type": "ListItem",
        position: idx + 1,
        url: `${SITE}/use-cases/${slug}`,
        name: u.h1,
        description: u.sub.length > 200 ? u.sub.slice(0, 197) + "..." : u.sub,
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
      name: "Use cases",
      item: `${SITE}/use-cases`,
    },
  ],
};

export default function UseCasesIndexPage() {
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
      <section style={{ paddingTop: 80, paddingBottom: 60 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 880 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            USE CASES
          </div>
          <h1 className="hero-major" style={{ marginBottom: 20 }}>
            What people actually do with pdfcraft ai
          </h1>
          <p className="hero-sub" style={{ marginTop: 0 }}>
            Each guide walks through a real workflow — what tools to use, what
            order to use them in, what mistakes to avoid, and what to expect at
            the end.
          </p>
        </div>
      </section>
      <section style={{ padding: "40px 0 120px" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 1080 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 16,
            }}
          >
            {USE_CASE_SLUGS.map((slug) => {
              const u = USE_CASES[slug];
              return (
                // #20 (2026-04-29): prefetch={false} on the use-cases
                // grid. ~10 use-case landings at a time; same flood
                // pattern as the other card grids.
                <Link
                  key={slug}
                  href={`/use-cases/${slug}`}
                  prefetch={false}
                  className="card card-hover"
                  style={{ padding: 24 }}
                >
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                    {u.totalTime}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 8, lineHeight: 1.3 }}>
                    {u.h1}
                  </div>
                  <div
                    className="muted"
                    style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}
                  >
                    {u.sub}
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
                    See the workflow <I.ArrowRight size={14} />
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
