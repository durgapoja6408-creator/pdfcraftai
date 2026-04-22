// app/admin/promos/page.tsx — Promo codes inventory + create form.
//
// Task #27 / Phase E.
//
// What this page answers
// ----------------------
// Three questions operators ask, top-to-bottom:
//
//   1. "How much are we giving away right now?" — headline cards for
//      active code count, windowed redemption count, windowed discount
//      given (summed across all codes).
//
//   2. "Which codes exist, which are close to their caps, which are
//      expired but still active in the system?" — main inventory
//      table with kind, value, campaign, redemption counts, and
//      start/expiry windows.
//
//   3. "Let me mint a new code" — create form at the bottom (NOT at the
//      top — the inventory is read-first, write-second for a surface
//      that an operator visits for read 90% of the time).
//
// Why a server-action form and not a separate /admin/promos/new page:
// -------------------------------------------------------------------
// The create flow is a dozen fields and every field is cheap to show.
// Keeping it inline means the operator can see existing codes while
// typing a new one — useful for "does WELCOME10 already exist?" -type
// reasoning. A separate /new page would hide that context.
//
// Why the disable button lives in each row:
// -----------------------------------------
// Soft-deletes are meant to be trivially fast — operator sees a weird
// redemption pattern, clicks Disable, the code is dead in one round-trip.
// No confirmation modal because the operation is reversible through a
// DB update (set is_active=1) and the audit columns (disabled_at,
// disabled_by) preserve intent.
//
// Caution: this page is ADMIN-only. Non-admin sessions get 404 via
// requireAdmin() inside the admin server actions.

import { revalidatePath } from "next/cache";

