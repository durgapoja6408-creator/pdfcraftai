// /app/admin/kill-switches — read-only dashboard for Task #12 circuit
// breakers.
//
// Two categories of state live here:
//
//   1. ENV-driven kill switches — flipped by operators via Hostinger env
//      vars + "Save and redeploy". The page reads them every request
//      (no cache) via `killSwitchSnapshot()` so an operator who just
//      flipped `AI_KILL_OCR=true` sees the new state on next reload.
//
//   2. DB-driven per-user rate-limit overrides — stored in
//      `user_rate_limits`. The page shows aggregate counts + the
//      global default cap; it does NOT list individual users or allow
//      edits. Per-user tuning stays a SQL operation for now because
//      (a) the dataset is tiny (operator-curated, not user-driven),
//      (b) an edit UI on an ops surface is a blast-radius hazard, and
//      (c) any "raise this user's cap" action happens in a support
//      workflow that's out of scope for the margin dashboard family.
//
// Why no mutations on this page
// -----------------------------
// Acceptance criterion for Task #12 explicitly says "admin page is
// READ-ONLY by design". Kill switches are flipped by Hostinger env vars
// (which are access-controlled at the hosting layer), and rate-limit
// overrides go through SQL. Shipping a button here would mean:
//   - Building a CSRF-safe POST handler gated by isAdminEmail.
//   - Persisting the kill state somewhere (env vars are append-only from
//     a running process's perspective — we'd need a DB-backed override
//     table and a read-through-cache in `isOpKilled`).
//   - Solving the consensus problem between env-var truth and DB-override
//     truth (who wins when both say "off"?).
// None of that is needed for incident response — an operator with Hostinger
// access already has every lever they need. This page exists to show
// "what's currently tripped", "what env-var name flips what", and
// "what will users see if they hit a capped op".
//
// Auth model: identical to /app/admin/margin — middleware + /app layout
// handle the anonymous redirect; this page adds the `isAdminEmail`
// allowlist check on top. NotSignedIn / NotAuthorised fallback cards
// match the margin page for visual consistency across the /admin namespace.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/ai/margin-rollup";
import {
  killSwitchSnapshot,
  PROVIDER_KILL_ENV_VAR,
  OP_KILL_ENV_VAR,
} from "@/lib/ai/kill-switches";
import {
  DAILY_COST_CAP_ENV_VAR,
  DEFAULT_DAILY_COST_CAP_MICROS,
  resolveDailyCapMicros,
} from "@/lib/ai/rate-limit";
import { db, schema } from "@/db/client";
import { sql } from "drizzle-orm";

export const metadata: Metadata = {
  title: "Kill switches",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminKillSwitchesPage() {
  // Layer 1: session.
  const session = await auth();
  const email =
    session?.user && typeof (session.user as { email?: unknown }).email === "string"
      ? ((session.user as { email: string }).email as string)
      : null;

  if (!email) {
    // 2026-05-12 — SEV-0 fix: was `return <NotSignedIn />` which
    // confirmed the admin namespace exists to anonymous visitors.
    // notFound() matches the rest of /admin/* (404 → indistinguishable
    // from "no such page"). The NotSignedIn helper is kept in source
    // for reference but no longer rendered.
    notFound();
  }

  // Layer 2: admin allowlist.
  if (!isAdminEmail(email, process.env.ADMIN_EMAILS)) {
    // 2026-05-12 — SEV-0 fix: was `<NotAuthorised email={email} />`
    // which not only confirmed the admin namespace exists, but told
    // signed-in non-admins the env-var name (ADMIN_EMAILS) and to
    // "ask an admin for access". Anonymous attackers could probe the
    // /admin/* tree to learn the surface; signed-in non-admins (the
    // larger attack surface) got even more recon. notFound() makes
    // the page indistinguishable from any non-existent path.
    notFound();
  }

  // Layer 3: read state. Three parallel queries — env snapshot is
  // synchronous, the two counts are DB-bound. Promise.all keeps total
  // latency at max(count_overrides, count_hard_blocks).
  const snapshot = killSwitchSnapshot();
  const [overrideCount, hardBlockCount] = await Promise.all([
    countOverrides(),
    countHardBlocks(),
  ]);
  const envCap = resolveDailyCapMicros(null);
  const envCapRaw = process.env[DAILY_COST_CAP_ENV_VAR];

  return (
    <KillSwitchesDashboard
      snapshot={snapshot}
      overrideCount={overrideCount}
      hardBlockCount={hardBlockCount}
      envCap={envCap}
      envCapRaw={envCapRaw ?? null}
    />
  );
}

// ----- DB helpers -----------------------------------------------------------
// Kept local to this page — they exist to populate two counters. Moving
// them into the rate-limit library would add API surface for something
// only the admin page cares about.

async function countOverrides(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.userRateLimits);
  const raw = rows[0]?.n ?? 0;
  return coerceCount(raw);
}

