// app/cookies/page.tsx — Cookie policy + per-category listing.
//
// Task #24 / Phase D.
//
// Why a dedicated page:
// ---------------------
// The banner at the bottom of every page is an abbreviated CTA; it's
// not compliant on its own. EDPB Guidelines 05/2020 §3.3.2, ICO's
// 2023 cookie guidance, and DPDP Act 2023 s. 6 all effectively
// require:
//
//   (a) a full list of cookies + their purposes accessible BEFORE
//       the user consents,
//   (b) the ability to WITHDRAW consent as easily as it was given
//       (GDPR Art. 7(3), DPDP s. 6(3)),
//   (c) a description of any third-country transfers involved in the
//       non-essential cookies (DPDP s. 16, GDPR Chapter V).
//
// This page satisfies all three: it lists every cookie we set, the
// category, the retention period, and where the data goes, and it
// exposes a one-click "Reset cookie preferences" button (which
// clears the cookie and re-shows the banner) via the
// ResetConsentButton client component.
//
// It's a server component by default; the reset button is a tiny
// client island inside it.
//
// Layout notes:
// -------------
// Matches the /privacy + /terms + /dpa typographic rhythm (via
// /components/legal/LegalPage) so the legal suite reads as one
// document set. We don't reuse LegalPage here because the cookies
// page has structured tables + a live button, not just prose.

import type { Metadata } from "next";
import { ResetConsentButton } from "@/components/compliance/ResetConsentButton";

export const metadata: Metadata = {
  title: "Cookies",
  description:
    "Every cookie we set, what it's for, and how to withdraw consent in one click.",
};

export const dynamic = "force-static";

type CookieRow = {
  name: string;
  category: "essential" | "analytics";
  purpose: string;
  duration: string;
  provider: string;
  thirdCountry: boolean;
};

// Single source of truth for the cookie inventory. Keep this in sync
// with:
//   - components/compliance/CookieConsent.tsx (consent cookie itself)
//   - app/layout.tsx (analytics script gating)
//   - auth.ts / auth.config.ts (NextAuth session cookie name — the
//     default is "authjs.session-token" / "__Secure-authjs.session-token")
//
// Sorted by category (essential first) because visitors scan top-down.
const COOKIES: CookieRow[] = [
  {
    name: "pdfcraft_consent",
    category: "essential",
    purpose:
      "Remembers your cookie-consent choice (Accept all / Essential only) so we don't re-ask on every page.",
    duration: "365 days",
    provider: "pdfcraft ai (first-party)",
    thirdCountry: false,
  },
  {
    name: "authjs.session-token",
    category: "essential",
    purpose:
      "Keeps you signed in. Contains an opaque JWT identifier, nothing personal.",
    duration: "30 days",
    provider: "pdfcraft ai (first-party, NextAuth v5)",
    thirdCountry: false,
  },
  {
    name: "authjs.csrf-token",
    category: "essential",
    purpose:
      "CSRF protection for the sign-in flow. Required for security — cannot be disabled.",
    duration: "Session (cleared when you close the browser)",
    provider: "pdfcraft ai (first-party, NextAuth v5)",
    thirdCountry: false,
  },
  {
    name: "_ga, _ga_<STREAM_ID>",
    category: "analytics",
    purpose:
      "Google Analytics 4 client identifier. Counts unique visitors and builds aggregate usage reports. IP anonymization is on; advertising identifiers are off.",
    duration: "Up to 2 years",
    provider: "Google LLC (third-party)",
    thirdCountry: true,
  },
  {
    name: "_clck, _clsk",
    category: "analytics",
    purpose:
      "Microsoft Clarity session identifiers. Used for session replay and heatmaps so we can see where the UI is confusing.",
    duration: "Up to 1 year",
    provider: "Microsoft Corporation (third-party)",
    thirdCountry: true,
  },
];

