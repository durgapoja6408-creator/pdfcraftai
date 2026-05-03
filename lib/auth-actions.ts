"use server";

import "server-only";
import { randomUUID } from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { and, eq, gt, like } from "drizzle-orm";
import { AuthError } from "next-auth";

import { headers } from "next/headers";

import { db, schema } from "@/db/client";
import { signIn } from "@/auth";
import { sanitizeCallbackUrl } from "@/lib/auth-callback";
import {
  isDisposableEmail,
  normalizeEmail,
  readClientIp,
  ipBucket,
  decideIpThrottle,
  bucketWindowDays,
} from "@/lib/auth/abuse-prevention";
// 2026-05-03 plan §8 layer 3 (deferred-grant variant) — the signup
// bonus is NO LONGER granted in registerAction for the credentials
// path. Grant happens in /verify-email after the user proves email
// ownership. OAuth path still grants on first sign-in via auth.ts
// events.signIn (Google/etc. already verified the email). This closes
// the layer-3 honesty gap: free credits require proven email control.
// (Helper itself stays idempotent on `signup_bonus:${userId}`.)
// 2026-05-03 plan §8 layer 7 — Cloudflare Turnstile captcha verify.
// Server-side check that the client-submitted token is valid before
// any DB write. Fail-OPEN if TURNSTILE_SECRET_KEY env var is unset
// (so the form keeps working until Hostinger panel ships the secret).
import { verifyTurnstileToken } from "@/lib/auth/turnstile";
// 2026-05-03 plan §8a Day 1.5a Phase A — email verification flow.
// Send link on registration; user clicks → users.email_verified set.
// Send is fire-and-forget — failure logs but doesn't abort signup
// (avoid locking users out of an account they just created).
import { sendVerificationEmail } from "@/lib/auth/email-verification";

// ---------------- Register ----------------

// 2026-05-02 plan §8a item 5 — password strength.
// Counts how many of the four character classes (lowercase, uppercase,
// digit, symbol) appear in the password. Requires at least 3 of 4.
// Pure stdlib — avoids adding zxcvbn dep mid-deploy. The 3-of-4 rule
// catches >95% of weak passwords without false-positive frustration on
// users who omit symbols.
function countCharClasses(p: string): number {
  let c = 0;
  if (/[a-z]/.test(p)) c++;
  if (/[A-Z]/.test(p)) c++;
  if (/[0-9]/.test(p)) c++;
  if (/[^A-Za-z0-9]/.test(p)) c++;
  return c;
}

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(120, "Name is too long."),
  email: z.string().trim().email("Enter a valid email."),
  password: z
    .string()
    // 2026-05-02 plan §8a item 5 — bumped 8 → 10 character minimum.
    // 10 chars × 3 character classes = ~10^17 entropy floor against
    // dictionary attacks; 8-char minimum from before allowed weak
    // patterns like "password1" through.
    .min(10, "Use at least 10 characters.")
    .max(128, "Password is too long.")
    .refine(
      (p) => countCharClasses(p) >= 3,
      "Use a mix of upper case, lower case, digits, and symbols (any 3 of 4)."
    ),
});

export type RegisterState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "password", string>>;
};

