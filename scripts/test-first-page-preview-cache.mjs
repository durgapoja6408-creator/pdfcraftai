#!/usr/bin/env node
/**
 * M25 (#193, 2026-04-29): unit tests for the sampleHash + LRU cache
 * logic in useFirstPagePreview.ts.
 *
 * The React surface (useState/useEffect/useRef) isn't tested here —
 * those need jsdom and a test renderer. The pure-logic portions
 * (hash collision behavior, LRU eviction order) are what M25 added,
 * and those are testable with the same node-eval trick we've used
 * for csv-helper and fetch-ai-retry.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
// Extract just the sampleHash + lruTouch + cache constants from the
// module. We can't import the whole module (it depends on React).
// ──────────────────────────────────────────────────────────────────
const src = fs.readFileSync(
  path.join(ROOT, "components/tools/useFirstPagePreview.ts"),
  "utf8",
);

// Slice out the sampleHash function + the cache + lruTouch — those
// are well-defined pure-logic blocks at module scope.
const m = src.match(
  /const CACHE_MAX[\s\S]*?function lruTouch[\s\S]*?\n\}/,
);
if (!m) {
  console.error("Could not isolate sampleHash + lruTouch from source");
  process.exit(2);
}

let body = m[0];
// Strip TS type annotations.
body = body
  // Remove `: <Type>` annotations on variable/parameter declarations.
  // Match up to `=` or `,` or `)` or end-of-line.
  .replace(/:\s*Map<[^>]+,\s*[^>]+>/g, "")
  .replace(/:\s*Uint8Array\b/g, "")
  .replace(/:\s*CachedRender\b/g, "")
  .replace(/:\s*number\b/g, "")
  .replace(/:\s*string\b/g, "")
  .replace(/!\./g, ".")
  .replace(/\]!/g, "]")
  // Strip generic type arguments on constructor calls: `new Map<...>()` → `new Map()`
  .replace(/new\s+Map<[^>]+>\(\)/g, "new Map()");

// Define a minimal CachedRender stand-in (just an object).
const evalCtx = `
${body}
return { sampleHash, lruTouch, cache, CACHE_MAX };
`;

// eslint-disable-next-line no-new-func
const { sampleHash, lruTouch, cache, CACHE_MAX } = new Function(evalCtx)();

// ──────────────────────────────────────────────────────────────────
// sampleHash
// ──────────────────────────────────────────────────────────────────
console.log("sampleHash:");
{
  const a = new Uint8Array(2048);
  for (let i = 0; i < a.length; i++) a[i] = i & 0xff;
  const ha = sampleHash(a, 1.5);
  const hb = sampleHash(a, 1.5);
  assert(ha === hb, "same bytes + same scale → same hash");

  const hc = sampleHash(a, 2.0);
  assert(hc !== ha, "different scale → different hash");

  // Different bytes — flip one byte in the head sample.
  const aPrime = new Uint8Array(a);
  aPrime[5] = 0xff;
  const hd = sampleHash(aPrime, 1.5);
  assert(hd !== ha, "different head bytes → different hash");

  // Different bytes — flip one byte in the tail sample.
  const aPrime2 = new Uint8Array(a);
  aPrime2[a.length - 5] = 0xff;
  const he = sampleHash(aPrime2, 1.5);
  assert(he !== ha, "different tail bytes → different hash");

  // Different length, same head + tail samples.
  const longer = new Uint8Array(4096);
  for (let i = 0; i < longer.length; i++) longer[i] = i & 0xff;
  const hf = sampleHash(longer, 1.5);
  assert(hf !== ha, "different length → different hash");

  // Hash is stable across calls.
  assert(ha === sampleHash(a, 1.5), "hash deterministic");
}

// ──────────────────────────────────────────────────────────────────
// LRU eviction
// ──────────────────────────────────────────────────────────────────
console.log("");
console.log("LRU touch + eviction:");
{
  cache.clear();
  const mkVal = (n) => ({ bytes: new Uint8Array(n), pxWidth: n, pxHeight: n, pageCount: 1 });

  // Insert CACHE_MAX entries — all should fit.
  for (let i = 0; i < CACHE_MAX; i++) {
    lruTouch(`k${i}`, mkVal(i));
  }
  assert(cache.size === CACHE_MAX, `cache holds CACHE_MAX (${CACHE_MAX}) entries`);

  // Insert one more — oldest (k0) should evict.
  lruTouch(`k${CACHE_MAX}`, mkVal(CACHE_MAX));
  assert(cache.size === CACHE_MAX, `cache stays at CACHE_MAX after overflow`);
  assert(!cache.has("k0"), "oldest entry (k0) was evicted");
  assert(cache.has(`k${CACHE_MAX}`), "newest entry is present");

  // Touch k1 (move it to most-recent), then add one more — k2 should
  // evict, NOT k1 (because k1 was just touched).
  lruTouch("k1", mkVal(1));
  lruTouch(`k${CACHE_MAX + 1}`, mkVal(CACHE_MAX + 1));
  assert(cache.has("k1"), "k1 stays after being touched");
  assert(!cache.has("k2"), "k2 evicted (was oldest after k1 was touched)");
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
  console.error(`FAIL — ${failed} assertion(s) failed`);
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
