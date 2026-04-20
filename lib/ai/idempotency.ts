// Replay lookup for artifact-producing AI ops (Phase 5.5).
//
// The four AI routes (summarize / translate / compare / ocr) are
// "exactly-once" operations — a retry from the client must not spend
// credits twice or call the provider twice. Chat already has this via
// `chat_messages.idempotency_key`; we mirror the pattern here against
// `ai_outputs.idempotency_key`.
//
// Why the lookup lives here and not inline in each route:
//   1. All four routes have the same shape — the only difference is the
//      op-specific meta fields they then read out. A shared helper keeps
//      the contract uniform: a single unique-index lookup, filtered by
//      userId, returning the stored markdown + file row + meta.
//   2. The cross-user filter is a security boundary. Idempotency keys
//      are client-generated UUIDs; the birthday math says collisions are
//      fictional, but a malicious client could still submit a guessed
//      key. Joining on `files.user_id` means even a guess can only
//      replay the guesser's own rows.
//   3. Future ops (voice transcription, redaction, whatever lands in
//      Phase 6) plug in for free — same table, same helper.
//
// The helper is cache-cheap. The unique index on `ai_outputs.idempotency_key`
// makes this a single-row lookup by key; the user-id filter runs against
// the join so MySQL can use the index directly.

import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db/client";

/** Shape returned on a hit. `null` on miss (no stored row for this key). */
export type StoredAiOutput = {
  fileId: string;
  fileName: string;
  kind:
    | "summary"
    | "translation"
    | "ocr"
    | "comparison"
    // Phase 5.6 — five new AI tools.
    | "rewrite"
    | "table"
    | "redaction"
    | "generation"
    | "signing";
  contentMd: string;
  /** Free-form per-op meta blob; callers cast to their op-specific type. */
  meta: Record<string, unknown> | null;
  createdAt: Date;
};

/**
 * Look up a previously-stored AI output by the client's idempotency key,
 * scoped to the authed user.
 *
 * Returns the row if the current user already has a successful artifact
 * for this key, or `null` otherwise. The route handler uses this as the
 * first gate — if it hits, the handler short-circuits to a 200 "replay"
 * response with `creditCost: 0` and no provider call.
 *
 * No kind filter: a replay against the "wrong" route (e.g. summarize
 * retrying against a translate key) is already impossible because the
 * client picks the key per-submission and never re-uses it across ops.
 * But the caller MAY assert `row.kind === expected` defensively — see
 * each route's replay branch.
 */
export async function findAiOutputByIdempotencyKey(params: {
  userId: string;
  idempotencyKey: string;
}): Promise<StoredAiOutput | null> {
  const { userId, idempotencyKey } = params;
  if (!idempotencyKey) return null;

  const rows = await db
    .select({
      fileId: schema.files.id,
      fileName: schema.files.name,
      kind: schema.aiOutputs.kind,
      contentMd: schema.aiOutputs.contentMd,
      meta: schema.aiOutputs.meta,
      createdAt: schema.aiOutputs.createdAt,
    })
    .from(schema.aiOutputs)
    .innerJoin(schema.files, eq(schema.files.id, schema.aiOutputs.fileId))
    .where(
      and(
        eq(schema.aiOutputs.idempotencyKey, idempotencyKey),
        eq(schema.files.userId, userId)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    fileId: row.fileId,
    fileName: row.fileName,
    kind: row.kind,
    contentMd: row.contentMd,
    meta: (row.meta ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt,
  };
}

/**
 * True if the given DB error is a MySQL duplicate-key violation. Callers
 * wrap their `ai_outputs` insert in try/catch and use this to treat the
 * race where two concurrent retries both get past the pre-spend lookup
 * and race the unique-index insert — the loser swallows the error and
 * refunds its spend, because the winner's row already carries the
 * result for the same key.
 */
export function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; errno?: number };
  return e.code === "ER_DUP_ENTRY" || e.errno === 1062;
}
