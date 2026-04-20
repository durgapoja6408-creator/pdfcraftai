import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { I } from "@/components/icons/Icons";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "GDPR",
  description:
    "How pdfcraft ai handles GDPR: legal basis, data categories, retention, sub-processors, your rights as a data subject, and how to exercise them.",
  canonical: "/gdpr",
});

const RIGHTS: Array<{ icon: keyof typeof I; title: string; body: string }> = [
  {
    icon: "Eye",
    title: "Access",
    body: "Request a copy of every piece of data we hold about you, in a portable JSON format, within 30 days.",
  },
  {
    icon: "Edit",
    title: "Rectification",
    body: "Correct inaccurate personal data — name, email, billing details — directly from /app/settings or via support.",
  },
  {
    icon: "Trash",
    title: "Erasure",
    body: "Delete your account and all stored documents. Backup retention drops the data within 30 days.",
  },
  {
    icon: "Download",
    title: "Portability",
    body: "Export your file history, billing transactions, and usage logs as a single download.",
  },
  {
    icon: "X",
    title: "Object & restrict",
    body: "Object to processing for analytics or marketing. We honor opt-outs immediately and confirm in writing.",
  },
  {
    icon: "Shield",
    title: "Lodge a complaint",
    body: "You can file with your local supervisory authority. We'd appreciate a heads-up first so we can fix it.",
  },
];

const DATA_CATEGORIES: Array<{ name: string; basis: string; retention: string }> = [
  {
    name: "Account data (email, name, hashed password, OAuth ID)",
    basis: "Contract (Art. 6(1)(b))",
    retention: "Until account deletion + 30 days backup",
  },
  {
    name: "Uploaded files & generated outputs",
    basis: "Contract (Art. 6(1)(b))",
    retention: "Auto-deleted within 60 minutes",
  },
  {
    name: "Billing records & invoices",
    basis: "Legal obligation (Art. 6(1)(c))",
    retention: "10 years (tax law)",
  },
  {
    name: "Product analytics (anonymized GA4, Clarity)",
    basis: "Legitimate interest (Art. 6(1)(f))",
    retention: "14 months",
  },
  {
    name: "Server logs (IP address, request path)",
    basis: "Legitimate interest (security)",
    retention: "30 days",
  },
];

const SUBPROCESSORS: Array<{ vendor: string; purpose: string; region: string }> = [
  { vendor: "Hostinger", purpose: "Application hosting (Node.js, MySQL)", region: "EU (Lithuania)" },
  { vendor: "Cloudflare", purpose: "CDN, DDoS protection, edge cache", region: "Global (EU PoPs preferred)" },
  { vendor: "Google (OAuth + GA4)", purpose: "Sign-in & anonymized analytics", region: "EU/US (SCCs)" },
  { vendor: "Microsoft Clarity", purpose: "Aggregated session metrics", region: "EU/US (SCCs)" },
];

