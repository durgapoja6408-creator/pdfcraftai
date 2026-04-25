import type { Metadata } from "next";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { TOOLS, TOOL_STATS } from "@/lib/tools";
import { CATEGORIES, CATEGORY_SLUGS } from "@/lib/categories";

export const metadata: Metadata = {
  title: "PDF tool categories — pdfcraft ai",
  description:
    "Browse pdfcraft ai's tools by category: Organize, Convert, Edit, Optimize, Security, and AI.",
  alternates: { canonical: "/categories" },
};

export default function CategoriesIndexPage() {
  return (
    <main>
      <section style={{ paddingTop: 80, paddingBottom: 40 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 880 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            CATEGORIES
          </div>
          <h1
            style={{
              fontSize: 48,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              marginBottom: 16,
            }}
          >
            Browse PDF tools by category
          </h1>
          <p className="muted" style={{ fontSize: 19, lineHeight: 1.55 }}>
            {TOOL_STATS.total} tools across {CATEGORY_SLUGS.length} categories. Pick the category that matches the job.
          </p>
        </div>
      </section>
      <section style={{ padding: "20px 0 100px" }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 1080 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {CATEGORY_SLUGS.map((slug) => {
              const c = CATEGORIES[slug];
              const count = TOOLS.filter((t) => t.group === c.group).length;
              return (
                <Link
                  key={slug}
                  href={`/categories/${slug}`}
                  className="card card-hover"
                  style={{ padding: 24 }}
                >
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                    {count} tools
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>
                    {c.h1}
                  </div>
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
                    {c.sub}
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
                    Browse {c.group.toLowerCase()} <I.ArrowRight size={14} />
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
