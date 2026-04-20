import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { I } from "@/components/icons/Icons";
import { BLOG_POSTS, postBySlug } from "@/lib/blog-posts";

export const dynamicParams = false;

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = postBySlug(params.slug);
  if (!post) {
    return { title: "Post not found — pdfcraft ai" };
  }
  const url = `/blog/${post.slug}`;
  return {
    title: `${post.title} — pdfcraft ai`,
    description: post.excerpt,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url,
      type: "article",
      publishedTime: post.iso,
      authors: [post.author.name],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
    },
  };
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = postBySlug(params.slug);
  if (!post) notFound();

  return (
    <main>
      <article style={{ paddingTop: 80, paddingBottom: 100 }}>
        <div
          className="container-x"
          style={{ maxWidth: 740, padding: "0 28px" }}
        >
          <Link
            href="/blog"
            className="row"
            style={{
              gap: 6,
              marginBottom: 28,
              fontSize: 14,
              color: "var(--fg-subtle)",
              textDecoration: "none",
            }}
          >
            <I.ArrowLeft size={14} />
            <span>All posts</span>
          </Link>

          <div className="row" style={{ gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <span className="chip chip-ai">{post.cat}</span>
            <span className="mono subtle" style={{ fontSize: 11 }}>
              <time dateTime={post.iso}>{post.date}</time> · {post.read}
            </span>
          </div>

          <h1
            style={{
              fontSize: 40,
              letterSpacing: "-0.025em",
              lineHeight: 1.15,
              marginBottom: 20,
            }}
          >
            {post.title}
          </h1>

          <p
            className="muted"
            style={{
              fontSize: 18,
              lineHeight: 1.55,
              marginBottom: 40,
            }}
          >
            {post.excerpt}
          </p>

          {/* Cover image placeholder */}
          <div
            className="card"
            style={{
              padding: 0,
              marginBottom: 40,
              aspectRatio: "2 / 1",
              display: "grid",
              placeItems: "center",
              background:
                "linear-gradient(135deg, var(--accent-soft), color-mix(in oklab, var(--blue) 20%, transparent))",
              overflow: "hidden",
            }}
          >
            <span
              className="mono subtle"
              style={{ fontSize: 11, letterSpacing: "0.12em" }}
            >
              COVER · 2:1
            </span>
          </div>

          {/* Body */}
          {post.body ? (
            <div style={{ fontSize: 16, lineHeight: 1.75 }}>
              {post.body.map((block, i) => {
                if (block.type === "h3") {
                  return (
                    <h3
                      key={i}
                      style={{
                        fontSize: 22,
                        marginTop: 32,
                        marginBottom: 14,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {block.text}
                    </h3>
                  );
                }
                if (block.type === "quote") {
                  return (
                    <blockquote
                      key={i}
                      className="card"
                      style={{
                        margin: "24px 0",
                        padding: 24,
                        borderLeft: "3px solid var(--accent)",
                        fontSize: 17,
                        fontStyle: "italic",
                        color: "var(--fg)",
                      }}
                    >
                      {block.text}
                    </blockquote>
                  );
                }
                return (
                  <p
                    key={i}
                    className="muted"
                    style={{ marginBottom: 18, fontSize: 16, lineHeight: 1.75 }}
                  >
                    {block.text}
                  </p>
                );
              })}
            </div>
          ) : (
            <div
              className="card"
              style={{
                padding: 32,
                textAlign: "center",
                borderStyle: "dashed",
              }}
            >
              <div
                className="mono subtle"
                style={{ fontSize: 11, letterSpacing: "0.12em", marginBottom: 10 }}
              >
                DRAFT · COMING SOON
              </div>
              <p className="muted" style={{ fontSize: 15, marginBottom: 16 }}>
                This post is still being written. Want a nudge when it ships?
              </p>
              <Link href="/#newsletter" className="btn btn-outline">
                Get notified
              </Link>
            </div>
          )}

          {/* Byline */}
          <div
            className="row"
            style={{
              gap: 14,
              marginTop: 56,
              paddingTop: 28,
              borderTop: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "var(--accent-soft)",
                color: "var(--accent)",
                display: "grid",
                placeItems: "center",
                fontWeight: 600,
                fontSize: 16,
                flexShrink: 0,
              }}
              aria-hidden
            >
              {post.author.initial}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{post.author.name}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {post.author.role}
              </div>
            </div>
          </div>
        </div>
      </article>
    </main>
  );
}
