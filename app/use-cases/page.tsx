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

export default function UseCasesIndexPage() {
  return (
    <main>
      <section style={{ paddingTop: 80, paddingBottom: 60 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 880 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            USE CASES
          </div>
          <h1 style={{ fontSize: 56, letterSpacing: "-0.03em", lineHeight: 1.05, marginBottom: 20 }}>
            What people actually do with pdfcraft ai
          </h1>
          <p className="muted" style={{ fontSize: 19, lineHeight: 1.55 }}>
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
                <Link
                  key={slug}
                  href={`/use-cases/${slug}`}
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