async function countHardBlocks(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.userRateLimits)
    .where(sql`${schema.userRateLimits.dailyCostCapMicros} = 0`);
  const raw = rows[0]?.n ?? 0;
  return coerceCount(raw);
}

function coerceCount(raw: unknown): number {
  if (typeof raw === "number") return raw;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = Number((raw as any)?.toString?.() ?? raw);
  return Number.isFinite(n) ? n : 0;
}

// ----- Top-level views ------------------------------------------------------

function NotSignedIn() {
  return (
    <Card>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        Not signed in
      </h1>
      <p style={{ color: "var(--fg-muted)", marginBottom: 12 }}>
        This surface is admin-only. Please sign in with an allowlisted
        account.
      </p>
      <Link
        href="/login?callbackUrl=/app/admin/kill-switches"
        style={{ color: "var(--accent)" }}
      >
        Go to sign in →
      </Link>
    </Card>
  );
}

function NotAuthorised({ email }: { email: string }) {
  return (
    <Card>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        Admin access required
      </h1>
      <p style={{ color: "var(--fg-muted)", marginBottom: 4 }}>
        You&rsquo;re signed in as <code style={{ fontSize: 13 }}>{email}</code>,
        but this account isn&rsquo;t on the admin allowlist.
      </p>
      <p style={{ color: "var(--fg-subtle)", fontSize: 13 }}>
        If you need access, ask an existing admin to add your email to the
        <code style={{ marginLeft: 4, marginRight: 4, fontSize: 12 }}>
          ADMIN_EMAILS
        </code>
        Hostinger env var (comma-separated).
      </p>
    </Card>
  );
}

