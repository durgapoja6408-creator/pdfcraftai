// app/app/refer/page.tsx — User-facing referral page (PENDING §3e Phase E,
// 2026-05-05).
//
// Shows the signed-in user their unique referral code + a shareable URL
// + their attribution stats. Pairs with the foundation shipped in commit
// 6a49736 (lib/referrals/codes.ts + queries.ts + admin viewer).
//
// What this page does
// -------------------
// 1. Server-side calls `getOrCreateReferralCode(userId)` to lazy-create
//    the code on first visit. Idempotent — subsequent visits return
//    the same code.
// 2. Renders the code, a copy-the-URL button (client-side), and the
//    user's referral stats (total signups attributed + how many were
//    rewarded).
// 3. Surfaces the program status honestly:
//    - Flag ON  → "When someone signs up with your code, you both get
//                  a bonus" (Phase E: details depend on the eventual
//                  reward grant amounts; today the page is generic).
//    - Flag OFF → "We're testing the program. Share your code anyway —
//                  attribution will track silently and rewards land
//                  retroactively if eligible." This is honest about
//                  the staging state without making promises.
//
// What this page does NOT do (yet — Phase E follow-on)
// ----------------------------------------------------
// - Actually GRANT rewards. The writers (`recordReferralSignup`,
//   `grantReferrerReward`, `grantReferredReward`) live in a separate
//   `lib/referrals/writers.ts` module that doesn't yet exist; Phase
//   E adds them and wires them into the signup flow.
// - Show a leaderboard or social proof. Adding "X people have
//   referred this month" requires aggregate queries we don't need
//   for v1.
// - Configure the reward amounts. Hard-coded in the copy below at
//   their tentative values; final amounts are a Phase E decision.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getOrCreateReferralCode } from "@/lib/referrals/codes";
import { loadReferrerStats, isReferralsEnabled } from "@/lib/referrals/queries";
import { ReferralCopyButtons } from "./ReferralCopyButtons";

export const metadata: Metadata = {
  title: "Refer a friend",
  description:
    "Share your code. When someone signs up using it, you both get a bonus.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Tentative reward values — final amounts are a Phase E business
// decision and may change. Centralizing them here so the page copy
// stays in sync with whatever the writer module ends up granting.
const REFERRER_REWARD_CREDITS = 25;
const REFERRED_REWARD_CREDITS = 25;

export default async function ReferPage() {
  const session = await auth();
  const userId = session?.user
    ? (session.user as { id?: string }).id
    : undefined;
  if (!userId) {
    redirect("/login?callbackUrl=%2Fapp%2Frefer");
  }

  const enabled = isReferralsEnabled();

  // Lazy-create the code. Helper is idempotent so we can call it on
  // every page visit without worrying about duplicate-row errors.
  let code: string;
  let stats: { totalReferrals: number; rewardedReferrals: number };
  try {
    const codeRow = await getOrCreateReferralCode(userId);
    code = codeRow.code;
    stats = await loadReferrerStats(userId);
  } catch (err) {
    // Foundation is bulletproof in tests but production has unknown
    // unknowns. Surface a graceful fallback rather than 500-ing the
    // whole page.
    return (
      <div style={{ maxWidth: 720, padding: "24px 0" }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>Refer a friend</h1>
        <div
          role="alert"
          className="card"
          style={{
            marginTop: 16,
            padding: "12px 14px",
            borderColor: "#c00",
            background: "color-mix(in oklab, #c00 6%, transparent)",
            fontSize: 14,
          }}
        >
          Couldn’t load your referral code right now. Refresh in a moment, or
          contact support if it keeps failing.{" "}
          <span className="muted" style={{ fontSize: 12 }}>
            ({err instanceof Error ? err.message : "unknown"})
          </span>
        </div>
      </div>
    );
  }

  const referralUrl = `https://pdfcraftai.com/?ref=${code}`;

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
        <div className="eyebrow" style={{ marginBottom: 6 }}>REFER</div>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>
          Share pdfcraft ai
        </h1>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          {enabled
            ? `When someone signs up using your code, you get ${REFERRER_REWARD_CREDITS} credits and they get ${REFERRED_REWARD_CREDITS} bonus credits on their first purchase.`
            : "We're testing this program. Share your code anyway — attributions track silently in the background and rewards land retroactively once we go live."}
        </p>
      </header>

      {/* Status banner — only shown when flag is OFF. Honest about
          staging state. */}
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
          <strong>Beta:</strong> the referral program is being staged. Your
          code is real and persistent; attribution is tracked but reward
          credits aren&rsquo;t granted automatically yet.
        </div>
      ) : null}

      {/* Code + URL card */}
      <div className="card" style={{ padding: 20 }}>
        <div className="eyebrow" style={{ margin: 0 }}>YOUR CODE</div>
        <div
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "0.08em",
            margin: "8px 0 16px",
          }}
        >
          {code}
        </div>

        <div className="eyebrow" style={{ margin: 0 }}>
          SHAREABLE LINK
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 8,
            padding: "10px 12px",
            background: "var(--bg-2)",
            borderRadius: 6,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            wordBreak: "break-all",
          }}
        >
          {referralUrl}
        </div>

        <div style={{ marginTop: 16 }}>
          <ReferralCopyButtons code={code} url={referralUrl} />
        </div>
      </div>

      {/* Stats */}
      <div className="card" style={{ padding: 20 }}>
        <div className="eyebrow" style={{ margin: 0 }}>YOUR STATS</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 12,
          }}
        >
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Signups attributed
            </div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {stats.totalReferrals}
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Rewards earned
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color:
                  stats.rewardedReferrals > 0 ? "#4caf50" : "var(--fg)",
              }}
            >
              {stats.rewardedReferrals}
            </div>
          </div>
        </div>
        {stats.totalReferrals === 0 ? (
          <p
            className="muted"
            style={{ fontSize: 13, marginTop: 12, lineHeight: 1.5 }}
          >
            No signups yet. Share your code on social, in your team chat,
            or as a one-line P.S. on emails you already send.
          </p>
        ) : null}
      </div>

      {/* How it works */}
      <div className="card" style={{ padding: 20 }}>
        <div className="eyebrow" style={{ margin: 0 }}>HOW IT WORKS</div>
        <ol
          style={{
            margin: "12px 0 0",
            paddingLeft: 20,
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          <li>Share your link with anyone who works with PDFs.</li>
          <li>
            They sign up using your link. The code is auto-applied; they
            don&rsquo;t need to type anything.
          </li>
          <li>
            {enabled ? (
              <>
                When they verify their email, they get{" "}
                <strong>{REFERRED_REWARD_CREDITS} bonus credits</strong>. When
                they make their first purchase, you get{" "}
                <strong>{REFERRER_REWARD_CREDITS} credits</strong>.
              </>
            ) : (
              <>
                Their signup is attributed to your code in our database.
                Once we go live with the program, eligible attributions
                will receive credits retroactively.
              </>
            )}
          </li>
        </ol>
      </div>

      {/* Back link */}
      <div>
        <Link
          href="/app/dashboard"
          className="muted"
          style={{ fontSize: 13 }}
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
