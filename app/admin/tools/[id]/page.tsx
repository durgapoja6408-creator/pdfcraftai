// app/admin/tools/[id]/page.tsx — per-tool unit economics.
//
// Plan ref: docs/PRICING_AND_TELEMETRY_PLAN.md §7.
//
// What this page shows for a single AI op (params.id):
//   - Header: op name, base credit cost, multiplier rule
//   - Stats: 30-day call count, total cost (USD), total credits charged,
//     gross margin %, success rate, avg latency
//   - Provider mix table: which providers handled how many calls
//   - Top users table: who's spending the most credits on this op
//
// Why per-op not per-tool-id
//   The user-facing "tools" (ai-summarize, ai-tldr, etc.) all map to a
//   small set of canonical AI ops (summarize, translate, ocr, etc.) at
//   the route layer. ai_usage.operation stores the op, not the tool id.
//   So this page lives at /admin/tools/[id] but `id` is actually the
//   AIOperationId (summarize / translate / ocr / etc.). Naming is a
//   consequence of the URL convention; the data is per-op.
//
// What this page DOESN'T show
//   - Time-series charts (deferred — text tables for v1)
//   - Per-day breakdowns (use /admin/margin for that)
//   - Drill-into-individual-call (use /admin/users/[id] for activity)

import { notFound } from "next/navigation";
import { and, desc, eq, gt, sql } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { requireAdmin } from "@/lib/admin/guard";
import {
  AI_OPERATION_COSTS,
  type AIOperationId,
} from "@/lib/pricing";
import {
  ErrorBanner,
  SectionTitle,
  StatCard,
  Td,
  Th,
  tableStyle,
} from "@/components/admin/ui";
import {
  formatCount,
  microsToUsd,
  bpsToPercent,
  maskEmail,
} from "@/lib/admin/format";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KNOWN_OPS = new Set(Object.keys(AI_OPERATION_COSTS) as AIOperationId[]);

interface ToolDetail {
  totalCalls: number;
  totalCredits: number;
  totalCostMicros: number;
  successCount: number;
  avgLatencyMs: number;
  providers: Array<{
    providerId: string;
    calls: number;
    creditsSpent: number;
    costMicros: number;
  }>;
  topUsers: Array<{
    userId: string;
    email: string;
    calls: number;
    creditsSpent: number;
  }>;
}

function multiplierRuleLabel(op: AIOperationId): string {
  switch (op) {
    case "ocr":
    case "redact":
    case "sign":
      return "× pageCount (per-page metering)";
    case "translate":
      return "× ceil(charCount / 10K) chunks";
    default:
      return "flat (no multiplier)";
  }
}

