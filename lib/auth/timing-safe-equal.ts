import { timingSafeEqual } from "crypto";

/**
 * Constant-time string comparison. Returns false on null/undefined or any
 * length mismatch (guarded before the compare so unequal lengths never
 * throw). Use for comparing secrets (cron tokens, etc.) so an attacker
 * can't recover the secret byte-by-byte via response-timing analysis.
 */
export function timingSafeStrEqual(
  a: string | undefined | null,
  b: string | undefined | null
): boolean {
  if (a == null || b == null) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
