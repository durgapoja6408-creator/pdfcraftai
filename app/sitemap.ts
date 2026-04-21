import type { MetadataRoute } from "next";
import { TOOLS } from "@/lib/tools";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { SEO_SLUGS } from "@/lib/seo-pages";
import { LEGAL_SLUGS } from "@/lib/legal-docs";
import { ALL_HELP_ARTICLES } from "@/lib/help-topics";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://pdfcraftai.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/tools`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/api`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    // Launch-waitlist permalink (Task #3 sub-item 4b). Utility page: the
    // page itself sets `robots: { index: false }`, but we still list it
    // here so the path is a first-class sitemap entry for crawlers that
    // follow sitemap→page and for search console's coverage report.
    { url: `${SITE_URL}/launch-notify`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  const toolRoutes: MetadataRoute.Sitemap = TOOLS.map((t) => ({
    url: `${SITE_URL}/tool/${t.id}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const seoRoutes: MetadataRoute.Sitemap = SEO_SLUGS.map((slug) => ({
    url: `${SITE_URL}/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const blogRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.iso),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const legalRoutes: MetadataRoute.Sitemap = LEGAL_SLUGS.map((s) => ({
    url: `${SITE_URL}/${s}`,
    lastModified: now,
    changeFrequency: "yearly",
    priority: 0.3,
  }));

  const helpRoutes: MetadataRoute.Sitemap = ALL_HELP_ARTICLES.map(({ article }) => ({
    url: `${SITE_URL}/help/${article.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [
    ...staticRoutes,
    ...toolRoutes,
    ...seoRoutes,
    ...blogRoutes,
    ...legalRoutes,
    ...helpRoutes,
  ];
}
