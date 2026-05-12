// Hostinger SMTP transport (plan §11 in PRICING_AND_TELEMETRY_PLAN.md).
//
// Single nodemailer transporter shared across all server-side email
// senders (verification, password reset, future transactional types).
// Lazy-initialised so a missing SMTP_PASS at boot doesn't crash the
// runtime — the transporter is created on first use, and individual
// send attempts log + fail-soft if creds are missing.
//
// Why nodemailer
//   It's a transitive dep of next-auth's email provider, so already in
//   the lock file. No new dep needed. Standard Node.js SMTP client
//   with sane defaults.
//
// Caveats
//   - Hostinger Premium plan: ~300 emails/hour, ~7000/day. Triggers
//     to migrate to Resend documented in PLAN §11 (gap 11).
//   - DKIM/SPF/DMARC: must be configured for support@pdfcraftai.com
//     in Hostinger panel. If unconfigured, verification emails go to
//     spam at ~10-15% rate. Test via mail-tester.com after first
//     send.
//
// Failure semantics
//   sendEmail() returns { ok: false } and logs to stderr if SMTP_PASS
//   is missing OR the SMTP send throws. Caller is responsible for
//   deciding what to do with a failed send (e.g. registerAction logs
//   the failure but doesn't abort signup — better to have an
//   un-verified user than no user).

import "server-only";

interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface SendEmailResult {
  ok: boolean;
  error?: string;
}

let cachedTransporter: unknown = null;

async function getTransporter(): Promise<unknown> {
  if (cachedTransporter) return cachedTransporter;
  // Dynamic import — nodemailer is a transitive dep (next-auth's
  // email provider pulls it). We don't add @types/nodemailer to keep
  // the explicit dep surface small; access the module via @ts-ignore
  // since the runtime works fine without types.
  // @ts-expect-error — no type declarations for nodemailer in deps
  const mod = await import("nodemailer");
  const nodemailer = (mod as { default?: { createTransport: (opts: unknown) => unknown } }).default
    ?? (mod as { createTransport: (opts: unknown) => unknown });
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.hostinger.com",
    port: parseInt(process.env.SMTP_PORT ?? "465", 10),
    secure: process.env.SMTP_SECURE !== "false",
    auth: {
      user: process.env.SMTP_USER ?? "support@pdfcraftai.com",
      pass: process.env.SMTP_PASS ?? "",
    },
    // Connect/socket timeouts so a network blip doesn't hang the
    // request thread. 8s total — Hostinger SMTP responds in <500ms
    // when healthy.
    connectionTimeout: 8000,
    socketTimeout: 8000,
  });
  return cachedTransporter;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!process.env.SMTP_PASS) {
    console.warn("[smtp] SMTP_PASS not configured — email send skipped");
    return { ok: false, error: "smtp_not_configured" };
  }

  try {
    const transporter = (await getTransporter()) as {
      sendMail: (opts: Record<string, unknown>) => Promise<unknown>;
    };

    const fromName = process.env.SMTP_FROM_NAME ?? "pdfcraft ai";
    const fromEmail = process.env.SMTP_FROM_EMAIL ?? "support@pdfcraftai.com";

    // 2026-05-12 SEV-1 audit fix: add List-Unsubscribe headers per
    // Gmail / Yahoo bulk-sender rules (Feb 2024). These headers
    // become MANDATORY for any sender above ~5,000 messages/day or
    // any sender flagged for low engagement; setting them now keeps
    // deliverability healthy as volume scales and protects sender
    // reputation pre-emptively.
    //
    // Two-method header per RFC 8058: a mailto: link (universally
    // supported) + an https: one-click endpoint (Gmail/Yahoo prefer
    // this; renders as a one-click "Unsubscribe" button in the
    // recipient's client). The mailto: address aliases to the
    // standard support inbox — every transactional we send TODAY is
    // an account-essential email (verification, password reset,
    // payment receipt) that the user effectively can't unsubscribe
    // from at the application level, so the mailto: provides a
    // human-handled escape hatch rather than a true list-removal.
    //
    // List-Unsubscribe-Post: List-Unsubscribe=One-Click tells the
    // recipient client to POST to the URL without further
    // confirmation (saves a round-trip vs the older click-through
    // pattern). When we add a marketing email surface, the
    // /api/email/unsubscribe handler should accept that POST and
    // unsubscribe the listed address from the relevant list.
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://pdfcraftai.com";
    const unsubscribeMailto = `<mailto:${fromEmail}?subject=Unsubscribe>`;
    const unsubscribeUrl = `<${baseUrl}/api/email/unsubscribe>`;

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      headers: {
        "List-Unsubscribe": `${unsubscribeMailto}, ${unsubscribeUrl}`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[smtp] send failed:", msg);
    return { ok: false, error: msg };
  }
}
