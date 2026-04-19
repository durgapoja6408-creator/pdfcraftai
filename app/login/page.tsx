import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your pdfcraft ai account.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="WELCOME BACK"
      title="Sign in to pdfcraft ai"
      subtitle="Use your email and password, or continue with Google."
      sidePanel="default"
      footer={
        <>
          New here?{" "}
          <Link href="/register" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
            Create a free account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
