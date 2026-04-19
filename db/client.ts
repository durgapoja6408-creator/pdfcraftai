/**
 * Singleton Drizzle client over mysql2/promise.
 * Reuses the connection pool across hot-reloads in development.
 *
 * The pool is created lazily on first access so that `next build` can safely
 * import modules that reference `db` without MYSQL_URL being set at build time.
 * The env var is only required when the first query actually runs.
 */

import "server-only";
import mysql from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __pdfcraftMysqlPool: mysql.Pool | undefined;
  // eslint-disable-next-line no-var
  var __pdfcraftDrizzle: MySql2Database<typeof schema> | undefined;
}

function createPool(): mysql.Pool {
  const connectionString = process.env.MYSQL_URL;
  if (!connectionString) {
    throw new Error(
      "MYSQL_URL is not set. Copy .env.example to .env.local or set it in Hostinger hPanel."
    );
  }
  return mysql.createPool({
    uri: connectionString,
    connectionLimit: 10,
    waitForConnections: true,
    enableKeepAlive: true,
  });
}

function getDb(): MySql2Database<typeof schema> {
  if (global.__pdfcraftDrizzle) return global.__pdfcraftDrizzle;
  const pool = global.__pdfcraftMysqlPool ?? createPool();
  const instance = drizzle(pool, { schema, mode: "default" });
  if (process.env.NODE_ENV !== "production") {
    global.__pdfcraftMysqlPool = pool;
    global.__pdfcraftDrizzle = instance;
  }
  return instance;
}

// Proxy that defers pool creation until a property is accessed (first query).
// This keeps the `db` export shape unchanged for existing callers while letting
// `next build` statically import this module without MYSQL_URL being set.
export const db = new Proxy({} as MySql2Database<typeof schema>, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type DB = MySql2Database<typeof schema>;
export { schema };
