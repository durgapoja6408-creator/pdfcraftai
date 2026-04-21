/**
 * POST /api/geo/waitlist — Tier-2 deferred-region email capture.
 *
 * Receives signups from visitors in countries listed in
 * `TIER_2_COUNTRIES` (docs/GEO_LAUNCH_POLICY.md §2). These users hit the
 * checkout flow and got `routeCheckoutByCountry` → `action: "defer"`, so
 * instead of letting them bounce we capture an email + country and drop
 * them in `geo_waitlist` for the launch-announcement job.
 *
 * Request shape:
 *   {
 *     email: "user@example.com",
 *     country: "DE",                    // ISO-2, validated Tier 2
 *     source: "checkout_defer",         // free-form UI origin
 *     reason: "tier2_deferred",         // or "tier2_notify"
 *     consent: true,                    // must be true
 *     consentText: "I agree to ..."     // exact copy the user clicked
 *   }
 *
 * Responses:
 *   - 200 { ok: true, alreadyListed?: true }
 *     - alreadyListed: the (email, country) pair is already on the list;
 *       we treat as a soft success so the UI can show the same
 *       confirmation without leaking that it was a dupe.
 *   - 400 { error: "…" } — validation failure.
 *   - 429 { error: "…" } — rate-limit hit (in-memory, per email + per IP).
 *
 * Rate limit:
 *   Mirrors /api/contact — in-memory Map, 60s window per email AND per
 *   IP. Good enough for launch; swap for an edge KV store when the form
 *   sees real traffic.
 *
 * Privacy:
 *   - email is stored as-is (we need to actually send the launch email).
 *   - IP is SHA-256(ip + GEO_WAITLIST_IP_SALT) then discarded. Without
 *     the server salt, the hash can't be rainbow-tabled back to an IP.
 *     If the salt env var is missing we fall back to an ephemeral salt
 *     (per-process) so the hash still works for session-level abuse
 *     detection; cross-restart dedupe silently degrades.
 *   - consentText is stored verbatim — GDPR audit trail.
 *
 * Why this route is public (no NextAuth):
 *   Tier-2 visitors who hit checkout have no account yet — the whole
 *   point of the form is to let them raise their hand before we serve
 *   their country. Protecting with auth would defeat the purpose.
 *   Abuse is mitigated by rate-limit + country-set validation + the
 *   unique index + future CAPTCHA when signups warrant it.
 */

import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db, schema } from "@/db/client";
import { TIER_2_COUNTRIES } from "@/lib/payments/router";

export const runtime = "nodejs";

// --- Validation schema ----------------------------------------------------

const waitlistSchema = z.object({
  email: z.string().email().max(320),
  country: z
    .string()
    .length(2)
    .transform((c) => c.toUpperCase())
    .refine((c) => TIER_2_COUNTRIES.has(c), {
      // Tier 1 users shouldn't be shown the form (they can check out).
      // Tier 3 users must not be onboarded (sanctions). Unknown → unclear
      // which country we're promising, so reject.
      message: "country_not_eligible",
    }),
  source: z.string().min(1).max(64),
  reason: z.enum(["tier2_deferred", "tier2_notify"]).default("tier2_deferred"),
  // Must be true. `z.literal(true)` gives the cleanest error message.
  consent: z.literal(true, {
    errorMap: () => ({ message: "consent_required" }),
  }),
  // Raw copy of the agreement sentence the user clicked. Capped to keep
  // pathological payloads out of the DB; real copy runs ~200 chars.
  consentText: z.string().min(10).max(2000),
});

// --- Rate limit (in-memory) ----------------------------------------------

const RATE_LIMIT_MS = 60_000;
const lastByEmail = new Map<string, number>();
const lastByIp = new Map<string, number>();

function gateRate(map: Map<string, number>, key: string): boolean {
  const now = Date.now();
  const last = map.get(key) ?? 0;
  if (now - last < RATE_LIMIT_MS) return false;
  map.set(key, now);
  return true;
}

// --- IP hashing -----------------------------------------------------------

// Per-process fallback salt if the env var is missing. NOT a security
// feature — just keeps the Map keys meaningful within a single worker.
const FALLBACK_SALT = randomUUID();

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.GEO_WAITLIST_IP_SALT || FALLBACK_SALT;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function extractIp(headers: Headers): string | null {
  // Cloudflare sets CF-Connecting-IP; fall back to X-Forwarded-For's first
  // hop if present, otherwise null. Both are header-trustworthy only
  // because the origin only accepts traffic proxied through CF.
  const cfip = headers.get("cf-connecting-ip");
  if (cfip) return cfip;
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return null;
}

// --- Handler --------------------------------------------------------------

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = waitlistSchema.safeParse(body);
  if (!parsed.success) {
    // Surface the first issue's message — the client UI maps the known
    // codes ("consent_required", "country_not_eligible", "Invalid email")
    // back to user-visible copy so we don't have to ship a translation
    // table server-side.
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? "invalid_request" },
      { status: 400 }
    );
  }

  const { email, country, source, reason, consentText } = parsed.data;

  // Rate limit — per email first (cheaper to reject), then per IP.
  if (!gateRate(lastByEmail, email.toLowerCase())) {
    return NextResponse.json(
      { error: "rate_limited_email" },
      { status: 429 }
    );
  }

  const ip = extractIp(req.headers);
  if (ip && !gateRate(lastByIp, ip)) {
    return NextResponse.json(
      { error: "rate_limited_ip" },
      { status: 429 }
    );
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 512) ?? null;
  const ipHash = hashIp(ip);

  // Insert, tolerating MySQL ER_DUP_ENTRY (1062) on the unique
  // (email, country) index — treat duplicate submissions as soft success
  // so the UI doesn't expose whether the address is new or known.
  try {
    await db.insert(schema.geoWaitlist).values({
      id: randomUUID(),
      email: email.toLowerCase(),
      country,
      reason,
      source,
      consentText,
      userAgent,
      ipHash,
    });
  } catch (err: unknown) {
    const errno = (err as { errno?: number })?.errno;
    const code = (err as { code?: string })?.code;
    if (errno === 1062 || code === "ER_DUP_ENTRY") {
      return NextResponse.json({ ok: true, alreadyListed: true });
    }
    // Log and surface a generic error — don't leak the DB error message
    // to the browser.
    console.error("[geo-waitlist] insert failed", {
      at: new Date().toISOString(),
      country,
      source,
      reason,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }

  console.log(
    "[geo-waitlist]",
    JSON.stringify({
      at: new Date().toISOString(),
      country,
      source,
      reason,
      // Do NOT log the raw email in production logs — country + source
      // is enough for funnel analysis. The row is in the DB for the
      // launch job.
    })
  );

  return NextResponse.json({ ok: true });
}
