"use client";

// components/app/settings/BillingProfileForm.tsx — Phase D / Task #23 PART 2.
//
// The billing-profile card on /app/settings. Users fill in a legal
// name, address, state, country, and (optionally) GSTIN. Submitting
// the form fires `updateBillingProfileAction` which validates the
// GSTIN structurally, normalises the values, and writes them onto
// the users row.
//
// Notes:
// - We render a compact subset of the INDIAN_STATE_CODES dropdown
//   options client-side. Keeping the full list here (not imported
//   from lib/invoicing/gstin.ts) avoids dragging server-only types
//   into the client bundle. If the list changes upstream, update
//   both places — the server-side validator is source of truth.
// - Country is a short ISO-3166 picker covering India + the top
//   export markets. Users can type any 2-letter code into the
//   "Other" fallback; the server normalises.
// - The GSTIN field is optional and shown with a small helper link
//   explaining when to fill it.

import { useFormState, useFormStatus } from "react-dom";
import {
  updateBillingProfileAction,
  type BillingProfileState,
} from "@/lib/invoicing/billing-actions";

const initial: BillingProfileState = { ok: false };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
      {pending ? "Saving…" : "Save billing profile"}
    </button>
  );
}

type BillingValues = {
  billingName: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingPostalCode: string | null;
  billingState: string | null;
  billingCountry: string | null;
  gstin: string | null;
};

// Short subset of INDIAN_STATE_CODES for the dropdown. Full coverage
// (38 options) would make the dropdown noisy for the 80% of buyers
// in the top 8 states. Users can still paste any other code — the
// server-action validates against the full list.
const POPULAR_STATES: Array<[string, string]> = [
  ["27", "Maharashtra"],
  ["29", "Karnataka"],
  ["33", "Tamil Nadu"],
  ["07", "Delhi"],
  ["36", "Telangana"],
  ["09", "Uttar Pradesh"],
  ["24", "Gujarat"],
  ["19", "West Bengal"],
  ["32", "Kerala"],
  ["06", "Haryana"],
  ["23", "Madhya Pradesh"],
  ["08", "Rajasthan"],
];

const POPULAR_COUNTRIES: Array<[string, string]> = [
  ["IN", "India"],
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["DE", "Germany"],
  ["SG", "Singapore"],
  ["AE", "United Arab Emirates"],
];

export function BillingProfileForm({ values }: { values: BillingValues }) {
  const [state, formAction] = useFormState(
    updateBillingProfileAction,
    initial
  );

  const fieldError = (k: keyof BillingValues) => state.fieldErrors?.[k];

  return (
    <form action={formAction}>
      <div style={twoCol}>
        <Field label="Legal / billing name">
          <input
            className="input"
            name="billingName"
            type="text"
            defaultValue={values.billingName ?? ""}
            maxLength={255}
            placeholder="Acme India Pvt Ltd"
          />
          {fieldError("billingName") && <FieldErr msg={fieldError("billingName")!} />}
        </Field>
        <Field label="GSTIN (optional)">
          <input
            className="input"
            name="gstin"
            type="text"
            defaultValue={values.gstin ?? ""}
            maxLength={18}
            placeholder="27AAACI1234A1Z5"
            style={{ textTransform: "uppercase", fontFamily: "ui-monospace, monospace" }}
          />
          {fieldError("gstin") && <FieldErr msg={fieldError("gstin")!} />}
          <p className="subtle" style={{ fontSize: 12, marginTop: 6 }}>
            Add your GSTIN to get a Tax Invoice usable for input-tax-credit claims.
          </p>
        </Field>
      </div>

      <Field label="Address line 1">
        <input
          className="input"
          name="billingAddressLine1"
          type="text"
          defaultValue={values.billingAddressLine1 ?? ""}
          maxLength={255}
          placeholder="Floor, building, street"
        />
      </Field>

      <Field label="Address line 2">
        <input
          className="input"
          name="billingAddressLine2"
          type="text"
          defaultValue={values.billingAddressLine2 ?? ""}
          maxLength={255}
          placeholder="Area, landmark (optional)"
        />
      </Field>

      <div style={threeCol}>
        <Field label="City">
          <input
            className="input"
            name="billingCity"
            type="text"
            defaultValue={values.billingCity ?? ""}
            maxLength={128}
          />
        </Field>
        <Field label="Postal / PIN code">
          <input
            className="input"
            name="billingPostalCode"
            type="text"
            defaultValue={values.billingPostalCode ?? ""}
            maxLength={32}
          />
        </Field>
        <Field label="State (India)">
          <select
            className="input"
            name="billingState"
            defaultValue={values.billingState ?? ""}
          >
            <option value="">— Select —</option>
            {POPULAR_STATES.map(([code, label]) => (
              <option key={code} value={code}>
                {code} · {label}
              </option>
            ))}
          </select>
          {fieldError("billingState") && <FieldErr msg={fieldError("billingState")!} />}
        </Field>
      </div>

      <Field label="Country">
        <select
          className="input"
          name="billingCountry"
          defaultValue={values.billingCountry ?? "IN"}
        >
          {POPULAR_COUNTRIES.map(([code, label]) => (
            <option key={code} value={code}>
              {code} · {label}
            </option>
          ))}
        </select>
      </Field>

      {state.error && (
        <p role="alert" style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p role="status" style={{ color: "var(--green)", fontSize: 13, marginBottom: 10 }}>
          {state.message}
        </p>
      )}

      <SaveButton />
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function FieldErr({ msg }: { msg: string }) {
  return (
    <p style={{ color: "var(--red)", fontSize: 12, marginTop: 4 }}>{msg}</p>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 6,
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const threeCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 14,
};
