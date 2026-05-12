#!/usr/bin/env node
// scripts/test-promos.mjs
//
// Self-contained test harness for Task #27 — annual-prepay tier, INR
// pricing on the user-facing grid, and promo codes (Phase E).
//
// Coverage map:
//
//   SECTION A — migration 0015 (promo_codes + promo_redemptions +
//               payments additive columns):
//               * CREATE TABLE promo_codes with kind enum, value,
//                 currency, pack_ids, annual_only, max_redemptions,
//                 per_user_limit, starts_at, expires_at, is_active,
//                 campaign, notes, created_at, created_by, disabled_at,
//                 disabled_by.
//               * CREATE TABLE promo_redemptions with FK to promo_codes
//                 (ON DELETE RESTRICT) + FK to payments (ON DELETE
//                 CASCADE) + composite (promo_code_id, user_id) index.
//               * ALTER TABLE payments ADD COLUMN promo_code_id /
//                 promo_discount_micros / promo_bonus_credits /
//                 annual_variant (all nullable). NOTE: promo_discount_bps
//                 is computed-only from (value, kind, subtotal) — never
//                 persisted — so it does not appear on the payments row.
//
//   SECTION B — db/schema/app.ts parity:
//               * promoCodes table declaration with all columns.
//               * promoRedemptions table declaration.
//               * payments gains promoCodeId / promoDiscountMicros /
//                 promoBonusCredits / annualVariant.
//
//   SECTION C — lib/pricing.ts variant surface:
//               * PackVariant type = "monthly" | "annual".
//               * ANNUAL_DISCOUNT_BPS = 2000.
//               * ANNUAL_MONTHS = 12 (annual multiplier constant).
//               * packAmountMinor(pack, currency, { variant }) branches.
//               * packCreditsForVariant(pack, "annual") = 12× paid.
//               * INR pricing for every pack (inrPrice field).
//
//   SECTION D — lib/promos/resolver.ts 8-gate validation:
//               * resolvePromoCode uppercases + trims the input.
//               * validatePromoCode gates fire in order: isActive →
//                 startsAt → expiresAt → currency → packIds →
//                 annualOnly → maxRedemptions → perUserLimit.
//               * computePromoDiscount branches on kind (percent /
//                 flat / bonus_credits) and clamps flat at subtotal.
//
//   SECTION E — lib/promos/actions.ts server actions:
//               * applyPromoCodeAction (preview).
//               * getPromoRedemptionHistoryAction (user receipts).
//               * adminCreatePromoCodeAction, adminDisablePromoCode-
//                 Action (admin-gated).
//               * ApplyPromoCodeActionResult union aligned with
//                 resolver reasons plus not_authenticated + empty_code.
//
//   SECTION F — lib/payments/checkout-actions.ts plumbing:
//               * Accepts promoCode + variant args.
//               * Re-runs resolveAndValidate at click time (TOCTOU).
//               * Returns ok:false / error:"promo_invalid" with
//                 promoReason echo on rejection.
//               * Stamps promo_code_id / promo_discount_micros /
//                 promo_discount_bps / promo_bonus_credits / variant
//                 on the payments row.
//
//   SECTION G — lib/payments/ledger.ts capture hook:
//               * Writes promo_redemptions row on first successful
//                 capture (idempotent on payment_id).
//               * Grants promoBonus credits via creditLedger with
//                 reason "promo_bonus" and idempotencyKey
//                 "<paymentId>:promo_bonus".
//
//   SECTION H — lib/admin/phase-e-queries.ts rollups:
//               * getPromoCodeInventory({ days }) — LEFT JOIN +
//                 GROUP BY with CASE-inside-SUM for window vs.
//                 lifetime in one query.
//               * getPromoRedemptionsForUser({ userId }).
//
//   SECTION I — components/billing/CheckoutButton.tsx:
//               * Accepts packVariant + promoCode props.
//               * Forwards them to createCheckoutAction.
//               * Maps promo_invalid → friendly copy table.
//
//   SECTION J — components/billing/PackUpsellPanel.tsx (new):
//               * "use client" directive.
//               * useState + useTransition for preview.
//               * Monthly / Annual tabs with role="tab" semantics.
//               * Calls applyPromoCodeAction against the popular pack.
//               * Forwards variant + applied promo to every inner
//                 CheckoutButton.
//               * Renders pack features list (parity with old grid).
//
//   SECTION K — page wire-up:
//               * app/pricing/page.tsx imports + renders
//                 PackUpsellPanel instead of the inline grid.
//               * app/app/billing/page.tsx renders promo redemption
//                 history card via getPromoRedemptionHistoryAction.
//               * app/admin/promos/page.tsx renders inventory + create
//                 form via getPromoCodeInventory + adminCreate/Disable-
//                 PromoCodeAction.
//
//   SECTION L — aggregator registration:
//               * scripts/run-all-tests.mjs SUITES array includes
//                 "promos" → test-promos.mjs.
//
// Run: `node scripts/test-promos.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const MIGRATION_PATH = resolve(
  ROOT,
  "db",
  "migrations",
  "0015_promo_codes_and_annual.sql"
);
const SCHEMA_PATH = resolve(ROOT, "db", "schema", "app.ts");
const PRICING_PATH = resolve(ROOT, "lib", "pricing.ts");
const RESOLVER_PATH = resolve(ROOT, "lib", "promos", "resolver.ts");
const ACTIONS_PATH = resolve(ROOT, "lib", "promos", "actions.ts");
const CHECKOUT_ACTIONS_PATH = resolve(
  ROOT,
  "lib",
  "payments",
  "checkout-actions.ts"
);
const LEDGER_PATH = resolve(ROOT, "lib", "payments", "ledger.ts");
const PHASE_E_QUERIES_PATH = resolve(
  ROOT,
  "lib",
  "admin",
  "phase-e-queries.ts"
);
const CHECKOUT_BUTTON_PATH = resolve(
  ROOT,
  "components",
  "billing",
  "CheckoutButton.tsx"
);
const PACK_PANEL_PATH = resolve(
  ROOT,
  "components",
  "billing",
  "PackUpsellPanel.tsx"
);
const PRICING_PAGE_PATH = resolve(ROOT, "app", "pricing", "page.tsx");
const BILLING_PAGE_PATH = resolve(
  ROOT,
  "app",
  "app",
  "billing",
  "page.tsx"
);
const ADMIN_PROMOS_PATH = resolve(
  ROOT,
  "app",
  "admin",
  "promos",
  "page.tsx"
);
const RUN_ALL_PATH = resolve(ROOT, "scripts", "run-all-tests.mjs");

