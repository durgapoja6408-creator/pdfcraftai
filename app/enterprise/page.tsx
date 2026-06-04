// /enterprise — sales-qualified-lead landing for SMB / team / enterprise asks.
//
// Plan T1-6 (NEW path identified during PENDING_WORK_ANALYSIS audit):
// pricing tops out at $9/mo Plus pack. Conversations that start with
// "we have 50 employees who need..." currently have nowhere to land —
// they bounce off /pricing or never reach the catalog. This page is
// the explicit intake point for those leads.
//
// Pattern: matches /about/page.tsx — pageMetadata + MarketingHero +
// inline value sections. Posts to the existing /api/contact endpoint
// via ContactForm, with a deep-link query param so the form preselects
// "Sales" as the topic.
//
// This is NOT yet wired to a CRM. The api/contact route logs to stdout
// (per its existing TODO marker for SendGrid/Postmark integration). The
// founder reads via SSH stderr/stdout for now; a future commit will
// wire transactional email or HubSpot intake. Acceptable for low-volume
// inbound leads — the bottleneck is qualifying them, not capturing them.

import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { ContactForm } from "@/components/marketing/ContactForm";
import { I } from "@/components/icons/Icons";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Enterprise & teams",
  description:
    "Shared credit pool, admin console, audit log, custom invoicing, SSO via Google Workspace. Built for teams of 5+ who need PDF tools at scale.",
  canonical: "/enterprise",
});

const FEATURES: Array<{ icon: keyof typeof I; title: string; body: string }> = [
  {
    icon: "User",
    title: "Shared credit pool",
    body: "One billing account, all seats draw from the same pool. No per-seat counting math, no users-running-out-mid-task surprises. Top up once for the whole team.",
  },
  {
    icon: "Shield",
    title: "Admin console + audit log",
    body: "Per-seat usage breakdown, per-tool spend, downloadable activity log. SOC 2 prep / DPDP compliance pre-staging if you need it. Add or remove seats without contacting support.",
  },
  {
    icon: "Lock",
    title: "SSO via Google Workspace",
    body: "Authentication via your existing Google directory — no separate password to manage, automatic deprovisioning when someone leaves. SAML / OIDC available on Enterprise tier.",
  },
  {
    icon: "Coin",
    title: "Custom invoicing + procurement",
    body: "GST-compliant invoices for Indian buyers, EU VAT-OSS for European subsidiaries, NET-30 terms for vendor onboarding, PO numbers on invoices, annual prepay with discount.",
  },
  {
    icon: "Zap",
    title: "Volume pricing",
    body: "Beyond ~1,000 credits/month per organization, per-credit pricing drops 25-40%. Talk to us about predictable monthly tiers vs pay-as-you-go for your usage profile.",
  },
  {
    icon: "Help",
    title: "Priority support",
    body: "Direct Slack channel or shared email alias with founder + on-call. Response within 4 business hours during your timezone, not the queue order. Onboarding assistance + tool training included.",
  },
];

// 2026-05-12 — Service + Organization + BreadcrumbList JSON-LD.
// /enterprise is a sales-qualified-lead landing; the right schema
// shape is Service (the offering itself) + Organization (the company
// providing it). Service.hasOfferCatalog enumerates the FEATURES
// list above as discrete Offer items so Google can render them in
// a richer result panel.
//
// Why Service over SoftwareApplication: the page sells a B2B service
// engagement (custom quote, talk-to-sales) rather than a downloadable
// app. SoftwareApplication is the right schema for individual tool
// pages (handled separately by the SeoLandingPage component); Service
// is the right one for the consultative sales surface.
const SITE = "https://pdfcraftai.com";
const SERVICE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Service",
  "@id": `${SITE}/enterprise#service`,
  name: "pdfcraftai Enterprise — PDF tools for teams of 5+",
  description:
    "Shared credit pool, SSO via Google Workspace, admin console + audit log, GST + EU VAT invoicing, volume pricing. Custom-quoted for teams; self-serve team plan rolls out once we cross ~10 paying teams.",
  url: `${SITE}/enterprise`,
  serviceType: "Enterprise PDF tooling",
  areaServed: { "@type": "Place", name: "Worldwide" },
  audience: { "@type": "Audience", audienceType: "Business" },
  provider: {
    "@type": "Organization",
    name: "pdfcraftai",
    url: SITE,
    logo: { "@type": "ImageObject", url: `${SITE}/icon.svg` },
  },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Enterprise feature catalog",
    itemListElement: FEATURES.map((f, idx) => ({
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: f.title,
        description: f.body,
      },
      position: idx + 1,
    })),
  },
};

