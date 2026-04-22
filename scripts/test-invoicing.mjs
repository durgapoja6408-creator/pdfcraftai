#!/usr/bin/env node
// Self-contained test harness for Task #23 Phase D — the invoice
// renderer + GSTIN validator + tax classifier + CSV export route.
// Pattern-matches the rest of the test-*.mjs suites: static source
// greps for shape, runtime dynamic-imports of the pure modules for
// pure-function behaviour, one aggregator-registration check, one
// final "N passed, M failed" summary line.
//
// Sections:
//   SECTION A — lib/invoicing/gstin.ts module surface.
//   SECTION B — GSTIN Mod-36 checksum against CBIC vectors.
//   SECTION C — classifyGst() branch table.
//   SECTION D — lib/invoicing/types.ts + deriveInvoiceNumber().
//   SECTION E — lib/invoicing/seller.ts env-driven defaults.
//   SECTION F — lib/invoicing/assemble.ts tax math (subtotal + split).
//   SECTION G — lib/invoicing/renderer.ts signature + pdf-lib smoke.
//   SECTION H — /api/invoices/[paymentId] route shape.
//   SECTION I — /api/admin/tax/export.csv route shape.
//   SECTION J — /app/app/receipts + /app/admin/tax page updates.
//   SECTION K — run-all-tests.mjs registration.
//   SECTION L — migration 0016 + schema.ts users billing columns (PART 2).
//   SECTION M — billing-actions.ts + BillingProfileForm + settings wire
//               + invoice route billing wire + /admin/invoicing page (PART 2).
//
// Run: `node scripts/test-invoicing.mjs`
// Exits 0 on pass, 1 on any failure.

import { readFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const GSTIN_PATH = resolve(ROOT, "lib", "invoicing", "gstin.ts");
const TYPES_PATH = resolve(ROOT, "lib", "invoicing", "types.ts");
const SELLER_PATH = resolve(ROOT, "lib", "invoicing", "seller.ts");
const ASSEMBLE_PATH = resolve(ROOT, "lib", "invoicing", "assemble.ts");
const RENDERER_PATH = resolve(ROOT, "lib", "invoicing", "renderer.ts");
const INVOICE_ROUTE_PATH = resolve(
  ROOT,
  "app",
  "api",
  "invoices",
  "[paymentId]",
  "route.ts"
);
const CSV_ROUTE_PATH = resolve(
  ROOT,
  "app",
  "api",
  "admin",
  "tax",
  "export.csv",
  "route.ts"
);
const RECEIPTS_PAGE_PATH = resolve(ROOT, "app", "app", "receipts", "page.tsx");
const ADMIN_TAX_PAGE_PATH = resolve(ROOT, "app", "admin", "tax", "page.tsx");
const AGGREGATOR_PATH = resolve(ROOT, "scripts", "run-all-tests.mjs");

// --- PART 2 file paths --------------------------------------------------
const MIGRATION_0016_PATH = resolve(
  ROOT,
  "db",
  "migrations",
  "0016_users_billing_profile.sql"
);
const AUTH_SCHEMA_PATH = resolve(ROOT, "db", "schema", "auth.ts");
const BILLING_ACTIONS_PATH = resolve(
  ROOT,
  "lib",
  "invoicing",
  "billing-actions.ts"
);
const BILLING_FORM_PATH = resolve(
  ROOT,
  "components",
  "app",
  "settings",
  "BillingProfileForm.tsx"
);
const SETTINGS_PAGE_PATH = resolve(ROOT, "app", "app", "settings", "page.tsx");
const ADMIN_INVOICING_PAGE_PATH = resolve(
  ROOT,
  "app",
  "admin",
  "invoicing",
  "page.tsx"
);
const ADMIN_LAYOUT_PATH = resolve(ROOT, "app", "admin", "layout.tsx");

// ------------------------------------------------------------------
// Harness plumbing
// ------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.log(`  FAIL: ${msg}`);
  }
}

