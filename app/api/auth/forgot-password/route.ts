import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Forgot-password endpoint stub.
 *
 * IMPORTANT: This MUST acknowledge identically whether or not the email
 * exists, to prevent account enumeration. The actual mail send is wired in
 * a follow-up — for now we log the request and return 200 unless the body
 * is malformed or the user is hammering the endpoint.
 *
 * When the mail provider lands:
 *   1. Look up the user by lower-cased email.
 *   2. If they exist, mint a single-use token (≥ 256 bits, hashed at rest)
 *      with a 30-minute TTL and store it in `password_reset_tokens`.
 *   3. Send the reset email containing the unhashed token.
 *   4. Whether or not the user existed, return 200 with the same body.
 *   5. Throttle by email AND by IP to slow down enumeration probes.
 */

const schema = z.object({
  email: z.string().email().max(320),
});

// Naïve per-email rate limiter — replace with edge KV before real traffic.
const recent = new Map<string, number>();
const WINDOW_MS = 60_000;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const now = Date.now();
  const last = recent.get(email) ?? 0;
  if (now - last < WINDOW_MS) {
    // Still 200 to avoid leaking which addresses are throttled, but log it.
    console.warn("[forgot-password] throttled", email);
    return NextResponse.json({ ok: true });
  }
  recent.set(email, now);

  // TODO(email): look up user, mint token, send mail via SendGrid/Postmark.
  console.log(
    "[forgot-password] reset requested",
    JSON.stringify({ at: new Date().toISOString(), email }),
  );

  return NextResponse.json({ ok: true });
}
