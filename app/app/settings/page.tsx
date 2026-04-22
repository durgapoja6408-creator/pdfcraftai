import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { ProfileForm } from "@/components/app/settings/ProfileForm";
import { PasswordForm } from "@/components/app/settings/PasswordForm";
import { DeleteAccountForm } from "@/components/app/settings/DeleteAccountForm";
import { BillingProfileForm } from "@/components/app/settings/BillingProfileForm";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;
  if (!userId) redirect("/login");

  const [user] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
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

  if (!user) redirect("/login");

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

const sectionHeading: React.CSSProperties = {
  fontSize: 16,
  letterSpacing: "-0.01em",
  margin: "0 0 16px",
};
