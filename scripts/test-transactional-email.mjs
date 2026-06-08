#!/usr/bin/env node
/**
 * test-transactional-email.mjs — guards the lifecycle email batch
 * (backlog D31 welcome + D32 receipt). Static-parse only; the runtime
 * behaviour of the pure builders is covered by test-behavioral-units.mjs.
 *
 * Locks the invariants that make these emails safe:
 *   - templates.ts is PURE (no server-only / no db) so it stays testable
 *   - transactional.ts senders NEVER throw (try/catch + fail-soft)
 *   - welcome fires ONCE, gated on the consume's firstVerification signal
 *     (UPDATE scoped to `emailVerified IS NULL`)
 *   - receipt fires ONCE per purchase, gated on baseResult.applied
 *     (so a replayed webhook can't double-send)
 */
import { readFileSync } from "node:fs";

let pass = 0,
  fail = 0;
const fails = [];
const ok = (c, m) => {
  if (c) pass++;
  else {
    fail++;
    fails.push(m);
  }
};
const read = (p) => {
  try {
    return readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  } catch {
    return "";
  }
};

// ── A. templates.ts — pure presentation layer ──────────────────────
{
  const t = read("lib/email/templates.ts");
  ok(t.length > 0, "lib/email/templates.ts exists");
  for (const fn of [
    "export function buildWelcomeEmail",
    "export function buildReceiptEmail",
    "export function escapeHtml",
    "export function formatAmount",
  ]) {
    ok(t.includes(fn), `templates exports: ${fn}`);
  }
  // PURITY: no server-only, no db import — keeps it unit-testable
  ok(!/^import\s+["']server-only["']/m.test(t), "templates.ts has NO server-only import (pure)");
  ok(!/^import[^\n]*from\s+["']@\/db\/client["']/m.test(t), "templates.ts has NO db import (pure)");
  // escapeHtml handles all five HTML-significant chars
  ok(/&amp;/.test(t) && /&lt;/.test(t) && /&gt;/.test(t) && /&quot;/.test(t) && /&#39;/.test(t), "escapeHtml covers & < > \" '");
  // builders escape user-controlled fields
  ok(/escapeHtml\(opts\.packName\)|packName = escapeHtml/.test(t), "receipt builder escapes packName");
}

// ── B. transactional.ts — senders never throw ──────────────────────
{
  const x = read("lib/email/transactional.ts");
  ok(x.length > 0, "lib/email/transactional.ts exists");
  ok(/import\s+["']server-only["']/.test(x), "transactional.ts is server-only");
  ok(x.includes("export async function sendWelcomeEmail"), "exports sendWelcomeEmail");
  ok(x.includes("export async function sendReceiptEmail"), "exports sendReceiptEmail");
  ok(/from\s+["']\.\/templates["']/.test(x), "imports pure builders from ./templates");
  ok(/from\s+["']@\/lib\/auth\/smtp["']/.test(x), "imports sendEmail from smtp transport");
  // each sender must wrap its body in try/catch (never throw) — two senders, ≥2 catches
  const catches = (x.match(/catch \(err\)/g) || []).length;
  ok(catches >= 2, `both senders try/catch (found ${catches})`);
  ok(/welcome_email_threw/.test(x), "welcome sender logs structured on throw");
  ok(/receipt_email_threw/.test(x), "receipt sender logs structured on throw");
  // fail-soft: returns early when SMTP send not ok (warn, not throw)
  ok(/welcome_email_send_failed/.test(x) && /receipt_email_send_failed/.test(x), "senders warn on !res.ok without throwing");
}

// ── C. consume functions — once-only firstVerification signal ──────
{
  const v = read("lib/auth/email-verification.ts");
  ok(/import \{[^}]*isNull[^}]*\} from "drizzle-orm";/.test(v), "email-verification imports isNull");
  // both UPDATEs scoped to emailVerified IS NULL (preserve original ts + once-only)
  const isNullGuards = (v.match(/isNull\(schema\.users\.emailVerified\)/g) || []).length;
  ok(isNullGuards >= 2, `both consume UPDATEs scoped to emailVerified IS NULL (found ${isNullGuards})`);
  // both consume functions return firstVerification
  const firstVer = (v.match(/firstVerification/g) || []).length;
  ok(firstVer >= 4, `consume functions compute + return firstVerification (found ${firstVer})`);
  ok(/userId: row\.identifier, firstVerification/.test(v), "token consume returns firstVerification");
  ok(/return \{ ok: true, userId, firstVerification \}/.test(v), "code consume returns firstVerification");
  // affectedRows read defensively
  ok(/affectedRows/.test(v), "consume reads affectedRows for the transition signal");
}

// ── D. welcome wiring at BOTH verification success paths ───────────
{
  const page = read("app/verify-email/page.tsx");
  ok(/from "@\/lib\/email\/transactional"/.test(page), "verify-email page imports sendWelcomeEmail");
  ok(/if \(result\.firstVerification\)/.test(page), "verify-email page gates welcome on firstVerification");
  ok(/sendWelcomeEmail\(result\.userId\)/.test(page), "verify-email page calls sendWelcomeEmail");
  ok(/verify_email_welcome_failed/.test(page), "verify-email welcome is swallow-on-failure");

  const route = read("app/api/auth/verify-code/route.ts");
  ok(/from "@\/lib\/email\/transactional"/.test(route), "verify-code route imports sendWelcomeEmail");
  ok(/if \(result\.firstVerification\)/.test(route), "verify-code route gates welcome on firstVerification");
  ok(/sendWelcomeEmail\(result\.userId\)/.test(route), "verify-code route calls sendWelcomeEmail");
  ok(/verify_code_welcome_failed/.test(route), "verify-code welcome is swallow-on-failure");
}

// ── E. receipt wiring in payment capture (idempotent) ──────────────
{
  const l = read("lib/payments/ledger.ts");
  ok(/import\("@\/lib\/email\/transactional"\)/.test(l), "ledger dynamic-imports sendReceiptEmail");
  ok(/if \(baseResult\.applied\)/.test(l), "receipt gated on baseResult.applied (no replay double-send)");
  ok(/sendReceiptEmail\(\{/.test(l), "ledger calls sendReceiptEmail");
  ok(/event\.amount\.amountMinor/.test(l), "receipt uses captured amountMinor");
  ok(/newBalance: baseResult\.newBalance/.test(l), "receipt reports the post-grant balance");
  ok(/payment_captured_receipt_email_failed/.test(l), "receipt send is swallow-on-failure");
}

console.log("");
if (fail === 0) {
  console.log(`transactional-email: ${pass} passed, ${fail} failed`);
  process.exit(0);
} else {
  console.error("FAIL:");
  for (const m of fails) console.error("  - " + m);
  console.log(`transactional-email: ${pass} passed, ${fail} failed`);
  process.exit(1);
}
