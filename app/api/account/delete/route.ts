// /api/account/delete — DPDP Act 2023 right-to-erasure endpoint.
//
// Plan ref: docs/PRICING_AND_TELEMETRY_PLAN.md §8a item DPDP gap 13.
//
// Behaviour:
//   POST /api/account/delete
//   Body: { confirmEmail: <user's email> }
//
// On success: 200 + { ok: true }. The session cookie is invalidated
// by NextAuth's normal expiry; the next request to any protected
// route returns 401.
//
// What gets deleted:
//   - users row → CASCADE drops accounts, sessions,
//     verificationTokens, passwordResetTokens (NextAuth tables),
//     credits, credit_ledger, payments, files, ai_outputs, ai_usage
//     (per existing FK definitions in db/schema/auth.ts + app.ts).
//
// What gets retained:
//   - NOTHING from the deleted user. This is a hard delete by design,
//     consistent with the locked decision in §8a (no DPO named, no
//     soft-delete period).
//   - Aggregate margin data in `ai_daily_margin` is per-day-per-op,
//     not per-user, so user deletion does NOT affect margin tracking.
//
// Confirmation:
//   Client must send `confirmEmail` matching the user's signed-in
//   email. Defense against accidental clicks. CSRF protection comes
//   from NextAuth's session cookie (SameSite=lax) — a cross-origin
//   POST cannot ride a logged-in session.
//
// Audit trail:
//   We log a structured "account_deletion" line to stdout BEFORE the
//   delete fires — admin can recover the user's ID, email-domain (NOT
//   email — DPDP), and timestamp from logs if a deletion is contested.
//   No user data persists post-delete.

import "server-only";

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await auth();
  const sessionUser = session?.user as
    | { id?: string; email?: string }
    | undefined;
  const userId = sessionUser?.id;
  const userEmail = sessionUser?.email;

  if (!userId || !userEmail) {
    return json(401, { error: "auth_required" });
  }

  // Parse + validate confirmation.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const confirmEmail =
    body && typeof body === "object" && "confirmEmail" in body
      ? String((body as Record<string, unknown>).confirmEmail ?? "")
          .trim()
          .toLowerCase()
      : "";
  const sessionEmailLower = userEmail.trim().toLowerCase();

  if (confirmEmail !== sessionEmailLower) {
    return json(400, {
      error: "confirmation_mismatch",
      detail:
        "Confirmation email does not match the signed-in account. Type your full email exactly to confirm deletion.",
    });
  }

  // Audit log (stdout) — captured by Hostinger's nodejs/stderr.log
  // pipeline, retained for ops review. We log domain + id + timestamp
  // ONLY; no email, no name, no PII.
  console.log(
    JSON.stringify({
      event: "account_deletion",
      userId,
      emailDomain: emailDomain(userEmail),
      ts: new Date().toISOString(),
    })
  );

  // Hard delete. CASCADE handles all dependent tables. The single
  // SQL `DELETE FROM users WHERE id = ?` is atomic from the user's
  // perspective — either everything goes or nothing.
  await db.delete(schema.users).where(eq(schema.users.id, userId));

  return json(200, {
    ok: true,
    detail:
      "Account deleted. All associated data has been removed. Sign-out will complete on your next request.",
  });
}
