import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { I } from "@/components/icons/Icons";
import { AUTHORS, AUTHOR_SLUGS, type AuthorSlug } from "@/lib/authors";

const SITE = "https://pdfcraftai.com";

export function generateStaticParams() {
  return AUTHOR_SLUGS.map((slug) => ({ slug }));
}

type Props = { params: { slug: string } };

export function generateMetadata({ params }: Props): Metadata {
  const author = AUTHORS[params.slug as AuthorSlug];
  if (!author) return {};
  // 2026-05-12 SEV-1 audit fix: the page title used to render as
  // "Rajasekar Selvam — Founder · pdfcraft ai · pdfcraft ai" because
  // (a) the author.role field already ends with "· pdfcraft ai"
  // (lib/authors.ts:52) and (b) the root layout template appends
  // "· pdfcraft ai" via `template: "%s · pdfcraft ai"`. Strip the
  // role's trailing suffix before composing the title — the data
  // source stays untouched (role is also used elsewhere for byline
  // display where the suffix is wanted).
  const roleForTitle = author.role.replace(/\s*[·•]\s*pdfcraft ai\s*$/i, "");
  const titleStr =
    roleForTitle.length > 0
      ? `${author.name} — ${roleForTitle}`
      : author.name;
  return {
    title: titleStr,
    description: author.shortBio,
    alternates: { canonical: `/about/authors/${author.slug}` },
    openGraph: {
      title: titleStr,
      description: author.shortBio,
      url: `/about/authors/${author.slug}`,
      type: "profile",
    },
  };
}

export default function AuthorPage({ params }: Props) {
  const author = AUTHORS[params.slug as AuthorSlug];
  if (!author) notFound();

  const personLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.name,
    jobTitle: author.role,
    description: author.shortBio,
    knowsAbout: author.expertise,
    worksFor: { "@type": "Organization", name: "pdfcraft ai", url: SITE },
    url: `${SITE}/about/authors/${author.slug}`,
    sameAs: [
      author.links?.github,
      author.links?.linkedin,
      author.links?.website,
      author.links?.twitter ? `https://twitter.com/${author.links.twitter}` : null,
    ].filter(Boolean),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      { "@type": "ListItem", position: 2, name: "About", item: `${SITE}/about` },
      {
        "@type": "ListItem",
        position: 3,
        name: author.name,
        item: `${SITE}/about/authors/${author.slug}`,
      },
    ],
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <section style={{ paddingTop: 80, paddingBottom: 40 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 760 }}>
          <Link
            href="/about"
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
            <span>About pdfcraft ai</span>
          </Link>

          <div className="row" style={{ gap: 20, alignItems: "center", marginBottom: 32 }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "var(--accent-soft)",
                color: "var(--accent)",
                display: "grid",
                placeItems: "center",
                fontWeight: 600,
                fontSize: 32,
                flexShrink: 0,
              }}
              aria-hidden
            >
              {author.initial}
            </div>
            <div>
              <h1 style={{ fontSize: 36, letterSpacing: "-0.02em", marginBottom: 4 }}>
                {author.name}
              </h1>
              <div className="muted" style={{ fontSize: 16 }}>
                {author.role}
              </div>
            </div>
          </div>

          <p style={{ fontSize: 18, lineHeight: 1.6, marginBottom: 24, color: "var(--fg)" }}>
            {author.shortBio}
          </p>

          <div className="eyebrow" style={{ marginBottom: 8, marginTop: 32 }}>
            BIOGRAPHY
          </div>
          <p style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 32 }}>{author.longBio}</p>

          <div className="eyebrow" style={{ marginBottom: 8, marginTop: 32 }}>
            EXPERTISE
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 32 }}>
            {author.expertise.map((tag) => (
              <span
                key={tag}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  fontSize: 13,
                  color: "var(--fg-muted)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          {author.links && Object.values(author.links).some(Boolean) && (
            <>
              <div className="eyebrow" style={{ marginBottom: 8, marginTop: 32 }}>
                LINKS
              </div>
              <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
                {author.links.website && (
                  <a
                    href={author.links.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 14, color: "var(--accent)" }}
                  >
                    Website
                  </a>
                )}
                {author.links.github && (
                  <a
                    href={author.links.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 14, color: "var(--accent)" }}
                  >
                    GitHub
                  </a>
                )}
                {author.links.linkedin && (
                  <a
                    href={author.links.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 14, color: "var(--accent)" }}
                  >
                    LinkedIn
                  </a>
                )}
                {author.links.twitter && (
                  <a
                    href={`https://twitter.com/${author.links.twitter}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 14, color: "var(--accent)" }}
                  >
                    @{author.links.twitter}
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