export default function GDPRPage() {
  return (
    <>
      <MarketingHero
        eyebrow="GDPR"
        title={
          <>
            Your data,{" "}
            <span style={{ color: "var(--accent)" }}>your control.</span>
          </>
        }
        subtitle="pdfcraft ai is built to comply with the EU General Data Protection Regulation. Here's exactly what we collect, why, how long we keep it, and how to make us stop."
      />

      <section style={{ padding: "60px 28px", borderTop: "1px solid var(--border)" }}>
        <div className="container-narrow" style={{ display: "grid", gap: 28 }}>
          <header>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              YOUR RIGHTS
            </div>
            <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>
              Six things you can ask us to do.
            </h2>
            <p className="muted" style={{ fontSize: 14, marginTop: 10, lineHeight: 1.6 }}>
              Email{" "}
              <a className="mono" href="mailto:privacy@pdfcraftai.com" style={{ color: "var(--accent)" }}>
                privacy@pdfcraftai.com
              </a>{" "}
              from the address on your account. We respond within 30 days, usually same-week.
            </p>
          </header>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 14,
            }}
          >
            {RIGHTS.map((r) => {
              const Ic = I[r.icon] ?? I.Check;
              return (
                <article key={r.title} className="card" style={{ padding: 18 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      display: "grid",
                      placeItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <Ic size={15} />
                  </div>
                  <h3 style={{ fontSize: 15, margin: "0 0 6px", letterSpacing: "-0.01em" }}>
                    {r.title}
                  </h3>
                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                    {r.body}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        style={{
          padding: "60px 28px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-1)",
        }}
      >
        <div className="container-narrow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            DATA WE PROCESS
          </div>
          <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 18px" }}>
            Categories, basis, and retention.
          </h2>
          <div
            className="card"
            style={{ padding: 0, overflow: "hidden" }}
          >
            <div
              className="mono"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 2fr) minmax(180px, 1fr) minmax(160px, 1fr)",
                padding: "12px 18px",
                background: "var(--bg-2)",
                borderBottom: "1px solid var(--border)",
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "var(--fg-subtle)",
              }}
            >
              <span>CATEGORY</span>
              <span>LEGAL BASIS</span>
              <span style={{ textAlign: "right" }}>RETENTION</span>
            </div>
            {DATA_CATEGORIES.map((d, i) => (
              <div
                key={d.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 2fr) minmax(180px, 1fr) minmax(160px, 1fr)",
                  padding: "14px 18px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  fontSize: 13,
                  alignItems: "center",
                }}
              >
                <span>{d.name}</span>
                <span className="muted">{d.basis}</span>
                <span className="mono subtle" style={{ fontSize: 12, textAlign: "right" }}>
                  {d.retention}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "60px 28px", borderTop: "1px solid var(--border)" }}>
        <div className="container-narrow">
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            SUB-PROCESSORS
          </div>
          <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 14px" }}>
            Who we share data with, and why.
          </h2>
          <p className="muted" style={{ fontSize: 14, marginBottom: 18, lineHeight: 1.6 }}>
            Each vendor has signed standard contractual clauses (SCCs) where required. We notify
            customers of material changes 30 days in advance.
          </p>
          <div className="col" style={{ gap: 10 }}>
            {SUBPROCESSORS.map((s) => (
              <div
                key={s.vendor}
                className="card"
                style={{
                  padding: 16,
                  display: "grid",
                  gridTemplateColumns: "minmax(140px, 1fr) minmax(220px, 2fr) minmax(140px, 1fr)",
                  gap: 14,
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 500, fontSize: 14 }}>{s.vendor}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {s.purpose}
                </span>
                <span className="mono subtle" style={{ fontSize: 12, textAlign: "right" }}>
                  {s.region}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        style={{
          padding: "60px 28px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-1)",
        }}
      >
        <div className="container-narrow" style={{ display: "grid", gap: 14 }}>
          <h2 style={{ fontSize: 24, letterSpacing: "-0.02em", margin: 0 }}>
            Data Protection Officer
          </h2>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Reach our DPO at{" "}
            <a className="mono" href="mailto:dpo@pdfcraftai.com" style={{ color: "var(--accent)" }}>
              dpo@pdfcraftai.com
            </a>
            . For data subject access requests, please confirm your identity by emailing from the
            address tied to your account.
          </p>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            For US-equivalent disclosures, see our{" "}
            <Link href="/privacy" style={{ color: "var(--accent)" }}>
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/dpa" style={{ color: "var(--accent)" }}>
              Data Processing Addendum
            </Link>
            .
          </p>
        </div>
      </section>

      <section style={{ padding: "60px 28px", textAlign: "center" }}>
        <div className="container-narrow">
          <h2 style={{ fontSize: 24, letterSpacing: "-0.02em", margin: "0 0 10px" }}>
            Need a signed DPA?
          </h2>
          <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>
            Standard 2021 SCCs included. We turn them around within 2 business days.
          </p>
          <Link href="/contact" className="btn btn-lg btn-accent">
            Request DPA <I.ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
