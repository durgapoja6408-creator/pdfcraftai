// /ads.txt — Authorized Digital Sellers (IAB Tech Lab spec).
//
// Once Google AdSense is approved (gated on domain age + traffic — see
// docs/QA_2026-04-25.md for the AdSense readiness audit), the publisher
// ID is set in Hostinger env vars and this endpoint returns the proper
// ads.txt manifest. Until then it serves an empty-but-valid file so
// crawlers (Google's ads.txt fetcher, ad networks' verification bots)
// get a 200 instead of a 404.
//
// Why an empty file vs no file at all:
//   - A 404 on /ads.txt means "no preferences declared" — fine pre-launch
//     but Google's AdSense crawler logs the 404 in the Search Console
//     ads.txt report, which clutters the dashboard.
//   - A blank 200 means "we have one, it's empty" — silent in dashboards.
//
// Format reference: https://iabtechlab.com/ads-txt/
//
//   <ad-system-domain>, <publisher-id>, <relationship>, <cert-id>
//
// Example AdSense entry once approved:
//   google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0
//
// `pub-XXXXXXXXXXXXXXXX` comes from the AdSense console after approval.
// `DIRECT` because we're the publisher of record, not a reseller.
// `f08c47fec0942fa0` is Google's TAG-ID; the same constant for everyone.

import { NextResponse } from "next/server";

// Force dynamic so env-var changes (when AdSense activates) take effect
// without a redeploy. The endpoint is tiny — there's no caching cost.
export const dynamic = "force-dynamic";

export function GET() {
  const adsense = process.env.GOOGLE_ADSENSE_PUBLISHER_ID?.trim();

  // Empty file pre-AdSense. The header is still text/plain per spec.
  if (!adsense) {
    return new NextResponse("", {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        // Cache for 1 hour client-side; Google's ads.txt crawler
        // refetches roughly daily anyway.
        "cache-control": "public, max-age=3600",
      },
    });
  }

  // Validate publisher ID format: pub- followed by 16 digits.
  // Reject anything malformed instead of serving garbage that would
  // get our domain flagged as "invalid ads.txt".
  if (!/^pub-\d{16}$/.test(adsense)) {
    return new NextResponse(
      `# GOOGLE_ADSENSE_PUBLISHER_ID is set but malformed: must match pub-XXXXXXXXXXXXXXXX (16 digits)\n`,
      {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );
  }

  // Properly-formed AdSense ads.txt entry.
  // f08c47fec0942fa0 is Google's TAG-ID per their published docs.
  const body = `google.com, ${adsense}, DIRECT, f08c47fec0942fa0\n`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
