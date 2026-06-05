import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { ProfileForm } from "@/components/app/settings/ProfileForm";
import { PasswordForm } from "@/components/app/settings/PasswordForm";
import { DeleteAccountForm } from "@/components/app/settings/DeleteAccountForm";
import { ExportDataButton } from "@/components/app/settings/ExportDataButton";
import { BillingProfileForm } from "@/components/app/settings/BillingProfileForm";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) redirect("/login?callbackUrl=%2Fapp%2Fsettings");

  const [user] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      emailVerified: schema.users.emailVerified,
      passwordHash: schema.users.passwordHash,
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

  if (!user) redirect("/login?callbackUrl=%2Fapp%2Fsettings");

  // Linked OAuth providers — SELECT provider only (never the stored tokens).
  const accountRows = await db
    .select({ provider: schema.accounts.provider })
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, userId));
  const providers = [...new Set(accountRows.map((a) => a.provider))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 680 }}>
      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>SETTINGS</div>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em" }}>Account settings</h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          Manage your profile, password, and account data.
        </p>
      </header>

      <section className="card" style={{ padding: 24 }}>
        <h2 style={sectionHeading}>Profile</h2>
        <ProfileForm name={user.name ?? ""} email={user.email} />
      </section>

      <section className="card" style={{ padding: 24 }}>
        <h2 style={sectionHeading}>Password</h2>
        <PasswordForm hasPassword={Boolean(user.passwordHash)} />
      </section>

      {/* Sign-in — how this account authenticates + email-verification state.
          Read-only; helps OAuth-only users understand why the Password card
          offers to *set* (not change) a password. (2026-06-05) */}
      <section className="card" style={{ padding: 24 }}>
        <h2 style={sectionHeading}>Sign-in</h2>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {Boolean(user.passwordHash) && <span className="chip">Email &amp; password</span>}
          {providers.map((p) => (
            <span key={p} className="chip">{providerLabel(p)}</span>
          ))}
          {!user.passwordHash && providers.length === 0 && (
            <span className="muted" style={{ fontSize: 13 }}>No sign-in method on file.</span>
          )}
        </div>
        <div className="row" style={{ gap: 8, fontSize: 13, flexWrap: "wrap", alignItems: "center" }}>
          <span className="muted">Email</span>
          <strong style={{ fontWeight: 500 }}>{user.email}</strong>
          {user.emailVerified ? (
            <span className="chip" style={{ background: "var(--green-soft)", color: "var(--green)", borderColor: "var(--green)" }}>Verified</span>
          ) : (
            <span className="chip" style={{ background: "color-mix(in oklab, var(--yellow) 16%, transparent)", color: "var(--yellow)", borderColor: "var(--yellow)" }}>Unverified</span>
          )}
        </div>
      </section>

      {/*
        Billing profile — Phase D / Task #23 PART 2. Feeds
        /api/invoices/[paymentId]/route.ts so downloaded receipt PDFs
        carry the user's legal name, address, GSTIN, and correct
        tax classification.
       */}
      <section className="card" style={{ padding: 24 }}>
        <h2 style={sectionHeading}>Billing profile</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: -10, marginBottom: 16 }}>
          These details appear on your downloadable receipts. Add your GSTIN to
          receive a Tax Invoice eligible for input-tax-credit claims.
        </p>
        <BillingProfileForm
          values={{
            billingName: user.billingName,
            billingAddressLine1: user.billingAddressLine1,
            billingAddressLine2: user.billingAddressLine2,
            billingCity: user.billingCity,
            billingPostalCode: user.billingPostalCode,
            billingState: user.billingState,
            billingCountry: user.billingCountry,
            gstin: user.gstin,
          }}
        />
      </section>

      {/* Item #25 — DPDP §11 right of access. Surfaces the
          existing /api/account/export endpoint with a UI button so
          users can actually exercise the right (rather than having
          to craft the URL by hand). Placed BEFORE the Danger zone
          so the natural reading order matches the access-then-erasure
          DPDP sequence. */}
      <section className="card" style={{ padding: 24 }}>
        <h2 style={sectionHeading}>Export your data</h2>
        <ExportDataButton />
      </section>

      <section
        className="card"
        style={{
          padding: 24,
          borderColor: "var(--red)",
        }}
      >
        <h2 style={{ ...sectionHeading, color: "var(--red)" }}>Danger zone</h2>
        <DeleteAccountForm email={user.email} />
      </section>
    </div>
  );
}

function providerLabel(id: string): string {
  if (id === "google") return "Google";
  if (id === "github") return "GitHub";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

const sectionHeading: React.CSSProperties = {
  fontSize: 16,
  letterSpacing: "-0.01em",
  margin: "0 0 16px",
};