// Fail fast if anything is missing — better than cryptic regex misses later.
for (const p of [
  MIGRATION_PATH,
  SCHEMA_PATH,
  PRICING_PATH,
  RESOLVER_PATH,
  ACTIONS_PATH,
  CHECKOUT_ACTIONS_PATH,
  LEDGER_PATH,
  PHASE_E_QUERIES_PATH,
  CHECKOUT_BUTTON_PATH,
  PACK_PANEL_PATH,
  PRICING_PAGE_PATH,
  BILLING_PAGE_PATH,
  ADMIN_PROMOS_PATH,
  RUN_ALL_PATH,
]) {
  if (!existsSync(p)) {
    console.error(`FATAL: expected file not found: ${p}`);
    process.exit(1);
  }
}

const MIGRATION_SRC = readFileSync(MIGRATION_PATH, "utf8");
const SCHEMA_SRC = readFileSync(SCHEMA_PATH, "utf8");
const PRICING_SRC = readFileSync(PRICING_PATH, "utf8");
const RESOLVER_SRC = readFileSync(RESOLVER_PATH, "utf8");
const ACTIONS_SRC = readFileSync(ACTIONS_PATH, "utf8");
const CHECKOUT_ACTIONS_SRC = readFileSync(CHECKOUT_ACTIONS_PATH, "utf8");
const LEDGER_SRC = readFileSync(LEDGER_PATH, "utf8");
const PHASE_E_QUERIES_SRC = readFileSync(PHASE_E_QUERIES_PATH, "utf8");
const CHECKOUT_BUTTON_SRC = readFileSync(CHECKOUT_BUTTON_PATH, "utf8");
const PACK_PANEL_SRC = readFileSync(PACK_PANEL_PATH, "utf8");
const PRICING_PAGE_SRC = readFileSync(PRICING_PAGE_PATH, "utf8");
const BILLING_PAGE_SRC = readFileSync(BILLING_PAGE_PATH, "utf8");
const ADMIN_PROMOS_SRC = readFileSync(ADMIN_PROMOS_PATH, "utf8");
const RUN_ALL_SRC = readFileSync(RUN_ALL_PATH, "utf8");

let pass = 0;
let fail = 0;
const failures = [];

function assert(label, condition, detail) {
  if (condition) {
    pass += 1;
  } else {
    fail += 1;
    failures.push({ label, detail });
  }
}

// =============================================================================
// SECTION A — migration 0015
// =============================================================================

assert(
  "A1 migration 0015 creates promo_codes table",
  /CREATE TABLE\s+(IF NOT EXISTS\s+)?`?promo_codes`?/i.test(MIGRATION_SRC),
  "CREATE TABLE promo_codes clause missing"
);

assert(
  "A2 promo_codes has kind enum (percent/flat/bonus_credits)",
  /`?kind`?\s+enum\([^)]*['"]percent['"][^)]*['"]flat['"][^)]*['"]bonus_credits['"]/i.test(
    MIGRATION_SRC
  ),
  "kind enum must include percent, flat, bonus_credits"
);

assert(
  "A3 promo_codes has value column",
  /`?value`?\s+(bigint|int|decimal)/i.test(MIGRATION_SRC),
  "value column missing (should hold bps / micros / credits depending on kind)"
);

assert(
  "A4 promo_codes has currency column (nullable)",
  /`?currency`?\s+(char|varchar)\(\d+\)\s+NULL/i.test(MIGRATION_SRC),
  "currency char/varchar NULL column missing"
);

