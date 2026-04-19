import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Contact form handler.
 *
 * Currently logs the message server-side and returns 200. When the email
 * provider lands (SendGrid / Postmark / Resend), send the payload to support
 * + a thank-you acknowledgement back to the submitter.
 *
 * Rate limiting is intentionally light (one submission per email per 60s,
 * in-memory). Replace with an edge KV store before this sees real traffic.
 */

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  topic: z.string().min(1).max(60),
  message: z.string().min(10).max(5000),
});

const recentSubmissions = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;

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

  const { email } = parsed.data;
  const now = Date.now();
  const last = recentSubmissions.get(email) ?? 0;
  if (now - last < RATE_LIMIT_MS) {
    return NextResponse.json(
      { error: "You just sent a message. Give us a minute, then try again." },
      { status: 429 },
    );
  }
  recentSubmissions.set(email, now);

  // TODO(email): wire SendGrid / Postmark here.
  // For now just log so the ops team can see submissions in the Hostinger
  // logs until the mail provider is configured.
  console.log(
    "[contact]",
    JSON.stringify({
      at: new Date().toISOString(),
      ...parsed.data,
    }),
  );

  return NextResponse.json({ ok: true });
}
