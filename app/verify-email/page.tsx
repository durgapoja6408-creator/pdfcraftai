// /verify-email — landing page that consumes a verification token.
//
// User clicks the link in their email → arrives here with ?token=...
// We consume the token server-side, render success/failure UI.
//
// On success:
//   1. emailVerified is set on the users row (consumeVerificationToken)
//   2. The 5-credit signup bonus is granted (grantSignupBonus, idempotent
//      on `signup_bonus:${userId}`). This is plan §8 layer 3 — credits
//      are funded ONLY after the user proves email ownership, which is
//      what makes the free grant economically uneconomical to abuse.
//
// Idempotency: consumeVerificationToken deletes the token row, so this
// page can't be replayed for the same user. grantSignupBonus is also
// keyed on userId, so even if a user somehow re-verifies (e.g. token
// re-issued via /resend-verification), the credit grant fires once.

import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/auth";
import { consumeVerificationToken } from "@/lib/auth/email-verification";
import { CodeEntryForm } from "./CodeEntryForm";
import { grantSignupBonus } from "@/lib/payments/signup-bonus";
// PENDING §3e Phase E final (2026-05-05) — fire the referred-user
// reward when they verify their email. Idempotent + flag-gated;
// no-op when REFERRALS_ENABLED is off.
import { triggerReferredReward } from "@/lib/referrals/rewards";
// Lifecycle: welcome email on the first email-verification transition.
import { sendWelcomeEmail } from "@/lib/email/transactional";

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

  // No token in URL? Show the 6-digit OTP code-entry form
  // (gap #1, 2026-05-06). Requires a session — the OTP path
  // verifies the code against eval_codes.user_id from the
  // session, NEVER from input. Anonymous visitors hitting
  // /verify-email without a token get the "sign in first" copy.
  if (!token) {
    const session = await auth();
    const isSignedIn = Boolean(
      session?.user && (session.user as { id?: string }).id,
    );
    return (
      <main
        className="container-x"
        style={{ padding: "120px 28px", textAlign: "center" }}
      >
        <h1 style={{ fontSize: 32, marginBottom: 12 }}>
          Verify your email
        </h1>
        {isSignedIn ? (
          <>
            <p
              className="muted"
              style={{
                fontSize: 15,
                maxWidth: 480,
                margin: "0 auto 8px",
                lineHeight: 1.5,
              }}
            >
              Click the link in your verification email — or enter
              the 6-digit code below.
            </p>
            <CodeEntryForm />
          </>
        ) : (
          <>
            <p
              className="muted"
              style={{
                fontSize: 15,
                maxWidth: 480,
                margin: "0 auto 24px",
                lineHeight: 1.5,
              }}
            >
              Sign in first, then either click the link in your
              verification email or enter the 6-digit code from
              the email on this page.
            </p>
            <div className="row" style={{ justifyContent: "center", gap: 12 }}>
              <Link href="/login?callbackUrl=/verify-email" className="btn btn-lg btn-primary">
                Sign in
              </Link>
              <Link href="/" className="btn btn-lg btn-outline">
                Back home
              </Link>
            </div>
          </>
        )}
      </main>
    );
  }

  const result = await consumeVerificationToken(token);

  // 2026-05-03 plan §8 layer 3 — fire the deferred signup bonus on
  // verified credentials accounts. Wrapped in try/catch so a grant
  // failure (e.g. transient DB hiccup) doesn't break the verify UX —
  // user still sees the success page; admin can re-run the grant via
  // a manual /admin tool if the structured-log alert fires.
  // No-ops when SIGNUP_GRANT_ENABLED!=="true". Idempotent across
  // multiple verifies of the same user (key: signup_bonus:${userId}).
  let grantOutcome: { credits: number; expiresAt: Date } | null = null;
  if (result.ok) {
    try {
      const grant = await grantSignupBonus(result.userId);
      if (grant.granted) {
        grantOutcome = { credits: grant.credits, expiresAt: grant.expiresAt };
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "verify_email_grant_failed",
          userId: result.userId,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        }),
      );
    }

    // PENDING §3e Phase E final (2026-05-05) — fire the referred-
    // user reward if this account was created with a referral
    // attribution. No-op when REFERRALS_ENABLED is off OR when the
    // user has no referral_signups row (organic signup) OR when the
    // reward was already granted on a prior verify (idempotent).
    //
    // Same try/catch discipline as grantSignupBonus above: failing
    // the verify page over a referral reward grant would block the
    // user from accessing their account.
    try {
      await triggerReferredReward(result.userId);
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "verify_email_referral_grant_failed",
          userId: result.userId,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        }),
      );
    }

    // Welcome email — fire ONCE, on the genuine NULL→verified
    // transition (consumeVerificationToken reports firstVerification).
    // Swallow-on-failure like the grants above: a mail hiccup must
    // never break the verify UX. sendWelcomeEmail is itself fail-soft.
    if (result.firstVerification) {
      try {
        await sendWelcomeEmail(result.userId);
      } catch (err) {
        console.error(
          JSON.stringify({
            event: "verify_email_welcome_failed",
            userId: result.userId,
            error: err instanceof Error ? err.message : String(err),
            ts: new Date().toISOString(),
          }),
        );
      }
    }
  }

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
      <p className="muted" style={{ fontSize: 16, maxWidth: 480, margin: "0 auto 16px" }}>
        Your email address is verified. Sign in to start using
        pdfcraft ai&apos;s AI tools.
      </p>
      {grantOutcome && (
        <p
          style={{
            display: "inline-block",
            padding: "8px 16px",
            borderRadius: 999,
            background: "color-mix(in oklab, var(--accent) 12%, transparent)",
            color: "var(--accent)",
            fontSize: 14,
            fontWeight: 500,
            marginBottom: 24,
          }}
        >
          ✨ {grantOutcome.credits} free credits added — valid until{" "}
          {grantOutcome.expiresAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </p>
      )}
      {!grantOutcome && (
        <div style={{ marginBottom: 24 }} />
      )}
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
