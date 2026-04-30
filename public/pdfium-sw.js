// public/pdfium-sw.js
//
// M23 (#193, 2026-04-29): single-purpose service worker that caches
// the PDFium WASM file (~4MB at /pdfium.wasm).
//
// Why single-purpose:
//   Service Workers are notorious for the "stale code" outage — a
//   broken SW that aggressively caches HTML/JS/CSS can poison every
//   user's browser for hours. We sidestep that by caching ONLY a
//   single static file: the PDFium WASM. Everything else (HTML, JS,
//   CSS, API responses) goes through the network normally.
//
// Why not just rely on the browser's HTTP cache:
//   The browser cache works fine for users who load tools daily, but
//   it evicts under memory pressure. Mobile Safari evicts aggressively
//   — a user who hasn't visited the site in 24 hours typically has to
//   re-download the 4MB WASM on next visit. SW Cache API persists
//   until explicit clear, so the WASM is "always there" for repeat
//   users. Mobile users on metered data also benefit.
//
// Strategy: cache-first with network fallback. On WASM fetch:
//   1. Look in our cache. If hit, return cached response.
//   2. Otherwise, fetch from network, stash in cache, return.
//   3. If network fails AND nothing in cache, propagate the failure.
//
// Versioning:
//   Cache name includes a version (PDFIUM_CACHE). Bump it whenever
//   the underlying pdfium.wasm changes (the prebuild script copies a
//   new version from @hyzyla/pdfium's npm package). On activate, we
//   delete any cache that doesn't match the current name. This is
//   the standard SW lifecycle pattern; no need for content-hash
//   detection at runtime.
//
// Scope: this SW lives at /pdfium-sw.js so its scope is only "/" —
// but because we filter to JUST the WASM URL in fetch, only that one
// file gets touched. Everything else falls through to the default
// network handling.

// v2 (2026-04-30): URL changed from /pdfium.wasm to /api/pdfium-wasm
// after the static-asset path was found to serve text/plain on
// Hostinger LiteSpeed/Passenger, which broke
// WebAssembly.instantiateStreaming. The route handler at
// app/api/pdfium-wasm/route.ts sets Content-Type: application/wasm
// explicitly. Cache name bumped so existing v1 cache (containing the
// broken text/plain response) is evicted on activate.
const PDFIUM_CACHE = "pdfium-wasm-v2";
const PDFIUM_URL = "/api/pdfium-wasm";

self.addEventListener("install", (event) => {
  // Skip-waiting so a freshly-installed SW activates immediately
  // rather than waiting for all tabs to close. Safe here because we
  // don't intercept HTML/JS/CSS — the worst-case "user gets a
  // stale cached file" can only ever apply to the WASM, which is
  // protected by the cache-name version above.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Delete every cache except the current PDFIUM_CACHE. If the
      // version bumped, this evicts the old WASM bytes.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("pdfium-wasm-") && n !== PDFIUM_CACHE)
          .map((n) => caches.delete(n)),
      );
      // Take control of any already-open tabs (so users on the page
      // when the SW activates start using it without a reload).
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Only handle the PDFium WASM file. Everything else falls through
  // to default network handling (no SW interception).
  if (url.pathname !== PDFIUM_URL) return;
  if (request.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(PDFIUM_CACHE);
      const cached = await cache.match(PDFIUM_URL);
      if (cached) return cached;
      // Not cached — fetch and stash. On network failure, propagate.
      const response = await fetch(request);
      // Only cache successful responses (200). 404 / 5xx shouldn't
      // poison the cache.
      if (response.ok) {
        // Clone before caching — Response bodies are single-use.
        cache.put(PDFIUM_URL, response.clone()).catch(() => {
          // Silent fail on cache.put — caching is opportunistic.
        });
      }
      return response;
    })(),
  );
});
