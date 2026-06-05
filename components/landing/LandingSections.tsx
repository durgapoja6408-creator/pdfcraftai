// Landing-page sections ported from the design prototype
// (/mnt/pdfcraftai/landing.jsx). Keeps visuals pixel-identical:
// inline styles + utility classes in globals.css, <Link> for nav.

import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { SmartCta } from "@/components/marketing/SmartCta";
import { TOOL_STATS } from "@/lib/tools";

type IconKey = keyof typeof I;

// ==================================================================
// How It Works — "Predictable. Transferable. Fair."
// ==================================================================
export function HowItWorks() {
  const items = [
    {
      n: "01",
      t: "Start free",
      d: `All ${TOOL_STATS.free} free tools work forever. No signup to merge, split, or convert. No watermarks, no page limits.`,
    },
    {
      n: "02",
      t: "Buy credits when you need AI",
      d: "Packs from $5 to $149. Paid credits never expire (bonus credits expire in 30 days). Share across your team. Transparent per-operation pricing.",
    },
    {
      n: "03",
      t: "Or bring your own key",
      d: "Plug in your OpenAI, Anthropic, or Google key. Pro tier: flat 15% infra fee. Studio: $49/seat/mo for unlimited BYOK. We handle RAG, caching, retries, audit logs.",
    },
  ];

  return (
    <section
      className="section"
      style={{
        background: "var(--bg-1)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="container-x">
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            HOW CREDITS WORK
          </div>
          <h2 style={{ fontSize: 40 }}>Predictable. Transferable. Fair.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 16 }}>
          {items.map((s) => (
            <div key={s.n} className="card" style={{ padding: 28 }}>
              <div className="mono subtle" style={{ marginBottom: 24 }}>
                {s.n}
              </div>
              <h3 style={{ marginBottom: 16 }}>{s.t}</h3>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.55, margin: 0 }}>
                {s.d}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ==================================================================
// Audience — "From students to legal teams"
// ==================================================================
export function Audience() {
  const items: Array<{ t: string; d: string; i: IconKey }> = [
    {
      t: "Legal & finance",
      d: "Redact PII, extract clauses, e-sign workflows. DPA available, private mode, GDPR + DPDP compliant.",
      i: "Shield",
    },
    {
      t: "Knowledge workers",
      d: "Summarize meeting notes, translate reports, chat with docs.",
      i: "Sparkle",
    },
    {
      t: "Students & researchers",
      d: "Cite across papers, extract tables, rewrite in plain language.",
      i: "Book",
    },
    {
      t: "Small business",
      d: "Invoices, contracts, forms — fill, sign, send without licenses.",
      i: "Receipt",
    },
    {
      t: "Developers",
      d: "Bring your own OpenAI, Anthropic or Google key. Flat 15% infra fee — we handle RAG, caching and retries.",
      i: "Code",
    },
    {
      t: "Everyone else",
      d: "The free tools are actually free. No credit card. No nag screens.",
      i: "User",
    },
  ];

  return (
    <section className="section">
      <div className="container-x">
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            BUILT FOR
          </div>
          <h2 style={{ fontSize: 40 }}>From students to legal teams</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12 }}>
          {items.map((a) => {
            const Ic = I[a.i];
            return (
              <div key={a.t} className="card">
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "var(--bg-2)",
                    display: "grid",
                    placeItems: "center",
                    marginBottom: 12,
                    color: "var(--fg-muted)",
                  }}
                >
                  <Ic size={16} />
                </div>
                <h3 style={{ marginBottom: 8, fontSize: 18 }}>{a.t}</h3>
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  {a.d}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ==================================================================
// Security — "Your documents never sit still."
// ==================================================================
export function Security() {
  const bullets = [
    "AES-256 at rest, TLS 1.3 in transit",
    "Zero-retention AI endpoints",
    "SOC 2 Type II + ISO 27001 audit on the roadmap*",
    "DPA available for teams",
    "Private mode: processes in your region",
  ];
  const badges = ["GDPR", "DPDP", "SOC 2*", "ISO 27001*", "HIPAA*"];

  return (
    <section className="section">
      <div className="container-x">
        <div
          className="card"
          style={{
            padding: 48,
            background: "linear-gradient(135deg, var(--bg-1), var(--bg-2))",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
              gap: 48,
              alignItems: "center",
            }}
          >
            <div>
              <div className="eyebrow" style={{ marginBottom: 16 }}>
                SECURITY &amp; PRIVACY
              </div>
              <h2 style={{ fontSize: 36, marginBottom: 24 }}>
                Your documents never sit still.
              </h2>
              <p className="muted" style={{ fontSize: 15, marginBottom: 24 }}>
                Uploads are encrypted in transit. Files are processed in memory and discarded immediately — never persisted on our servers.
                Nothing we process is used to train models — ever.
              </p>
              <div className="col" style={{ gap: 10 }}>
                {bullets.map((x) => (
                  <div key={x} className="row" style={{ gap: 10 }}>
                    <I.Check size={16} style={{ color: "var(--green)" }} />
                    <span style={{ fontSize: 14 }}>{x}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              {badges.map((b) => (
                <div
                  key={b}
                  style={{
                    aspectRatio: "1",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    display: "grid",
                    placeItems: "center",
                    gap: 6,
                    textAlign: "center",
                    padding: 16,
                  }}
                >
                  <I.Shield size={24} style={{ color: "var(--fg-muted)" }} />
                  <div className="mono" style={{ fontSize: 12 }}>
                    {b}
                  </div>
                </div>
              ))}
            </div>
            <p
              style={{
                fontSize: 11,
                color: "var(--fg-subtle)",
                marginTop: 16,
                opacity: 0.75,
                lineHeight: 1.5,
              }}
            >
              * SOC 2 / ISO 27001 / HIPAA: audit on the roadmap, gated
              on ARR (~$15k annual cost — see{" "}
              <a href="/enterprise" style={{ color: "inherit", textDecoration: "underline" }}>
                Enterprise
              </a>{" "}
              for the honest current posture). DPDP-compliant + GDPR-
              aligned today: data export, deletion, breach runbook all
              live. AES-256 at rest + TLS 1.3 in transit + zero-
              retention AI endpoints are factual.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ==================================================================
// Final CTA — "Drop a PDF in. See what happens."
// ==================================================================
export function FinalCTA() {
  return (
    <section className="section">
      <div className="container-narrow" style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 56, letterSpacing: "-0.03em" }}>
          Drop a PDF in.
          <br />
          <span style={{ color: "var(--fg-muted)" }}>See what happens.</span>
        </h2>
        <div
          className="row"
          style={{ justifyContent: "center", gap: 12, marginTop: 32 }}
        >
          <Link href="/tools" className="btn btn-lg btn-primary">
            Open a tool <I.ArrowRight size={16} />
          </Link>
          <SmartCta
            anon={{ href: "/register", label: "Create account" }}
            authed={{ href: "/app/dashboard", label: "Go to dashboard" }}
            className="btn btn-lg btn-ghost"
          />
        </div>
      </div>
    </section>
  );
}
