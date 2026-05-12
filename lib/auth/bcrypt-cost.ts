// lib/auth/bcrypt-cost.ts
//
// 2026-05-12 — SEV-0 audit fix: bcrypt cost factor was set to 12 at
// signup but only 10 at password change AND password reset. Every
// user who has ever changed or reset their password ended up with a
// weaker hash than the original signup hash.
//
// Root cause: three independent call sites each picked their own
// number. The CI auth-hardening guard only inspected
// lib/auth-actions.ts, so the two weaker sites passed CI untouched.
//
// Fix: one constant, three import sites. The auth-hardening CI guard
// is extended to assert this module is the source of truth and that
// every bcrypt.hash() call in the auth surface uses BCRYPT_COST.
//
// Why 12: bcrypt cost 12 is the 2024+ baseline for production user
// passwords. Cost 10 (the historical Node default) is below current
// OWASP guidance. Cost 14+ adds substantial CPU on every login and
// isn't worth the trade-off for our threat model. 12 is what the
// signup path was already doing; this commit just makes everywhere
// else match.
//
// Migration: existing rows hashed at cost 10 are NOT re-hashed by
// this commit. bcrypt's salt-encodes-cost format means existing
// hashes verify correctly against a lower cost; the upgrade happens
// opportunistically the next time the user sets a password (which
// will now use cost 12). A passive upgrade pass can be added later
// if needed — on successful login, if `hash.startsWith("$2b$10$")`
// or `$2a$10$`, re-hash silently. Not in scope for this commit.

export const BCRYPT_COST = 12;
