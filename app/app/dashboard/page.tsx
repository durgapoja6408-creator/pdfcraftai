import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { eq, desc, sql } from "drizzle-orm";
import { I } from "@/components/icons/Icons";
import { UnverifiedEmailBanner } from "@/components/auth/UnverifiedEmailBanner";
import { getSpendSummary } from "@/lib/user/queries";
import { formatCredits, formatCount, formatRelative } from "@/lib/user/format";
import { POPULAR_TOOL_IDS } from "@/lib/tool-sections";
import { toolById, TOOL_STATS } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Below this balance the Credit-balance card promotes "Top up" to the
// primary (accent) action instead of a quiet history link (2026-06-05).
const LOW_BALANCE = 10;

// ai_outputs.kind -> friendly label for the Recent activity list. Unknown
// kinds title-case as a fallback so a new enum member never renders blank.
const KIND_LABEL: Record<string, string> = {
  summary: "Summary",
  translation: "Translation",
  ocr: "OCR",
  comparison: "Comparison",
  rewrite: "Rewrite",
  table: "Table extraction",
  redaction: "Redaction",
  generation: "Generated PDF",
  signing: "Signature",
};
function kindLabel(kind: string): string {
  return (
    KIND_LABEL[kind] ??
    kind.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// High-intent tools surfaced as a one-click launcher at the top of the
// dashboard. The page previously had no path to the product's core action
// (run a tool) once a user had files. Reuses the curated POPULAR set.
const QUICK_TOOLS = POPULAR_TOOL_IDS.map((id) => toolById(id)).filter(
  (t): t is NonNullable<ReturnType<typeof toolById>> => !!t,
);

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;

  let balance = 0;
  // PENDING auth-flow gap #4 (2026-05-06) — surface unverified-email state so
  // users can recover from SMTP-fail-open + 24h token expiry. The banner
  // POSTs to /api/auth/resend-verification.
  let unverifiedEmail: string | null = null;
  let recent: Array<{ id: string; name: string; createdAt: Date }> = [];
  let recentRuns: Array<{
    fileId: string;
    kind: string;
    source: string | null;
    createdAt: Date;
  }> = [];
  let spend = {
    last7dCredits: 0,
    last30dCredits: 0,
    last7dCalls: 0,
    last30dCalls: 0,
  };
  if (userId) {
    const [creditRow] = await db
      .select({ balance: schema.credits.balance })
      .from(schema.credits)
      .where(eq(schema.credits.userId, userId))
      .limit(1);
    balance = creditRow?.balance ?? 0;

    // Email-verification state for the banner. One row, indexed.
    const [verifyRow] = await db
      .select({
        email: schema.users.email,
        emailVerified: schema.users.emailVerified,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (verifyRow && verifyRow.emailVerified === null) {
      unverifiedEmail = verifyRow.email;
    }

    // Recent AI results — the revisitable work product (what users actually
    // come back for), not raw uploads. Scoped to the user via the files join
    // (ai_outputs.file_id -> files.user_id), the same tenancy rail
    // /app/ai-history uses. Wrapped so a query hiccup degrades to "no recent
    // runs" rather than 500-ing the whole dashboard.
    try {
      const runRows = await db
        .select({
          fileId: schema.aiOutputs.fileId,
          kind: schema.aiOutputs.kind,
          source: sql<
            string | null
          >`JSON_UNQUOTE(JSON_EXTRACT(${schema.aiOutputs.meta}, '$.sourceName'))`,
          fileName: schema.files.name,
          createdAt: schema.aiOutputs.createdAt,
        })
        .from(schema.aiOutputs)
        .innerJoin(schema.files, eq(schema.aiOutputs.fileId, schema.files.id))
        .where(eq(schema.files.userId, userId))
        .orderBy(desc(schema.aiOutputs.createdAt))
        .limit(5);
      recentRuns = runRows.map((r) => ({
        fileId: r.fileId,
        kind: r.kind,
        source: r.source ?? r.fileName ?? null,
        createdAt: r.createdAt,
      }));
    } catch {
      recentRuns = [];
    }

    recent = await db
      .select({
        id: schema.files.id,
        name: schema.files.name,
        createdAt: schema.files.createdAt,
      })
      .from(schema.files)
      .where(eq(schema.files.userId, userId))
      .orderBy(desc(schema.files.createdAt))
      .limit(5);

    const summary = await getSpendSummary(userId);
    spend = summary.data;
  }

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const lowBalance = balance <= LOW_BALANCE;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 960 }}>
      {unverifiedEmail ? <UnverifiedEmailBanner email={unverifiedEmail} /> : null}

      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>DASHBOARD</div>
        <h1 style={{ fontSize: 32, letterSpacing: "-0.025em" }}>
          Welcome back, {firstName}.
        </h1>
        <p className="muted" style={{ fontSize: 15, marginTop: 4 }}>
          Pick a tool to get started, or jump back into your recent work.
        </p>
      </header>

      {/* Quick start — one-click launcher (P0). The dashboard used to have no
          path to the core action (run a tool) once a user had files. */}
      <section>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, letterSpacing: "-0.01em", margin: 0 }}>Quick start</h2>
          <Link href="/tools" className="subtle" style={{ fontSize: 13, textDecoration: "none" }}>
            Browse all {TOOL_STATS.total} tools →
          </Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          {QUICK_TOOLS.map((t) => {
            const Icon = I[t.icon];
            return (
              <Link
                key={t.id}
                href={`/tool/${t.id}`}
                prefetch={false}
                className="card card-hover"
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", textDecoration: "none", color: "inherit" }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    background: t.free ? "var(--blue-soft)" : "var(--accent-soft)",
                    color: t.free ? "var(--blue)" : "var(--accent)",
                  }}
                >
                  {Icon ? <Icon size={16} /> : null}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.name}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Real usage metrics only — Receipts/Refer were fake "→" stat cards
          and are now in the Manage row below (P1). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard
          icon="Coin"
          label="Credit balance"
          value={formatCredits(balance)}
          hint={lowBalance ? "running low" : "credits"}
          ctas={[
            { href: "/pricing", text: "Top up", accent: true },
            { href: "/app/credits", text: "History" },
          ]}
        />
        <StatCard
          icon="Clock"
          label="Last 7 days"
          value={formatCredits(spend.last7dCredits)}
          hint={`${formatCount(spend.last7dCalls)} calls`}
          ctas={[{ href: "/app/usage?days=7", text: "Usage" }]}
        />
        <StatCard
          icon="Layers"
          label="Last 30 days"
          value={formatCredits(spend.last30dCredits)}
          hint={`${formatCount(spend.last30dCalls)} calls`}
          ctas={[{ href: "/app/usage?days=30", text: "Usage" }]}
        />
      </div>

      {/* Manage — nav shortcuts, demoted from the fake "→" stat cards (P1). */}
      <div className="card" style={{ padding: 6, display: "flex", flexWrap: "wrap", alignItems: "center" }}>
        <ManageLink href="/app/receipts" icon="Receipt" label="Receipts" />
        <ManageLink href="/app/billing" icon="Coin" label="Billing" />
        <ManageLink href="/app/refer" icon="Sparkle" label="Refer & earn" />
      </div>

      {/* Recent activity — recent AI results (clickable -> AI History) if any,
          else recent files (clickable -> Files), else empty state. No more
          dead-end rows (P0). */}
      <section>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, letterSpacing: "-0.01em", margin: 0 }}>Recent activity</h2>
          <Link href={recentRuns.length ? "/app/ai-history" : "/app/files"} className="subtle" style={{ fontSize: 13, textDecoration: "none" }}>
            View all →
          </Link>
        </div>

        {recentRuns.length > 0 ? (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {recentRuns.map((r, i) => (
              <Link
                key={`${r.fileId}-${i}`}
                href="/app/ai-history"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: i === 0 ? "none" : "1px solid var(--border)", textDecoration: "none", color: "inherit" }}
              >
                <I.FileAi size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 14, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                    {kindLabel(r.kind)}{r.source ? ` · ${r.source}` : ""}
                  </div>
                  <div className="subtle" style={{ fontSize: 12 }}>{formatRelative(r.createdAt)}</div>
                </div>
                <I.ArrowRight size={14} style={{ color: "var(--fg-subtle)", flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        ) : recent.length > 0 ? (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {recent.map((f, i) => (
              <Link
                key={f.id}
                href="/app/files"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: i === 0 ? "none" : "1px solid var(--border)", textDecoration: "none", color: "inherit" }}
              >
                <I.File size={16} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 14, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                    {f.name}
                  </div>
                  <div className="subtle" style={{ fontSize: 12 }}>{formatRelative(f.createdAt)}</div>
                </div>
                <I.ArrowRight size={14} style={{ color: "var(--fg-subtle)", flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="card" style={{ padding: 40, textAlign: "center", borderStyle: "dashed" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--bg-2)", display: "grid", placeItems: "center", margin: "0 auto 12px", color: "var(--fg-subtle)" }}>
              <I.File size={20} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>No files yet</p>
            <p className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 14 }}>
              Upload your first PDF, or pick a tool to get started.
            </p>
            <div className="row" style={{ gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/app/files" className="btn btn-primary btn-sm">Upload a PDF</Link>
              <Link href="/app/welcome" className="btn btn-outline btn-sm">Pick a tool →</Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  ctas,
}: {
  icon: keyof typeof I;
  label: string;
  value: string;
  hint: string;
  ctas: { href: string; text: string; accent?: boolean }[];
}) {
  const Icon = I[icon];
  return (
    <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="eyebrow" style={{ margin: 0 }}>{label}</div>
        <span style={{ color: "var(--fg-subtle)" }}>{Icon ? <Icon size={16} /> : null}</span>
      </div>
      <div style={{ fontSize: 30, letterSpacing: "-0.02em", fontWeight: 500 }}>{value}</div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="subtle" style={{ fontSize: 12 }}>{hint}</span>
        <span className="row" style={{ gap: 12 }}>
          {ctas.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              style={{ fontSize: 12, color: c.accent ? "var(--accent)" : "var(--fg-subtle)", fontWeight: c.accent ? 500 : 400, textDecoration: c.accent ? "none" : "underline", textUnderlineOffset: 2 }}
            >
              {c.text} →
            </Link>
          ))}
        </span>
      </div>
    </div>
  );
}

function ManageLink({ href, icon, label }: { href: string; icon: keyof typeof I; label: string }) {
  const Icon = I[icon];
  return (
    <Link href={href} className="row" style={{ gap: 8, padding: "10px 14px", fontSize: 13, color: "var(--fg-muted)", textDecoration: "none", borderRadius: 8 }}>
      {Icon ? <Icon size={15} style={{ color: "var(--fg-subtle)" }} /> : null}
      {label}
    </Link>
  );
}
