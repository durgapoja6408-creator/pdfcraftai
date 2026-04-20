import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { ContactForm } from "@/components/marketing/ContactForm";
import { I } from "@/components/icons/Icons";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Contact pdfcraft ai",
  description:
    "Reach support, sales, security, or the press team. We reply within one business day.",
  canonical: "/contact",
});

const CHANNELS: Array<{ icon: keyof typeof I; title: string; email: string; sla: string }> = [
  { icon: "Help", title: "Support", email: "support@pdfcraftai.com", sla: "within 24h" },
  { icon: "Coin", title: "Sales & invoicing", email: "sales@pdfcraftai.com", sla: "within 1 business day" },
  { icon: "Shield", title: "Security / responsible disclosure", email: "security@pdfcraftai.com", sla: "within 48h" },
  { icon: "Globe", title: "Press", email: "press@pdfcraftai.com", sla: "within 3 business days" },
];

export default function ContactPage() {
  return (
    <>
      <MarketingHero
        eyebrow="CONTACT"
        title="We read everything."
        subtitle="Bugs, feature requests, sales questions, vulnerability reports — send them all. A real human will reply."
      />

      <section style={{ padding: "40px 28px 80px", borderTop: "1px solid var(--border)" }}>
        <div
          className="container-x"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
            gap: 40,
          }}
        >
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              SEND US A MESSAGE
            </div>
            <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 20px" }}>
              Tell us what&apos;s on your mind.
            </h2>
            <ContactForm />
          </div>

          <aside>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              OR EMAIL DIRECTLY
            </div>
            <div className="col" style={{ gap: 12 }}>
              {CHANNELS.map((c) => {
                const Ic = I[c.icon];
                return (
                  <a
                    key={c.email}
                    href={`mailto:${c.email}`}
                    className="card"
                    style={{
                      padding: 16,
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <span
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
                      <Ic size={14} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{c.title}</div>
                      <div
                        className="mono"
                        style={{
                          fontSize: 12,
                          color: "var(--accent)",
                          marginTop: 2,
                          wordBreak: "break-all",
                        }}
                      >
                        {c.email}
                      </div>
                      <div
                        className="subtle"
                        style={{ fontSize: 11, marginTop: 4 }}
                      >
                        Reply {c.sla}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>

            <div
              className="card"
              style={{
                padding: 16,
                marginTop: 16,
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                REGISTERED OFFICE
              </div>
              <address style={{ fontStyle: "normal", fontSize: 13, lineHeight: 1.6 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>
                  pdfcraft ai
                </div>
                <div className="muted">
                  Operated by Rajasekar Selvam
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  No. 311, 3rd Cross Street
                  <br />
                  Eswari Nagar, Chromepet
                  <br />
                  Chennai, Tamil Nadu 600044
                  <br />
                  India
                </div>
                <div style={{ marginTop: 10 }}>
                  <a
                    href="tel:+919498498011"
                    className="mono"
                    style={{
                      color: "var(--accent)",
                      textDecoration: "none",
                      fontSize: 12,
                    }}
                  >
                    +91 94984 98011
                  </a>
                </div>
              </address>
            </div>

            <div
              className="card"
              style={{
                padding: 16,
                marginTop: 16,
                background: "var(--bg-2)",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              <div className="row" style={{ gap: 8, marginBottom: 8, color: "var(--accent)" }}>
                <I.Info size={14} />
                <strong>Looking for help docs?</strong>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                Most answers live in the{" "}
                <Link href="/help" style={{ color: "var(--accent)" }}>
                  Help center
                </Link>
                . For release notes see{" "}
                <Link href="/changelog" style={{ color: "var(--accent)" }}>
                  Changelog
                </Link>
                .
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
