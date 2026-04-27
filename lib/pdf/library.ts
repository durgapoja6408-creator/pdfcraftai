// lib/pdf/library.ts
//
// Singleton PDFiumLibrary instance. PDFium is Google's PDF engine
// (the one Chrome ships) compiled to WebAssembly via @hyzyla/pdfium.
// We init it lazily on first use, cache it for the page session, and
// reuse across every tool that needs PDF read/render capabilities.
//
// Scope (read-only): @hyzyla/pdfium exposes PDFium's reading +
// rendering APIs only. No save/addPage/removePage. So this library
// powers extract-* and pdf-to-* tools — NOT merge/split/compress
// (those need a writable engine).
//
// Bundle weight: ~3.9 MB WASM. Lazy-loaded — only downloaded when a
// user actually opens one of these tools. Cached by the browser HTTP
// cache after first download.

"use client";

import type { PDFiumLibrary as PDFiumLibType } from "@hyzyla/pdfium";

let _library: PDFiumLibType | null = null;
let _initPromise: Promise<PDFiumLibType> | null = null;

/**
 * Lazy singleton accessor for the PDFiumLibrary instance.
 * Subsequent calls reuse the cached instance.
 */
export async function getPdfiumLibrary(): Promise<PDFiumLibType> {
  if (_library) return _library;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Dynamic import keeps PDFium WASM out of the baseline bundle.
    // Only pulled in when a tool actually needs it.
    const { PDFiumLibrary } = await import("@hyzyla/pdfium");
    // Self-host the WASM at /pdfium.wasm (copied to /public by
    // scripts/copy-pdfium-wasm.mjs at prebuild). The default browser
    // entry requires us to either pass `wasmUrl` explicitly or use
    // the CDN/base64 shortcuts. Self-hosted is production-correct:
    // single origin, no CSP exception, browser HTTP cache holds it
    // for 7 days after first user.
    const lib = await PDFiumLibrary.init({ wasmUrl: "/pdfium.wasm" });
    _library = lib;
    _initPromise = null;
    return lib;
  })();

  return _initPromise;
}

/**
 * Helper: open a PDF, run a callback with the document, always
 * destroy the document afterwards (avoids memory leaks).
 */
export async function withPdfDocument<T>(
  bytes: Uint8Array,
  fn: (doc: import("@hyzyla/pdfium").PDFiumDocument) => Promise<T>,
): Promise<T> {
  const lib = await getPdfiumLibrary();
  const doc = await lib.loadDocument(bytes);
  try {
    return await fn(doc);
  } finally {
    doc.destroy();
  }
}
