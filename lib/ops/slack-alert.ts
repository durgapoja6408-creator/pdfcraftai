// Operational Slack alert helper (PENDING §2a / §2b foundation, 2026-05-04).
//
// One-paragraph summary
// ---------------------
// Several modules across the codebase have TODO markers that
// reference "post a Slack alert when X" — `lib/ai/margin-rollup.ts`
// emits `eval.floor.alarm` events on margin floor breaches,
// `lib/payments/dunning.ts` flags subscriptions transitioning to
// past_due / suspended, `lib/ai/quality-signal.ts` (commit
// `81087df`) wants to ping the operator when a user crosses the
// flagged threshold, and the cron-failure-escalation gap (PENDING
// §2b) needs a way to surface a missed nightly rollup. They were
// all writing to the same TODO without a shared helper to call.
// This module is that helper.
//
// What this module does
// ---------------------
// `sendSlackAlert({ severity, title, body, context? })` POSTs a
// Slack-formatted payload to a webhook URL read from the
// `SLACK_OPS_WEBHOOK_URL` env var. Three severities (`info`,
// `warn`, `alarm`) drive Slack attachment colors. Optional
// `context` is a key→value record rendered as a Slack "fields"
// block. Returns a result envelope so callers can react to a
// failed delivery without a try/catch — but never THROWS, because
// an alerter that crashes the alerting target is a fire that just
// got worse.
//
// Why not call hooks.slack.com directly from each consumer
// --------------------------------------------------------
// Three reasons:
//   1. Env-var read in one place. Today the var is unset on the
//      Hostinger panel (PENDING §2a — founder action). When it
//      lands, every consumer of this helper goes from "no-op"
//      to "live" simultaneously without per-call-site wiring.
//   2. Payload shape consistency. /admin operators reading the
//      Slack channel expect every alert to look the same — same
//      title placement, same severity color coding, same context
//      field layout. A shared formatter prevents drift.
//   3. Failure handling consistency. Every alerter must swallow
//      network/4xx errors silently — a Slack outage shouldn't
//      take down the cron job that was trying to alert ABOUT a
//      different outage. Centralizing the catch logic ensures
//      no consumer accidentally re-throws.
//
// What this module does NOT do
// ----------------------------
// - Email fallback when Slack is unreachable. Possible follow-up
//   once a transactional email provider is wired.
// - Rate-limiting / dedup. If the same alarm fires 100 times in
//   30 seconds, this module sends 100 messages. Future improvement:
//   in-memory LRU keyed on `${severity}:${title}` with a 5-minute
//   suppression window. Not worth shipping until we have evidence
//   of actual alert spam.
// - Persistence. Alerts go to Slack and stdout (for the deploy
//   log) but not to a database. Adding `ops_alerts` table would
//   let `/admin/alerts` page show history; pushing to the next
//   Phase since we don't yet have a clear use case for re-querying.

/**
 * Severity bucket. Drives Slack attachment color and the
 * `:emoji:` prefix on the title. Ordered by escalation:
 *   - `info`: routine notification ("nightly rollup completed")
 *   - `warn`: something needs eyes but isn't broken yet
 *     ("user X has 4 thumbs-down in a row")
 *   - `alarm`: page-the-founder ("ai_daily_margin row missing
 *     for yesterday — cron failed")
 *
 * Stored as a literal union so adding a `critical` tier later is
 * a one-line change here + a one-line change in the color map.
 */
export type SlackAlertSeverity = "info" | "warn" | "alarm";

/**
 * Alert payload. The shape consumers fill out before calling
 * `sendSlackAlert`. `context` is optional for backwards-compat
 * with the simplest "title + body" call site.
 */
export interface SlackAlertInput {
  severity: SlackAlertSeverity;
  /** Short headline. Becomes the bold first line in the Slack message. Cap at ~80 chars for mobile. */
  title: string;
  /**
   * Free-text body. Rendered in Slack's mrkdwn dialect — `*bold*`,
   * `_italic_`, `` `code` ``, `<url|label>` work. Newlines preserved.
   * Cap at ~3000 chars (Slack truncates beyond ~4000 for attachments).
   */
  body: string;
  /**
   * Optional structured context — rendered as a Slack "fields"
   * block where each key/value becomes a small two-column row.
   * Use for things like {"User ID": "u_xyz", "Last seen": "5 min ago"}.
   * The receiver scans these at a glance.
   */
  context?: Record<string, string | number | null | undefined>;
}

/**
 * Return envelope. Consumers can opt to do follow-up logging or
 * fall-through to a different alerting channel based on what
 * happened. Never thrown — always returned.
 */
export type SlackAlertResult =
  | { ok: true; sent: true }
  /** Webhook URL not configured — caller should treat this as a graceful no-op. */
  | { ok: true; sent: false; reason: "no_webhook_configured" }
  /** Network or HTTP failure — caller may want to fall through to console.error. */
  | { ok: false; reason: "delivery_failed"; detail: string };

/**
 * Slack attachment color map. Slack's "good" / "warning" / "danger"
 * sentinel strings render as green / amber / red side-bar; severity
 * literal union maps directly so a refactor that adds a new
 * severity needs to add a color too (TS will catch a missing key).
 */
const COLOR_BY_SEVERITY: Record<SlackAlertSeverity, "good" | "warning" | "danger"> = {
  info: "good",
  warn: "warning",
  alarm: "danger",
};

