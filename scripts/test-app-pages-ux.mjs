#!/usr/bin/env node
// /app pages UX contract guard (2026-06-05). Pins the files/usage/chat/settings
// improvements so they can't silently regress. Static parse — no build needed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0; const failures = [];
const assert = (c, m) => { if (c) passed++; else { failed++; failures.push(m); console.error(`  ✗ ${m}`); } };
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

console.log("/app/files — findability:");
const filesPage = read("app/app/files/page.tsx");
const filesList = read("components/app/files/FilesList.tsx");
assert(/FilesList[^;]*from\s+["']@\/components\/app\/files\/FilesList["']/.test(filesPage), "page imports FilesList");
assert(/COUNT\(\*\)/.test(filesPage), "page computes a true COUNT(*) total");
assert(/<FilesList\s+rows=\{[^}]+\}\s+total=\{[^}]+\}/.test(filesPage), "page passes rows + total to FilesList");
assert(/createdAt:\s*new Date\([^)]*\)\.toISOString\(\)/.test(filesPage), "rows serialized (Date -> ISO) for the client boundary");
assert(/aria-label="Search files by name"/.test(filesList), "FilesList has a name search box");
assert(/Sort files/.test(filesList) && /value="newest"/.test(filesList) && /value="size"/.test(filesList), "FilesList has a sort control");
assert(/Uploads/.test(filesList) && /Tool outputs/.test(filesList), "FilesList has a source filter");
assert(/of \$\{rows\.length\} shown|\$\{rows\.length\} most recent/.test(filesList), "FilesList surfaces shown/total + cap honesty");
assert(/DeleteFileButton/.test(filesList) && /OpenInChatButton/.test(filesList), "FilesList keeps per-row delete + open-in-chat");

console.log("/app/usage — labels + chart + responsive:");
const usage = read("app/app/usage/page.tsx");
assert(/const OP_LABEL/.test(usage) && /function opLabel/.test(usage), "usage has an op->label map");
assert(/<Td[^>]*>\{opLabel\(row\.operation\)\}<\/Td>/.test(usage), "By-operation cell uses the friendly label");
assert((usage.match(/overflowX:\s*"auto"/g) || []).length >= 2, "both tables wrapped in overflow-x:auto (mobile)");
assert(/function DailyBars/.test(usage) && /<DailyBars data=\{daily\.data\}/.test(usage), "daily-spend bar chart present + rendered");
// dashboard-v2 contract must remain intact
assert(/getUsageRollup/.test(usage) && /getDailySpend/.test(usage), "usage still imports its query helpers");
assert(/runtime\s*=\s*"nodejs"/.test(usage) && /dynamic\s*=\s*"force-dynamic"/.test(usage), "usage keeps runtime/dynamic contract");

console.log("/app/chat — title search:");
const chatPage = read("app/app/chat/page.tsx");
const chatList = read("components/app/chat/ChatList.tsx");
assert(/ChatList[^;]*from\s+["']@\/components\/app\/chat\/ChatList["']/.test(chatPage), "chat page imports ChatList");
assert(/<ChatList\s+rows=\{/.test(chatPage), "chat page renders ChatList");
assert(/aria-label="Search chats by title"/.test(chatList), "ChatList has a title search box");
assert(/rows\.length > 5/.test(chatList), "search only shows when the list is long enough");

console.log("/app/settings — sign-in method + verification:");
const settings = read("app/app/settings/page.tsx");
assert(/Sign-in/.test(settings), "settings has a Sign-in section");
assert(/function providerLabel/.test(settings), "providerLabel helper present");
assert(/schema\.accounts/.test(settings) && /provider:\s*schema\.accounts\.provider/.test(settings), "queries accounts.provider");
assert(!/access_token|refresh_token|id_token/.test(settings), "never selects OAuth tokens (provider only)");
assert(/user\.emailVerified/.test(settings) && /Verified/.test(settings) && /Unverified/.test(settings), "shows email-verification state");

console.log("");
if (failed === 0) { console.log(`PASS — ${passed} assertions`); console.log(`${passed} passed, 0 failed`); process.exit(0); }
else { console.error("FAIL:"); for (const m of failures) console.error(`  ${m}`); console.log(`${passed} passed, ${failed} failed`); process.exit(1); }
