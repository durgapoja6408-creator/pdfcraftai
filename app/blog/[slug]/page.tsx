import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { I } from "@/components/icons/Icons";
import { BLOG_POSTS, postBySlug } from "@/lib/blog-posts";
import { authorByName } from "@/lib/authors";
import { AdSlot } from "@/components/marketing/AdSlot";

export const dynamicParams = false;

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = postBySlug(params.slug);
  if (!post) {
    return { title: "Post not found" };
  }
  const url = `/blog/${post.slug}`;
  return {
    title: post.title,
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

  // SEO Ship #5 (2026-04-25): Article JSON-LD with full author/publisher
  // metadata, plus a BreadcrumbList. Article schema gives the post
  // higher SERP weight than a generic web page and unlocks the "Top
  // stories" rich-result format for time-sensitive content.
  const SITE = "https://pdfcraftai.com";
  const pageUrl = `${SITE}/blog/${post.slug}`;
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    author: {
      "@type": "Person",
      name: post.author.name,
      jobTitle: post.author.role,
    },
    publisher: {
      "@type": "Organization",
      name: "pdfcraft ai",
      url: SITE,
      logo: { "@type": "ImageObject", url: `${SITE}/icon.svg` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
    datePublished: post.iso,
    dateModified: post.iso,
    articleSection: post.cat,
    wordCount: post.body
      ? post.body.reduce(
          (acc, b) => acc + (b.text ? b.text.split(/\s+/).length : 0),
          0,
        )
      : undefined,
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: pageUrl },
    ],
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
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

          {/* SEO Ship #5: top byline. Google weighs author proximity to
              headline as an authorship signal for E-E-A-T scoring. */}
          <div
            className="row"
            style={{ gap: 10, fontSize: 14, marginBottom: 24, color: "var(--fg-subtle)" }}
          >
            <span>By</span>
            <span style={{ fontWeight: 600, color: "var(--fg)" }}>
              {post.author.name}
            </span>
            <span>·</span>
            <span>{post.author.role}</span>
          </div>

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

          {/* AdSlot — house promo today, Google AdSense once approved.
              Context = post slug so we can show topic-relevant promos
              (e.g. on the redaction post, promote AI Redact). */}
          <AdSlot slot="article-end" context={post.slug} />

          {/*
            2026-05-12 SEV-1 audit fix: byline previously showed
            name + role with no link to the author landing page +
            no bio. Google E-E-A-T (esp. for AI-generated content)
            leans heavily on visible author authority. authorByName
            resolves the post's author string → Author record so we
            can link to /about/authors/<slug> + render the shortBio.
            Falls back to the prior name+role-only display when the
            author name doesn't resolve (e.g. a one-off guest post).
          */}
          {(() => {
            const author = authorByName(post.author.name);
            const Avatar = (
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 600,
                  fontSize: 20,
                  flexShrink: 0,
                }}
                aria-hidden
              >
                {post.author.initial}
              </div>
            );
            return (
              <div
                style={{
                  marginTop: 56,
                  paddingTop: 28,
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  gap: 16,
                  alignItems: "flex-start",
                }}
              >
                {author ? (
                  <Link
                    href={`/about/authors/${author.slug}`}
                    aria-label={`More about ${post.author.name}`}
                    style={{ textDecoration: "none", flexShrink: 0 }}
                  >
                    {Avatar}
                  </Link>
                ) : (
                  Avatar
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {author ? (
                      <Link
                        href={`/about/authors/${author.slug}`}
                        style={{
                          color: "inherit",
                          textDecoration: "none",
                          borderBottom: "1px solid transparent",
                        }}
                      >
                        {post.author.name}
                      </Link>
                    ) : (
                      post.author.name
                    )}
                  </div>
                  <div
                    className="muted"
                    style={{ fontSize: 13, marginBottom: author ? 10 : 0 }}
                  >
                    {post.author.role}
                  </div>
                  {author ? (
                    <p
                      style={{
                        fontSize: 13,
                        lineHeight: 1.55,
                        margin: 0,
                        color: "var(--fg-muted)",
                      }}
                    >
                      {author.shortBio}{" "}
                      <Link
                        href={`/about/authors/${author.slug}`}
                        style={{
                          color: "var(--accent)",
                          textDecoration: "underline",
                          textUnderlineOffset: 2,
                        }}
                      >
                        Read more →
                      </Link>
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })()}
        </div>
      </article>
    </main>
  );
}
