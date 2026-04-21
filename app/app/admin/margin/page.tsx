// /app/admin/margin — admin-only dashboard over ai_daily_margin.
//
// This is the UI layer on top of the read-path that Task #22 shipped
// as JSON (`/api/admin/margin`). The API route stays — external tools
// (curl, a future monitoring hook) still need the JSON — but for a
// browser session we render server-side directly from the library so
// there's no extra round-trip.
//
// Why /app/admin/margin and not /admin/margin:
//   - /app/* is already gated by NextAuth middleware + the /app
//     layout's `session` check. An anonymous visit is redirected to
//     /login with a callback URL. Nesting under /app lets us inherit
//     that for free; we only need to layer the email-allowlist check
//     on top.
//   - The UI chrome (AppShell sidebar) is provided by the parent
//     /app layout, so this page only has to render its own body.
//
// Auth model:
//   1. /app layout: redirects to /login if no session (middleware
//      already does this, the layout check is belt-and-braces).
//   2. This page: `isAdminEmail(session.user.email, process.env.ADMIN_EMAILS)`
//      — if false, render a friendly 403 card instead of the real
//      dashboard. We deliberately DON'T return a bare HTTP 403 here;
//      the page is reached after /login completed successfully so
//      a hard-error feels wrong. A card that reads "you're signed
//      in but this surface is ops-only" is the right UX.
//   3. Founder-email fallback baked into parseAdminEmails means that
//      on a fresh deploy before ADMIN_EMAILS lands, the founder
//      still gets in. No lock-out window.
//
// Data flow:
//   - Direct `getAdminMarginSummary({ days })` call. Same library,
//     same day-window semantics as /api/admin/margin — so the two
//     surfaces are guaranteed to show identical numbers for the same
//     `?days=` value.
//   - `searchParams.days` is parsed by the same `clampAdminDays()`
//     the API route uses (clamp to [1, 90], fallback to 14).
//
// Failure posture:
//   - We don't try/catch the library call here. If `getAdminMarginSummary`
//     throws (DB down, migration missing), Next.js's own error boundary
//     renders the global `error.tsx` — the library already logs the
//     underlying error so ops has the tail. A dashboard that shows
//     half-rendered zeros on a DB error would be worse than a clean
//     error page.
//
// No dashboard UI is linked from AppShell by design — this is an ops
// surface, not a product feature. Admins hit it via direct URL.
//
// Out of scope (deliberate):
//   (i) per-slice drill-down — the red-slice table already shows
//       (date, provider, model, operation, margin, floor) which is
//       everything needed to root-cause; a future click-through to
//       raw ai_usage rows would need a second table + pagination
//       for a marginal UX win.
//   (ii) historical margin chart — the per-day table with
//       min/max margin bps is a text table, not a chart. Adding
//       a chart library would blow the zero-deps posture for what
//       is, right now, a <100-row view. Revisit if the window
//       expands past 90 days.
//   (iii) write / backfill actions — the endpoint is read-only.
//       Admin-triggered backfills remain on the cron route with
//       its `x-cron-secret` gate (documented in CLAUDE.md §6).
//   (iv) auto-refresh — the underlying cron only writes once
//       per day at 00:15 UTC. Reloading on a timer would just burn
//       DB cycles. Navigating away and back refreshes (force-dynamic).

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import {
  ADMIN_MARGIN_DEFAULT_DAYS,
  ADMIN_MARGIN_MAX_DAYS,
  clampAdminDays,
  getAdminMarginSummary,
  isAdminEmail,
  type AdminMarginDaySummary,
  type AdminMarginRedSlice,
  type AdminMarginSummary,
} from "@/lib/ai/margin-rollup";

