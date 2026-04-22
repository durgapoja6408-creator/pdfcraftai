"use server";

import "server-only";

// lib/invoicing/billing-actions.ts — Server actions for the buyer-side
// billing profile (Phase D / Task #23 PART 2).
//
// The /app/settings page adds a "Billing profile" card that lets users
// fill in a legal name, address, state, country, and GSTIN. Those
// values feed /api/invoices/[paymentId]/route.ts when it assembles an
// invoice PDF — replacing the hard-coded "IN / null / null" defaults
// that shipped in PART 1.
//
// Design notes
// ------------
//
// - We keep this in its own module (not settings-actions.ts) so the
//   invoicing tests can grep a single file for the GSTIN validator
//   wiring, and so a future rewrite doesn't tangle billing with
//   password-reset / delete-account flows.
//
// - All writes are idempotent: the action accepts the full profile
//   each submit and overwrites every column. No partial-update path —
//   it'd add a failure mode (user clears city but server re-uses old
//   city) without meaningfully reducing bandwidth.
//
// - GSTIN is validated structurally with `validateGstin()` before the
//   DB write. We don't hit the GSTN API to confirm the GSTIN is live;
//   that's a Phase E concern (requires GSTN registration + creds).
//   Structural validity is enough to stamp the invoice — the buyer
//   bears the risk of a structurally-valid-but-revoked GSTIN appearing
//   on their own input-credit claim.
//
// - Country defaults to "IN" at form-submit time when empty. That's a
//   deliberate product choice: our current buyer base is 100%
//   India-side through Razorpay, and the alternative (reject the
//   form) creates more friction than it saves. Future: add a country
//   picker that defaults to the user's billing-IP country.
//
// - State code is validated against INDIAN_STATE_CODES only when
//   country === "IN". For non-India buyers, state is free-text up to
//   8 chars (the column is char(2) per schema, so we truncate).
//
// - revalidatePath is called on /app/settings — not on /api/invoices
//   (no page to revalidate) or /admin/invoicing (different auth scope).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { auth } from "@/auth";
import { validateGstin, INDIAN_STATE_CODES } from "./gstin";

// ---------------------------------------------------------------------
// Zod schema for the billing form
// ---------------------------------------------------------------------
//
// All fields are optional — a user can clear their billing profile by
// submitting an empty form. The GSTIN validator fires only when a
// non-empty string is provided; empty strings coerce to undefined so
// clearing the field drops the column back to NULL.
//
// Why .transform on the GSTIN: users paste with spaces and mixed case.
// The form normalises to upper-case, strips whitespace, then hands to
// validateGstin. Same normalisation the validator does internally, but
// we apply it here so the DB column stores the canonical form.
const billingSchema = z.object({
  billingName: z
    .string()
    .trim()
    .max(255, "Billing name is too long.")
    .transform((v) => (v.length > 0 ? v : null))
    .nullable()
    .default(null),
  billingAddressLine1: z
    .string()
    .trim()
    .max(255, "Address line is too long.")
    .transform((v) => (v.length > 0 ? v : null))
    .nullable()
    .default(null),
  billingAddressLine2: z
    .string()
    .trim()
    .max(255, "Address line is too long.")
    .transform((v) => (v.length > 0 ? v : null))
    .nullable()
    .default(null),
  billingCity: z
    .string()
    .trim()
    .max(128, "City name is too long.")
    .transform((v) => (v.length > 0 ? v : null))
    .nullable()
    .default(null),
  billingPostalCode: z
    .string()
    .trim()
    .max(32, "Postal code is too long.")
    .transform((v) => (v.length > 0 ? v : null))
    .nullable()
    .default(null),
  billingState: z
    .string()
    .trim()
    .toUpperCase()
    .max(2, "State code is two characters.")
    .transform((v) => (v.length > 0 ? v : null))
    .nullable()
    .default(null),
  billingCountry: z
    .string()
    .trim()
    .toUpperCase()
    .max(2, "Country code is two characters.")
    .transform((v) => (v.length > 0 ? v : null))
    .nullable()
    .default(null),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/\s+/g, ""))
    .transform((v) => (v.length > 0 ? v : null))
    .nullable()
    .default(null),
});

export type BillingProfileState = {
  ok: boolean;
  message?: string;
  error?: string;
  /** Field-level validation errors, keyed by form field name. */
  fieldErrors?: Partial<Record<keyof z.infer<typeof billingSchema>, string>>;
};