function KillSwitchesDashboard({
  snapshot,
  overrideCount,
  hardBlockCount,
  envCap,
  envCapRaw,
}: {
  snapshot: ReturnType<typeof killSwitchSnapshot>;
  overrideCount: number;
  hardBlockCount: number;
  envCap: number;
  envCapRaw: string | null;
}) {
  const killedProviders = snapshot.providers.filter((p) => p.killed);
  const killedOps = snapshot.ops.filter((o) => o.killed);
  const anyKilled = killedProviders.length + killedOps.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* --- Header --------------------------------------------------- */}
      <header>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
          Kill switches
        </h1>
        <p style={{ color: "var(--fg-muted)", fontSize: 14 }}>
          Live state of the Task #12 circuit breakers. Flip env vars on
          Hostinger and redeploy to trip or clear a switch &mdash; this
          page reloads with no cache.
        </p>
      </header>

      {/* --- Status row ----------------------------------------------- */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <StatCard
          label="Killed providers"
          value={`${killedProviders.length} / ${snapshot.providers.length}`}
          tone={killedProviders.length === 0 ? "green" : "red"}
        />
        <StatCard
          label="Killed ops"
          value={`${killedOps.length} / ${snapshot.ops.length}`}
          tone={killedOps.length === 0 ? "green" : "red"}
        />
        <StatCard
          label="Daily cost cap (default)"
          value={formatMicros_(envCap)}
          tone="neutral"
          hint={
            envCapRaw
              ? `From ${DAILY_COST_CAP_ENV_VAR}=${envCapRaw}`
              : `Default: ${DAILY_COST_CAP_ENV_VAR} is unset`
          }
        />
        <StatCard
          label="Per-user overrides"
          value={String(overrideCount)}
          tone={hardBlockCount > 0 ? "amber" : "neutral"}
          hint={
            hardBlockCount > 0
              ? `${hardBlockCount} user${hardBlockCount === 1 ? "" : "s"} hard-blocked (cap=0)`
              : undefined
          }
        />
      </section>

      {/* --- Global banner when anything is tripped ------------------- */}
      {anyKilled ? (
        <Banner
          tone="red"
          title="Live incident gate"
          body={
            "One or more providers/ops are currently disabled. Check the " +
            "tables below for env-var names, then Hostinger → App → " +
            "Environment Variables to clear the flip."
          }
        />
      ) : (
        <Banner
          tone="green"
          title="All clear"
          body="No kill switches are currently tripped. All providers and ops are routable."
        />
      )}

      {/* --- Provider switches --------------------------------------- */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Provider kill switches
        </h2>
        <p style={{ color: "var(--fg-muted)", fontSize: 13, marginBottom: 12 }}>
          When killed, the router skips the provider in its ladder walk and
          falls through to the next eligible one. If every ladder entry for
          an op is killed, the op&rsquo;s route returns 503{" "}
          <code style={{ fontSize: 12 }}>no_ai_provider_configured</code>.
        </p>
        <SwitchTable
          rows={snapshot.providers.map((p) => ({
            label: p.id,
            envVar: p.envVar,
            killed: p.killed,
          }))}
        />
      </section>

      {/* --- Op switches --------------------------------------------- */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Op kill switches
        </h2>
        <p style={{ color: "var(--fg-muted)", fontSize: 13, marginBottom: 12 }}>
          When killed, the op&rsquo;s route handler returns 503{" "}
          <code style={{ fontSize: 12 }}>op_disabled</code> before spending
          credits or calling a provider. Callers get{" "}
          <code style={{ fontSize: 12 }}>Retry-After: 60</code>.
        </p>
        <SwitchTable
          rows={snapshot.ops.map((o) => ({
            label: o.op,
            envVar: o.envVar,
            killed: o.killed,
          }))}
        />
      </section>

      {/* --- Rate-limit reference ------------------------------------ */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Per-user daily cost ceiling
        </h2>
        <p style={{ color: "var(--fg-muted)", fontSize: 13, marginBottom: 12 }}>
          Every user has a hard daily cap on provider cost (summed{" "}
          <code style={{ fontSize: 12 }}>ai_usage.cost_micros</code> for the
          current UTC day). Exceeding it returns 429{" "}
          <code style={{ fontSize: 12 }}>daily_cost_ceiling_exceeded</code>{" "}
          with{" "}
          <code style={{ fontSize: 12 }}>Retry-After: &lt;seconds to UTC midnight&gt;</code>.
        </p>
        <ReferenceTable
          rows={[
            {
              k: "Resolution order",
              v: "user_rate_limits row → USER_DAILY_COST_MICROS_CAP → hard-coded default",
            },
            {
              k: "Default cap",
              v: `${formatMicros_(DEFAULT_DAILY_COST_CAP_MICROS)} (${DEFAULT_DAILY_COST_CAP_MICROS.toLocaleString()} µUSD)`,
            },
            {
              k: "Env var",
              v: DAILY_COST_CAP_ENV_VAR,
            },
            {
              k: "Env value",
              v: envCapRaw ?? "(unset → falls through to default)",
            },
            {
              k: "Effective cap",
              v: `${formatMicros_(envCap)} for users without an override`,
            },
            {
              k: "Override count",
              v: `${overrideCount} row${overrideCount === 1 ? "" : "s"} in user_rate_limits`,
            },
            {
              k: "Hard-blocked users",
              v: `${hardBlockCount} (override cap = 0 → all ops refused)`,
            },
            {
              k: "Reset boundary",
              v: "00:00 UTC daily (matches ai_daily_margin rollup window)",
            },
          ]}
        />
      </section>

      {/* --- Operator playbook --------------------------------------- */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Operator playbook
        </h2>
        <Card wide>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            To trip or clear a kill switch
          </h3>
          <ol
            style={{
              fontSize: 13,
              color: "var(--fg-muted)",
              paddingLeft: 20,
              lineHeight: 1.7,
              margin: 0,
              marginBottom: 16,
            }}
          >
            <li>
              Hostinger → <strong>pdfcraftai.com</strong> → Manage → Node.js
              App → Environment Variables.
            </li>
            <li>
              Add or edit the env var (see tables above for names, e.g.{" "}
              <code style={{ fontSize: 12 }}>AI_KILL_OCR</code>).
            </li>
            <li>
              Set to <code style={{ fontSize: 12 }}>true</code> to kill,
              delete the var (or set any non-truthy value) to clear.
              Accepted truthy values:{" "}
              <code style={{ fontSize: 12 }}>true</code>,{" "}
              <code style={{ fontSize: 12 }}>1</code>,{" "}
              <code style={{ fontSize: 12 }}>yes</code>,{" "}
              <code style={{ fontSize: 12 }}>on</code>{" "}
              (case-insensitive).
            </li>
            <li>Click <strong>Save and redeploy</strong>.</li>
            <li>
              Reload this page &mdash; the change is reflected immediately
              on next request (no in-process cache).
            </li>
          </ol>

          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            To adjust a single user&rsquo;s daily cap
          </h3>
          <ol
            style={{
              fontSize: 13,
              color: "var(--fg-muted)",
              paddingLeft: 20,
              lineHeight: 1.7,
              margin: 0,
              marginBottom: 16,
            }}
          >
            <li>
              SSH to Hostinger (<code style={{ fontSize: 12 }}>
                ssh -i .claude/id_ed25519_cowork -p 65002 u692382124@212.85.28.206
              </code>) and <code style={{ fontSize: 12 }}>mysql $MYSQL_URL</code>.
            </li>
            <li>
              Insert or update the row:
              <pre
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--bg-3)",
                  borderRadius: "var(--radius)",
                  padding: 12,
                  fontSize: 12,
                  overflowX: "auto",
                  margin: "8px 0",
                }}
              >
                {`INSERT INTO user_rate_limits (user_id, daily_cost_cap_micros, notes)
VALUES ('<user-id>', 2000000, 'Enterprise pilot — raised to $2.00/day')
ON DUPLICATE KEY UPDATE
  daily_cost_cap_micros = VALUES(daily_cost_cap_micros),
  notes = VALUES(notes),
  updated_at = CURRENT_TIMESTAMP(3);`}
              </pre>
            </li>
            <li>
              <strong>Hard-block a user:</strong> set{" "}
              <code style={{ fontSize: 12 }}>daily_cost_cap_micros = 0</code>
              . Any op (including zero-cost retries) will 429 until the row
              is removed or raised.
            </li>
            <li>
              <strong>Clear an override:</strong>{" "}
              <code style={{ fontSize: 12 }}>
                DELETE FROM user_rate_limits WHERE user_id = &apos;&lt;user-id&gt;&apos;;
              </code>{" "}
              &mdash; user falls back to the env/default cap on next request.
            </li>
          </ol>

          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            To change the global default cap
          </h3>
          <ol
            style={{
              fontSize: 13,
              color: "var(--fg-muted)",
              paddingLeft: 20,
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            <li>
              Hostinger env var:{" "}
              <code style={{ fontSize: 12 }}>{DAILY_COST_CAP_ENV_VAR}</code>
              . Value is integer µUSD (1,000,000 = $1.00).
            </li>
            <li>
              Save and redeploy. Users without an override row pick up the
              new cap on next request.
            </li>
            <li>
              Unset the var to fall back to the hard-coded default{" "}
              ({formatMicros_(DEFAULT_DAILY_COST_CAP_MICROS)}).
            </li>
          </ol>
        </Card>
      </section>

      <footer style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
        Snapshot generated{" "}
        <time dateTime={new Date().toISOString()}>
          {formatTime_(new Date().toISOString())}
        </time>
        . Related surfaces:{" "}
        <Link href="/app/admin/margin" style={{ color: "var(--accent)" }}>
          /app/admin/margin
        </Link>
        .
      </footer>
    </div>
  );
}

// ----- Sub-components -------------------------------------------------------

type Tone = "green" | "amber" | "red" | "neutral";

function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: Tone;
  hint?: string;
}) {
  const accent =
    tone === "green"
      ? "var(--accent)"
      : tone === "red"
        ? "#c00"
        : tone === "amber"
          ? "#d97706"
          : "var(--fg)";
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bg-3)",
        borderRadius: "var(--radius)",
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent }}>{value}</div>
      {hint ? (
        <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 4 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function Card({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bg-3)",
        borderRadius: "var(--radius)",
        padding: 24,
        maxWidth: wide ? undefined : 560,
      }}
    >
      {children}
    </div>
  );
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "green" | "red";
  title: string;
  body: string;
}) {
  const borderColor = tone === "green" ? "var(--accent)" : "#c00";
  const bg = tone === "green" ? "rgba(0, 128, 0, 0.06)" : "rgba(204, 0, 0, 0.06)";
  return (
    <div
      role="status"
      style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: "var(--radius)",
        padding: 16,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>{body}</div>
    </div>
  );
}

