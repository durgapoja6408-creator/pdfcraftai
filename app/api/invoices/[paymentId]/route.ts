// /api/invoices/[paymentId] — Serve a PDF invoice for a single payment.
//
// Phase D / Task #23.
//
// This endpoint assembles an `InvoiceInput` from:
//   1. The authenticated user's profile (via `auth()`).
//   2. The `payments` row identified by the URL parameter.
//   3. The matching `credit_ledger` row (for tax columns).
//   4. The env-driven seller identity.
// … and streams back a PDF to the browser.
//
// Authorization:
//   - Only the user who owns the payment row can download the invoice.
//     Admins do NOT get an automatic override — admin access to
//     another user's invoice flows through the /admin/payments page
//     in Phase E (separate auditable path). 404 (not 403) for a
//     mismatched userId so we don't leak row existence.
//
// Response shape:
//   - Content-Type: application/pdf
//   - Content-Disposition: attachment; filename="invoice-INV-2025-ABCDEF12.pdf"
//   - The filename is deterministic (from `deriveInvoiceNumber`), so
//     the user hitting this URL twice lands the same file both times.
//
// Idempotency / caching:
//   - We deliberately don't set a long Cache-Control. The underlying
//     seller config (address, GSTIN) can change post-registration; we
//     want subsequent downloads to reflect that. The invoice NUMBER is
//     stable, but the rendered body can evolve.
//
// Failure modes:
//   - 401 if no session.
//   - 404 if payment doesn't exist OR belongs to another user.
//   - 409 if payment is in a pre-capture state (pending / failed /
//     cancelled). Those don't represent money that moved, so generating
//     an invoice for them would be misleading.

import "server-only";

import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { getSellerIdentity } from "@/lib/invoicing/seller";
import { assembleInvoiceInput, type PaymentForInvoice, type LedgerTaxRow, type BuyerContext } from "@/lib/invoicing/assemble";
import { renderInvoice } from "@/lib/invoicing/renderer";
import { type IndianStateCode, INDIAN_STATE_CODES } from "@/lib/invoicing/gstin";

