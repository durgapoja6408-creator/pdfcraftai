import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    // 2026-05-01 — defense-in-depth fallback. Every /app/* page also
    // does its own auth check with a callbackUrl pointing back to that
    // specific page (commit f7a3...), so the page-level redirect is the
    // primary path users hit. This layout redirect only fires if a NEW
    // /app/* page is added without an auth guard. In that case landing
    // on /login without a callback is acceptable degradation (better
    // than silently landing on /app/dashboard with the wrong tool
    // running). The lack of callback here is intentional, not a bug.
    redirect("/login");
  }

  return (
    <AppShell
      user={{
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }}
    >
      {children}
    </AppShell>
  );
}
