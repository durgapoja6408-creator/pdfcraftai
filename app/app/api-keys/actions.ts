// Server Actions for /app/api-keys (Tier 1 #1, 2026-05-08).
//
// Wraps lib/api-keys/index.ts:mintKey + revokeKey with auth +
// per-user limit enforcement. All actions pull userId from
// session — anti-impersonation, NEVER from input.

"use server";

import { auth } from "@/auth";
import {
  ACTIVE_KEY_LIMIT,
  activeKeyCount,
  mintKey,
  revokeKey,
} from "@/lib/api-keys";

export interface MintActionResult {
  ok: true;
  rawKey: string;
  prefix: string;
  id: string;
  label: string;
}
export interface MintActionError {
  ok: false;
  error: string;
}

export async function mintKeyAction(
  label: string,
): Promise<MintActionResult | MintActionError> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (typeof userId !== "string") {
    return { ok: false, error: "You need to be signed in." };
  }

  const trimmed = (label ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Give the key a label so you can identify it later." };
  }
  if (trimmed.length > 128) {
    return { ok: false, error: "Label must be 128 characters or fewer." };
  }

  // Per-user active-key cap. Prevents accidental explosion + makes
  // abuse patterns easier to spot in /admin/users/<id>.
  const active = await activeKeyCount(userId);
  if (active >= ACTIVE_KEY_LIMIT) {
    return {
      ok: false,
      error: `You already have ${ACTIVE_KEY_LIMIT} active keys. Revoke an old one before minting another.`,
    };
  }

  try {
    const result = await mintKey({ userId, label: trimmed });
    return {
      ok: true,
      rawKey: result.rawKey,
      prefix: result.row.prefix,
      id: result.row.id,
      label: result.row.label,
    };
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "mint_key_failed",
        userId,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }),
    );
    return { ok: false, error: "Couldn't mint the key. Try again." };
  }
}

export interface RevokeActionResult {
  ok: true;
}
export interface RevokeActionError {
  ok: false;
  error: string;
}

export async function revokeKeyAction(
  keyId: string,
): Promise<RevokeActionResult | RevokeActionError> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (typeof userId !== "string") {
    return { ok: false, error: "You need to be signed in." };
  }

  const trimmed = (keyId ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Missing key id." };
  }

  const result = await revokeKey({ keyId: trimmed, byUserId: userId });
  if (result.ok) return { ok: true };

  if (result.reason === "not_found") {
    return { ok: false, error: "Key not found." };
  }
  if (result.reason === "not_owner") {
    // Don't leak that the key exists belonging to someone else
    return { ok: false, error: "Key not found." };
  }
  if (result.reason === "already_revoked") {
    return { ok: false, error: "This key was already revoked." };
  }
  return { ok: false, error: "Couldn't revoke the key." };
}
