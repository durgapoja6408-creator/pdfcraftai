// app/admin/deploy/page.tsx — Runtime environment snapshot.
//
// Contract: show exactly what commit the runtime is serving, what Node
// version and Next.js runtime it's on, and which margin constants are
// baked into this build (infra monthly, refund reserve, reference
// USD-per-credit). This is the page operators check after a deploy to
// confirm "did my push actually roll out?"
//
// `commitSha` comes from env vars set by Hostinger's GitHub App
// integration (see lib/admin/queries.ts#getDeploySnapshot) — if none
// are set we show "unknown" rather than crashing.

import { getDeploySnapshot } from "@/lib/admin/queries";
import { microsToUsd, bpsToPercent } from "@/lib/admin/format";
import {
  SectionTitle,
  StatCard,
  Td,
  Th,
  tableStyle,
} from "@/components/admin/ui";
import { detectSchemaDrift } from "@/lib/db/schema-drift";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminDeployPage() {
  const snap = getDeploySnapshot();
  // Drift probe — cheap (one information_schema query) and critical:
  // after the errno-150 incident on 0009, a silently-dropped migration
  // is the #1 risk. Render the report inline so post-deploy verification
  // is a single page load. `detectSchemaDrift` never throws.
  const drift = await detectSchemaDrift();

  const githubRepo = "durgapoja6408-creator/pdfcraftai";
  const commitShort = snap.commitSha ? snap.commitSha.slice(0, 7) : null;
  const commitLink = snap.commitSha
    ? `https://github.com/${githubRepo}/commit/${snap.commitSha}`
    : null;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Deploy</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Runtime snapshot of the currently-serving Next.js process.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Commit"
          value={commitShort ?? "unknown"}
          hint={
            snap.commitSha
              ? `Full SHA: ${snap.commitSha}`
              : "No BUILD_COMMIT_SHA / COMMIT_SHA env var available"
          }
        />
        <StatCard label="Node" value={snap.nodeVersion} />
        <StatCard label="Next runtime" value={snap.nextRuntime} />
      </section>

      <section style={{ marginBottom: 24 }}>
        <SectionTitle>Build metadata</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <tbody>
              <tr>
                <Th>Deployed at</Th>
                <Td mono>{snap.deployedAt ?? "—"}</Td>
              </tr>
              <tr>
                <Th>Commit SHA</Th>
                <Td mono>
                  {commitLink ? (
                    <a
                      href={commitLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "inherit" }}
                    >
                      {snap.commitSha}
                    </a>
                  ) : (
                    "unknown"
                  )}
                </Td>
              </tr>
              <tr>
                <Th>GitHub repo</Th>
                <Td mono>
                  <a
                    href={`https://github.com/${githubRepo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "inherit" }}
                  >
                    {githubRepo}
                  </a>
                </Td>
              </tr>
              <tr>
                <Th>Node version</Th>
                <Td mono>{snap.nodeVersion}</Td>
              </tr>
              <tr>
                <Th>Next runtime</Th>
                <Td mono>{snap.nextRuntime}</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionTitle>Margin constants baked into this build</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Constant</Th>
                <Th align="right">Value</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>INFRA_MONTHLY_USD_MICROS</Td>
                <Td align="right" mono>
                  {microsToUsd(snap.infraMonthlyUsdMicros)}
                </Td>
                <Td>
                  Fixed monthly infrastructure cost allocated per call by the
                  margin cron.
                </Td>
              </tr>
              <tr>
                <Td mono>REFUND_RESERVE_BPS</Td>
                <Td align="right" mono>
                  {bpsToPercent(snap.refundReserveBps, { showSign: false })}
                </Td>
                <Td>
                  Net revenue fraction parked as refund reserve before net
                  margin is computed.
                </Td>
              </tr>
              <tr>
                <Td mono>REFERENCE_USD_MICROS_PER_CREDIT</Td>
                <Td align="right" mono>
                  {microsToUsd(snap.referenceUsdMicrosPerCredit)}
                </Td>
                <Td>
                  Price per credit used by the margin rollup to impute revenue
                  for credit-spending calls.
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          These are compile-time constants in{" "}
          <code>lib/ai/margin-rollup.ts</code>. To change them, edit the source
          + push to <code>main</code>. There is no runtime override knob — the
          numbers you see here are exactly what the nightly margin cron will
          use tonight.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <SectionTitle>Schema drift</SectionTitle>
        <div
          className="card"
          style={{
            padding: 16,
            borderColor: drift.ok ? undefined : "var(--red)",
            background: drift.ok ? undefined : "var(--red-soft, #fff3f3)",
          }}
        >
          {drift.error ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Drift probe errored
              </div>
              <code style={{ fontSize: 12, color: "var(--red)" }}>
                {drift.error}
              </code>
            </>
          ) : drift.ok ? (
            <div style={{ fontSize: 14 }}>
              <span style={{ color: "var(--green, #0a7a2a)", fontWeight: 600 }}>
                OK
              </span>{" "}
              — all {drift.expectedTableCount} expected tables match the live
              schema on <code>{drift.databaseName}</code>.
            </div>
          ) : (
            <>
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 10,
                  color: "var(--red)",
                }}
              >
                Drift detected — a migration may not have landed on{" "}
                <code>{drift.databaseName}</code>.
              </div>
              {drift.missingTables.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>
                    Missing tables ({drift.missingTables.length}):
                  </div>
                  <code style={{ fontSize: 12 }}>
                    {drift.missingTables.join(", ")}
                  </code>
                </div>
              )}
              {drift.driftedTables.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>
                    Tables missing columns ({drift.driftedTables.length}):
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                    {drift.driftedTables.map((d) => (
                      <li key={d.tableName}>
                        <code>{d.tableName}</code>:{" "}
                        <code>{d.missingColumns.join(", ")}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
                Apply the outstanding migration from{" "}
                <code>db/migrations/</code> via SSH + <code>mysql</code> client
                (per CLAUDE.md §6). Migrations are hand-applied because of the
                errno-150 FK-repair incident on 0009.
              </p>
            </>
          )}
          <p
            className="muted"
            style={{ marginTop: 12, fontSize: 11, letterSpacing: "0.04em" }}
          >
            Checked at {drift.checkedAt}
          </p>
        </div>
      </section>
    </div>
  );
}
