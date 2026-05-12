import { NextResponse } from "next/server";
import { z } from "zod";
import { mintPasswordResetToken } from "@/lib/password-reset";
// 2026-05-03 plan §8a Day 1.5a Phase B — actual email send.
// Uses Hostinger SMTP via nodemailer (lib/auth/smtp.ts).
import { sendEmail } from "@/lib/auth/smtp";

/**
 * Forgot-password endpoint.
 *
 * Anti-enumeration contract: MUST ack identically whether or not the email
 * exists. For valid payloads we always return 200. We still mint a token
 * when the email DOES exist (so the reset URL appears in the server log
 * right now, and so the mail-send in a later commit is a two-line drop-in).
 *
 * When transactional mail is wired:
 *   1. Remove the console.log below.
 *   2. Send the URL via the provider (SendGrid / Postmark / Resend).
 *   3. Leave the 200-on-miss behaviour exactly as-is.
 *
 * Rate limit: one successful mint per email per 60 seconds. Unauthenticated
 * rate limiter, fine for stub traffic. Replace with edge KV before real
 * load (noted in deployment notes).
 */

const schema = z.object({
  email: z.string().email().max(320),
});

// Naïve per-email rate limiter — replace with edge KV before real traffic.
const recent = new Map<string, number>();
const WINDOW_MS = 60_000;

// 2026-05-12 SEV-2 audit fix: when NEXT_PUBLIC_SITE_URL is unset, the
// reset-link origin was derived from `req.url` which Next.js builds
// from the Host header. An attacker controlling the Host header on a
// misconfigured deploy could redirect victims to a phishing origin
// via the reset email. NEXT_PUBLIC_SITE_URL is set in every production
// environment (Hostinger panel + CLAUDE.md); the host-derived fallback
// is now restricted to localhost so dev still works but a misconfigured
// prod fails loudly rather than silently emitting attacker-controlled
// reset links.
function buildResetUrl(req: Request, rawToken: string): string {
  // Prefer the env var set in prod, fall back to the request origin so
  // local dev + preview deploys "just work" without extra config.
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return `${configured}/reset-password/${rawToken}`;

  try {
    const origin = new URL(req.url).origin;
    // Restrict the host-derived fallback to localhost (any port).
    // Production must always have NEXT_PUBLIC_SITE_URL set; if the env
    // var is missing in prod we'd rather emit a relative URL (which
    // breaks the email but doesn't enable phishing) than blindly
    // trust the Host header.
    if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(origin)) {
      return `${origin}/reset-password/${rawToken}`;
    }
    console.warn(
      "[forgot-password] NEXT_PUBLIC_SITE_URL unset and non-localhost host;" +
        " emitting relative URL to avoid Host-header spoof. Set NEXT_PUBLIC_SITE_URL.",
    );
    return `/reset-password/${rawToken}`;
  } catch {
    return `/reset-password/${rawToken}`;
  }
}

export async function POST(req: Request) {
  // 2026-05-12 SEV-1 audit fix: was returning sentence-cased text in
  // the `error` field (`{ error: "Invalid JSON." }`). Standardised
  // to match the canonical shape used by /api/ai/* routes:
  //   { error: "snake_case_code", detail: "Human readable." }
  // Clients (ForgotPasswordForm.tsx) updated to display
  // `body.detail ?? body.error ?? <fallback>` so legacy callers
  // continue to surface the readable string.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", detail: "Invalid JSON." },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_email",
        detail: "Please enter a valid email address.",
      },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const now = Date.now();
  const last = recent.get(email) ?? 0;
  if (now - last < WINDOW_MS) {
    // Still 200 to avoid leaking which addresses are throttled.
    console.warn("[forgot-password] throttled", email);
    return NextResponse.json({ ok: true });
  }
  recent.set(email, now);

  try {
    const minted = await mintPasswordResetToken(email);
    if (minted) {
      const url = buildResetUrl(req, minted.rawToken);

      // 2026-05-03 — send the actual email via Hostinger SMTP.
      // Failure logs but doesn't change the 200 response (anti-
      // enumeration: SMTP-down should look identical to user-not-
      // found). The URL still appears in stdout for ops audit.
      const text = [
        `A password reset was requested for your pdfcraft ai account.`,
        ``,
        `Click the link below to set a new password. The link is valid`,
        `for 1 hour.`,
        ``,
        url,
        ``,
        `If you didn't request a password reset, you can safely ignore`,
        `this message — your password stays unchanged.`,
        ``,
        `— pdfcraft ai`,
        `https://pdfcraftai.com`,
      ].join("\n");

      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5;color:#1a1c24;max-width:540px;margin:40px auto;padding:0 20px}
h1{font-size:22px;margin-bottom:16px}
.btn{display:inline-block;padding:12px 24px;background:#0066ff;color:#fff!important;text-decoration:none;border-radius:8px;font-weight:500;margin:16px 0}
.muted{color:#888;font-size:13px;line-height:1.5}
.link{word-break:break-all;color:#0066ff}
</style></head><body>
<h1>Reset your password</h1>
<p>A password reset was requested for your pdfcraft ai account. Click the button below to set a new password. The link is valid for 1 hour.</p>
<p><a class="btn" href="${url}">Set new password</a></p>
<p class="muted">Or paste this link into your browser:<br><span class="link">${url}</span></p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0">
<p class="muted">If you didn't request a password reset, you can safely ignore this — your password stays unchanged.</p>
<p class="muted">— pdfcraft ai · <a href="https://pdfcraftai.com" style="color:#0066ff">pdfcraftai.com</a></p>
</body></html>`;

      const sendResult = await sendEmail({
        to: email,
        subject: "Reset your pdfcraft ai password",
        text,
        html,
      });

      console.log(
        "[forgot-password] reset URL issued",
        JSON.stringify({
          at: new Date().toISOString(),
          email,
          expiresAt: minted.expiresAt.toISOString(),
          url,
          emailSent: sendResult.ok,
          emailError: sendResult.error,
        }),
      );
    } else {
      // User not found — still ack 200.
      console.log(
        "[forgot-password] no account",
        JSON.stringify({ at: new Date().toISOString(), email }),
      );
    }
  } catch (err) {
    // Log but still 200 — we'd rather obscure failure than surface
    // "this account exists but the DB is broken" to an enumeration probe.
    console.error("[forgot-password] mint failed", err);
  }

  return NextResponse.json({ ok: true });
}
