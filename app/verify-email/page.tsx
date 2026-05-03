// /verify-email — landing page that consumes a verification token.
//
// User clicks the link in their email → arrives here with ?token=...
// We consume the token server-side, render success/failure UI.
//
// On success: emailVerified is set on users row. The grant unlock
// (Day 5.5 layer 3) hooks into this for the credit-grant flow once
// it's wired in a follow-up commit.

import type { Metadata } from "next";
import Link from "next/link";

import { consumeVerificationToken } from "@/lib/auth/email-verification";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Verify email",
  description: "Verify your pdfcraft ai email address.",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams?: { token?: string };
}) {
  const token = searchParams?.token ?? "";

  if (!token) {
    return (
      <main
        className="container-x"
        style={{ padding: "120px 28px", textAlign: "center" }}
      >
        <h1 style={{ fontSize: 32, marginBottom: 12 }}>Missing token</h1>
        <p className="muted" style={{ fontSize: 16, maxWidth: 480, margin: "0 auto 24px" }}>
          This page needs a verification token in the URL. Check the
          link in your email — it may have been clipped by your email
          client.
        </p>
        <Link href="/" className="btn btn-lg btn-primary">
          Back home
        </Link>
      </main>
    );
  }

  const result = await consumeVerificationToken(token);

  if (!result.ok) {
    return (
      <main
        className="container-x"
        style={{ padding: "120px 28px", textAlign: "center" }}
      >
        <h1 style={{ fontSize: 32, marginBottom: 12 }}>
          Verification link expired or invalid
        </h1>
        <p className="muted" style={{ fontSize: 16, maxWidth: 480, margin: "0 auto 24px" }}>
          This link doesn&apos;t look valid — it may have already been
          used, or it&apos;s past the 24-hour expiry. Sign in to your
          account and we can send a new verification email.
        </p>
        <div className="row" style={{ justifyContent: "center", gap: 12 }}>
          <Link href="/login" className="btn btn-lg btn-primary">
            Sign in
          </Link>
          <Link href="/" className="btn btn-lg btn-outline">
            Back home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      className="container-x"
      style={{ padding: "120px 28px", textAlign: "center" }}
    >
      <div
        aria-hidden
        style={{
          width: 60,
          height: 60,
          borderRadius: 16,
          background: "color-mix(in oklab, var(--accent) 15%, transparent)",
          color: "var(--accent)",
          display: "grid",
          placeItems: "center",
          margin: "0 auto 16px",
          fontSize: 32,
        }}
      >
        ✓
      </div>
      <h1 style={{ fontSize: 32, marginBottom: 12 }}>Email verified</h1>
      <p className="muted" style={{ fontSize: 16, maxWidth: 480, margin: "0 auto 32px" }}>
        Your email address is verified. Sign in to start using
        pdfcraft ai&apos;s AI tools.
      </p>
      <div className="row" style={{ justifyContent: "center", gap: 12 }}>
        <Link href="/login" className="btn btn-lg btn-primary">
          Sign in
        </Link>
        <Link href="/tools" className="btn btn-lg btn-outline">
          Browse tools
        </Link>
      </div>
    </main>
  );
}
