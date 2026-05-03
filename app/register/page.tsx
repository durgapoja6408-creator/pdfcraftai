import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your pdfcraft ai account.",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="GET STARTED — FREE"
      title="Create your pdfcraft ai account"
      subtitle="Free forever for merge, split, convert, and compress. 5 AI credits on signup, valid 7 days."
      sidePanel="register"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2, fontWeight: 500 }}>
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
