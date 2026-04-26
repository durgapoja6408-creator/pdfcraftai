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
    // Bundle G4 (2026-04-26): coverage gap fix. These pages are linked
    // from the global Footer + render via MarketingChrome (so they
    // share nav, ads, JSON-LD, etc.) but were absent from the sitemap.
    // Result: Googlebot could only find them via internal-link crawl —
    // never as first-class sitemap entries with a recommended priority.
    // Adding them so Search Console treats them as indexable surfaces.
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/agent`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/macros`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/bulk`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/changelog`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/careers`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/status`, lastModified: now, changeFrequency: "weekly", priority: 0.3 },
    // Legal pages — low priority but indexable per Google's
    // E-E-A-T expectation that consumer-facing sites publish them.
    { url: `${SITE_URL}/cookies`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/gdpr`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    // Launch-waitlist permalink (Task #3 sub-item 4b). Utility page: the
    // page itself sets `robots: { index: false }`, but we still list it
    // here so the path is a first-class sitemap entry for crawlers that
    // follow sitemap→page and for search console's coverage report.
    { url: `${SITE_URL}/launch-notify`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  // SEO Ship #10 (2026-04-25): tier-aware tool priorities.
  // Free, well-known tools (merge/split/compress/etc.) get higher priority
  // than long-tail niche tools (booklet, n-up, stamp). The split rougly
  // mirrors the head-vs-long-tail distribution in PDF-tool search demand.
  const HEAD_TOOL_IDS = new Set([
    "merge", "split", "compress", "pdf-to-office", "to-pdf", "rotate",
    "page-numbers", "protect", "ai-chat", "ai-summarize", "ai-translate",
    "ai-ocr", "ai-redact", "ai-sign", "ai-table", "ai-compare",
    "edit-pdf", "sign-pdf-free", "redact-free", "highlight-pdf",
  ]);
  const toolRoutes: MetadataRoute.Sitemap = TOOLS.map((t) => ({
    url: `${SITE_URL}/tool/${t.id}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: HEAD_TOOL_IDS.has(t.id) ? 0.85 : 0.65,
  }));

  // SEO Ship #10: head-term landings get higher priority than long-tail.
  // The 20 longform-enriched landings are also our highest-authority pages.
  const HEAD_SEO_SLUGS = new Set([
    "merge-pdf", "split-pdf", "compress-pdf", "pdf-to-word", "translate-pdf",
    "word-to-pdf", "pdf-to-jpg", "jpg-to-pdf", "pdf-to-excel", "edit-pdf",
    "sign-pdf-free", "chat-with-pdf", "summarize-pdf", "ai-pdf-ocr",
    "make-pdf-searchable", "redact-pdf-free", "add-text-to-pdf",
    "highlight-pdf", "resize-pdf", "compare-pdfs",
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
    // Blog posts age — once they're stable, they're stable. Yearly is honest.
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

  // SEO Ship #3 (2026-04-25): comparison ("alternative to X") pages.
  // Priority 0.85 because these are decision-stage pages with the
  // highest conversion intent — higher than head-term landings.
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

  // SEO Ship #4 (2026-04-25): use-case landings.
  // Priority 0.85 — use-case queries are decision-stage like alternatives.
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

  // (Removed: /categories/* landings shipped in #8 then deleted on
  // 2026-04-26 — they were redundant with /tools and too thin to
  // earn link equity. Both /categories and /categories/:slug now
  // 308-redirect to /tools via next.config.mjs.)

  // SEO Ship Bundle A (2026-04-26): author bio pages for E-E-A-T.
  // Priority 0.5 — they're not high-traffic targets but they back up
  // the bylines on every post / longform page with a real Person.
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
