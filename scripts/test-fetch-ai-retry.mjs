#!/usr/bin/env node
/**
 * M20 (#193, 2026-04-29): unit tests for lib/client/fetch-ai-with-retry.ts.
 *
 * Mocks global.fetch to simulate transient/permanent failures and
 * exercises the retry loop. Pure logic; no jsdom or browser globals
 * other than fetch + Response, both of which we polyfill.
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
// Strip TS types and `"use client";` so the module can be evaluated
// via new Function. Same trick as test-csv-helper.mjs.
// ──────────────────────────────────────────────────────────────────
const src = fs.readFileSync(
  path.join(ROOT, "lib/client/fetch-ai-with-retry.ts"),
  "utf8",
);

const stripped = src
  .replace(/^"use client";\s*/m, "")
  .replace(/export interface FetchAiOptions[\s\S]*?^}\s*/m, "")
  // Strip variable type annotations: `let foo: Type = ...` → `let foo = ...`
  .replace(/(let|const|var)\s+(\w+)\s*:\s*[^=;]+(=|;)/g, "$1 $2 $3")
  // Strip parameter type annotations
  .replace(/: FetchAiOptions/g, "")
  .replace(/: Promise<Response>/g, "")
  .replace(/: Promise<void>/g, "")
  .replace(/: AbortSignal\s*\|\s*undefined/g, "")
  .replace(/: AbortSignal[?]?/g, "")
  .replace(/: number/g, "")
  .replace(/: string/g, "")
  .replace(/: void/g, "")
  .replace(/export (function|async function|const) /g, "$1 ")
  // remove `as const` suffix
  .replace(/\] as const;/g, "];")
  // strip non-null assertion `!` after array indexer or property access
  .replace(/\]!/g, "]")
  .replace(/(\w)!\./g, "$1.")
  // strip optional-parameter `?` markers (signal?: AbortSignal → signal)
  .replace(/(\w)\?(\s*[,)])/g, "$1$2");

const evalCtx = `
${stripped}
return { fetchAiWithRetry };
`;

// eslint-disable-next-line no-new-func
const { fetchAiWithRetry } = new Function(evalCtx)();

// ──────────────────────────────────────────────────────────────────
// Polyfills: minimal Response + DOMException for node.
// ──────────────────────────────────────────────────────────────────
class MockResponse {
  constructor(status, body = {}) {
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this._body = body;
  }
  async json() {
    return this._body;
  }
  get body() {
    return {
      cancel: async () => {},
    };
  }
}
globalThis.Response = MockResponse;
if (typeof globalThis.DOMException === "undefined") {
  globalThis.DOMException = class DOMException extends Error {
    constructor(msg, name) {
      super(msg);
      this.name = name;
    }
  };
}

// ──────────────────────────────────────────────────────────────────
// Helper: install a fetch mock with a script of [response | "throw-net"].
// Each call advances one step. The shortened sleep schedule (0ms)
// keeps the suite fast.
// ──────────────────────────────────────────────────────────────────
function installFetchScript(script) {
  let i = 0;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const step = script[i++];
    if (step === "throw-net") {
      throw new TypeError("network");
    }
    if (step instanceof Error) {
      throw step;
    }
    return step;
  };
  return calls;
}

// Patch the BACKOFF_MS used inside the module by monkey-patching
// global setTimeout to fire immediately. (Less invasive than
// rewriting the source.)
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (cb, _ms) => realSetTimeout(cb, 0);

// ──────────────────────────────────────────────────────────────────
// Test 1: 200 first try → no retry.
// ──────────────────────────────────────────────────────────────────
console.log("Happy path:");
{
  const ok = new MockResponse(200, { ok: true });
  const calls = installFetchScript([ok]);
  const onAttempt = [];
  const res = await fetchAiWithRetry("/api/ai/test", {
    bodyFactory: () => new (class { append() {} })(),
    onAttempt: (n, max) => onAttempt.push(`${n}/${max}`),
  });
  assert(res.status === 200, "200 OK returned");
  assert(calls.length === 1, "fetch called exactly once");
  assert(onAttempt.length === 1, "onAttempt called once");
  assert(onAttempt[0] === "1/3", "onAttempt reports 1/3");
}