export const metadata: Metadata = {
  title: "Margin dashboard",
  // Admin surface — never index, never follow. Defensive even though
  // robots.txt already disallows /app/*.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Presets shown in the day selector. Keep them in sync with the
// discussion in lib/ai/margin-rollup.ts (14 = visually confirm the
// 7-day streak; 90 = quarter ceiling).
const DAY_PRESETS = [7, 14, 30, 90] as const;

export default async function AdminMarginPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  // Layer 1: session (middleware + /app layout handle the anonymous
  // redirect; this is belt-and-braces for the rare case someone
  // reaches the page with a stale cookie).
  const session = await auth();
  const email =
    session?.user && typeof (session.user as { email?: unknown }).email === "string"
      ? ((session.user as { email: string }).email as string)
      : null;

  if (!email) {
    return <NotSignedIn />;
  }

  // Layer 2: admin allowlist. `isAdminEmail` handles the founder
  // fallback when ADMIN_EMAILS is unset.
  if (!isAdminEmail(email, process.env.ADMIN_EMAILS)) {
    return <NotAuthorised email={email} />;
  }

  // Layer 3: fetch.
  const days = clampAdminDays(searchParams?.days ?? ADMIN_MARGIN_DEFAULT_DAYS);
  const summary = await getAdminMarginSummary({ days });

  return <MarginDashboard summary={summary} days={days} />;
}

// ----- Top-level views ------------------------------------------------------

function NotSignedIn() {
  return (
    <Card>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        Not signed in
      </h1>
      <p style={{ color: "var(--fg-muted)", marginBottom: 12 }}>
        This surface is admin-only. Please sign in with an allowlisted
        account.
      </p>
      <Link
        href="/login?callbackUrl=/app/admin/margin"
        style={{ color: "var(--accent)" }}
      >
        Go to sign in →
      </Link>
    </Card>
  );
}

function NotAuthorised({ email }: { email: string }) {
  return (
    <Card>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        Admin access required
      </h1>
      <p style={{ color: "var(--fg-muted)", marginBottom: 4 }}>
        You&rsquo;re signed in as <code style={{ fontSize: 13 }}>{email}</code>,
        but this account isn&rsquo;t on the admin allowlist.
      </p>
      <p style={{ color: "var(--fg-subtle)", fontSize: 13 }}>
        If you need access, ask an existing admin to add your email to the
        <code style={{ marginLeft: 4, marginRight: 4, fontSize: 12 }}>
          ADMIN_EMAILS
        </code>
        Hostinger env var (comma-separated).
      </p>
    </Card>
  );
}

