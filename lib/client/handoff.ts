/**
 * M9 (#193, 2026-04-29): in-memory blob handoff between tools.
 *
 * Workflow this enables: user runs a tool (Highlight), sees the result,
 * and clicks "Open in Redact" — the output PDF gets handed off to the
 * Redact tool's editor without a download → re-upload roundtrip.
 *
 * Why a window-scoped Map and not sessionStorage:
 * - sessionStorage caps at ~5–10MB per origin in every browser. PDFs in
 *   our pipeline routinely exceed that (50MB single tool input, 200MB+
 *   for huge OCR jobs).
 * - Storing as base64 inflates to ~133% of binary size and triples the
 *   memory pressure (encode → string → decode).
 * - A window-global Map holds the underlying Blob by reference, and
 *   Blobs themselves can hold gigabytes (browser-native, GC'd when
 *   the last reference drops). Cost: zero base64 overhead, near-zero
 *   storage time.
 *
 * Tradeoff: window-scope means handoffs survive Next.js client-side
 * navigation (which is what we want — that's how the user gets to the
 * target tool's page) but DO NOT survive a hard reload or new tab.
 * The user will still see "Open in Redact" but if they cmd-click it
 * to open in a new tab, the handoff key won't exist there. That's
 * acceptable for v1 — the success card buttons all do same-tab nav.
 *
 * Lifecycle:
 *  1. Source tool calls `registerHandoff(blob, filename, sourceToolId)`
 *     → returns a UUID key.
 *  2. Source tool navigates to `/tool/<targetId>?handoff=<key>`.
 *  3. Target tool calls `consumeHandoff(key)` on mount → returns
 *     {blob, filename, sourceToolId} OR null.
 *  4. consumeHandoff REMOVES the entry. Subsequent calls return null.
 *  5. If target never calls consumeHandoff (user closes tab, etc.),
 *     the entry stays in the Map until the page reloads. The Blob
 *     is GC'd when the page unloads — no leak.
 *
 * Note: this is NOT a security boundary. Handoffs are same-origin only
 * by construction (window-scope), but a same-origin script can read any
 * registered handoff. Don't use this for credentials.
 */

"use client";

export interface HandoffPayload {
  blob: Blob;
  filename: string;
  /** Tool that registered the handoff. Useful for analytics + the
   *  "originated from <Tool>" label on the target tool's editor. */
  sourceToolId: string;
}

interface HandoffRegistry {
  // Map keyed by UUID handoff token. Each value is the payload.
  // We use Map<string, HandoffPayload> so iteration order is
  // insertion order (helpful for debugging via devtools).
  __pdfcraft_handoff?: Map<string, HandoffPayload>;
}

function getRegistry(): Map<string, HandoffPayload> {
  if (typeof window === "undefined") {
    // No-op on the server — registerHandoff and consumeHandoff are
    // both client-only, but TypeScript can't enforce that without a
    // .client.ts split, so we guard at runtime to keep imports safe.
    throw new Error("Handoff registry is client-only (saw window === undefined)");
  }
  const w = window as Window & HandoffRegistry;
  if (!w.__pdfcraft_handoff) {
    w.__pdfcraft_handoff = new Map();
  }
  return w.__pdfcraft_handoff;
}

/**
 * Generate a UUID v4 for the handoff key. Uses crypto.randomUUID()
 * where available (all modern browsers since 2022); falls back to a
 * 16-byte crypto.getRandomValues() shaped into v4 form for older
 * Edge / Safari builds.
 */
function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: 16 random bytes shaped into a v4 UUID.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 1 (RFC 4122)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}

/**
 * Register a Blob for handoff. Returns the key the target tool
 * should use to consume it.
 */
export function registerHandoff(
  blob: Blob,
  filename: string,
  sourceToolId: string,
): string {
  const key = uuid();
  getRegistry().set(key, { blob, filename, sourceToolId });
  return key;
}

/**
 * Consume a registered handoff. Removes the entry from the registry.
 * Returns null if the key was unknown (target tool was loaded in a
 * fresh tab / after a hard reload, or the user is constructing a URL
 * by hand).
 */
export function consumeHandoff(key: string): HandoffPayload | null {
  if (typeof window === "undefined") return null;
  const reg = getRegistry();
  const payload = reg.get(key);
  if (!payload) return null;
  reg.delete(key);
  return payload;
}

/** Build a `?handoff=<key>` URL for the target tool. */
export function handoffUrl(toolId: string, key: string): string {
  return `/tool/${toolId}?handoff=${encodeURIComponent(key)}`;
}

/**
 * Convert a registered Blob to a File at consume time. Useful for
 * tools whose onFiles handlers expect File (most of them).
 */
export function payloadToFile(payload: HandoffPayload): File {
  return new File([payload.blob], payload.filename, {
    type: "application/pdf",
    lastModified: Date.now(),
  });
}
