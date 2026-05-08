// API key lifecycle helpers (PENDING gap C — Tier 1 #1, 2026-05-08).
//
// Pairs with the existing api_keys table (schema shipped earlier;
// raw mint/revoke/verify pipeline NOT built until this commit).
//
// Token format
// ------------
// Raw key shape: `pck_<random>` where:
//   - `pck_` is the static prefix (pdfcraft key, distinguishable
//     from user-typed strings + greppable in support tickets)
//   - `<random>` is 32 bytes hex (64 chars) from crypto.randomBytes
//
// Total raw key length = 4 + 64 = 68 chars. Stored only as
// SHA-256 hash; raw value shown once at creation. Same posture
// as the verification_tokens path — DB leak doesn't expose live
// keys.
//
// Display prefix
// --------------
// The api_keys.prefix column (varchar 12) stores `pck_<first-8>`
// of the raw key (12 chars total). UI lists show this prefix +
// "..." so users can recognize "which one" without exposing the
// remainder. Same pattern as Stripe/AWS console "sk_test_xxxx...".
//
// Verification
// ------------
// `verifyKey(raw)` hashes the raw value, looks up by hash,
// rejects if revoked, updates last_used_at. Returns the userId
// on hit so callers can attach user context to the request.
//
// Throttle
// --------
// Per-user-key rate limiting NOT yet implemented in this first
// foundation — relies on the existing per-user daily cost
// ceiling ($0.50/UTC-day) as the outer-layer protection. A
// follow-up commit can add per-key limits if abuse patterns
// surface.

import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db/client";

const KEY_PREFIX = "pck_";
const RANDOM_BYTES = 32;

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawKey(): string {
  return `${KEY_PREFIX}${randomBytes(RANDOM_BYTES).toString("hex")}`;
}

function displayPrefix(raw: string): string {
  // First 12 chars: "pck_" (4) + first 8 of the random hex.
  // Trimmed to fit api_keys.prefix varchar(12) column.
  return raw.slice(0, 12);
}

export interface ApiKeyRow {
  id: string;
  userId: string;
  label: string;
  prefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface MintKeyResult {
  /** Raw key — show ONCE at creation, never again. */
  rawKey: string;
  /** Persistent metadata for the UI list. */
  row: ApiKeyRow;
}

/**
 * Mint a fresh API key for a user. Returns the raw key (caller
 * MUST display it once + warn the user it can't be retrieved
 * again). Stores only the hash + display prefix + label.
 *
 * No collision-retry: SHA-256 of 32 random bytes has 256 bits of
 * entropy; collision probability across all keys ever minted in
 * the universe is below cosmic-noise floor. ER_DUP_ENTRY would
 * surface as a thrown error which the caller can retry by
 * re-minting (vanishingly rare).
 */
export async function mintKey(input: {
  userId: string;
  label: string;
}): Promise<MintKeyResult> {
  const userId = (input.userId ?? "").trim();
  const label = (input.label ?? "").trim();
  if (userId.length === 0) throw new Error("userId is required");
  if (label.length === 0 || label.length > 128) {
    throw new Error("label must be 1..128 chars");
  }

  const rawKey = generateRawKey();
  const id = randomBytes(16).toString("hex");
  const row = {
    id,
    userId,
    label,
    keyHash: hashKey(rawKey),
    prefix: displayPrefix(rawKey),
    lastUsedAt: null,
    revokedAt: null,
  };
  await db.insert(schema.apiKeys).values(row);

  // Re-fetch to get the server-side createdAt
  const [persisted] = await db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.id, id))
    .limit(1);
  if (!persisted) {
    throw new Error("Failed to read back minted key row");
  }

  return {
    rawKey,
    row: {
      id: persisted.id,
      userId: persisted.userId,
      label: persisted.label,
      prefix: persisted.prefix,
      lastUsedAt: persisted.lastUsedAt ?? null,
      revokedAt: persisted.revokedAt ?? null,
      createdAt: persisted.createdAt,
    },
  };
}

