// lib/admin/format.ts — display helpers shared across every /admin/*
// page.
//
// Why here and not inline in each page?
// -------------------------------------
// Every admin page formats the same three things: micro-dollars as
// "$X.XX", bps as "YY.YY%", and large counts with thousand separators.
// If each page does it inline we get subtle differences ("$1.2K" vs
// "$1,200" vs "$1.20k") that make the dashboard feel sloppy. This
// module picks ONE convention per unit and every page uses it.
//
// Unit conventions
// ----------------
//   - µUSD (micros):      raw value stored in DB; 1 USD = 1,000,000 µUSD.
//                         Rendered as "$X.XX" (2 decimals) everywhere
//                         the number fits, "$XXK" / "$X.XM" when it
//                         doesn't (see microsToCompactUsd).
//   - bps:                raw value stored as int in margin_bps /
//                         floor_bps. 10,000 bps = 100%. Rendered as
//                         "XX.XX%" with sign ("+" prefix on positive
//                         so the eye catches red/green at a glance).
//   - count:              int. Rendered with thousand separators.
//   - duration (ms):      int (sum across calls), divided by count for
//                         mean. Rendered as "XXXms" or "X.YYs" when >=
//                         1000ms.
//   - date (ISO / Date):  Pinned to UTC (rollups are UTC-day-based).
//                         Rendered as "YYYY-MM-DD" (ISO short).
//   - relative time:      Used on alarm/transaction feeds. "2m ago",
//                         "3h ago", "5d ago". Never "just now" — too
//                         cute for an ops surface.
//
// Null/undefined handling
// -----------------------
// Admin tables often show mixed populated + NULL rows (Phase B columns
// on pre-Task-#15 ledger entries, Task #17 columns on pre-migration-
// 0013 margin slices). Each formatter treats null/undefined as the
// em-dash "—" rather than "0" or "null" so the operator can tell
// "unmeasured" from "measured-as-zero" at a glance.

/**
 * Format micro-USD as "$X.XX" (USD, 2 decimals, thousand separators).
 * 1 USD = 1,000,000 µUSD. Negative values are rendered with a leading
 * minus sign. null/undefined → "—".
 */
export function microsToUsd(micros: number | null | undefined): string {
  if (micros === null || micros === undefined || Number.isNaN(micros)) {
    return "—";
  }
  const usd = micros / 1_000_000;
  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  return `${sign}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Compact variant for headline cards: "$1.2M", "$42K", "$3.50".
 * Under $1000 shows two decimals; otherwise compact notation.
 */
export function microsToCompactUsd(
  micros: number | null | undefined
): string {
  if (micros === null || micros === undefined || Number.isNaN(micros)) {
    return "—";
  }
  const usd = micros / 1_000_000;
  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  if (abs < 1000) {
    return `${sign}$${abs.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  const formatted = abs.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  });
  return `${sign}$${formatted}`;
}

/**
 * Format basis points as "XX.XX%". 10,000 bps = 100%.
 * Always shows sign ("+" / "-") so red/green is scannable.
 * null/undefined → "—".
 */
export function bpsToPercent(
  bps: number | null | undefined,
  opts: { showSign?: boolean } = {}
): string {
  if (bps === null || bps === undefined || Number.isNaN(bps)) {
    return "—";
  }
  const pct = bps / 100;
  const showSign = opts.showSign ?? true;
  const sign = showSign && pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Format a count with thousand separators. null/undefined → "—".
 */
export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US");
}

/**
 * Format milliseconds. < 1000 → "XXXms"; >= 1000 → "X.YYs".
 * null/undefined → "—".
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Render a Date (or ISO string) as "YYYY-MM-DD" in UTC. Admin rollups
 * are UTC-day based; anything else would invite "why is today's
 * number zero" questions during the local-timezone overlap window.
 */
export function formatUtcDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

/**
 * Format a Date (or ISO string) as "YYYY-MM-DD HH:MM:SS UTC" —
 * the full timestamp. Used in per-row cells where the admin needs
 * to diff two events at the second level (webhook log, alarms).
 */
export function formatUtcDateTime(
  d: Date | string | null | undefined
): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

/**
 * Short relative-time string. "Just now", "1m ago", "2h ago", "3d ago",
 * "5w ago", "1y ago". null → "—".
 *
 * Uses the "largest unit that fits" rule so the eye gets one number,
 * not five.
 */
export function formatRelative(
  d: Date | string | null | undefined,
  nowMs: number = Date.now()
): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  const t = date.getTime();
  if (Number.isNaN(t)) return "—";
  const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWk = Math.floor(diffDay / 7);
  if (diffWk < 52) return `${diffWk}w ago`;
  const diffYr = Math.floor(diffDay / 365);
  return `${diffYr}y ago`;
}

/**
 * Boolean display helper — returns "yes" / "no" / "—" rather than the
 * ambiguous "true" / "false" / "undefined". Same rationale as formatCount:
 * an operator glancing at the column needs a one-glance answer.
 */
export function formatBool(b: boolean | null | undefined): string {
  if (b === null || b === undefined) return "—";
  return b ? "yes" : "no";
}

/**
 * Mask an email for the transactions/users list. Keeps the first and
 * last character of the local part + the domain ("r***m@example.com")
 * so a clipboard-paste hijack via screenshot leak doesn't hand the
 * full identifier away. Admins can always click through to the
 * per-user page for the unmasked version.
 *
 * Short locals (<=2 chars) pass through — no useful masking possible.
 */
export function maskEmail(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "—";
  const at = raw.indexOf("@");
  if (at <= 0) return raw;
  const local = raw.slice(0, at);
  const domain = raw.slice(at);
  if (local.length <= 2) return raw;
  return `${local[0]}***${local[local.length - 1]}${domain}`;
}
