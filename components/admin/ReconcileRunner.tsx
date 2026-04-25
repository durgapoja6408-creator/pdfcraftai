"use client";

// components/admin/ReconcileRunner.tsx — interactive runner for the
// /admin/reconcile page.
//
// The button POSTs to /api/admin/reconcile (admin-session-gated) and
// renders the resulting ReconciliationReport JSON inline. We deliberately
// don't persist the result anywhere — each run is a fresh snapshot, and
// the operator can hit the button as many times as they need.

import { useState } from "react";

type ReverseSweep = {
  scanned: number;
  recovered: number;
  unchanged: number;
  errors: number;
  errorDetails: string[];
};

type ProviderStats = {
  scanned: number;
  matched: number;
  synthesized: number;
  anomalies: number;
  errors: number;
  errorDetails: string[];
  reverseSweep: ReverseSweep;
};

type Report = {
  startedAt: string;
  finishedAt: string;
  windowStart: string;
  byProvider: Record<string, ProviderStats>;
};

type RunState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; report: Report; tookMs: number }
  | { kind: "error"; message: string };

export function ReconcileRunner() {
  const [state, setState] = useState<RunState>({ kind: "idle" });
  const [lookbackHours, setLookbackHours] = useState<string>("48");

  async function run() {
    setState({ kind: "running" });
    const startedAt = Date.now();
    try {
      const params = new URLSearchParams({ lookbackHours });
      const res = await fetch(`/api/admin/reconcile?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState({
          kind: "error",
          message: json.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setState({
        kind: "ok",
        report: json.report,
        tookMs: Date.now() - startedAt,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="muted">Lookback hours</span>
          <input
            type="number"
            min={1}
            max={168}
            value={lookbackHours}
            onChange={(e) => setLookbackHours(e.target.value)}
            disabled={state.kind === "running"}
            style={{
              width: 80,
              padding: "6px 10px",
              background: "var(--bg-2)",
              color: "var(--fg)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          />
        </label>
        <button
          type="button"
          onClick={run}
          disabled={state.kind === "running"}
          style={{
            padding: "8px 16px",
            background:
              state.kind === "running" ? "var(--bg-2)" : "var(--accent, #2563eb)",
            color: state.kind === "running" ? "var(--fg-subtle)" : "#fff",
            border: "1px solid var(--border)",
            borderRadius: 6,
            cursor: state.kind === "running" ? "wait" : "pointer",
            fontWeight: 600,
          }}
        >
          {state.kind === "running" ? "Running…" : "Run reconciliation now"}
        </button>
        {state.kind === "ok" && (
          <span className="muted" style={{ fontSize: 13 }}>
            ✓ Took {(state.tookMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {state.kind === "error" && (
        <div
          style={{
            padding: 16,
            background: "rgba(220, 38, 38, 0.08)",
            border: "1px solid rgba(220, 38, 38, 0.3)",
            borderRadius: 8,
            color: "#fca5a5",
            marginBottom: 16,
          }}
        >
          <strong>Run failed.</strong> {state.message}
        </div>
      )}

      {state.kind === "ok" && <ReportView report={state.report} />}
    </div>
  );
}

function ReportView({ report }: { report: Report }) {
  const providers = Object.keys(report.byProvider);
  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Window {fmtTs(report.windowStart)} → {fmtTs(report.startedAt)}. Run
        finished {fmtTs(report.finishedAt)}.
      </p>
      {providers.length === 0 ? (
        <p className="muted">No providers configured.</p>
      ) : (
        providers.map((id) => (
          <ProviderBlock key={id} id={id} stats={report.byProvider[id]} />
        ))
      )}
      <details style={{ marginTop: 24 }}>
        <summary
          style={{ cursor: "pointer", fontSize: 13, color: "var(--fg-subtle)" }}
        >
          Raw JSON
        </summary>
        <pre
          style={{
            marginTop: 12,
            padding: 16,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            overflow: "auto",
            fontSize: 12,
            maxHeight: 400,
          }}
        >
          {JSON.stringify(report, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function ProviderBlock({ id, stats }: { id: string; stats: ProviderStats }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>
        {id}
      </h3>

      <div style={{ marginBottom: 16 }}>
        <h4
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            color: "var(--fg-subtle)",
            margin: "0 0 8px",
            letterSpacing: 0.5,
          }}
        >
          Forward sweep — provider → DB
        </h4>
        <StatRow
          items={[
            { label: "Scanned", value: stats.scanned },
            { label: "Matched", value: stats.matched },
            { label: "Synthesized", value: stats.synthesized },
            { label: "Anomalies", value: stats.anomalies },
            { label: "Errors", value: stats.errors, danger: stats.errors > 0 },
          ]}
        />
        {stats.errorDetails.length > 0 && (
          <ErrorList details={stats.errorDetails} />
        )}
      </div>

      <div>
        <h4
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            color: "var(--fg-subtle)",
            margin: "0 0 8px",
            letterSpacing: 0.5,
          }}
        >
          Reverse sweep — DB stale-pending → provider (Task #24)
        </h4>
        <StatRow
          items={[
            { label: "Scanned", value: stats.reverseSweep.scanned },
            {
              label: "Recovered",
              value: stats.reverseSweep.recovered,
              good: stats.reverseSweep.recovered > 0,
            },
            { label: "Unchanged", value: stats.reverseSweep.unchanged },
            {
              label: "Errors",
              value: stats.reverseSweep.errors,
              danger: stats.reverseSweep.errors > 0,
            },
          ]}
        />
        {stats.reverseSweep.errorDetails.length > 0 && (
          <ErrorList details={stats.reverseSweep.errorDetails} />
        )}
      </div>
    </section>
  );
}

function StatRow({
  items,
}: {
  items: { label: string; value: number; danger?: boolean; good?: boolean }[];
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            padding: "8px 12px",
            background: "var(--bg-2)",
            border: `1px solid ${
              item.danger
                ? "rgba(220, 38, 38, 0.4)"
                : item.good
                  ? "rgba(34, 197, 94, 0.4)"
                  : "var(--border)"
            }`,
            borderRadius: 6,
            minWidth: 100,
          }}
        >
          <div
            style={{ fontSize: 11, color: "var(--fg-subtle)", marginBottom: 2 }}
          >
            {item.label}
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: item.danger
                ? "#fca5a5"
                : item.good
                  ? "#86efac"
                  : "var(--fg)",
            }}
          >
            {item.value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorList({ details }: { details: string[] }) {
  return (
    <details style={{ marginTop: 12 }}>
      <summary style={{ cursor: "pointer", fontSize: 12, color: "#fca5a5" }}>
        {details.length} error detail{details.length === 1 ? "" : "s"}
      </summary>
      <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 12 }}>
        {details.map((d, i) => (
          <li key={i} style={{ marginBottom: 4, color: "var(--fg-subtle)" }}>
            {d}
          </li>
        ))}
      </ul>
    </details>
  );
}

function fmtTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
