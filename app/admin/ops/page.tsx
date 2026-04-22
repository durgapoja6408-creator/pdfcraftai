// app/admin/ops/page.tsx — Per-operation health.
//
// Contract: for each AIOp (ocr / translate / chat / summarize / compare
// / generate / sign / rewrite / table / redact), show call volume,
// error rate, truncation rate, cost, revenue, gross margin, mean
// latency. One row per op.
//
// Truncation rate comes from ai_usage.response_truncated (nullable —
// rows from before the column existed get NULL, which is excluded
// from the denominator).

import { getOpsHealth } from "@/lib/admin/queries";
import {
  bpsToPercent,
  formatCount,
  formatDuration,
  microsToUsd,
} from "@/lib/admin/format";
import {
  DayPicker,
  ErrorBanner,
  SectionTitle,
  Td,
  Th,
  clampDays,
  tableStyle,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminOpsPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const days = clampDays(searchParams?.days);
  const { data, error } = await getOpsHealth({ days });

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Operations</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Past {days} days. One row per AI operation.
        </p>
        <div style={{ marginTop: 12 }}>
          <DayPicker current={days} base="/admin/ops" />
        </div>
      </header>

      {error ? <ErrorBanner message={`Ops query failed: ${error}`} /> : null}

      <section>
        <SectionTitle>Per-operation rollup</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Op</Th>
                <Th align="right">Calls</Th>
                <Th align="right">Errors</Th>
                <Th align="right">Error rate</Th>
                <Th align="right">Truncation</Th>
                <Th align="right">Cost</Th>
                <Th align="right">Revenue</Th>
                <Th align="right">Margin</Th>
                <Th align="right">Mean latency</Th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <Td colSpan={9} align="center">
                    No ops data in window.
                  </Td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.operation}>
                    <Td>{row.operation}</Td>
                    <Td align="right" mono>{formatCount(row.callCount)}</Td>
                    <Td align="right" mono>{formatCount(row.errorCount)}</Td>
                    <Td align="right" mono>
                      <span
                        style={{
                          color:
                            row.errorRateBps >= 500
                              ? "#b23b3b"
                              : row.errorRateBps >= 100
                                ? "#b7791f"
                                : undefined,
                        }}
                      >
                        {bpsToPercent(row.errorRateBps, { showSign: false })}
                      </span>
                    </Td>
                    <Td align="right" mono>
                      {row.truncationRateBps === null
                        ? "—"
                        : bpsToPercent(row.truncationRateBps, {
                            showSign: false,
                          })}
                    </Td>
                    <Td align="right" mono>{microsToUsd(row.costMicros)}</Td>
                    <Td align="right" mono>{microsToUsd(row.revenueMicros)}</Td>
                    <Td align="right" mono>
                      <span
                        style={{
                          color:
                            row.marginBps >= 3000
                              ? "#2f855a"
                              : row.marginBps >= 0
                                ? "#b7791f"
                                : "#b23b3b",
                        }}
                      >
                        {row.revenueMicros > 0
                          ? bpsToPercent(row.marginBps, { showSign: true })
                          : "—"}
                      </span>
                    </Td>
                    <Td align="right" mono>{formatDuration(row.meanLatencyMs)}</Td>
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
