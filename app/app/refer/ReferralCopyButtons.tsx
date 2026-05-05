"use client";

// Client island for the /app/refer page. Just two copy-to-clipboard
// buttons (code + URL) with momentary "Copied!" feedback. Lives in
// its own file so the parent page can stay a server component (which
// it needs to be — it does the auth check + DB code lookup +
// idempotent insert).

import { useState, useCallback } from "react";

interface Props {
  code: string;
  url: string;
}

export function ReferralCopyButtons({ code, url }: Props) {
  const [copied, setCopied] = useState<"code" | "url" | null>(null);

  const copy = useCallback(async (kind: "code" | "url", text: string) => {
    try {
      // navigator.clipboard.writeText requires a secure context (HTTPS)
      // which production always satisfies. In local dev http://localhost
      // also counts as secure per the spec.
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Old browsers / sandboxed iframes can throw. We don't bother
      // with a textarea fallback because clipboard.writeText is
      // supported everywhere we care about (Chrome 66+, Firefox 63+,
      // Safari 13.1+, Edge 79+).
      alert("Couldn't copy. Select the text manually and Cmd-C / Ctrl-C.");
    }
  }, []);

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn btn-sm btn-outline"
        onClick={() => copy("code", code)}
      >
        {copied === "code" ? "✓ Copied" : "Copy code"}
      </button>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        onClick={() => copy("url", url)}
      >
        {copied === "url" ? "✓ Copied" : "Copy share link"}
      </button>
    </div>
  );
}
