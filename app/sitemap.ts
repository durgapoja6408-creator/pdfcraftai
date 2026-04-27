import type { MetadataRoute } from "next";
import { TOOLS } from "@/lib/tools";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { SEO_SLUGS } from "@/lib/seo-pages";
import { LEGAL_SLUGS } from "@/lib/legal-docs";
import { ALL_HELP_ARTICLES } from "@/lib/help-topics";
import { COMPETITOR_SLUGS } from "@/lib/alternatives";
import { USE_CASE_SLUGS } from "@/lib/use-cases";
import { AUTHOR_SLUGS } from "@/lib/authors";

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
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/bulk`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/changelog`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/careers`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/status`, lastModified: now, changeFrequency: "weekly", priority: 0.3 },
    { url: `${SITE_URL}/cookies`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/gdpr`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/launch-notify`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  // Hard-nuked tools (the 40 free WASM tools removed 2026-04-27) used to
  // get higher head-tier priority. Removed those slugs from this set.
  const HEAD_TOOL_IDS = new Set([
    "ai-chat", "ai-summarize", "ai-translate",
    "ai-ocr", "ai-redact", "ai-sign", "ai-table", "ai-compare",
  ]);
  const toolRoutes: MetadataRoute.Sitemap = TOOLS.map((t) => ({
    url: `${SITE_URL}/tool/${t.id}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: HEAD_TOOL_IDS.has(t.id) ? 0.85 : 0.65,
  }));

  // Hard-nuked SEO landings (40 deleted on 2026-04-27) used to be in
  // HEAD_SEO_SLUGS. Slugs that no longer exist as routes were removed.
  const HEAD_SEO_SLUGS = new Set([
    "pdf-to-word", "translate-pdf", "pdf-to-excel",
    "chat-with-pdf", "summarize-pdf", "ai-pdf-ocr",
    "make-pdf-searchable", "compare-pdfs",
  ]);
  const seoRoutes: MetadataRoute.Sitemap = SEO_SLUGS.map((slug) => ({
    url: `${SITE_URL}/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: HEAD_SEO_SLUGS.has(slug) ? 0.9 : 0.7,
  }));

  const blogRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.iso),
    changeFrequency: "yearly",
    priority: 0.55,
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

  const alternativeIndexRoute: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/alternatives`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
  const alternativeRoutes: MetadataRoute.Sitemap = COMPETITOR_SLUGS.map((s) => ({
    url: `${SITE_URL}/alternatives/${s}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.85,
  }));

  const useCaseIndexRoute: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/use-cases`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
  const useCaseRoutes: MetadataRoute.Sitemap = USE_CASE_SLUGS.map((s) => ({
    url: `${SITE_URL}/use-cases/${s}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.85,
  }));

  const authorRoutes: MetadataRoute.Sitemap = AUTHOR_SLUGS.map((s) => ({
    url: `${SITE_URL}/about/authors/${s}`,
    lastModified: now,
    changeFrequency: "yearly",
    priority: 0.5,
  }));

  return [
    ...staticRoutes,
    ...toolRoutes,
    ...seoRoutes,
    ...blogRoutes,
    ...legalRoutes,
    ...helpRoutes,
    ...alternativeIndexRoute,
    ...alternativeRoutes,
    ...useCaseIndexRoute,
    ...useCaseRoutes,
    ...authorRoutes,
  ];
}
