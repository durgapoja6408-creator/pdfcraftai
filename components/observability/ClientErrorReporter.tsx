"use client";

// Global client-error reporter (2026-06-07). Catches runtime/async errors the
// React error boundaries miss (event handlers, promises) and posts them to
// /api/errors. Deduped + capped per page load so a noisy loop can't flood the
// table. Mounted once in the root layout. Renders nothing.

import { useEffect } from "react";

export function ClientErrorReporter() {
  useEffect(() => {
    const seen = new Set<string>();
    let sent = 0;
    const MAX = 15;
    const report = (message: string, stack?: string) => {
      if (!message || sent >= MAX) return;
      const key = message + (stack || "").slice(0, 200);
      if (seen.has(key)) return;
      seen.add(key);
      sent += 1;
      try {
        fetch("/api/errors", {
          method: "POST",
          headers: { "content-type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            kind: "client",
            message: message.slice(0, 2000),
            stack: stack ? stack.slice(0, 20000) : undefined,
            path: location.pathname,
          }),
        }).catch(() => {});
      } catch {
        /* noop */
      }
    };
    const onError = (e: ErrorEvent) => report(e.message || "window error", e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string } | string | undefined;
      report(typeof r === "string" ? r : r?.message || "unhandled rejection", typeof r === "object" ? r?.stack : undefined);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
