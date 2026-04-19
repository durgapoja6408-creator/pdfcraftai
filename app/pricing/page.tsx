import type { Metadata } from "next";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { FaqItem } from "@/components/marketing/FaqItem";
import { CheckoutButton } from "@/components/billing/CheckoutButton";
import { SmartCta } from "@/components/marketing/SmartCta";
import { CREDIT_PACKS, PRICING_FAQ } from "@/lib/pricing";
import { TOOLS } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Pricing — pdfcraft ai",
  description:
    "Credits, not commitments. 8 free PDF tools forever. AI tools from $5/100 credits. Paid credits never expire.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing — pdfcraft ai",
    description: "Free PDF tools forever. AI tools pay-as-you-go from $5.",
    url: "/pricing",
    type: "website",
  },
};

export default function PricingPage() {
  const aiTools = TOOLS.filter((t) => !t.free);

  return (
    <main>
      {/* ===== Hero ===== */}
      <section style={{ paddingTop: 100 }}>
        <div className="container-x" style={{ padding: "0 28px", textAlign: "center", maxWidth: 780 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            PRICING
          </div>
          <h1 style={{ fontSize: 56, letterSpacing: "-0.03em" }}>Credits, not commitments.</h1>
          <p className="muted" style={{ fontSize: 18, maxWidth: 620, margin: "20px auto 0", lineHeight: 1.55 }}>
            Every free tool runs in your browser — $0 forever. Top up credits for AI features. Paid
            credits never expire.
          </p>
          <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 28, flexWrap: "wrap" }}>
            <span className="chip chip-free">8 tools · always free</span>
            <span className="chip chip-new">Client-side WASM · no server cost</span>
            <span className="chip chip-ai">AI priced per use</span>
          </div>
          <div className="row" style={{ justifyContent: "center", gap: 12, marginTop: 28 }}>
            <SmartCta
              anon={{ href: "/register", label: "Start free — no card" }}
              authed={{ href: "/app/dashboard", label: "Open dashboard" }}
              className="btn btn-lg btn-primary"
            >
              {(label) => (
                <>
                  {label} <I.ArrowRight size={16} />
                </>
              )}
            </SmartCta>
            <Link href="/tools" className="btn btn-lg btn-outline">
              Browse tools
            </Link>
          </div>
        </div>
      </section>

      {/* ===== Monthly Plus promo ===== */}
      <section style={{ paddingTop: 64 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 960 }}>
          <div
            className="card"
            style={{
              padding: 28,
              background:
                "linear-gradient(110deg, color-mix(in oklab, var(--accent) 10%, transparent), transparent 60%)",
              borderColor: "var(--accent-soft)",
              display: "flex",
              gap: 20,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 280 }}>
              <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 8 }}>
                NEW · MONTHLY PLUS
              </div>
              <h3 style={{ fontSize: 22, marginBottom: 4 }}>$9/mo · 200 credits every month</h3>
              <p className="muted" style={{ fontSize: 14 }}>
                Predictable monthly AI quota. Unused credits roll over up to 400. Cancel anytime.
              </p>
            </div>
            <CheckoutButton
              packId="creator"
              label="Start Plus"
              variant="accent"
              size="lg"
              showArrow
            />
          </div>
        </div>
      </section>

      {/* ===== Credit packs grid ===== */}
      <section style={{ paddingTop: 56 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            {CREDIT_PACKS.map((p) => (
              <div
                key={p.id}
                className="card"
                style={{
                  padding: 24,
                  position: "relative",
                  ...(p.popular
                    ? {
                        borderColor: "var(--accent)",
                        boxShadow: "0 0 0 1px var(--accent) inset",
                      }
                    : {}),
                }}
              >
                {p.popular && (
                  <div
                    className="chip chip-ai"
                    style={{
                      position: "absolute",
                      top: -10,
                      right: 16,
                      background: "var(--accent)",
                      color: "white",
                      letterSpacing: "0.08em",
                    }}
                  >
                    POPULAR
                  </div>
                )}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{p.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {p.tagline}
                  </div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div className="row" style={{ alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.02em" }}>
                      ${p.price}
                    </span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      one-time
                    </span>
                  </div>
                  <div className="mono subtle" style={{ fontSize: 12, marginTop: 4 }}>
                    {p.credits.toLocaleString()} credits
                    {p.bonus ? ` · +${p.bonus} bonus` : ""} · ${p.pp.toFixed(3)}/credit
                  </div>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, marginBottom: 20 }}>
                  {p.features.map((f) => (
                    <li
                      key={f}
                      className="row"
                      style={{ gap: 8, fontSize: 13, marginBottom: 8, alignItems: "flex-start" }}
                    >
                      <I.Check size={14} style={{ marginTop: 3, flexShrink: 0, color: "var(--accent)" }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <CheckoutButton
                  packId={p.id}
                  label="Buy pack"
                  variant={p.popular ? "accent" : "outline"}
                  size="lg"
                  fullWidth
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== BYOK card ===== */}
      <section style={{ paddingTop: 56 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 960 }}>
          <div className="card" style={{ padding: 28, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                background: "var(--accent-soft)",
                color: "var(--accent)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <I.Key size={24} />
            </div>
            <div style={{ flex: 1, minWidth: 280 }}>
              <h3 style={{ fontSize: 18, marginBottom: 6 }}>Bring Your Own Key</h3>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>
                Plug in your OpenAI, Anthropic, or Google key. We handle RAG, chunking, retries,
                caching, and audit logs — a flat <strong style={{ color: "var(--fg)" }}>15% infra fee</strong> on
                Pro, or <strong style={{ color: "var(--fg)" }}>$49/seat/mo</strong> on Studio for unlimited BYOK.
              </p>
            </div>
            <Link href="/account" className="btn btn-outline">
              Configure BYOK
            </Link>
          </div>
        </div>
      </section>

      {/* ===== How we keep AI affordable ===== */}
      <section style={{ paddingTop: 80 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div className="eyebrow" style={{ marginBottom: 8, textAlign: "center" }}>
            HOW WE KEEP AI AFFORDABLE (AND FREE TOOLS FREE)
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 14,
              marginTop: 32,
            }}
          >
            <InfoCard
              icon="Shield"
              title="Free tools run in your browser"
              body="Merge, split, compress, rotate, watermark, convert — all WASM. Your files never leave your device."
            />
            <InfoCard
              icon="Zap"
              title="Smart model routing"
              body="Summaries use Haiku, chat uses Sonnet, generation uses Opus only when needed. 3–10× cheaper on 70% of calls."
            />
            <InfoCard
              icon="Clock"
              title="Embedding cache"
              body="Upload once, chat for an hour without re-processing. Same file, same questions = near-zero re-cost."
            />
            <InfoCard
              icon="Check"
              title="Output-capped outputs"
              body="Every tool has a token ceiling. No runaway $20 summaries. Predictable credit math, every time."
            />
          </div>
        </div>
      </section>

      {/* ===== Cost per operation table ===== */}
      <section style={{ paddingTop: 80 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 960 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            COST PER OPERATION
          </div>
          <h2 style={{ fontSize: 28, marginBottom: 24 }}>Every AI tool, what it costs</h2>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {aiTools.map((t, i) => {
              const Ic = I[t.icon];
              return (
                <div
                  key={t.id}
                  className="row"
                  style={{
                    padding: "16px 20px",
                    gap: 16,
                    borderBottom: i < aiTools.length - 1 ? "1px solid var(--border)" : undefined,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Ic size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {t.desc}
                    </div>
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>
                    {t.cost}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section style={{ paddingTop: 80, paddingBottom: 120 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 780 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            FAQ
          </div>
          <h2 style={{ fontSize: 32, marginBottom: 24 }}>Frequently asked</h2>
          <div>
            {PRICING_FAQ.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function InfoCard({ icon, title, body }: { icon: keyof typeof I; title: string; body: string }) {
  const Ic = I[icon];
  return (
    <div className="card" style={{ padding: 20 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "var(--bg-2)",
          display: "grid",
          placeItems: "center",
          marginBottom: 12,
        }}
      >
        <Ic size={18} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{title}</div>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        {body}
      </div>
    </div>
  );
}
