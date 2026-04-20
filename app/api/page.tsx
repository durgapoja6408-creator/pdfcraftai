import type { Metadata } from "next";
import Link from "next/link";
import { I } from "@/components/icons/Icons";
import {
  API_ENDPOINTS,
  API_ENDPOINT_DETAILS,
  API_ERROR_CODES,
  API_AUTH_SNIPPET,
  API_QUICKSTART,
  API_RATE_LIMITS,
  API_RATE_LIMIT_HEADERS,
  API_WEBHOOK_EVENTS,
  API_WEBHOOK_SNIPPET,
  API_IDEMPOTENCY_SNIPPET,
} from "@/lib/api-endpoints";

export const metadata: Metadata = {
  title: "API reference",
  description:
    "REST endpoints, typed SDKs, webhooks, rate limits, and error codes. Build with PDFs like you build with Stripe.",
  alternates: { canonical: "/api" },
  openGraph: {
    title: "API reference",
    description:
      "REST endpoints, typed SDKs, webhooks, rate limits, and error codes for pdfcraft ai.",
    url: "/api",
    type: "website",
  },
  twitter: {
    // summary_large_image matches the rest of the site. `/api` was the only
    // route shipping `summary` — standardising it avoids a jarring smaller
    // card when someone shares the API reference on Twitter/X.
    card: "summary_large_image",
    title: "API reference",
    description: "REST endpoints, typed SDKs, webhooks, rate limits, and error codes.",
  },
};

function CodeBlock({
  label,
  lang,
  children,
}: {
  label: string;
  lang: string;
  children: string;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        background: "var(--bg-2)",
      }}
    >
      <div
        className="row"
        style={{
          padding: "12px 18px",
          borderBottom: "1px solid var(--border)",
          justifyContent: "space-between",
          background: "var(--bg-1)",
        }}
      >
        <span
          className="mono subtle"
          style={{ fontSize: 11, letterSpacing: "0.1em" }}
        >
          {label}
        </span>
        <span className="chip chip-free">{lang}</span>
      </div>
      <pre
        className="mono"
        style={{
          margin: 0,
          padding: 20,
          overflowX: "auto",
          fontSize: 12.5,
          lineHeight: 1.65,
          color: "var(--fg)",
          whiteSpace: "pre",
        }}
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}

