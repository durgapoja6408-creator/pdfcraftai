#!/usr/bin/env node
/**
 * test-error-tracker.mjs (#142, 2026-06-07): contract guard for the
 * in-house, DB-backed error tracker — the free alternative to a paid
 * error-tracking SaaS.
 *
 * Static-parse only (no DB, no bundler). Reads each file as text and
 * pins the invariants that keep the capture → store → view chain
 * wired and SAFE:
 *
 *   A  Migration 0031 is additive + correctly shaped.
 *   B  db/schema/app.ts errorEvents mirrors the migration.
 *   C  lib/observability/capture.ts exports + never-throws + clamps.
 *   D  /api/errors route: nodejs runtime, zod validation, rate limit,
 *      length caps, 204/400/429 contract.
 *   E  app/error.tsx + app/global-error.tsx report to /api/errors.
 *   F  ClientErrorReporter catches window error + unhandledrejection,
 *      dedupes + caps, and is mounted in the root layout.
 *   G  /admin/errors viewer + the admin NAV item exist.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
  }
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ──────────────────────────────────────────────────────────────────
// A — migration 0031 (additive, correct columns + indexes)
// ──────────────────────────────────────────────────────────────────
{
  const rel = "db/migrations/0031_error_events.sql";
  assert(exists(rel), `${rel} must exist`);
  const sql = read(rel);
  assert(
    /CREATE TABLE IF NOT EXISTS\s+`error_events`/.test(sql),
    "migration: CREATE TABLE IF NOT EXISTS `error_events`",
  );
  // Additive only — no ALTER/DROP/MODIFY on existing tables.
  const exec = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  assert(!/\bALTER\s+TABLE\b/i.test(exec), "migration: no ALTER TABLE (additive only)");
  assert(!/\bDROP\b/i.test(exec), "migration: no DROP");
  for (const col of [
    "`id`",
    "`fingerprint`",
    "`kind`",
    "`message`",
    "`stack`",
    "`path`",
    "`method`",
    "`status_code`",
    "`digest`",
    "`user_id`",
    "`user_agent`",
    "`created_at`",
  ]) {
    assert(exec.includes(col), `migration: column ${col} present`);
  }
  assert(/PRIMARY KEY\s*\(`id`\)/.test(exec), "migration: PK on id");
  assert(
    /KEY\s+`error_events_fingerprint_idx`\s*\(`fingerprint`\)/.test(exec),
    "migration: fingerprint index",
  );
  assert(
    /KEY\s+`error_events_created_idx`\s*\(`created_at`\)/.test(exec),
    "migration: created_at index",
  );
  // user_id must NOT carry an FK (must survive user deletion).
  assert(
    !/REFERENCES\s+`?users`?/i.test(exec),
    "migration: user_id has NO foreign key (survives user deletion)",
  );
  assert(
    /`created_at`\s+timestamp\(3\)\s+NOT NULL\s+DEFAULT\s+CURRENT_TIMESTAMP\(3\)/i.test(exec),
    "migration: created_at defaults to CURRENT_TIMESTAMP(3)",
  );
}

// ──────────────────────────────────────────────────────────────────
// B — Drizzle schema mirrors the migration
// ──────────────────────────────────────────────────────────────────
{
  const src = read("db/schema/app.ts");
  assert(
    /export const errorEvents = mysqlTable\(\s*\n?\s*"error_events"/.test(src),
    "schema: errorEvents = mysqlTable(\"error_events\")",
  );
  const block = src.slice(src.indexOf("export const errorEvents"));
  for (const f of [
    'fingerprint: varchar("fingerprint"',
    'kind: varchar("kind"',
    'message: varchar("message"',
    'stack: mediumtext("stack")',
    'path: varchar("path"',
    'statusCode: int("status_code")',
    'userId: varchar("user_id"',
    'createdAt: timestamp("created_at"',
  ]) {
    assert(block.includes(f), `schema: errorEvents has ${f}`);
  }
  assert(
    /fingerprintIdx: index\("error_events_fingerprint_idx"\)/.test(block),
    "schema: fingerprint index declared",
  );
  assert(
    /createdIdx: index\("error_events_created_idx"\)/.test(block),
    "schema: created_at index declared",
  );
}

// ──────────────────────────────────────────────────────────────────
// C — capture.ts: exports + never-throws + clamps + fingerprint
// ──────────────────────────────────────────────────────────────────
{
  const rel = "lib/observability/capture.ts";
  assert(exists(rel), `${rel} must exist`);
  const src = read(rel);
  assert(/^import "server-only";/m.test(src), "capture: server-only import");
  assert(
    /export function fingerprintError\(/.test(src),
    "capture: exports fingerprintError",
  );
  assert(
    /export async function captureError\(/.test(src),
    "capture: exports captureError",
  );
  assert(
    /export async function captureServerError\(/.test(src),
    "capture: exports captureServerError",
  );
  // fingerprint must strip digits so occurrences group together.
  assert(
    /\.replace\(\/\\d\+\/g,\s*"#"\)/.test(src),
    "capture: fingerprint strips digits to '#' for grouping",
  );
  assert(/createHash\("sha256"\)/.test(src), "capture: sha256 fingerprint");
  // captureError must be crash-proof: a try/catch around the insert.
  const ce = src.slice(src.indexOf("export async function captureError"));
  assert(/try\s*{/.test(ce) && /catch\s*\(/.test(ce), "capture: captureError wraps insert in try/catch (never throws)");
  assert(
    /db\.insert\(schema\.errorEvents\)/.test(ce),
    "capture: inserts into schema.errorEvents",
  );
  // Length clamps present (untrusted/huge strings must be bounded).
  assert(/function clamp\(/.test(src), "capture: clamp() helper present");
  assert(/clamp\(input\.message,\s*1024\)/.test(ce), "capture: message clamped to 1024");
  assert(/clamp\(input\.stack,\s*16000\)/.test(ce), "capture: stack clamped");
}

// ──────────────────────────────────────────────────────────────────
// D — /api/errors route: runtime, zod, rate limit, status contract
// ──────────────────────────────────────────────────────────────────
{
  const rel = "app/api/errors/route.ts";
  assert(exists(rel), `${rel} must exist`);
  const src = read(rel);
  assert(/export const runtime = "nodejs"/.test(src), "route: runtime nodejs (DB access)");
  assert(/export async function POST\(/.test(src), "route: POST handler");
  assert(/from "zod"/.test(src), "route: imports zod");
  assert(/z\.object\(/.test(src), "route: zod body schema");
  assert(/\.max\(2000\)/.test(src), "route: message max length cap");
  assert(/captureError\(/.test(src), "route: calls captureError");
  // Rate limiting present + returns 429.
  assert(/rateLimited\(/.test(src), "route: rate limiter applied");
  assert(/status:\s*429/.test(src), "route: 429 on rate limit");
  assert(/status:\s*400/.test(src), "route: 400 on bad body");
  assert(/status:\s*204/.test(src), "route: 204 on success");
  // Must not 500 the caller — auth lookup is wrapped.
  assert(
    /try\s*{[\s\S]*await auth\(\)[\s\S]*catch/.test(src),
    "route: auth() wrapped so anonymous reports still log",
  );
}

// ──────────────────────────────────────────────────────────────────
// E — error boundaries report to /api/errors
// ──────────────────────────────────────────────────────────────────
for (const rel of ["app/error.tsx", "app/global-error.tsx"]) {
  const src = read(rel);
  assert(/fetch\("\/api\/errors"/.test(src), `${rel}: posts to /api/errors`);
  assert(/keepalive:\s*true/.test(src), `${rel}: keepalive so the beacon survives unload`);
  assert(/useEffect\(/.test(src), `${rel}: reports from useEffect`);
  assert(/\.catch\(\(\)\s*=>\s*{}\)/.test(src), `${rel}: swallows reporting failures`);
}

// ──────────────────────────────────────────────────────────────────
// F — ClientErrorReporter: listeners + dedupe + cap + mounted
// ──────────────────────────────────────────────────────────────────
{
  const rel = "components/observability/ClientErrorReporter.tsx";
  assert(exists(rel), `${rel} must exist`);
  const src = read(rel);
  assert(/^"use client";/m.test(src), "reporter: client component");
  assert(
    /addEventListener\("error"/.test(src),
    "reporter: listens for window 'error'",
  );
  assert(
    /addEventListener\("unhandledrejection"/.test(src),
    "reporter: listens for 'unhandledrejection'",
  );
  assert(/removeEventListener\("error"/.test(src) && /removeEventListener\("unhandledrejection"/.test(src), "reporter: cleans up both listeners");
  assert(/new Set</.test(src), "reporter: dedupes via Set");
  assert(/MAX\s*=\s*15/.test(src), "reporter: caps reports per page load");
  assert(/fetch\("\/api\/errors"/.test(src), "reporter: posts to /api/errors");
  assert(/return null;/.test(src), "reporter: renders nothing");

  // Mounted once in the root layout.
  const layout = read("app/layout.tsx");
  assert(
    /import { ClientErrorReporter }/.test(layout),
    "layout: imports ClientErrorReporter",
  );
  assert(/<ClientErrorReporter \/>/.test(layout), "layout: mounts <ClientErrorReporter />");
}

// ──────────────────────────────────────────────────────────────────
// G — admin viewer + NAV item
// ──────────────────────────────────────────────────────────────────
{
  const rel = "app/admin/errors/page.tsx";
  assert(exists(rel), `${rel} must exist`);
  const src = read(rel);
  assert(/export const dynamic = "force-dynamic"/.test(src), "admin: force-dynamic");
  assert(/export const runtime = "nodejs"/.test(src), "admin: runtime nodejs");
  assert(/error_events/.test(src), "admin: queries error_events");
  assert(/GROUP BY fingerprint/.test(src), "admin: groups by fingerprint");
  assert(/from "@\/components\/admin\/ui"/.test(src), "admin: uses shared admin ui primitives");
  assert(/StatCard/.test(src) && /ErrorBanner/.test(src), "admin: StatCard + ErrorBanner used");
  // Query is wrapped so a bad column never dark-holes the page.
  assert(/try\s*{/.test(src) && /catch\s*\(/.test(src), "admin: query wrapped in try/catch");

  const navSrc = read("app/admin/layout.tsx");
  assert(
    /href:\s*"\/admin\/errors"/.test(navSrc),
    "admin nav: /admin/errors entry present",
  );
}

// ──────────────────────────────────────────────────────────────────
console.log("");
if (failed === 0) {
  console.log(`PASS — ${passed} assertions`);
  console.log(`${passed} passed, 0 failed`);
  process.exit(0);
} else {
  console.error(`FAIL — ${failed} assertion(s) failed:`);
  for (const m of failures) console.error(`  ${m}`);
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
