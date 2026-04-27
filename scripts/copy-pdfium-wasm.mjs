#!/usr/bin/env node
// scripts/copy-pdfium-wasm.mjs
//
// Prebuild step: copy @hyzyla/pdfium's pdfium.wasm out of node_modules
// into /public/ so it's served as a static asset from our own origin.
//
// Why: the package's default "browser" entry point requires the caller
// to explicitly provide `wasmUrl` (or `wasmBinary`). The CDN/base64
// shortcuts work but: CDN adds a third-party origin (worse caching,
// more network failure surface, plus a CSP allowlist exception); base64
// inflates the JS bundle by ~5 MB. Self-hosting the .wasm is the
// production-correct path.
//
// Same pattern as scripts/copy-pdfjs-worker.mjs.

import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SRC = resolve(ROOT, "node_modules/@hyzyla/pdfium/dist/pdfium.wasm");
const DEST_DIR = resolve(ROOT, "public");
const DEST = resolve(DEST_DIR, "pdfium.wasm");

try {
  const srcStat = statSync(SRC);
  mkdirSync(DEST_DIR, { recursive: true });
  copyFileSync(SRC, DEST);
  const sizeMb = (srcStat.size / 1024 / 1024).toFixed(2);
  console.log(
    `[copy-pdfium-wasm] copied ${SRC} -> ${DEST} (${sizeMb} MB)`,
  );
} catch (err) {
  console.error(`[copy-pdfium-wasm] FAILED: ${err.message}`);
  console.error(`[copy-pdfium-wasm] expected source at: ${SRC}`);
  console.error(
    `[copy-pdfium-wasm] is @hyzyla/pdfium installed? check package.json`,
  );
  process.exit(1);
}
