import type { Metadata } from "next";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { BLOG_POSTS } from "@/lib/blog-posts";

export const metadata: Metadata = {
  title: "Blog — pdfcraft ai",
  description:
    "Field notes from the PDF factory. Product updates, guides, engineering deep-dives, and security thinking from the pdfcraft ai team.",
  alternates: { canonical: "/blog" },
  openGraph: { title: "Blog — pdfcraft ai", description: "Field notes from the PDF factory.", url: "/blog", type: "website" },
  twitter: { card: "summary_large_image", title: "Blog — pdfcraft ai", description: "Field notes from the PDF factory." },
};

export default function BlogPage() {
  const [featured, ...rest] = BLOG_POSTS;

  return (
    <main>
      <section style={{ paddingTop: 80, paddingBottom: 40 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            BLOG
          </div>
          <h1 style={{ fontSize: 48, letterSpacing: "-0.03em" }}>Field notes from the PDF factory.</h1>
        </div>
      </section>

      {/* Featured */}
      <section style={{ paddingBottom: 48 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <Link
            href={`/blog/${featured.slug}`}
            className="card card-hover"
            style={{
              padding: 0,
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
              gap: 0,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background:
                  "linear-gradient(135deg, var(--accent-soft), color-mix(in oklab, var(--blue) 20%, transparent))",
                minHeight: 280,
                display: "grid",
                placeItems: "center",
              }}
            >
              <span
                className="mono subtle"
                style={{ fontSize: 11, letterSpacing: "0.12em" }}
              >
                FEATURED IMAGE · 2:1
              </span>
            </div>
            <div style={{ padding: 36 }}>
              <span className="chip chip-ai" style={{ marginBottom: 16 }}>
                {featured.cat}
              </span>
              <div className="mono subtle" style={{ fontSize: 11, marginBottom: 12, marginTop: 12 }}>
                {featured.date} · {featured.read}
              </div>
              <h2 style={{ fontSize: 26, marginBottom: 12, lineHeight: 1.25 }}>{featured.title}</h2>
              <p className="muted" style={{ fontSize: 15, lineHeight: 1.55, marginBottom: 20 }}>
                {featured.excerpt}
              </p>
              <span className="row" style={{ gap: 6, fontSize: 14, fontWeight: 500, color: "var(--accent)" }}>
                Read article <I.ArrowRight size={14} />
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* Grid */}
      <section style={{ paddingBottom: 120 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: 20,
            }}
          >
            {rest.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="card card-hover" style={{ padding: 0, overflow: "hidden" }}>
                <div
                  style={{
                    background: "var(--bg-2)",
                    aspectRatio: "2 / 1",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <span className="mono subtle" style={{ fontSize: 10, letterSpacing: "0.1em" }}>
                    COVER · 2:1
                  </span>
                </div>
                <div style={{ padding: 22 }}>
                  <span className="chip chip-free" style={{ marginBottom: 12 }}>
                    {p.cat}
                  </span>
                  <div className="mono subtle" style={{ fontSize: 11, marginBottom: 8, marginTop: 8 }}>
                    {p.date} · {p.read}
                  </div>
                  <h3 style={{ fontSize: 18, marginBottom: 8, lineHeight: 1.3 }}>{p.title}</h3>
                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                    {p.excerpt}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
