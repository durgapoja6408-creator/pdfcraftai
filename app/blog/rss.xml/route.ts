// Bundle C / Task #122 — RSS 2.0 feed for the blog.
//
// Why ship RSS:
// -------------
// Three audiences:
//   1. Feed-reader users (Feedly, NetNewsWire, Reeder, Inoreader,
//      Vivaldi's built-in reader). Power users still consume tech
//      content this way; not having a feed actively excludes them.
//   2. Aggregator pickup (Hacker News submissions, Lobsters bots,
//      community Slack RSS bridges). When someone posts a link and
//      RSS exists, third parties auto-discover and re-syndicate.
//   3. SEO crawlers — Google still consumes RSS as a discovery
//      signal alongside the sitemap. New posts are indexed faster
//      when RSS is present (anecdotally a few hours vs. 24-48h).
//
// Why /blog/rss.xml (not /rss.xml or /feed.xml):
// ----------------------------------------------
// The feed is blog-only. Putting it under /blog makes the URL
// self-describing and leaves room for a separate /changelog/rss.xml
// in the future without renaming. Most readers auto-discover via the
// <link rel="alternate"> tag we add to /blog/page.tsx, so the path
// itself isn't user-facing.
//
// Why a Route Handler (not a Next 14 metadata route):
// ---------------------------------------------------
// Next.js does support `feed.xml` as a special metadata route, but
// only at the root. We want it under /blog/, which means a regular
// Route Handler with `Content-Type: application/rss+xml`.
//
// Caching:
// --------
// `export const revalidate = 3600` — re-build the feed at most every
// hour. New posts appear within an hour of deploy without a rebuild.
// Acceptable latency for blog content; saves CPU on every fetch.

import { BLOG_POSTS } from "@/lib/blog-posts";

const SITE = "https://pdfcraftai.com";
const FEED_TITLE = "pdfcraft ai — Field notes from the PDF factory";
const FEED_DESCRIPTION =
  "Product updates, guides, engineering deep-dives, and security thinking from the pdfcraft ai team.";

export const revalidate = 3600;
export const dynamic = "force-static";

/**
 * Escape a string for inclusion in XML (no markup, no entities).
 *
 * The five XML predefined entities are &, <, >, ", '. Everything
 * else (including non-ASCII) is fine in UTF-8 XML payloads.
 */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Convert "2026-04-14" (YYYY-MM-DD) to RFC-822 timestamp.
 *
 * RSS 2.0 spec requires RFC-822 dates (e.g. "Tue, 14 Apr 2026
 * 12:00:00 GMT"). We pin the time to noon UTC so all readers see a
 * stable timestamp regardless of timezone.
 */
function rfc822(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toUTCString();
}

/**
 * Build the body excerpt for a feed item.
 *
 * If the post has a structured body, render the first 2 paragraphs
 * + the excerpt as plaintext. Otherwise just use the excerpt (for
 * "coming soon" placeholders).
 */
function feedExcerpt(post: (typeof BLOG_POSTS)[number]): string {
  const lines: string[] = [post.excerpt];
  if (post.body) {
    const firstParagraphs = post.body
      .filter((b) => b.type === "p")
      .slice(0, 2)
      .map((b) => b.text);
    lines.push(...firstParagraphs);
  }
  return lines.join("\n\n");
}

export function GET() {
  const sortedPosts = [...BLOG_POSTS].sort((a, b) =>
    b.iso.localeCompare(a.iso),
  );
  const lastBuildDate = rfc822(
    sortedPosts[0]?.iso ?? new Date().toISOString().slice(0, 10),
  );

  const items = sortedPosts
    .map((post) => {
      const url = `${SITE}/blog/${post.slug}`;
      return `    <item>
      <title>${xmlEscape(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${rfc822(post.iso)}</pubDate>
      <author>noreply@pdfcraftai.com (${xmlEscape(post.author.name)})</author>
      <category>${xmlEscape(post.cat)}</category>
      <description>${xmlEscape(feedExcerpt(post))}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(FEED_TITLE)}</title>
    <link>${SITE}/blog</link>
    <description>${xmlEscape(FEED_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${SITE}/blog/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
