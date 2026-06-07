import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { captureError } from "@/lib/observability/capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ingests CLIENT errors (server code uses captureServerError directly). Body is
// untrusted, so everything is length-capped + zod-validated and the endpoint is
// rate-limited per IP to stop a hostile client from flooding the table.
const bodySchema = z.object({
  kind: z.literal("client").default("client"),
  message: z.string().min(1).max(2000),
  stack: z.string().max(20000).optional(),
  path: z.string().max(512).optional(),
  digest: z.string().max(64).optional(),
  statusCode: z.number().int().optional(),
});

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  b.count += 1;
  return b.count > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  if (rateLimited(ip)) return new NextResponse(null, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  let userId: string | null = null;
  try {
    const s = await auth();
    userId = (s?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    /* anonymous — fine */
  }

  await captureError({
    kind: "client",
    message: parsed.data.message,
    stack: parsed.data.stack ?? null,
    path: parsed.data.path ?? null,
    digest: parsed.data.digest ?? null,
    statusCode: parsed.data.statusCode ?? null,
    userId,
    userAgent: req.headers.get("user-agent"),
  });
  return new NextResponse(null, { status: 204 });
}
