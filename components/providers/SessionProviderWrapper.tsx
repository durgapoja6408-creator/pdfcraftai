"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

/**
 * Client wrapper around NextAuth's `<SessionProvider>`.
 *
 * We pre-resolve the session on the server (in app/layout.tsx via the
 * NextAuth v5 `auth()` helper) and pass it in as the `session` prop.
 * That pre-fetch skips the client-side `/api/auth/session` round-trip
 * that SessionProvider otherwise fires on mount — a network request
 * that was costing ~150–300 ms of TBT on every marketing page load
 * (home, pricing, /tools, etc.) even for logged-out visitors, who
 * never needed the session at all.
 *
 * `refetchOnWindowFocus={false}` prevents the same fetch from firing
 * again when the user tabs back to the page. The session is re-fetched
 * when it's about to expire via `refetchInterval` (NextAuth default).
 *
 * `children` still runs as a client subtree (we can't avoid that —
 * TopNav needs `useSession` for the avatar menu), but the first paint
 * already has hydrated session state, so there's no flash-of-logged-out
 * and no extra fetch on the critical path.
 */
export function SessionProviderWrapper({
  children,
  session,
}: {
  children: ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      {children}
    </SessionProvider>
  );
}