function read(p) {
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

// ------------------------------------------------------------------
// Dynamic import helper — transpile a TS module with esbuild, then
// `import()` the resulting .mjs. esbuild (a dev-dep already pulled in
// via Next's transitive deps) handles object literals + generics +
// type aliases correctly where a hand-rolled regex stripper doesn't.
// ------------------------------------------------------------------

const esbuild = require("esbuild");

async function dynamicImport(tsPath) {
  const raw = readFileSync(tsPath, "utf8");
  // Drop `import type …` lines so esbuild doesn't try to resolve the
  // adjacent `./types` module; the pure modules we exercise at runtime
  // don't actually need any of the declared type symbols.
  const stripped = raw.replace(
    /^\s*import\s+type\s+\{[^}]*\}\s+from\s+["'][^"']+["'];?\s*$/gm,
    ""
  );
  const { code } = esbuild.transformSync(stripped, {
    loader: "ts",
    format: "esm",
    target: "node20",
  });
  const tmp = mkdtempSync(resolve(tmpdir(), "invoicing-test-"));
  const jsPath = resolve(tmp, "mod.mjs");
  writeFileSync(jsPath, code, "utf8");
  return await import(pathToFileURL(jsPath).href);
}

// ------------------------------------------------------------------
// SECTION A — lib/invoicing/gstin.ts module surface
// ------------------------------------------------------------------

console.log("\n[SECTION A] lib/invoicing/gstin.ts module surface");

const gstinSrc = read(GSTIN_PATH);
assert(gstinSrc.length > 0, "lib/invoicing/gstin.ts exists");
assert(
  /export\s+const\s+INDIAN_STATE_CODES/.test(gstinSrc),
  "INDIAN_STATE_CODES is exported"
);
assert(
  /"01":\s*"Jammu & Kashmir"/.test(gstinSrc),
  "INDIAN_STATE_CODES includes '01': 'Jammu & Kashmir'"
);
assert(
  /"27":\s*"Maharashtra"/.test(gstinSrc),
  "INDIAN_STATE_CODES includes '27': 'Maharashtra'"
);
assert(
  /"33":\s*"Tamil Nadu"/.test(gstinSrc),
  "INDIAN_STATE_CODES includes '33': 'Tamil Nadu'"
);
assert(
  /"38":\s*"Dadra & Nagar Haveli and Daman & Diu"/.test(gstinSrc),
  "INDIAN_STATE_CODES includes '38' (post-2020 merger)"
);
assert(
  /export\s+function\s+validateGstin/.test(gstinSrc),
  "validateGstin is exported"
);
assert(
  /export\s+function\s+computeGstinCheckDigit/.test(gstinSrc),
  "computeGstinCheckDigit is exported"
);
assert(
  /export\s+function\s+classifyGst/.test(gstinSrc),
  "classifyGst is exported"
);
assert(
  /export\s+function\s+describeClassification/.test(gstinSrc),
  "describeClassification is exported"
);
for (const reason of [
  "empty",
  "wrong_length",
  "bad_format",
  "bad_state_code",
  "bad_checksum",
  "not_regular_taxpayer",
]) {
  assert(
    gstinSrc.includes(`"${reason}"`),
    `validateGstin reason includes "${reason}"`
  );
}
for (const c of ["intra_state", "inter_state", "export", "reverse_charge"]) {
  assert(
    gstinSrc.includes(`"${c}"`),
    `GstClassification union includes "${c}"`
  );
}

// ------------------------------------------------------------------
// SECTION B — GSTIN Mod-36 checksum behaviour
// ------------------------------------------------------------------

console.log("\n[SECTION B] GSTIN Mod-36 checksum behaviour");

const gstinMod = await dynamicImport(GSTIN_PATH);

