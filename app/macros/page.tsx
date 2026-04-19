import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { I } from "@/components/icons/Icons";

export const metadata: Metadata = {
  title: "Macros — record once, replay forever",
  description:
    "Record a multi-step PDF workflow once, then replay it on any folder. Share with your team, schedule it, or trigger it from the API.",
  alternates: { canonical: "/macros" },
};

const FEATURES: Array<{ icon: keyof typeof I; title: string; body: string }> = [
  {
    icon: "Flow",
    title: "Visual step editor",
    body: "Drag, reorder, branch, and annotate every step. No YAML, no scripts, no DSL to learn.",
  },
  {
    icon: "Clock",
    title: "Scheduled runs",
    body: "Trigger a macro hourly, daily, or on a webhook. Every run is logged with inputs and outputs.",
  },
  {
    icon: "User",
    title: "Share with your team",
    body: "Publish a macro to your workspace. Teammates run it with their own credits; you keep authorship.",
  },
  {
    icon: "Code",
    title: "API triggers",
    body: "Call POST /v1/macros/:id/run from anywhere. JSON in, JSON plus files out.",
  },
  {
    icon: "Shield",
    title: "Private by default",
    body: "Macros run in your workspace with the same 60-minute auto-delete as every other tool.",
  },
  {
    icon: "Sparkle",
    title: "AI-assisted editing",
    body: "Explain what you want to change; the macro editor proposes the diff for you to approve.",
  },
];

export default function MacrosPage() {
  return (
    <>
      <MarketingHero
        chip={{ label: "MACROS", tone: "ai" }}
        eyebrow="WORKFLOW STUDIO"
        title={
          <>
            Record once.
            <br />
            <span style={{ color: "var(--accent)" }}>Replay forever.</span>
          </>
        }
        subtitle="Most office PDF work is the same ten steps every Monday. Turn that routine into a macro — one click, the whole team, or an API call."
        primaryCta={{ href: "/register", label: "Start building" }}
        secondaryCta={{ href: "/agent", label: "Agent mode instead" }}
      />

      <section style={{ padding: "80px 28px", borderTop: "1px solid var(--border)" }}>
        <div className="container-x">
          <div style={{ maxWidth: 640, marginBottom: 40 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              WHAT&apos;S IN THE BOX
            </div>
            <h2 style={{ fontSize: 36, letterSpacing: "-0.02em", margin: 0 }}>
              The missing automation layer for PDFs.
            </h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 18,
            }}
          >
            {FEATURES.map((f) => {
              const Ic = I[f.icon];
              return (
                <article key={f.title} className="card" style={{ padding: 22 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 9,
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      display: "grid",
                      placeItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <Ic size={16} />
                  </div>
                  <h3 style={{ fontSize: 16, margin: "0 0 6px", letterSpacing: "-0.01em" }}>
                    {f.title}
                  </h3>
                  <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.55, margin: 0 }}>
                    {f.body}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ padding: "80px 28px", textAlign: "center" }}>
        <div className="container-narrow">
          <h2 style={{ fontSize: 34, letterSpacing: "-0.02em", margin: "0 0 12px" }}>
            Stop repeating yourself every Monday.
          </h2>
          <p className="muted" style={{ fontSize: 16, marginBottom: 24 }}>
            Free to record. Credits only when AI steps run.
          </p>
          <div className="row" style={{ justifyContent: "center", gap: 12 }}>
            <Link href="/register" className="btn btn-lg btn-accent">
              Create your first macro <I.ArrowRight size={16} />
            </Link>
            <Link href="/pricing" className="btn btn-lg btn-outline">
              Pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
