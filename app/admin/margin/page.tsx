// app/admin/margin/page.tsx — Daily margin history.
//
// Contract: per-day rev / cost / infra / reserve / breakage, gross &
// net margin bps, gross-green flag. This is the chart-friendly view —
// each row is a complete picture of one UTC day as captured by the
// margin-rollup cron.

import { getMarginDaily } from "@/lib/admin/queries";
import {
  bpsToPercent,
  formatBool,
  formatUtcDate,
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

export default async function AdminMarginPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const days = clampDays(searchParams?.days);
  const { data, error } = await getMarginDaily({ days });

  const totals = data.reduce(
    (acc, r) => {
      acc.rev += r.revenueMicros;
      acc.cost += r.costMicros;
      acc.infra += r.infraMicros;
      acc.reserve += r.reserveMicros;
      acc.breakage += r.breakageMicros;
      return acc;
    },
    { rev: 0, cost: 0, infra: 0, reserve: 0, breakage: 0 }
  );

  const rollingGross =
    totals.rev > 0
      ? Math.round(((totals.rev - totals.cost) / totals.rev) * 10_000)
      : -10_000;
  const rollingNet =
    totals.rev + totals.breakage > 0
      ? Math.round(
          ((totals.rev +
            totals.breakage -
            totals.cost -
            totals.infra -
            totals.reserve) /
            (totals.rev + totals.breakage)) *
            10_000
        )
      : -10_000;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Margin</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Per-UTC-day margin. {days}d rolling: gross{" "}
          {bpsToPercent(rollingGross, { showSign: true })} / net{" "}
          {bpsToPercent(rollingNet, { showSign: true })}.
        </p>
        <div style={{ marginTop: 12 }}>
          <DayPicker current={days} base="/admin/margin" />
        </div>
      </header>

      {error ? (
        <ErrorBanner message={`Margin query failed: ${error}`} />
      ) : null}

      <section>
        <SectionTitle>Daily</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th align="right">Revenue</Th>
                <Th align="right">AI cost</Th>
                <Th align="right">Infra</Th>
                <Th align="right">Reserve</Th>
                <Th align="right">Breakage</Th>
                <Th align="right">Gross</Th>
                <Th align="right">Net</Th>
                <Th align="center">Green</Th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <Td colSpan={9} align="center">
                    No margin data in window.
                  </Td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.date}>
                    <Td>{formatUtcDate(row.date)}</Td>
                    <Td align="right" mono>{microsToUsd(row.revenueMicros)}</Td>
                    <Td align="right" mono>{microsToUsd(row.costMicros)}</Td>
                    <Td align="right" mono>{microsToUsd(row.infraMicros)}</Td>
                    <Td align="right" mono>{microsToUsd(row.reserveMicros)}</Td>
                    <Td align="right" mono>{microsToUsd(row.breakageMicros)}</Td>
                    <Td align="right" mono>
                      <span
                        style={{
                          color:
                            row.grossMarginBps >= 3000
                              ? "#2f855a"
                              : row.grossMarginBps >= 0
                                ? "#b7791f"
                                : "#b23b3b",
                        }}
                      >
                        {bpsToPercent(row.grossMarginBps, { showSign: true })}
                      </span>
                    </Td>
                    <Td align="right" mono>
                      <span
                        style={{
                          color:
                            row.netMarginBps >= 0 ? "#2f855a" : "#b23b3b",
                          fontWeight: 600,
                        }}
                      >
                        {bpsToPercent(row.netMarginBps, { showSign: true })}
                      </span>
                    </Td>
                    <Td align="center">
                      <span
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: row.isGreen ? "#2f855a" : "#b23b3b",
                        }}
                        title={formatBool(row.isGreen)}
                      />
                    </Td>
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
