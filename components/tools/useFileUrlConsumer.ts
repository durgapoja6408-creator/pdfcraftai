"use client";

// components/tools/useFileUrlConsumer.ts
//
// M10 (#193, 2026-04-29): consume a `?file=<url>` query param on
// mount and feed the fetched PDF to onFiles.
//
// Use case: documentation, blog posts, or SEO landing pages can link
// directly to a tool with a sample file pre-loaded —
//   /tool/redact-free?file=/samples/contract-template.pdf
// Lands on the Redact tool with the sample PDF auto-loaded; user
// can immediately try the tool without hunting for a test file.
//
// Safety constraints:
//   1. URL must parse and resolve to the same origin as window.location.
//      Blocks `?file=https://evil.com/sensitive.pdf` cross-origin
//      embedding. (Future: allow an explicit allowlist if we ever want
//      to embed from docs.pdfcraftai.com etc.)
//   2. Response Content-Type must be application/pdf or octet-stream.
//   3. Response size must be ≤ MAX_FILE_SIZE (100MB, same as drag-drop).
//   4. Failures fall back to silent (the user sees the empty drop zone)
//      so a broken `?file=` doesn't block the tool.
//
// The hook follows the same shape as useHandoffConsumer (M9): a
// one-shot useEffect that fires onFiles with the fetched bytes and
// strips the `?file=` param via history.replaceState. Co-mounting
// both hooks (handoff first, then file URL) is fine — at most one
// will produce a payload because the URL only ever has one of the
// two params at a time in real usage.

import { useEffect } from "react";
import { MAX_FILE_SIZE_BYTES } from "@/lib/client/pdf-utils";

const ACCEPTED_MIME = new Set([
  "application/pdf",
  "application/octet-stream",
  // Some CDNs serve PDFs with a generic binary type — accept it and let
  // the downstream isPdfFile check (called by onFiles via ToolDropzone's
  // validation) catch non-PDF content.
  "binary/octet-stream",
]);

/**
 * Consume `?file=<url>` on mount. Same-origin only. Bytes get pushed
 * through onFiles like any drag-drop.
 */
export function useFileUrlConsumer(onFiles: (files: File[]) => void): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const fileUrl = params.get("file");
    if (!fileUrl) return;

    let cancelled = false;

    // Strip the param immediately so a refresh doesn't re-trigger the
    // fetch (avoids accidental double-charge if the URL points to a
    // server-side endpoint that costs something to hit).
    params.delete("file");
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "");
    window.history.replaceState(null, "", newUrl);

    (async () => {
      // Resolve relative URLs and validate origin.
      let resolved: URL;
      try {
        resolved = new URL(fileUrl, window.location.href);
      } catch {
        // Malformed URL — silent fail.
        return;
      }
      if (resolved.origin !== window.location.origin) {
        // Cross-origin — block. Don't even fetch.
        console.warn("?file= cross-origin URLs are blocked:", resolved.href);
        return;
      }

      try {
        const res = await fetch(resolved.href, { method: "GET" });
        if (!res.ok) return;

        // Check MIME type. Some servers omit Content-Type entirely;
        // accept that case too (downstream ToolDropzone validation
        // will catch non-PDF content via the file extension check).
        const contentType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
        if (contentType && !ACCEPTED_MIME.has(contentType)) {
          console.warn(`?file= rejected (Content-Type ${contentType} not accepted)`);
          return;
        }

        // Check size before reading body — fail fast on huge files.
        const contentLength = res.headers.get("content-length");
        if (contentLength) {
          const len = parseInt(contentLength, 10);
          if (Number.isFinite(len) && len > MAX_FILE_SIZE_BYTES) {
            console.warn(`?file= rejected (size ${len} > ${MAX_FILE_SIZE_BYTES})`);
            return;
          }
        }

        const blob = await res.blob();
        if (cancelled) return;

        // Belt-and-suspenders size check after read — content-length
        // header is advisory and a misconfigured CDN might lie.
        if (blob.size > MAX_FILE_SIZE_BYTES) return;

        // Derive a filename from the URL pathname or fall back to a
        // generic name. The downstream tool sees a real File object
        // identical in shape to a drag-drop.
        const pathname = resolved.pathname;
        const lastSlash = pathname.lastIndexOf("/");
        const baseName = (lastSlash >= 0 ? pathname.slice(lastSlash + 1) : pathname) || "document.pdf";
        const filename = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;

        const file = new File([blob], filename, {
          type: "application/pdf",
          lastModified: Date.now(),
        });
        onFiles([file]);
      } catch (err) {
        // Silent fail — broken `?file=` shouldn't block the tool.
        console.warn("?file= fetch failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
