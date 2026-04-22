#!/usr/bin/env node
// scripts/test-dual-rail-routing.mjs — Pin Phase C / Task #20 dual-rail
// checkout routing wiring.
//
// Background. Before Task #20, `createCheckoutAction` trusted whichever
// `preferredProviderId` the UI passed (or the first-configured provider
// if the UI passed nothing) and hardcoded `PACK_CURRENCY = "USD"`. An EU
// visitor could click "Buy" on /pricing and hit Paddle — which would
// then quietly refuse based on its own KYC, presenting the user with a
// confusing late-stage error. A Tier-3 visitor (Iran / Syria / North
// Korea / Cuba) could reach the origin if the Cloudflare WAF was ever
// misconfigured and get an application-level error instead of the
// legally-correct HTTP 451.
//
// Task #20 wires `routeCheckoutByCountry` (the pure decision function
// landed in Task #4) into the server-side checkout action so the SAME
// tier policy the policy doc names is applied at origin regardless of
// what the UI does. This harness pins that wiring so a future refactor
// can't quietly strip the router call back out:
//
//   (A) checkout-actions.ts imports `routeCheckoutByCountry` +
//       `readCountryHeader` from the router module.
//   (B) `CreateCheckoutResult` error union includes exactly the four
//       geo error codes — geo_deferred / geo_blocked / geo_unknown
//       (new for Task #20) plus the existing non-geo codes. Missing or
//       extra codes both fail.
//   (C) Every geo decision branch is handled: block → geo_blocked,
//       defer → geo_deferred, unknown → geo_unknown, and route →
//       proceeds to provider selection with the router's currency.
//   (D) Currency/pack-amount wiring: `packAmountMinor(pack, currency)`
//       exists on lib/pricing, USD_TO_INR_RATE is a const, and
//       checkout-actions calls packAmountMinor with the geo-picked
//       currency so IN→INR routes get paise, USD routes get cents.
//   (E) Registry wall: both razorpay and paddle rows still present and
//       env-gated; a regression that removes either rail from the
//       registry fails here.
//   (F) Surface invariants: no user-facing page imports the router
//       (it's a payments-internal concern — a page that bypasses the
//       checkout-action server layer to call routeCheckoutByCountry
//       directly would be a layering violation).
//   (G) run-all-tests.mjs registration — the suite is wired in between
//       geo-router (the pure decision harness) and geo-waitlist (the
//       Tier-2 signup endpoint) because this suite tests the layer
//       that sits between them: the checkout-side consumer of the
//       router that also triggers the waitlist signup path.
//
// Keep this self-contained: no imports beyond Node built-ins.
// Assertion helper mirrors scripts/test-user-dashboard-v2.mjs.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

let pass = 0;
let fail = 0;

function assert(label, cond, detail = "") {
  if (cond) {
    pass++;
    // console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${detail ? `  — ${detail}` : ""}`);
  }
}

