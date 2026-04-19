import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { I } from "@/components/icons/Icons";

export const metadata: Metadata = {
  title: "Changelog — pdfcraft ai",
  description:
    "Every shipped change to pdfcraft ai. New tools, performance wins, security improvements, and bug fixes — sorted newest first.",
  alternates: { canonical: "/changelog" },
};

type Tag = "NEW" | "IMPROVED" | "FIXED" | "SECURITY";

type Entry = {
  date: string;
  version?: string;
  title: string;
  body: string;
  tags: Tag[];
};

// Newest first. Update with each release.
const ENTRIES: Entry[] = [
  {
    date: "2026-04-20",
    version: "0.9.4",
    title: "Sitewide auth experience polish",
    body:
      "New TopNav with avatar, click-outside / Esc-to-close menu, mobile hamburger, and full session awareness. Login, register, signup, and forgot-password all share a unified shell with the same tokens. Marketing chrome auto-hides on auth pages.",
    tags: ["NEW", "IMPROVED"],
  },
  {
    date: "2026-04-20",
    version: "0.9.3",
    title: "Marketing pages: Agent, Macros, Bulk, About, Contact",
    body:
      "New top-level pages for the work-in-progress Agent and Macros modes, the Bulk processor, an About page that explains what we optimize for, and a real Contact page with topic-aware routing to support / sales / security / press.",
    tags: ["NEW"],
  },
  {
    date: "2026-04-20",
    title: "GA4 + Microsoft Clarity wired in",
    body:
      "Site-level analytics live. We don't track personal data, just page views and broad usage so we know which tools to invest in.",
    tags: ["IMPROVED"],
  },
  {
    date: "2026-04-19",
    title: "Sign-in & sign-up flows shipped",
    body:
      "NextAuth v5 with Credentials + Google. Edge-safe middleware redirects logged-in users away from auth pages. Sessions persist via JWT with the Drizzle adapter on MySQL.",
    tags: ["NEW", "SECURITY"],
  },
  {
    date: "2026-04-18",
    title: "Hostinger + Cloudflare production cutover",
    body:
      "pdfcraftai.com is fully proxied through Cloudflare with auto-deploy from the main branch. New 503-after-deploy runbook documented in DEPLOYMENT_NOTES.md.",
    tags: ["IMPROVED"],
  },
];

const TAG_STYLE: Record<Tag, { bg: string; fg: string }> = {
  NEW: { bg: "color-mix(in oklab, var(--accent) 15%, transparent)", fg: "var(--accent)" },
  IMPROVED: {
    bg: "color-mix(in oklab, var(--green, #10b981) 15%, transparent)",
    fg: "var(--green, #10b981)",
  },
  FIXED: {
    bg: "color-mix(in oklab, #f59e0b 18%, transparent)",
    fg: "#d97706",
  },
  SECURITY: {
    bg: "color-mix(in oklab, var(--danger, #ef4444) 14%, transparent)",
    fg: "var(--danger, #ef4444)",
  },
};

export default function ChangelogPage() {
  return (
    <>
      <MarketingHero
        eyebrow="CHANGELOG"
        title="What we shipped, sorted newest first."
        subtitle="Small team, frequent releases. The boring fixes get a line too."
        primaryCta={{ href: "/register", label: "Try the latest" }}
        secondaryCta={{ href: "https://github.com/durgapoja6408-creator/pdfcraftai", label: "Source on GitHub" }}
      />

      <section style={{ padding: "40px 28px 80px", borderTop: "1px solid var(--border)" }}>
        <div className="container-narrow" style={{ display: "grid", gap: 18 }}>
          {ENTRIES.map((e) => (
            <article key={e.date + e.title} className="card" style={{ padding: 24 }}>
              <header
                className="row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {e.tags.map((t) => (
                    <span
                      key={t}
                      className="mono"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.08em",
                        background: TAG_STYLE[t].bg,
                        color: TAG_STYLE[t].fg,
                        padding: "3px 8px",
                        borderRadius: 6,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="row" style={{ gap: 8, fontSize: 12, color: "var(--fg-subtle)" }}>
                  {e.version && <span className="mono">v{e.version}</span>}
                  <span className="mono">{e.date}</span>
                </div>
              </header>
              <h3 style={{ fontSize: 18, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
                {e.title}
              </h3>
              <p
                className="muted"
                style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}
              >
                {e.body}
              </p>
            </article>
          ))}

          <div
            className="card"
            style={{ padding: 20, textAlign: "center", background: "var(--bg-2)" }}
          >
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Want release notes by email?{" "}
              <Link href="/contact" style={{ color: "var(--accent)" }}>
                Tell us
              </Link>{" "}
              and we&apos;ll add you to the list when it goes live.
            </p>
          </div>
        </div>
      </section>

      <section
        style={{
          padding: "60px 28px",
          textAlign: "center",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-1)",
        }}
      >
        <div className="container-narrow">
          <h2 style={{ fontSize: 26, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
            Found a regression?
          </h2>
          <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
            We treat regressions like outages — file it and we&apos;ll triage same-day.
          </p>
          <Link href="/contact" className="btn btn-lg btn-accent">
            Report it <I.ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
