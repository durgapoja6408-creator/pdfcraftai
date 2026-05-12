// lib/geo/country-header.ts
//
// 2026-05-12 — extracted from lib/payments/router.ts to satisfy the
// dual-rail-routing CI guard (`app/*/page.tsx` must not import from
// `lib/payments/router`). The header-reading helper isn't payments-
// specific — it's a generic Cloudflare CF-IPCountry getter that
// belongs in a payment-neutral location.
//
// `lib/payments/router.ts` re-exports `readCountryHeader` from here
// so existing import paths inside the payments subsystem still work.
//
// Usage from server components / route handlers:
//   import { headers } from "next/headers";
//   import { readCountryHeader } from "@/lib/geo/country-header";
//   const country = readCountryHeader(headers()); // "IN" / "US" / ...

/**
 * Extract the Cloudflare `CF-IPCountry` header from a Next.js
 * Request-ish headers object. Accepts either a `Headers` instance
 * (server-component / fetch request) or a plain record (older
 * Next.js conventions, testing harnesses).
 *
 * Returns the raw header value (uppercase ISO-2, untrimmed) or null
 * if absent. Caller is responsible for normalising "XX" / "T1" /
 * other non-standard values.
 */
export function readCountryHeader(
  headers: Headers | Record<string, string | string[] | undefined>
): string | null {
  const raw =
    headers instanceof Headers
      ? headers.get("cf-ipcountry")
      : (headers["cf-ipcountry"] ?? headers["CF-IPCountry"]);

  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === "string") return raw;
  return null;
}
