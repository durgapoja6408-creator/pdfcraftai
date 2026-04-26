// House promo content shown in AdSlot positions when Google AdSense
// isn't active OR the visitor hasn't consented to ad cookies.
//
// Two-key lookup: by slot name (where on the page) AND by context
// (which page). Different contexts surface different promos so the
// promo always feels relevant ("you're reading about contracts → try
// AI Compare", not "you're reading anything → try our most-expensive
// AI tool").
//
// Adding a new promo: just add an entry. The AdSlot component picks
// the most-specific match (slot + context); falls back to the
// slot-level default; falls back to a global default that promotes
// the AI Chat tool (highest-converting AI tool we have).

import type { AdSlotName } from "./ads-config";

export type HousePromo = {
  /** ~6 word eyebrow shown above the headline. */
  eyebrow: string;
  /** Headline — the value prop. */
  headline: string;
  /** Body — 1-2 sentences elaborating. */
  body: string;
  /** CTA button text. */
  cta: string;
  /** CTA destination — typically a /tool/<id> page. */
  href: string;
};

/**
 * Per-slot, per-context promo lookup.
 *
 * `default` is the fallback when no context-specific promo exists.
 * Always include a `default` for every slot so the AdSlot never
 * renders empty.
 */
export const AD_SLOTS: Record<
  AdSlotName,
  { default: HousePromo; byContext?: Record<string, HousePromo> }
