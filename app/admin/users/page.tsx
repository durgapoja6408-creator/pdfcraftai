// app/admin/users/page.tsx — User P&L.
//
// Contract: ranked table of users by 30d net revenue with their 30d
// AI cost, call count, per-user margin, and current credit balance.
// Email is masked by default — click through to /admin/users/[id]
// for the unmasked view.

import Link from "next/link";
import { getUsersPnl } from "@/lib/admin/queries";
import {
  bpsToPercent,
  formatCount,
  formatUtcDate,
  maskEmail,
  microsToUsd,
} from "@/lib/admin/format";
import {
  ErrorBanner,
  SectionTitle,
  Td,
  Th,
  tableStyle,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: { limit?: string };
}) {
  const limit = clampLimit(searchParams?.limit);
  const { data, error } = await getUsersPnl({ limit });

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Users</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Top {limit} by 30d net revenue. Emails masked — click a row for the
          full view.
        </p>
      </header>

      {error ? (
        <ErrorBanner message={`Users query failed: ${error}`} />
      ) : null}

      <section>
        <SectionTitle>Ranked P&amp;L</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Joined</Th>
                <Th align="right">Net rev (30d)</Th>
                <Th align="right">AI cost (30d)</Th>
                <Th align="right">Calls (30d)</Th>
                <Th align="right">Margin</Th>
                <Th align="right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <Td colSpan={7} align="center">
                    No users.
                  </Td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.userId}>
                    <Td>
                      <Link
                        href={`/admin/users/${row.userId}`}
                        style={{ color: "inherit" }}
                      >
                        {maskEmail(row.email)}
                      </Link>
                    </Td>
                    <Td>{formatUtcDate(row.createdAt)}</Td>
                    <Td align="right" mono>
                      {microsToUsd(row.last30dNetRevenueMicros)}
                    </Td>
                    <Td align="right" mono>
                      {microsToUsd(row.last30dAiCostMicros)}
                    </Td>
                    <Td align="right" mono>
                      {formatCount(row.last30dCallCount)}
                    </Td>
                    <Td align="right" mono>
                      <span
                        style={{
                          color:
                            row.last30dMarginBps >= 3000
                              ? "#2f855a"
                              : row.last30dMarginBps >= 0
                                ? "#b7791f"
                                : "#b23b3b",
                        }}
                      >
                        {row.last30dNetRevenueMicros > 0
                          ? bpsToPercent(row.last30dMarginBps, { showSign: true })
                          : "—"}
                      </span>
                    </Td>
                    <Td align="right" mono>{formatCount(row.balance)}</Td>
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

function clampLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(Math.floor(n), 500);
}
