import type { Metadata } from "next";
import { DEFAULT_OG_IMAGES } from "./og-defaults";

// pageMetadata — small helper that builds a per-page Next.js Metadata
// object with matching openGraph + twitter blocks, so social share cards
// show the page-specific title and description instead of falling back
// to the homepage's generic ones.
//
// Background: Next 14 App Router shallow-merges metadata, so if a child
// page only sets top-level `title` and `description`, it still inherits
// the root layout's `openGraph.title` + `openGraph.description` verbatim.
// The 2026-04-20 production readiness audit flagged this as SEV-2: every
// non-home route was shipping the homepage's og:title / og:description
// on Twitter/LinkedIn/Slack share cards.
//
// This helper keeps callers DRY and guarantees the three title/description
// pairs (root metadata, openGraph, twitter) stay in sync.
//
// Usage:
//   export const metadata = pageMetadata({
//     title: "About pdfcraft ai",          // rendered as <title>
//     description: "Why we built…",         // rendered as <meta description>
//     canonical: "/about",                  // rendered as <link rel=canonical>
//     // optional: override the shared title/description for social cards
//     og: { title: "About – crafted for PDF power users" },
//   });

type TitleDescription = {
  title?: string;
  description?: string;
};

export type PageMetadataInput = {
  title: string;
  description: string;
  /** Canonical path, e.g. "/about" — resolved against `metadataBase`. */
  canonical?: string;
  /** Override og:title / og:description on the share card (falls back to title / description). */
  og?: TitleDescription;
  /** Override twitter:title / twitter:description on the share card (falls back to og, then title / description). */
  twitter?: TitleDescription;
  /**
   * Optional robots directive. Use for utility pages that shouldn't
   * compete in search (`{ index: false, follow: true }` for surfaces
   * like /launch-notify) or authenticated shells (`{ index: false,
   * follow: false }` for /app/*). Auth pages currently hand-roll their
   * Metadata object; they can migrate into this helper at their
   * leisure to get OG/Twitter parity as a side effect.
   *
   * Why plumbed through the helper rather than a separate export:
   *   `export const robots` is a valid Next 14 file-level convention,
   *   but it lives in a separate file-level slot from `metadata` and
   *   silently diverges if callers forget to update both. Keeping it
   *   inside the metadata object guarantees one source of truth.
   */
  robots?: { index?: boolean; follow?: boolean };
};

export function pageMetadata(input: PageMetadataInput): Metadata {
  const ogTitle = input.og?.title ?? input.title;
  const ogDescription = input.og?.description ?? input.description;
  const twitterTitle = input.twitter?.title ?? ogTitle;
  const twitterDescription = input.twitter?.description ?? ogDescription;

  const meta: Metadata = {
    title: input.title,
    description: input.description,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      // Set og:url whenever we have a canonical path. Without this,
      // scrapers that rely on og:url (Slack, LinkedIn, some indexers)
      // fall back to the request URL — which is fine for direct hits
      // but drops query params / can disagree with our canonical. Also
      // lets the helper drive og:type consistently ("website" is the
      // right default for marketing + legal pages that call through
      // this helper).
      ...(input.canonical ? { url: input.canonical, type: "website" } : {}),
      // 2026-05-12 SEV-2 audit fix: explicitly include og:image.
      // Root layout sets it, but when a page sets its own openGraph
      // block, arrays REPLACE rather than merge — so the default
      // image gets dropped. Spread DEFAULT_OG_IMAGES here so the
      // helper-driven pages always keep the image. Pages that need
      // a custom image override via `input.og.images`.
      images: DEFAULT_OG_IMAGES,
    },
    twitter: {
      card: "summary_large_image",
      title: twitterTitle,
      description: twitterDescription,
      images: DEFAULT_OG_IMAGES.map((i) => ({ url: i.url, alt: i.alt })),
    },
  };

  if (input.canonical) {
    meta.alternates = { canonical: input.canonical };
  }

  if (input.robots) {
    meta.robots = input.robots;
  }

  return meta;
}
