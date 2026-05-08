// /app/api-keys — API key management surface (Tier 1 #1, 2026-05-08).
//
// Replaces the prior placeholder ("API access is coming soon").
// Real mint/revoke/list flow shipped here. The actual x-api-key
// header verification middleware that wires keys into AI route
// auth is a follow-up commit — this page surfaces the management
// loop standalone first so users can mint + revoke keys against
// the schema even before the verify middleware lands.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { listKeys } from "@/lib/api-keys";
import { ApiKeyManager } from "./ApiKeyManager";

export const metadata: Metadata = {
  title: "API Keys",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ApiKeysPage() {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (typeof userId !== "string") {
    redirect("/login?callbackUrl=/app/api-keys");
  }

  const keys = await listKeys(userId);
  // Server-side serialization: convert Date → ISO string for the
  // client component (Server-to-Client transfer requires
  // serializable values).
  const initialKeys = keys.map((k) => ({
    id: k.id,
    label: k.label,
    prefix: k.prefix,
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    createdAt: k.createdAt.toISOString(),
  }));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        maxWidth: 820,
      }}
    >
      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          API KEYS
        </div>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em" }}>
          API keys
        </h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          Create keys to call pdfcraft ai from your own code or
          automation.
        </p>
      </header>

      {/* Honest disclosure — keys mint + list here today; the
          actual /api/ai/* routes still require session cookies.
          The header-verify middleware lands in a follow-up commit. */}
      <div
        role="status"
        style={{
          padding: "10px 14px",
          borderRadius: 6,
          background: "color-mix(in oklab, #f57c00 6%, transparent)",
          borderLeft: "3px solid #f57c00",
          fontSize: 12,
          color: "#f57c00",
          lineHeight: 1.5,
        }}
      >
        <strong>Beta:</strong> minting + revoking keys works against
        the live schema. Header-based authentication on the AI
        endpoints is rolling out in a follow-up — until that lands,
        these keys are not yet usable for programmatic access. We
        notify when the verify middleware ships.
      </div>

      <ApiKeyManager initialKeys={initialKeys} />
    </div>
  );
}
