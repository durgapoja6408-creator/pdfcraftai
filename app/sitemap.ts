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
  // 2026-04-30 — slugs that 308-redirect to a canonical destination
  // (commits 89cd1e8 + cadf27c). Best-practice SEO: sitemap.xml
  // should contain only canonical URLs (200), not redirect sources.
  // Google handles redirect-sourced sitemap entries OK (follows the
  // 308 and indexes the destination), but listing the canonical
  // /tool/<id> directly is cleaner — fewer redirect hops in the
  // crawler's path = better crawl efficiency + tighter index
  // alignment.
  //
  // The destinations are already in toolRoutes above, so this
  // exclusion is purely subtractive — no SEO loss, just
  // canonicalization.
  //
  // CRITICAL: keep this list in sync with the redirects() block in
  // next.config.mjs. The `redirect-destinations` static guard
  // (scripts/test-redirect-destinations.mjs) catches redirect
  // destinations that go dead, but doesn't catch this side. Check
  // both files when adding/removing slugs.
  const REDIRECTED_SEO_SLUGS = new Set([
    // First-pass redirects (commit 89cd1e8) — slugs without
    // app/<slug>/page.tsx, redirect to /tool/<id> or /tools.
    "merge-pdf", "split-pdf", "compress-pdf", "word-to-pdf",
    "excel-to-pdf", "powerpoint-to-pdf", "jpg-to-pdf", "png-to-pdf",
    "extract-pdf-pages", "delete-pdf-pages", "pdf-page-count",
    "resize-pdf", "remove-pdf-metadata", "add-logo-to-pdf",
    "add-text-to-pdf", "highlight-pdf", "redact-pdf-free",
    // 2026-05-02: extract-pdf-attachments + edit-pdf REMOVED — real
    // SEO landings shipped today. Slugs now render via app/<slug>/
    // page.tsx and belong in sitemap as canonical URLs.
    "sign-pdf-free",
    "repair-pdf", "flatten-pdf",
    // 2026-05-02: markdown-to-pdf REMOVED — real landing shipped
    // (the previous /markdown-to-pdf → /tool/pdf-to-markdown
    // redirect was pointing at the OPPOSITE direction tool).
    "text-to-pdf",
    "extract-pdf-form-data", "reorder-pdf-pages",
    // 2026-05-02: extract-emails-from-pdf REMOVED — real landing
    // shipped today (extract-contacts tool wired through SEO landing).
    "extract-entities-from-pdf",
    "stamp-pdf", "n-up-pdf",
    // 2026-05-02: grayscale-pdf REMOVED — real landing shipped today.
    "strip-links",
    // 2026-05-02: booklet-pdf REMOVED — real landing shipped today.
    "free-draw-pdf", "add-links",
    // Second-pass redirects (commit cadf27c) — slugs with
    // app/<slug>/page.tsx but broken-render via dead tool: ref.
    "pdf-to-word", "pdf-to-excel", "pdf-to-powerpoint",
    // 2026-05-02: pdf-to-ics-calendar + court-judgment-summarizer
    // REMOVED — real tools shipped today (extract-dates, ai-court-
    // order); existing app/<slug>/page.tsx files now render the
    // canonical landings instead of being intercepted by 308s.
  ]);
  const seoRoutes: MetadataRoute.Sitemap = SEO_SLUGS
    .filter((slug) => !REDIRECTED_SEO_SLUGS.has(slug))
    .map((slug) => ({
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
