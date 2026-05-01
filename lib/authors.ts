// Author registry for E-E-A-T (Experience, Expertise, Authoritativeness,
// Trust) signals. Each blog post / longform page should attribute to a
// real, identifiable person with a verifiable bio + presence elsewhere
// on the web. Google's quality raters explicitly look for this.
//
// What this enables:
//
//   1. SEO — Person schema (schema.org/Person) on the byline links the
//      content to a named human, which Google weighs for E-E-A-T scoring.
//   2. AdSense — reviewers expect content authored by identifiable
//      people, not anonymous "team" or "admin" entities.
//   3. Trust — readers can click the byline → /about/authors/<slug> to
//      see who wrote what they're reading.
//
// Why a registry instead of inline strings: blog post bylines, longform
// landing-page Article schema, and author-bio pages all need the same
// data. Defining it once means a bio update propagates everywhere.

export type AuthorSlug = "rajasekar-selvam" | "pdfcraft-team";

export type Author = {
  slug: AuthorSlug;
  /** Display name. */
  name: string;
  /** Job title shown next to the name in bylines. */
  role: string;
  /** Single initial used as fallback avatar. */
  initial: string;
  /** 2-3 sentence summary used at the top of the author bio page. */
  shortBio: string;
  /** Long-form bio: 200-400 words covering experience + expertise. */
  longBio: string;
  /** Areas of expertise — used as keywords in the Person schema. */
  expertise: readonly string[];
  /** Verifiable links proving the person is real. Optional but adds trust. */
  links?: {
    /** GitHub profile, if any. */
    github?: string;
    /** LinkedIn URL, if any. */
    linkedin?: string;
    /** Personal site / portfolio. */
    website?: string;
    /** X/Twitter handle (without @). */
    twitter?: string;
  };
};

export const AUTHORS: Record<AuthorSlug, Author> = {
  "rajasekar-selvam": {
    slug: "rajasekar-selvam",
    name: "Rajasekar Selvam",
    role: "Founder · pdfcraft ai",
    initial: "R",
    shortBio:
      "Founder and operator of pdfcraft ai. Builds and ships every PDF tool on this site — 95 of them and counting. Based in Chennai, India.",
    longBio:
      "Rajasekar Selvam founded pdfcraft ai in 2026 with a single bet: most online PDF tools either lock useful features behind expensive subscriptions or stuff free tiers with ads and watermarks. The third option — genuinely free in-browser tools alongside honestly-priced AI features — was an open lane. He has since shipped 95 distinct PDF tools (43 client-side WASM tools that run entirely in your browser, 52 AI-powered tools that pay-as-you-go) and the supporting infrastructure: a Razorpay billing stack, a credit ledger with reconciliation, an admin observability surface, and a 268-URL SEO architecture. He writes the longform content on the head-term landing pages himself, owns the API design, runs incident response on the Hostinger / Cloudflare stack, and answers every support email from support@pdfcraftai.com personally. The pdfcraft ai office is at No. 311, 3rd Cross Street, Eswari Nagar, Chromepet, Chennai, Tamil Nadu 600044, India. Reachable on +91 94984 98011.",
    expertise: [
      "PDF tooling",
      "Next.js / React",
      "Web AI integration (OpenAI, Anthropic)",
      "Payment systems (Razorpay)",
      "Technical SEO",
      "Privacy-first product design",
    ],
    links: {
      website: "https://pdfcraftai.com",
    },
  },

  // The "pdfcraft team" placeholder author exists for posts that
  // genuinely come from the collective rather than from one person
  // (e.g. release notes, status posts). For every other piece, prefer
  // a real person — Google's E-E-A-T scoring penalizes generic
  // "team" attribution on opinion / how-to content.
  "pdfcraft-team": {
    slug: "pdfcraft-team",
    name: "pdfcraft team",
    role: "pdfcraft ai",
    initial: "P",
    shortBio:
      "Posts authored collectively by the pdfcraft ai team — release notes, infrastructure updates, and editorial content where no single author is the right attribution.",
    longBio:
      "The pdfcraft ai team comprises Rajasekar Selvam (founder) and a small group of contractors who help with content production, QA, and customer support. Posts attributed to 'pdfcraft team' are typically release notes, infrastructure announcements, or editorial pieces where the work was a joint effort rather than the product of one author. For tutorial and opinion content, prefer the named-author byline — the named-author bio links back to a verifiable person.",
    expertise: ["PDF tooling", "Web SaaS"],
  },
};

export const AUTHOR_SLUGS = Object.keys(AUTHORS) as AuthorSlug[];

export function authorBySlug(slug: string): Author | null {
  return AUTHORS[slug as AuthorSlug] ?? null;
}
