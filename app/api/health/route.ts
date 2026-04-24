import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { listConfiguredProviderIds } from "@/lib/ai/registry";
import { currentPolicySnapshot } from "@/lib/ai/router";
import type { AIOp } from "@/lib/ai/router";
import type { AIProviderId } from "@/lib/ai/types";
import {
  detectSchemaDrift,
  type SchemaDriftReport,
} from "@/lib/db/schema-drift";

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
 *     ai: {
 *       configured: boolean,          // at least one AI provider has env set
 *       providers: AIProviderId[],    // configured provider IDs (no secrets)
 *       defaults: Record<AIOp, AIProviderId[]>, // resolved router ladder per op
 *     },
 *     ts: string                  // ISO timestamp
 *   }
 *
 * Use cases:
 *   - Cloudflare health-check rule targets this endpoint.
 *   - Internal status page at `/status` calls this to tint the Core API row.
 *   - Deploy verification: curl and confirm `ok: true` + new commit SHA.
 *   - Post-deploy verification of AI env-var propagation (Task #18 /
 *     MASTER_PLAN §7 gate #1): after setting `ANTHROPIC_API_KEY` /
 *     `OPENAI_API_KEY` / `GEMINI_API_KEY` / `AI_ROUTER_*` in hPanel, curl
 *     this endpoint and confirm `ai.providers` reflects the new state and
 *     `ai.defaults` shows the expected per-op ladder. No SSH required,
 *     same posture as `/api/payments/probe`.
 *
 * Notes:
 *   - Always returns 200 so the response body is inspectable — we set
 *     `ok: false` + status 503 only when the DB ping actually fails. This
 *     mirrors Kubernetes readiness probe semantics (non-2xx = unready).
 *   - AI state is metadata-only — it never flips `ok`. Missing providers
 *     are a deployment state, not a failure (pre-launch sandboxes, budget
 *     freeze, future rotation windows). DB is the only real-health signal
 *     this probe gates on.
 *   - Never logs secrets or DB credentials. Error strings are short
 *     and sanitized (error.code + message only). AI block carries only
 *     provider IDs + routing snapshot — zero env-var values, zero API keys,
 *     zero adapter paths.
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

/**
 * AI introspection — metadata-only probe over the provider registry and
 * router policy. Mirrors `/api/payments/probe` in posture: reads env to
 * enumerate configured adapters, asks the router for the resolved ladder
 * per op, NEVER hits a provider API.
 *
 * Safe to expose publicly:
 *   - `providers` is provider IDs only (e.g. "anthropic"), which the
 *     CSP allowlist already leaks.
 *   - `defaults` is the compile-time routing policy plus any
 *     `AI_ROUTER_*` env pins — no keys, no fragments, no URLs.
 *
 * Exceptions are swallowed into `configured: false` + empty shapes so a
 * misconfigured registry row can never take /api/health down. DB
 * liveness is the ONLY signal this probe gates `ok` on.
 */
function probeAi(): {
  configured: boolean;
  providers: AIProviderId[];
  defaults: Record<AIOp, AIProviderId[]>;
} {
  try {
    const providers = listConfiguredProviderIds();
    const defaults = currentPolicySnapshot();
    return { configured: providers.length > 0, providers, defaults };
  } catch (err) {
    // Introspection itself threw — shouldn't happen (both helpers are
    // pure env-read + policy-walk), but log-and-degrade rather than
    // flip /api/health to 503 on an orthogonal concern.
    console.error("[health] ai probe threw:", err);
    return {
      configured: false,
      providers: [],
      // Empty object is a legal Record<AIOp, …> value; callers (status
      // page, smoke tests) should treat missing keys as "unknown ladder"
      // not "no ladder configured".
      defaults: {} as Record<AIOp, AIProviderId[]>,
    };
  }
}

export async function GET(req: NextRequest) {
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

  const ai = probeAi();

  // Migration-drift probe — opt-in via `?drift=1`. We don't run it on
  // every Cloudflare health ping (extra round-trip + information_schema
  // scan) and drift NEVER flips `ok` — liveness gates on DB ping only.
  // /admin/deploy and release scripts call with `?drift=1` to surface
  // the report; Task #28 / CLAUDE.md §6.
  let schemaDrift: SchemaDriftReport | undefined;
  if (dbOk && req.nextUrl.searchParams.get("drift") === "1") {
    schemaDrift = await detectSchemaDrift();
  }

  const body = {
    ok: dbOk,
    service: SERVICE,
    commit: COMMIT_SHA ? COMMIT_SHA.slice(0, 12) : null,
    uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
    db: dbOk
      ? {
          ok: true,
          latencyMs: dbLatency,
          ...(schemaDrift ? { schemaDrift } : {}),
        }
      : { ok: false, error: dbError ?? "unknown" },
    ai,
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
