// app/admin/transactions/page.tsx — Raw transactions feed.
//
// Contract: most-recent credit_ledger entries with masked user email
// and every financial column (gross, fee, tax, net). Used for "did
// this customer's charge actually post?" spot-checks.
//
// Each row links to the per-user page; emails are masked on the list
// view (following the Users page convention).

import Link from "next/link";
import { getTransactions } from "@/lib/admin/queries";
import {
  formatCount,
  formatRelative,
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

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams?: { limit?: string };
}) {
  const limit = clampLimit(searchParams?.limit);
  const { data, error } = await getTransactions({ limit });

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Transactions
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Most recent {limit} credit_ledger entries (all sources —
          purchases, grants, refunds).
        </p>
      </header>

      {error ? (
        <ErrorBanner message={`Transactions query failed: ${error}`} />
      ) : null}

      <section>
        <SectionTitle>Recent entries</SectionTitle>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>User</Th>
                <Th>Reason</Th>
                <Th align="right">Delta</Th>
                <Th>Source</Th>
                <Th>Processor</Th>
                <Th>Currency</Th>
                <Th align="right">Gross</Th>
                <Th align="right">Fee</Th>
                <Th align="right">Tax</Th>
                <Th align="right">Net</Th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <Td colSpan={11} align="center">
                    No transactions yet.
                  </Td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.id}>
                    <Td mono>{formatRelative(row.createdAt)}</Td>
                    <Td>
                      <Link
                        href={`/admin/users/${row.userId}`}
                        style={{ color: "inherit" }}
                      >
                        {maskEmail(row.userEmail)}
                      </Link>
                    </Td>
                    <Td>{row.reason}</Td>
                    <Td align="right" mono>{formatCount(row.delta)}</Td>
                    <Td>{row.dataSource ?? "—"}</Td>
                    <Td>{row.provider ?? "—"}</Td>
                    <Td>{row.billingCurrency ?? "—"}</Td>
                    <Td align="right" mono>
                      {row.grossChargeMicros !== null
                        ? microsToUsd(row.grossChargeMicros)
                        : "—"}
                    </Td>
                    <Td align="right" mono>
                      {row.processorFeeMicros !== null
                        ? microsToUsd(row.processorFeeMicros)
                        : "—"}
                    </Td>
                    <Td align="right" mono>
                      {row.taxCollectedMicros !== null
                        ? microsToUsd(row.taxCollectedMicros)
                        : "—"}
                    </Td>
                    <Td align="right" mono>
                      {row.netRevenueMicros !== null
                        ? microsToUsd(row.netRevenueMicros)
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

function clampLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(Math.floor(n), 1000);
}
