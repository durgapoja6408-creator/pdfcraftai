// app/app/usage/page.tsx — Per-user AI usage rollup (credits-only view).
//
// Contract: shows the signed-in user what they spent credits on over the
// last ?days=N (clamped 1..90, default 30). Two tables:
//   1. Per-operation rollup: calls, credits spent, success rate, truncation rate
//   2. Daily spend: last ?days rows of DATE(created_at) → credits, calls
//
// Explicitly does NOT display:
//   - cost_micros / USD cost per call (admin-only)
//   - net revenue / margin (admin-only)
//   - per-provider routing decisions (implementation detail)
//
// PII wall: userId comes EXCLUSIVELY from `auth()`. No accepting a userId
// via searchParams, params, or prop. The query helpers in lib/user/queries
// require userId as first positional arg; they never fan out across users.
//
// Phase B/5 — Task #19.

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  getUsageRollup,
  getDailySpend,
  getUserBalance,
} from "@/lib/user/queries";
import {
  formatCredits,
  formatCount,
  formatPercent,
  clampUserDays,
} from "@/lib/user/format";

export const metadata: Metadata = {
  title: "Usage",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function UsagePage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) redirect("/login?callbackUrl=%2Fapp%2Fusage");

  const days = clampUserDays(searchParams?.days);

  const [rollup, daily, balance] = await Promise.all([
    getUsageRollup(userId, days),
    getDailySpend(userId, days),
    getUserBalance(userId),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>
      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>USAGE</div>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>
          Your usage
        </h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          Credits spent by operation across the last {days} day
          {days === 1 ? "" : "s"}.
        </p>
      </header>

      {/* Error surfacing — each failing query renders its own inline banner
          instead of crashing the whole page. */}
      {[rollup.error, daily.error, balance.error]
        .filter((e): e is string => !!e)
        .map((e, i) => (
          <div
            key={i}
            role="alert"
            className="card"
            style={{
              padding: "10px 14px",
              borderColor: "#c00",
              background: "color-mix(in oklab, #c00 6%, transparent)",
              fontSize: 13,
            }}
          >
            Couldn’t load one section of usage data: {e}
          </div>
        ))}

      {/* Range switcher */}
      <nav style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        <span className="muted">Range:</span>
        {[7, 30, 90].map((n) => (
          <Link
            key={n}
            href={`/app/usage?days=${n}`}
            className="btn btn-ghost btn-sm"
            style={{
              padding: "4px 12px",
              fontWeight: days === n ? 600 : 500,
              color: days === n ? "var(--accent)" : undefined,
              background: days === n ? "var(--accent-soft)" : undefined,
              textDecoration: "none",
            }}
          >
            {n}d
          </Link>
        ))}
      </nav>

      {/* Summary row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <Stat
          label="Current balance"
          value={formatCredits(balance.data.balance)}
          hint="credits"
        />
        <Stat
          label="Credits spent"
          value={formatCredits(
            rollup.data.reduce((sum, r) => sum + r.creditsSpent, 0)
          )}
          hint={`last ${days}d`}
        />
        <Stat
          label="Calls"
          value={formatCount(
            rollup.data.reduce((sum, r) => sum + r.calls, 0)
          )}
          hint={`last ${days}d`}
        />
      </div>

      {/* Per-op rollup */}
      <section>
        <h2 style={sectionTitleStyle}>By operation</h2>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Operation</Th>
                <Th align="right">Calls</Th>
                <Th align="right">Credits</Th>
                <Th align="right">Success</Th>
                <Th align="right">Truncation</Th>
              </tr>
            </thead>
            <tbody>
              {rollup.data.length === 0 ? (
                <tr>
                  <Td colSpan={5} align="center">
                    No AI usage in the last {days} days.
                  </Td>
                </tr>
              ) : (
                rollup.data.map((row) => (
                  <tr key={row.operation}>
                    <Td>{opLabel(row.operation)}</Td>
                    <Td mono align="right">
                      {formatCount(row.calls)}
                    </Td>
                    <Td mono align="right">
                      {formatCredits(row.creditsSpent)}
                    </Td>
                    <Td mono align="right">
                      {formatPercent(row.successRate)}
                    </Td>
                    <Td mono align="right">
                      {formatPercent(row.truncationRate)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      {/* Daily spend timeline */}
      <section>
        <h2 style={sectionTitleStyle}>By day</h2>
        {daily.data.length > 0 ? <DailyBars data={daily.data} /> : null}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Day</Th>
                <Th align="right">Calls</Th>
                <Th align="right">Credits spent</Th>
              </tr>
            </thead>
            <tbody>
              {daily.data.length === 0 ? (
                <tr>
                  <Td colSpan={3} align="center">
                    No activity in range.
                  </Td>
                </tr>
              ) : (
                daily.data.map((row) => (
                  <tr key={row.day}>
                    <Td mono>{row.day}</Td>
                    <Td mono align="right">
                      {formatCount(row.calls)}
                    </Td>
                    <Td mono align="right">
                      {formatCredits(row.creditsSpent)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <footer className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Credits are the user-facing price of an operation. Behind the scenes,
        pdfcraftai routes each call to the cheapest suitable provider; those
        routing decisions and per-call costs are internal accounting and
        not shown here.
      </footer>
    </div>
  );
}

// ----- local UI primitives ----------------------------------------------
// Kept inline so this file has no dependency on the /admin UI set — the
// admin primitives live under components/admin/ui.tsx and are intentionally
// off-limits to /app/app pages (the test harness pins that wall).

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--fg-subtle)",
  margin: "0 0 10px 0",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        fontWeight: 600,
        fontSize: 12,
        letterSpacing: "0.02em",
        color: "var(--fg-subtle)",
        textTransform: "uppercase",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  mono = false,
  colSpan,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        textAlign: align,
        padding: "10px 14px",
        borderTop: "1px solid var(--border)",
        fontFamily: mono ? "var(--font-mono, ui-monospace, monospace)" : undefined,
      }}
    >
      {children}
    </td>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        className="eyebrow"
        style={{ margin: 0, fontSize: 11, color: "var(--fg-subtle)" }}
      >
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {hint ? (
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

// Friendly labels for the raw ai_usage.operation enum (2026-06-05). Unknown
// ops title-case as a fallback so a new op never renders blank/cryptic.
const OP_LABEL: Record<string, string> = {
  summarize: "Summarize",
  translate: "Translate",
  ocr: "OCR",
  compare: "Compare",
  rewrite: "Rewrite",
  redact: "Redact",
  sign: "Sign",
  generate: "Generate",
  table: "Table extraction",
  entities: "Entities",
  sentiment: "Sentiment",
  bias: "Bias check",
  readability: "Readability",
  "action-items": "Action items",
  paraphrase: "Paraphrase",
  proofread: "Proofread",
  condense: "Condense",
  expand: "Expand",
  chat: "Chat",
  breakage: "Expired credits",
};
function opLabel(op: string): string {
  return (
    OP_LABEL[op] ??
    op.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// Dependency-free daily-spend bar chart (2026-06-05). The "By day" table can be
// up to 90 rows — a tiny bar row makes the trend scannable at a glance. Sorted
// oldest→newest so the x-axis reads left-to-right; zero-spend days render a
// faint baseline tick so gaps are visible.
function DailyBars({
  data,
}: {
  data: { day: string; calls: number; creditsSpent: number }[];
}) {
  const rows = [...data].sort((a, b) => a.day.localeCompare(b.day));
  const max = Math.max(1, ...rows.map((r) => r.creditsSpent));
  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }} aria-hidden="true">
        {rows.map((r) => {
          const pct = Math.round((r.creditsSpent / max) * 100);
          return (
            <div
              key={r.day}
              title={`${r.day}: ${r.creditsSpent} credits · ${r.calls} calls`}
              style={{ flex: 1, minWidth: 2, height: "100%", display: "flex", alignItems: "flex-end" }}
            >
              <div
                style={{
                  width: "100%",
                  height: `${r.creditsSpent > 0 ? Math.max(pct, 4) : 2}%`,
                  background: r.creditsSpent > 0 ? "var(--accent)" : "var(--border)",
                  borderRadius: "2px 2px 0 0",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <span className="subtle" style={{ fontSize: 11 }}>{rows[0]?.day}</span>
        <span className="subtle" style={{ fontSize: 11 }}>{rows[rows.length - 1]?.day}</span>
      </div>
    </div>
  );
}