// ──────────────────────────────────────────────────────────────────
// Test 2: 503 then 200 → one retry.
// ──────────────────────────────────────────────────────────────────
console.log("");
console.log("Transient 503 then 200:");
{
  const transient = new MockResponse(503);
  const ok = new MockResponse(200, { ok: true });
  const calls = installFetchScript([transient, ok]);
  const onAttempt = [];
  const res = await fetchAiWithRetry("/api/ai/test", {
    bodyFactory: () => new (class { append() {} })(),
    onAttempt: (n) => onAttempt.push(n),
  });
  assert(res.status === 200, "final status is 200");
  assert(calls.length === 2, "fetch called twice");
  assert(onAttempt.length === 2, "onAttempt called twice");
  assert(onAttempt[0] === 1 && onAttempt[1] === 2, "attempt numbers 1, 2");
}

// ──────────────────────────────────────────────────────────────────
// Test 3: 503 503 200 → two retries.
// ──────────────────────────────────────────────────────────────────
console.log("");
console.log("Two transient 503s then 200:");
{
  const t1 = new MockResponse(503);
  const t2 = new MockResponse(502);
  const ok = new MockResponse(200);
  const calls = installFetchScript([t1, t2, ok]);
  const res = await fetchAiWithRetry("/api/ai/test", {
    bodyFactory: () => new (class { append() {} })(),
  });
  assert(res.status === 200, "final status is 200");
  assert(calls.length === 3, "fetch called three times");
}

// ──────────────────────────────────────────────────────────────────
// Test 4: 503 503 503 → returns last 503 (max attempts exhausted).
// ──────────────────────────────────────────────────────────────────
console.log("");
console.log("All three attempts 503 → returns last 503:");
{
  const t1 = new MockResponse(503);
  const t2 = new MockResponse(503);
  const t3 = new MockResponse(503);
  const calls = installFetchScript([t1, t2, t3]);
  const res = await fetchAiWithRetry("/api/ai/test", {
    bodyFactory: () => new (class { append() {} })(),
  });
  assert(res.status === 503, "returns last 503 status");
  assert(calls.length === 3, "fetch called three times (max attempts)");
}

// ──────────────────────────────────────────────────────────────────
// Test 5: 400 → no retry (permanent client error).
// ──────────────────────────────────────────────────────────────────
console.log("");
console.log("400 Bad Request → no retry:");
{
  const bad = new MockResponse(400, { error: "bad" });
  const calls = installFetchScript([bad]);
  const res = await fetchAiWithRetry("/api/ai/test", {
    bodyFactory: () => new (class { append() {} })(),
  });
  assert(res.status === 400, "returns 400 unchanged");
  assert(calls.length === 1, "fetch called once (no retry on 4xx)");
}

// ──────────────────────────────────────────────────────────────────
// Test 6: 500 → no retry (5xx other than 502/503/504/408).
// ──────────────────────────────────────────────────────────────────
console.log("");
console.log("500 Internal Server Error → no retry:");
{
  const internal = new MockResponse(500, { error: "boom" });
  const calls = installFetchScript([internal]);
  const res = await fetchAiWithRetry("/api/ai/test", {
    bodyFactory: () => new (class { append() {} })(),
  });
  assert(res.status === 500, "returns 500 unchanged");
  assert(calls.length === 1, "fetch called once (500 not in transient set)");
}

// ──────────────────────────────────────────────────────────────────
// Test 7: TypeError (network) then 200 → one retry.
// ──────────────────────────────────────────────────────────────────
console.log("");
console.log("Network TypeError then 200:");
{
  const ok = new MockResponse(200);
  const calls = installFetchScript(["throw-net", ok]);
  const res = await fetchAiWithRetry("/api/ai/test", {
    bodyFactory: () => new (class { append() {} })(),
  });
  assert(res.status === 200, "final status is 200 after recover");
  assert(calls.length === 2, "fetch called twice");
}