> = {
  // Bottom of every blog post.
  "article-end": {
    default: {
      eyebrow: "Try this next",
      headline: "Chat with any PDF",
      body: "Ask questions, get answers cited to specific pages. 5 questions free per document.",
      cta: "Open Chat with PDF",
      href: "/tool/ai-chat",
    },
    byContext: {
      "redact-pdf-properly": {
        eyebrow: "Try this next",
        headline: "Auto-detect PII before sharing",
        body: "AI Redact spots names, emails, phone numbers, and SSNs across your PDF and lets you accept or reject each one.",
        cta: "Try AI Redact",
        href: "/tool/ai-redact",
      },
      "compress-pdf-for-email-the-5mb-problem": {
        eyebrow: "Try this next",
        headline: "Hit your email's size cap precisely",
        body: "Set a target size and Compress iterates JPEG quality + DPI until it lands just under your number.",
        cta: "Open Compress PDF",
        href: "/tool/compress",
      },
      "chat-with-pdf-prompts-that-work": {
        eyebrow: "Try this next",
        headline: "Get a one-paragraph TL;DR",
        body: "Same retrieval pipeline as Chat, but condensed to a single tight paragraph. 2 credits.",
        cta: "Open TL;DR Generator",
        href: "/tool/ai-tldr",
      },
      "translate-pdf-without-breaking-layout": {
        eyebrow: "Try this next",
        headline: "Translate while preserving layout",
        body: "Tables stay tables, headings stay headings, page references stay aligned. 90+ languages.",
        cta: "Try AI Translate",
        href: "/tool/ai-translate",
      },
      "ocr-scanned-pdf-make-searchable": {
        eyebrow: "Try this next",
        headline: "OCR with structure detection",
        body: "Adds a hidden text layer to your scan AND detects tables, headings, and lists. The PDF looks identical, behaves like a text PDF.",
        cta: "Try AI OCR",
        href: "/tool/ai-ocr",
      },
      "compare-two-contract-versions-without-word": {
        eyebrow: "Try this next",
        headline: "Diff with severity classification",
        body: "AI Compare flags every change as cosmetic, material, or critical. Read the 3 that matter, skip the 47 that don't.",
        cta: "Try AI Compare",
        href: "/tool/ai-compare",
      },
    },
  },

  // Bottom of every /alternatives/<competitor> page.
  "alternative-end": {
    default: {
      eyebrow: "Try us free",
      headline: "All 50+ AI tools at $4/month",
      body: "No daily caps, no per-task limits. AI Chat, Summarize, Translate, OCR, Redact, Compare — all included.",
      cta: "See pricing",
      href: "/pricing",
    },
    byContext: {
      ilovepdf: {
        eyebrow: "Try us free",
        headline: "50+ AI tools iLovePDF doesn't have",
        body: "Chat with PDF, AI Redact, AI Compare, layout-preserving Translate. Try any of them free.",
        cta: "Browse AI tools",
        href: "/tools",
      },
      smallpdf: {
        eyebrow: "Try us free",
        headline: "Unlimited free tier — no 2-task daily cap",
        body: "Same operations as Smallpdf, no per-day limits. 43 free tools running entirely in your browser.",
        cta: "Browse free tools",
        href: "/tools",
      },
      "adobe-acrobat": {
        eyebrow: "One-fifth the price",
        headline: "Same operations, $4/month vs $20/month",
        body: "Edit, merge, compress, OCR, sign — same daily PDF jobs as Acrobat, at one-fifth the price.",
        cta: "See pricing",
        href: "/pricing",
      },
    },
  },

  // Bottom of every /use-cases/<workflow> page.
  "use-case-end": {
    default: {
      eyebrow: "Save this workflow",
      headline: "Run multi-step PDF workflows on autopilot",
      body: "Macros chain steps so you don't redo the same job. Drop a folder, get a folder out.",
      cta: "Learn about Macros",
      href: "/macros",
    },
  },

  // Mid-page on the top-20 longform SEO landings (between Why-pdfcraft
  // section and the longform article body).
  "seo-landing-mid": {
    default: {
      eyebrow: "Most popular AI tool",
      headline: "Chat with any PDF — 5 questions free",
      body: "Upload a PDF, ask questions in plain English. Every answer cites the page it came from.",
      cta: "Try Chat with PDF",
      href: "/tool/ai-chat",
    },
  },

  // Bundle E (2026-04-26): /tools catalog page (high-traffic SEO
  // landing for users browsing the full tool grid).
  "tools-catalog": {
    default: {
      eyebrow: "Save your favourite chains",
      headline: "Turn 3-step workflows into 1-click Macros",
      body: "Combine any tools — merge → compress → translate — and re-run them on a folder of PDFs.",
      cta: "Learn about Macros",
      href: "/macros",
    },
  },

  // Bundle E (2026-04-26): bottom of every /tool/[id] runner page,
  // between reassurance row and Related Tools section. Context = tool id
  // so we can promote a complementary tool ("you're using merge → try
  // split", "you're using compress → try AI summarize").
  "tool-runner-end": {
    default: {
      eyebrow: "Try this next",
      headline: "Chat with any PDF — 5 questions free",
      body: "Upload a PDF, ask questions in plain English. Every answer cites the page it came from.",
      cta: "Try Chat with PDF",
      href: "/tool/ai-chat",
    },
    byContext: {
      merge: {
        eyebrow: "Used Merge? Try Split",
        headline: "Pull out specific page ranges as separate files",
        body: "Inverse of merge — useful for sending just chapter 4, or splitting bank-statement PDFs by month.",
        cta: "Open Split PDF",
        href: "/tool/split",
      },
      split: {
        eyebrow: "Used Split? Try Merge",
        headline: "Combine the pieces back into one document",
        body: "Drag, drop, reorder. Bookmarks and hyperlinks reconciled to the new page numbers.",
        cta: "Open Merge PDFs",
        href: "/tool/merge",
      },
      compress: {
        eyebrow: "Already compressed? Summarize next",
        headline: "Get the gist without reading the whole thing",
        body: "AI Summarize gives an executive summary plus per-section bullets, each cited by page.",
        cta: "Try AI Summarize",
        href: "/tool/ai-summarize",
      },
      "pdf-to-office": {
        eyebrow: "Going beyond conversion",
        headline: "Extract just the tables as Excel",
        body: "AI Table reads tables visually and gives you a clean .xlsx — no manual cleanup.",
        cta: "Try AI Table",
        href: "/tool/ai-table",
      },
      "ai-summarize": {
        eyebrow: "Going deeper",
        headline: "Ask follow-up questions instead",
        body: "Chat with PDF gives you the same retrieval pipeline — keep digging until you have what you need.",
        cta: "Open Chat with PDF",
        href: "/tool/ai-chat",
      },
    },
  },
};

/**
 * Resolve which promo to show for a given slot + context combo.
 *
 * Resolution order:
 *   1. Slot-specific promo for this exact context
 *   2. Slot's `default` promo
 *   3. (cannot fall through — every slot has a default)
 */
export function resolvePromo(slot: AdSlotName, context?: string): HousePromo {
  const config = AD_SLOTS[slot];
  if (context && config.byContext?.[context]) {
    return config.byContext[context];
  }
  return config.default;
}
