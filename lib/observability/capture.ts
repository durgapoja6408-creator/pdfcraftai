import "server-only";
import { randomUUID, createHash } from "crypto";
import { db, schema } from "@/db/client";

// In-house error capture (2026-06-07). Free, DB-backed alternative to Sentry.
// Writes one row per occurrence to `error_events`; /admin/errors groups them.

export type CaptureInput = {
  kind: "client" | "server";
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  digest?: string | null;
  userId?: string | null;
  userAgent?: string | null;
};

function clamp(v: string | null | undefined, n: number): string | undefined {
  if (v == null) return undefined;
  const t = String(v);
  return t.length > n ? t.slice(0, n) : t;
}

// Stable group key: normalized message + first stack frame, with line/column
// numbers stripped so the same bug groups together across occurrences.
export function fingerprintError(message: string, stack?: string | null): string {
  const frame =
    (stack || "")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("at ")) || "";
  const basis = `${message}\n${frame}`.replace(/\d+/g, "#");
  return createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

// NEVER throws — error logging must not break the request that errored.
export async function captureError(input: CaptureInput): Promise<void> {
  try {
    const message = clamp(input.message, 1024) || "(empty)";
    const stack = clamp(input.stack, 16000);
    await db.insert(schema.errorEvents).values({
      id: randomUUID(),
      fingerprint: fingerprintError(message, stack),
      kind: input.kind === "server" ? "server" : "client",
      message,
      stack,
      path: clamp(input.path, 512),
      method: clamp(input.method, 8),
      statusCode: typeof input.statusCode === "number" ? input.statusCode : undefined,
      digest: clamp(input.digest, 64),
      userId: clamp(input.userId, 255),
      userAgent: clamp(input.userAgent, 512),
    });
  } catch (e) {
    console.error("captureError failed:", (e as Error)?.message);
  }
}

// Convenience for server-side catch blocks.
export async function captureServerError(
  err: unknown,
  ctx?: { path?: string; method?: string; statusCode?: number; userId?: string }
): Promise<void> {
  const e = err as { message?: string; stack?: string };
  await captureError({
    kind: "server",
    message: e?.message || String(err),
    stack: e?.stack ?? null,
    path: ctx?.path ?? null,
    method: ctx?.method ?? null,
    statusCode: ctx?.statusCode ?? null,
    userId: ctx?.userId ?? null,
  });
}
