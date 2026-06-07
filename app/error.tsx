"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // In-house error tracking (free): report this render error to /api/errors.
    try {
      fetch("/api/errors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          kind: "client",
          message: error?.message || "render error",
          stack: error?.stack,
          digest: error?.digest,
          path: typeof location !== "undefined" ? location.pathname : undefined,
        }),
      }).catch(() => {});
    } catch {
      /* never let reporting break the error page */
    }
  }, [error]);

  return (
    <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: "48px 20px", textAlign: "center" }}>
      <div style={{ maxWidth: 520 }}>
        <p style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--fg-subtle)", margin: 0 }}>
          Something went wrong
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "12px 0 8px", color: "var(--fg)" }}>
          This page hit an unexpected error
        </h1>
        <p style={{ color: "var(--fg-subtle)", margin: "0 0 24px", lineHeight: 1.6 }}>
          Your files never leave your browser, so nothing was lost. You can try again, or head back and pick another tool.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-lg btn-primary" onClick={reset}>Try again</button>
          <Link href="/" className="btn btn-lg btn-ghost">Go home</Link>
          <Link href="/tools" className="btn btn-lg btn-ghost">All tools</Link>
        </div>
        {error?.digest ? (
          <p style={{ marginTop: 20, fontSize: 12, color: "var(--fg-subtle)" }}>Reference: {error.digest}</p>
        ) : null}
      </div>
    </main>
  );
}
