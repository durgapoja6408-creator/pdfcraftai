import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { db, schema } from "@/db/client";

/**
 * Contact form handler.
 *
 * 2026-05-04 — now persists to `contact_submissions` so /enterprise
 * leads + general inquiries survive log rotation. Admin reads via
 * /admin/contact-submissions until SendGrid/Postmark wires the
 * outbound email. The persist is fire-and-forget on a separate
 * try/catch so a transient DB error never bricks the form (the user
 * still gets a 200; the message is also logged to stdout as a fall-
 * back). Real outbound email is still pending — that's a founder-side
 * decision (which provider, which sending domain, transactional
 * template).
 *
 * Rate limiting is intentionally light (one submission per email per
 * 60s, in-memory). Replace with an edge KV store before this sees
 * real traffic.
 */

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  topic: z.string().min(1).max(60),
  message: z.string().min(10).max(5000),
  // Honeypot (Task #30). Real users never see this field; bots fill
  // every textbox. Any non-empty value triggers a silent 200 reject
  // so the spammer doesn't learn the form bounced.
  website: z.string().max(0).optional(),
});

// Per-email limit — one submission per email per 60s.
const recentByEmail = new Map<string, number>();
const EMAIL_LIMIT_MS = 60_000;

// Per-IP limit (Task #30) — 3 submissions per IP per 5 minutes.
// Catches the "rotate emails to bypass per-email limit" vector that
// 2026-04-24 smoke testing exposed (8 different @example.test emails
// all returned 200). 3/5min leaves real users with retries after
// typos plenty of headroom.
const recentByIp = new Map<string, number[]>();
const IP_WINDOW_MS = 5 * 60_000;
const IP_LIMIT = 3;

function clientIpFromHeaders(headers: Headers): string {
  // Cloudflare sets cf-connecting-ip. Fallback to the first entry of
  // x-forwarded-for. Our origin is behind Cloudflare — direct access
  // is firewalled off — so one of these is always present in prod.
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return "unknown";
}

function ipRateLimitOk(ip: string, now: number): boolean {
  if (ip === "unknown") return true; // fail-open behind CF
  const history = recentByIp.get(ip) ?? [];
  const inWindow = history.filter((t) => now - t < IP_WINDOW_MS);
  if (inWindow.length >= IP_LIMIT) {
    recentByIp.set(ip, inWindow);
    return false;
  }
  inWindow.push(now);
  recentByIp.set(ip, inWindow);
  // Periodic GC to bound memory under sustained traffic.
  if (recentByIp.size > 1000) {
    for (const [k, v] of recentByIp) {
      const still = v.filter((t) => now - t < IP_WINDOW_MS);
      if (still.length === 0) recentByIp.delete(k);
      else recentByIp.set(k, still);
    }
  }
  return true;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fill in all fields. Messages need at least 10 characters." },
      { status: 400 },
    );
  }

  // Honeypot — silent 200 (don't reveal we noticed).
  if (parsed.data.website && parsed.data.website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const { email } = parsed.data;
  const now = Date.now();

  // Per-IP throttle first — catches bots rotating emails.
  const ip = clientIpFromHeaders(req.headers);
  if (!ipRateLimitOk(ip, now)) {
    return NextResponse.json(
      {
        error:
          "Too many submissions from your network. Try again in a few minutes.",
      },
      { status: 429 },
    );
  }

  const last = recentByEmail.get(email) ?? 0;
  if (now - last < EMAIL_LIMIT_MS) {
    return NextResponse.json(
      { error: "You just sent a message. Give us a minute, then try again." },
      { status: 429 },
    );
  }
  recentByEmail.set(email, now);

  // Persist the submission so /admin/contact-submissions can surface
  // it. Fire-and-forget: any DB error here STILL returns 200 to the
  // user (they shouldn't see infra errors as failed submissions), but
  // we ALSO log to stdout as a fallback so the data survives even if
  // the DB write silently lost the row. The order matters — DB first
  // so we don't lose the row to a transient stdout buffer flush; if
  // the DB throws, the catch logs the FULL payload synchronously.
  //
  // Truncate optional headers to schema cap to avoid Drizzle insert
  // errors on overlong UA / Referer (the schema declares varchar(512)
  // and varchar(1024); some bots send headers >2KB).
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 512);
  const referer = (req.headers.get("referer") ?? "").slice(0, 1024);

  // 2026-05-04: TODO(email) — wire SendGrid / Postmark / Resend. Once
  // wired, send the payload to support@ + a thank-you ACK back to the
  // submitter. Until then, /admin/contact-submissions is the
  // admin-side view; founder reads + responds manually.
  try {
    await db.insert(schema.contactSubmissions).values({
      id: randomUUID(),
      name: parsed.data.name,
      email: parsed.data.email,
      topic: parsed.data.topic,
      message: parsed.data.message,
      ip,
      userAgent: userAgent || null,
      referer: referer || null,
      // status defaults to "new", createdAt defaults to NOW(); both
      // omitted so the DB applies its defaults rather than us
      // round-tripping a Date object through the driver.
    });
  } catch (err) {
    // DB hiccup — fall back to stdout so the data survives. Do NOT
    // surface to the user; they shouldn't see infra noise.
    console.error("[contact-persist-failed]", String(err));
  }

  // Stdout log as a defense-in-depth backup for the DB write. Logged
  // even on success so ops can grep the Hostinger logs directly when
  // /admin is unreachable mid-cascade.
  console.log(
    "[contact]",
    JSON.stringify({
      at: new Date().toISOString(),
      ...parsed.data,
    }),
  );

  return NextResponse.json({ ok: true });
}
