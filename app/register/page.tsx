// app/register/page.tsx — Create-account page.
//
// PENDING §3e Phase E (2026-05-05): reads the optional `?ref=CODE`
// query param and persists it as a server-side cookie so the
// `events.signIn` handler in auth.ts can resolve attribution after
// user creation. Without this, the attribution chain breaks at
// step 1: the URL param is on the GET that loads the form, but the
// user record is created on the credentials POST and Google OAuth
// callback — neither of which sees the original URL.

import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import {
  isValidReferralCode,
  setReferralCookie,
} from "@/lib/referrals/cookie";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your pdfcraft ai account.",
  robots: { index: false, follow: false },
};

// Reading searchParams to set a cookie requires a dynamic render —
// without `force-dynamic` Next.js tries to statically generate and
// the `cookies()` write throws.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SearchParams {
  ref?: string | string[];
}

export default function RegisterPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Normalize multi-value query params (Next.js passes string[] when
  // a key appears multiple times; we accept the FIRST one and ignore
  // the rest — typical UA behavior).
  const refRaw = Array.isArray(searchParams.ref)
    ? searchParams.ref[0]
    : searchParams.ref;
  const refValid =
    typeof refRaw === "string" && isValidReferralCode(refRaw);
  if (refValid && typeof refRaw === "string") {
    // Persist the referral code in a server-side cookie. Caught +
    // persisted regardless of whether the user actually completes
    // signup. 30-day TTL (see cookie.ts).
    setReferralCookie(refRaw);
  }

  return (
    <AuthShell
      eyebrow="GET STARTED — FREE"
      title="Create your pdfcraft ai account"
      subtitle={
        refValid
          ? "Joining via referral · 5 AI credits on signup, valid 7 days, plus your friend gets credit when you upgrade."
          : "Free forever for merge, split, convert, and compress. 5 AI credits on signup, valid 7 days."
      }
      sidePanel="register"
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={
              refValid && typeof refRaw === "string"
                ? `/login?ref=${encodeURIComponent(refRaw)}`
                : "/login"
            }
            style={{
              color: "var(--accent)",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              fontWeight: 500,
            }}
          >
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
