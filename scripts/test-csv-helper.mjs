#!/usr/bin/env node
/**
 * M22 (#193, 2026-04-29): unit tests for lib/client/csv.ts.
 *
 * Pure-logic harness — escapeCsvField, csvRow, buildCsv. We don't
 * exercise downloadCsv() here because it touches DOM globals
 * (document, URL.createObjectURL, Blob); that path is already
 * covered indirectly by the four migrated consumer tools and by
 * scripts/test-objecturl-revocation.mjs.
 *
 * To make these importable from node without a bundler, we read the
 * source file as text and run it through a tiny inline transformer
 * that strips TS type annotations on function signatures. The
 * underlying logic is plain JS — no fancy TS features used.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  }
}

// ──────────────────────────────────────────────────────────────────
// Load the helper. Strip TS-only syntax so node can execute it.
// ──────────────────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(ROOT, "lib/client/csv.ts"), "utf8");
const stripped = src
  // strip type annotations on function parameters and return types
  .replace(/: readonly \(readonly unknown\[\]\)\[\]/g, "")
  .replace(/: readonly unknown\[\]/g, "")
  .replace(/: readonly string\[\]/g, "")
  .replace(/: unknown/g, "")
  .replace(/: string/g, "")
  .replace(/: void/g, "")
  // strip `export` keyword (we'll wire exports manually)
  .replace(/export function/g, "function");

const evalCtx = `
${stripped}
return { escapeCsvField, csvRow, buildCsv };
`;
// eslint-disable-next-line no-new-func
const { escapeCsvField, csvRow, buildCsv } = new Function(evalCtx)();

// ──────────────────────────────────────────────────────────────────
// escapeCsvField
// ──────────────────────────────────────────────────────────────────
console.log("escapeCsvField:");
assert(escapeCsvField("hello") === "hello", "plain text returns unchanged");
assert(escapeCsvField("") === "", "empty string returns empty");
assert(escapeCsvField(null) === "", "null returns empty");
assert(escapeCsvField(undefined) === "", "undefined returns empty");
assert(escapeCsvField(42) === "42", "number coerces to string");
assert(escapeCsvField(true) === "true", "boolean coerces to string");
assert(escapeCsvField("a,b") === '"a,b"', "comma triggers quoting");
assert(escapeCsvField('say "hi"') === '"say ""hi"""', "quote doubles + wraps");
// LF and CRLF normalize to a single space — that means the field no
// longer contains anything special, so it doesn't get wrapped.
assert(escapeCsvField("a\nb") === "a b", "LF normalized to space; no quoting needed");
assert(escapeCsvField("a\r\nb") === "a b", "CRLF normalized to space; no quoting needed");
// Lone CR is rare (Mac OS 9-era) but the wrap regex still catches it.
// We don't normalize \r alone because \r in the middle of a field
// isn't ambiguous in CSV when wrapped, and there's no realistic
// source of lone CR in our data.
assert(escapeCsvField("a\rb") === '"a\rb"', "lone CR triggers wrapping");

// ──────────────────────────────────────────────────────────────────
// csvRow
// ──────────────────────────────────────────────────────────────────
console.log("csvRow:");
assert(csvRow(["a", "b", "c"]) === "a,b,c", "plain row joins with commas");
assert(csvRow([1, 2, 3]) === "1,2,3", "numbers in a row");
assert(csvRow(["a", "b,c", "d"]) === 'a,"b,c",d', "comma in middle field quotes only that field");
assert(csvRow([null, "b", undefined]) === ",b,", "null/undefined become empty");
assert(csvRow([]) === "", "empty row");

// ──────────────────────────────────────────────────────────────────
// buildCsv
// ──────────────────────────────────────────────────────────────────
console.log("buildCsv:");
{
  const out = buildCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
  assert(out === "a,b\r\n1,2\r\n3,4", "CRLF separator between rows");
}
{
  const out = buildCsv(["page", "url"], [[1, "https://example.com"]]);
  assert(out === "page,url\r\n1,https://example.com", "header + one row");
}
{
  const out = buildCsv(["x"], []);
  assert(out === "x", "empty body just returns header");
}
{
  // Real-world case from PdfLinksTool: page number + type + URL with comma.
  const out = buildCsv(
    ["page", "type", "target"],
    [[1, "uri", "https://x.com/path?a=1,b=2"]],
  );
  assert(
    out === 'page,type,target\r\n1,uri,"https://x.com/path?a=1,b=2"',
    "URL with embedded comma gets quoted",
  );
}

// ──────────────────────────────────────────────────────────────────
// Wrap up
// ──────────────────────────────────────────────────────────────────
console.log("");
if (failed === 0) {
  console.log(`PASS — ${passed} assertions`);
  console.log(`${passed} passed, 0 failed`);
  process.exit(0);
} else {
  console.error(`FAIL — ${failed} assertion(s) failed:`);
  for (const m of failures) console.error(`  ${m}`);
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