export default function ApiPage() {
  return (
    <main>
      {/* Hero */}
      <section style={{ paddingTop: 80, paddingBottom: 32 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            API REFERENCE
          </div>
          <h1
            style={{
              fontSize: 48,
              letterSpacing: "-0.03em",
              marginBottom: 16,
              maxWidth: 760,
            }}
          >
            Build with PDFs like you build with Stripe.
          </h1>
          <p
            className="muted"
            style={{ fontSize: 17, lineHeight: 1.55, maxWidth: 640, marginBottom: 28 }}
          >
            REST endpoints, webhooks, and typed SDKs. Free tier for hobby projects; pay only for
            AI-powered operations. No surprises.
          </p>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <Link href="#quickstart" className="btn btn-primary btn-lg">
              Quickstart
              <I.ArrowRight size={14} />
            </Link>
            <Link href="#endpoints" className="btn btn-outline btn-lg">
              Endpoints
            </Link>
            <a
              href="mailto:support@pdfcraftai.com?subject=API%20access"
              className="btn btn-ghost btn-lg"
            >
              Get an API key
            </a>
          </div>
        </div>
      </section>

      {/* On-this-page nav */}
      <section style={{ paddingBottom: 48 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div
            className="card"
            style={{
              padding: "14px 20px",
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <span
              className="subtle mono"
              style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}
            >
              ON THIS PAGE
            </span>
            {[
              ["Quickstart", "#quickstart"],
              ["Authentication", "#authentication"],
              ["Endpoints", "#endpoints"],
              ["Rate limits", "#rate-limits"],
              ["Errors", "#errors"],
              ["Webhooks", "#webhooks"],
              ["Idempotency", "#idempotency"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                style={{ color: "var(--fg-subtle)", textDecoration: "none" }}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section style={{ paddingBottom: 64 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
            }}
          >
            <FeatureCard
              icon="Code"
              title="Typed SDKs"
              body="Node, Python, Go. Full TypeScript types for every endpoint, with IntelliSense in your editor."
            />
            <FeatureCard
              icon="Flow"
              title="Webhooks"
              body="Async long jobs ping you back. HMAC-signed deliveries, automatic retries, and a replay dashboard."
            />
            <FeatureCard
              icon="Shield"
              title="Zero-retention"
              body="Flip one header and your files are deleted after processing. AI prompts never touch our logs."
            />
            <FeatureCard
              icon="Zap"
              title="Generous free tier"
              body="10,000 free operations/month for non-AI tools. Great for hobby projects and side apps."
            />
          </div>
        </div>
      </section>

      {/* Quickstart */}
      <section id="quickstart" style={{ paddingTop: 16, paddingBottom: 64, scrollMarginTop: 96 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            QUICKSTART
          </div>
          <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", marginBottom: 16 }}>
            Summarize a PDF in under 2 minutes.
          </h2>
          <p
            className="muted"
            style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24, maxWidth: 680 }}
          >
            Grab an API key from the dashboard, install the SDK, and hit{" "}
            <code className="mono" style={{ fontSize: 13 }}>ai/summarize</code> with any PDF.
            The same pattern works for every endpoint — swap the method name and you&rsquo;re done.
          </p>
          <CodeBlock label="QUICKSTART.TS" lang="Node.js">
            {API_QUICKSTART}
          </CodeBlock>
        </div>
      </section>

      {/* Authentication */}
      <section
        id="authentication"
        style={{ paddingTop: 16, paddingBottom: 64, scrollMarginTop: 96 }}
      >
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            AUTHENTICATION
          </div>
          <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", marginBottom: 16 }}>
            Bearer tokens, test + live mode.
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 24,
              alignItems: "flex-start",
            }}
          >
            <div>
              <p
                className="muted"
                style={{ fontSize: 15, lineHeight: 1.65, marginBottom: 18 }}
              >
                Authenticate every request with a bearer token in the{" "}
                <code className="mono" style={{ fontSize: 13 }}>Authorization</code> header. Keys
                are issued from the dashboard (Settings → API keys).
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.7,
                }}
              >
                <li>
                  <code className="mono" style={{ fontSize: 13 }}>pk_live_…</code> — production
                  traffic. Charges real credits, returns real outputs.
                </li>
                <li>
                  <code className="mono" style={{ fontSize: 13 }}>pk_test_…</code> — sandbox. Free
                  and deterministic — never touches production.
                </li>
                <li>
                  <code className="mono" style={{ fontSize: 13 }}>sk_…</code> — secret server keys
                  only. Never ship these to a browser or mobile app.
                </li>
              </ul>
              <p
                className="muted"
                style={{ fontSize: 13, lineHeight: 1.6, marginTop: 18 }}
              >
                Rotate a key at any time — the old token invalidates immediately and new traffic
                picks up the replacement on the next request.
              </p>
            </div>
            <CodeBlock label="AUTH.SH" lang="cURL">
              {API_AUTH_SNIPPET}
            </CodeBlock>
          </div>
        </div>
      </section>

      {/* Endpoints */}
      <section id="endpoints" style={{ paddingTop: 16, paddingBottom: 64, scrollMarginTop: 96 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            ENDPOINTS
          </div>
          <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", marginBottom: 16 }}>
            Eight endpoints. Two categories.
          </h2>
          <p
            className="muted"
            style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24, maxWidth: 680 }}
          >
            Non-AI operations are free and unmetered on the hobby tier. AI operations are charged
            in credits — see the per-endpoint breakdown below.
          </p>

          {/* Summary table */}
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 28 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "90px minmax(200px, 1fr) minmax(200px, 1.5fr) 60px 140px",
                padding: "14px 20px",
                background: "var(--bg-1)",
                borderBottom: "1px solid var(--border)",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--fg-subtle)",
                fontWeight: 600,
              }}
              className="mono"
            >
              <span>Method</span>
              <span>Path</span>
              <span>Description</span>
              <span>Tier</span>
              <span style={{ textAlign: "right" }}>Price</span>
            </div>
            {API_ENDPOINTS.map((ep, i) => (
              <a
                key={ep.path}
                href={`#${ep.anchor}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px minmax(200px, 1fr) minmax(200px, 1.5fr) 60px 140px",
                  padding: "16px 20px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  alignItems: "center",
                  fontSize: 14,
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.05em",
                    color: "var(--accent)",
                    fontWeight: 600,
                  }}
                >
                  {ep.method}
                </span>
                <span className="mono" style={{ fontSize: 13 }}>
                  {ep.path}
                </span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {ep.desc}
                </span>
                <span
                  className="mono subtle"
                  style={{ fontSize: 11, letterSpacing: "0.05em" }}
                >
                  {ep.group}
                </span>
                <span
                  className="mono subtle"
                  style={{
                    fontSize: 11,
                    textAlign: "right",
                    letterSpacing: "0.05em",
                  }}
                >
                  {ep.price}
                </span>
              </a>
            ))}
          </div>

          {/* Per-endpoint details */}
          <div style={{ display: "grid", gap: 24 }}>
            {API_ENDPOINTS.map((ep) => {
              const detail = API_ENDPOINT_DETAILS.find((d) => d.anchor === ep.anchor);
              if (!detail) return null;
              return (
                <div
                  key={ep.anchor}
                  id={ep.anchor}
                  className="card"
                  style={{ padding: 24, scrollMarginTop: 96 }}
                >
                  <div
                    className="row"
                    style={{
                      gap: 12,
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginBottom: 6,
                    }}
                  >
                    <span
                      className="mono"
                      style={{
                        fontSize: 11,
                        letterSpacing: "0.05em",
                        color: "var(--accent)",
                        fontWeight: 600,
                      }}
                    >
                      {ep.method}
                    </span>
                    <h3
                      className="mono"
                      style={{ fontSize: 16, margin: 0, letterSpacing: "-0.01em" }}
                    >
                      {ep.path}
                    </h3>
                    <span
                      className="mono subtle"
                      style={{ fontSize: 11, letterSpacing: "0.05em" }}
                    >
                      · {ep.price}
                    </span>
                  </div>
                  <p
                    className="muted"
                    style={{ fontSize: 14, lineHeight: 1.55, margin: "6px 0 18px" }}
                  >
                    {ep.desc}
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                      gap: 12,
                    }}
                  >
                    <CodeBlock label="REQUEST" lang="HTTP">
                      {detail.request}
                    </CodeBlock>
                    <CodeBlock label="RESPONSE" lang="HTTP">
                      {detail.response}
                    </CodeBlock>
                  </div>
                  {detail.note && (
                    <p
                      className="muted"
                      style={{
                        fontSize: 12.5,
                        lineHeight: 1.55,
                        margin: "16px 0 0",
                        padding: "12px 14px",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        background: "var(--bg-1)",
                      }}
                    >
                      <strong style={{ color: "var(--fg)" }}>Note: </strong>
                      {detail.note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Rate limits */}
      <section id="rate-limits" style={{ paddingTop: 16, paddingBottom: 64, scrollMarginTop: 96 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            RATE LIMITS
          </div>
          <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", marginBottom: 16 }}>
            Burst windows + monthly caps.
          </h2>

          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(200px, 1.2fr) minmax(200px, 1fr) minmax(120px, 0.8fr) minmax(240px, 1.4fr)",
                padding: "14px 20px",
                background: "var(--bg-1)",
                borderBottom: "1px solid var(--border)",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--fg-subtle)",
                fontWeight: 600,
              }}
              className="mono"
            >
              <span>Tier</span>
              <span>Monthly cap</span>
              <span>Burst</span>
              <span>Notes</span>
            </div>
            {API_RATE_LIMITS.map((tier, i) => (
              <div
                key={tier.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(200px, 1.2fr) minmax(200px, 1fr) minmax(120px, 0.8fr) minmax(240px, 1.4fr)",
                  padding: "16px 20px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  alignItems: "flex-start",
                  fontSize: 13.5,
                  gap: 12,
                }}
              >
                <span className="mono" style={{ fontSize: 13, fontWeight: 500 }}>
                  {tier.name}
                </span>
                <span style={{ fontSize: 13 }}>{tier.monthlyOps}</span>
                <span className="mono subtle" style={{ fontSize: 12 }}>
                  {tier.burst}
                </span>
                <span className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                  {tier.notes}
                </span>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 15, marginBottom: 12, letterSpacing: "-0.01em" }}>
            Response headers
          </h3>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {API_RATE_LIMIT_HEADERS.map((h, i) => (
              <div
                key={h.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 0.6fr) minmax(260px, 1fr)",
                  padding: "12px 20px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <span className="mono" style={{ fontSize: 12.5 }}>
                  {h.name}
                </span>
                <span className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                  {h.meaning}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Errors */}
      <section id="errors" style={{ paddingTop: 16, paddingBottom: 64, scrollMarginTop: 96 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            ERRORS
          </div>
          <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", marginBottom: 16 }}>
            Predictable status codes and machine-readable reasons.
          </h2>
          <p
            className="muted"
            style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24, maxWidth: 720 }}
          >
            Every error response ships the same JSON shape:{" "}
            <code className="mono" style={{ fontSize: 13 }}>
              {"{ error: { code, message, hint, details?, request_id } }"}
            </code>
            . Log the request id — it lets support trace the exact path your request took through
            our pipeline.
          </p>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "60px minmax(160px, 0.9fr) minmax(240px, 1.2fr) minmax(240px, 1.4fr)",
                padding: "14px 20px",
                background: "var(--bg-1)",
                borderBottom: "1px solid var(--border)",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--fg-subtle)",
                fontWeight: 600,
              }}
              className="mono"
            >
              <span>HTTP</span>
              <span>Code</span>
              <span>Meaning</span>
              <span>Fix</span>
            </div>
            {API_ERROR_CODES.map((err, i) => (
              <div
                key={err.code}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px minmax(160px, 0.9fr) minmax(240px, 1.2fr) minmax(240px, 1.4fr)",
                  padding: "14px 20px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  alignItems: "flex-start",
                  fontSize: 13,
                  gap: 12,
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: err.status >= 500 ? "var(--danger, #c0392b)" : "var(--accent)",
                    fontWeight: 600,
                  }}
                >
                  {err.status}
                </span>
                <span className="mono" style={{ fontSize: 12.5 }}>
                  {err.code}
                </span>
                <span className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                  {err.meaning}
                </span>
                <span className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
                  {err.fix}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Webhooks */}
      <section id="webhooks" style={{ paddingTop: 16, paddingBottom: 64, scrollMarginTop: 96 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            WEBHOOKS
          </div>
          <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", marginBottom: 16 }}>
            Async jobs ping you back — HMAC-signed.
          </h2>
          <p
            className="muted"
            style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24, maxWidth: 720 }}
          >
            Register endpoints from Settings → Webhooks. Every delivery is signed with
            HMAC-SHA256 over the raw body; verify the signature on your side before acting. We
            retry failed deliveries with exponential backoff for 24 hours and surface every
            attempt in the dashboard.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)",
              gap: 24,
              alignItems: "flex-start",
            }}
          >
            <CodeBlock label="WEBHOOK-RECEIVER.TS" lang="Node.js">
              {API_WEBHOOK_SNIPPET}
            </CodeBlock>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  padding: "14px 20px",
                  background: "var(--bg-1)",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--fg-subtle)",
                  fontWeight: 600,
                }}
                className="mono"
              >
                Event types
              </div>
              {API_WEBHOOK_EVENTS.map((e, i) => (
                <div
                  key={e.name}
                  style={{
                    padding: "12px 20px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    fontSize: 13,
                  }}
                >
                  <div className="mono" style={{ fontSize: 12.5, marginBottom: 4 }}>
                    {e.name}
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                    {e.meaning}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Idempotency */}
      <section
        id="idempotency"
        style={{ paddingTop: 16, paddingBottom: 96, scrollMarginTop: 96 }}
      >
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            IDEMPOTENCY
          </div>
          <h2 style={{ fontSize: 28, letterSpacing: "-0.02em", marginBottom: 16 }}>
            Safe retries for any mutating call.
          </h2>
          <p
            className="muted"
            style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24, maxWidth: 720 }}
          >
            Attach an{" "}
            <code className="mono" style={{ fontSize: 13 }}>Idempotency-Key</code> header to any
            request. We cache the response for 24 hours — retries return the same payload without
            re-running the operation or double-charging credits.
          </p>
          <CodeBlock label="IDEMPOTENCY.SH" lang="cURL">
            {API_IDEMPOTENCY_SNIPPET}
          </CodeBlock>
        </div>
      </section>

      {/* Footer CTA */}
      <section style={{ paddingBottom: 120 }}>
        <div className="container-x" style={{ padding: "0 28px" }}>
          <div
            className="card"
            style={{
              padding: 40,
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) auto",
              gap: 24,
              alignItems: "center",
            }}
          >
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                READY TO BUILD?
              </div>
              <h2 style={{ fontSize: 24, marginBottom: 8, letterSpacing: "-0.02em" }}>
                Get an API key in 30 seconds.
              </h2>
              <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>
                Sign up, head to Settings → API keys, grab a{" "}
                <code className="mono" style={{ fontSize: 13 }}>pk_test_…</code>, and ship.
                Questions? Email{" "}
                <a
                  href="mailto:support@pdfcraftai.com"
                  style={{ color: "var(--accent)", textDecoration: "none" }}
                >
                  support@pdfcraftai.com
                </a>
                .
              </p>
            </div>
            <Link href="/register" className="btn btn-primary btn-lg">
              Create account
              <I.ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: keyof typeof I;
  title: string;
  body: string;
}) {
  const Icon = I[icon];
  return (
    <div className="card" style={{ padding: 24 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "var(--accent-soft)",
          color: "var(--accent)",
          display: "grid",
          placeItems: "center",
          marginBottom: 14,
        }}
      >
        {Icon ? <Icon size={18} /> : null}
      </div>
      <h3 style={{ fontSize: 16, marginBottom: 6 }}>{title}</h3>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: 0 }}>
        {body}
      </p>
    </div>
  );
}
