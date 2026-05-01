// 2026-05-01 — Auth callback URL sanitizer.
//
// Why this file exists:
//
// Until today, the auth flow had a sitewide bug: every layer of the
// "send the user back where they came from after sign-in" plumbing
// hardcoded /app/dashboard.
//
//   • LoginForm.tsx:69    →  signIn("google", { callbackUrl: "/app/dashboard" })
//   • RegisterForm.tsx:46 →  signIn("google", { callbackUrl: "/app/dashboard" })
//   • loginAction / registerAction →  redirectTo: "/app/dashboard"
//   • app/app/*/page.tsx (11 sites) → redirect("/login")  (no callback)
//
// Result: any user who clicked "Sign in to run" on an AI tool runner,
// or hit /app/chat / /app/files / etc. while anonymous, would sign in
// and land on /app/dashboard regardless of where they intended to go.
// 50+ AI tool runners had a callback param being silently dropped, a
// quietly damaging conversion problem across the whole AI suite.
//
// This module is the single source of truth for callback URL
// validation. Used by:
//
//   • LoginForm + RegisterForm — read `?callbackUrl=` from URL,
//     sanitize, pass to signIn() and to the credentials action via
//     a hidden form field
//   • loginAction + registerAction — read sanitized callbackUrl from
//     form data, use as `redirectTo` on signIn("credentials", ...)
//   • Every app/app/*/page.tsx server-side redirect — wraps the
//     destination path in encodeURIComponent + appends to /login
//
// SECURITY: open-redirect prevention is the whole point of the sanitizer.
//
// Threat model: an attacker crafts a URL like
//   https://pdfcraftai.com/login?callbackUrl=https://evil.com/phish
// and tricks a user into following the link. After sign-in, the user
// gets redirected to evil.com still carrying their just-issued auth
// cookies and any session-bound CSRF tokens. Classic phishing escalation.
//
// Mitigation: only accept callbacks that:
//   1. Are non-empty strings
//   2. Start with a single "/" (relative path on our origin)
//   3. Don't start with "//" (schema-relative — would resolve to a
//      different origin like //evil.com/phish)
//   4. Don't contain ":" before the first "/" (would be parsed as a
//      protocol like javascript: or data:)
//   5. Don't start with "/api/" (don't redirect users to API routes
//      that aren't meant to be browser destinations)
//   6. Are under 512 chars (no DOS via huge URLs)
//
// Anything failing these checks falls back to DEFAULT_CALLBACK.
//
// We deliberately DON'T allow same-origin absolute URLs
// (https://pdfcraftai.com/foo) because that buys nothing — relative
// paths cover every legitimate use case and the absolute-URL surface
// is exactly the surface that bypasses the open-redirect check in
// most reported NextAuth CVEs.

export const DEFAULT_CALLBACK = "/app/dashboard";

const MAX_CALLBACK_LENGTH = 512;

/**
 * Validate a callback URL and return either the validated URL or the
 * default. NEVER throws. NEVER returns null/undefined — always returns
 * a usable redirect destination so callers don't need null checks.
 *
 * Accepts: a same-origin relative path like "/app/chat" or
 *   "/tool/ai-summarize?file=abc" or "/app/chat/some-id".
 *
 * Rejects (silently falls back to DEFAULT_CALLBACK):
 *   • undefined / null / empty string
 *   • Schema-relative URLs ("//evil.com")
 *   • Protocol-prefixed URLs ("javascript:", "data:", "https://...")
 *   • API routes ("/api/...")
 *   • Strings over 512 chars
 *   • Anything that doesn't start with a single "/"
 */
export function sanitizeCallbackUrl(
  url: string | null | undefined,
): string {
  if (!url || typeof url !== "string") return DEFAULT_CALLBACK;
  if (url.length === 0 || url.length > MAX_CALLBACK_LENGTH) {
    return DEFAULT_CALLBACK;
  }

  // Must start with exactly one slash. Schema-relative URLs ("//evil.com")
  // resolve to a different origin in browsers, so they're rejected.
  if (!url.startsWith("/")) return DEFAULT_CALLBACK;
  if (url.startsWith("//")) return DEFAULT_CALLBACK;

  // Protocol prefix detection: "javascript:" / "data:" / "vbscript:" /
  // "file:" — these never start with "/" so the previous check covers
  // them, BUT we double-check for ":" anywhere before the first "/"
  // to be defense-in-depth against URL parser quirks.
  const colonIdx = url.indexOf(":");
  if (colonIdx >= 0 && colonIdx < url.indexOf("/", 1)) {
    return DEFAULT_CALLBACK;
  }

  // API routes aren't legitimate browser destinations; redirecting a
  // user to /api/health after sign-in is at best confusing, at worst
  // exposes JSON to the user who expected a page.
  if (url.startsWith("/api/")) return DEFAULT_CALLBACK;

  // /login and /register are also bad destinations — they'd just
  // bounce the user through auth again. Detect the leading-slash
  // exact match (don't match /loginish or /registerify etc.).
  if (url === "/login" || url.startsWith("/login?")) return DEFAULT_CALLBACK;
  if (url === "/register" || url.startsWith("/register?")) return DEFAULT_CALLBACK;

  return url;
}

/**
 * Build a /login URL with a sanitized callback parameter. Used by
 * server-side redirects in app/app/<route>/page.tsx where an anonymous
 * user hits a logged-in page and we want them returned after auth.
 *
 * Returns: "/login?callbackUrl=%2Fapp%2Fchat" (URL-encoded).
 *
 * If destination is invalid, returns plain "/login" (callback omitted)
 * — preserves the existing behaviour for the unsafe path rather than
 * silently routing to the default.
 */
export function buildLoginRedirectUrl(destination: string): string {
  const safe = sanitizeCallbackUrl(destination);
  if (safe === DEFAULT_CALLBACK && destination !== DEFAULT_CALLBACK) {
    // The destination got rejected by the sanitizer. Don't add it.
    return "/login";
  }
  return `/login?callbackUrl=${encodeURIComponent(safe)}`;
}