assert(
  "A5 promo_codes has pack_ids column (nullable, CSV)",
  /`?pack_ids`?\s+\w+(\(\d+\))?\s+NULL/i.test(MIGRATION_SRC),
  "pack_ids column missing (comma-separated whitelist, NULL = any pack)"
);

assert(
  "A6 promo_codes has annual_only flag",
  /`?annual_only`?\s+tinyint/i.test(MIGRATION_SRC),
  "annual_only tinyint column missing"
);

assert(
  "A7 promo_codes has max_redemptions + per_user_limit",
  /`?max_redemptions`?\s+\w+[^;]*`?per_user_limit`?/is.test(MIGRATION_SRC) ||
    (/`?max_redemptions`?/i.test(MIGRATION_SRC) &&
      /`?per_user_limit`?/i.test(MIGRATION_SRC)),
  "max_redemptions and per_user_limit columns missing"
);

assert(
  "A8 promo_codes has starts_at + expires_at windows",
  /`?starts_at`?/i.test(MIGRATION_SRC) &&
    /`?expires_at`?/i.test(MIGRATION_SRC),
  "starts_at / expires_at window columns missing"
);

assert(
  "A9 promo_codes has is_active flag",
  /`?is_active`?\s+tinyint/i.test(MIGRATION_SRC),
  "is_active tinyint column missing"
);

assert(
  "A10 promo_codes has campaign + notes columns",
  /`?campaign`?/i.test(MIGRATION_SRC) && /`?notes`?/i.test(MIGRATION_SRC),
  "campaign / notes columns missing"
);

assert(
  "A11 promo_codes has audit columns (created_by / disabled_at / disabled_by)",
  /`?created_by`?/i.test(MIGRATION_SRC) &&
    /`?disabled_at`?/i.test(MIGRATION_SRC) &&
    /`?disabled_by`?/i.test(MIGRATION_SRC),
  "audit columns (created_by / disabled_at / disabled_by) missing"
);

assert(
  "A12 promo_codes.code has UNIQUE index (case-insensitive lookup)",
  /UNIQUE[^)]*`?code`?/i.test(MIGRATION_SRC),
  "UNIQUE index on code column missing"
);

assert(
  "A13 migration 0015 creates promo_redemptions table",
  /CREATE TABLE\s+(IF NOT EXISTS\s+)?`?promo_redemptions`?/i.test(
    MIGRATION_SRC
  ),
  "CREATE TABLE promo_redemptions clause missing"
);

assert(
  "A14 promo_redemptions FK to promo_codes (RESTRICT on delete)",
  /FOREIGN KEY[^;]*`?promo_code_id`?[^;]*REFERENCES[^;]*`?promo_codes`?[^;]*ON DELETE RESTRICT/is.test(
    MIGRATION_SRC
  ),
  "RESTRICT FK protects the audit trail — disable, don't delete"
);

assert(
  "A15 promo_redemptions FK to payments (CASCADE on delete)",
  /FOREIGN KEY[^;]*`?payment_id`?[^;]*REFERENCES[^;]*`?payments`?[^;]*ON DELETE CASCADE/is.test(
    MIGRATION_SRC
  ),
  "CASCADE FK — if the parent payment gets hard-deleted the redemption should go with it"
);

assert(
  "A16 promo_redemptions has composite (promo_code_id, user_id) index",
  /(KEY|INDEX)[^(]*\([^)]*`?promo_code_id`?[^)]*`?user_id`?/i.test(MIGRATION_SRC),
  "composite index powers countUserRedemptions hot path"
);

assert(
  "A17 payments.promo_code_id ADD COLUMN (nullable SET NULL)",
  /ALTER TABLE\s+`?payments`?[^;]*ADD COLUMN\s+`?promo_code_id`?[^;]*NULL/is.test(
    MIGRATION_SRC
  ) ||
    /`?promo_code_id`?\s+varchar\(\d+\)\s+NULL/i.test(MIGRATION_SRC),
  "payments.promo_code_id must be nullable (SET NULL on parent delete)"
);

assert(
  "A18 payments gains promo_discount_micros column",
  /`?promo_discount_micros`?\s+bigint/i.test(MIGRATION_SRC),
  "payments.promo_discount_micros bigint column missing"
);

assert(
  "A19 payments gains promo_bonus_credits column",
  /`?promo_bonus_credits`?\s+int/i.test(MIGRATION_SRC),
  "payments.promo_bonus_credits column missing (bps is computed-only, not persisted)"
);

assert(
  "A20 payments gains annual_variant column (monthly/annual boolean)",
  /`?annual_variant`?\s+tinyint/i.test(MIGRATION_SRC),
  "payments.annual_variant tinyint column missing — needed for /app/billing receipt rendering"
);

// =============================================================================
// SECTION B — db/schema/app.ts parity
// =============================================================================

assert(
  "B1 schema declares promoCodes table",
  /export\s+const\s+promoCodes\s*=\s*mysqlTable/.test(SCHEMA_SRC),
  "promoCodes drizzle table declaration missing"
);

assert(
  "B2 schema declares promoRedemptions table",
  /export\s+const\s+promoRedemptions\s*=\s*mysqlTable/.test(SCHEMA_SRC),
  "promoRedemptions drizzle table declaration missing"
);

