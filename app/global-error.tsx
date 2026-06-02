"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", background: "#0b0b0f", color: "#e5e7eb", padding: "48px 20px", textAlign: "center" }}>
        <div style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 10px" }}>Something went wrong</h1>
          <p style={{ color: "#9ca3af", margin: "0 0 24px", lineHeight: 1.6 }}>
            pdfcraft ai hit an unexpected error. Please try again.
          </p>
          <button type="button" onClick={reset} style={{ fontSize: 15, fontWeight: 600, padding: "12px 24px", borderRadius: 10, border: 0, cursor: "pointer", background: "#6366f1", color: "#fff" }}>
            Try again
          </button>
          {error?.digest ? (
            <p style={{ marginTop: 20, fontSize: 12, color: "#6b7280" }}>Reference: {error.digest}</p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
