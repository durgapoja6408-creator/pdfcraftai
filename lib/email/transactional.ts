// lib/email/transactional.ts — lifecycle transactional email SENDERS.
//
// Two account-essential transactional types layered on the existing
// Hostinger SMTP transport (lib/auth/smtp.ts):
//
//   1. Welcome — fired once, when a user FIRST verifies their email
//      (NULL → verified transition). Reinforces activation.
//   2. Receipt — fired once per successful one-time pack purchase,
//      gated on the ledger's first-grant signal so a replayed webhook
//      never double-sends.
//
// Pure body construction lives in ./templates (unit-tested in
// isolation). This file is the I/O layer: DB lookup + SMTP send.
//
// Design rules (match the codebase's email + side-effect discipline):
//   - The send* wrappers NEVER throw. A failed/unconfigured SMTP send
//     must not break verification or payment-webhook processing. Each
//     wrapper try/catches and structured-logs, mirroring the
//     grantSignupBonus / triggerReferredReward callers.
//   - sendEmail() itself fail-softs to { ok: false } when SMTP_PASS is
//     unset, so building these is safe even before SMTP is live; they
//     activate automatically once the key is set.

import "server-only";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { sendEmail } from "@/lib/auth/smtp";
import {
  buildReceiptEmail,
  buildWelcomeEmail,
  formatAmount,
} from "./templates";

async function lookupUser(
  userId: string,
): Promise<{ email: string; name: string | null } | null> {
  const [u] = await db
    .select({ email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!u || !u.email) return null;
  return { email: u.email, name: u.name ?? null };
}

/** Send the one-time welcome email. Caller guards on the first-time
 *  verification transition so this fires at most once per account.
 *  Never throws — logs structured on failure. */
export async function sendWelcomeEmail(userId: string): Promise<void> {
  try {
    const user = await lookupUser(userId);
    if (!user) return;
    const { subject, text, html } = buildWelcomeEmail({ name: user.name });
    const res = await sendEmail({ to: user.email, subject, text, html });
    if (!res.ok) {
      console.warn(
        JSON.stringify({
          event: "welcome_email_send_failed",
          userId,
          reason: res.error ?? "unknown",
          ts: new Date().toISOString(),
        }),
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "welcome_email_threw",
        userId,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }),
    );
  }
}

export interface ReceiptInput {
  userId: string;
  packName: string;
  /** Base credits granted for this pack/variant. */
  credits: number;
  /** Bonus credits, if the pack ships any (0 when none). */
  bonusCredits: number;
  /** Amount captured, in minor units (paise/cents). */
  amountMinor: number;
  /** ISO-4217 currency code, e.g. "INR" / "USD". */
  currency: string;
  /** Post-grant balance from the ledger, for the "new balance" line. */
  newBalance: number;
}

/** Send the purchase receipt. Caller fires this ONLY on the first-time
 *  credit grant (baseResult.applied === true) so a replayed webhook
 *  never double-sends. Never throws — logs structured on failure. */
export async function sendReceiptEmail(input: ReceiptInput): Promise<void> {
  try {
    const user = await lookupUser(input.userId);
    if (!user) return;
    const creditsLabel =
      input.bonusCredits > 0
        ? `${input.credits.toLocaleString("en-IN")} + ${input.bonusCredits.toLocaleString("en-IN")} bonus`
        : `${input.credits.toLocaleString("en-IN")}`;
    const { subject, text, html } = buildReceiptEmail({
      packName: input.packName,
      creditsLabel,
      amountLabel: formatAmount(input.amountMinor, input.currency),
      balanceLabel: `${input.newBalance.toLocaleString("en-IN")} credits`,
      dateLabel: new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    });
    const res = await sendEmail({ to: user.email, subject, text, html });
    if (!res.ok) {
      console.warn(
        JSON.stringify({
          event: "receipt_email_send_failed",
          userId: input.userId,
          reason: res.error ?? "unknown",
          ts: new Date().toISOString(),
        }),
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "receipt_email_threw",
        userId: input.userId,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }),
    );
  }
}
