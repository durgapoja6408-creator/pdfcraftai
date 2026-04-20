import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * Liveness + readiness health probe.
 *
 * Shape:
 *   {
 *     ok: boolean,
 *     service: "pdfcraftai",
 *     commit: string | null,    // short SHA, if injected at build time
 *     uptimeSec: number,         // process uptime
 *     db: { ok: boolean, latencyMs?: number, error?: string },
 *     ts: string                  // ISO timestamp
 *   }
 *
 * Use cases:
 *   - Cloudflare health-check rule targets this endpoint.
 *   - Internal status page at `/status` calls this to tint the Core API row.
 *   - Deploy verification: curl and confirm `ok: true` + new commit SHA.
 *
 * Notes:
 *   - Always returns 200 so the response body is inspectable — we set
 *     `ok: false` + status 503 only when the DB ping actually fails. This
 *     mirrors Kubernetes readiness probe semantics (non-2xx = unready).
 *   - Never logs secrets or DB credentials. Error strings are short
 *     and sanitized (error.code + message only).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deploy commit SHA. Primary source is `BUILD_COMMIT_SHA`, baked in at
// build time by next.config.mjs via `git rev-parse --short=12 HEAD` and
// the `env` block — so this works on Hostinger without any hPanel
// config. We still honour the Vercel-style env-name fallbacks so a
// future infra swap doesn't break the probe.
const RAW_SHA =
  process.env.BUILD_COMMIT_SHA ||
  process.env.COMMIT_SHA ||
  process.env.NEXT_PUBLIC_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  null;
// next.config.mjs falls back to "" if git wasn't available at build
// time — treat empty string the same as null.
const COMMIT_SHA = RAW_SHA && RAW_SHA.length > 0 ? RAW_SHA : null;

const SERVICE = "pdfcraftai";
const STARTED_AT = Date.now();

export async function GET() {
  const ts = new Date().toISOString();
  const dbStart = Date.now();
  let dbOk = false;
  let dbLatency: number | undefined;
  let dbError: string | undefined;

  try {
    // Cheapest possible query — no table lookup, just round-trips the
    // connection. `SELECT 1` is a standard MySQL liveness ping.
    await db.execute(sql`SELECT 1`);
    dbOk = true;
    dbLatency = Date.now() - dbStart;
  } catch (err) {
    dbOk = false;
    dbError = sanitizeError(err);
  }

  const body = {
    ok: dbOk,
    service: SERVICE,
    commit: COMMIT_SHA ? COMMIT_SHA.slice(0, 12) : null,
    uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
    db: dbOk
      ? { ok: true, latencyMs: dbLatency }
      : { ok: false, error: dbError ?? "unknown" },
    ts,
  };

  return NextResponse.json(body, {
    status: dbOk ? 200 : 503,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate",
      "x-health-service": SERVICE,
    },
  });
}

function sanitizeError(err: unknown): string {
  if (!err) return "unknown";
  if (err instanceof Error) {
    // Keep it terse — don't leak DSN fragments or stacktraces.
    const code = (err as { code?: unknown }).code;
    const msg = err.message.slice(0, 200);
    return typeof code === "string" ? `${code}: ${msg}` : msg;
  }
  return String(err).slice(0, 200);
}
