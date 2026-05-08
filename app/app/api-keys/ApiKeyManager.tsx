// ApiKeyManager — client form for /app/api-keys (Tier 1 #1).
//
// Shows the user's active + revoked keys. Lets them mint a new
// key (with label) and revoke existing ones. The raw key is
// shown EXACTLY ONCE on mint success — caller is warned to copy
// it before navigating away.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { mintKeyAction, revokeKeyAction } from "./actions";

interface KeyRow {
  id: string;
  label: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function ApiKeyManager({ initialKeys }: { initialKeys: KeyRow[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [freshKey, setFreshKey] = useState<{
    rawKey: string;
    label: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function onMint(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await mintKeyAction(label);
      if (result.ok) {
        setFreshKey({ rawKey: result.rawKey, label: result.label });
        setLabel("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function onRevoke(keyId: string, label: string) {
    if (
      !confirm(
        `Revoke "${label}"? The key stops working immediately and cannot be restored. Continue?`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await revokeKeyAction(keyId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  async function copyRaw() {
    if (!freshKey) return;
    try {
      await navigator.clipboard.writeText(freshKey.rawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: prompt the user to manually copy
      alert("Copy failed — select the key text manually.");
    }
  }

  function dismissFresh() {
    if (
      !confirm(
        "Have you copied the key? It will not be shown again — make sure it's saved somewhere safe before dismissing.",
      )
    ) {
      return;
    }
    setFreshKey(null);
  }

  const activeKeys = initialKeys.filter((k) => k.revokedAt === null);
  const revokedKeys = initialKeys.filter((k) => k.revokedAt !== null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Mint form */}
      <section className="card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>
          Mint a new key
        </h2>
        <p
          className="muted"
          style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}
        >
          Give it a label so you can identify it later. The raw key is
          shown only once — copy it before dismissing the success
          banner. Max {5} active keys per account.
        </p>
        <form
          onSubmit={onMint}
          style={{ display: "flex", gap: 8, alignItems: "stretch" }}
        >
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. production-server, ci-pipeline, my-mac"
            maxLength={128}
            disabled={pending || freshKey !== null}
            style={{
              flex: 1,
              padding: "10px 12px",
              fontSize: 14,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--fg)",
            }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              pending || label.trim().length === 0 || freshKey !== null
            }
          >
            {pending ? "Minting…" : "Mint key"}
          </button>
        </form>
      </section>

      {/* Fresh-key reveal — shown ONCE after mint */}
      {freshKey ? (
        <section
          className="card"
          style={{
            padding: 20,
            borderColor: "color-mix(in oklab, #4caf50 30%, var(--border))",
            background: "color-mix(in oklab, #4caf50 4%, transparent)",
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              margin: "0 0 4px",
              color: "#2e7d32",
            }}
          >
            ✓ Key minted: {freshKey.label}
          </h2>
          <p
            className="muted"
            style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}
          >
            <strong style={{ color: "#c00" }}>
              Copy this key now.
            </strong>{" "}
            It will never be shown again — only its prefix +
            last-used metadata are kept on this page going forward.
          </p>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "12px 16px",
              background: "var(--bg-2)",
              borderRadius: 6,
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: 13,
              wordBreak: "break-all",
            }}
          >
            <code style={{ flex: 1 }}>{freshKey.rawKey}</code>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={copyRaw}
              style={{ flexShrink: 0 }}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={dismissFresh}
              style={{ fontSize: 13 }}
            >
              I&rsquo;ve saved it — dismiss
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <div
          role="alert"
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            background: "color-mix(in oklab, #c00 8%, transparent)",
            color: "#c00",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Active keys */}
      <section>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            margin: "0 0 12px",
          }}
        >
          Active keys ({activeKeys.length})
        </h2>
        {activeKeys.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>
            No active keys. Mint one above to get started.
          </p>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {activeKeys.map((k, i) => (
              <div
                key={k.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "12px 16px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {k.label}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    <code style={{ fontSize: 11 }}>{k.prefix}…</code> ·
                    Created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt
                      ? ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                      : " · Never used"}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderColor: "#c00",
                    color: "#c00",
                  }}
                  onClick={() => onRevoke(k.id, k.label)}
                  disabled={pending}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Revoked keys (audit trail) */}
      {revokedKeys.length > 0 ? (
        <section>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 700,
              margin: "0 0 8px",
              color: "var(--fg-subtle)",
            }}
          >
            Revoked ({revokedKeys.length})
          </h2>
          <div className="card" style={{ padding: 0, overflow: "hidden", opacity: 0.6 }}>
            {revokedKeys.map((k, i) => (
              <div
                key={k.id}
                style={{
                  padding: "10px 16px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  fontSize: 13,
                }}
              >
                <div style={{ textDecoration: "line-through" }}>
                  {k.label}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  <code style={{ fontSize: 11 }}>{k.prefix}…</code> ·
                  Revoked{" "}
                  {k.revokedAt
                    ? new Date(k.revokedAt).toLocaleDateString()
                    : "—"}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
