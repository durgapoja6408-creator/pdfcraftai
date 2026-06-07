#!/usr/bin/env node
// Anon AI-tool upsell contract guard (2026-06-07, upgrade plan #4). Pins the
// funnel banner + its single page-level injection. Static parse.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0; const failures = [];
const assert = (c, m) => { if (c) passed++; else { failed++; failures.push(m); console.error(`  ✗ ${m}`); } };
const up = fs.readFileSync(path.join(ROOT, "components/upsell/AiFreeCreditsUpsell.tsx"), "utf8");
const page = fs.readFileSync(path.join(ROOT, "app/tool/[id]/page.tsx"), "utf8");

console.log("AiFreeCreditsUpsell — anon-only + value-forward:");
assert(/^["']use client["'];/m.test(up), '"use client"');
assert(/useSession/.test(up) && /status !== "unauthenticated"\)\s*return null/.test(up), "renders ONLY for anonymous (self-gates, no flash on loading)");
assert(/5 credits/.test(up) && /no card/.test(up), "communicates the 5-free-credits / no-card value");
assert(/href=\{`\/register\?callbackUrl=\$\{cb\}`\}/.test(up), "primary CTA -> /register with callbackUrl");
assert(/href=\{`\/login\?callbackUrl=\$\{cb\}`\}/.test(up), "secondary CTA -> /login with callbackUrl");
assert(/encodeURIComponent\(`\/tool\/\$\{toolId\}`\)/.test(up), "callbackUrl is the current tool (post-auth returns here)");

console.log("page injection — AI tools only, once:");
assert(/import \{ AiFreeCreditsUpsell \} from "@\/components\/upsell\/AiFreeCreditsUpsell";/.test(page), "page imports the upsell");
assert(/\{!tool\.free && <AiFreeCreditsUpsell toolId=\{tool\.id\} \/>\}/.test(page), "rendered only for AI tools (!tool.free)");
assert((page.match(/<AiFreeCreditsUpsell/g) || []).length === 1, "injected exactly once (covers all AI tools)");

console.log("");
if (failed === 0) { console.log(`PASS — ${passed} assertions`); console.log(`${passed} passed, 0 failed`); process.exit(0); }
else { console.error("FAIL:"); for (const m of failures) console.error(`  ${m}`); console.log(`${passed} passed, ${failed} failed`); process.exit(1); }
