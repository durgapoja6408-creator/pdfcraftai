import Link from "next/link";
import { sql } from "drizzle-orm";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { I } from "@/components/icons/Icons";
import { pageMetadata } from "@/lib/page-metadata";
import { db } from "@/db/client";
import { listConfiguredProviderIds } from "@/lib/ai/registry";

export const metadata = pageMetadata({
  title: "Status",
  description:
    "Service status for pdfcraft ai — DB liveness and AI provider configuration probed live; other services manually flagged when something needs attention.",
  canonical: "/status",
});

// 2026-05-08 — page is now a server component that probes the same
// surfaces /api/health does. DB ping (SELECT 1) and AI registry
// state are real signals; the rest of the services are manually
// flagged because we don't have automated probes for them yet.
// Page rerenders on every request via force-dynamic so the
// reported state isn't stale.
export const dynamic = "force-dynamic";

type Health = "operational" | "degraded" | "down";

// Probe the two surfaces /api/health checks. Wrapped in try/catch
// so a transient DB blip doesn't 500 the public-facing status page
// (the whole point of which is to be available WHEN things break).
async function probeServiceHealth(): Promise<{
  dbOk: boolean;
  dbLatencyMs: number | null;
  aiConfigured: boolean;
  aiProviderCount: number;
}> {
  let dbOk = false;
  let dbLatencyMs: number | null = null;
  const dbStart = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
    dbLatencyMs = Date.now() - dbStart;
  } catch (err) {
    console.error("[status] DB probe failed:", err);
  }

  let aiConfigured = false;
  let aiProviderCount = 0;
  try {
    const providers = listConfiguredProviderIds();
    aiProviderCount = providers.length;
    aiConfigured = providers.length > 0;
  } catch (err) {
    console.error("[status] AI registry probe failed:", err);
  }

  return { dbOk, dbLatencyMs, aiConfigured, aiProviderCount };
}

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

// Real incidents from the last ~30 days. Sorted newest-first.
// Updated 2026-05-08 with the recent stale-worker / zombie-cleanup
// events documented in CLAUDE.md §5 and docs/STATUS.md.
const INCIDENTS: Array<{ date: string; title: string; body: string; resolved: boolean }> = [
  {
    date: "2026-05-08",
    title: "503 during deploy — accumulated next-server zombies",
    body:
      "Workers spawned but stuck at 'Starting...' (Passenger killed each before it could reach 'Ready'). Caused by rapid push cadence accumulating zombie next-server processes under one HelperAgent. Recovered with a single mass-kill + Passenger restart per the §5 runbook within 30 seconds. ~10 minute disruption.",
    resolved: true,
  },
  {
    date: "2026-04-28",
    title: "Stale-worker hold after 175 + 192 deploys",
    body:
      "Auto-pull completed but the runtime kept serving the prior commit because next-server processes held stale code in memory. Cleared with the documented SSH pkick recipe; deploys now flip cleanly.",
    resolved: true,
  },
  {
    date: "2026-04-22",
    title: "Razorpay checkout failed with config error",
    body:
      "Property-name drift between adapter (writing keyId:) and checkout button (reading .key) caused 'Authentication key was missing' on every Buy click. Fixed in commit cb41e14 + new contract pin in test-razorpay-handoff.mjs.",
    resolved: true,
  },
  {
    date: "2026-04-19",
    title: "Sign-in errors after IPv6 cutover",
    body:
      "MySQL connection pool had IPv6 literals in the URL. Fixed by switching to per-component env vars and restarting the node runtime. Duration: ~35 minutes.",
    resolved: true,
  },
];

export default async function StatusPage() {
  const probe = await probeServiceHealth();
  const checkedAtUtc = new Date().toISOString().replace("T", " ").split(".")[0];

  // Build the SERVICES array with REAL probe results for the two
  // services we have automated visibility into. The remaining four
  // are static "operational" — the page is now honest about which
  // signals are live (DB + AI tools) and which are manually flagged.
  const SERVICES: Array<{
    name: string;
    desc: string;
    health: Health;
    probe?: string;
  }> = [
    {
      name: "Web app (pdfcraftai.com)",
      desc: "If you're reading this page, the web app is up. (Manual probe — no automated check.)",
      health: "operational",
    },
    {
      name: "Sign-in & accounts",
      desc: "NextAuth (Credentials + Google) — depends on the database.",
      health: probe.dbOk ? "operational" : "down",
      probe: probe.dbOk
        ? `Live DB ping ${probe.dbLatencyMs}ms`
        : "Live DB ping failed",
    },
    {
      name: "Free PDF tools",
      desc: "Browser-side processing — never touches our infrastructure for the file bytes themselves.",
      health: "operational",
    },
    {
      name: "AI tools",
      desc: "Chat, summarize, translate, OCR, redact — depends on configured AI providers.",
      health: probe.aiConfigured ? "operational" : "down",
      probe: probe.aiConfigured
        ? `${probe.aiProviderCount} provider${probe.aiProviderCount === 1 ? "" : "s"} configured`
        : "No AI provider configured",
    },
    {
      name: "Bulk processor",
      desc: "Zip / folder drops with manifest output. (Manually flagged.)",
      health: "operational",
    },
    {
      name: "Public API",
      desc: "REST endpoints + webhooks. (Manually flagged.)",
      health: "operational",
    },
  ];

  const allOk = SERVICES.every((s) => s.health === "operational");
  const overall: Health = allOk
    ? "operational"
    : SERVICES.some((s) => s.health === "down")
    ? "down"
    : "degraded";

  return (
    <main>
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
        subtitle="DB liveness and AI provider configuration are probed live on each page load; the rest of the services are manually flagged when something needs attention. For real-time alerting, subscribe below."
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
                Last checked: {checkedAtUtc} UTC
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
                  {s.probe ? (
                    <div
                      className="mono subtle"
                      style={{ fontSize: 11, marginTop: 4, letterSpacing: "0.04em" }}
                    >
                      {s.probe}
                    </div>
                  ) : null}
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
    </main>
  );
}
