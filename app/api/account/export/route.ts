// /api/account/export — DPDP Act 2023 user-data export endpoint.
//
// Plan ref: docs/PRICING_AND_TELEMETRY_PLAN.md §8a item DPDP gap 13.
//
// What this returns:
//   A JSON dump of every user-attributable record we hold:
//     - users row (name, email, image, createdAt)
//     - credits balance (current snapshot)
//     - credit_ledger entries (full history of grants/spends/refunds)
//     - ai_usage entries (per-call provider, model, tokens, latency,
//       credits, cost — admins see this anyway, but the user owns the
//       data so they get the full picture too)
//     - ai_outputs entries (the generated content — markdown, structured
//       data, file references)
//     - payments entries (purchase history)
//     - files entries (uploaded file metadata — NOT the file blobs,
//       which were deleted within 60 minutes per data minimization)
//
// What's excluded:
//   - Password hash (not exportable; user has it via memory or reset)
//   - OAuth refresh tokens (security; user can re-link the provider)
//   - Internal IDs that have no user meaning (idempotency keys, etc.)
//
// Format: JSON. Single fetch returns the full dump. Set Content-
// Disposition: attachment so browsers prompt a save dialog.

import "server-only";

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";

function noStore(headers: HeadersInit = {}): Headers {
  const h = new Headers(headers);
  h.set("cache-control", "no-store, max-age=0");
  return h;
}

export async function GET(_req: NextRequest): Promise<Response> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "auth_required" }),
      {
        status: 401,
        headers: noStore({ "content-type": "application/json" }),
      }
    );
  }

  // Pull all user-attributable rows in parallel. Each query is
  // userId-indexed so the cost is one disk seek per table, regardless
  // of total row count.
  const [
    [userRow],
    [creditRow],
    ledgerRows,
    aiUsageRows,
    aiOutputRows,
    paymentRows,
    fileRows,
  ] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        emailVerified: schema.users.emailVerified,
        image: schema.users.image,
        createdAt: schema.users.createdAt,
        billingName: schema.users.billingName,
        billingAddressLine1: schema.users.billingAddressLine1,
        billingAddressLine2: schema.users.billingAddressLine2,
        billingCity: schema.users.billingCity,
        billingPostalCode: schema.users.billingPostalCode,
        billingState: schema.users.billingState,
        billingCountry: schema.users.billingCountry,
        gstin: schema.users.gstin,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1),
    db
      .select({
        balance: schema.credits.balance,
        updatedAt: schema.credits.updatedAt,
      })
      .from(schema.credits)
      .where(eq(schema.credits.userId, userId))
      .limit(1),
    db
      .select()
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.userId, userId)),
    db
      .select()
      .from(schema.aiUsage)
      .where(eq(schema.aiUsage.userId, userId)),
    // ai_outputs has no userId column — its FK is fileId → files.id.
    // Inner-join via files to scope to the current user.
    db
      .select({
        fileId: schema.aiOutputs.fileId,
        kind: schema.aiOutputs.kind,
        contentMd: schema.aiOutputs.contentMd,
        meta: schema.aiOutputs.meta,
        createdAt: schema.aiOutputs.createdAt,
      })
      .from(schema.aiOutputs)
      .innerJoin(schema.files, eq(schema.aiOutputs.fileId, schema.files.id))
      .where(eq(schema.files.userId, userId)),
    db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.userId, userId)),
    db
      .select()
      .from(schema.files)
      .where(eq(schema.files.userId, userId)),
  ]);

  if (!userRow) {
    return new Response(
      JSON.stringify({ error: "user_not_found" }),
      {
        status: 404,
        headers: noStore({ "content-type": "application/json" }),
      }
    );
  }

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    user: userRow,
    credits: {
      balance: creditRow?.balance ?? 0,
      updatedAt: creditRow?.updatedAt ?? null,
    },
    creditLedger: ledgerRows,
    aiUsage: aiUsageRows,
    aiOutputs: aiOutputRows,
    payments: paymentRows,
    files: fileRows,
    // Documentation note for the recipient — the file BLOBS are not
    // included because they were deleted within 60 minutes of upload
    // per our data-minimisation policy. What you see in `files` is
    // metadata only (filename, size, content-type).
    notes: {
      fileBlobs:
        "Uploaded PDF/image bytes are auto-deleted within 60 minutes — only metadata is retained.",
      passwordHash:
        "Password hashes are not exportable. Use the 'forgot password' flow if you need to recover access.",
      oauthRefreshTokens:
        "OAuth refresh tokens are security-sensitive and not exportable. Sign in with Google again to re-link.",
    },
  };

  // Pretty-print for human-readable download.
  const json = JSON.stringify(exportPayload, null, 2);
  const filename = `pdfcraftai-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(json, {
    status: 200,
    headers: noStore({
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    }),
  });
}