async function getToolDetail(
  op: AIOperationId,
  days: number,
): Promise<{ data: ToolDetail | null; error: string | null }> {
  try {
    const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Top-line stats.
    const [totals] = await db
      .select({
        calls: sql<number>`COUNT(*)`,
        credits: sql<number>`COALESCE(SUM(${schema.aiUsage.creditsSpent}), 0)`,
        costMicros: sql<number>`COALESCE(SUM(${schema.aiUsage.costMicros}), 0)`,
        successes: sql<number>`COALESCE(SUM(${schema.aiUsage.success}), 0)`,
        avgLatency: sql<number>`COALESCE(AVG(${schema.aiUsage.latencyMs}), 0)`,
      })
      .from(schema.aiUsage)
      .where(
        and(
          eq(schema.aiUsage.operation, op),
          gt(schema.aiUsage.createdAt, windowStart),
        ),
      );

    // Per-provider mix.
    const providerRows = await db
      .select({
        providerId: schema.aiUsage.providerId,
        calls: sql<number>`COUNT(*)`,
        creditsSpent: sql<number>`COALESCE(SUM(${schema.aiUsage.creditsSpent}), 0)`,
        costMicros: sql<number>`COALESCE(SUM(${schema.aiUsage.costMicros}), 0)`,
      })
      .from(schema.aiUsage)
      .where(
        and(
          eq(schema.aiUsage.operation, op),
          gt(schema.aiUsage.createdAt, windowStart),
        ),
      )
      .groupBy(schema.aiUsage.providerId)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);

    // Top users by credit spend.
    const topUserRows = await db
      .select({
        userId: schema.aiUsage.userId,
        calls: sql<number>`COUNT(*)`,
        creditsSpent: sql<number>`COALESCE(SUM(${schema.aiUsage.creditsSpent}), 0)`,
      })
      .from(schema.aiUsage)
      .where(
        and(
          eq(schema.aiUsage.operation, op),
          gt(schema.aiUsage.createdAt, windowStart),
        ),
      )
      .groupBy(schema.aiUsage.userId)
      .orderBy(desc(sql`SUM(${schema.aiUsage.creditsSpent})`))
      .limit(10);

    // Resolve user emails for top users in one IN-list query.
    const topUserIds = topUserRows.map((r) => r.userId);
    const emailRows = topUserIds.length
      ? await db
          .select({
            id: schema.users.id,
            email: schema.users.email,
          })
          .from(schema.users)
          .where(sql`${schema.users.id} IN (${sql.raw(topUserIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(","))})`)
      : [];
    const emailMap = new Map(emailRows.map((r) => [r.id, r.email]));

    return {
      data: {
        totalCalls: Number(totals?.calls ?? 0),
        totalCredits: Number(totals?.credits ?? 0),
        totalCostMicros: Number(totals?.costMicros ?? 0),
        successCount: Number(totals?.successes ?? 0),
        avgLatencyMs: Math.round(Number(totals?.avgLatency ?? 0)),
        providers: providerRows.map((r) => ({
          providerId: r.providerId,
          calls: Number(r.calls ?? 0),
          creditsSpent: Number(r.creditsSpent ?? 0),
          costMicros: Number(r.costMicros ?? 0),
        })),
        topUsers: topUserRows.map((r) => ({
          userId: r.userId,
          email: emailMap.get(r.userId) ?? "(unknown)",
          calls: Number(r.calls ?? 0),
          creditsSpent: Number(r.creditsSpent ?? 0),
        })),
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

function clampDays(raw: string | undefined): number {
  const n = raw ? parseInt(raw, 10) : 30;
  if (!Number.isFinite(n) || n < 1) return 30;
  if (n > 365) return 365;
  return n;
}

export default async function AdminToolDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { days?: string };
}) {
  await requireAdmin();

  const op = params.id as AIOperationId;
  if (!KNOWN_OPS.has(op)) {
    notFound();
  }

  const days = clampDays(searchParams?.days);
  const baseCost = AI_OPERATION_COSTS[op];
  const { data, error } = await getToolDetail(op, days);

  // Margin calculation. Credits charged → INR via Starter pack rate
  // (₹399/100 credits = ₹3.99/credit). Cost in USD micros → INR via
  // USD_TO_INR_RATE (84). Everything in USD micros for the math.
  const STARTER_RATE_INR_PER_CREDIT = 3.99;
  const USD_INR = 84;
  const revenueMicros = data
    ? Math.round((data.totalCredits * STARTER_RATE_INR_PER_CREDIT * 1_000_000) / USD_INR)
    : 0;
  const grossMarginBps =
    data && revenueMicros > 0
      ? Math.round(((revenueMicros - data.totalCostMicros) / revenueMicros) * 10_000)
      : 0;
  const successRateBps =
    data && data.totalCalls > 0
      ? Math.round((data.successCount / data.totalCalls) * 10_000)
      : 0;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Tool: <code style={{ fontSize: 24 }}>{op}</code>
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Base cost: <strong style={{ color: "var(--fg)" }}>{baseCost} credits</strong>{" "}
          {multiplierRuleLabel(op)}.
        </p>
        <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
          Last {days} days. Toggle:{" "}
          <a href={`?days=7`} style={{ color: "var(--accent)" }}>7d</a>{" · "}
          <a href={`?days=30`} style={{ color: "var(--accent)" }}>30d</a>{" · "}
          <a href={`?days=90`} style={{ color: "var(--accent)" }}>90d</a>{" · "}
          <a href={`?days=365`} style={{ color: "var(--accent)" }}>365d</a>
        </p>
      </header>

      {error ? <ErrorBanner message={`Tool query failed: ${error}`} /> : null}

      {data ? (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <StatCard label="Calls" value={formatCount(data.totalCalls)} />
            <StatCard label="Credits charged" value={formatCount(data.totalCredits)} />
            <StatCard
              label="AI cost"
              value={`$${microsToUsd(data.totalCostMicros)}`}
            />
            <StatCard
              label="Gross margin"
              value={data.totalCalls > 0 ? `${bpsToPercent(grossMarginBps)}%` : "—"}
              tone={grossMarginBps >= 7000 ? "good" : grossMarginBps >= 5000 ? "warn" : "bad"}
            />
            <StatCard
              label="Success rate"
              value={data.totalCalls > 0 ? `${bpsToPercent(successRateBps)}%` : "—"}
              tone={successRateBps >= 9500 ? "good" : successRateBps >= 9000 ? "warn" : "bad"}
            />
            <StatCard
              label="Avg latency"
              value={`${data.avgLatencyMs} ms`}
            />
          </section>

          <section style={{ marginBottom: 24 }}>
            <SectionTitle>Provider mix</SectionTitle>
            {data.providers.length === 0 ? (
              <p className="muted">No calls in window.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th>Provider</Th>
                    <Th>Calls</Th>
                    <Th>Credits</Th>
                    <Th>Cost (USD)</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.providers.map((p) => (
                    <tr key={p.providerId}>
                      <Td><code>{p.providerId}</code></Td>
                      <Td>{formatCount(p.calls)}</Td>
                      <Td>{formatCount(p.creditsSpent)}</Td>
                      <Td>${microsToUsd(p.costMicros)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <SectionTitle>Top users by spend</SectionTitle>
            {data.topUsers.length === 0 ? (
              <p className="muted">No users in window.</p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th>User</Th>
                    <Th>Calls</Th>
                    <Th>Credits</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.topUsers.map((u) => (
                    <tr key={u.userId}>
                      <Td>
                        <Link
                          href={`/admin/users/${u.userId}`}
                          style={{ color: "var(--accent)" }}
                        >
                          {maskEmail(u.email)}
                        </Link>
                      </Td>
                      <Td>{formatCount(u.calls)}</Td>
                      <Td>{formatCount(u.creditsSpent)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <p className="muted" style={{ marginTop: 24, fontSize: 12 }}>
            Margin computed against Starter pack rate (₹{STARTER_RATE_INR_PER_CREDIT}/credit ÷ ${USD_INR} INR/USD ≈ $0.0475/credit).
            Real margin varies by which pack the credit was purchased through; this is the conservative floor.
          </p>
        </>
      ) : null}
    </div>
  );
}