function MarginDashboard({
  summary,
  days,
}: {
  summary: AdminMarginSummary;
  days: number;
}) {
  const streakTone = streakTone_(summary.currentStreakDays);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* --- Header --------------------------------------------------- */}
      <header>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
          Margin dashboard
        </h1>
        <p style={{ color: "var(--fg-muted)", fontSize: 14 }}>
          Per-day rollup from <code style={{ fontSize: 12 }}>ai_daily_margin</code>
          {" "}covering the {summary.range.days}-day window{" "}
          <strong>{summary.range.from}</strong> → <strong>{summary.range.to}</strong>
          {" "}(UTC). Generated{" "}
          <time dateTime={summary.generatedAt}>{formatTime_(summary.generatedAt)}</time>.
        </p>
      </header>

      {/* --- Status row ----------------------------------------------- */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <StatCard
          label="Current green streak"
          value={`${summary.currentStreakDays} day${summary.currentStreakDays === 1 ? "" : "s"}`}
          tone={streakTone}
        />
        <StatCard
          label="Gate #7 (≥ 7 consecutive green)"
          value={summary.gate7Reached ? "Reached" : "Not yet"}
          tone={summary.gate7Reached ? "green" : "amber"}
        />
        <StatCard
          label="Days with data"
          value={`${summary.days.length} / ${summary.range.days}`}
          tone={summary.days.length === summary.range.days ? "neutral" : "amber"}
          hint={
            summary.days.length < summary.range.days
              ? "Days missing rollup rows usually mean zero AI traffic that day"
              : undefined
          }
        />
        <StatCard
          label="Red slices in window"
          value={String(summary.recentRedSlices.length)}
          tone={summary.recentRedSlices.length === 0 ? "green" : "red"}
        />
      </section>

      {/* --- Day selector --------------------------------------------- */}
      <section style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>Window:</span>
        {DAY_PRESETS.map((d) => {
          const active = d === days;
          return (
            <Link
              key={d}
              href={`/app/admin/margin?days=${d}`}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius)",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? "var(--accent-fg)" : "var(--fg-muted)",
                background: active ? "var(--accent)" : "var(--bg-2)",
                textDecoration: "none",
                border: "1px solid var(--bg-3)",
              }}
            >
              {d} days
            </Link>
          );
        })}
        <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
          (max {ADMIN_MARGIN_MAX_DAYS} via <code style={{ fontSize: 12 }}>?days=</code>)
        </span>
      </section>

      {/* --- Per-day table -------------------------------------------- */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Per-day aggregates</h2>
        {summary.days.length === 0 ? (
          <EmptyRow
            text={
              "No rollup rows yet. Either the cron hasn't run, or no AI traffic hit " +
              "the window. Check /api/health → ai.configured and the Hostinger cron log."
            }
          />
        ) : (
          <DayTable days={summary.days} />
        )}
      </section>

      {/* --- Red slices ----------------------------------------------- */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Recent red slices
        </h2>
        {summary.recentRedSlices.length === 0 ? (
          <EmptyRow text="Nothing red in this window. Nice." />
        ) : (
          <RedSliceTable slices={summary.recentRedSlices} floors={summary.floorBpsByOp} />
        )}
      </section>

      {/* --- Floor reference ------------------------------------------ */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Floor margin by operation (reference)
        </h2>
        <FloorTable floors={summary.floorBpsByOp} />
      </section>
    </div>
  );
}

// ----- Sub-components -------------------------------------------------------

type Tone = "green" | "amber" | "red" | "neutral";

function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: Tone;
  hint?: string;
}) {
  const accent =
    tone === "green"
      ? "var(--accent)"
      : tone === "red"
        ? "#c00"
        : tone === "amber"
          ? "#d97706"
          : "var(--fg)";
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bg-3)",
        borderRadius: "var(--radius)",
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent }}>{value}</div>
      {hint ? (
        <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 4 }}>{hint}</div>
      ) : null}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bg-3)",
        borderRadius: "var(--radius)",
        padding: 24,
        maxWidth: 560,
      }}
    >
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px dashed var(--bg-3)",
        borderRadius: "var(--radius)",
        padding: 20,
        fontSize: 13,
        color: "var(--fg-muted)",
      }}
    >
      {text}
    </div>
  );
}

