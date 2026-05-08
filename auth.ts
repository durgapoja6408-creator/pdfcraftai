/**
 * NextAuth v5 runtime config. Combines the edge-safe base (auth.config.ts)
 * with Node-only providers and the Drizzle adapter.
 *
 * Exports the standard v5 surface: auth, handlers, signIn, signOut.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { authConfig } from "./auth.config";
import { db, schema } from "./db/client";
import { and, eq, isNull } from "drizzle-orm";
// 2026-05-02 plan §2 path D + §8 layer 6 — signup grant for new
// OAuth users. The helper is idempotent (key = signup_bonus:${userId}),
// so re-firing on subsequent sign-ins is safe. Default OFF until
// SIGNUP_GRANT_ENABLED=true (Day 6 atomic flip).
import { grantSignupBonus } from "@/lib/payments/signup-bonus";
// PENDING §3e Phase E (2026-05-05) — referral attribution wire-up.
// Reads the `pdfcraft_ref` cookie (set on /register?ref=CODE arrival)
// and resolves it to a referrerUserId, then records the attribution.
// All three pieces are flag-gated by isReferralsEnabled(); when off,
// these calls are no-op'd silently.
import { lookupReferralCode } from "@/lib/referrals/codes";
import { recordReferralSignup } from "@/lib/referrals/writers";
import {
  readReferralCookie,
  clearReferralCookie,
} from "@/lib/referrals/cookie";
// 2026-05-03 plan §8a Day 1.5a Phase C — login rate limit.
import { headers } from "next/headers";
import {
  checkLockout,
  recordFailure,
  clearFailures,
} from "@/lib/auth/login-rate-limit";
import {
  normalizeEmail,
  readClientIp,
} from "@/lib/auth/abuse-prevention";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const parsed = credentialsSchema.safeParse(creds);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // 2026-05-03 plan §8a Phase C — rate-limit gate.
        // Normalise email so attacker can't bypass the lockout by
        // varying Gmail aliases. Lockout decision is per email-
        // normalised, not per (email, IP) — IPs rotate; emails don't.
        const lowercased = email.toLowerCase();
        const normalizedEmail = normalizeEmail(lowercased);
        let clientIp = "";
        try {
          const reqHeaders = await headers();
          clientIp = readClientIp(reqHeaders);
        } catch {
          // headers() can throw outside a request context (e.g. some
          // edge cases in test environments). Empty IP is treated as
          // "no signal" by the rate limiter — fail-open.
        }

        const lockout = await checkLockout(normalizedEmail, clientIp);
        if (lockout.locked) {
          // Returning null (the same as a wrong-password failure) keeps
          // the no-user-enumeration semantic — attacker can't tell
          // "locked out" from "wrong password". Lockout still works
          // because it's enforced server-side regardless of attacker
          // visibility into the verdict.
          console.log(
            JSON.stringify({
              event: "credentials_lockout",
              emailNormalized: normalizedEmail,
              ip: clientIp || null,
              failureCount: lockout.failureCount,
              retryAfterSec: lockout.retryAfterSec,
              ts: new Date().toISOString(),
            }),
          );
          return null;
        }

        const rows = await db
          .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            image: schema.users.image,
            passwordHash: schema.users.passwordHash,
          })
          .from(schema.users)
          .where(eq(schema.users.email, lowercased))
          .limit(1);

        const user = rows[0];
        if (!user || !user.passwordHash) {
          // Record failure even when user not found — same response
          // as wrong password, so an enumeration probe can't tell the
          // difference (and we still throttle the probing).
          await recordFailure(normalizedEmail, clientIp);
          return null;
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          await recordFailure(normalizedEmail, clientIp);
          return null;
        }

        // Success — clear all failed attempts for this email so the
        // next legit user doesn't carry old failures forward.
        await clearFailures(normalizedEmail);

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        };
      },
    }),
  ],
  // 2026-05-02 plan §2 path D wire-in (Day 6 prep) — fire signup
  // bonus on the FIRST sign-in for a brand-new user. NextAuth's
  // `events.signIn` fires after the user row is created by the
  // adapter (DrizzleAdapter inserts on Google's first sign-in for
  // a new email). The `isNewUser` flag tells us this is genuinely
  // a fresh account vs an existing user signing in again.
  //
  // Idempotent — grantSignupBonus uses `signup_bonus:${userId}` as
  // its key, so even if isNewUser misfires (it shouldn't, but
  // belt-and-suspenders), the second call is a no-op.
  //
  // SIGNUP_GRANT_ENABLED defaults OFF (helper returns early). Day 6's
  // atomic flip enables it; until then this code path is exercised
  // for type-checking + import safety but credits don't move.
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      const id = user?.id;
      if (typeof id !== "string" || id.length === 0) return;

      // 2026-05-08 — mark Google OAuth users as email-verified.
      //
      // The Phase F-3 verification gate (`assertEmailVerified` in
      // lib/auth/email-verification.ts) checks `users.emailVerified
      // !== null` and throws EmailNotVerifiedError when the gate
      // env flag is on. The Credentials provider sets emailVerified
      // via the OTP flow (lib/auth/email-verification.ts §147).
      // Google OAuth had no equivalent step — DrizzleAdapter inserts
      // the user row but leaves emailVerified NULL, so when the gate
      // flag flips to "on" every Google user gets locked out of every
      // /api/ai/* route.
      //
      // Fix: rely on Google's own `email_verified` claim from the
      // OAuth profile. Google verifies email ownership during the
      // OAuth flow itself — they wouldn't return a token for an
      // unverified email. Treat their signal as authoritative and
      // stamp `emailVerified = NOW()` on first OAuth sign-in for the
      // user.
      //
      // The `IS NULL` filter on the UPDATE is the idempotency
      // guarantee — re-firing on subsequent sign-ins is a no-op
      // because the row's emailVerified is already non-null. Also
      // preserves the original verification timestamp for users who
      // verified via OTP first and later linked Google.
      //
      // Errors are logged but never block sign-in — same rationale
      // as the grantSignupBonus call below: we can't lock the user
      // out of their account over a bookkeeping failure that the
      // gate would catch on the next request anyway.
      if (
        account?.provider === "google" &&
        profile &&
        (profile as { email_verified?: boolean }).email_verified === true
      ) {
        try {
          await db
            .update(schema.users)
            .set({ emailVerified: new Date() })
            .where(
              and(eq(schema.users.id, id), isNull(schema.users.emailVerified)),
            );
        } catch (err) {
          console.error("[oauth] markEmailVerified failed for", id, err);
        }
      }

      if (!isNewUser) return;
      try {
        await grantSignupBonus(id);
      } catch (err) {
        // Don't block sign-in on grant failure — log + continue.
        // Failing the sign-in here would lock the user out of an
        // account they just created.
        console.error("grantSignupBonus failed for", id, err);
      }

      // PENDING §3e Phase E (2026-05-05) — record referral
      // attribution if the user signed up via a `?ref=CODE` link.
      //
      // Three reasons the attribution might no-op:
      //   1. No `pdfcraft_ref` cookie present (organic signup) →
      //      readReferralCookie returns null
      //   2. Cookie value doesn't resolve to a real code →
      //      lookupReferralCode returns null
      //   3. REFERRALS_ENABLED env flag is off → recordReferralSignup
      //      returns null without touching the DB
      //
      // All three paths are silent. Errors are caught + logged but
      // never block sign-in — same rationale as grantSignupBonus
      // above (we can't lock the user out of an account they just
      // created over a referral-credit failure).
      try {
        const refCode = readReferralCookie();
        if (refCode) {
          const codeRow = await lookupReferralCode(refCode);
          if (codeRow && codeRow.userId !== id) {
            await recordReferralSignup({
              referrerUserId: codeRow.userId,
              referredUserId: id,
              code: refCode,
            });
          }
          // Always clear the cookie post-attempt so a re-signin of
          // an existing user doesn't keep retrying. ALSO clears
          // when the code didn't resolve — saves bandwidth +
          // prevents a stale invalid cookie from sitting around.
          clearReferralCookie();
        }
      } catch (err) {
        console.error("referral attribution failed for", id, err);
      }
    },
  },
});
