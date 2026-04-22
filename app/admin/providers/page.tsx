// app/admin/providers/page.tsx — Per-provider health.
//
// Contract: for each AI provider, show call volume, error rate,
// cost, token totals, mean latency, and its share of total calls.
// Mirrors /admin/ops but groups by providerId instead of operation.

import { getProvidersHealth } from "@/lib/admin/queries";
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

export default async function AdminProvidersPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const days = clampDays(searchParams?.days);
  const { data, error } = await getProvidersHealth({ days });

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Providers</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Past {days} days. One row per upstream AI provider.
        </p>
        <div style={{ marginTop: 12 }}>
          <DayPicker current={days} base="/admin/providers" />
        </div>
      </header>

      {error ? (
        <ErrorBanner message={`Providers query failed: ${error}`} />
      ) : null}

      <section>
        <SectionTitle>Per-provider rollup</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Provider</Th>
                <Th align="right">Share</Th>
                <Th align="right">Calls</Th>
                <Th align="right">Errors</Th>
                <Th align="right">Error rate</Th>
                <Th align="right">Cost</Th>
                <Th align="right">In tokens</Th>
                <Th align="right">Out tokens</Th>
                <Th align="right">Mean latency</Th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <Td colSpan={9} align="center">
                    No provider data in window.
                  </Td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.providerId}>
                    <Td>{row.providerId}</Td>
                    <Td align="right" mono>{row.primarySharePct}%</Td>
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
                    <Td align="right" mono>{microsToUsd(row.costMicros)}</Td>
                    <Td align="right" mono>{formatCount(row.inputTokens)}</Td>
                    <Td align="right" mono>{formatCount(row.outputTokens)}</Td>
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
