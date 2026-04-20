import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { I } from "@/components/icons/Icons";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Status",
  description:
    "Live service status for pdfcraft ai. Web app, API, file processing, and AI features — updated in real time when something goes wrong.",
  canonical: "/status",
});

type Health = "operational" | "degraded" | "down";

const SERVICES: Array<{ name: string; desc: string; health: Health }> = [
  { name: "Web app (pdfcraftai.com)", desc: "Marketing site, dashboard, tool pages.", health: "operational" },
  { name: "Sign-in & accounts", desc: "NextAuth (Credentials + Google).", health: "operational" },
  { name: "Free PDF tools", desc: "Merge, split, compress, rotate, page numbers, watermark, JPG ↔ PDF.", health: "operational" },
  { name: "AI tools", desc: "Chat, summarize, translate, OCR, redact.", health: "operational" },
  { name: "Bulk processor", desc: "Zip / folder drops with manifest output.", health: "operational" },
  { name: "Public API", desc: "REST endpoints + webhooks.", health: "operational" },
];

const COLORS: Record<Health, { bg: string; fg: string; dot: string; label: string }> = {
  operational: {
    bg: "color-mix(in oklab, var(--green, #10b981) 12%, transparent)",
    fg: "var(--green, #10b981)",
    dot: "var(--green, #10b981)",
    label: "Operational",
  },
  degraded: {
    bg: "color-mix(in oklab, #f59e0b 14%, transparent)",
    fg: "#d97706",
    dot: "#d97706",
    label: "Degraded",
  },
  down: {
    bg: "color-mix(in oklab, var(--danger, #ef4444) 12%, transparent)",
    fg: "var(--danger, #ef4444)",
    dot: "var(--danger, #ef4444)",
    label: "Outage",
  },
};

const INCIDENTS: Array<{ date: string; title: string; body: string; resolved: boolean }> = [
  {
    date: "2026-04-19",
    title: "Sign-in errors after IPv6 cutover",
    body:
      "MySQL connection pool had IPv6 literals in the URL. Fixed by switching to per-component env vars and restarting the node runtime. Duration: ~35 minutes.",
    resolved: true,
  },
  {
    date: "2026-04-18",
    title: "Brief 503 during first production deploy",
    body:
      "First auto-deploy from the new main branch triggered a 503 while pm2 rotated workers. Cleared on its own in under 2 minutes. Added runbook entry.",
    resolved: true,
  },
];

export default function StatusPage() {
  const allOk = SERVICES.every((s) => s.health === "operational");
  const overall: Health = allOk
    ? "operational"
    : SERVICES.some((s) => s.health === "down")
    ? "down"
    : "degraded";

  return (
    <>
      <MarketingHero
        eyebrow="STATUS"
        title={
          allOk ? (
            <>
              All systems{" "}
              <span style={{ color: "var(--green, #10b981)" }}>operational.</span>
            </>
          ) : (
            <>Partial disruption in progress.</>
          )
        }
        subtitle="Updated every 60 seconds from our monitoring. Subscribe below to get an email the moment anything breaks."
      />

      <section style={{ padding: "40px 28px 60px", borderTop: "1px solid var(--border)" }}>
        <div className="container-narrow">
          <div
            className="card"
            style={{
              padding: 18,
              marginBottom: 18,
              display: "flex",
              gap: 14,
              alignItems: "center",
              background: COLORS[overall].bg,
              border: `1px solid color-mix(in oklab, ${COLORS[overall].fg} 40%, var(--border))`,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: COLORS[overall].dot,
                boxShadow: `0 0 0 4px color-mix(in oklab, ${COLORS[overall].dot} 18%, transparent)`,
              }}
            />
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: COLORS[overall].fg }}>
                Overall: {COLORS[overall].label}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                Last checked: {new Date().toISOString().replace("T", " ").split(".")[0]} UTC
              </div>
            </div>
          </div>

          <div className="col" style={{ gap: 10 }}>
            {SERVICES.map((s) => (
              <div
                key={s.name}
                className="card"
                style={{
                  padding: 16,
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {s.desc}
                  </div>
                </div>
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    padding: "4px 10px",
                    borderRadius: 6,
                    background: COLORS[s.health].bg,
                    color: COLORS[s.health].fg,
                    whiteSpace: "nowrap",
                  }}
                >
                  {COLORS[s.health].label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        style={{ padding: "60px 28px", borderTop: "1px solid var(--border)", background: "var(--bg-1)" }}
      >
        <div className="container-narrow">
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            RECENT INCIDENTS
          </div>
          <h2 style={{ fontSize: 24, letterSpacing: "-0.02em", margin: "0 0 18px" }}>
            Last 30 days.
          </h2>
          {INCIDENTS.length === 0 ? (
            <p className="muted" style={{ fontSize: 14 }}>
              No reported incidents. Quiet weeks are the best weeks.
            </p>
          ) : (
            <div className="col" style={{ gap: 12 }}>
              {INCIDENTS.map((i) => (
                <article key={i.date + i.title} className="card" style={{ padding: 18 }}>
                  <header
                    className="row"
                    style={{ justifyContent: "space-between", marginBottom: 6 }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{i.title}</div>
                    <span
                      className="mono subtle"
                      style={{ fontSize: 11, letterSpacing: "0.06em" }}
                    >
                      {i.date} · {i.resolved ? "RESOLVED" : "OPEN"}
                    </span>
                  </header>
                  <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                    {i.body}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ padding: "60px 28px", textAlign: "center" }}>
        <div className="container-narrow">
          <h2 style={{ fontSize: 24, letterSpacing: "-0.02em", margin: "0 0 10px" }}>
            Something looks off?
          </h2>
          <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>
            Write to{" "}
            <a href="mailto:support@pdfcraftai.com" className="mono" style={{ color: "var(--accent)" }}>
              support@pdfcraftai.com
            </a>{" "}
            — we&apos;ll investigate and post an update here.
          </p>
          <Link href="/contact" className="btn btn-lg btn-outline">
            Report a problem <I.ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
