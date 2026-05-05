// app/register/page.tsx — Create-account page.
//
// PENDING §3e Phase E (2026-05-05): reads the optional `?ref=CODE`
// query param to show conditional referral copy. The actual cookie
// write (so events.signIn can resolve attribution) lives in middleware
// because Next.js 14 forbids `cookies().set()` from a server-component
// render path — see middleware.ts for the cookie-write logic.

import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { isValidReferralCode } from "@/lib/referrals/cookie";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your pdfcraft ai account.",
  robots: { index: false, follow: false },
};

// Reading searchParams to vary the page copy makes this dynamic.
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
  // a key appears multiple times; we accept the FIRST one).
  const refRaw = Array.isArray(searchParams.ref)
    ? searchParams.ref[0]
    : searchParams.ref;
  const refValid =
    typeof refRaw === "string" && isValidReferralCode(refRaw);
  // NOTE: the cookie itself is set by middleware.ts before this
  // page renders — see the /register?ref= branch there. We can't
  // call setReferralCookie() from here because Next.js forbids
  // cookies().set() in server-component render paths.

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
