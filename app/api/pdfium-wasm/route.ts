// app/api/pdfium-wasm/route.ts
//
// Serves the PDFium WASM blob (~3.9MB) with an explicit
// `Content-Type: application/wasm` header so browsers can use
// `WebAssembly.instantiateStreaming(fetch(...))` — that path requires
// the response MIME to be exactly `application/wasm`, otherwise
// modern Chrome/Firefox/WebKit refuse to compile.
//
// Why a route handler instead of just /public/pdfium.wasm:
//   On Hostinger (LiteSpeed + Passenger fronting Next.js), static
//   public/ files come back with `Content-Type: text/plain` regardless
//   of what we put in next.config.mjs `headers()` or in `.htaccess`
//   (`AddType`, `ForceType`, `<FilesMatch>` + `Header always set` were
//   all tried — see docs/STATUS.md WASM-MIME finding 2026-04-30). The
//   LiteSpeed default-mime path doesn't honour the .wasm extension,
//   and Passenger/Node's response Content-Type gets overridden upstream
//   on the static-handler path.
//
//   Routing the WASM through a Next.js API handler bypasses all of
//   that — the response leaves Node with an explicit Content-Type and
//   LiteSpeed forwards it untouched (verified via curl on /api/health).
//
// Strategy:
//   - Read the WASM bytes from disk on first request, cache them in
//     module scope so subsequent requests skip the filesystem hit. The
//     file is ~4MB; holding it in memory is fine for the lifetime of
//     a Node worker (we already retain libraries 10x larger).
//   - Always return application/wasm + a long browser cache header so
//     Cloudflare and the browser HTTP cache do their job. The byte
//     contents are pinned by the npm package version
//     (`@hyzyla/pdfium`), so a 7-day immutable cache is safe; rotating
//     the version triggers a full redeploy, which busts CDN+browser
//     caches via the Cloudflare cache purge plus the SW cache version
//     bump (see public/pdfium-sw.js).
//
// Failure modes:
//   - WASM file missing on disk → return 500 with a short error.
//     This shouldn't happen because scripts/copy-pdfium-wasm.mjs runs
//     in prebuild, but we surface a clear error rather than crashing
//     the worker.

import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
// Force dynamic so Next.js doesn't try to pre-bake this at build time
// (the file isn't in node_modules at the moment Next analyses routes).
export const dynamic = "force-dynamic";

const WASM_PATH = path.join(process.cwd(), "public", "pdfium.wasm");

let cachedBytes: Buffer | null = null;
let cachedAt = 0;

async function loadBytes(): Promise<Buffer> {
  if (cachedBytes) return cachedBytes;
  const bytes = await readFile(WASM_PATH);
  cachedBytes = bytes;
  cachedAt = Date.now();
  return bytes;
}

export async function GET(): Promise<Response> {
  let bytes: Buffer;
  try {
    bytes = await loadBytes();
  } catch (err) {
    const msg =
      err instanceof Error ? err.message.slice(0, 200) : "unknown";
    return new Response(`pdfium.wasm unavailable: ${msg}`, {
      status: 500,
      headers: { "content-type": "text/plain" },
    });
  }

  // Convert Buffer → Uint8Array for a stable Response body type.
  // Node Buffers ARE Uint8Arrays at runtime, but the TypeScript
  // `Response` BodyInit signature prefers Uint8Array / ArrayBuffer.
  const body = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/wasm",
      // 7-day immutable. Bump the SW cache version (public/pdfium-sw.js)
      // when the underlying WASM bytes change so clients pick up the
      // new file even though the URL didn't change.
      "cache-control": "public, max-age=604800, immutable",
      "content-length": String(bytes.byteLength),
      "x-served-by": "pdfium-wasm-route",
      "x-cached-at": String(cachedAt),
    },
  });
}
