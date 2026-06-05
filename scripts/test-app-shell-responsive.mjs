#!/usr/bin/env node
// AppShell responsive-drawer contract guard (2026-06-05). Pins the mobile fix
// so the 240px sidebar can't silently go back to overflowing phones:
//   • globals.css: .app-shell grid, a max-width:768px breakpoint that drops to
//     1fr + turns .app-shell-sidebar into a translateX(-100%) off-canvas drawer
//   • AppShell.tsx: uses the app-shell* classes (not the old inline grid),
//     a navOpen drawer state, a hamburger (Menu) + close (X), a backdrop, and
//     closes the drawer on nav-link click + route change
// Static parse — no build needed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0; const failures = [];
const assert = (c, m) => { if (c) passed++; else { failed++; failures.push(m); console.error(`  ✗ ${m}`); } };
const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
const shell = fs.readFileSync(path.join(ROOT, "components/app/AppShell.tsx"), "utf8");

console.log("globals.css — responsive shell:");
assert(/\.app-shell\s*\{[^}]*grid-template-columns:\s*240px 1fr/.test(css), ".app-shell desktop grid is 240px 1fr");
assert(/\.app-shell-sidebar\s*\{/.test(css), ".app-shell-sidebar rule present");
assert(/\.app-shell-main\s*\{/.test(css), ".app-shell-main rule present");
assert(/@media\s*\(max-width:\s*768px\)/.test(css), "768px mobile breakpoint present");
// mobile rules (uniquely named, so assert against the whole sheet — the base
// .app-shell uses "240px 1fr" / "display:none", only the @media block uses these)
assert(/\.app-shell\s*\{\s*grid-template-columns:\s*1fr/.test(css), "mobile drops to a single column (1fr)");
assert(/\.app-shell-sidebar\s*\{[\s\S]*?transform:\s*translateX\(-100%\)/.test(css), "mobile sidebar is an off-canvas drawer (translateX -100%)");
assert(/\.app-shell-sidebar\[data-open="true"\]\s*\{[\s\S]*?translateX\(0\)/.test(css), "drawer slides in when data-open");
assert(/\.app-shell-topbar\s*\{[\s\S]*?display:\s*flex/.test(css), "mobile top bar shown");
assert(/\.app-shell-backdrop\[data-open="true"\]/.test(css), "backdrop shown when open");
assert(/\.app-shell-topbar\s*\{\s*display:\s*none/.test(css), "top bar hidden on desktop (base rule)");

console.log("AppShell.tsx — wiring:");
assert(/className="app-shell"/.test(shell), "uses .app-shell wrapper (not inline grid)");
assert(/className="app-shell-sidebar"/.test(shell) && /data-open=\{navOpen/.test(shell), "sidebar uses class + data-open=navOpen");
assert(/className="app-shell-main"/.test(shell), "main uses .app-shell-main");
assert(/className="app-shell-topbar"/.test(shell), "renders the mobile top bar");
assert(/className="app-shell-backdrop"/.test(shell), "renders the backdrop");
assert(/const \[navOpen, setNavOpen\] = useState/.test(shell), "navOpen drawer state exists");
assert(/<I\.Menu\b/.test(shell), "hamburger uses the Menu icon");
assert(/<I\.X\b/.test(shell), "close button uses the X icon");
assert(/onClick=\{\(\) => setNavOpen\(true\)\}/.test(shell), "hamburger opens the drawer");
assert(/onClick=\{\(\) => setNavOpen\(false\)\}/.test(shell), "backdrop/close/nav links close the drawer");
assert(/useEffect\(\s*\(\)\s*=>\s*\{\s*setNavOpen\(false\)/.test(shell), "drawer closes on route change");
// NAV must still be intact (test-user-dashboard-v2 also checks /app/usage)
assert(/href:\s*"\/app\/usage"/.test(shell), "NAV still includes /app/usage");

console.log("");
if (failed === 0) { console.log(`PASS — ${passed} assertions`); console.log(`${passed} passed, 0 failed`); process.exit(0); }
else { console.error("FAIL:"); for (const m of failures) console.error(`  ${m}`); console.log(`${passed} passed, ${failed} failed`); process.exit(1); }
