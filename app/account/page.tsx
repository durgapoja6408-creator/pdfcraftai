import type { Metadata } from "next";
import { redirect } from "next/navigation";

/**
 * `/account` is a permanent alias for the real settings page at
 * `/app/settings`. We keep this route because public links (pricing page
 * "Configure BYOK" CTA, external emails, marketing collateral) still
 * point at `/account` — shipping a redirect lets those links keep
 * working without duplicating the settings UI.
 *
 * The target is auth-gated: `/app/settings` itself redirects to /login
 * for unauthenticated visitors, which gives us the correct behaviour
 * (signed-in users land on settings, signed-out users land on login).
 *
 * `dynamic = "force-dynamic"` bypasses the static prerender cache — with
 * `force-static`, Cloudflare's year-long `s-maxage` was caching a 307 that
 * arrived without the `Location` header, so direct hits + crawlers saw a
 * dangling redirect. Same fix we landed on `/signup → /register` in
 * task #71 (SEV-2 in docs/E2E_SMOKE_2026-04-20.md).
 */

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AccountAliasPage() {
  redirect("/app/settings");
}
