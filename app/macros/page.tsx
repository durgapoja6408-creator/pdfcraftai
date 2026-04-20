// app/macros/page.tsx
// Public Macros library page. Server component owns SEO metadata; mounts the
// client-side <MacroLibrary/> below (templates + user-saved macros from
// localStorage). The marketing feature grid + CTA remain as secondary sections
// under the library for visitors who haven't scrolled through the home page.

import type { Metadata } from "next";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { MacroLibrary } from "@/components/workflow/MacroLibrary";

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
      <MacroLibrary />

      {/* Feature grid — kept as a secondary section beneath the library for SEO
          and to explain the product to first-time visitors. */}
      <section style={{ padding: "72px 28px", borderTop: "1px solid var(--border)" }}>
        <div className="container-x">
          <div style={{ maxWidth: 640, marginBottom: 40 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              WHAT&apos;S IN THE BOX
            </div>
            <h2 style={{ fontSize: 32, letterSpacing: "-0.02em", margin: 0 }}>
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

      <section style={{ padding: "72px 28px", textAlign: "center" }}>
        <div className="container-narrow">
          <h2 style={{ fontSize: 32, letterSpacing: "-0.02em", margin: "0 0 12px" }}>
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