assert(
  "B3 payments gains promoCodeId column in schema",
  /promoCodeId\s*:\s*varchar\(/.test(SCHEMA_SRC),
  "payments.promoCodeId drizzle column missing"
);

assert(
  "B4 payments gains promoDiscountMicros + promoBonusCredits in schema",
  /promoDiscountMicros/.test(SCHEMA_SRC) &&
    /promoBonusCredits/.test(SCHEMA_SRC),
  "payments promo columns missing in schema (bps is computed-only, not persisted)"
);

assert(
  "B5 payments gains annualVariant column in schema",
  /annualVariant\s*:\s*int\s*\(/.test(SCHEMA_SRC),
  "payments.annualVariant drizzle column missing"
);

// =============================================================================
// SECTION C — pricing.ts variant surface
// =============================================================================

assert(
  "C1 pricing.ts exports PackVariant type",
  /export\s+type\s+PackVariant\s*=\s*"monthly"\s*\|\s*"annual"/.test(
    PRICING_SRC
  ),
  'PackVariant = "monthly" | "annual" missing'
);

assert(
  "C2 pricing.ts declares ANNUAL_DISCOUNT_BPS = 2000",
  /ANNUAL_DISCOUNT_BPS\s*=\s*2000\b/.test(PRICING_SRC),
  "ANNUAL_DISCOUNT_BPS constant missing or wrong value (should be 2000 = 20%)"
);

assert(
  "C3 packAmountMinor accepts variant option",
  /function\s+packAmountMinor[\s\S]{0,300}?variant\??:\s*PackVariant/.test(
    PRICING_SRC
  ),
  "packAmountMinor must accept { variant } option for Task #27 annual pricing"
);

assert(
  "C4 packAmountMinor has annual branch (× 12 − 20%)",
  /variant\s*===\s*"annual"/.test(PRICING_SRC) &&
    /12\b/.test(PRICING_SRC),
  "packAmountMinor annual branch must multiply by 12 and apply ANNUAL_DISCOUNT_BPS"
);

assert(
  "C5 packCreditsForVariant exported with PackVariant arg",
  /export\s+function\s+packCreditsForVariant\s*\([^)]*pack[^)]*variant\s*:\s*PackVariant/.test(
    PRICING_SRC
  ),
  "packCreditsForVariant(pack, variant) missing"
);

assert(
  "C6 packCreditsForVariant annual branch multiplies paid credits by 12",
  /variant\s*===\s*"annual"[\s\S]{0,300}?\*\s*(ANNUAL_MONTHS|12)/.test(
    PRICING_SRC
  ),
  "annual variant must grant 12× (ANNUAL_MONTHS) the monthly paid credits"
);

assert(
  "C7 every CREDIT_PACK has inrPrice field for INR pricing",
  /inrPrice\s*:/.test(PRICING_SRC),
  "CREDIT_PACKS must declare inrPrice per pack for INR rail pricing"
);

// =============================================================================
// SECTION D — resolver.ts gates + discount math
// =============================================================================

assert(
  "D1 resolvePromoCode normalizes input (trim + toUpperCase)",
  /rawCode\.trim\(\)\.toUpperCase\(\)/.test(RESOLVER_SRC),
  "resolvePromoCode must trim + uppercase so lookups are deterministic"
);

assert(
  "D2 validatePromoCode gate 1: isActive",
  /code\.isActive\s*!==\s*1/.test(RESOLVER_SRC) &&
    /"inactive"/.test(RESOLVER_SRC),
  "inactive gate missing"
);

assert(
  "D3 validatePromoCode gate 2: startsAt",
  /code\.startsAt[\s\S]{0,200}?"not_started"/.test(RESOLVER_SRC),
  "not_started gate missing"
);

assert(
  "D4 validatePromoCode gate 3: expiresAt",
  /code\.expiresAt[\s\S]{0,200}?"expired"/.test(RESOLVER_SRC),
  "expired gate missing"
);

assert(
  "D5 validatePromoCode gate 4: currency scope",
  /"wrong_currency"/.test(RESOLVER_SRC),
  "wrong_currency gate missing"
);

assert(
  "D6 validatePromoCode gate 5: packIds whitelist",
  /code\.packIds[\s\S]{0,300}?"wrong_pack"/.test(RESOLVER_SRC),
  "wrong_pack gate missing (CSV whitelist parse)"
);

assert(
  "D7 validatePromoCode gate 6: annualOnly",
  /code\.annualOnly\s*===\s*1[\s\S]{0,200}?"wrong_variant"/.test(
    RESOLVER_SRC
  ),
  "wrong_variant gate missing (annual_only codes reject monthly)"
);

assert(
  "D8 validatePromoCode gate 7: max_redemptions",
  /countTotalRedemptions[\s\S]{0,200}?"max_redemptions_reached"/.test(
    RESOLVER_SRC
  ),
  "max_redemptions_reached gate missing"
);

assert(
  "D9 validatePromoCode gate 8: per_user_limit",
  /countUserRedemptions[\s\S]{0,200}?"user_limit_reached"/.test(RESOLVER_SRC),
  "user_limit_reached gate missing"
);

assert(
  "D10 computePromoDiscount handles kind === 'percent'",
  /code\.kind\s*===\s*"percent"/.test(RESOLVER_SRC),
  "percent branch missing"
);

assert(
  "D11 computePromoDiscount handles kind === 'flat' with subtotal clamp",
  /code\.kind\s*===\s*"flat"[\s\S]{0,300}?Math\.min/.test(RESOLVER_SRC),
  "flat branch must clamp at subtotal (100% off, not negative balance)"
);

assert(
  "D12 computePromoDiscount bonus_credits = 0 money discount",
  /bonusCredits\s*:\s*code\.value/.test(RESOLVER_SRC) &&
    /discountMicros\s*:\s*0[\s\S]{0,200}?bonusCredits/.test(RESOLVER_SRC),
  "bonus_credits branch must return discountMicros=0 + bonusCredits=code.value"
);

assert(
  "D13 resolveAndValidate returns unknown_code for missing code",
  /"unknown_code"/.test(RESOLVER_SRC),
  "unknown_code rejection missing"
);

assert(
  "D14 validatePromoCode accepts injectable `now` for deterministic tests",
  /now\s*\?\s*:\s*Date/.test(RESOLVER_SRC) ||
    /now\?\s*:\s*Date/.test(RESOLVER_SRC),
  "validatePromoCode should accept optional `now` for test injection"
);

// =============================================================================
// SECTION E — actions.ts server actions
// =============================================================================

assert(
  "E1 actions.ts marked 'use server'",
  /^"use server"/m.test(ACTIONS_SRC),
  "lib/promos/actions.ts must declare 'use server' for Next.js RSC"
);

assert(
  "E2 applyPromoCodeAction exported",
  /export\s+async\s+function\s+applyPromoCodeAction/.test(ACTIONS_SRC),
  "applyPromoCodeAction missing"
);

assert(
  "E3 applyPromoCodeAction guards unauthenticated",
  /applyPromoCodeAction[\s\S]{0,2000}?"not_authenticated"/.test(ACTIONS_SRC),
  "applyPromoCodeAction must return not_authenticated for anonymous sessions"
);

assert(
  "E4 getPromoRedemptionHistoryAction exported",
  /export\s+async\s+function\s+getPromoRedemptionHistoryAction/.test(
    ACTIONS_SRC
  ),
  "getPromoRedemptionHistoryAction missing"
);

assert(
  "E5 adminCreatePromoCodeAction admin-gated (requireAdmin)",
  /export\s+async\s+function\s+adminCreatePromoCodeAction[\s\S]{0,1500}?requireAdmin\s*\(/.test(
    ACTIONS_SRC
  ),
  "adminCreatePromoCodeAction must call requireAdmin()"
);

assert(
  "E6 adminDisablePromoCodeAction admin-gated; page wrapper revalidates /admin/promos",
  /export\s+async\s+function\s+adminDisablePromoCodeAction[\s\S]{0,1500}?requireAdmin\s*\(/.test(
    ACTIONS_SRC
  ) && /revalidatePath\s*\(\s*["']\/admin\/promos/.test(ADMIN_PROMOS_SRC),
  "adminDisablePromoCodeAction must guard with requireAdmin(); the admin/promos page-level server-action wrapper must call revalidatePath('/admin/promos')"
);

assert(
  "E7 ApplyPromoCodeActionResult covers all 9 reject reasons + not_authenticated + empty_code",
  /"not_authenticated"/.test(ACTIONS_SRC) &&
    /"empty_code"/.test(ACTIONS_SRC) &&
    /"unknown_code"/.test(ACTIONS_SRC) &&
    /"inactive"/.test(ACTIONS_SRC) &&
    /"not_started"/.test(ACTIONS_SRC) &&
    /"expired"/.test(ACTIONS_SRC) &&
    /"wrong_currency"/.test(ACTIONS_SRC) &&
    /"wrong_pack"/.test(ACTIONS_SRC) &&
    /"wrong_variant"/.test(ACTIONS_SRC) &&
    /"max_redemptions_reached"/.test(ACTIONS_SRC) &&
    /"user_limit_reached"/.test(ACTIONS_SRC),
  "reject-reason union must cover all 11 cases"
);

// =============================================================================
// SECTION F — checkout-actions plumbing
// =============================================================================

assert(
  "F1 checkout-actions imports resolveAndValidate",
  /import\s+\{\s*resolveAndValidate\s*\}\s+from\s+["']@\/lib\/promos\/resolver["']/.test(
    CHECKOUT_ACTIONS_SRC
  ),
  "resolveAndValidate import missing"
);

assert(
  "F2 createCheckoutAction accepts promoCode arg",
  /promoCode\??\s*:\s*string/.test(CHECKOUT_ACTIONS_SRC),
  "createCheckoutAction must accept promoCode: string"
);

assert(
  "F3 createCheckoutAction re-runs resolveAndValidate at click time",
  /resolveAndValidate\s*\(/.test(CHECKOUT_ACTIONS_SRC),
  "TOCTOU re-resolve missing — server must re-validate at checkout click"
);

assert(
  "F4 createCheckoutAction returns error:'promo_invalid' with promoReason",
  /"promo_invalid"/.test(CHECKOUT_ACTIONS_SRC) &&
    /promoReason/.test(CHECKOUT_ACTIONS_SRC),
  "promo rejection surface must include promo_invalid + promoReason for client copy table"
);

assert(
  "F5 createCheckoutAction stamps promo fields on payments row",
  /promoCodeId/.test(CHECKOUT_ACTIONS_SRC) &&
    /promoDiscountMicros/.test(CHECKOUT_ACTIONS_SRC) &&
    /promoBonusCredits/.test(CHECKOUT_ACTIONS_SRC),
  "payments INSERT must stamp promo_code_id / promo_discount_micros / promo_bonus_credits"
);

assert(
  "F6 createCheckoutAction stamps variant on payments row",
  /\bvariant\b/.test(CHECKOUT_ACTIONS_SRC),
  "payments INSERT must record variant so /app/billing can show 'annual prepay' vs 'one-time'"
);

// =============================================================================
// SECTION G — ledger.ts capture hook
// =============================================================================

assert(
  "G1 ledger selects promo fields off payments",
  /promoCodeId:\s*schema\.payments\.promoCodeId/.test(LEDGER_SRC) &&
    /promoDiscountMicros/.test(LEDGER_SRC) &&
    /promoBonusCredits/.test(LEDGER_SRC),
  "capture hook must pull promo_code_id / promo_discount_micros / promo_bonus_credits"
);

assert(
  "G2 ledger writes promo_redemptions row on successful capture",
  /insert\s*\(\s*schema\.promoRedemptions\s*\)/.test(LEDGER_SRC),
  "promo_redemptions row insert missing — the audit trail never fires"
);

assert(
  "G3 ledger grants bonus credits via creditLedger with reason 'promo_bonus'",
  /"promo_bonus"/.test(LEDGER_SRC),
  "promo_bonus reason on credit ledger entry missing"
);

assert(
  "G4 ledger's promo_bonus grant is idempotent on paymentId",
  /idempotencyKey\s*:\s*`\$\{payment\.id\}:promo_bonus`/.test(LEDGER_SRC),
  "idempotencyKey `<paymentId>:promo_bonus` missing — re-runs would double-grant"
);

// =============================================================================
// SECTION H — admin phase-e queries
// =============================================================================

assert(
  "H1 getPromoCodeInventory exported",
  /export\s+async\s+function\s+getPromoCodeInventory/.test(
    PHASE_E_QUERIES_SRC
  ),
  "getPromoCodeInventory missing"
);

assert(
  "H2 getPromoCodeInventory clamps days to [1, 365]",
  /getPromoCodeInventory[\s\S]{0,2000}?Math\.min\s*\(\s*365/.test(
    PHASE_E_QUERIES_SRC
  ) ||
    /getPromoCodeInventory[\s\S]{0,2000}?365/.test(PHASE_E_QUERIES_SRC),
  "days must be clamped to 365 max"
);

assert(
  "H3 getPromoCodeInventory uses CASE-inside-SUM for window vs lifetime",
  /getPromoCodeInventory[\s\S]{0,3000}?CASE\s+WHEN/i.test(
    PHASE_E_QUERIES_SRC
  ) ||
    /getPromoCodeInventory[\s\S]{0,3000}?sql`[^`]*CASE/i.test(
      PHASE_E_QUERIES_SRC
    ),
  "CASE-inside-SUM pattern missing — should compute window + lifetime in one query"
);

assert(
  "H4 getPromoCodeInventory orders by isActive DESC then createdAt DESC",
  /isActive\s+DESC[\s\S]{0,200}?createdAt\s+DESC/i.test(PHASE_E_QUERIES_SRC) ||
    /orderBy[\s\S]{0,300}?isActive[\s\S]{0,300}?createdAt/.test(
      PHASE_E_QUERIES_SRC
    ),
  "sort order must sink disabled codes to the bottom but keep them visible for audit"
);

assert(
  "H5 getPromoRedemptionsForUser exported",
  /export\s+async\s+function\s+getPromoRedemptionsForUser/.test(
    PHASE_E_QUERIES_SRC
  ),
  "getPromoRedemptionsForUser missing"
);

assert(
  "H6 getPromoRedemptionsForUser caps at 200 rows",
  /getPromoRedemptionsForUser[\s\S]{0,1500}?limit\s*\(\s*200/.test(
    PHASE_E_QUERIES_SRC
  ),
  "getPromoRedemptionsForUser must cap at 200 rows"
);

assert(
  "H7 PromoInventorySnapshot + PromoCodeInventoryRow types exported",
  /export\s+type\s+PromoInventorySnapshot/.test(PHASE_E_QUERIES_SRC) &&
    /export\s+type\s+PromoCodeInventoryRow/.test(PHASE_E_QUERIES_SRC),
  "snapshot/row types not exported"
);

// =============================================================================
// SECTION I — CheckoutButton
// =============================================================================

assert(
  "I1 CheckoutButton accepts packVariant prop",
  /packVariant\??\s*:\s*PackVariant/.test(CHECKOUT_BUTTON_SRC),
  "CheckoutButton.packVariant prop missing"
);

assert(
  "I2 CheckoutButton accepts promoCode prop",
  /promoCode\??\s*:\s*string/.test(CHECKOUT_BUTTON_SRC),
  "CheckoutButton.promoCode prop missing"
);

assert(
  "I3 CheckoutButton forwards variant + promoCode to createCheckoutAction",
  /createCheckoutAction\s*\([\s\S]{0,300}?variant\s*:\s*packVariant/.test(
    CHECKOUT_BUTTON_SRC
  ) &&
    /createCheckoutAction\s*\([\s\S]{0,300}?promoCode/.test(
      CHECKOUT_BUTTON_SRC
    ),
  "CheckoutButton must thread variant + promoCode into the server action"
);

assert(
  "I4 CheckoutButton maps promo_invalid → friendly copy table",
  /"promo_invalid"/.test(CHECKOUT_BUTTON_SRC) &&
    /promoReasonCopy/.test(CHECKOUT_BUTTON_SRC),
  "promo rejection copy helper missing (promo_invalid → promoReasonCopy)"
);

assert(
  "I5 CheckoutButton promoReasonCopy covers all 9 rejection reasons",
  /unknown_code/.test(CHECKOUT_BUTTON_SRC) &&
    /inactive/.test(CHECKOUT_BUTTON_SRC) &&
    /not_started/.test(CHECKOUT_BUTTON_SRC) &&
    /expired/.test(CHECKOUT_BUTTON_SRC) &&
    /wrong_currency/.test(CHECKOUT_BUTTON_SRC) &&
    /wrong_pack/.test(CHECKOUT_BUTTON_SRC) &&
    /wrong_variant/.test(CHECKOUT_BUTTON_SRC) &&
    /max_redemptions_reached/.test(CHECKOUT_BUTTON_SRC) &&
    /user_limit_reached/.test(CHECKOUT_BUTTON_SRC),
  "promoReasonCopy must cover all 9 resolver rejection reasons"
);

// =============================================================================
// SECTION J — PackUpsellPanel
// =============================================================================

assert(
  "J1 PackUpsellPanel declares 'use client'",
  /^"use client"/m.test(PACK_PANEL_SRC),
  "PackUpsellPanel must be a client component"
);

assert(
  "J2 PackUpsellPanel imports useState + useTransition",
  /useState[\s\S]{0,100}?useTransition/.test(PACK_PANEL_SRC) ||
    /useTransition[\s\S]{0,100}?useState/.test(PACK_PANEL_SRC) ||
    (/useState/.test(PACK_PANEL_SRC) &&
      /useTransition/.test(PACK_PANEL_SRC)),
  "useState + useTransition both required"
);

assert(
  "J3 PackUpsellPanel renders Monthly + Annual tabs with role='tab'",
  /role\s*=\s*["']tab["']/.test(PACK_PANEL_SRC) &&
    /Monthly/.test(PACK_PANEL_SRC) &&
    /Annual/.test(PACK_PANEL_SRC),
  "variant toggle must render two role='tab' buttons labeled Monthly / Annual"
);

assert(
  "J4 PackUpsellPanel calls applyPromoCodeAction against preview pack",
  /applyPromoCodeAction\s*\(/.test(PACK_PANEL_SRC),
  "applyPromoCodeAction call missing — preview would be broken"
);

assert(
  "J5 PackUpsellPanel uses popular pack as preview pack",
  /p\.popular/.test(PACK_PANEL_SRC),
  "preview pack selection should prefer popular=true pack"
);

assert(
  "J6 PackUpsellPanel forwards variant + promoCode to inner CheckoutButton",
  /packVariant\s*=\s*\{\s*variant\s*\}/.test(PACK_PANEL_SRC) &&
    /promoCode\s*=\s*\{\s*(appliedPromo|promoCode)\s*\}/.test(
      PACK_PANEL_SRC
    ),
  "PackCard must forward variant + promoCode to CheckoutButton"
);

assert(
  "J7 PackUpsellPanel uppercases promo input on change",
  /toUpperCase\s*\(\s*\)/.test(PACK_PANEL_SRC),
  "promo input should uppercase so preview matches resolver's case-insensitive lookup"
);

assert(
  "J8 PackCard renders pack features list (parity with old grid)",
  /pack\.features\.map/.test(PACK_PANEL_SRC) &&
    /I\.Check/.test(PACK_PANEL_SRC),
  "pack features list must render inside PackCard for grid-parity"
);

assert(
  "J9 PackCard shows per-month equivalent for annual variant",
  /perMonth|variant\s*===\s*"annual"[\s\S]{0,500}?\/\s*12/.test(
    PACK_PANEL_SRC
  ),
  "annual variant should show ≈ $X/mo equivalent for quick comparison"
);

// =============================================================================
// SECTION K — page wire-up
// =============================================================================

assert(
  "K1 /pricing imports PackUpsellPanel",
  /import\s+\{\s*PackUpsellPanel\s*\}\s+from\s+["']@\/components\/billing\/PackUpsellPanel["']/.test(
    PRICING_PAGE_SRC
  ),
  "app/pricing/page.tsx must import PackUpsellPanel"
);

assert(
  "K2 /pricing renders <PackUpsellPanel />",
  /<PackUpsellPanel\s*\/?>/.test(PRICING_PAGE_SRC),
  "<PackUpsellPanel /> render site missing"
);

assert(
  "K3 /pricing no longer maps CREDIT_PACKS inside JSX (panel owns the grid)",
  // Original rule banned ALL CREDIT_PACKS.map — that prevented the
  // pricing-grid refactor from regressing. 2026-05-12 relaxation:
  // the JSON-LD work (pricing-jsonld guard, commit follows) declares
  // `hasVariant: CREDIT_PACKS.map(...)` inside a module-scope const,
  // not inside JSX. The intent of K3 is "the visual pricing grid
  // must come from PackUpsellPanel", not "no use of .map anywhere".
  //
  // Refined rule: ban CREDIT_PACKS.map when preceded by an opening
  // JSX-expression brace `{` (i.e. `{CREDIT_PACKS.map(`) AND
  // followed by JSX (`=>` then `<` within a short window). Allow
  // it in object-literal context like `hasVariant: CREDIT_PACKS.map`.
  !/\{\s*CREDIT_PACKS\.map\([^)]*\)\s*=>\s*[\s\S]{0,80}?</.test(
    PRICING_PAGE_SRC
  ),
  "old inline CREDIT_PACKS.map JSX grid must be removed — PackUpsellPanel owns the grid now. Module-scope JSON-LD .map() is allowed."
);

assert(
  "K4 /app/billing imports getPromoRedemptionHistoryAction",
  /getPromoRedemptionHistoryAction/.test(BILLING_PAGE_SRC),
  "/app/billing must call getPromoRedemptionHistoryAction for the receipt card"
);

assert(
  "K5 /app/billing renders promo history card",
  /Promo codes applied/i.test(BILLING_PAGE_SRC) ||
    /promo[\s\S]{0,200}?applied/i.test(BILLING_PAGE_SRC),
  "/app/billing must render a 'Promo codes applied' card section"
);

assert(
  "K6 /admin/promos imports getPromoCodeInventory",
  /getPromoCodeInventory/.test(ADMIN_PROMOS_SRC),
  "/admin/promos must call getPromoCodeInventory for the inventory rollup"
);

assert(
  "K7 /admin/promos renders create + disable form actions",
  /adminCreatePromoCodeAction/.test(ADMIN_PROMOS_SRC) &&
    /adminDisablePromoCodeAction/.test(ADMIN_PROMOS_SRC),
  "/admin/promos must wire adminCreate + adminDisable form actions"
);

assert(
  "K8 /admin/promos form fields cover 12 operator knobs",
  /name\s*=\s*["']code["']/.test(ADMIN_PROMOS_SRC) &&
    /name\s*=\s*["']kind["']/.test(ADMIN_PROMOS_SRC) &&
    /name\s*=\s*["']value["']/.test(ADMIN_PROMOS_SRC) &&
    /name\s*=\s*["']currency["']/.test(ADMIN_PROMOS_SRC) &&
    /name\s*=\s*["']packIds["']/.test(ADMIN_PROMOS_SRC) &&
    /name\s*=\s*["']annualOnly["']/.test(ADMIN_PROMOS_SRC) &&
    /name\s*=\s*["']maxRedemptions["']/.test(ADMIN_PROMOS_SRC) &&
    /name\s*=\s*["']perUserLimit["']/.test(ADMIN_PROMOS_SRC) &&
    /name\s*=\s*["']startsAt["']/.test(ADMIN_PROMOS_SRC) &&
    /name\s*=\s*["']expiresAt["']/.test(ADMIN_PROMOS_SRC) &&
    /name\s*=\s*["']campaign["']/.test(ADMIN_PROMOS_SRC) &&
    /name\s*=\s*["']notes["']/.test(ADMIN_PROMOS_SRC),
  "create form must expose all 12 promo knobs"
);

// =============================================================================
// SECTION L — aggregator registration
// =============================================================================

assert(
  "L1 scripts/run-all-tests.mjs registers promos suite",
  /test-promos\.mjs/.test(RUN_ALL_SRC),
  "run-all-tests.mjs SUITES array must include test-promos.mjs"
);

// =============================================================================
// Report
// =============================================================================

const total = pass + fail;
console.log("");
if (fail > 0) {
  console.log("FAILURES:");
  for (const f of failures) {
    console.log(`  ✗ ${f.label}`);
    if (f.detail) console.log(`      ${f.detail}`);
  }
  console.log("");
}
// Final line MUST match `N passed, M failed` — scripts/run-all-tests.mjs
// parses this tail with /(\d+)\s+passed,\s+(\d+)\s+failed/i. Without it
// the aggregator reports "(summary unparseable)" and marks the suite
// as failed even when every assertion passed.
console.log(`test-promos: ${pass} passed, ${fail} failed (of ${total})`);
process.exit(fail > 0 ? 1 : 0);