function SwitchTable({
  rows,
}: {
  rows: Array<{ label: string; envVar: string; killed: boolean }>;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
          maxWidth: 620,
        }}
      >
        <thead>
          <tr style={{ textAlign: "left", color: "var(--fg-muted)" }}>
            <Th>Name</Th>
            <Th>Env var</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.label}
              style={{ borderTop: "1px solid var(--bg-3)" }}
            >
              <Td>
                <code style={{ fontSize: 12 }}>{r.label}</code>
              </Td>
              <Td>
                <code style={{ fontSize: 12 }}>{r.envVar}</code>
              </Td>
              <Td>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 500,
                    color: r.killed ? "#c00" : "var(--accent)",
                    background: r.killed
                      ? "rgba(204, 0, 0, 0.08)"
                      : "rgba(0, 128, 0, 0.08)",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: r.killed ? "#c00" : "var(--accent)",
                    }}
                  />
                  {r.killed ? "killed" : "active"}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReferenceTable({
  rows,
}: {
  rows: Array<{ k: string; v: string }>;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
          maxWidth: 820,
        }}
      >
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} style={{ borderTop: "1px solid var(--bg-3)" }}>
              <Td style={{ color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                {r.k}
              </Td>
              <Td>{r.v}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        padding: "8px 12px",
        fontWeight: 500,
        textAlign: align,
        borderBottom: "1px solid var(--bg-3)",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  style,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  style?: React.CSSProperties;
}) {
  return (
    <td
      style={{
        padding: "8px 12px",
        textAlign: align,
        verticalAlign: "top",
        ...style,
      }}
    >
      {children}
    </td>
  );
}

// ----- Formatters -----------------------------------------------------------

function formatMicros_(micros: number): string {
  if (!Number.isFinite(micros) || micros === 0) return "$0";
  const dollars = micros / 1_000_000;
  if (Math.abs(dollars) >= 1) return `$${dollars.toFixed(2)}`;
  return `$${dollars.toFixed(4)}`;
}

function formatTime_(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
  } catch {
    return iso;
  }
}
