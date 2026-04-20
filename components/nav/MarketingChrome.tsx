"use client";

import { usePathname } from "next/navigation";
import { TopNav } from "./TopNav";
import { Footer } from "./Footer";

/**
 * Conditionally renders the marketing TopNav + Footer.
 * Authenticated app routes (/app/*) and auth pages (login/register/signup/
 * forgot-password) render their own chrome inside their own layout, so we
 * hide the marketing chrome there.
 *
 * Studio (/studio) is a full-bleed canvas — it keeps the TopNav for
 * navigation but hides the Footer so the canvas can fill the viewport.
 */
const HIDDEN_EXACT = new Set([
  "/login",
  "/register",
  "/signup",
  "/forgot-password",
]);
const HIDDEN_PREFIXES = ["/app"];

/**
 * Routes that keep the TopNav but suppress the Footer.
 * Canvas / tool surfaces that want maximum vertical real estate.
 */
const NO_FOOTER_EXACT = new Set<string>(["/studio"]);
const NO_FOOTER_PREFIXES: string[] = [];

export function MarketingChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  const isAppRoute =
    HIDDEN_EXACT.has(pathname) ||
    HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isAppRoute) {
    return <>{children}</>;
  }

  const hideFooter =
    NO_FOOTER_EXACT.has(pathname) ||
    NO_FOOTER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <>
      <TopNav />
      <div className="page fade-in">{children}</div>
      {!hideFooter && <Footer />}
    </>
  );
}
