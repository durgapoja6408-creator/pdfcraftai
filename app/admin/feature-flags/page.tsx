// app/admin/feature-flags/page.tsx — feature flag state viewer.
//
// PENDING_WORK_ANALYSIS.md §4d. Read-only consumer of
// `lib/flags.ts:snapshotAllFlags()`. Surfaces every flag in the
// registry with its current state (override / user-list size /
// percent / default-on). All values resolve from env vars at render
// time — refresh after a Hostinger panel "Save and redeploy" cycle
// to see updates.
//
// What this page does NOT do
// --------------------------
// - Mutate flag state. Flag changes go through Hostinger panel env
//   vars. This page is observational only.
// - Show the user-override list contents. Names can be PII; we show
//   the count instead. Operators inspect the list via the panel.
// - Compute A/B test stats. The flag system is deterministic-bucket
//   only; downstream analytics is a separate Phase B item.

import {
  FEATURE_FLAGS,
  envKey,
  snapshotAllFlags,
} from "@/lib/flags";
import type { FeatureFlagSnapshot } from "@/lib/flags";
import { requireAdmin } from "@/lib/admin/guard";
import {
  SectionTitle,
  Td,
  Th,
  tableStyle,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function StateChip({ flag }: { flag: FeatureFlagSnapshot }) {
  let bg: string;
  let fg: string;
  let label: string;
  if (flag.override === "on") {
    bg = "color-mix(in oklab, #4caf50 18%, transparent)";
    fg = "#4caf50";
    label = "OVERRIDE ON";
  } else if (flag.override === "off") {
    bg = "color-mix(in oklab, var(--fg) 12%, transparent)";
    fg = "var(--fg-subtle)";
    label = "OVERRIDE OFF";
  } else if (flag.percent !== null && flag.percent > 0) {
    bg = "color-mix(in oklab, #f57c00 18%, transparent)";
    fg = "#f57c00";
    label = `ROLLING (${flag.percent}%)`;
  } else if (flag.userListCount > 0) {
    bg = "color-mix(in oklab, #f57c00 18%, transparent)";
    fg = "#f57c00";
    label = `USERS-ONLY (${flag.userListCount})`;
  } else {
    bg = "color-mix(in oklab, var(--fg) 12%, transparent)";
    fg = "var(--fg-subtle)";
    label = "OFF";
  }
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        background: bg,
        color: fg,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.4,
      }}
    >
      {label}
    </span>
  );
}

export default async function AdminFeatureFlagsPage() {
  await requireAdmin();
  const flags = snapshotAllFlags();

  const onCount = flags.filter(
    (f) => f.override === "on" || f.defaultEnabled,
  ).length;
  const offCount = flags.filter(
    (f) =>
      f.override === "off" ||
      (f.override === null &&
        !f.defaultEnabled &&
        f.userListCount === 0 &&
        (f.percent === null || f.percent === 0)),
  ).length;
  const partialCount = flags.length - onCount - offCount;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Feature flags
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Source: <code>lib/flags.ts</code> registry. Values resolve from
          env vars on the Hostinger panel. Each flag has up to 3 knobs:
        </p>
        <ul
          className="muted"
          style={{
            marginTop: 8,
            fontSize: 13,
            paddingLeft: 20,
            lineHeight: 1.7,
          }}
        >
          <li>
            <code>FEATURE_&lt;FLAG&gt;_OVERRIDE</code> — <code>on</code> /{" "}
            <code>off</code> / unset. Highest priority; bypasses both
            user-list and percent rollout.
          </li>
          <li>
            <code>FEATURE_&lt;FLAG&gt;_USERS</code> — comma-separated
            userIds always-on (no percent gate).
          </li>
          <li>
            <code>FEATURE_&lt;FLAG&gt;_PERCENT</code> — 0-100; deterministic
            bucket by hash(userId, flagName).
          </li>
        </ul>
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          Read-only surface — flag changes require a Hostinger panel
          "Save and redeploy" cycle. Once live volume justifies a SaaS
          flag service (~10+ active flags), the path forward is
          GrowthBook / Unleash; <code>isFeatureEnabled()</code> becomes a
          pass-through and call sites don't change.
        </p>
      </header>

      {/* Summary cards */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div className="card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Total registered
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{flags.length}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Universally on
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#4caf50" }}>
            {onCount}
          </div>
        </div>
        <div
          className="card"
          style={{
            padding: 16,
            borderColor: partialCount > 0 ? "#f57c00" : "var(--border)",
          }}
        >
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Rolling out
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: partialCount > 0 ? "#f57c00" : "var(--fg)",
            }}
          >
            {partialCount}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Off
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{offCount}</div>
        </div>
      </section>

      <SectionTitle>All flags ({flags.length})</SectionTitle>

      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Flag</Th>
            <Th>State</Th>
            <Th>Percent</Th>
            <Th>Users</Th>
            <Th>Env vars</Th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.flag}>
              <Td>
                <code style={{ fontSize: 12 }}>{f.flag}</code>
              </Td>
              <Td>
                <StateChip flag={f} />
              </Td>
              <Td>
                {f.percent !== null ? (
                  <span style={{ fontSize: 13 }}>{f.percent}%</span>
                ) : (
                  <span className="muted" style={{ fontSize: 12 }}>
                    —
                  </span>
                )}
              </Td>
              <Td>
                {f.userListCount > 0 ? (
                  <span style={{ fontSize: 13 }}>
                    {f.userListCount} user
                    {f.userListCount === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="muted" style={{ fontSize: 12 }}>
                    —
                  </span>
                )}
              </Td>
              <Td>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono, monospace)",
                    color: "var(--fg-subtle)",
                    lineHeight: 1.6,
                  }}
                >
                  {envKey(f.flag, "OVERRIDE")}
                  <br />
                  {envKey(f.flag, "USERS")}
                  <br />
                  {envKey(f.flag, "PERCENT")}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>

      {flags.length === 0 ? (
        <p className="muted" style={{ fontSize: 14, marginTop: 16 }}>
          No flags registered. Add entries to <code>FEATURE_FLAGS</code>{" "}
          in <code>lib/flags.ts</code>.
        </p>
      ) : null}
    </div>
  );
}

// Re-export to satisfy unused-import warnings on FEATURE_FLAGS — the
// page renders the snapshot, which iterates the registry internally.
// Kept here so a future refactor that splits the page into client/
// server components has FEATURE_FLAGS already imported.
export { FEATURE_FLAGS };
