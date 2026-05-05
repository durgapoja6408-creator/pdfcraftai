import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { eq, desc } from "drizzle-orm";
import { I } from "@/components/icons/Icons";
import { getSpendSummary } from "@/lib/user/queries";
import { formatCredits, formatCount } from "@/lib/user/format";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user ? (session.user as { id?: string }).id : undefined;

  let balance = 0;
  let recent: Array<{ id: string; name: string; createdAt: Date }> = [];
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 960 }}>
      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>DASHBOARD</div>
        <h1 style={{ fontSize: 32, letterSpacing: "-0.025em" }}>
          Welcome back, {firstName}.
        </h1>
        <p className="muted" style={{ fontSize: 15, marginTop: 4 }}>
          Everything's ready. Drop a PDF in Files to get started.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <StatCard
          icon="Coin"
          label="Credit balance"
          value={formatCredits(balance)}
          hint="credits"
          cta={{ href: "/app/credits", text: "See history" }}
        />
        <StatCard
          icon="Clock"
          label="Last 7 days"
          value={formatCredits(spend.last7dCredits)}
          hint={`${formatCount(spend.last7dCalls)} calls`}
          cta={{ href: "/app/usage?days=7", text: "Usage" }}
        />
        <StatCard
          icon="Layers"
          label="Last 30 days"
          value={formatCredits(spend.last30dCredits)}
          hint={`${formatCount(spend.last30dCalls)} calls`}
          cta={{ href: "/app/usage?days=30", text: "Usage" }}
        />
        <StatCard
          icon="Receipt"
          label="Receipts"
          value="→"
          hint="Your paid charges"
          cta={{ href: "/app/receipts", text: "View" }}
        />
        <StatCard
          icon="Sparkle"
          label="Refer"
          value="→"
          hint="Your share link & stats"
          cta={{ href: "/app/refer", text: "Open" }}
        />
      </div>

      <section>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, letterSpacing: "-0.01em", margin: 0 }}>Recent activity</h2>
          <Link href="/app/files" className="subtle" style={{ fontSize: 13, textDecoration: "none" }}>
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div
            className="card"
            style={{
              padding: 40,
              textAlign: "center",
              borderStyle: "dashed",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "var(--bg-2)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 12px",
                color: "var(--fg-subtle)",
              }}
            >
              <I.File size={20} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>
              No files yet
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 14 }}>
              Upload your first PDF to see it here.
            </p>
            <Link href="/app/files" className="btn btn-primary btn-sm">
              Upload a PDF
            </Link>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {recent.map((f, i) => (
              <div
                key={f.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <I.File size={16} />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 14, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                    {f.name}
                  </div>
                  <div className="subtle" style={{ fontSize: 12 }}>
                    {new Date(f.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
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
  cta,
}: {
  icon: keyof typeof I;
  label: string;
  value: string;
  hint: string;
  cta: { href: string; text: string };
}) {
  const Icon = I[icon];
  return (
    <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="eyebrow" style={{ margin: 0 }}>{label}</div>
        <span style={{ color: "var(--fg-subtle)" }}>
          {Icon ? <Icon size={16} /> : null}
        </span>
      </div>
      <div style={{ fontSize: 30, letterSpacing: "-0.02em", fontWeight: 500 }}>{value}</div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="subtle" style={{ fontSize: 12 }}>{hint}</span>
        <Link href={cta.href} style={{ fontSize: 12, color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}>
          {cta.text} →
        </Link>
      </div>
    </div>
  );
}
