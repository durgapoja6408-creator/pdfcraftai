"use client";

import { usePathname } from "next/navigation";
import { TopNav } from "./TopNav";
import { Footer } from "./Footer";

/**
 * Conditionally renders the marketing TopNav + Footer.
 * Authenticated app routes (/app/*) and auth pages (login/register/signup/
 * forgot-password) render their own chrome inside their own layout, so we
 * hide the marketing chrome there.
 */
const HIDDEN_EXACT = new Set([
  "/login",
  "/register",
  "/signup",
  "/forgot-password",
]);
const HIDDEN_PREFIXES = ["/app"];

export function MarketingChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const isAppRoute =
    HIDDEN_EXACT.has(pathname) ||
    HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isAppRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <TopNav />
      <div className="page fade-in">{children}</div>
      <Footer />
    </>
  );
}
