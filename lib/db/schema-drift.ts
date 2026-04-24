// Migration-drift detector — Task #28.
//
// After the errno-150 incident on migration 0009 (see CLAUDE.md §6), we
// learned that Hostinger-managed MariaDB needed hand-applied migrations
// for cross-schema FKs — and that there's NO guarantee every `*.sql` in
// `db/migrations/` has landed on the running database. A migration that
// silently drops during a rollout produces runtime TypeError explosions
// hours later (`Unknown column 'promo_code' in 'field list'`) after
// traffic has already hit the code path.
//
// This module compares the Drizzle-declared schema (source of truth at
// build time) against `information_schema.COLUMNS` on the live database
// and returns a structured diff. It's cheap — one query plus an in-memory
// set diff — so we expose it via `/api/health?drift=1` (gated so it
// doesn't run on every Cloudflare ping) and surface the report on
// `/admin/deploy` so the operator sees drift the moment it appears.
//
// Design notes:
//   - We only check expected → actual (missing tables / missing columns).
//     Extra tables or extra columns aren't "drift" — they're additive
//     and can't break the running code. Flagging them would be noisy for
//     hand-applied schema experiments.
//   - We don't check column TYPES. Type checks are high-signal but high
//     false-positive (Drizzle "varchar(255)" vs MariaDB "varchar(255)
//     CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci" would trip a
//     naive string compare). If drift-by-column-name ever becomes green
//     on every deploy, we can harden with type checks later.
//   - Uses the existing Drizzle `getTableConfig` helper — no external
//     deps, no hand-maintained snapshot file to keep in sync. The schema
//     files in `db/schema/` are the single source of truth.
//   - Safe on boot: import is `server-only`, and `detectSchemaDrift`
//     swallows all errors into the report. Cannot flip /api/health to
//     503 even if the drift check itself throws.

import "server-only";
import { sql } from "drizzle-orm";
import { getTableConfig, type MySqlTable } from "drizzle-orm/mysql-core";
import { db, schema } from "@/db/client";

export type TableDrift = {
  tableName: string;
  missingColumns: string[];
};

export type SchemaDriftReport = {
  /** True only when every expected table + column exists on the live DB. */
  ok: boolean;
  /** Tables declared in Drizzle schema but absent from the live DB. */
  missingTables: string[];
  /** Tables that exist but are missing one or more expected columns. */
  driftedTables: TableDrift[];
  /** Number of tables Drizzle declared (informational). */
  expectedTableCount: number;
  /** Name of the live database (null if the probe itself failed). */
  databaseName: string | null;
  /** ISO timestamp of the check. */
  checkedAt: string;
  /** Error string if the drift probe couldn't run. Never throws. */
  error?: string;
};

/**
 * Walk the exported Drizzle schema modules and extract
 * `{ tableName: [columnName, ...] }`. Pure introspection — no I/O. Used
 * by `detectSchemaDrift` and by the test harness to assert every schema
 * table is represented (static-analysis guard in
 * scripts/test-schema-drift.mjs).
 */
export function expectedSchema(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const isTable = Symbol.for("drizzle:IsDrizzleTable");
  for (const val of Object.values(schema)) {
    if (val && typeof val === "object" && isTable in val) {
      // `getTableConfig` validates the table shape at runtime — this is
      // safe even though TypeScript can't narrow the `schema.*` export
      // to `MySqlTable` (it's a union with the inferred row types).
      const cfg = getTableConfig(val as unknown as MySqlTable);
      out[cfg.name] = cfg.columns.map((c) => c.name);
    }
  }
  return out;
}

/**
 * Query `information_schema.COLUMNS` for the live database and diff
 * against `expectedSchema()`. Always resolves — never throws.
 *
 * The returned report shape is stable and JSON-safe so callers can
 * surface it verbatim in `/api/health` and `/admin/deploy`.
 */
export async function detectSchemaDrift(): Promise<SchemaDriftReport> {
  const checkedAt = new Date().toISOString();
  const expected = expectedSchema();
  const expectedTableCount = Object.keys(expected).length;

  try {
    // `DATABASE()` returns the active schema for the current connection.
    // We can't trust an env var here — MYSQL_URL could point at a
    // different DB than the one the pool actually connected to (e.g.
    // after a host rotation). Reading from the session is authoritative.
    const dbRes = (await db.execute(sql`SELECT DATABASE() AS db`)) as unknown;
    const dbRows = extractRows(dbRes);
    const databaseName =
      (dbRows[0] as { db?: string | null } | undefined)?.db ?? null;
    if (!databaseName) {
      return {
        ok: false,
        missingTables: [],
        driftedTables: [],
        expectedTableCount,
        databaseName: null,
        checkedAt,
        error: "DATABASE() returned null — connection has no active schema",
      };
    }

    // Pull every column for the current DB in one round-trip. The WHERE
    // clause is parameterised so `databaseName` can't SQL-inject even if
    // `DATABASE()` ever returns something weird.
    const colsRes = (await db.execute(sql`
      SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ${databaseName}
    `)) as unknown;
    const colRows = extractRows(colsRes) as Array<{
      table_name: string;
      column_name: string;
    }>;

    const actual: Record<string, Set<string>> = {};
    for (const row of colRows) {
      const t = row.table_name;
      if (!actual[t]) actual[t] = new Set();
      actual[t].add(row.column_name);
    }

    const missingTables: string[] = [];
    const driftedTables: TableDrift[] = [];

    for (const [tbl, expectedCols] of Object.entries(expected)) {
      const actualCols = actual[tbl];
      if (!actualCols) {
        missingTables.push(tbl);
        continue;
      }
      const missing = expectedCols.filter((c) => !actualCols.has(c));
      if (missing.length > 0) {
        driftedTables.push({
          tableName: tbl,
          missingColumns: missing.sort(),
        });
      }
    }

    missingTables.sort();
    driftedTables.sort((a, b) => a.tableName.localeCompare(b.tableName));

    return {
      ok: missingTables.length === 0 && driftedTables.length === 0,
      missingTables,
      driftedTables,
      expectedTableCount,
      databaseName,
      checkedAt,
    };
  } catch (err) {
    // Hard-fail path: DB unreachable, permission denied on
    // information_schema, etc. Return a well-formed report so callers
    // can differentiate "drift check errored" from "drift detected".
    return {
      ok: false,
      missingTables: [],
      driftedTables: [],
      expectedTableCount,
      databaseName: null,
      checkedAt,
      error:
        err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
    };
  }
}

/**
 * mysql2/promise returns rows as `[rows, fields]` when invoked via
 * `pool.query`, but Drizzle's `db.execute(sql...)` sometimes returns
 * the rows directly depending on the driver mode. Normalise here so
 * callers can just treat the result as an array of row objects.
 */
function extractRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<Record<string, unknown>>;
  }
  if (Array.isArray(result)) {
    return result as Array<Record<string, unknown>>;
  }
  return [];
}
