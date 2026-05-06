// lib/orgs/codes.ts — slug + invite-token generation (PENDING §3b
// foundation, 2026-05-05).
//
// Two utilities:
//   1. `slugify(name)` — converts an org name to a URL-safe slug
//      (lowercase, hyphen-separated, alphanumeric only). Used at
//      org creation time to seed the slug column.
//   2. `generateInviteToken()` — random 32-char base36 token for
//      the /invite/<token> URL. Same pattern as referral codes
//      (lib/referrals/codes.ts) but longer + different alphabet
//      (full base36 since invite tokens are pasted into URLs not
//      typed by humans).
//
// What this module does NOT do
// ----------------------------
// - Persist anything. Writers (Phase F) are responsible for the
//   `INSERT ... ON DUPLICATE KEY` retry loop on slug collisions.
// - Validate org names (length, char set, profanity). The slug
//   normalization here is forgiving — strips anything that's not
//   alphanumeric or hyphen — but a name like "💩💩💩" produces an
//   empty slug. Phase F adds a fallback ("org-<random>") for
//   that edge case at the writer level.

/**
 * Allowed slug characters: lowercase a-z, digits, hyphen. The slug
 * is the URL component for /app/org/<slug>/* pages, so we exclude
 * everything that needs URL-encoding or that'd be ambiguous in
 * link text.
 */
const SLUG_CHAR_RE = /[^a-z0-9-]/g;

/**
 * Convert an organization name to a URL-safe slug. Examples:
 *   slugify("Acme Corp")           → "acme-corp"
 *   slugify("  Foo & Bar  ")       → "foo-bar"
 *   slugify("UPPERcase Mix-éd")    → "uppercase-mix-d"
 *   slugify("---")                 → ""   ← caller adds fallback
 *
 * Process:
 *   1. Lowercase
 *   2. Replace whitespace + non-alphanumeric with hyphens
 *   3. Collapse runs of hyphens to a single hyphen
 *   4. Trim leading/trailing hyphens
 *   5. Truncate to 64 chars (matches schema)
 *
 * NOT idempotent on already-slugified input in one specific case:
 *   slugify("foo-bar")  → "foo-bar"  ✓
 *   slugify("foo--bar") → "foo-bar"  ✓
 *
 * Production callers should retry-on-collision via writer logic;
 * this function is pure (no DB calls).
 */
export function slugify(name: string): string {
  if (typeof name !== "string") return "";
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(SLUG_CHAR_RE, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

/**
 * Maximum slug length. Matches the varchar(64) column in
 * migration 0025. Keep in sync if either changes.
 */
export const ORG_SLUG_MAX_LENGTH = 64;

/**
 * Invite token alphabet — full base36 (digits + lowercase letters).
 * Tokens are pasted into URLs, never typed, so we don't need to
 * exclude visually-ambiguous characters (unlike referral codes).
 */
const INVITE_TOKEN_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Invite token length. 32 chars × 36 alphabet = 36^32 ≈ 6.3e49
 * possible tokens — collision is mathematically impossible at any
 * realistic scale. Length is a security choice (at 16 chars, brute
 * forcing the space at 1k req/sec takes 100M years; at 32 chars
 * the same is 10^33 × longer). 32 it is.
 */
export const ORG_INVITE_TOKEN_LENGTH = 32;

/**
 * Generate a random invite token. Pure function — no DB call. The
 * caller's writer (Phase F) wraps `INSERT ... ON DUPLICATE KEY`
 * with retry, but at 6.3e49 namespace size the retry loop is
 * theatrical.
 */
export function generateInviteToken(): string {
  let out = "";
  for (let i = 0; i < ORG_INVITE_TOKEN_LENGTH; i++) {
    const idx = Math.floor(Math.random() * INVITE_TOKEN_ALPHABET.length);
    out += INVITE_TOKEN_ALPHABET[idx];
  }
  return out;
}