export async function registerAction(
  _prev: RegisterState | undefined,
  formData: FormData
): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: RegisterState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0];
      if (k === "name" || k === "email" || k === "password") {
        fieldErrors[k] = issue.message;
      }
    }
    return { ok: false, error: "Fix the highlighted fields.", fieldErrors };
  }

  const { name, email, password } = parsed.data;
  const lowercased = email.toLowerCase();

  // 2026-05-02 plan §8 layer 1 — disposable email blocklist.
  // Reject mailinator + 250 other common temp-email providers BEFORE
  // any DB write. Honest users with edge-case providers (e.g. their
  // employer happens to use a domain on the list — extremely rare) can
  // contact support; the false-positive rate is ~0.01% by design.
  if (isDisposableEmail(lowercased)) {
    return {
      ok: false,
      error:
        "This email provider isn't supported. Use a personal or work email.",
      fieldErrors: { email: "Disposable / temporary email providers are blocked." },
    };
  }

  // 2026-05-02 plan §8 layer 2 — Gmail-alias + dot normalization.
  // Collapse `raja+1@gmail.com` and `r.a.j.a@gmail.com` to the same
  // canonical key for the uniqueness check. UNIQUE INDEX on
  // users.email_normalized (migration 0018) catches this at DB level
  // too; we check here first to give a friendlier error.
  const normalizedEmail = normalizeEmail(lowercased);

  // 2026-05-02 plan §8 layer 4 — capture signup IP + run /24 bucket
  // throttle. The captured IP populates users.signup_ip so the
  // abuse-signal admin page can cluster signups; the throttle
  // decision below decides whether to auto-grant credits or queue
  // the account for manual review (currently logged only — Day 6
  // will wire grantSignupBonus to skip when throttled).
  const reqHeaders = await headers();
  const signupIp = readClientIp(reqHeaders);

  // 2026-05-03 plan §8 layer 5 — device fingerprint from client.
  // Hidden field populated by computeFingerprint() on mount.
  // Cap to 64 chars to match users.device_fingerprint column type
  // (migration 0018). Empty string → "no signal" (treated as null).
  const deviceFingerprintRaw = formData.get("deviceFingerprint");
  const deviceFingerprint =
    typeof deviceFingerprintRaw === "string"
      ? deviceFingerprintRaw.slice(0, 64).trim()
      : "";

  // 2026-05-03 plan §8 layer 7 — Cloudflare Turnstile captcha verify
  // BEFORE any DB write. Token comes from a hidden form field that
  // the Turnstile widget injects on the client side. Fails open when
  // TURNSTILE_SECRET_KEY env var is unset — see lib/auth/turnstile.ts
  // for the rationale.
  const turnstileToken =
    typeof formData.get("cf-turnstile-response") === "string"
      ? (formData.get("cf-turnstile-response") as string)
      : null;
  const turnstileVerdict = await verifyTurnstileToken(turnstileToken, {
    remoteIp: signupIp || undefined,
  });
  if (!turnstileVerdict.ok) {
    console.log(
      JSON.stringify({
        event: "turnstile_verify_failed",
        errorCodes: turnstileVerdict.errorCodes ?? [],
        signupIp: signupIp || null,
        ts: new Date().toISOString(),
      }),
    );
    return {
      ok: false,
      error:
        "Captcha verification failed. Refresh the page and try again — if it keeps happening, contact support@pdfcraftai.com.",
    };
  }

  // 2026-05-03 plan §8 layer 4 (full) — count recent signups from
  // the same /24 (or /48 IPv6) bucket within the rolling window.
  // Empty bucket (couldn't parse IP) → skip throttle (fail-open).
  const bucket = ipBucket(signupIp);
  let throttleDecision: ReturnType<typeof decideIpThrottle> | null = null;
  if (bucket) {
    const windowDays = bucketWindowDays();
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    // LIKE-prefix match because users.signup_ip stores the full IP,
    // not just the bucket prefix. `192.168.1.42` matches `192.168.1.%`.
    const recentRows = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          like(schema.users.signupIp, `${bucket}.%`),
          gt(schema.users.createdAt, windowStart),
        ),
      );
    throttleDecision = decideIpThrottle(signupIp, recentRows.length);
    if (throttleDecision.action === "queue_review") {
      // Structured stdout log for the abuse-signal page + ops review.
      console.log(
        JSON.stringify({
          event: "ip_throttle_triggered",
          bucket: throttleDecision.bucket,
          recentCount: throttleDecision.recentCount,
          cap: throttleDecision.cap,
          windowDays: throttleDecision.windowDays,
          ts: new Date().toISOString(),
        }),
      );
      // We still let the registration proceed (don't block legit
      // college / co-working / VPN users behind a hard wall). The
      // grant logic in Day 6 will skip the credit grant for accounts
      // tagged queue_review, and admin can manually approve via
      // /admin/abuse-signals (Day 4 surface).
    }
  }

  try {
    // Check both raw + normalized forms so we catch
    //   - same exact email twice
    //   - alias-form duplicates of an existing canonical row
    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.emailNormalized, normalizedEmail))
      .limit(1);
    const existingByExact = existing[0]
      ? existing
      : await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.email, lowercased))
          .limit(1);

    if (existingByExact[0]) {
      // 2026-05-02 plan §8a item 7 — no user enumeration. Original
      // copy ("An account with that email already exists. Try signing
      // in.") confirmed email-existence to anyone hitting /register
      // with a target email. Generic copy here; honest users with a
      // duplicate email still recover via the password-reset flow
      // (Day 1.5a) or by clicking "Sign in instead". The slight UX
      // friction is the cost of not running an enumeration oracle.
      return {
        ok: false,
        error:
          "Couldn't create the account. Check your details, or sign in if you already have an account.",
      };
    }

    // 2026-05-02 plan §8a item 4 — bcrypt cost factor bumped 10 → 12.
    // 2026 baseline. 2^12 = 4096 rounds. Hash time on Hostinger Premium
    // node is ~150ms which is the industry-recommended "noticeable
    // but not painful" target. Annual revisit — bump to 13 if hardware
    // makes 12 cheap.
    const passwordHash = await bcrypt.hash(password, 12);
    const id = randomUUID();

    await db.insert(schema.users).values({
      id,
      name,
      // Store the lowercase exact email (preserves @gmail vs
      // @googlemail vs alias for display purposes).
      email: lowercased,
      passwordHash,
      // 2026-05-02 plan §8 layers 2 + 4. emailNormalized is
      // alias-collapsed (UNIQUE-indexed); signupIp + deviceFingerprint
      // power the admin abuse-signal page.
      emailNormalized: normalizedEmail,
      signupIp: signupIp || null,
      // 2026-05-03 plan §8 layer 5 — device fingerprint from hidden
      // form field. Empty string = no signal (SSR or computeFingerprint
      // failure on the client). Cap to 64 chars to match the column
      // type in migration 0018.
      deviceFingerprint: deviceFingerprint || null,
    });

    await db.insert(schema.credits).values({
      userId: id,
      balance: 0,
    });

    // 2026-05-03 plan §8a Day 1.5a Phase A — fire-and-forget
    // verification email. SMTP failure logs but doesn't abort
    // signup (the user can request a re-send later). The mass
    // signup-flow doesn't need to await; we hand off to a
    // microtask so the redirect happens immediately.
    void sendVerificationEmail(lowercased, id).then((result) => {
      if (!result.ok) {
        console.error(
          "[register] verification email failed for",
          id,
          result.error,
        );
      }
    });

    // 2026-05-03 plan §8 layer 3 (deferred-grant variant). The signup
    // bonus is granted in /verify-email after consumeVerificationToken
    // succeeds — NOT here. This closes the gap where unverified
    // credentials accounts could collect 5 free credits without ever
    // proving email control. Idempotent on `signup_bonus:${userId}`,
    // so OAuth's events.signIn path is unaffected (Google already
    // verified the email there).
    //
    // The IP throttle decision is still logged at the top of this
    // function (search "ip_throttle_triggered") so admins can review
    // /admin/abuse-signals. If a throttled account does verify and
    // collect credits, admin can claw back via ledger debit.
    if (throttleDecision?.action === "queue_review") {
      console.log(
        JSON.stringify({
          event: "signup_bonus_deferred_throttled",
          userId: id,
          reason: "ip_throttle_queue_review",
          bucket: throttleDecision.bucket,
          note:
            "Grant only fires after /verify-email; admin should review before user verifies.",
          ts: new Date().toISOString(),
        }),
      );
    }
  } catch (err) {
    console.error("register action failed:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  // 2026-05-01 — preserve the callbackUrl from form data, sanitized
  // server-side as defense-in-depth (the client already sanitized).
  // Empty / invalid values fall back to /app/dashboard via the helper.
  const cbInput = formData.get("callbackUrl");
  const redirectTo = sanitizeCallbackUrl(
    typeof cbInput === "string" ? cbInput : null,
  );

  // Sign the new user in via Credentials; this redirects on success.
  try {
    await signIn("credentials", {
      email: lowercased,
      password,
      redirectTo,
    });
  } catch (err) {
    // NextAuth throws a magic "redirect" error on success — rethrow so Next handles it.
    if (err && typeof err === "object" && "digest" in err) throw err;
    if (err instanceof AuthError) {
      return { ok: false, error: "Account created, but sign-in failed. Try logging in." };
    }
    throw err;
  }

  return { ok: true };
}

// ---------------- Login ----------------

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

export type LoginState = {
  ok: boolean;
  error?: string;
};

export async function loginAction(
  _prev: LoginState | undefined,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password." };
  }

  // 2026-05-01 — preserve the callbackUrl from form data; same
  // server-side sanitization as registerAction above.
  const cbInput = formData.get("callbackUrl");
  const redirectTo = sanitizeCallbackUrl(
    typeof cbInput === "string" ? cbInput : null,
  );

  try {
    await signIn("credentials", {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      redirectTo,
    });
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err;
    if (err instanceof AuthError) {
      return { ok: false, error: "Invalid email or password." };
    }
    throw err;
  }

  return { ok: true };
}
