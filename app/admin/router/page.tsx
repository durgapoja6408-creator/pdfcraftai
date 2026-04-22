// app/admin/router/page.tsx — Live routing table + kill-switch state.
//
// Contract: show the currently-active router policy (primary + ladder
// per op, taking env overrides into account) and the kill-switch
// snapshot (provider-level and op-level). No "edit" controls — flips
// happen via Hostinger env vars + redeploy, per lib/ai/kill-switches.ts.
// This page is strictly diagnostic.

import { currentPolicySnapshot } from "@/lib/ai/router";
import { killSwitchSnapshot } from "@/lib/ai/kill-switches";
import {
  SectionTitle,
  Td,
  Th,
  tableStyle,
} from "@/components/admin/ui";
import { formatBool } from "@/lib/admin/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminRouterPage() {
  const policy = currentPolicySnapshot();
  const kill = killSwitchSnapshot();

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Router</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Live routing policy + kill-switch state. Flips require an env-var
          change in Hostinger + redeploy.
        </p>
      </header>

      <section style={{ marginBottom: 24 }}>
        <SectionTitle>Active policy (env overrides applied)</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Op</Th>
                <Th>Primary</Th>
                <Th>Fallback ladder</Th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(policy).map(([op, ladder]) => (
                <tr key={op}>
                  <Td>{op}</Td>
                  <Td mono>
                    <span style={{ fontWeight: 600 }}>{ladder[0] ?? "—"}</span>
                  </Td>
                  <Td mono>{ladder.slice(1).join(" → ") || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <SectionTitle>Provider kill-switches</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Provider</Th>
                <Th>Env var</Th>
                <Th align="center">Killed?</Th>
              </tr>
            </thead>
            <tbody>
              {kill.providers.map((row) => (
                <tr key={row.id}>
                  <Td>{row.id}</Td>
                  <Td mono>{row.envVar}</Td>
                  <Td align="center">
                    <KillBadge on={row.killed} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionTitle>Operation kill-switches</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Op</Th>
                <Th>Env var</Th>
                <Th align="center">Killed?</Th>
              </tr>
            </thead>
            <tbody>
              {kill.ops.map((row) => (
                <tr key={row.op}>
                  <Td>{row.op}</Td>
                  <Td mono>{row.envVar}</Td>
                  <Td align="center">
                    <KillBadge on={row.killed} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="muted" style={{ marginTop: 24, fontSize: 13 }}>
        Kill-switch flip: set the env var to <code>true</code> in Hostinger →
        Environment Variables → Save and redeploy. Flip back to blank (or any
        non-truthy value like <code>false</code>) to re-enable.
      </p>
    </div>
  );
}

function KillBadge({ on }: { on: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        background: on ? "#b23b3b" : "#2f855a",
        color: "white",
      }}
    >
      {on ? "KILLED" : formatBool(false).toUpperCase()}
    </span>
  );
}