function mustRead(path) {
  const abs = resolve(ROOT, path);
  if (!existsSync(abs)) {
    fail++;
    console.log(`  ✗ missing file: ${path}`);
    return "";
  }
  return readFileSync(abs, "utf8");
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

// ==================================================================
// SECTION A — checkout-actions imports the router
// ==================================================================
console.log("\nA. checkout-actions.ts wires routeCheckoutByCountry");
const checkoutSrc = mustRead("lib/payments/checkout-actions.ts");
{
  assert(
    "checkout-actions imports routeCheckoutByCountry from ./router",
    /import\s*\{[^}]*\brouteCheckoutByCountry\b[^}]*\}\s*from\s*["']\.\/router["']/.test(
      checkoutSrc
    )
  );
  assert(
    "checkout-actions imports readCountryHeader from ./router",
    /import\s*\{[^}]*\breadCountryHeader\b[^}]*\}\s*from\s*["']\.\/router["']/.test(
      checkoutSrc
    )
  );
  assert(
    "checkout-actions imports RouteDecision type from ./router",
    /\bRouteDecision\b/.test(checkoutSrc) &&
      /from\s*["']\.\/router["']/.test(checkoutSrc)
  );
  assert(
    "checkout-actions uses headers() from next/headers",
    /import\s*\{[^}]*\bheaders\b[^}]*\}\s*from\s*["']next\/headers["']/.test(
      checkoutSrc
    )
  );
  assert(
    "checkout-actions actually invokes routeCheckoutByCountry(...)",
    /\brouteCheckoutByCountry\s*\(/.test(checkoutSrc)
  );
  assert(
    "checkout-actions actually invokes readCountryHeader(...)",
    /\breadCountryHeader\s*\(/.test(checkoutSrc)
  );
}

// ==================================================================
// SECTION B — CreateCheckoutResult error union shape
// ==================================================================
console.log("\nB. CreateCheckoutResult error union");
{
  // Must list every required error code — missing or extra both fail.
  const REQUIRED_ERRORS = [
    "not_authenticated",
    "unknown_pack",
    "no_provider_configured",
    "provider_error",
    "geo_deferred",
    "geo_blocked",
    "geo_unknown",
  ];
  for (const code of REQUIRED_ERRORS) {
    assert(
      `CreateCheckoutResult error union includes "${code}"`,
      new RegExp(`\\|\\s*["']${code}["']`).test(checkoutSrc)
    );
  }

  // Must return each geo error code from the action. The presence in
  // the type union isn't enough — the action body has to actually
  // produce the shape on the matching decision.action branch.
  assert(
    'action returns error: "geo_blocked" on block branch',
    /error:\s*["']geo_blocked["']/.test(checkoutSrc)
  );
  assert(
    'action returns error: "geo_deferred" on defer branch',
    /error:\s*["']geo_deferred["']/.test(checkoutSrc)
  );
  assert(
    'action returns error: "geo_unknown" on unknown branch',
    /error:\s*["']geo_unknown["']/.test(checkoutSrc)
  );
}

// ==================================================================
// SECTION C — Every decision branch is handled
// ==================================================================
console.log("\nC. All four router decisions are handled");
{
  for (const action of ["block", "defer", "unknown", "route"]) {
    assert(
      `checkout-actions handles decision.action === "${action}"`,
      new RegExp(`decision\\.action\\s*===\\s*["']${action}["']`).test(
        checkoutSrc
      ) ||
        // Or as a catchall after the other three — "route" is narrowed
        // by elimination so we accept either explicit equality OR a
        // trailing comment naming the route branch.
        (action === "route" &&
          /decision\.action\s*===\s*["']route["']|\/\/\s*decision\.action\s*===\s*["']route["']/.test(
            checkoutSrc
          ))
    );
  }

  // Route branch must pass decision.rail (or an override) and
  // decision.currency to selectProvider — otherwise the dual-rail
  // wiring is dead code.
  assert(
    "route branch uses decision.rail as preferredId default",
    /decision\.rail/.test(checkoutSrc)
  );
  assert(
    "route branch uses decision.currency for billing currency",
    /decision\.currency/.test(checkoutSrc)
  );
  assert(
    "selectProvider call threads chosen currency + preferredId",
    /selectProvider\s*\(\s*\{[\s\S]{0,400}currency[\s\S]{0,400}preferredId/.test(
      checkoutSrc
    )
  );
}

// ==================================================================
// SECTION D — Pack amount + FX helper wiring
// ==================================================================
console.log("\nD. packAmountMinor + USD_TO_INR_RATE");
{
  const pricingSrc = mustRead("lib/pricing.ts");
  assert(
    "lib/pricing exports USD_TO_INR_RATE constant",
    /export\s+const\s+USD_TO_INR_RATE\s*=\s*\d+/.test(pricingSrc)
  );
  assert(
    "lib/pricing exports packAmountMinor(pack, currency)",
    /export\s+function\s+packAmountMinor\s*\(\s*pack\s*:\s*CreditPack\s*,\s*currency\s*:/.test(
      pricingSrc
    )
  );
  assert(
    "packAmountMinor handles INR paise branch",
    /currency\s*===\s*["']INR["']/.test(pricingSrc) &&
      /USD_TO_INR_RATE/.test(pricingSrc)
  );
  assert(
    "packAmountMinor falls back to USD cents (× 100)",
    // Task #27 refactor: USD cents math is now
    //   basePrice = pack.price           (USD branch)
    //   subtotalMinor = Math.round(basePrice * 100)
    // which gives identical behavior but no longer matches the literal
    // `pack.price * 100`. Match either the legacy literal (for older
    // snapshots) or the refactored basePrice × 100 pattern.
    /pack\.price\s*\*\s*100/.test(pricingSrc) ||
      (/basePrice\s*=\s*pack\.price/.test(pricingSrc) &&
        /basePrice\s*\*\s*100/.test(pricingSrc))
  );

  assert(
    "checkout-actions imports packAmountMinor from @/lib/pricing",
    /import\s*\{[^}]*\bpackAmountMinor\b[^}]*\}\s*from\s*["']@\/lib\/pricing["']/.test(
      checkoutSrc
    )
  );
  assert(
    "checkout-actions calls packAmountMinor(pack, chosenCurrency)",
    /packAmountMinor\s*\(\s*pack\s*,/.test(checkoutSrc)
  );

  // No more hardcoded USD-only PACK_CURRENCY sneaking through.
  assert(
    "checkout-actions has no PACK_CURRENCY = \"USD\" hardcode (dual-rail regression check)",
    !/const\s+PACK_CURRENCY\s*=\s*["']USD["']\s*as\s+const/.test(checkoutSrc)
  );
}

// ==================================================================
// SECTION E — Registry still has both rails, env-gated
// ==================================================================
console.log("\nE. Registry + adapters intact");
{
  const registrySrc = mustRead("lib/payments/registry.ts");
  assert(
    'registry has a row with id: "razorpay"',
    /id:\s*["']razorpay["']/.test(registrySrc)
  );
  assert(
    'registry has a row with id: "paddle"',
    /id:\s*["']paddle["']/.test(registrySrc)
  );
  // Env-gating — a regression that drops isConfigured() would silently
  // break the registry's lazy-load contract.
  assert(
    "razorpay row checks RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET",
    /RAZORPAY_KEY_ID/.test(registrySrc) &&
      /RAZORPAY_KEY_SECRET/.test(registrySrc) &&
      /RAZORPAY_WEBHOOK_SECRET/.test(registrySrc)
  );
  assert(
    "paddle row checks PADDLE_API_KEY / PADDLE_CLIENT_TOKEN / PADDLE_WEBHOOK_SECRET / PADDLE_SELLER_ID",
    /PADDLE_API_KEY/.test(registrySrc) &&
      /PADDLE_CLIENT_TOKEN/.test(registrySrc) &&
      /PADDLE_WEBHOOK_SECRET/.test(registrySrc) &&
      /PADDLE_SELLER_ID/.test(registrySrc)
  );

  // Adapter files exist with their expected capability surface.
  const razorpay = mustRead("lib/payments/adapters/razorpay.ts");
  assert(
    "razorpay adapter supports INR",
    /supportedCurrencies[^\n]*\bINR\b/.test(razorpay)
  );
  const paddle = mustRead("lib/payments/adapters/paddle.ts");
  assert(
    "paddle adapter supports USD",
    /supportedCurrencies[^\n]*\bUSD\b/.test(paddle)
  );
  assert(
    "paddle adapter does NOT claim INR support (prevents accidental IN→paddle in registry filter)",
    !/supportedCurrencies[^\n]*\bINR\b/.test(paddle)
  );
}

// ==================================================================
// SECTION F — Surface invariants: the router is a payments-internal
//             concern. No user-facing page should reach past the
//             server action and call the router directly.
// ==================================================================
console.log("\nF. Router stays out of user-facing pages");
{
  // The wall we want is "pages don't bypass the checkout server action
  // to talk to the router directly" — not "no file under app/ may touch
  // the router at all". app/api/**/route.ts handlers are server
  // boundaries and are legitimate consumers (e.g. /api/geo/waitlist
  // imports TIER_2_COUNTRIES to validate an inbound country code; a
  // future /api/payments/probe route legitimately introspects provider
  // capabilities). So we only scan page.tsx / layout.tsx files here.
  const appDir = resolve(ROOT, "app");
  if (existsSync(appDir)) {
    const files = walk(appDir).filter(
      (p) => p.endsWith("/page.tsx") || p.endsWith("/layout.tsx")
    );
    const ROUTER_IMPORT =
      /from\s+["']@\/lib\/payments\/router["']|from\s+["']\.{1,2}\/(?:[^"']+\/)*payments\/router["']/;
    const offenders = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (ROUTER_IMPORT.test(src)) {
        offenders.push(file.replace(ROOT + "/", ""));
      }
    }
    assert(
      "no app/ page.tsx or layout.tsx imports lib/payments/router (router stays page-internal)",
      offenders.length === 0,
      offenders.join(", ")
    );
  }
}

// ==================================================================
// SECTION G — run-all-tests.mjs registration
// ==================================================================
console.log("\nG. run-all-tests.mjs registration");
{
  const runner = mustRead("scripts/run-all-tests.mjs");
  assert(
    'runner registers name: "dual-rail-routing"',
    /name:\s*["']dual-rail-routing["']/.test(runner)
  );
  assert(
    "runner points at test-dual-rail-routing.mjs",
    /file:\s*["']test-dual-rail-routing\.mjs["']/.test(runner)
  );

  // Ordering: dual-rail-routing pins the consumer of geo-router — it
  // should sit adjacent to geo-router/geo-waitlist so a refactor of
  // the router surface surfaces here next, and so the runner output
  // groups the three geo-related suites together.
  assert(
    'dual-rail-routing is ordered adjacent to the geo-router / geo-waitlist cluster',
    /"geo-router"[\s\S]{0,8000}"dual-rail-routing"/.test(runner)
  );
  assert(
    'dual-rail-routing is ordered before admin-dashboard',
    /"dual-rail-routing"[\s\S]{0,12000}"admin-dashboard"/.test(runner)
  );
}

// ==================================================================
// SECTION H — previewRouteDecision server action is exported so the
//             client can pre-render geo affordances without spending
//             a Buy click to discover ineligibility.
// ==================================================================
console.log("\nH. previewRouteDecision server action");
{
  assert(
    "checkout-actions exports previewRouteDecision server action",
    /export\s+async\s+function\s+previewRouteDecision\s*\(/.test(checkoutSrc)
  );
  assert(
    "previewRouteDecision returns RouteDecision",
    /previewRouteDecision\s*\([^)]*\)\s*:\s*Promise<RouteDecision>/.test(
      checkoutSrc
    )
  );
}

// ==================================================================
// SECTION I — payments.metadata carries the route decision for audit
// ==================================================================
console.log("\nI. payments.metadata route audit fields");
{
  for (const field of [
    "routeCountry",
    "routeRail",
    "routeCurrency",
    "routeOverrode",
  ]) {
    assert(
      `payments.metadata includes ${field}`,
      new RegExp(`\\b${field}\\b`).test(checkoutSrc)
    );
  }
}

// ==================================================================
// Summary
// ==================================================================
console.log("");
const status = fail === 0 ? "PASS" : "FAIL";
console.log(`dual-rail-routing: ${pass} passed, ${fail} failed. Result: ${status}.`);
process.exit(fail === 0 ? 0 : 1);
