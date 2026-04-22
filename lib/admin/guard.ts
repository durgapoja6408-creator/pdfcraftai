// lib/admin/guard.ts — server-side admin gate for /admin/* pages.
//
// Why a wrapper and not an inline check per page?
// -----------------------------------------------
// 14 admin pages land in Task #18, and every one of them needs the
// identical four-step gate:
//   1. await auth()
//   2. pull session.user.email
//   3. run isAdminEmail(email, process.env.ADMIN_EMAILS)
//   4. notFound() on failure — NEVER redirect, NEVER 403, NEVER reveal
//      "admin area exists".
// Duplicating that in each page invites drift (one page forgetting step
// #3, one page returning 403 instead of 404, etc.) which — for an
// admin surface — is a real security hole. This module centralises
// the gate so every page is a one-liner:
//
//     const { email } = await requireAdmin();
//
// and the only way to bypass the gate is to edit this file, which is
// a much smaller review surface than "every admin route."
//
// Why notFound() and not 403
// --------------------------
// The whole admin surface is invisible to non-admins. A 403 confirms
// the path exists; a 404 does not. This matches the threat-model
// described in docs/roadmap/ADMIN_PAGES_CATALOG.md §Permission model:
// "Non-admin sessions get 404 (not 403 — we do not advertise admin
// surfaces exist)." Same posture the /api/admin/margin route uses for
// the read API.
//
// Why email-only and not session.user.role
// ----------------------------------------
// Task #25 will introduce `admin_users` + role='admin'/'readonly' as
// part of the Phase D audit-log work. Until then, the single source
// of truth is ADMIN_EMAILS (a comma-separated allowlist env var,
// defaulting to the founder's email per margin-rollup.ts's
// parseAdminEmails). Keeping this layer simple means Task #25 can
// swap the source without touching any page.
//
// Why re-export isAdminEmail from here?
// -------------------------------------
// Some callers (e.g. a shared nav component) want to ask "would the
// current email be an admin?" without triggering notFound(). Having
// the pure check re-exported keeps everyone on the same allowlist
// logic — no custom regex copies drifting in component code.

import "server-only";

import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/ai/margin-rollup";

export { isAdminEmail };

/**
 * Admin context handed back to the page after the gate passes.
 *
 * `email` is always non-null (the gate would have tripped otherwise).
 * `userId` may be undefined on very-old sessions that pre-date the
 * auth.config.ts JWT callback; downstream code should handle that
 * rather than assuming it's present.
 */
export type AdminContext = {
  email: string;
  userId: string | undefined;
};

/**
 * Server-side gate. Call at the top of every /admin/* page and
 * /admin/* route handler.
 *
 * On failure (not signed in OR signed in as a non-admin) calls
 * notFound() which renders Next.js's built-in 404. This throws a
 * `NEXT_NOT_FOUND` error under the hood, so downstream code in the
 * caller never runs — no "if (!admin) return null" dance required.
 *
 * On success, returns `{ email, userId }` so the page can e.g.
 * stamp "logged in as {email}" in a shared header or scope a query
 * to their user id.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const session = await auth();
  const user = session?.user as
    | { email?: string | null; id?: string | null }
    | undefined;
  const email = typeof user?.email === "string" ? user.email : null;

  if (!email || !isAdminEmail(email, process.env.ADMIN_EMAILS)) {
    notFound();
  }

  // `notFound()` above throws, so TS still needs the type assertion
  // that email is defined here — reassign to a non-null local.
  const safeEmail = email as string;
  const userId = typeof user?.id === "string" ? user.id : undefined;
  return { email: safeEmail, userId };
}
