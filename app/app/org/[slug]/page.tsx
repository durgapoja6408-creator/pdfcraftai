// app/app/org/[slug]/page.tsx — Organization landing (PENDING §3b
// Phase F-3, 2026-05-05).
//
// Pairs with /app/org/new (create-org page from Phase F-2). After
// the user creates an org or accepts an invite, they end up here.
// Renders:
//   1. Org header (name + slug + your role)
//   2. Member directory (everyone in the org with role + join date)
//   3. Pending invites section (visible to owners + admins only)
//   4. Invite-member form (visible to owners + admins only)
//
// Permission model
// ----------------
// Page render: must be a member of the org (any role). Non-members
// hit notFound() — we don't 403 because that leaks org existence
// to non-members.
//
// Manage-members surface (invite list + invite form): only owners
// and admins. Pinned by `canManageMembers()`. Members of the org
// see the org details + member list but no manage UI.
//
// Phase F-4 (2026-05-05) added per-member management actions:
//   - Per-member role-change ("Make admin" / "Make member") — wired
//     to changeRoleAction with strict-outrank + authority-to-grant
//     enforcement at write time.
//   - Remove-member — wired to removeMemberAction. Self-leave path
//     for non-owners on their own row.
//   - Transfer-ownership flow — wired to transferOwnershipAction.
//     Owner-only, gated by actor role check on render AND owner_user_id
//     column verification at write time.
//
// What this page STILL does NOT do
// --------------------------------
// - Org settings (rename / change billing mode / delete org)
// - Per-member usage stats (would query ai_usage joined on
//   organization_members)

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  canManageMembers,
  getMemberRole,
  isMultiSeatEnabled,
  loadOrgBySlug,
  loadOrgInvites,
  loadOrgMembersWithUsers,
  loadOrgMemberUsage,
} from "@/lib/orgs/queries";
import { CancelInviteButton } from "./CancelInviteButton";
import { InviteMemberForm } from "./InviteMemberForm";
import { MemberActions } from "./MemberActions";

