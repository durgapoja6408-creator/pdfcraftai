// Landing-page sections ported from the design prototype
// (/mnt/pdfcraftai/landing.jsx). Keeps visuals pixel-identical:
// inline styles + utility classes in globals.css, <Link> for nav.

import Link from "next/link";
import { I } from "@/components/icons/Icons";

type IconKey = keyof typeof I;

// ==================================================================
// Agent promo — "Describe the outcome. Skip the steps."
// ==================================================================
export function AgentPromo() {
  const steps: Array<[IconKey, string, string, string?]> = [
    ["Scan", "Ingest files", "12 receipts detected"],
    ["Scan", "OCR & extract line items", "Vendor · date · total", "24 cr"],
    ["Sparkle", "Categorize by vendor", "Travel · Meals · Software · Office"],
    ["Sparkle", "Draft expense report", "18-page report with totals", "20 cr"],
  ];

  return (
    <section
      style={{
        padding: "100px 28px",
        borderTop: "1px solid var(--border)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div className="grid-bg" style={{ position: "absolute", inset: 0, opacity: 0.4 }} />
      <div className="container-x" style={{ position: "relative" }}>
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 24,
            marginBottom: 32,
          }}
        >
          <div style={{ maxWidth: 620 }}>
            <div className="row" style={{ gap: 8, marginBottom: 16 }}>
              <span className="chip chip-new">
                <I.Sparkle size={10} /> NEW
              </span>
              <span className="eyebrow">AGENT MODE</span>
            </div>
            <h2 style={{ fontSize: 44, margin: "0 0 16px", letterSpacing: "-0.02em" }}>
              Describe the outcome. Skip the steps.
            </h2>
            <p className="muted" style={{ fontSize: 17, lineHeight: 1.55, margin: 0, maxWidth: 560 }}>
              Type what you want in plain English. Agent plans a multi-tool workflow, shows you the
              cost, and runs it end-to-end — from OCR to redact to translate to send.
            </p>
          </div>
          <Link href="/agent" className="btn btn-lg btn-accent">
            <I.Sparkle size={14} /> Try Agent mode <I.ArrowRight size={14} />
          </Link>
        </div>

        <div
          className="card"
          style={{ padding: 0, overflow: "hidden", border: "1px solid var(--border-strong)" }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 360 }}>
            {/* Left: the request */}
            <div
              style={{
                padding: 32,
                borderRight: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div className="row" style={{ gap: 8, marginBottom: 16 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    color: "var(--accent-fg)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  A
                </div>
                <span className="mono subtle" style={{ fontSize: 11 }}>
                  YOU SAID
                </span>
              </div>
              <p
                style={{
                  fontSize: 17,
                  lineHeight: 1.55,
                  margin: "0 0 auto",
                  fontFamily: "var(--font-geist-mono)",
                }}
              >
                &ldquo;Take the 12 receipts in my downloads, OCR them,
                <br />
                categorize by vendor, and produce a monthly expense
                <br />
                report PDF with totals.&rdquo;
              </p>
              <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 24 }}>
                <span className="chip" style={{ fontSize: 10 }}>
                  12 files
                </span>
                <span className="chip" style={{ fontSize: 10 }}>
                  OCR
                </span>
                <span className="chip" style={{ fontSize: 10 }}>
                  Categorize
                </span>
                <span className="chip" style={{ fontSize: 10 }}>
                  Generate
                </span>
              </div>
            </div>
            {/* Right: the plan */}
            <div style={{ padding: 28, background: "var(--bg-1)" }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
                <div className="row" style={{ gap: 8 }}>
                  <I.Flow size={14} style={{ color: "var(--accent)" }} />
                  <span className="mono" style={{ fontSize: 11 }}>
                    AGENT PLAN · 4 STEPS
                  </span>
                </div>
                <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>
                  ~44 credits
                </span>
              </div>
              <div className="col" style={{ gap: 2 }}>
                {steps.map(([ic, n, d, c], i) => {
                  const Ic = I[ic];
                  return (
                    <div
                      key={n}
                      className="row"
                      style={{
                        padding: "10px 0",
                        gap: 12,
                        borderBottom: i < steps.length - 1 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: "var(--bg-2)",
                          color: "var(--fg-muted)",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                          border: "1px solid var(--border)",
                        }}
                      >
                        <span className="mono" style={{ fontSize: 9 }}>
                          {i + 1}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: 6 }}>
                          <Ic size={11} style={{ color: "var(--fg-muted)" }} />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{n}</span>
                        </div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {d}
                        </div>
                      </div>
                      {c && (
                        <span className="chip chip-ai" style={{ fontSize: 10 }}>
                          {c}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <Link
                href="/agent"
                className="btn btn-sm btn-accent"
                style={{ marginTop: 24, width: "100%", justifyContent: "center" }}
              >
                <I.Play size={11} /> Approve &amp; run
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ==================================================================
// Macros promo — "Chain tools. Save as a macro. Run forever."
// ==================================================================
export function MacrosPromo() {
  const nodes = [
    { id: "n1", type: "watch", x: 0, y: 60, label: "Watch folder", color: "blue" },
    { id: "n2", type: "ai_ocr", x: 160, y: 60, label: "OCR", color: "accent" },
    { id: "n3", type: "ai_classify", x: 320, y: 60, label: "Classify", color: "accent" },
    { id: "n4", type: "drive", x: 480, y: 0, label: "Save to Drive", color: "green" },
    { id: "n5", type: "slack", x: 480, y: 120, label: "Post to Slack", color: "green" },
  ];
  const edges: Array<[string, string]> = [
    ["n1", "n2"],
    ["n2", "n3"],
    ["n3", "n4"],
    ["n3", "n5"],
  ];
  const iconMap: Record<string, IconKey> = {
    watch: "File",
    ai_ocr: "Scan",
    ai_classify: "Sparkle",
    drive: "File",
    slack: "Chat",
  };
  const colorMap: Record<string, { bg: string; fg: string }> = {
    blue: { bg: "var(--blue-soft)", fg: "var(--blue)" },
    accent: { bg: "var(--accent-soft)", fg: "var(--accent)" },
    green: { bg: "var(--green-soft)", fg: "var(--green)" },
  };
  const featureStrip: Array<[IconKey, string, string]> = [
    ["Clock", "Run on schedule", "Daily, weekly, cron"],
    ["Code", "Trigger from API", "Webhook + REST"],
    ["File", "Watch a folder", "Drive, Dropbox, S3"],
    ["Star", "Share as template", "Team or community"],
  ];

  return (
    <section
      style={{
        padding: "100px 28px",
        borderTop: "1px solid var(--border)",
        position: "relative",
        overflow: "hidden",
        background: "var(--bg-1)",
      }}
    >
      <div className="container-x" style={{ position: "relative" }}>
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 24,
            marginBottom: 40,
          }}
        >
          <div style={{ maxWidth: 620 }}>
            <div className="row" style={{ gap: 8, marginBottom: 16 }}>
              <span className="chip chip-new">
                <I.Sparkle size={10} /> NEW
              </span>
              <span className="eyebrow">WORKFLOW STUDIO</span>
            </div>
            <h2 style={{ fontSize: 44, margin: "0 0 16px", letterSpacing: "-0.02em" }}>
              Chain tools. Save as a macro. Run forever.
            </h2>
            <p className="muted" style={{ fontSize: 17, lineHeight: 1.55, margin: 0, maxWidth: 560 }}>
              Visual builder for multi-step PDF automations. Drag nodes, wire them up, configure each
              step, and run on demand — or on a schedule, or when a file lands in your inbox.
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Link href="/macros" className="btn btn-lg btn-outline">
              <I.Flow size={14} /> Browse templates
            </Link>
            <Link href="/studio" className="btn btn-lg btn-accent">
              Open Studio <I.ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* Visual: mock studio */}
        <div
          className="card"
          style={{
            padding: 0,
            overflow: "hidden",
            border: "1px solid var(--border-strong)",
            background: "var(--bg)",
          }}
        >
          {/* Chrome bar */}
          <div
            className="row"
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-1)",
              gap: 12,
            }}
          >
            <I.Flow size={14} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Invoice intake</span>
            <span className="chip" style={{ fontSize: 10 }}>
              Draft
            </span>
            <div style={{ flex: 1 }} />
            <span className="mono subtle" style={{ fontSize: 11 }}>
              5 nodes · 4 edges
            </span>
            <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>
              ~5 cr / run
            </span>
            <span className="btn btn-sm btn-accent" style={{ pointerEvents: "none" }}>
              <I.Play size={10} /> Run
            </span>
          </div>
          {/* Canvas */}
          <div style={{ height: 260, position: "relative", overflow: "hidden" }}>
            <div className="grid-bg" style={{ position: "absolute", inset: 0, opacity: 0.45 }} />
            <svg
              width="100%"
              height="260"
              viewBox="-40 0 700 260"
              preserveAspectRatio="xMidYMid meet"
              style={{ position: "absolute", inset: 0 }}
            >
              {/* edges */}
              {edges.map(([from, to], i) => {
                const a = nodes.find((n) => n.id === from)!;
                const b = nodes.find((n) => n.id === to)!;
                const x1 = a.x + 140;
                const y1 = a.y + 90;
                const x2 = b.x;
                const y2 = b.y + 90;
                const cx = (x1 + x2) / 2;
                return (
                  <path
                    key={i}
                    d={`M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`}
                    stroke="var(--fg-muted)"
                    strokeWidth="1.5"
                    fill="none"
                    markerEnd="url(#arr)"
                  />
                );
              })}
              <defs>
                <marker
                  id="arr"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--fg-muted)" />
                </marker>
              </defs>
              {/* nodes */}
              {nodes.map((n) => {
                const Ic = I[iconMap[n.type]] || I.Sparkle;
                const c = colorMap[n.color];
                return (
                  <foreignObject key={n.id} x={n.x} y={n.y + 56} width="140" height="68">
                    <div
                      style={{
                        width: 140,
                        background: "var(--bg-1)",
                        border: "1.5px solid var(--border-strong)",
                        borderRadius: 10,
                        padding: "10px 12px",
                        boxShadow: "var(--shadow)",
                      }}
                    >
                      <div className="row" style={{ gap: 8 }}>
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 5,
                            background: c.bg,
                            color: c.fg,
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Ic size={12} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {n.label}
                          </div>
                          <div
                            className="muted mono"
                            style={{ fontSize: 9, textTransform: "uppercase" }}
                          >
                            {n.type.startsWith("ai_") ? "AI" : n.type}
                          </div>
                        </div>
                      </div>
                    </div>
                  </foreignObject>
                );
              })}
            </svg>
          </div>
          {/* Feature strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              borderTop: "1px solid var(--border)",
              background: "var(--bg-1)",
            }}
          >
            {featureStrip.map(([ic, t, d], i) => {
              const Ic = I[ic];
              return (
                <div
                  key={t}
                  className="row"
                  style={{
                    padding: "16px 20px",
                    gap: 12,
                    borderLeft: i > 0 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: "var(--bg-2)",
                      color: "var(--fg-muted)",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Ic size={13} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {d}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ==================================================================
// How It Works — "Predictable. Transferable. Fair."
// ==================================================================
export function HowItWorks() {
  const items = [
    {
      n: "01",
      t: "Start free",
      d: "All 8 core tools are free forever. No signup to merge, split, or convert. No watermarks, no page limits.",
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
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
      d: "Redact PII, extract clauses, e-sign workflows. SOC 2, DPA, private mode.",
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
      d: "REST API + webhooks. Bring your own key. 99.9% SLA.",
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
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
                <h4 style={{ marginBottom: 8 }}>{a.t}</h4>
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
    "SOC 2 Type II & ISO 27001",
    "DPA available for teams",
    "Private mode: processes in your region",
  ];
  const badges = ["SOC 2", "ISO 27001", "GDPR", "HIPAA*"];

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
              gridTemplateColumns: "1fr 1fr",
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
                Uploads are encrypted in transit and at rest. Files auto-delete within 60 minutes.
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
          <Link href="/signup" className="btn btn-lg btn-ghost">
            Create account
          </Link>
        </div>
      </div>
    </section>
  );
}
