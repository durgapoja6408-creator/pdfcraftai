/**
 * Singleton Drizzle client over mysql2/promise.
 * Reuses the connection pool across hot-reloads in development.
 *
 * `mysql.createPool` is lazy — it only stores config; the actual TCP/socket
 * connection isn't established until the first query runs. That lets us
 * construct `db` at module import time safely, even during `next build`
 * page-data collection, as long as the URI parses.
 *
 * If MYSQL_URL isn't set (e.g. a CI build env), we fall back to a harmless
 * placeholder URI so `createPool` doesn't throw. The first real query will
 * then fail loudly with ECONNREFUSED — which is the correct behaviour:
 * the build completes, but the app won't serve without real credentials.
 *
 * Keeping `db` as a direct drizzle instance (not a Proxy) is important:
 * `@auth/drizzle-adapter` does duck-type detection on the instance shape
 * and a Proxy wrapper trips up that check.
 */

import "server-only";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema";

// Force IPv4 loopback. On Hostinger / managed Node hosts, the MySQL user is
// frequently granted from `@127.0.0.1` only, but mysql2 resolves `localhost`
// via Node's DNS which prefers `::1` (IPv6) on this host — producing
// "Access denied for user '...'@'::1'" even when the password is correct.
// We also parse the URI manually so percent-encoded characters in the
// password (e.g. `%40` → `@`) are decoded properly — mysql2's built-in URI
// parser leaves them literal, which produces spurious "Access denied" errors
// for any password containing reserved URL characters.
const rawConnectionString =
  process.env.MYSQL_URL ?? "mysql://build:build@127.0.0.1:3306/build";

function parseMysqlUri(uri: string) {
  // Expect shape: mysql://user:password@host:port/database
  const m =
    /^mysql:\/\/([^:@\/]+)(?::([^@]*))?@([^:\/]+)(?::(\d+))?\/([^?]+)/.exec(uri);
  if (!m) {
    return {
      host: "127.0.0.1",
      port: 3306,
      user: "build",
      password: "build",
      database: "build",
    };
  }
  const [, user, password = "", rawHost, port, database] = m;
  // IPv4-loopback coercion — see header comment.
  const host = rawHost === "localhost" ? "127.0.0.1" : rawHost;
  return {
    host,
    port: port ? Number(port) : 3306,
    user: decodeURIComponent(user),
    password: decodeURIComponent(password),
    database: decodeURIComponent(database),
  };
}

const mysqlConfig = parseMysqlUri(rawConnectionString);

declare global {
  // eslint-disable-next-line no-var
  var __pdfcraftMysqlPool: mysql.Pool | undefined;
}

const pool =
  global.__pdfcraftMysqlPool ??
  mysql.createPool({
    ...mysqlConfig,
    connectionLimit: 10,
    waitForConnections: true,
    enableKeepAlive: true,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pdfcraftMysqlPool = pool;
}

export const db = drizzle(pool, { schema, mode: "default" });
export type DB = typeof db;
export { schema };