export const runtime = "nodejs"; // pdf-lib needs node crypto
export const dynamic = "force-dynamic"; // per-user, authed — never cache

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ paymentId: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { paymentId } = await ctx.params;
  if (!paymentId || typeof paymentId !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // 1. Fetch the payment. Must belong to the current user.
  const paymentRows = await db
    .select({
      id: schema.payments.id,
      userId: schema.payments.userId,
      amountMinor: schema.payments.amountMinor,
      currency: schema.payments.currency,
      packId: schema.payments.packId,
      planCode: schema.payments.planCode,
      status: schema.payments.status,
      createdAt: schema.payments.createdAt,
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.id, paymentId),
        eq(schema.payments.userId, userId)
      )
    )
    .limit(1);

  const row = paymentRows[0];
  if (!row) {
    // 404 (not 403) so mismatched-userId requests don't leak existence.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (row.status === "pending" || row.status === "failed" || row.status === "cancelled") {
    return NextResponse.json(
      { error: "payment_not_captured", status: row.status },
      { status: 409 }
    );
  }

  // 2. Fetch the matching ledger row for tax info. Optional: pre-Task #15
  //    payments won't have tax columns populated; we pass null and the
  //    renderer prints a zero-tax invoice.
  let ledger: LedgerTaxRow = null;
  const ledgerRows = await db
    .select({
      taxCollectedMicros: schema.creditLedger.taxCollectedMicros,
      taxTreatment: schema.creditLedger.taxTreatment,
      taxRemittableMicros: schema.creditLedger.taxRemittableMicros,
    })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.paymentId, row.id))
    .limit(1);
  const ledgerRow = ledgerRows[0];
  if (ledgerRow) {
    // taxTreatment narrows to the union type of the DB varchar. Guard
    // against unexpected legacy values.
    const allowedTreatments = ["mor", "forward", "rcm", "none"] as const;
    const treatment = allowedTreatments.includes(
      ledgerRow.taxTreatment as typeof allowedTreatments[number]
    )
      ? (ledgerRow.taxTreatment as typeof allowedTreatments[number])
      : null;
    ledger = {
      taxCollectedMicros: ledgerRow.taxCollectedMicros,
      taxTreatment: treatment,
      taxRemittableMicros: ledgerRow.taxRemittableMicros,
    };
  }

  // 3. Fetch the buyer profile. We use the users table for name + email
  //    and (Task #23 PART 2) the billing_* columns for country / state /
  //    GSTIN / address. Users who haven't filled their billing profile
  //    still get a compliant invoice: the defaults below ("IN" / no
  //    state / no GSTIN) match the pre-PART-2 hard-coded behaviour.
  const userRows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      gstin: schema.users.gstin,
      billingName: schema.users.billingName,
      billingAddressLine1: schema.users.billingAddressLine1,
      billingAddressLine2: schema.users.billingAddressLine2,
      billingCity: schema.users.billingCity,
      billingPostalCode: schema.users.billingPostalCode,
      billingState: schema.users.billingState,
      billingCountry: schema.users.billingCountry,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const user = userRows[0];
  if (!user) {
    return NextResponse.json({ error: "user_missing" }, { status: 500 });
  }

  // Resolve buyer country. NULL column = user never filled the form =>
  // fall back to "IN", preserving the v1 hard-coded default.
  const buyerCountry = (user.billingCountry || "IN").toUpperCase();

  // Only honour the stored state code if we're an India buyer AND the
  // value is in the known set. A non-India buyer with a state code is
  // a user-entered mistake; we drop it silently rather than stamping
  // garbage on the PDF.
  let buyerStateCode: IndianStateCode | null = null;
  if (
    buyerCountry === "IN" &&
    user.billingState &&
    (user.billingState as string) in INDIAN_STATE_CODES
  ) {
    buyerStateCode = user.billingState as IndianStateCode;
  }

  const buyerGstin: string | null =
    buyerCountry === "IN" && user.gstin ? user.gstin : null;

  // Address lines: skip NULL/empty values so the renderer doesn't
  // print blank rows. Order: line1, line2, "City, PIN", state name,
  // country code. State name lookup uses INDIAN_STATE_CODES for IN
  // buyers — for non-IN buyers we leave billingState out (char(2)
  // column can't store a full state name anyway).
  const addressLines: string[] = [];
  if (user.billingAddressLine1) addressLines.push(user.billingAddressLine1);
  if (user.billingAddressLine2) addressLines.push(user.billingAddressLine2);
  const cityPin = [user.billingCity, user.billingPostalCode]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(", ");
  if (cityPin) addressLines.push(cityPin);
  if (buyerStateCode) {
    addressLines.push(
      `${INDIAN_STATE_CODES[buyerStateCode]} (${buyerStateCode})`
    );
  }
  if (buyerCountry && buyerCountry !== "IN") {
    addressLines.push(buyerCountry);
  }

  const buyer: BuyerContext = {
    // Prefer billing_name over users.name — the former is the legal
    // entity for B2B receipts, the latter is a display name that may
    // be a personal full name or a handle.
    name: user.billingName || user.name || "PDFCraftAI Customer",
    email: user.email || "",
    country: buyerCountry,
    stateCode: buyerStateCode,
    gstin: buyerGstin,
    addressLines: addressLines.length > 0 ? addressLines : undefined,
  };

  // 4. Assemble + render.
  const seller = getSellerIdentity();
  const payment: PaymentForInvoice = {
    id: row.id,
    amountMinor: row.amountMinor,
    currency: row.currency,
    packId: row.packId,
    planCode: row.planCode,
    status: row.status,
    createdAtMs: row.createdAt.getTime(),
  };

  // If the payment is refunded, stamp a note. A refund re-issue is a
  // credit note in strict GST speak; v1 renders the same invoice shape
  // with a "Refunded on …" note so the user can see the reversal in a
  // single PDF. Strict credit-note PDFs (with negative totals and
  // separate numbering) ship with the self-serve refund UI in Phase E.
  const refundedAt =
    row.status === "refunded" || row.status === "partial_refund"
      ? formatIsoDate(Date.now())
      : null;
  const notes = refundedAt
    ? `Payment status: ${row.status} (reversal recorded ${refundedAt}).`
    : undefined;

  const input = assembleInvoiceInput({
    payment,
    ledger,
    buyer,
    seller,
    notes,
  });
  const { pdfBytes, filename } = await renderInvoice(input);

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function formatIsoDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
