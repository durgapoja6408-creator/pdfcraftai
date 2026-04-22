// app/admin/alarms/page.tsx — Live alarms view.
//
// Contract: run detectAlarms() for "today" (UTC) and show every
// finding. This is the same function the nightly cron feeds to Slack;
// surfacing it in-product gives an operator an immediate "is anything
// wrong RIGHT NOW?" answer without needing to pull Slack logs.
//
// No history view here — alarm findings aren't persisted to a table
// (only their computation inputs live in ai_daily_margin). If the
// operator needs historical context, /admin/margin shows the same
// green/red day-level view the alarms feed off of.

import { detectAlarms, type AlarmFinding } from "@/lib/ai/margin-rollup";
import {
  ErrorBanner,
  SectionTitle,
  StatCard,
  Td,
  Th,
  tableStyle,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminAlarmsPage() {
  let alarms: AlarmFinding[] = [];
  let errorMsg: string | null = null;
  try {
    alarms = await detectAlarms({ date: new Date().toISOString().slice(0, 10) });
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  const red = alarms.filter((a) => a.severity === "red");
  const warn = alarms.filter((a) => a.severity === "warn");

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Alarms</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Live detect-point findings for today (UTC). Same logic the nightly
          Slack alert uses.
        </p>
      </header>

      {errorMsg ? (
        <ErrorBanner message={`Alarm detection failed: ${errorMsg}`} />
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Red alarms"
          value={String(red.length)}
          tone={red.length > 0 ? "bad" : "good"}
        />
        <StatCard
          label="Warn alarms"
          value={String(warn.length)}
          tone={warn.length > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Status"
          value={
            red.length > 0
              ? "RED"
              : warn.length > 0
                ? "WARN"
                : alarms.length === 0
                  ? "GREEN"
                  : "—"
          }
          tone={
            red.length > 0
              ? "bad"
              : warn.length > 0
                ? "warn"
                : "good"
          }
        />
      </section>

      <section>
        <SectionTitle>Findings</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Severity</Th>
                <Th>Kind</Th>
                <Th>Op</Th>
                <Th>Provider</Th>
                <Th>Message</Th>
              </tr>
            </thead>
            <tbody>
              {alarms.length === 0 ? (
                <tr>
                  <Td colSpan={5} align="center">
                    No alarms. All slices are green and no detect-point drift
                    has fired.
                  </Td>
                </tr>
              ) : (
                alarms.map((a, i) => (
                  <tr key={i}>
                    <Td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          background:
                            a.severity === "red" ? "#b23b3b" : "#b7791f",
                          color: "white",
                        }}
                      >
                        {a.severity}
                      </span>
                    </Td>
                    <Td>{a.kind}</Td>
                    <Td>{a.operation}</Td>
                    <Td>{a.providerId ?? "—"}</Td>
                    <Td>{a.message}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
