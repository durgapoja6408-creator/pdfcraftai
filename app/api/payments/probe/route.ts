// Payments probe — public, read-only diagnostic endpoint.
//
// What it returns: the current provider registry state — which adapters
// are configured (env vars set), what capabilities + currencies they
// advertise, and which provider IDs the codebase ships with regardless
// of configuration.
//
// Why it exists:
//   1. Post-deploy verification. After updating env vars in hPanel, hit
//      this to confirm the new values propagated to the runtime — no
//      SSH, no `tr "\0" "\n" < /proc/<pid>/environ` tricks. Example:
//        curl -s https://pdfcraftai.com/api/payments/probe | jq
//   2. Cloudflare origin-health-check extension. Same pattern as
//      /api/health's `commit` field, but tracking the payments layer
//      (e.g. Razorpay secrets getting wiped by an errant redeploy would
//      flip `configuredIds` from `["razorpay"]` to `[]`).
//   3. Future admin dashboard — one fetch tells us what's live.
//
// What it does NOT do:
//   - Attempt any real provider API call (that's the job of
//     /api/payments/order on the happy-path test flow).
//   - Leak env var values, key fragments, or webhook secrets. The
//     response body contains only metadata the adapter itself exposes
//     via its `PaymentProvider` interface (displayName, capabilities,
//     supportedCurrencies) — all of which is inferable from the CSP
//     allowlist anyway, so this endpoint adds no new recon signal.
//
// Auth posture:
//   Public GET. The response is safe to expose because it carries
//   metadata only — no user data, no secrets, no PII. Matches the
//   /api/health precedent.
//
// Cache posture:
//   `cache-control: no-store` so Cloudflare never serves a stale snapshot
//   after an env-var change + redeploy. Same pattern as /api/health.

import { NextResponse } from "next/server";
import {
  listConfiguredProviders,
  listConfiguredProviderIds,
} from "@/lib/payments/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProbeProvider = {
  id: string;
  displayName: string;
  capabilities: {
    oneTime: boolean;
    subscriptions: boolean;
    refunds: boolean;
    partialRefunds: boolean;
    webhooks: boolean;
  };
  supportedCurrencies: string[];
};

type ProbeOk = {
  ok: true;
  configuredIds: string[];
  providers: ProbeProvider[];
  ts: string;
};

type ProbeErr = {
  ok: false;
  error: string;
  configuredIds: string[];
  ts: string;
};

export async function GET(): Promise<Response> {
  const ts = new Date().toISOString();
  const configuredIds = listConfiguredProviderIds();

  // If no provider is configured, short-circuit. This is expected in
  // pre-launch sandboxes and surfaces as a clean 200 with `providers: []`
  // rather than a 503 — the app is healthy, it just has no processor
  // wired yet.
  if (configuredIds.length === 0) {
    const body: ProbeOk = {
      ok: true,
      configuredIds: [],
      providers: [],
      ts,
    };
    return NextResponse.json(body, {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate",
        "x-probe-service": "payments",
      },
    });
  }

  try {
    const providers = await listConfiguredProviders();
    const body: ProbeOk = {
      ok: true,
      configuredIds,
      providers: providers.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        capabilities: {
          oneTime: p.capabilities.oneTime,
          subscriptions: p.capabilities.subscriptions,
          refunds: p.capabilities.refunds,
          partialRefunds: p.capabilities.partialRefunds,
          webhooks: p.capabilities.webhooks,
        },
        supportedCurrencies: [...p.supportedCurrencies],
      })),
      ts,
    };
    return NextResponse.json(body, {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate",
        "x-probe-service": "payments",
      },
    });
  } catch (err) {
    // Adapter load threw — surfaces as 503 so external monitoring can
    // alert, but the body is still inspectable. We deliberately don't
    // echo the raw err.message since adapter stack traces can include
    // env-var names / config paths.
    console.error("[payments-probe] adapter load threw:", err);
    const body: ProbeErr = {
      ok: false,
      error: "adapter_load_failed",
      configuredIds,
      ts,
    };
    return NextResponse.json(body, {
      status: 503,
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate",
        "x-probe-service": "payments",
      },
    });
  }
}