// ──────────────────────────────────────────────────────────────────
// Test 8: Three TypeErrors → throws the last TypeError.
// ──────────────────────────────────────────────────────────────────
console.log("");
console.log("Three network TypeErrors → throws:");
{
  installFetchScript(["throw-net", "throw-net", "throw-net"]);
  let caught = null;
  try {
    await fetchAiWithRetry("/api/ai/test", {
      bodyFactory: () => new (class { append() {} })(),
    });
  } catch (e) {
    caught = e;
  }
  assert(caught instanceof TypeError, "throws TypeError after exhausting retries");
}

// ──────────────────────────────────────────────────────────────────
// Test 9: 408 (Request Timeout) → retries (it's in the transient set).
// ──────────────────────────────────────────────────────────────────
console.log("");
console.log("408 Request Timeout → retries:");
{
  const t = new MockResponse(408);
  const ok = new MockResponse(200);
  const calls = installFetchScript([t, ok]);
  const res = await fetchAiWithRetry("/api/ai/test", {
    bodyFactory: () => new (class { append() {} })(),
  });
  assert(res.status === 200, "200 after 408 retry");
  assert(calls.length === 2, "fetch called twice");
}

// ──────────────────────────────────────────────────────────────────
// Test 10: bodyFactory called once per attempt.
// ──────────────────────────────────────────────────────────────────
console.log("");
console.log("bodyFactory called per-attempt:");
{
  const t = new MockResponse(503);
  const ok = new MockResponse(200);
  installFetchScript([t, ok]);
  let factoryCalls = 0;
  await fetchAiWithRetry("/api/ai/test", {
    bodyFactory: () => {
      factoryCalls++;
      return new (class { append() {} })();
    },
  });
  assert(factoryCalls === 2, "bodyFactory called twice (once per attempt)");
}

// ──────────────────────────────────────────────────────────────────
// M20 part 2: every AI tool consumer wires fetchAiWithRetry
// M18: every AI tool consumer renders the page-1 preview thumbnail
// ──────────────────────────────────────────────────────────────────
console.log("");
console.log("All AI tool consumers use fetchAiWithRetry + UploadedFilePreview:");
{
  const AI_CONSUMERS = [
    "BloodTestTool.tsx",
    "ComparePdfTool.tsx",
    "GeneratePdfTool.tsx",
    "MindmapPdfTool.tsx",
    "OcrPdfTool.tsx",
    "RedactPdfTool.tsx",
    "ResumeParserTool.tsx",
    "RewritePdfTool.tsx",
    "SearchablePdfTool.tsx",
    "SemanticSearchPdfTool.tsx",
    "SignPdfTool.tsx",
    "StructuredVariantTool.tsx",
    "SummarizePdfTool.tsx",
    "SummarizeVariantTool.tsx",
    "TableExtractTool.tsx",
    "TldrPdfTool.tsx",
    "TranslatePdfTool.tsx",
  ];
  for (const name of AI_CONSUMERS) {
    const src = fs.readFileSync(
      path.join(ROOT, "components/tools", name),
      "utf8",
    );
    assert(
      /fetchAiWithRetry/.test(src),
      `${name} imports/uses fetchAiWithRetry`,
    );
    // Should NOT have a raw `await fetch("/api/ai/` left over.
    assert(
      !/await\s+fetch\(\s*"\/api\/ai\//.test(src),
      `${name} no longer has raw await fetch("/api/ai/...")`,
    );
  }

  // M18: every AI tool that takes a file upload (Generate is
  // prompt-only, so it doesn't need a preview) renders
  // <UploadedFilePreview /> on its upload card.
  const FILE_UPLOAD_CONSUMERS = AI_CONSUMERS.filter(
    (n) => n !== "GeneratePdfTool.tsx",
  );
  for (const name of FILE_UPLOAD_CONSUMERS) {
    const src = fs.readFileSync(
      path.join(ROOT, "components/tools", name),
      "utf8",
    );
    assert(
      /<UploadedFilePreview/.test(src),
      `${name} renders <UploadedFilePreview /> on upload card (M18)`,
    );
  }
}

// ──────────────────────────────────────────────────────────────────
// Wrap up
// ──────────────────────────────────────────────────────────────────
globalThis.setTimeout = realSetTimeout;
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