// ---------------------------------------------------------------------
// updateBillingProfileAction — the form submit handler
// ---------------------------------------------------------------------
//
// Flow:
//   1. auth() — redirect to /login if no session.
//   2. Parse the FormData with billingSchema.
//   3. If GSTIN provided, run validateGstin; reject on failure.
//   4. If country === "IN" and state provided, verify the state is in
//      INDIAN_STATE_CODES; reject on failure.
//   5. UPDATE users SET ... WHERE id = userId.
//   6. revalidatePath("/app/settings") so the form re-renders with
//      the new values.
export async function updateBillingProfileAction(
  _prev: BillingProfileState | undefined,
  formData: FormData
): Promise<BillingProfileState> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (!userId) {
    redirect("/login");
  }

  const parsed = billingSchema.safeParse({
    billingName: formData.get("billingName") ?? "",
    billingAddressLine1: formData.get("billingAddressLine1") ?? "",
    billingAddressLine2: formData.get("billingAddressLine2") ?? "",
    billingCity: formData.get("billingCity") ?? "",
    billingPostalCode: formData.get("billingPostalCode") ?? "",
    billingState: formData.get("billingState") ?? "",
    billingCountry: formData.get("billingCountry") ?? "",
    gstin: formData.get("gstin") ?? "",
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first?.message ?? "Invalid input.",
      fieldErrors: {
        [first?.path[0] as keyof z.infer<typeof billingSchema>]:
          first?.message ?? "Invalid.",
      },
    };
  }

  const data = parsed.data;

  // Structural GSTIN validation — only when the user provided one.
  if (data.gstin) {
    const v = validateGstin(data.gstin);
    if (!v.ok) {
      const reasonCopy: Record<typeof v.reason, string> = {
        empty: "GSTIN is empty.",
        wrong_length: "GSTIN must be exactly 15 characters.",
        bad_format: "GSTIN format is invalid.",
        bad_state_code:
          "GSTIN state code is not recognised (first two digits).",
        bad_checksum: "GSTIN check digit is wrong — please re-check the last character.",
        not_regular_taxpayer:
          "Only regular-taxpayer GSTINs (position 14 = 'Z') are supported.",
      };
      return {
        ok: false,
        error: reasonCopy[v.reason],
        fieldErrors: { gstin: reasonCopy[v.reason] },
      };
    }
    // v.gstin is the canonical (stripped, upper-case) form.
    data.gstin = v.gstin;

    // If the user provided a GSTIN but no country, we can infer India
    // from the state code. If the user provided a non-India country
    // but a GSTIN, that's a contradiction — reject.
    if (data.billingCountry && data.billingCountry !== "IN") {
      return {
        ok: false,
        error:
          "GSTIN is an India-only identifier — set country to IN or clear the GSTIN.",
        fieldErrors: { gstin: "Clear GSTIN or set country to IN." },
      };
    }
    if (!data.billingCountry) data.billingCountry = "IN";
    // Auto-fill billingState from the GSTIN's first two digits if the
    // user didn't specify one — removes one field's worth of friction
    // for B2B buyers.
    if (!data.billingState) data.billingState = v.stateCode;
  }

  // Indian state-code check when billing_country is IN.
  if (data.billingCountry === "IN" && data.billingState) {
    if (!(data.billingState in INDIAN_STATE_CODES)) {
      return {
        ok: false,
        error: "India state code is not recognised (must be 01..38).",
        fieldErrors: { billingState: "Unknown state code." },
      };
    }
  }

  try {
    await db
      .update(schema.users)
      .set({
        gstin: data.gstin,
        billingName: data.billingName,
        billingAddressLine1: data.billingAddressLine1,
        billingAddressLine2: data.billingAddressLine2,
        billingCity: data.billingCity,
        billingPostalCode: data.billingPostalCode,
        billingState: data.billingState,
        billingCountry: data.billingCountry,
      })
      .where(eq(schema.users.id, userId));
  } catch (err) {
    console.error("updateBillingProfile failed:", err);
    return { ok: false, error: "Could not save billing profile." };
  }

  revalidatePath("/app/settings");
  revalidatePath("/app/receipts");
  return { ok: true, message: "Billing profile saved." };
}