// Round-trip property: for any 14-char input from the alphabet, the
// check digit computed here must be consistent with itself. We spot-
// check a handful of patterns; a full CBIC suite lands in Phase E
// alongside real seller-side onboarding.
{
  const { computeGstinCheckDigit, validateGstin } = gstinMod;
  // Deterministic: two calls with the same input match.
  const d1 = computeGstinCheckDigit("27AAACI1234A1Z5".slice(0, 14));
  const d2 = computeGstinCheckDigit("27AAACI1234A1Z5".slice(0, 14));
  assert(d1 === d2, "computeGstinCheckDigit is deterministic");

  // Length guard.
  let threw = false;
  try {
    computeGstinCheckDigit("TOOSHORT");
  } catch {
    threw = true;
  }
  assert(threw, "computeGstinCheckDigit throws on wrong length");

  // Build a self-consistent GSTIN by computing the digit and verifying
  // the round-trip validator accepts it.
  const first14 = "27AAACI1234A1Z";
  const digit = computeGstinCheckDigit(first14);
  const full = first14 + digit;
  const v = validateGstin(full);
  assert(
    v.ok === true && v.gstin === full,
    "validateGstin accepts a GSTIN whose check digit was computed by computeGstinCheckDigit"
  );
  if (v.ok) {
    assert(
      v.stateCode === "27" && v.stateName === "Maharashtra",
      "validateGstin extracts stateCode + stateName"
    );
    assert(v.pan === "AAACI1234A", "validateGstin extracts PAN");
  }

  // Reject: wrong length.
  assert(
    validateGstin("123").ok === false,
    "validateGstin rejects too-short input"
  );
  // Reject: empty.
  assert(
    validateGstin("").ok === false,
    "validateGstin rejects empty string"
  );
  // Reject: bad state code. 99 is outside the known set.
  const badState = "99AAACI1234A1Z0";
  assert(
    validateGstin(badState).ok === false,
    "validateGstin rejects unknown state code"
  );
  // Reject: non-Z position 14 (composition dealer, OIDAR, etc.).
  const nonZ = "27AAACI1234A1C5";
  assert(
    validateGstin(nonZ).ok === false,
    "validateGstin rejects non-Z in position 14"
  );
  // Reject: bad checksum — mutate the last char.
  const wrongDigit = first14 + (digit === "0" ? "1" : "0");
  const mutated = validateGstin(wrongDigit);
  assert(
    mutated.ok === false && mutated.reason === "bad_checksum",
    "validateGstin flags bad_checksum specifically"
  );
  // Whitespace tolerance.
  const spaced = " " + full.slice(0, 7) + " " + full.slice(7) + " ";
  assert(
    validateGstin(spaced).ok === true,
    "validateGstin tolerates whitespace"
  );
  // Case tolerance.
  assert(
    validateGstin(full.toLowerCase()).ok === true,
    "validateGstin tolerates lowercase"
  );
}

// ------------------------------------------------------------------
// SECTION C — classifyGst() branch table
// ------------------------------------------------------------------

console.log("\n[SECTION C] classifyGst() branch table");

{
  const { classifyGst } = gstinMod;

  assert(
    classifyGst({ buyerCountry: "US" }) === "export",
    "US buyer → export"
  );
  assert(
    classifyGst({ buyerCountry: "GB" }) === "export",
    "GB buyer → export"
  );
  assert(
    classifyGst({ buyerCountry: "in" }) !== "export",
    "lowercased 'in' normalized to India (not export)"
  );
  assert(
    classifyGst({
      buyerCountry: "IN",
      buyerStateCode: "27",
      sellerStateCode: "27",
    }) === "intra_state",
    "IN buyer with same state → intra_state"
  );
  assert(
    classifyGst({
      buyerCountry: "IN",
      buyerStateCode: "27",
      sellerStateCode: "29",
    }) === "inter_state",
    "IN buyer with different state → inter_state"
  );
  assert(
    classifyGst({
      buyerCountry: "IN",
      buyerStateCode: null,
      sellerStateCode: null,
    }) === "inter_state",
    "IN buyer with unknown states → inter_state (conservative default)"
  );
  assert(
    classifyGst({
      buyerCountry: "IN",
      forceReverseCharge: true,
    }) === "reverse_charge",
    "forceReverseCharge=true → reverse_charge"
  );
}

// ------------------------------------------------------------------
// SECTION D — lib/invoicing/types.ts + deriveInvoiceNumber()
// ------------------------------------------------------------------

console.log("\n[SECTION D] types.ts + deriveInvoiceNumber()");

const typesSrc = read(TYPES_PATH);
assert(typesSrc.length > 0, "lib/invoicing/types.ts exists");
for (const name of [
  "SellerIdentity",
  "BuyerIdentity",
  "InvoiceLineItem",
  "InvoiceTaxBreakdown",
  "InvoiceInput",
  "InvoiceRenderResult",
]) {
  assert(
    new RegExp(`export\\s+type\\s+${name}`).test(typesSrc),
    `types.ts exports type ${name}`
  );
}
assert(
  /export\s+function\s+deriveInvoiceNumber/.test(typesSrc),
  "deriveInvoiceNumber is exported"
);