export const metadata: Metadata = {
  title: "Organization",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Params {
  slug: string;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortUser(userId: string): string {
  if (userId.length <= 16) return userId;
  return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}

/**
 * Pick the best human-readable label for a member row.
 * Preference order: email (always present for active accounts) → name
 * (NextAuth users created without a name skip this column) → user-id
 * fragment (shouldn't happen post-leftJoin, but defensive fallback in
 * case the users row went missing).
 */
function memberLabel(m: {
  email: string | null;
  name: string | null;
  userId: string;
}): string {
  if (m.email && m.email.length > 0) return m.email;
  if (m.name && m.name.length > 0) return m.name;
  return shortUser(m.userId);
}

export default async function OrgLandingPage({
  params,
}: {
  params: Params;
}) {
  const slug = String(params.slug ?? "");

  // -- 1. Auth gate ---------------------------------------------------
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (typeof userId !== "string") {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/app/org/${slug}`)}`,
    );
  }

  // -- 2. Resolve slug → org -----------------------------------------
  // notFound() (not 403) on miss — we don't want to leak whether
  // this slug exists to non-members.
  const org = await loadOrgBySlug(slug);
  if (!org) notFound();

  // -- 3. Membership check -------------------------------------------
  // Same notFound() rationale: leaking "you're not a member of
  // this org" tells non-members it exists.
  const role = await getMemberRole(org.id, userId);
  if (role === null) notFound();

  // -- 4. Load org details --------------------------------------------
  const canManage = await canManageMembers(org.id, userId);
  const [members, pendingInvites, memberUsage] = await Promise.all([
    // loadOrgMembersWithUsers joins on the users table so the page
    // shows email + name in the directory + management UI, not just
    // opaque user-id fragments. Owners + admins managing the team
    // need to see who they're promoting/removing.
    loadOrgMembersWithUsers(org.id),
    canManage ? loadOrgInvites(org.id, { includeAccepted: false }) : [],
    // Per-member usage rollup is owners + admins only — members
    // don't see what other members have spent.
    canManage ? loadOrgMemberUsage(org.id, 30) : [],
  ]);

  // userId → { calls, creditsSpent } lookup so the usage section can
  // render in the same order as the member directory.
  const usageByUserId = new Map(
    memberUsage.map((u) => [u.userId, u]),
  );
  const totalOrgCredits = memberUsage.reduce(
    (acc, u) => acc + u.creditsSpent,
    0,
  );
  const totalOrgCalls = memberUsage.reduce(
    (acc, u) => acc + u.calls,
    0,
  );

  const enabled = isMultiSeatEnabled(userId);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        maxWidth: 960,
      }}
    >
      <header>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          ORGANIZATION
        </div>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>
          {org.name}
        </h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          <code style={{ fontSize: 12 }}>{org.slug}</code> · You are{" "}
          <strong>
            {role === "owner"
              ? "the owner"
              : role === "admin"
              ? "an admin"
              : "a member"}
          </strong>{" "}
          · Billing mode: <code style={{ fontSize: 12 }}>{org.billingMode}</code>
        </p>
      </header>

      {/* Beta banner when MULTI_SEAT is off (operators viewing the
          page during pre-launch testing) */}
      {!enabled ? (
        <div
          role="status"
          className="card"
          style={{
            padding: "10px 14px",
            borderColor: "#f57c00",
            background: "color-mix(in oklab, #f57c00 8%, transparent)",
            fontSize: 13,
            color: "#f57c00",
          }}
        >
          <strong>Beta:</strong> the team plan is staged but not yet
          live for users. Members + invites you create here are real,
          but the create-org flow is not yet exposed publicly.
        </div>
      ) : null}

      {/* Member directory */}
      <section className="card" style={{ padding: 20 }}>
        <h2
          style={{
            fontSize: 16,
            margin: "0 0 12px",
            fontWeight: 700,
          }}
        >
          Members ({members.length})
        </h2>
        <div style={{ display: "grid", gap: 8 }}>
          {members.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: 6,
                background: m.userId === userId ? "var(--bg-2)" : "transparent",
                border: "1px solid var(--border)",
              }}
            >
              <div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {memberLabel(m)}
                </span>
                {m.email && m.name && m.name !== m.email ? (
                  <span
                    className="muted"
                    style={{ fontSize: 11, marginLeft: 8 }}
                  >
                    {m.name}
                  </span>
                ) : null}
                {m.userId === userId ? (
                  <span
                    className="muted"
                    style={{ fontSize: 11, marginLeft: 8 }}
                  >
                    (you)
                  </span>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background:
                      m.role === "owner"
                        ? "color-mix(in oklab, #4caf50 14%, transparent)"
                        : m.role === "admin"
                        ? "color-mix(in oklab, var(--accent) 14%, transparent)"
                        : "var(--bg-2)",
                    color:
                      m.role === "owner"
                        ? "#4caf50"
                        : m.role === "admin"
                        ? "var(--accent)"
                        : "var(--fg-subtle)",
                    fontWeight: 600,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                  }}
                >
                  {m.role}
                </span>
                <span
                  className="muted"
                  style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
                >
                  joined {fmtDate(m.joinedAt)}
                </span>
                {/* Per-member management actions (Phase F-4). The
                    component handles its own visibility — renders
                    null when actor has no available actions on
                    this row. */}
                <MemberActions
                  orgId={org.id}
                  actorUserId={userId}
                  actorRole={role}
                  targetUserId={m.userId}
                  targetRole={m.role}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Usage rollup (last 30 days) — owners + admins only.
          Caveat: ai_usage doesn't carry org_id today, so a user
          who's in multiple orgs has their calls double-counted
          across orgs. Honest disclosure in copy below. */}
      {canManage ? (
        <section className="card" style={{ padding: 20 }}>
          <h2
            style={{
              fontSize: 16,
              margin: "0 0 4px",
              fontWeight: 700,
            }}
          >
            Usage — last 30 days
          </h2>
          <p
            className="muted"
            style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}
          >
            Total: <strong>{totalOrgCalls.toLocaleString()}</strong> calls,{" "}
            <strong>{totalOrgCredits.toLocaleString()}</strong> credits spent.
            {memberUsage.length === 0
              ? " No activity yet."
              : ""}{" "}
            Note: a member who&rsquo;s in multiple organizations has
            their per-call usage counted in each — billing-mode
            wire-up (Phase F-4 follow-on) is what disambiguates which
            org actually paid.
          </p>
          {memberUsage.length > 0 ? (
            <div style={{ display: "grid", gap: 6 }}>
              {members
                .map((m) => {
                  const u = usageByUserId.get(m.userId);
                  const calls = u?.calls ?? 0;
                  const credits = u?.creditsSpent ?? 0;
                  return { m, calls, credits };
                })
                .sort((a, b) => b.credits - a.credits)
                .map(({ m, calls, credits }) => (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 12px",
                      borderRadius: 4,
                      background:
                        m.userId === userId ? "var(--bg-2)" : "transparent",
                      border: "1px solid var(--border)",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{memberLabel(m)}</span>
                    <span
                      className={credits === 0 ? "muted" : undefined}
                      style={{
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 11,
                      }}
                    >
                      {calls.toLocaleString()} calls ·{" "}
                      <strong>
                        {credits.toLocaleString()}
                      </strong>{" "}
                      credits
                    </span>
                  </div>
                ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Pending invites — owners + admins only */}
      {canManage ? (
        <section className="card" style={{ padding: 20 }}>
          <h2
            style={{
              fontSize: 16,
              margin: "0 0 12px",
              fontWeight: 700,
            }}
          >
            Pending invites ({pendingInvites.length})
          </h2>
          {pendingInvites.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              No outstanding invites.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {pendingInvites.map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    fontSize: 13,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{inv.email}</span>
                    <span
                      className="muted"
                      style={{ fontSize: 11, marginLeft: 8 }}
                    >
                      ({inv.role}) · expires {fmtDate(inv.expiresAt)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <code
                      style={{
                        fontSize: 11,
                        color: "var(--fg-subtle)",
                      }}
                    >
                      invited {fmtDate(inv.createdAt)}
                    </code>
                    <CancelInviteButton
                      orgId={org.id}
                      inviteId={inv.id}
                      email={inv.email}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* Invite form — owners + admins only */}
      {canManage ? (
        <section className="card" style={{ padding: 20 }}>
          <h2
            style={{
              fontSize: 16,
              margin: "0 0 12px",
              fontWeight: 700,
            }}
          >
            Invite a new member
          </h2>
          <p
            className="muted"
            style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}
          >
            Generates an invite link valid for 7 days. Today the link
            is rendered on the success card — copy + send it
            manually. Phase F-4 wires automatic email dispatch (depends
            on §11 SendGrid/Postmark).
          </p>
          <InviteMemberForm orgId={org.id} orgSlug={org.slug} />
        </section>
      ) : null}

      {/* Footer links */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link
          href="/app/dashboard"
          className="muted"
          style={{ fontSize: 13 }}
        >
          ← Back to dashboard
        </Link>
        {/* Settings link — owner-only (rename + delete are owner-only
            actions; admins use the management UI on this page for
            members + invites). */}
        {role === "owner" ? (
          <Link
            href={`/app/org/${org.slug}/settings`}
            className="muted"
            style={{ fontSize: 13 }}
          >
            Settings →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
