import "server-only";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { toolById } from "@/lib/tools";

// Per-user favourite tools — REGISTERED users only. Anonymous requests 401
// (the /tools UI also hides the star for them). GET lists the user's favourite
// tool ids; POST { toolId, favorite } adds or removes one. Backed by the
// user_favorites table (migration 0030); composite PK keeps the add idempotent.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Light per-user write throttle (favourites are cheap + auth-gated, but a
// runaway client shouldn't hammer the DB). Mirrors the feedback route.
const buckets = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
function consume(userId: string): boolean {
  const now = Date.now();
  const b = buckets.get(userId);
  if (!b || now - b.windowStart > WINDOW_MS) {
    buckets.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (b.count >= MAX_PER_WINDOW) return false;
  b.count += 1;
  return true;
}

async function currentUserId(): Promise<string | undefined> {
  const session = await auth();
  return session?.user ? (session.user as { id?: string }).id : undefined;
}

async function listIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ toolId: schema.userFavorites.toolId })
    .from(schema.userFavorites)
    .where(eq(schema.userFavorites.userId, userId));
  return rows.map((r) => r.toolId);
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ids: await listIds(userId) });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

const bodySchema = z.object({
  toolId: z.string().min(1).max(64),
  favorite: z.boolean(),
});

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  if (!consume(userId)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { toolId, favorite } = parsed.data;
  // Only real, runnable tool ids (ai-chat lives at /app/chat, not /tool/*).
  if (toolId === "ai-chat" || !toolById(toolId)) {
    return NextResponse.json({ error: "unknown_tool" }, { status: 400 });
  }
  try {
    if (favorite) {
      await db
        .insert(schema.userFavorites)
        .values({ userId, toolId })
        // Already starred → no-op (composite PK makes the add idempotent).
        .onDuplicateKeyUpdate({ set: { toolId } });
    } else {
      await db
        .delete(schema.userFavorites)
        .where(
          and(
            eq(schema.userFavorites.userId, userId),
            eq(schema.userFavorites.toolId, toolId),
          ),
        );
    }
    return NextResponse.json({ ids: await listIds(userId) });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
