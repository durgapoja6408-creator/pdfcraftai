import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { I } from "@/components/icons/Icons";
import {
  ALL_HELP_ARTICLES,
  HELP_TOPICS,
  findHelpArticle,
} from "@/lib/help-topics";

type Params = { params: { slug: string } };

export function generateStaticParams() {
  return ALL_HELP_ARTICLES.map(({ article }) => ({ slug: article.slug }));
}

export function generateMetadata({ params }: Params): Metadata {
  const found = findHelpArticle(params.slug);
  if (!found) return { title: "Article not found — pdfcraft ai" };
  const { article, topic } = found;
  return {
    title: `${article.title} — pdfcraft ai help`,
    description: article.summary,
    alternates: { canonical: `/help/${article.slug}` },
    openGraph: {
      title: `${article.title} — pdfcraft ai help`,
      description: article.summary,
      url: `/help/${article.slug}`,
      type: "article",
      siteName: "pdfcraft ai",
    },
    twitter: {
      card: "summary",
      title: article.title,
      description: article.summary,
    },
    keywords: [
      "pdfcraft",
      "help",
      "PDF",
      topic.name.toLowerCase(),
      article.title.toLowerCase(),
    ],
  };
}

export default function HelpArticlePage({ params }: Params) {
  const found = findHelpArticle(params.slug);
  if (!found) notFound();
  const { topic, article } = found;
  const TopicIcon = I[topic.icon];

  // Sibling articles inside the same topic, excluding the current one.
  const related = topic.arts.filter((a) => a.slug !== article.slug);

  return (
    <main>
      <section style={{ paddingTop: 60 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 760 }}>
          {/* Crumbs */}
          <div
            className="row subtle"
            style={{ gap: 8, fontSize: 13, marginBottom: 24, alignItems: "center" }}
          >
            <Link href="/help" style={{ color: "inherit", textDecoration: "none" }}>
              Help center
            </Link>
            <I.ChevronRight size={12} />
            <span>{topic.name}</span>
          </div>

          {/* Header */}
          <div className="row" style={{ gap: 14, marginBottom: 16, alignItems: "center" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "var(--accent-soft)",
                color: "var(--accent)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              {TopicIcon ? <TopicIcon size={22} /> : null}
            </div>
            <h1 style={{ fontSize: 36, margin: 0, letterSpacing: "-0.02em" }}>
              {article.title}
            </h1>
          </div>

          <p className="muted" style={{ fontSize: 17, lineHeight: 1.55, marginBottom: 32 }}>
            {article.summary}
          </p>

          {/* Body */}
          <article style={{ fontSize: 16, lineHeight: 1.7 }}>
            {article.body.map((p, i) => (
              <p key={i} style={{ margin: "0 0 18px" }}>
                {p}
              </p>
            ))}
          </article>

          {/* Was-this-helpful + contact */}
          <div
            className="card"
            style={{
              marginTop: 48,
              padding: 24,
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ minWidth: 240 }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Still stuck?</div>
              <div className="muted" style={{ fontSize: 14 }}>
                Email{" "}
                <a
                  href="mailto:support@pdfcraftai.com"
                  style={{ color: "var(--accent)", textDecoration: "none" }}
                >
                  support@pdfcraftai.com
                </a>{" "}
                — we reply within one business day.
              </div>
            </div>
            <Link href="/contact" className="btn btn-primary">
              Contact support
            </Link>
          </div>

          {/* Related articles */}
          {related.length > 0 && (
            <section style={{ marginTop: 56 }}>
              <div className="eyebrow" style={{ marginBottom: 16 }}>
                MORE IN {topic.name.toUpperCase()}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {related.map((a) => (
                  <li
                    key={a.slug}
                    style={{
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <Link
                      href={`/help/${a.slug}`}
                      className="row"
                      style={{
                        padding: "16px 0",
                        textDecoration: "none",
                        color: "inherit",
                        gap: 16,
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>{a.title}</div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {a.summary}
                        </div>
                      </div>
                      <I.ArrowRight size={14} style={{ marginTop: 6 }} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Cross-topic browse */}
          <section style={{ marginTop: 56, marginBottom: 32 }}>
            <div className="eyebrow" style={{ marginBottom: 16 }}>
              BROWSE OTHER TOPICS
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {HELP_TOPICS.filter((t) => t.slug !== topic.slug).map((t) => (
                <Link
                  key={t.slug}
                  href={`/help#${t.slug}`}
                  className="chip"
                  style={{ textDecoration: "none" }}
                >
                  {t.name}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </section>

      <div style={{ padding: "60px 0" }} />
    </main>
  );
}