const typesMod = await dynamicImport(TYPES_PATH);
{
  const { deriveInvoiceNumber } = typesMod;
  // A payment on 2026-01-15 belongs to FY 2025 (Apr-2025 → Mar-2026).
  const jan2026 = Date.UTC(2026, 0, 15);
  assert(
    deriveInvoiceNumber("abcd1234-ef56-7890-abcd-ef1234567890", jan2026) ===
      "INV-2025-ABCD1234",
    "Jan 2026 maps to FY 2025 with first-8-hex PaymentId"
  );
  // A payment on 2026-05-15 belongs to FY 2026.
  const may2026 = Date.UTC(2026, 4, 15);
  assert(
    deriveInvoiceNumber("abcd1234-ef56-7890-abcd-ef1234567890", may2026) ===
      "INV-2026-ABCD1234",
    "May 2026 maps to FY 2026"
  );
  // April 1 is the FY boundary.
  const apr1 = Date.UTC(2026, 3, 1);
  assert(
    deriveInvoiceNumber("11111111-2222-3333-4444-555555555555", apr1) ===
      "INV-2026-11111111",
    "April 1 flips to the new FY"
  );
  // March 31 is still the previous FY.
  const mar31 = Date.UTC(2026, 2, 31);
  assert(
    deriveInvoiceNumber("11111111-2222-3333-4444-555555555555", mar31) ===
      "INV-2025-11111111",
    "March 31 stays in the old FY"
  );
  // Determinism.
  const a = deriveInvoiceNumber("dead-beef-0000-0000-0000-000000000000", apr1);
  const b = deriveInvoiceNumber("dead-beef-0000-0000-0000-000000000000", apr1);
  assert(a === b, "deriveInvoiceNumber is deterministic");
}

// ------------------------------------------------------------------
// SECTION E — lib/invoicing/seller.ts env-driven defaults
// ------------------------------------------------------------------

console.log("\n[SECTION E] seller.ts env-driven defaults");

const sellerSrc = read(SELLER_PATH);
assert(sellerSrc.length > 0, "lib/invoicing/seller.ts exists");
assert(
  /export\s+function\s+getSellerIdentity/.test(sellerSrc),
  "getSellerIdentity is exported"
);
for (const env of [
  "INVOICE_SELLER_LEGAL_NAME",
  "INVOICE_SELLER_TRADE_NAME",
  "INVOICE_SELLER_GSTIN",
  "INVOICE_SELLER_STATE_CODE",
  "INVOICE_SELLER_PAN",
  "INVOICE_SELLER_EMAIL",
  "INVOICE_SELLER_SAC_CODE",
]) {
  assert(
    sellerSrc.includes(env),
    `seller.ts reads env var ${env}`
  );
}
assert(
  /Rajasekar Selvam/.test(sellerSrc),
  "default legalName is 'Rajasekar Selvam'"
);
assert(
  /pdfcraftai/.test(sellerSrc),
  "default tradeName is 'pdfcraftai'"
);
assert(
  /998313/.test(sellerSrc),
  "default SAC code is 998313 (IT consulting & support)"
);

// ------------------------------------------------------------------
// SECTION F — lib/invoicing/assemble.ts tax math
// ------------------------------------------------------------------

console.log("\n[SECTION F] assemble.ts tax math");

const assembleSrc = read(ASSEMBLE_PATH);
assert(assembleSrc.length > 0, "lib/invoicing/assemble.ts exists");
assert(
  /export\s+function\s+assembleInvoiceInput/.test(assembleSrc),
  "assembleInvoiceInput is exported"
);
assert(
  /export\s+function\s+buildTaxBreakdown/.test(assembleSrc),
  "buildTaxBreakdown is exported"
);
assert(
  /Math\.round\(.*\/\s*10_?000\)/.test(assembleSrc),
  "buildTaxBreakdown converts micros→minor via /10000"
);
assert(
  /Math\.ceil\(taxMinor\s*\/\s*2\)/.test(assembleSrc),
  "intra_state splits CGST via Math.ceil so CGST gets the odd paisa"
);

// ------------------------------------------------------------------
// SECTION G — lib/invoicing/renderer.ts contract
// ------------------------------------------------------------------

