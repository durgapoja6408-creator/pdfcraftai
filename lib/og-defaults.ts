// lib/og-defaults.ts
//
// 2026-05-12 SEV-2 audit fix: pages that set their own openGraph
// block in Next.js metadata DON'T inherit `images` from the root
// layout — arrays replace rather than merge. The 8 affected pages
// (privacy, terms, refund-policy, cookies, help, blog, about,
// cancellation-policy, dpa) all had og:title + og:description but
// no og:image, so social-share previews on Slack/X/LinkedIn looked
// broken.
//
// Single-source default — every page that needs to keep its own
// openGraph block spreads ...DEFAULT_OG_IMAGES into images.

export const DEFAULT_OG_IMAGES = [
  {
    url: "/og.png",
    width: 1200,
    height: 630,
    alt: "pdfcraft ai — Every PDF tool you need.",
  },
];
