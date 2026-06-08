// /api/auth/verify-code — POST handler for the 6-digit OTP path
// (PENDING auth-flow gap #1, 2026-05-06).
//
// Auth: must be signed in. userId pulled from session, NEVER from
// body — anti-impersonation. The code-only path (no session) was
// considered + rejected: it widens the brute-force surface from
// 1M codes-per-user to 1M codes-across-all-users. Requiring a
// session means the attacker needs (valid creds OR session
// hijack) AND the code, which is materially harder.
//
// Throttle: per-user via verification_codes.attempts +
// locked_until columns. 5 misses → 15-min lockout. Lockout takes
// precedence over even otherwise-valid codes (defends against
// attempt-burst races).
//
// On success: deletes code row + sets users.email_verified +
// fires the deferred signup-bonus grant + the referred-user
// referral reward. Same exact side-effects as the magic-link
// /verify-email page so the two paths are honestly equivalent.

import { auth } from "@/auth";
import { consumeVerificationCode } from "@/lib/auth/email-verification";
import { sendWelcomeEmail } from "@/lib/email/transactional";
import { grantSignupBonus } from "@/lib/payments/signup-bonus";
import { triggerReferredReward } from "@/lib/referrals/rewards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(status: number, body: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (typeof userId !== "string") {
    return json(401, { error: "not_authenticated" });
  }

  let body: { code?: unknown };
  try {
    body = (await req.json()) as { code?: unknown };
  } catch {
    return json(400, { error: "invalid_body" });
  }
  const code = typeof body?.code === "string" ? body.code : "";

  const result = await consumeVerificationCode(userId, code);
  if (!result.ok) {
    if (result.reason === "locked_out") {
      return json(
        429,
        {
          error: "locked_out",
          retryAfterSeconds: result.retryAfterSeconds,
          detail:
            "Too many wrong codes. Wait 15 minutes, then request a new code.",
        },
        { "Retry-After": String(result.retryAfterSeconds) },
      );
    }
    if (result.reason === "expired") {
      return json(410, {
        error: "expired",
        detail: "Code expired. Request a new one and try again.",
      });
    }
    if (result.reason === "no_active_code") {
      return json(404, {
        error: "no_active_code",
        detail:
          "No active verification code. Click 'Resend verification email' to get a fresh code.",
      });
    }
    // invalid (wrong code, wrong shape) — generic error to avoid
    // leaking which dimension was wrong (no code-existence oracle)
    return json(400, {
      error: "invalid",
      detail: "That code didn't match. Check the email and try again.",
    });
  }

  // Hit. Same post-verify side effects as /verify-email page:
  //   1. Signup bonus grant (idempotent on signup_bonus:${userId})
  //   2. Referred-user referral reward (idempotent on referral row)
  // Wrapped in try/catch so a transient grant failure doesn't
  // cause the user to retry the now-consumed code (which would
  // 404 because the row was already deleted).
  let grantOutcome: { credits: number; expiresAt: string } | null = null;
  try {
    const grant = await grantSignupBonus(result.userId);
    if (grant.granted) {
      grantOutcome = {
        credits: grant.credits,
        expiresAt: grant.expiresAt.toISOString(),
      };
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "verify_code_grant_failed",
        userId: result.userId,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }),
    );
  }
  try {
    await triggerReferredReward(result.userId);
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "verify_code_referral_grant_failed",
        userId: result.userId,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }),
    );
  }

  // Welcome email — fire ONCE on the genuine NULL→verified transition
  // (consumeVerificationCode reports firstVerification). Swallow-on-
  // failure; sendWelcomeEmail is itself fail-soft.
  if (result.firstVerification) {
    try {
      await sendWelcomeEmail(result.userId);
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "verify_code_welcome_failed",
          userId: result.userId,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        }),
      );
    }
  }

  return json(200, {
    ok: true,
    grantOutcome,
  });
}
