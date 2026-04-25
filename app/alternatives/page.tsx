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

export default function AlternativesIndexPage() {
  return (
    <main>
      <section style={{ paddingTop: 80, paddingBottom: 60 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 880 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            ALTERNATIVES
          </div>
          <h1 style={{ fontSize: 56, letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 20 }}>
            Comparing pdfcraft ai to the alternatives
          </h1>
          <p className="muted" style={{ fontSize: 19, lineHeight: 1.55, marginBottom: 8 }}>
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
                <Link
                  key={slug}
                  href={`/alternatives/${slug}`}
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
