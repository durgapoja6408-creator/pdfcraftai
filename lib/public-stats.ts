// lib/public-stats.ts — honest, cached public usage stats for marketing pages.
//
// WHY THIS IS CONSERVATIVE BY DESIGN
//   Free tools run 100% in the browser (privacy-by-design), so the bulk of
//   real usage NEVER touches the DB — a "documents processed" count from the
//   DB undercounts true usage. And at early scale the DB rows are dominated by
//   our own test traffic. Showing tiny/test-inflated numbers would HURT trust,
//   not build it. So:
//     - test/admin accounts are EXCLUDED from the counts, and
//     - the live counters are gated behind a credibility FLOOR — below it the
//       marketing UI shows product facts + transparency instead of a number.
//   This makes the counter correct + honest from day one, and it auto-activates
//   only once real traction crosses the floor.

import "server-only";
import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";

export type PublicStats = {
  /** Files (AI outputs/uploads) stored for real (non-test) users. */
  documentsProcessed: number;
  /** AI operations run by real (non-test) users. */
  aiOpsRun: number;
  /** Whether the live numbers clear the credibility floor (safe to show). */
  showLive: boolean;
};

// Don't surface live usage numbers until they're genuinely credible. Below
// this, marketing shows product facts + the transparency block instead.
export const PUBLIC_STATS_FLOOR = Number.parseInt(
  process.env.PUBLIC_STATS_FLOOR ?? "1000",
  10,
);

// The dedicated prod-e2e test identities (CLAUDE.md §4a). Their traffic must
// never count toward public stats. Overridable via env; falls back to the
// documented ids so it's correct even if the env var is unset.
const EXCLUDE_FALLBACK = [
  "6b303c3b-ddfd-48fc-9162-2556d077fece", // durgapoja6408 (non-admin test)
  "4e20c284-cecd-4e23-abce-1858cb039ce6", // rajasekarjavaee+5 (admin test)
];

function excludedUserIds(): string[] {
  const raw = process.env.PUBLIC_STATS_EXCLUDE_USER_IDS;
  if (raw && raw.trim()) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return EXCLUDE_FALLBACK;
}

function rowsOf(raw: unknown): Array<Record<string, unknown>> {
  const a = (raw as Array<Record<string, unknown>>[])[0]
    ?? (raw as Array<Record<string, unknown>>);
  return Array.isArray(a) ? a : [];
}

async function countExcluding(table: "files" | "ai_usage", ids: string[]): Promise<number> {
  const notIn = ids.length
    ? sql` AND user_id NOT IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`
    : sql``;
  const tbl = table === "files" ? sql`files` : sql`ai_usage`;
  const raw = await db.execute(sql`SELECT COUNT(*) AS n FROM ${tbl} WHERE 1=1 ${notIn}`);
  return Number(rowsOf(raw)[0]?.n ?? 0);
}

async function compute(): Promise<PublicStats> {
  // NEVER throw — marketing pages must render even if the DB hiccups.
  try {
    const ids = excludedUserIds();
    const [documentsProcessed, aiOpsRun] = await Promise.all([
      countExcluding("files", ids),
      countExcluding("ai_usage", ids),
    ]);
    const showLive =
      documentsProcessed >= PUBLIC_STATS_FLOOR && aiOpsRun >= PUBLIC_STATS_FLOOR;
    return { documentsProcessed, aiOpsRun, showLive };
  } catch (e) {
    console.error("getPublicStats failed:", (e as Error)?.message);
    return { documentsProcessed: 0, aiOpsRun: 0, showLive: false };
  }
}

// Cached so the static marketing homepage stays static-friendly (ISR) and we
// never run the COUNT on every render. Refreshes hourly.
export const getPublicStats = unstable_cache(compute, ["public-stats-v1"], {
  revalidate: 3600,
});
