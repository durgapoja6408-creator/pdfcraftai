-- Migration 0027 — verification_codes table for 6-digit OTP path
-- (PENDING auth-flow gap #1, 2026-05-06).
--
-- Pairs with the existing verification_tokens table (NextAuth magic-
-- link flow). This table backs the alternative "type a 6-digit code"
-- flow for users whose mail client strips the link OR who prefer
-- typing a code over clicking through.
--
-- Throttle design (against 6-digit brute force = 10^6 = 1M combos):
--   - attempts INT counts failed attempts on the active code
--   - locked_until TIMESTAMP set after MAX_ATTEMPTS (5) failures —
--     blocks consume calls for 15 min, after which the row is
--     deleted on the next createVerificationCode call.
--
-- Hash strategy:
--   code_hash = SHA-256(code + ":" + userId). Salting with userId
--   means a DB leak doesn't let an attacker rainbow-table all 1M
--   possible 6-digit codes — they'd need to know the userId AND
--   compute hashes per-user. Trivial DB leak still requires N×1M
--   hash ops where N is user count.
--
-- TTL: 15 minutes. Industry standard for OTP. Shorter than the
-- magic-link 24h because codes are weaker against shoulder-surfing
-- (visible in email preview) than one-click links.

CREATE TABLE verification_codes (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  code_hash VARCHAR(128) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMP(3) NULL DEFAULT NULL,
  expires TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY verification_codes_user_id_unique (user_id),
  INDEX verification_codes_expires_idx (expires)
);
