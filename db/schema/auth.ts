/**
 * NextAuth v5 (@auth/core) Drizzle adapter tables for MySQL.
 *
 * Matches the shape expected by @auth/drizzle-adapter when instantiated with
 * a MySQL driver. Keep column names aligned with the adapter defaults.
 */

import {
  mysqlTable,
  varchar,
  int,
  text,
  timestamp,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// Users — Auth.js requires id, name, email, emailVerified, image.
// We extend with passwordHash (Credentials provider), createdAt, and
// (Phase D / Task #23 PART 2) the buyer-side billing profile: GSTIN +
// billing address columns that feed the invoice renderer when the user
// has opted into a B2B-compliant receipt. All billing_* columns are
// nullable so a B2C buyer who never fills the form gets the
// route.ts-side default of "IN / null / null" and the renderer prints
// a B2C invoice shape. Columns land via 0016_users_billing_profile.sql.
export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    name: varchar("name", { length: 255 }),
    email: varchar("email", { length: 255 }).unique().notNull(),
    emailVerified: timestamp("email_verified", { fsp: 3 }),
    image: varchar("image", { length: 1024 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    // 2026-05-02 plan §8 abuse-stack columns. See migration 0018.
    //   signupIp: Cloudflare cf-connecting-ip at signup time. IPv6-safe
    //     length (45 = IPv6 max). Used by abuse detector for /24-bucket
    //     rate-limit check.
    //   deviceFingerprint: FingerprintJS open-core 64-char hash.
    //     Layer 5 of abuse stack — bot farms running on shared VM
    //     images all produce the same fingerprint.
    //   emailNormalized: Gmail-alias-collapsed + dot-stripped +
    //     lowercased. UNIQUE so `raja+1@gmail.com` and
    //     `r.a.j.a@gmail.com` both rejected as duplicates of `raja@gmail.com`.
    signupIp: varchar("signup_ip", { length: 45 }),
    deviceFingerprint: varchar("device_fingerprint", { length: 64 }),
    emailNormalized: varchar("email_normalized", { length: 254 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    // Billing profile (Task #23 PART 2). See migration 0016.
    gstin: varchar("gstin", { length: 15 }),
    billingName: varchar("billing_name", { length: 255 }),
    billingAddressLine1: varchar("billing_address_line1", { length: 255 }),
    billingAddressLine2: varchar("billing_address_line2", { length: 255 }),
    billingCity: varchar("billing_city", { length: 128 }),
    billingPostalCode: varchar("billing_postal_code", { length: 32 }),
    // ISO-3166 2-letter state code. For India buyers we constrain to
    // INDIAN_STATE_CODES at the server-action layer; for non-India
    // buyers the column stays NULL.
    billingState: varchar("billing_state", { length: 2 }),
    // ISO-3166 alpha-2 country code. NULL = user hasn't filled the
    // form — route.ts falls back to "IN" in that branch, preserving
    // pre-0016 behaviour.
    billingCountry: varchar("billing_country", { length: 2 }),
  },
  (t) => ({
    emailIdx: index("users_email_idx").on(t.email),
    // 2026-05-02 plan §8 — indexes for abuse-signal lookups.
    emailNormalizedUq: uniqueIndex("users_email_normalized_uq").on(t.emailNormalized),
    signupIpIdx: index("users_signup_ip_idx").on(t.signupIp),
    deviceFingerprintIdx: index("users_device_fingerprint_idx").on(t.deviceFingerprint),
  })
);

// Accounts — OAuth / social providers linked to a user.
export const accounts = mysqlTable(
  "accounts",
  {
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: int("expires_at"),
    token_type: varchar("token_type", { length: 64 }),
    scope: varchar("scope", { length: 512 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
    userIdx: index("accounts_user_idx").on(t.userId),
  })
);

// Sessions — only used when the session strategy is "database".
// We use JWT strategy so this table stays empty, but the adapter expects it to exist.
export const sessions = mysqlTable(
  "sessions",
  {
    sessionToken: varchar("session_token", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { fsp: 3 }).notNull(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
  })
);

// Verification tokens — magic-link / email verification.
export const verificationTokens = mysqlTable(
  "verification_tokens",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", { fsp: 3 }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  })
);

// Password reset tokens — single-use, 30-minute TTL, hashed at rest.
//
// Flow:
//   1. /api/auth/forgot-password mints a 32-byte random token, stores its
//      SHA-256 digest in `tokenHash`, and returns the raw token in the
//      reset URL that gets mailed (or logged, until mail is wired).
//   2. /reset-password/[rawToken] looks the row up by the hash of the
//      path param, confirms `consumedAt IS NULL` and `expiresAt > now`.
//   3. /api/auth/reset-password POSTs the raw token + new password;
//      the server re-hashes, matches, writes the new passwordHash,
//      marks `consumedAt` = now (single-use), and invalidates any
//      other outstanding tokens for the same user in the same txn.
//
// Why hash at rest: tokens are bearer credentials — a DB dump that
// leaked raw tokens would hand an attacker every live reset link.
// Storing the SHA-256 is identical in search cost (`WHERE token_hash = ?`)
// but renders a dump useless.
//
// Why not reuse `verificationTokens`: that table is shaped for Auth.js'
// email-provider flow (composite PK on identifier + token, no user FK).
// Password resets want a user FK so we can cascade-delete and enforce
// "one outstanding reset per user at a time" via the index.
export const passwordResetTokens = mysqlTable(
  "password_reset_tokens",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 hex of the raw token (64 chars). Unique so a probe query
    // is a direct index hit, and so we never accidentally insert two
    // rows with the same hash (cryptographically implausible but cheap
    // to enforce).
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { fsp: 3 }).notNull(),
    // Set at redemption time. NULL = unused. Kept (not deleted) so we
    // have an audit trail of which token hash belonged to which reset.
    consumedAt: timestamp("consumed_at", { fsp: 3 }),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("password_reset_tokens_user_idx").on(t.userId),
    expiresIdx: index("password_reset_tokens_expires_idx").on(t.expiresAt),
  })
);