/**
 * Verify a raw API key. Returns the userId on hit, null on miss
 * / revoked / unknown. Updates last_used_at on hit (best-effort,
 * doesn't block return on the write — telemetry, not security-
 * critical).
 *
 * Anti-timing-attack: SHA-256 hash of the raw key is constant-
 * time relative to the input length. The DB lookup by hash uses
 * a UNIQUE index — same query latency for hit vs miss within a
 * few ms.
 */
export async function verifyKey(
  raw: string,
): Promise<{ userId: string; keyId: string } | null> {
  // Defensive shape check — must start with "pck_" + be 68 chars
  if (typeof raw !== "string" || raw.length !== 68 || !raw.startsWith(KEY_PREFIX)) {
    return null;
  }
  const hashed = hashKey(raw);
  const [row] = await db
    .select({
      id: schema.apiKeys.id,
      userId: schema.apiKeys.userId,
      revokedAt: schema.apiKeys.revokedAt,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.keyHash, hashed))
    .limit(1);
  if (!row) return null;
  if (row.revokedAt !== null) return null;

  // Best-effort last_used_at update — fire-and-forget so verify
  // latency stays minimal. Errors logged but don't fail the
  // verify (telemetry, not auth-correctness).
  void db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, row.id))
    .catch((err) => {
      console.error(
        JSON.stringify({
          event: "api_key_last_used_update_failed",
          keyId: row.id,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        }),
      );
    });

  return { userId: row.userId, keyId: row.id };
}

/**
 * Revoke a key. Soft-delete: sets revoked_at timestamp + leaves
 * the row in place. Future audit / abuse-investigation needs the
 * trail. Idempotent — re-revoking a revoked key is a no-op.
 *
 * Permission check is the caller's responsibility — typically
 * "key.user_id === session.user_id" so users can only revoke
 * their own keys. Admins may have a separate ban-key flow.
 */
export async function revokeKey(input: {
  keyId: string;
  byUserId: string;
}): Promise<{ ok: true } | { ok: false; reason: "not_found" | "not_owner" | "already_revoked" }> {
  const keyId = (input.keyId ?? "").trim();
  const byUserId = (input.byUserId ?? "").trim();
  if (keyId.length === 0 || byUserId.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  const [row] = await db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.id, keyId))
    .limit(1);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.userId !== byUserId) return { ok: false, reason: "not_owner" };
  if (row.revokedAt !== null) {
    return { ok: false, reason: "already_revoked" };
  }

  await db
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(schema.apiKeys.id, keyId));

  return { ok: true };
}

/**
 * List all keys for a user — both active + revoked. UI uses
 * this for the management table; revoked keys grayed out so the
 * audit trail stays visible.
 */
export async function listKeys(userId: string): Promise<ApiKeyRow[]> {
  const trimmed = (userId ?? "").trim();
  if (trimmed.length === 0) return [];
  const rows = await db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, trimmed))
    .orderBy(desc(schema.apiKeys.createdAt));
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    label: r.label,
    prefix: r.prefix,
    lastUsedAt: r.lastUsedAt ?? null,
    revokedAt: r.revokedAt ?? null,
    createdAt: r.createdAt,
  }));
}

/**
 * Count active (non-revoked) keys for a user. Used by the UI to
 * cap "you have N active keys, max 5" — prevents accidental
 * key explosion + makes abuse easier to spot in admin.
 */
export const ACTIVE_KEY_LIMIT = 5;

export async function activeKeyCount(userId: string): Promise<number> {
  const trimmed = (userId ?? "").trim();
  if (trimmed.length === 0) return 0;
  const rows = await db
    .select({ id: schema.apiKeys.id })
    .from(schema.apiKeys)
    .where(
      and(
        eq(schema.apiKeys.userId, trimmed),
        isNull(schema.apiKeys.revokedAt),
      ),
    );
  return rows.length;
}