const BREADCRUMB_JSONLD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE },
    {
      "@type": "ListItem",
      position: 2,
      name: "Enterprise",
      item: `${SITE}/enterprise`,
    },
  ],
};

export default function EnterprisePage() {
  return (
    <main>
      {/* Service + Breadcrumb JSON-LD — see comments above. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SERVICE_JSONLD) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(BREADCRUMB_JSONLD),
        }}
      />
      <MarketingHero
        eyebrow="ENTERPRISE & TEAMS"
        title="PDF tools for teams of 5+"
        subtitle="Shared credit pool, SSO, admin console, GST + EU VAT invoicing, volume pricing. We don't have a self-serve team plan yet — talk to us and we'll quote a custom one in 24 hours."
        primaryCta={{ href: "#contact", label: "Talk to us" }}
        secondaryCta={{ href: "/pricing", label: "See self-serve pricing" }}
      />

      {/* ===== Features grid ===== */}
      <section style={{ paddingTop: 80 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 1100 }}>
          <h2 className="sr-only">Enterprise capabilities</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {FEATURES.map((f) => {
              const Icon = I[f.icon];
              return (
                <div
                  key={f.title}
                  className="card"
                  style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10 }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "color-mix(in oklab, var(--accent) 12%, transparent)",
                      color: "var(--accent)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <h3 style={{ fontSize: 16, margin: 0 }}>{f.title}</h3>
                  <p
                    className="muted"
                    style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}
                  >
                    {f.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== Honesty section — what we don't yet ship ===== */}
      <section style={{ paddingTop: 64 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 760 }}>
          <div
            className="card"
            style={{
              padding: 24,
              borderColor: "var(--border)",
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--accent) 6%, transparent), transparent)",
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 8, color: "var(--accent)" }}>
              HONEST CAVEATS
            </div>
            <h3 style={{ fontSize: 18, margin: "0 0 12px" }}>
              What we don&apos;t yet ship out-of-the-box
            </h3>
            <ul
              className="muted"
              style={{
                fontSize: 14,
                lineHeight: 1.65,
                paddingLeft: 20,
                marginBottom: 0,
              }}
            >
              <li>
                <strong>Self-serve team plan</strong> — every team contract today is
                a custom quote. We&apos;ll have a $49/seat/mo published plan when we
                cross ~10 paying teams.
              </li>
              <li>
                <strong>SAML SSO + SCIM provisioning</strong> — Google Workspace SSO
                works today; Okta / Azure AD are case-by-case. Genuinely needed by
                Fortune 500-class orgs; we&apos;ll prioritize once we have the demand.
              </li>
              <li>
                <strong>SOC 2 Type II report</strong> — not yet audited. We can
                share our DPDP compliance posture (data export, deletion, breach
                runbook) which covers most procurement asks. SOC 2 audit is on the
                roadmap once ARR justifies the ~$15k annual cost.
              </li>
              <li>
                <strong>Custom data residency</strong> — production runs in EU
                (Hostinger Frankfurt). India data residency requires a separate
                deployment. Possible at $1k+/month commitment.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ===== Contact form ===== */}
      <section id="contact" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div className="container-x" style={{ padding: "0 28px", maxWidth: 720 }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: "var(--accent)" }}>
            TALK TO US
          </div>
          <h2 style={{ fontSize: 26, margin: "0 0 12px" }}>
            Tell us about your team
          </h2>
          <p
            className="muted"
            style={{ fontSize: 15, lineHeight: 1.55, marginBottom: 28 }}
          >
            Pick &quot;Sales&quot; from the topic dropdown and tell us how many seats
            you need + what tools you&apos;d use most. We&apos;ll respond within 24
            business hours with a quote tailored to your usage profile.
          </p>
          <ContactForm />
          <p
            className="subtle"
            style={{
              fontSize: 12,
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
            }}
          >
            Prefer email?{" "}
            <Link href="mailto:support@pdfcraftai.com?subject=Enterprise%20inquiry">
              support@pdfcraftai.com
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
