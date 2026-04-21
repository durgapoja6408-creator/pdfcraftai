// /api/admin/margin — read-side surface for the ai_daily_margin rollup
// (Task #22, MASTER_PLAN §7 gate #7).
//
// Life of a request:
//   1. auth()                  → 401 if anonymous.
//   2. isAdminEmail(email)     → 403 if the session email isn't in
//                                the ADMIN_EMAILS allowlist.
//   3. parse ?days= query      → clamped to [1, 90], default 14.
//   4. getAdminMarginSummary() → per-day counts + recent red slices +
//                                current green streak.
//   5. respond JSON.
//
// Auth model:
//   - No new env var is strictly required — the helper defaults the
//     allowlist to the founder's email (`rajasekarjavaee@gmail.com`,
//     per CLAUDE.md §user). Setting ADMIN_EMAILS on Hostinger lets
//     ops add additional admins (comma-separated) without a code
//     change.
//   - We deliberately don't use a shared-secret header here even
//     though the cron route does. The cron runs headlessly; this
//     endpoint backs a human-facing dashboard. A logged-in Google
//     session with email gating is the right model, and it piggy-
//     backs on NextAuth (which is already deployed).
//
// Why force-dynamic + nodejs runtime:
//   - Drizzle + mysql2 are node-only.
//   - The query shape depends on "yesterday UTC" which would be
//     frozen at build time under static rendering. Always live.

import "server-only";

import { auth } from "@/auth";
import {
  clampAdminDays,
  getAdminMarginSummary,
  isAdminEmail,
} from "@/lib/ai/margin-rollup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  // -- 1. Auth ---------------------------------------------------------
  const session = await auth();
  const email =
    session?.user && typeof (session.user as { email?: unknown }).email === "string"
      ? ((session.user as { email: string }).email as string)
      : null;

  if (!email) {
    return json(401, { error: "not_authenticated" });
  }

  // -- 2. Admin allowlist ---------------------------------------------
  if (!isAdminEmail(email, process.env.ADMIN_EMAILS)) {
    // 403, not 404 — we want the UI layer to distinguish "signed in as
    // non-admin" from "unknown endpoint" so a future admin-nav can
    // hide the link cleanly. The response body deliberately doesn't
    // echo the rejected email (logs are enough).
    return json(403, { error: "forbidden", detail: "admin only" });
  }

  // -- 3. Parse + clamp `days` ----------------------------------------
  const url = new URL(req.url);
  const days = clampAdminDays(url.searchParams.get("days"));

  // -- 4. Build summary -----------------------------------------------
  try {
    const summary = await getAdminMarginSummary({ days });
    return json(200, summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "rollup_read_failed";
    // Surface the DB error path as 502 — the endpoint itself is fine
    // but an upstream (the DB) refused. Matches the 502 posture on
    // provider errors in the AI routes.
    console.error("[admin-margin] query failed:", err);
    return json(502, { error: "rollup_read_failed", detail: message });
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
