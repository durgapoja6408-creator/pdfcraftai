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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminDeployPage() {
  const snap = getDeploySnapshot();

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
              : "No COMMIT_SHA / GIT_COMMIT env var set"
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
    </div>
  );
}
