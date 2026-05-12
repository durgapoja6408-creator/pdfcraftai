import type { Metadata } from "next";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import { FaqItem } from "@/components/marketing/FaqItem";
import { CheckoutButton } from "@/components/billing/CheckoutButton";
import { PackUpsellPanel } from "@/components/billing/PackUpsellPanel";
import { SmartCta } from "@/components/marketing/SmartCta";
import { LaunchNotifySignup } from "@/components/geo/LaunchNotifySignup";
import { CREDIT_PACKS, PRICING_FAQ } from "@/lib/pricing";
import { TOOLS, TOOL_STATS } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Credits, not commitments. ${TOOL_STATS.free} free PDF tools forever. AI tools from $5/100 credits. Paid credits never expire.`,
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing",
    description: "Free PDF tools forever. AI tools pay-as-you-go from $5.",
    url: "/pricing",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing",
    description: "Free PDF tools forever. AI tools pay-as-you-go from $5.",
  },
};

// 2026-05-12 — Product + Offer + FAQPage + BreadcrumbList JSON-LD.
// Highest commercial leverage of remaining static-page JSON-LD: SERP
// pricing rich snippets are the single biggest "rich result that
// affects conversion" feature Google ships.
//
// Schema choices:
//
//   - ProductGroup at the top — Google's spec treats "the credit
//     pack lineup" as a product group, with each pack as a Product
//     under hasVariant. This is the right model for SKU families
//     (Starter / Creator / Pro / Studio share the same product
//     concept; differ on quantity + price).
//
//   - Each pack is a Product with two Offers (USD + INR) because we
//     charge dual currencies. Google can pick the appropriate one
//     based on the searcher's locale signal. INR pricing comes from
//     CREDIT_PACKS[i].inrPrice (set per Task #27 below US PPP norm
//     for the Indian market).
//
//   - FAQPage — the PRICING_FAQ entries become Question / Answer
//     pairs. Mirrors the pattern from /compare and SeoLandingPage.
//
//   - BreadcrumbList — Home → Pricing.
//
// All four blocks derive from CREDIT_PACKS + PRICING_FAQ at render
// time, so adding a new pack or updating a price auto-updates the
// schema. Single source of truth: lib/pricing.ts.
const SITE = "https://pdfcraftai.com";
const PRODUCT_JSONLD = {
  "@context": "https://schema.org",
  "@type": "ProductGroup",
  "@id": `${SITE}/pricing#packs`,
  name: "pdfcraftai Credit Packs",
  description:
    "Pay-as-you-go credit packs for AI PDF tools. Paid credits never expire. Free tier covers every non-AI PDF tool forever.",
  url: `${SITE}/pricing`,
  brand: { "@type": "Brand", name: "pdfcraftai" },
  productGroupID: "credit-packs",
  variesBy: ["credits", "price"],
  hasVariant: CREDIT_PACKS.map((pack) => {
    // inrPrice is optional on the CreditPack type but every current
    // entry has it (per Task #27). Guard for future packs that ship
    // without an INR price set — those get a single USD offer.
    const offers: Array<Record<string, unknown>> = [
      {
        "@type": "Offer",
        priceCurrency: "USD",
        price: pack.price.toFixed(2),
        availability: "https://schema.org/InStock",
        url: `${SITE}/buy?pack=${pack.id}`,
      },
    ];
    if (typeof pack.inrPrice === "number") {
      offers.push({
        "@type": "Offer",
        priceCurrency: "INR",
        price: pack.inrPrice.toFixed(2),
        availability: "https://schema.org/InStock",
        url: `${SITE}/buy?pack=${pack.id}&geo=IN`,
      });
    }
    return {
      "@type": "Product",
      name: `${pack.name} pack — ${pack.credits} credits`,
      description: `${pack.tagline}. ${pack.features.join(" · ")}.`,
      sku: `pack-${pack.id}`,
      offers,
    };
  }),
};

const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${SITE}/pricing#faq`,
  mainEntity: PRICING_FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const BREADCRUMB_JSONLD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE },
    {
      "@type": "ListItem",
      position: 2,
      name: "Pricing",
      item: `${SITE}/pricing`,
    },
  ],
};

export default function PricingPage() {
  const aiTools = TOOLS.filter((t) => !t.free);

  return (
    <main>
      {/* Product + FAQ + Breadcrumb JSON-LD — see comments above. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PRODUCT_JSONLD) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(BREADCRUMB_JSONLD),
        }}
      />
      {/* ===== Hero ===== */}
      <section style={{ paddingTop: 100 }}>
        <div className="container-x" style={{ padding: "0 28px", textAlign: "center", maxWidth: 780 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            PRICING
          </div>
          <h1 className="hero-major">Credits, not commitments.</h1>
          <p className="muted" style={{ fontSize: 18, maxWidth: 620, margin: "20px auto 0", lineHeight: 1.55 }}>
            Every free tool runs in your browser — $0 forever. Top up credits for AI features. Paid
            credits never expire.
          </p>
          <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 28, flexWrap: "wrap" }}>
            <span className="chip chip-free">{TOOL_STATS.free} tools · always free</span>
            <span className="chip chip-new">Client-side WASM · no server cost</span>
            <span className="chip chip-ai">AI priced per use</span>
          </div>
          <div className="row" style={{ justifyContent: "center", gap: 12, marginTop: 28 }}>
            <SmartCta
              anon={{ href: "/register", label: "Start free — no card" }}
              authed={{ href: "/app/dashboard", label: "Open dashboard" }}
              className="btn btn-lg btn-primary"
              iconAfter={<I.ArrowRight size={16} />}
            />
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
              <h2 style={{ fontSize: 22, marginBottom: 4 }}>$9/mo · 200 credits every month</h2>
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
      {/*
        Phase E / Task #27 — grid now lives inside PackUpsellPanel which
        also renders the annual/monthly variant toggle and the promo
        code input. PackUpsellPanel is a client component so variant +
        promo state can drive every CheckoutButton in the grid from a
        single source of truth.
       */}
      <section style={{ paddingTop: 56 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <PackUpsellPanel />
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
              <h2 style={{ fontSize: 18, marginBottom: 6 }}>Bring Your Own Key</h2>
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

      {/* ===== Launch waitlist (Tier-2 proactive signup) ===== */}
      {/*
        Task #3 sub-item (4) — proactive "notify me when you launch in
        my country" signup. Renders only a country-picker UI; the actual
        email form appears after a Tier-2 country is picked. Reuses the
        same /api/geo/waitlist route as the checkout-defer flow, but
        with reason=tier2_notify so the signup source is distinguished
        in analytics. Policy: docs/GEO_LAUNCH_POLICY.md §4.
       */}
      <section style={{ paddingTop: 80 }}>
        <div
          className="container-x"
          style={{ padding: "0 28px", maxWidth: 780 }}
        >
          <LaunchNotifySignup source="pricing_country_picker" />
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
