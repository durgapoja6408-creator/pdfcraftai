// lib/email/templates.ts — PURE email-body builders (no I/O).
//
// Split out from transactional.ts so these can be unit-tested in
// isolation (the senders import "server-only" + db, which can't load
// in a plain Node test context). Everything here is a pure function of
// its inputs — no DB, no SMTP, no server-only. All user-controlled
// text is HTML-escaped before interpolation.

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pdfcraftai.com";

/** Minimal HTML-entity escape for any user-controlled string we
 *  interpolate into an email body. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}

/** Shared HTML shell — same visual language as the verification email
 *  (system font, 540px column, blue .btn, muted footer). `inner` is
 *  trusted, pre-escaped HTML assembled by the build* functions. */
function htmlShell(inner: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; color: #1a1c24; max-width: 540px; margin: 40px auto; padding: 0 20px; }
  h1 { font-size: 22px; margin-bottom: 16px; }
  .btn { display: inline-block; padding: 12px 24px; background: #0066ff; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 500; margin: 16px 0; }
  .muted { color: #888; font-size: 13px; line-height: 1.5; }
  table.receipt { width: 100%; border-collapse: collapse; margin: 16px 0; }
  table.receipt td { padding: 8px 0; border-bottom: 1px solid #eee; font-size: 15px; }
  table.receipt td.k { color: #555; }
  table.receipt td.v { text-align: right; font-weight: 500; }
</style>
</head>
<body>
${inner}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p class="muted">— pdfcraft ai · <a href="${SITE}" style="color:#0066ff">${SITE.replace("https://", "")}</a></p>
</body>
</html>`;
}

export interface BuiltEmail {
  subject: string;
  text: string;
  html: string;
}

// --- Welcome --------------------------------------------------------------

export function buildWelcomeEmail(opts: { name?: string | null }): BuiltEmail {
  const rawName = (opts.name ?? "").trim();
  const greetName = rawName ? `, ${rawName}` : "";
  const greetHtml = rawName ? `, ${escapeHtml(rawName)}` : "";

  const subject = "Welcome to pdfcraft ai — here's how to start";

  const text = `Welcome to pdfcraft ai${greetName}!

Your email is verified and your account is ready. pdfcraft ai gives you
113 PDF tools in one place — 60 free, no-signup tools plus AI tools that
summarise, translate, extract, and rewrite your documents.

Sign in to see your credit balance and start:
${SITE}/login

A few good places to begin:
- Browse all tools: ${SITE}/tools
- Chat with a PDF: ${SITE}/chat-with-pdf
- Summarise a long document: ${SITE}/summarize-pdf

Your files are processed for the task and not used to train any model.

— pdfcraft ai · ${SITE.replace("https://", "")}`;

  const inner = `  <h1>Welcome to pdfcraft ai${greetHtml} 👋</h1>
  <p>Your email is verified and your account is ready. pdfcraft ai puts
  <strong>113 PDF tools</strong> in one place — 60 free, no-signup tools plus
  AI tools that summarise, translate, extract, and rewrite your documents.</p>
  <p><a class="btn" href="${SITE}/login">Sign in to start</a></p>
  <p>A few good places to begin:</p>
  <ul>
    <li><a href="${SITE}/tools" style="color:#0066ff">Browse all tools</a></li>
    <li><a href="${SITE}/chat-with-pdf" style="color:#0066ff">Chat with a PDF</a></li>
    <li><a href="${SITE}/summarize-pdf" style="color:#0066ff">Summarise a long document</a></li>
  </ul>
  <p class="muted">Your files are processed for the task you ask for and
  are not used to train any model.</p>`;

  return { subject, text, html: htmlShell(inner) };
}

// --- Receipt --------------------------------------------------------------

export function buildReceiptEmail(opts: {
  packName: string;
  creditsLabel: string;
  amountLabel: string;
  balanceLabel: string;
  dateLabel: string;
}): BuiltEmail {
  const packName = escapeHtml(opts.packName);
  const creditsLabel = escapeHtml(opts.creditsLabel);
  const amountLabel = escapeHtml(opts.amountLabel);
  const balanceLabel = escapeHtml(opts.balanceLabel);
  const dateLabel = escapeHtml(opts.dateLabel);

  const subject = `Your pdfcraft ai receipt — ${opts.packName} (${opts.amountLabel})`;

  const text = `Thank you for your purchase.

Pack:          ${opts.packName}
Credits added: ${opts.creditsLabel}
Amount paid:   ${opts.amountLabel}
Date:          ${opts.dateLabel}
New balance:   ${opts.balanceLabel}

Your credits are available now. See your purchase history and download a
tax invoice any time:
${SITE}/app/billing

This email confirms a completed payment. If you didn't make this purchase,
reply to this message and we'll look into it right away.

— pdfcraft ai · ${SITE.replace("https://", "")}`;

  const inner = `  <h1>Thanks for your purchase 🎉</h1>
  <p>Your credits are available now. Here's a summary for your records:</p>
  <table class="receipt">
    <tr><td class="k">Pack</td><td class="v">${packName}</td></tr>
    <tr><td class="k">Credits added</td><td class="v">${creditsLabel}</td></tr>
    <tr><td class="k">Amount paid</td><td class="v">${amountLabel}</td></tr>
    <tr><td class="k">Date</td><td class="v">${dateLabel}</td></tr>
    <tr><td class="k">New balance</td><td class="v">${balanceLabel}</td></tr>
  </table>
  <p><a class="btn" href="${SITE}/app/billing">View billing &amp; invoices</a></p>
  <p class="muted">This email confirms a completed payment. You can download a
  tax invoice from your billing page. If you didn't make this purchase, just
  reply to this message and we'll look into it right away.</p>`;

  return { subject, text, html: htmlShell(inner) };
}

/** Format a minor-unit amount + currency into a human label. Assumes
 *  2-decimal presentment currencies (every Razorpay currency we use). */
export function formatAmount(amountMinor: number, currency: string): string {
  const cc = (currency || "INR").toUpperCase();
  const symbol = cc === "INR" ? "₹" : cc === "USD" ? "$" : "";
  const major = (amountMinor / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${major} ${cc}`;
}
