import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { I } from "@/components/icons/Icons";
import { TOOLS, toolById } from "@/lib/tools";
import {
  CATEGORIES,
  CATEGORY_SLUGS,
  type CategorySlug,
} from "@/lib/categories";

export function generateStaticParams() {
  return CATEGORY_SLUGS.map((slug) => ({ slug }));
}

type Props = { params: { slug: string } };

export function generateMetadata({ params }: Props): Metadata {
  const slug = params.slug as CategorySlug;
  const cat = CATEGORIES[slug];
  if (!cat) return {};
  return {
    title: cat.h1,
    description: cat.sub,
    alternates: { canonical: `/categories/${slug}` },
    openGraph: {
      title: cat.h1,
      description: cat.sub,
      url: `/categories/${slug}`,
      type: "website",
    },
  };
}

export default function CategoryPage({ params }: Props) {
  const slug = params.slug as CategorySlug;
  const cat = CATEGORIES[slug];
  if (!cat) notFound();

  const tools = TOOLS.filter((t) => t.group === cat.group);

  const SITE = "https://pdfcraftai.com";
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      {
        "@type": "ListItem",
        position: 2,
        name: "Categories",
        item: `${SITE}/categories`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: cat.h1,
        item: `${SITE}/categories/${slug}`,
      },
    ],
  };
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: cat.h1,
    description: cat.sub,
    url: `${SITE}/categories/${slug}`,
    hasPart: tools.map((t) => ({
      "@type": "SoftwareApplication",
      name: t.name,
      url: `${SITE}/tool/${t.id}`,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
    })),
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />

      <section style={{ paddingTop: 80, paddingBottom: 40 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 880 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            CATEGORY
          </div>
          <h1
            style={{
              fontSize: 48,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              marginBottom: 16,
            }}
          >
            {cat.h1}
          </h1>
          <p className="muted" style={{ fontSize: 19, lineHeight: 1.55, marginBottom: 24 }}>
            {cat.sub}
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 40 }}>{cat.intro}</p>
        </div>
      </section>

      <section style={{ padding: "20px 0 60px" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 1080 }}>
          <h2 style={{ fontSize: 24, marginBottom: 16 }}>
            All {tools.length} {displayCategory(cat.group)} tools
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {tools.map((t) => {
              const Ic = I[t.icon];
              return (
                <Link
                  key={t.id}
                  href={`/tool/${t.id}`}
                  className="card card-hover"
                  style={{ padding: 18 }}
                >
                  <div
                    className="row"
                    style={{ justifyContent: "space-between", marginBottom: 14 }}
                  >
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
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    {t.name}
                  </div>
                  <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    {t.desc}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ padding: "60px 0 100px", background: "var(--bg-1)" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 760 }}>
          <h2
            style={{
              fontSize: 26,
              letterSpacing: "-0.02em",
              marginBottom: 16,
            }}
          >
            When to reach for {displayCategory(cat.group)} tools
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.7 }}>{cat.body}</p>
        </div>
      </section>
    </main>
  );
}

// "AI" stays uppercase. Other category names lowercase nicely
// ("Organize" → "organize"). Keeps headings readable.
function displayCategory(group: string): string {
  if (group === "AI") return "AI";
  return group.toLowerCase();
}
