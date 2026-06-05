#!/usr/bin/env node
// Foundation guard for the registered-only favourites feature (2026-06-05):
// migration 0030 + Drizzle schema + /api/favorites route shape. Static parse.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0; const failures = [];
const assert = (c, m) => { if (c) passed++; else { failed++; failures.push(m); console.error(`  ✗ ${m}`); } };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

console.log("migration 0030:");
const mig = read("db/migrations/0030_user_favorites.sql");
assert(/CREATE TABLE IF NOT EXISTS\s+`user_favorites`/.test(mig), "creates user_favorites (idempotent)");
assert(/PRIMARY KEY\s*\(`user_id`\s*,\s*`tool_id`\)/.test(mig), "composite PK (user_id, tool_id)");
assert(/FOREIGN KEY\s*\(`user_id`\)\s*REFERENCES\s+`users`\s*\(`id`\)\s*ON DELETE CASCADE/.test(mig), "FK to users(id) ON DELETE CASCADE");
const exec = mig.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
assert(!/ALTER TABLE|DROP TABLE|DROP COLUMN/.test(exec), "additive only (no ALTER/DROP)");

console.log("Drizzle schema:");
const app = read("db/schema/app.ts");
assert(/export const userFavorites = mysqlTable\(\s*"user_favorites"/.test(app), "userFavorites table exported");
assert(/primaryKey,/.test(app.split('from "drizzle-orm/mysql-core"')[0]), "primaryKey imported");
assert(/primaryKey\(\{\s*columns:\s*\[t\.userId,\s*t\.toolId\]/.test(app), "composite primaryKey on (userId, toolId)");
assert(/onDelete:\s*"cascade"/.test(app.slice(app.indexOf("export const userFavorites"))), "userId FK cascades");

console.log("/api/favorites route:");
const route = read("app/api/favorites/route.ts");
assert(/from "@\/auth"/.test(route) && /auth\(\)/.test(route), "uses auth()");
assert((route.match(/auth_required.*401|401.*auth_required/g) || []).length >= 1 || /"auth_required"/.test(route), "401 auth_required for anonymous");
assert(/export async function GET\(/.test(route) && /export async function POST\(/.test(route), "GET + POST handlers");
assert(/onDuplicateKeyUpdate/.test(route), "idempotent add (onDuplicateKeyUpdate)");
assert(/toolById\(/.test(route), "validates toolId against the catalog");
assert(/unknown_tool/.test(route), "rejects unknown tool ids");

console.log("client gating:");
const tf = read("components/marketing/ToolFilter.tsx");
assert(/useSession/.test(tf), "ToolFilter uses useSession");
assert(/showStar=\{authed\}/.test(tf), "stars gated on authed");
assert(/const showFav = authed &&/.test(tf), "Favourites section gated on authed");
assert(!/getFavorites|toggleFavorite/.test(tf), "no localStorage favourites helpers remain in ToolFilter");
assert(/fetch\("\/api\/favorites"/.test(tf), "favourites fetched/toggled via the API");

console.log("");
if (failed === 0) { console.log(`PASS — ${passed} assertions`); console.log(`${passed} passed, 0 failed`); process.exit(0); }
else { console.error("FAIL:"); for (const m of failures) console.error(`  ${m}`); console.log(`${passed} passed, ${failed} failed`); process.exit(1); }