/**
 * Severity emoji prefix map. Keeps the title scannable in a busy
 * channel — operators learn to glance for the red square.
 */
const EMOJI_BY_SEVERITY: Record<SlackAlertSeverity, string> = {
  info: ":information_source:",
  warn: ":warning:",
  alarm: ":rotating_light:",
};

/**
 * Pure formatter. Builds the Slack-flavored JSON payload from an
 * input. Exported separately from `sendSlackAlert` so tests can
 * exercise the format without touching the network — the CI guard
 * imports this directly to verify shape invariants.
 *
 * Output shape matches the legacy "incoming webhook attachments"
 * format (still supported by all Slack workspace webhooks even
 * after the Block Kit migration). Doesn't use Block Kit because:
 *   1. Attachments format is more forgiving with missing fields —
 *      a malformed Block Kit payload returns a 400 error and the
 *      message disappears; attachments degrade gracefully.
 *   2. The `color` sidebar is the single most useful visual
 *      affordance for severity scanning, and it's an attachments
 *      feature, not a Block Kit feature.
 */
export function formatSlackPayload(input: SlackAlertInput): unknown {
  const fields: Array<{ title: string; value: string; short: boolean }> = [];
  if (input.context) {
    for (const [key, raw] of Object.entries(input.context)) {
      if (raw === null || raw === undefined) continue;
      // Cap each field value at 200 chars — Slack truncates ugly
      // beyond that. If a caller really needs to send a long value,
      // they should put it in `body` instead.
      const value = String(raw).slice(0, 200);
      fields.push({ title: key, value, short: true });
    }
  }

  return {
    attachments: [
      {
        color: COLOR_BY_SEVERITY[input.severity],
        title: `${EMOJI_BY_SEVERITY[input.severity]} ${input.title}`,
        text: input.body,
        fields,
        // ts in seconds, not ms (Slack convention).
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

/**
 * Read the configured webhook URL. Exported as a separate function
 * so the CI guard can verify that a) we read from the right env
 * var name, and b) no caller has hardcoded a URL — that's both a
 * config-rotation hazard AND a credential-in-source-tree hazard.
 *
 * Returns null when the var is unset OR contains an obviously
 * malformed value (not starting with https://). The "obviously
 * malformed" check is defensive — we do NOT do full URL validation
 * because that's pluggable Slack-vs-Discord-vs-Mattermost; the
 * only invariant that's universal is "must be HTTPS".
 */
export function readSlackWebhookUrl(): string | null {
  const raw = process.env.SLACK_OPS_WEBHOOK_URL;
  if (!raw) return null;
  if (!raw.startsWith("https://")) return null;
  return raw;
}

/**
 * Optional `sendSlackAlert` options. The `urlOverride` param exists
 * for backward-compat with the legacy `AI_SPEND_ALERT_SLACK_URL` env
 * var read in `lib/ai/margin-rollup.ts`'s `postMarginAlertToSlack` —
 * during the migration window, that module can resolve its env var
 * fallback chain in-place and pass the result here, so a founder
 * who set the OLD var name keeps getting alerts even after the
 * migration commit lands. New consumers should NOT use
 * `urlOverride`; rely on the canonical `SLACK_OPS_WEBHOOK_URL` env
 * var read by `readSlackWebhookUrl()`.
 */
export interface SendSlackAlertOptions {
  /**
   * If provided, this URL is used INSTEAD of the canonical env var
   * read. Must still pass the https:// validation gate — a
   * non-https override is treated the same as a missing one
   * (graceful no-op return).
   */
  urlOverride?: string;
}

/**
 * Send an alert. Catches every possible failure mode and returns
 * a result envelope; never throws.
 *
 * Implementation notes:
 *   - Uses native `fetch` (Node 18+, Next.js 14 supports it
 *     server-side without a polyfill).
 *   - 5-second timeout. A wedged Slack endpoint shouldn't keep a
 *     cron job pinned for minutes.
 *   - HTTP 200 + body "ok" is success. 200 + non-"ok" body is
 *     unusual but tolerated (some webhooks return JSON instead;
 *     we don't parse).
 *   - 4xx / 5xx → returns delivery_failed. Caller decides whether
 *     to fall through to console.error.
 *   - `options.urlOverride` is the migration escape hatch (see
 *     `SendSlackAlertOptions` JSDoc above) — when present, it
 *     bypasses the canonical env var read.
 */
export async function sendSlackAlert(
  input: SlackAlertInput,
  options?: SendSlackAlertOptions,
): Promise<SlackAlertResult> {
  // Resolve URL: explicit override wins, then canonical env var.
  // The override still has to pass the https:// gate so a typo
  // in the legacy env var name doesn't bypass our defensive check.
  const overrideUrl =
    options?.urlOverride && options.urlOverride.startsWith("https://")
      ? options.urlOverride
      : null;
  const url = overrideUrl ?? readSlackWebhookUrl();
  if (!url) {
    return { ok: true, sent: false, reason: "no_webhook_configured" };
  }

  const payload = formatSlackPayload(input);

  // 5s deadline; if Slack hangs longer than that we bail and
  // return delivery_failed. AbortController is the canonical
  // pattern for fetch timeouts in Node 18+.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: "delivery_failed",
        detail: `HTTP ${res.status} ${res.statusText}`,
      };
    }
    return { ok: true, sent: true };
  } catch (err) {
    return {
      ok: false,
      reason: "delivery_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
