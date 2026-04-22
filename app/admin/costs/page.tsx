// app/admin/costs/page.tsx — Cost breakdown with a P&L waterfall.
//
// Contract: cost by operation, cost by provider, full net-margin
// waterfall (gross → fee → tax → net → AI cost → infra → reserve →
// +breakage → final net). Mirrors the math in lib/ai/margin-rollup.ts.

import { getCostsBreakdown } from "@/lib/admin/queries";
import {
  bpsToPercent,
  formatCount,
  microsToCompactUsd,
  microsToUsd,
} from "@/lib/admin/format";
import {
  DayPicker,
  ErrorBanner,
  SectionTitle,
  StatCard,
  Td,
  Th,
  clampDays,
  tableStyle,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminCostsPage({
  searchParams,
}: {
  searchParams?: { days?: string };
}) {
  const days = clampDays(searchParams?.days);
  const { data, error } = await getCostsBreakdown({ days });
  const w = data.waterfall;

  const netRevPlusBreakage = w.netRevenueMicros + w.breakageRevenueMicros;
  const finalMarginBps =
    netRevPlusBreakage > 0
      ? Math.round((w.finalNetMicros / netRevPlusBreakage) * 10_000)
      : -10_000;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Costs</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Past {days} days. Provider cost is AI provider API cost only;
          infra is amortised monthly infra spend per call.
        </p>
        <div style={{ marginTop: 12 }}>
          <DayPicker current={days} base="/admin/costs" />
        </div>
      </header>

      {error ? (
        <ErrorBanner message={`Costs query failed: ${error}`} />
      ) : null}

      <section style={{ marginBottom: 24 }}>
        <SectionTitle>Net margin waterfall</SectionTitle>
        <div className="card" style={{ padding: 16 }}>
          <WaterfallRow
            label="Gross revenue"
            value={w.grossRevenueMicros}
            kind="add"
          />
          <WaterfallRow
            label="− Processor fee"
            value={-w.processorFeeMicros}
            kind="sub"
          />
          <WaterfallRow
            label="− Tax remittable"
            value={-w.taxRemittableMicros}
            kind="sub"
          />
          <WaterfallRow
            label="= Net revenue"
            value={w.netRevenueMicros}
            kind="total"
          />
          <WaterfallRow
            label="− AI provider cost"
            value={-w.aiCostMicros}
            kind="sub"
          />
          <WaterfallRow
            label="− Infra cost (amortised)"
            value={-w.infraCostMicros}
            kind="sub"
          />
          <WaterfallRow
            label="− Refund reserve"
            value={-w.refundReserveMicros}
            kind="sub"
          />
          <WaterfallRow
            label="+ Breakage credit"
            value={w.breakageRevenueMicros}
            kind="add"
          />
          <WaterfallRow
            label="= Final net"
            value={w.finalNetMicros}
            kind="total"
            marginBps={finalMarginBps}
          />
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Cost coverage"
          value={bpsToPercent(finalMarginBps, { showSign: true })}
          hint="Final net / (net rev + breakage)"
          tone={finalMarginBps >= 0 ? "good" : "bad"}
        />
        <StatCard
          label="AI unit cost"
          value={
            data.byOp.reduce((s, r) => s + r.callCount, 0) > 0
              ? microsToUsd(
                  Math.round(
                    data.byOp.reduce((s, r) => s + r.costMicros, 0) /
                      Math.max(
                        1,
                        data.byOp.reduce((s, r) => s + r.callCount, 0)
                      )
                  )
                )
              : "—"
          }
          hint={`${formatCount(data.byOp.reduce((s, r) => s + r.callCount, 0))} calls`}
        />
      </section>

      <section style={{ marginBottom: 24 }}>
        <SectionTitle>By operation</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Operation</Th>
                <Th align="right">Calls</Th>
                <Th align="right">Revenue</Th>
                <Th align="right">AI cost</Th>
                <Th align="right">Unit cost</Th>
                <Th align="right">Gross margin</Th>
              </tr>
            </thead>
            <tbody>
              {data.byOp.length === 0 ? (
                <tr>
                  <Td colSpan={6} align="center">
                    No data in window.
                  </Td>
                </tr>
              ) : (
                data.byOp.map((row) => (
                  <tr key={row.operation}>
                    <Td>{row.operation}</Td>
                    <Td align="right" mono>{formatCount(row.callCount)}</Td>
                    <Td align="right" mono>{microsToUsd(row.revenueMicros)}</Td>
                    <Td align="right" mono>{microsToUsd(row.costMicros)}</Td>
                    <Td align="right" mono>
                      {row.callCount > 0
                        ? microsToUsd(Math.round(row.costMicros / row.callCount))
                        : "—"}
                    </Td>
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
                        {bpsToPercent(row.marginBps, { showSign: true })}
                      </span>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <SectionTitle>By provider</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Provider</Th>
                <Th align="right">Calls</Th>
                <Th align="right">AI cost</Th>
                <Th align="right">Input tokens</Th>
                <Th align="right">Output tokens</Th>
                <Th align="right">Unit cost</Th>
              </tr>
            </thead>
            <tbody>
              {data.byProvider.length === 0 ? (
                <tr>
                  <Td colSpan={6} align="center">
                    No data in window.
                  </Td>
                </tr>
              ) : (
                data.byProvider.map((row) => (
                  <tr key={row.providerId}>
                    <Td>{row.providerId}</Td>
                    <Td align="right" mono>{formatCount(row.callCount)}</Td>
                    <Td align="right" mono>{microsToUsd(row.costMicros)}</Td>
                    <Td align="right" mono>{formatCount(row.inputTokens)}</Td>
                    <Td align="right" mono>{formatCount(row.outputTokens)}</Td>
                    <Td align="right" mono>
                      {row.callCount > 0
                        ? microsToUsd(Math.round(row.costMicros / row.callCount))
                        : "—"}
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

function WaterfallRow({
  label,
  value,
  kind,
  marginBps,
}: {
  label: string;
  value: number;
  kind: "add" | "sub" | "total";
  marginBps?: number;
}) {
  const color =
    kind === "sub" ? "#b23b3b" : kind === "add" ? "#2f855a" : undefined;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: "8px 0",
        borderTop: kind === "total" ? "1px solid var(--border)" : undefined,
        marginTop: kind === "total" ? 6 : 0,
        fontWeight: kind === "total" ? 700 : 400,
      }}
    >
      <span style={{ color: kind === "total" ? undefined : color }}>
        {label}
      </span>
      <span
        style={{
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, monospace',
          color: kind === "total" ? undefined : color,
        }}
      >
        {microsToCompactUsd(value)}
        {marginBps !== undefined ? (
          <span
            className="subtle"
            style={{ marginLeft: 12, fontWeight: 400, fontSize: 13 }}
          >
            ({bpsToPercent(marginBps, { showSign: true })})
          </span>
        ) : null}
      </span>
    </div>
  );
}