import {
  adminCreatePromoCodeAction,
  adminDisablePromoCodeAction,
} from "@/lib/promos/actions";
import { getPromoCodeInventory } from "@/lib/admin/phase-e-queries";
import {
  formatCount,
  formatUtcDate,
  microsToCompactUsd,
} from "@/lib/admin/format";
import {
  DayPicker,
  ErrorBanner,
  SectionTitle,
  StatCard,
  Td,
  Th,
  clampDays,
  tableStyle,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// =====================================================================
// Form action wrappers — bridge FormData -> typed action inputs
// =====================================================================
//
// The server actions live in lib/promos/actions.ts and take plain JS
// objects. The HTML form posts FormData. These thin adapters parse
// the form inputs, call the action, then revalidatePath so the new
// row appears on the next render without a full navigation.

async function createPromoFormAction(formData: FormData): Promise<void> {
  "use server";

  const code = String(formData.get("code") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as
    | "percent"
    | "flat"
    | "bonus_credits";
  const valueRaw = String(formData.get("value") ?? "").trim();
  const currencyRaw = String(formData.get("currency") ?? "").trim();
  const packIdsRaw = String(formData.get("packIds") ?? "").trim();
  const annualOnly = formData.get("annualOnly") === "on";
  const maxRedemptionsRaw = String(
    formData.get("maxRedemptions") ?? ""
  ).trim();
  const perUserLimitRaw = String(formData.get("perUserLimit") ?? "").trim();
  const startsAtRaw = String(formData.get("startsAt") ?? "").trim();
  const expiresAtRaw = String(formData.get("expiresAt") ?? "").trim();
  const campaign = String(formData.get("campaign") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const value = Number(valueRaw);

  // Each parse conversion stays local — the server action does
  // authoritative validation, but converting here gives us JS-native
  // types (Date, number, null) that match the action's signature.
  await adminCreatePromoCodeAction({
    code,
    kind,
    value: Number.isFinite(value) ? value : 0,
    currency:
      currencyRaw === "USD" || currencyRaw === "INR" ? currencyRaw : null,
    packIds: packIdsRaw || null,
    annualOnly,
    maxRedemptions: maxRedemptionsRaw ? Number(maxRedemptionsRaw) : null,
    perUserLimit: perUserLimitRaw ? Number(perUserLimitRaw) : null,
    startsAt: startsAtRaw ? new Date(startsAtRaw) : null,
    expiresAt: expiresAtRaw ? new Date(expiresAtRaw) : null,
    campaign: campaign || null,
    notes: notes || null,
  });

  revalidatePath("/admin/promos");
}

async function disablePromoFormAction(formData: FormData): Promise<void> {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await adminDisablePromoCodeAction({ id });
  revalidatePath("/admin/promos");
}

// =====================================================================
// Helpers — display-only formatters
// =====================================================================

function formatPromoValue(
  kind: "percent" | "flat" | "bonus_credits",
  value: number,
  currency: string | null
): string {
  if (kind === "percent") {
    // value is basis points (10000 = 100%)
    return `${(value / 100).toFixed(2)}%`;
  }
  if (kind === "flat") {
    // value is micros
    const symbol = currency === "INR" ? "₹" : "$";
    return `${symbol}${(value / 1_000_000).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  // bonus_credits — raw integer count
  return `${formatCount(value)} credits`;
}

function redemptionCapLabel(
  windowRedemptions: number,
  lifetimeRedemptions: number,
  maxRedemptions: number | null
): string {
  const window = formatCount(windowRedemptions);
  const lifetime = formatCount(lifetimeRedemptions);
  if (maxRedemptions === null) {
    return `${window} (${lifetime} lifetime)`;
  }
  return `${window} (${lifetime}/${formatCount(maxRedemptions)} lifetime)`;
}

export default async function AdminPromosPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const days = clampDays(searchParams.days, 30);
  const inventory = await getPromoCodeInventory({ days });

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Promos</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Promotional codes — percent, flat, and bonus-credit discounts. Soft-
          deletes preserve the audit trail; lifetime stats include disabled
          codes.
        </p>
      </header>

      <div style={{ marginBottom: 16 }}>
        <DayPicker current={days} base="/admin/promos" />
      </div>

      {!inventory.ok ? (
        <ErrorBanner message={`Promo inventory query failed: ${inventory.error}`} />
      ) : null}

      {inventory.ok ? (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <StatCard
            label="Active codes"
            value={formatCount(inventory.data.totalActiveCodes)}
            hint={`of ${formatCount(inventory.data.totalCodes)} total`}
          />
          <StatCard
            label={`Redemptions (${days}d)`}
            value={formatCount(inventory.data.totalWindowRedemptions)}
          />
          <StatCard
            label={`Discount given (${days}d)`}
            value={microsToCompactUsd(inventory.data.totalWindowDiscountMicros)}
            hint="USD-equivalent · mixed-currency codes summed as-is"
            tone={
              inventory.data.totalWindowDiscountMicros > 100_000_000
                ? "warn"
                : undefined
            }
          />
        </section>
      ) : null}

      {inventory.ok && inventory.data.rows.length === 0 ? (
        <section style={{ marginBottom: 32 }}>
          <div
            className="card"
            style={{ padding: 20, textAlign: "center" }}
          >
            <p className="muted" style={{ margin: 0 }}>
              No promo codes yet. Use the form below to mint your first code.
            </p>
          </div>
        </section>
      ) : null}

      {inventory.ok && inventory.data.rows.length > 0 ? (
        <section style={{ marginBottom: 32 }}>
          <SectionTitle>Inventory</SectionTitle>
          <div
            className="card"
            style={{ padding: 0, overflow: "auto" }}
          >
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Kind</Th>
                  <Th align="right">Value</Th>
                  <Th>Currency</Th>
                  <Th>Scope</Th>
                  <Th align="right">{`Redemptions (${days}d)`}</Th>
                  <Th align="right">Discount given</Th>
                  <Th>Window</Th>
                  <Th>Status</Th>
                  <Th>Campaign</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {inventory.data.rows.map((r) => {
                  const scopeBits: string[] = [];
                  if (r.packIds) scopeBits.push(r.packIds);
                  if (r.annualOnly) scopeBits.push("annual-only");
                  const scope = scopeBits.length > 0 ? scopeBits.join(" · ") : "all";

                  const now = Date.now();
                  const isExpired =
                    r.expiresAt !== null && r.expiresAt.getTime() < now;
                  const isPending =
                    r.startsAt !== null && r.startsAt.getTime() > now;

                  let statusLabel: string;
                  let statusColor: string | undefined;
                  if (!r.isActive) {
                    statusLabel = "disabled";
                    statusColor = "#888";
                  } else if (isExpired) {
                    statusLabel = "expired";
                    statusColor = "#b23b3b";
                  } else if (isPending) {
                    statusLabel = "pending";
                    statusColor = "#b7791f";
                  } else {
                    statusLabel = "active";
                    statusColor = "#2f855a";
                  }

                  const windowLabel =
                    r.startsAt || r.expiresAt
                      ? `${formatUtcDate(r.startsAt)} → ${formatUtcDate(r.expiresAt)}`
                      : "—";

                  return (
                    <tr key={r.id}>
                      <Td mono>
                        <strong>{r.code}</strong>
                      </Td>
                      <Td>{r.kind}</Td>
                      <Td align="right" mono>
                        {formatPromoValue(r.kind, r.value, r.currency)}
                      </Td>
                      <Td>{r.currency ?? "any"}</Td>
                      <Td>{scope}</Td>
                      <Td align="right">
                        {redemptionCapLabel(
                          r.windowRedemptions,
                          r.lifetimeRedemptions,
                          r.maxRedemptions
                        )}
                      </Td>
                      <Td align="right" mono>
                        {r.kind === "bonus_credits"
                          ? `${formatCount(r.windowBonusCredits)} cr`
                          : microsToCompactUsd(r.windowDiscountMicros)}
                      </Td>
                      <Td>{windowLabel}</Td>
                      <Td>
                        <span
                          style={{
                            color: statusColor,
                            fontWeight: 600,
                            fontSize: 12,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {statusLabel}
                        </span>
                      </Td>
                      <Td>{r.campaign ?? "—"}</Td>
                      <Td>
                        {r.isActive ? (
                          <form action={disablePromoFormAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <button
                              type="submit"
                              className="btn btn-sm"
                              style={{ color: "#b23b3b" }}
                            >
                              Disable
                            </button>
                          </form>
                        ) : (
                          <span className="muted" style={{ fontSize: 12 }}>
                            {r.disabledBy ?? "—"}
                          </span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section style={{ marginBottom: 32 }}>
        <SectionTitle>Create a new code</SectionTitle>
        <div className="card" style={{ padding: 20 }}>
          <form
            action={createPromoFormAction}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                Code (3–64 chars, uppercase A–Z / 0–9 / _ / -)
              </span>
              <input
                type="text"
                name="code"
                required
                placeholder="WELCOME10"
                className="input"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Kind</span>
              <select name="kind" required className="input" defaultValue="percent">
                <option value="percent">percent (bps)</option>
                <option value="flat">flat (micros)</option>
                <option value="bonus_credits">bonus_credits (count)</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                Value · percent = bps (1000 = 10%)
              </span>
              <input
                type="number"
                name="value"
                required
                min={1}
                placeholder="1000"
                className="input"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                Currency (flat only — else leave blank)
              </span>
              <select name="currency" className="input" defaultValue="">
                <option value="">any</option>
                <option value="USD">USD</option>
                <option value="INR">INR</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                Pack IDs (comma-separated, blank = all)
              </span>
              <input
                type="text"
                name="packIds"
                placeholder="starter,creator"
                className="input"
              />
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                alignSelf: "end",
              }}
            >
              <input type="checkbox" name="annualOnly" />
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                Annual-only (only applies to annual variant)
              </span>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                Max redemptions (blank = unlimited)
              </span>
              <input
                type="number"
                name="maxRedemptions"
                min={1}
                className="input"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                Per-user limit (blank = 1)
              </span>
              <input
                type="number"
                name="perUserLimit"
                min={1}
                placeholder="1"
                className="input"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                Starts at (UTC, blank = immediately)
              </span>
              <input
                type="datetime-local"
                name="startsAt"
                className="input"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                Expires at (UTC, blank = never)
              </span>
              <input
                type="datetime-local"
                name="expiresAt"
                className="input"
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                Campaign (free-form grouping label)
              </span>
              <input
                type="text"
                name="campaign"
                placeholder="q2-launch"
                className="input"
              />
            </label>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                gridColumn: "1 / -1",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                Notes (internal, never shown to customers)
              </span>
              <textarea
                name="notes"
                rows={2}
                className="input"
                placeholder="Who requested this code; link to the ticket; reason."
              />
            </label>

            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-primary">
                Create code
              </button>
              <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
                Validation runs server-side — duplicate codes, bad dates, or out-of-range values will reject.
              </span>
            </div>
          </form>
        </div>
      </section>

      <section>
        <SectionTitle>Notes for operators</SectionTitle>
        <ul style={{ paddingLeft: 20, lineHeight: 1.7, fontSize: 14 }}>
          <li>
            <strong>percent</strong> uses basis points: <code>1000</code> = 10%, <code>2500</code> = 25%. Max <code>10000</code> (100%).
          </li>
          <li>
            <strong>flat</strong> uses micros in the chosen currency: <code>5_000_000</code> = $5.00 or ₹5.00 depending on Currency. Leave Currency blank to accept both rails, though mixed-currency flats are usually an operator error.
          </li>
          <li>
            <strong>bonus_credits</strong> grants extra credits on top of the normal pack amount — granted at capture time, recorded in the credit ledger with reason <code>promo_bonus</code>.
          </li>
          <li>
            Disable is soft-delete: it sets <code>is_active=0</code> plus <code>disabled_at</code>/<code>disabled_by</code> for audit. Existing redemptions remain in the ledger; the code just stops resolving on future checkouts.
          </li>
          <li>
            Mixed-currency discount totals are summed as-is in the headline card — treat the number as "what got discounted" rather than a precise USD figure. The per-row value honors the code's declared currency.
          </li>
        </ul>
      </section>
    </div>
  );
}
