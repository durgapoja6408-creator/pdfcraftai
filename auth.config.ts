/**
 * Edge-safe auth config. Contains only the bits that the middleware
 * needs to evaluate a JWT — no Drizzle, no bcrypt, no node-only modules.
 *
 * The full config in auth.ts extends this with providers and the Drizzle adapter.
 */

import type { NextAuthConfig } from "next-auth";

const AUTH_PAGES = ["/login", "/register", "/signup", "/forgot-password"];

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  // In production we sit behind Apache + Passenger (or any reverse proxy),
  // so the Host header isn't the bound socket. Auth.js v5 refuses to use
  // the Host header unless trustHost is set — without this every
  // /api/auth/* call fails with UntrustedHost.
  trustHost: true,
  session: {
    strategy: "jwt",
    // 2026-05-12 SEV-2 audit fix: NextAuth defaults to 30-day sessions.
    // For a payments-bearing app, 14 days with a sliding refresh is
    // the more conservative norm — keeps stale tokens short-lived but
    // doesn't force daily logins. Sliding refresh: every request
    // within `updateAge` resets the session expiry.
    maxAge: 14 * 24 * 60 * 60, // 14 days
    updateAge: 24 * 60 * 60, // 1 day — only persist the new expiry once per day
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      // App routes require a session.
      const isAppRoute =
        pathname === "/app" || pathname.startsWith("/app/");
      if (isAppRoute) return isLoggedIn;

      // Auth pages redirect signed-in users to the dashboard.
      // This covers /login, /register, /signup (alias), /forgot-password,
      // and every /reset-password/<token> dynamic child.
      const isResetChild = pathname.startsWith("/reset-password/");
      if ((AUTH_PAGES.includes(pathname) || isResetChild) && isLoggedIn) {
        return Response.redirect(new URL("/app/dashboard", request.nextUrl));
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id?: string }).id ?? token.sub ?? "";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        (session.user as { id?: string }).id =
          (token.id as string | undefined) ?? (token.sub as string | undefined);
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