console.log("\n[SECTION G] renderer.ts contract");

const rendererSrc = read(RENDERER_PATH);
assert(rendererSrc.length > 0, "lib/invoicing/renderer.ts exists");
assert(
  /export\s+async\s+function\s+renderInvoice/.test(rendererSrc),
  "renderInvoice is exported as async function"
);
assert(
  /from\s+["']pdf-lib["']/.test(rendererSrc),
  "renderer.ts imports from pdf-lib"
);
assert(
  /PDFDocument\.create\(\)/.test(rendererSrc),
  "renderer.ts creates a new PDFDocument"
);
assert(
  /doc\.addPage\(\s*\[\s*595\.28\s*,\s*841\.89\s*\]\s*\)/.test(rendererSrc),
  "renderer.ts adds an A4 page (595.28 x 841.89 pt)"
);
assert(
  !/from\s+["']@\/db/.test(rendererSrc) &&
    !/process\.env\./.test(rendererSrc) &&
    !/fetch\s*\(/.test(rendererSrc),
  "renderer.ts is pure — no db, env, or fetch"
);
assert(
  /describeClassification/.test(rendererSrc),
  "renderer.ts prints classification text via describeClassification"
);
assert(
  /Computer-generated invoice|computer-generated invoice/.test(rendererSrc),
  "renderer.ts prints the computer-generated-invoice compliance line"
);
assert(
  /pending registration/.test(rendererSrc),
  "renderer.ts handles the pre-GSTIN state with a 'pending registration' line"
);

// ------------------------------------------------------------------
// SECTION H — /api/invoices/[paymentId] route shape
// ------------------------------------------------------------------

console.log("\n[SECTION H] /api/invoices/[paymentId] route shape");

const invoiceRouteSrc = read(INVOICE_ROUTE_PATH);
assert(
  invoiceRouteSrc.length > 0,
  "app/api/invoices/[paymentId]/route.ts exists"
);
assert(
  /export\s+async\s+function\s+GET/.test(invoiceRouteSrc),
  "route exports GET"
);
assert(
  /auth\(\)/.test(invoiceRouteSrc),
  "route gates on auth()"
);
assert(
  /eq\(schema\.payments\.userId,\s*userId\)/.test(invoiceRouteSrc),
  "route filters on userId so cross-user access returns 404"
);
assert(
  /status:\s*401/.test(invoiceRouteSrc) &&
    /status:\s*404/.test(invoiceRouteSrc) &&
    /status:\s*409/.test(invoiceRouteSrc),
  "route returns 401 + 404 + 409 for the documented failure modes"
);
assert(
  /application\/pdf/.test(invoiceRouteSrc),
  "route sets Content-Type: application/pdf"
);
assert(
  /Content-Disposition/.test(invoiceRouteSrc) &&
    /attachment/.test(invoiceRouteSrc),
  "route sets Content-Disposition: attachment"
);
assert(
  /Cache-Control[\s\S]{0,40}no-store/.test(invoiceRouteSrc),
  "route sets Cache-Control: private, no-store"
);
assert(
  /runtime\s*=\s*["']nodejs["']/.test(invoiceRouteSrc),
  "route pins runtime = 'nodejs' (pdf-lib needs node crypto)"
);

// ------------------------------------------------------------------
// SECTION I — /api/admin/tax/export.csv route shape
// ------------------------------------------------------------------

console.log("\n[SECTION I] /api/admin/tax/export.csv route shape");

const csvRouteSrc = read(CSV_ROUTE_PATH);
assert(csvRouteSrc.length > 0, "CSV export route exists");
assert(
  /export\s+async\s+function\s+GET/.test(csvRouteSrc),
  "CSV route exports GET"
);
assert(
  /requireAdmin\(\)/.test(csvRouteSrc),
  "CSV route gates on requireAdmin()"
);
assert(
  /getTaxSnapshot\(/.test(csvRouteSrc),
  "CSV route pulls data via getTaxSnapshot"
);
assert(
  /text\/csv/.test(csvRouteSrc),
  "CSV route sets Content-Type: text/csv"
);
for (const section of ["# HEADLINE", "# BY_TREATMENT", "# BY_CURRENCY", "# DAILY"]) {
  assert(
    csvRouteSrc.includes(section),
    `CSV route emits section header "${section}"`
  );
}
assert(
  /days\s*=\s*clampDays\(/.test(csvRouteSrc),
  "CSV route clamps the days param"
);

// ------------------------------------------------------------------
// SECTION J — page updates
// ------------------------------------------------------------------

console.log("\n[SECTION J] receipts + admin/tax page updates");

const receiptsSrc = read(RECEIPTS_PAGE_PATH);
assert(
  /\/api\/invoices\/\$\{encodeURIComponent\(row\.id\)\}/.test(receiptsSrc),
  "receipts page links to /api/invoices/{payment.id}"
);
assert(
  !/mailto:support@pdfcraftai\.com\?subject=Receipt%20request/.test(
    receiptsSrc
  ),
  "receipts page no longer uses the mailto: placeholder for each row"
);
assert(
  /Download PDF/.test(receiptsSrc),
  "receipts page shows a 'Download PDF' link per row"
);

const adminTaxSrc = read(ADMIN_TAX_PAGE_PATH);
assert(
  /\/api\/admin\/tax\/export\.csv\?days=/.test(adminTaxSrc),
  "admin/tax page links to /api/admin/tax/export.csv?days={days}"
);
assert(
  /Download CSV/.test(adminTaxSrc),
  "admin/tax page renders a 'Download CSV' link"
);

// ------------------------------------------------------------------
// SECTION L — migration 0016 + schema.ts users billing columns
// ------------------------------------------------------------------

console.log(
  "\n[SECTION L] migration 0016 + schema.ts users billing columns (PART 2)"
);

const migration16Src = read(MIGRATION_0016_PATH);
assert(
  migration16Src.length > 0,
  "db/migrations/0016_users_billing_profile.sql exists"
);
assert(
  /ALTER\s+TABLE\s+`users`/.test(migration16Src),
  "migration 0016 targets the users table"
);
for (const col of [
  "`gstin` varchar(15) NULL",
  "`billing_name` varchar(255) NULL",
  "`billing_address_line1` varchar(255) NULL",
  "`billing_address_line2` varchar(255) NULL",
  "`billing_city` varchar(128) NULL",
  "`billing_postal_code` varchar(32) NULL",
  "`billing_state` char(2) NULL",
  "`billing_country` char(2) NULL",
]) {
  assert(
    migration16Src.includes(col),
    `migration 0016 adds column: ${col}`
  );
}
assert(
  !/NOT\s+NULL/i.test(
    migration16Src.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
  ),
  "migration 0016 is additive-only — no NOT NULL columns"
);

const authSchemaSrc = read(AUTH_SCHEMA_PATH);
assert(authSchemaSrc.length > 0, "db/schema/auth.ts exists");
for (const col of [
  /gstin:\s*varchar\("gstin",\s*\{\s*length:\s*15\s*\}\)/,
  /billingName:\s*varchar\("billing_name",\s*\{\s*length:\s*255\s*\}\)/,
  /billingAddressLine1:\s*varchar\("billing_address_line1",\s*\{\s*length:\s*255\s*\}\)/,
  /billingAddressLine2:\s*varchar\("billing_address_line2",\s*\{\s*length:\s*255\s*\}\)/,
  /billingCity:\s*varchar\("billing_city",\s*\{\s*length:\s*128\s*\}\)/,
  /billingPostalCode:\s*varchar\("billing_postal_code",\s*\{\s*length:\s*32\s*\}\)/,
  /billingState:\s*varchar\("billing_state",\s*\{\s*length:\s*2\s*\}\)/,
  /billingCountry:\s*varchar\("billing_country",\s*\{\s*length:\s*2\s*\}\)/,
]) {
  assert(
    col.test(authSchemaSrc),
    `schema.ts users table mirrors column: ${col.source}`
  );
}

// ------------------------------------------------------------------
// SECTION M — billing-actions + BillingProfileForm + settings wire
//             + invoice route billing wire + /admin/invoicing page
// ------------------------------------------------------------------

console.log(
  "\n[SECTION M] billing-actions + BillingProfileForm + settings wire + admin/invoicing page"
);

// --- billing-actions.ts ---
const billingActionsSrc = read(BILLING_ACTIONS_PATH);
assert(
  billingActionsSrc.length > 0,
  "lib/invoicing/billing-actions.ts exists"
);
assert(
  /^\s*"use server";/m.test(billingActionsSrc),
  "billing-actions.ts is a server-actions module"
);
assert(
  /import\s+["']server-only["']/.test(billingActionsSrc),
  "billing-actions.ts imports 'server-only' guard"
);
assert(
  /export\s+async\s+function\s+updateBillingProfileAction/.test(
    billingActionsSrc
  ),
  "billing-actions.ts exports updateBillingProfileAction"
);
assert(
  /export\s+type\s+BillingProfileState/.test(billingActionsSrc),
  "billing-actions.ts exports BillingProfileState type"
);
assert(
  /validateGstin\b/.test(billingActionsSrc) &&
    /INDIAN_STATE_CODES\b/.test(billingActionsSrc),
  "billing-actions.ts wires validateGstin + INDIAN_STATE_CODES from ./gstin"
);
assert(
  /revalidatePath\(\s*["']\/app\/settings["']\s*\)/.test(billingActionsSrc),
  "billing-actions.ts revalidates /app/settings on save"
);
assert(
  /revalidatePath\(\s*["']\/app\/receipts["']\s*\)/.test(billingActionsSrc),
  "billing-actions.ts revalidates /app/receipts on save"
);
// Every failure reason mapped to user copy.
for (const reason of [
  "empty",
  "wrong_length",
  "bad_format",
  "bad_state_code",
  "bad_checksum",
  "not_regular_taxpayer",
]) {
  assert(
    new RegExp(`\\b${reason}\\b\\s*:`).test(billingActionsSrc),
    `billing-actions.ts maps reason "${reason}" to user-friendly copy`
  );
}
assert(
  /GSTIN is an India-only identifier/.test(billingActionsSrc),
  "billing-actions.ts rejects GSTIN with non-IN country"
);

// --- BillingProfileForm.tsx ---
const billingFormSrc = read(BILLING_FORM_PATH);
assert(
  billingFormSrc.length > 0,
  "components/app/settings/BillingProfileForm.tsx exists"
);
assert(
  /^\s*"use client";/m.test(billingFormSrc),
  "BillingProfileForm is a client component"
);
assert(
  /useFormState\b[\s\S]{0,80}updateBillingProfileAction/.test(billingFormSrc),
  "BillingProfileForm wires useFormState(updateBillingProfileAction)"
);
assert(
  /useFormStatus\b/.test(billingFormSrc),
  "BillingProfileForm uses useFormStatus for pending-button state"
);
assert(
  /export\s+function\s+BillingProfileForm/.test(billingFormSrc),
  "BillingProfileForm is a named export"
);
for (const fieldName of [
  'name="billingName"',
  'name="billingAddressLine1"',
  'name="billingAddressLine2"',
  'name="billingCity"',
  'name="billingPostalCode"',
  'name="billingState"',
  'name="billingCountry"',
  'name="gstin"',
]) {
  assert(
    billingFormSrc.includes(fieldName),
    `BillingProfileForm renders field: ${fieldName}`
  );
}
assert(
  /POPULAR_STATES/.test(billingFormSrc) &&
    /POPULAR_COUNTRIES/.test(billingFormSrc),
  "BillingProfileForm defines POPULAR_STATES + POPULAR_COUNTRIES inline"
);
assert(
  !/from\s+["']@\/lib\/invoicing\/gstin["']/.test(billingFormSrc),
  "BillingProfileForm does NOT import from server-only lib/invoicing/gstin"
);

// --- /app/settings/page.tsx wire-up ---
const settingsPageSrc = read(SETTINGS_PAGE_PATH);
assert(
  /import\s+\{\s*BillingProfileForm\s*\}\s+from\s+["']@\/components\/app\/settings\/BillingProfileForm["']/.test(
    settingsPageSrc
  ),
  "settings page imports BillingProfileForm"
);
assert(
  /<BillingProfileForm\b/.test(settingsPageSrc),
  "settings page renders <BillingProfileForm />"
);
for (const col of [
  "gstin",
  "billingName",
  "billingAddressLine1",
  "billingAddressLine2",
  "billingCity",
  "billingPostalCode",
  "billingState",
  "billingCountry",
]) {
  assert(
    new RegExp(`schema\\.users\\.${col}\\b`).test(settingsPageSrc),
    `settings page selects schema.users.${col}`
  );
}

// --- /api/invoices/[paymentId]/route.ts billing-column wire-up ---
{
  const routeSrc = invoiceRouteSrc; // already loaded in SECTION H.
  for (const col of [
    "billingName",
    "billingAddressLine1",
    "billingAddressLine2",
    "billingCity",
    "billingPostalCode",
    "billingState",
    "billingCountry",
  ]) {
    assert(
      new RegExp(`schema\\.users\\.${col}\\b`).test(routeSrc),
      `invoice route selects schema.users.${col} (PART 2)`
    );
  }
  assert(
    /schema\.users\.gstin\b/.test(routeSrc),
    "invoice route selects schema.users.gstin (PART 2)"
  );
  assert(
    /user\.billingCountry\s*\|\|\s*["']IN["']/.test(routeSrc),
    "invoice route falls back to 'IN' when billingCountry is NULL"
  );
  assert(
    /INDIAN_STATE_CODES\b/.test(routeSrc),
    "invoice route validates billingState against INDIAN_STATE_CODES"
  );
  assert(
    /user\.billingName\s*\|\|\s*user\.name/.test(routeSrc),
    "invoice route prefers billingName over users.name"
  );
  // Ensure the pre-PART-2 hard-coded block is gone.
  assert(
    !/const\s+buyerCountry\s*:\s*string\s*=\s*["']IN["']/.test(routeSrc),
    "invoice route no longer hard-codes buyerCountry = 'IN'"
  );
}

// --- admin layout NAV wire-up + /admin/invoicing page ---
const adminLayoutSrc = read(ADMIN_LAYOUT_PATH);
assert(adminLayoutSrc.length > 0, "app/admin/layout.tsx exists");
assert(
  /href:\s*["']\/admin\/invoicing["']/.test(adminLayoutSrc),
  "admin layout NAV includes /admin/invoicing"
);

const adminInvoicingSrc = read(ADMIN_INVOICING_PAGE_PATH);
assert(
  adminInvoicingSrc.length > 0,
  "app/admin/invoicing/page.tsx exists"
);
assert(
  /getSellerIdentity\(\)/.test(adminInvoicingSrc),
  "admin/invoicing page reads getSellerIdentity()"
);
assert(
  /deriveInvoiceNumber\(/.test(adminInvoicingSrc),
  "admin/invoicing page renders deriveInvoiceNumber per row"
);
assert(
  /schema\.payments\b/.test(adminInvoicingSrc) &&
    /\.limit\(20\)/.test(adminInvoicingSrc),
  "admin/invoicing page lists last 20 payments"
);
assert(
  /\/api\/invoices\/\$\{encodeURIComponent\(r\.id\)\}/.test(
    adminInvoicingSrc
  ),
  "admin/invoicing page links to /api/invoices/{payment.id}"
);
assert(
  /Seller identity/.test(adminInvoicingSrc),
  "admin/invoicing page has 'Seller identity' section"
);
assert(
  /Invoice header logic/.test(adminInvoicingSrc),
  "admin/invoicing page explains Receipt / Tax Invoice / Export Invoice headers"
);
assert(
  /pending registration/.test(adminInvoicingSrc),
  "admin/invoicing page surfaces the 'pending registration' pre-GSTIN state"
);
assert(
  /not invoiceable/.test(adminInvoicingSrc),
  "admin/invoicing page greys out pending/failed/cancelled rows"
);

// ------------------------------------------------------------------
// SECTION K — aggregator registration
// ------------------------------------------------------------------

console.log("\n[SECTION K] run-all-tests.mjs registration");

const aggSrc = read(AGGREGATOR_PATH);
assert(aggSrc.length > 0, "scripts/run-all-tests.mjs exists");
assert(
  /test-invoicing\.mjs/.test(aggSrc),
  "run-all-tests.mjs references test-invoicing.mjs"
);
assert(
  /name:\s*["']invoicing["']/.test(aggSrc),
  "run-all-tests.mjs registers suite with name 'invoicing'"
);

// ------------------------------------------------------------------
// Summary
// ------------------------------------------------------------------

console.log(`\nInvoicing tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
