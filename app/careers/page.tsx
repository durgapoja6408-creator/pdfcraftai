import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { I } from "@/components/icons/Icons";

export const metadata: Metadata = {
  title: "Careers — pdfcraft ai",
  description:
    "Small team, distributed, shipping fast. See open roles or send us your story if you don't see a fit — we'll still read it.",
  alternates: { canonical: "/careers" },
};

const VALUES: Array<{ icon: keyof typeof I; title: string; body: string }> = [
  {
    icon: "Zap",
    title: "Ship small, ship daily",
    body: "We prefer 50 tiny releases to one big one. You own features end-to-end — design, code, telemetry, docs.",
  },
  {
    icon: "Shield",
    title: "Privacy is a principle",
    body: "We don't train on user files. We don't upsell a privacy tier. If a roadmap item weakens that, it doesn't ship.",
  },
  {
    icon: "Flow",
    title: "Tools over meetings",
    body: "Most of the team is async. We document aggressively so decisions live in prose, not in Zoom calls nobody watches.",
  },
];

// Empty array = show "no openings" state. Flip to populated when hiring.
const OPENINGS: Array<{ title: string; team: string; location: string; link: string }> = [];

export default function CareersPage() {
  return (
    <>
      <MarketingHero
        eyebrow="CAREERS"
        title={
          <>
            Build the PDF app you{" "}
            <span style={{ color: "var(--accent)" }}>wish existed.</span>
          </>
        }
        subtitle="Small, distributed team. We ship often, respect your time, and care deeply about craft."
        primaryCta={{ href: "#openings", label: "See open roles" }}
        secondaryCta={{ href: "/about", label: "Why we exist" }}
      />

      <section style={{ padding: "80px 28px", borderTop: "1px solid var(--border)" }}>
        <div className="container-x">
          <div style={{ maxWidth: 640, marginBottom: 28 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              HOW WE WORK
            </div>
            <h2 style={{ fontSize: 30, letterSpacing: "-0.02em", margin: 0 }}>
              The three things we actually argue about.
            </h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 18,
            }}
          >
            {VALUES.map((v) => {
              const Ic = I[v.icon] ?? I.Check;
              return (
                <article key={v.title} className="card" style={{ padding: 24 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      display: "grid",
                      placeItems: "center",
                      marginBottom: 14,
                    }}
                  >
                    <Ic size={18} />
                  </div>
                  <h3 style={{ fontSize: 17, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
                    {v.title}
                  </h3>
                  <p
                    className="muted"
                    style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}
                  >
                    {v.body}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="openings"
        style={{
          padding: "80px 28px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-1)",
          scrollMarginTop: 96,
        }}
      >
        <div className="container-narrow">
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            OPEN ROLES
          </div>
          <h2 style={{ fontSize: 30, letterSpacing: "-0.02em", margin: "0 0 20px" }}>
            What we&apos;re hiring for right now.
          </h2>

          {OPENINGS.length === 0 ? (
            <div
              className="card"
              style={{
                padding: 28,
                textAlign: "center",
                background: "var(--bg-0, transparent)",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto 14px",
                }}
              >
                <I.Coin size={22} />
              </div>
              <h3 style={{ fontSize: 18, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
                No live openings this week.
              </h3>
              <p
                className="muted"
                style={{ fontSize: 14, lineHeight: 1.6, margin: "0 auto 18px", maxWidth: 460 }}
              >
                We still read every introduction. If the mission resonates, send us what you&apos;ve
                shipped and what you&apos;d want to own — we keep a short list.
              </p>
              <a
                href="mailto:careers@pdfcraftai.com?subject=Introduction"
                className="btn btn-lg btn-accent"
              >
                Introduce yourself <I.ArrowRight size={16} />
              </a>
            </div>
          ) : (
            <div className="col" style={{ gap: 12 }}>
              {OPENINGS.map((o) => (
                <a
                  key={o.title}
                  href={o.link}
                  className="card"
                  style={{
                    padding: 20,
                    display: "flex",
                    gap: 16,
                    alignItems: "center",
                    justifyContent: "space-between",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{o.title}</div>
                    <div
                      className="muted"
                      style={{ fontSize: 13, marginTop: 4, display: "flex", gap: 10 }}
                    >
                      <span>{o.team}</span>
                      <span aria-hidden>·</span>
                      <span>{o.location}</span>
                    </div>
                  </div>
                  <I.ArrowRight size={16} />
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ padding: "60px 28px", textAlign: "center" }}>
        <div className="container-narrow">
          <h2 style={{ fontSize: 24, letterSpacing: "-0.02em", margin: "0 0 10px" }}>
            Questions about the team?
          </h2>
          <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>
            Write to{" "}
            <a
              className="mono"
              href="mailto:careers@pdfcraftai.com"
              style={{ color: "var(--accent)" }}
            >
              careers@pdfcraftai.com
            </a>
            . Real humans, real replies.
          </p>
          <Link href="/about" className="btn btn-lg btn-outline">
            Read about us
          </Link>
        </div>
      </section>
    </>
  );
}
