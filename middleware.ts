/**
 * NextAuth v5 middleware — combines auth gating + referral cookie set.
 *
 * Two responsibilities:
 *   1. /app/* requires a session (redirect to /login if unauthenticated)
 *      /login, /register, /signup, /forgot-password, /reset-password/* —
 *      redirect signed-in users to /app/dashboard.
 *   2. /register?ref=CODE — set the `pdfcraft_ref` attribution cookie
 *      on the response, so the events.signIn handler in auth.ts can
 *      resolve attribution after user creation.
 *
 * Why this is wrapped (replaces the authConfig.callbacks.authorized
 * pattern):
 *   The bare `auth` middleware uses authConfig.authorized() to gate
 *   requests. But that callback only returns booleans / redirects —
 *   we can't ALSO mutate the response to set a cookie. Wrapping
 *   auth() with our own function gives us the response object so
 *   we can do both.
 *
 * Why we re-implement the gate logic here (vs in authConfig):
 *   When you wrap `auth(fn)`, your fn REPLACES the authorized
 *   callback. There's no way to "call authorized then add a cookie
 *   to the response". So the gate logic has to live inside our
 *   wrapper. We mirror authConfig.authorized exactly — keep the two
 *   in sync. The CI guard (Section L) pins both copies.
 */
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";

// Edge-safe inline copy of the alphabet + length from
// `lib/referrals/codes.ts`. We can't import the canonical helper
// because codes.ts uses node:crypto for randomUUID. The CI guard
// pins both copies to the same values.
const REFERRAL_CODE_ALPHABET_EDGE = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const REFERRAL_CODE_LENGTH_EDGE = 7;
const REFERRAL_COOKIE_NAME_EDGE = "pdfcraft_ref";
const REFERRAL_COOKIE_MAX_AGE_EDGE = 30 * 24 * 60 * 60;

const AUTH_PAGES_EDGE = ["/login", "/register", "/signup", "/forgot-password"];

function isValidReferralCodeEdge(code: string | null): boolean {
  if (!code) return false;
  const upper = code.toUpperCase().trim();
  if (upper.length !== REFERRAL_CODE_LENGTH_EDGE) return false;
  for (const ch of upper) {
    if (!REFERRAL_CODE_ALPHABET_EDGE.includes(ch)) return false;
  }
  return true;
}

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth?.user;
  const { pathname } = req.nextUrl;

  // === GATE 1: /app/* requires a session ====================
  const isAppRoute = pathname === "/app" || pathname.startsWith("/app/");
  if (isAppRoute && !isLoggedIn) {
    // Preserve the destination so the user lands where they intended
    // after sign-in (mirrors authConfig.authorized's behavior — Auth.js
    // adds callbackUrl automatically when redirecting to signIn page).
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.toString());
    return NextResponse.redirect(loginUrl);
  }

  // === GATE 2: auth pages bounce signed-in users to dashboard
  const isResetChild = pathname.startsWith("/reset-password/");
  if ((AUTH_PAGES_EDGE.includes(pathname) || isResetChild) && isLoggedIn) {
    return NextResponse.redirect(new URL("/app/dashboard", req.nextUrl));
  }

  // === REFERRAL COOKIE: set on /register?ref=CODE ===========
  // Past both gates → request continues normally. If we're on
  // /register?ref=CODE and the user is NOT signed in (gate 2 already
  // redirected if they were), set the attribution cookie before
  // continuing.
  const response = NextResponse.next();
  if (pathname === "/register") {
    const ref = req.nextUrl.searchParams.get("ref");
    if (ref && isValidReferralCodeEdge(ref)) {
      response.cookies.set({
        name: REFERRAL_COOKIE_NAME_EDGE,
        value: ref.toUpperCase().trim(),
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFERRAL_COOKIE_MAX_AGE_EDGE,
        path: "/",
      });
    }
  }

  return response;
});

export const config = {
  // Skip Next internals and static assets.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
