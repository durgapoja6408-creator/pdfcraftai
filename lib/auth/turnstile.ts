// Cloudflare Turnstile server-side verification (plan §8 layer 7).
//
// What this does
//   POSTs the client-side Turnstile token to Cloudflare's siteverify
//   endpoint along with our secret key. Cloudflare returns a JSON
//   response with `success: true|false` and (optionally) error codes.
//
// Why a small wrapper, not a fetch inline
//   - Single source of truth for the verify URL and the env-var name.
//   - Centralised response parsing so the caller just gets a boolean
//     + an optional error code list (useful for the abuse-signal log).
//   - One place to add a request timeout / retry policy when we want
//     them later. (Not today — Turnstile's verify endpoint is
//     extremely fast; a missed timeout = a free pass for abusers,
//     which is the wrong direction.)
//
// Configuration
//   TURNSTILE_SECRET_KEY — server-only, set in Hostinger panel.
//     If unset, verifyTurnstileToken() returns { ok: true } as a
//     fail-OPEN escape hatch. Reasoning: until the env var is wired
//     in Hostinger, the widget has no client-side site key either,
//     so there's no token to verify. Failing closed would brick
//     the registration form. Once both keys are set in Hostinger,
//     the verify is enforced.
//
// Caller pattern
//
//   const verdict = await verifyTurnstileToken(form.get("cf-turnstile-response"), {
//     remoteIp: signupIp,  // optional but recommended for fraud detection
//   });
//   if (!verdict.ok) {
//     console.log(JSON.stringify({
//       event: "turnstile_failed",
//       errorCodes: verdict.errorCodes,
//       ts: new Date().toISOString(),
//     }));
//     return { ok: false, error: "Captcha verification failed. Please retry." };
//   }

import "server-only";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerdict {
  ok: boolean;
  /**
   * Cloudflare error codes when ok=false. Examples:
   *   - "missing-input-secret" — env var not set (we treat as fail-open)
   *   - "missing-input-response" — client didn't submit a token
   *   - "invalid-input-response" — token expired / forged
   *   - "timeout-or-duplicate" — token already used or stale (>5 min)
   *   - "internal-error" — Cloudflare-side issue
   * See https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
   */
  errorCodes?: string[];
  /** Cloudflare-returned hostname check; useful for cross-domain audits. */
  hostname?: string;
}

export interface VerifyOptions {
  /** Optional client IP (Cloudflare-recommended for better fraud signals). */
  remoteIp?: string;
}

/**
 * Verify a Turnstile token submitted by the client. Returns
 * `{ ok: true }` on success or when no secret is configured (fail-open
 * escape hatch — see file header for rationale).
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  opts: VerifyOptions = {},
): Promise<TurnstileVerdict> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Fail-open: env var not configured. Caller still sees ok=true so
    // the registration form works. Once Hostinger panel ships the
    // secret, this branch stops firing and verification is enforced.
    return { ok: true };
  }

  if (!token || typeof token !== "string" || token.length === 0) {
    return {
      ok: false,
      errorCodes: ["missing-input-response"],
    };
  }

  const body = new URLSearchParams();
  body.append("secret", secret);
  body.append("response", token);
  if (opts.remoteIp) body.append("remoteip", opts.remoteIp);

  let res: Response;
  try {
    res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      // Cloudflare's verify endpoint is in their global anycast network.
      // Reasonable timeout — if their network is down, fail-OPEN to
      // not lock users out of registration. Captcha is one defense
      // layer of seven; missing one verify ≠ wide-open bot farm.
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error("[turnstile] verify request failed:", err);
    // Network failure → fail-open with an error code for ops review.
    return {
      ok: true,
      errorCodes: ["network-error"],
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      errorCodes: [`http-${res.status}`],
    };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, errorCodes: ["bad-json-response"] };
  }

  if (!json || typeof json !== "object") {
    return { ok: false, errorCodes: ["bad-json-shape"] };
  }

  const data = json as {
    success?: boolean;
    "error-codes"?: string[];
    hostname?: string;
  };

  return {
    ok: data.success === true,
    errorCodes: data["error-codes"] ?? undefined,
    hostname: data.hostname,
  };
}