function DayTable({ days }: { days: AdminMarginDaySummary[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}
      >
        <thead>
          <tr style={{ textAlign: "left", color: "var(--fg-muted)" }}>
            <Th>Date</Th>
            <Th align="right">Slices</Th>
            <Th align="right">Green</Th>
            <Th align="right">Red</Th>
            <Th align="right">Min bps</Th>
            <Th align="right">Max bps</Th>
            <Th align="right">Cost</Th>
            <Th align="right">Revenue</Th>
            <Th align="right">Net</Th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const netMicros = d.totalRevenueMicros - d.totalCostMicros;
            return (
              <tr key={d.date} style={{ borderTop: "1px solid var(--bg-3)" }}>
                <Td>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      marginRight: 8,
                      borderRadius: "50%",
                      background: d.allGreen ? "var(--accent)" : "#c00",
                      verticalAlign: "middle",
                    }}
                    aria-label={d.allGreen ? "all green" : "had red slices"}
                  />
                  <code style={{ fontSize: 12 }}>{d.date}</code>
                </Td>
                <Td align="right">{d.sliceCount}</Td>
                <Td align="right">{d.greenCount}</Td>
                <Td align="right" style={{ color: d.redCount > 0 ? "#c00" : undefined }}>
                  {d.redCount}
                </Td>
                <Td align="right">{formatBps_(d.minMarginBps)}</Td>
                <Td align="right">{formatBps_(d.maxMarginBps)}</Td>
                <Td align="right">{formatMicros_(d.totalCostMicros)}</Td>
                <Td align="right">{formatMicros_(d.totalRevenueMicros)}</Td>
                <Td align="right" style={{ color: netMicros < 0 ? "#c00" : undefined }}>
                  {formatMicros_(netMicros)}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RedSliceTable({
  slices,
  floors,
}: {
  slices: AdminMarginRedSlice[];
  floors: Record<string, number>;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}
      >
        <thead>
          <tr style={{ textAlign: "left", color: "var(--fg-muted)" }}>
            <Th>Date</Th>
            <Th>Provider</Th>
            <Th>Model</Th>
            <Th>Op</Th>
            <Th align="right">Calls</Th>
            <Th align="right">Margin bps</Th>
            <Th align="right">Floor bps</Th>
            <Th align="right">Gap</Th>
            <Th align="right">Cost</Th>
            <Th align="right">Revenue</Th>
          </tr>
        </thead>
        <tbody>
          {slices.map((s, i) => {
            const floor = floors[s.operation] ?? s.floorBps;
            const gap = s.marginBps - floor;
            return (
              <tr
                key={`${s.date}-${s.providerId}-${s.model}-${s.operation}-${i}`}
                style={{ borderTop: "1px solid var(--bg-3)" }}
              >
                <Td><code style={{ fontSize: 12 }}>{s.date}</code></Td>
                <Td>{s.providerId}</Td>
                <Td><code style={{ fontSize: 12 }}>{s.model}</code></Td>
                <Td>{s.operation}</Td>
                <Td align="right">{s.callCount}</Td>
                <Td align="right" style={{ color: "#c00" }}>{formatBps_(s.marginBps)}</Td>
                <Td align="right">{formatBps_(floor)}</Td>
                <Td align="right" style={{ color: "#c00" }}>{formatBps_(gap)}</Td>
                <Td align="right">{formatMicros_(s.costMicrosSum)}</Td>
                <Td align="right">{formatMicros_(s.revenueMicrosSum)}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FloorTable({ floors }: { floors: Record<string, number> }) {
  const entries = Object.entries(floors).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
          maxWidth: 420,
        }}
      >
        <thead>
          <tr style={{ textAlign: "left", color: "var(--fg-muted)" }}>
            <Th>Operation</Th>
            <Th align="right">Floor bps</Th>
            <Th align="right">Floor %</Th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([op, bps]) => (
            <tr key={op} style={{ borderTop: "1px solid var(--bg-3)" }}>
              <Td>{op}</Td>
              <Td align="right">{formatBps_(bps)}</Td>
              <Td align="right">{(bps / 100).toFixed(2)}%</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        padding: "8px 12px",
        fontWeight: 500,
        textAlign: align,
        borderBottom: "1px solid var(--bg-3)",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  style,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  style?: React.CSSProperties;
}) {
  return (
    <td
      style={{
        padding: "8px 12px",
        textAlign: align,
        ...style,
      }}
    >
      {children}
    </td>
  );
}

// ----- Formatters -----------------------------------------------------------

// Suffixed with _ so they don't collide with any future library helper
// of the same name and so grep can tell them apart from shared utils.

function formatBps_(bps: number): string {
  if (!Number.isFinite(bps)) return "—";
  const sign = bps > 0 ? "+" : "";
  return `${sign}${bps}`;
}

// micros → $ display. 1 USD = 1_000_000 micros. Keep 4-decimal precision
// because AI per-call revenue is often sub-cent.
function formatMicros_(micros: number): string {
  if (!Number.isFinite(micros) || micros === 0) return "$0";
  const dollars = micros / 1_000_000;
  if (Math.abs(dollars) >= 1) return `$${dollars.toFixed(2)}`;
  return `$${dollars.toFixed(4)}`;
}

function formatTime_(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
  } catch {
    return iso;
  }
}

function streakTone_(streak: number): Tone {
  if (streak >= 7) return "green";
  if (streak >= 1) return "amber";
  return "red";
}