export default function CookiesPage() {
  return (
    <main
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: "48px 24px",
        lineHeight: 1.6,
      }}
    >
      <header style={{ marginBottom: 32 }}>
        <div
          className="eyebrow"
          style={{
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--fg-subtle, #a8acb8)",
          }}
        >
          LEGAL
        </div>
        <h1
          style={{
            fontSize: 32,
            letterSpacing: "-0.02em",
            margin: "4px 0 8px 0",
          }}
        >
          Cookie policy
        </h1>
        <p className="muted" style={{ color: "var(--fg-subtle, #a8acb8)" }}>
          Updated April 22, 2026. Every cookie we set, what it's for, and
          how to withdraw consent in one click.
        </p>
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, margin: "0 0 8px 0" }}>The short version</h2>
        <p>
          pdfcraft ai uses a small number of cookies. Three are{" "}
          <strong>essential</strong> (sign-in, CSRF, remembering your
          consent choice) and always load. Two product-analytics services
          — Google Analytics 4 and Microsoft Clarity —{" "}
          <strong>only load if you accept</strong>. We do not run
          advertising cookies and we do not sell data.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, margin: "0 0 8px 0" }}>
          Change your mind at any time
        </h2>
        <p style={{ marginBottom: 16 }}>
          Under GDPR Art. 7(3) and DPDP Act 2023 s. 6(3), withdrawing
          consent must be as easy as giving it. This button deletes your
          stored consent choice — the banner will reappear on the next
          page and analytics will stop loading unless you re-accept.
        </p>
        <ResetConsentButton />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, margin: "0 0 12px 0" }}>
          Every cookie, in detail
        </h2>
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden", borderRadius: 8 }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ background: "var(--bg-2, #1e2029)" }}>
                <Th>Cookie</Th>
                <Th>Category</Th>
                <Th>Purpose</Th>
                <Th>Duration</Th>
                <Th>Provider</Th>
              </tr>
            </thead>
            <tbody>
              {COOKIES.map((c) => (
                <tr key={c.name}>
                  <Td mono>{c.name}</Td>
                  <Td>
                    <CategoryPill category={c.category} />
                  </Td>
                  <Td>{c.purpose}</Td>
                  <Td>{c.duration}</Td>
                  <Td>
                    {c.provider}
                    {c.thirdCountry ? (
                      <span
                        title="Third-country transfer (outside EEA/UK/IN)"
                        style={{
                          marginLeft: 6,
                          fontSize: 11,
                          color: "var(--fg-subtle, #a8acb8)",
                        }}
                      >
                        · 🌐
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "var(--fg-subtle, #a8acb8)",
          }}
        >
          🌐 = provider is based outside the EEA / UK / India. Transfers
          rely on the EU Standard Contractual Clauses, the UK
          International Data Transfer Addendum, and for Indian residents
          the DPDP Act s. 16 safeguards.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, margin: "0 0 8px 0" }}>Browser controls</h2>
        <p>
          You can also delete cookies directly in your browser's settings
          (e.g., Chrome → Settings → Privacy and security → Cookies).
          Deleting the <code>pdfcraft_consent</code> cookie has the same
          effect as pressing "Reset cookie preferences" above. Deleting
          the session cookies will sign you out.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 20, margin: "0 0 8px 0" }}>Questions</h2>
        <p>
          Email{" "}
          <a
            href="mailto:support@pdfcraftai.com"
            style={{ color: "var(--accent, #6aa9ff)" }}
          >
            support@pdfcraftai.com
          </a>
          . Indian residents can also contact our Grievance Officer via
          the same address — response within 15 days per DPDP Act s. 8(10).
        </p>
      </section>
    </main>
  );
}

function CategoryPill({ category }: { category: "essential" | "analytics" }) {
  const isEssential = category === "essential";
  const color = isEssential ? "#2f855a" : "#b7791f";
  const label = isEssential ? "ESSENTIAL" : "ANALYTICS";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.04em",
        color,
        border: `1px solid ${color}`,
        background: "var(--bg-2, #1e2029)",
      }}
    >
      {label}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "10px 14px",
        borderBottom: "1px solid var(--border, #2e313c)",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--fg-subtle, #a8acb8)",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  mono = false,
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <td
      style={{
        padding: "10px 14px",
        borderTop: "1px solid var(--border, #2e313c)",
        verticalAlign: "top",
        fontFamily: mono ? "var(--font-mono, ui-monospace, monospace)" : undefined,
        fontSize: 13,
      }}
    >
      {children}
    </td>
  );
}
