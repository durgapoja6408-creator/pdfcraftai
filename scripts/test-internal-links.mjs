#!/usr/bin/env node
/**
 * 2026-04-30 dead-link guard: every literal internal href in JSX
 * (e.g. `<Link href="/foo">`) must resolve to a live route.
 *
 * Background: components like Footer.tsx, ToolsShowcase.tsx, and many
 * SEO landings hardcode `<Link href="/...">` to static destinations.
 * If a target route is renamed or removed, those links silently 404
 * — bad UX, broken nav, and the next sitemap audit catches it only
 * after deploy.
 *
 * Resolution rules (mirrors Next.js + our routing):
 *   - "/" → app/page.tsx
 *   - "/<top-level>" → app/<top-level>/page.tsx
 *   - "/tool/<id>" → id must be in lib/tools.ts
 *   - "/blog/<slug>" → slug must be in lib/blog-posts.ts
 *   - "/help/<slug>" → slug must be an article slug in lib/help-topics.ts
 *   - "/alternatives/<slug>" → slug must be in lib/alternatives.ts
 *   - "/use-cases/<slug>" → slug must be a USE_CASES key in lib/use-cases.ts
 *   - "/about/authors/<slug>" → slug must be in lib/authors.ts
 *   - any other href → must match a `source:` in next.config.mjs redirects()
 *   - hash-only (#anchor) → skipped
 *   - external (https://, mailto:, tel:) → skipped
 *
 * Out of scope:
 *   - Dynamic href={...} (we'd need a JS evaluator).
 *   - Query strings — stripped before resolution.
 *   - Nested (catch-all) dynamic routes like /api/auth/[...nextauth].
 *
 * Output line conforms to the aggregator regex
 * `${name}: ${pass} passed, ${fail} failed`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const APP_ROOT = path.join(ROOT, "app");
const LIB_ROOT = path.join(ROOT, "lib");

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(msg);
  }
}

// ---------------------------------------------------------------------------
// Build the route resolver — load all data sources up front.
// ---------------------------------------------------------------------------

function readSrc(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function extractMatches(src, regex) {
  const out = new Set();
  let m;
  while ((m = regex.exec(src)) !== null) {
    out.add(m[1]);
  }
  return out;
}

// Tool IDs from lib/tools.ts.
const TOOL_IDS = extractMatches(
  readSrc("lib/tools.ts"),
  /^\s*\{\s*id:\s*"([^"]+)"/gm,
);
// Blog post slugs.
const BLOG_SLUGS = extractMatches(
  readSrc("lib/blog-posts.ts"),
  /^\s+slug:\s*"([^"]+)"/gm,
);
// Help article slugs (nested under topics — pull all `slug:` matches;
// some are topic slugs but those won't match /help/<slug> anyway, so
// false-positive resolution is fine — we want the over-permissive
// side here).
const HELP_SLUGS = extractMatches(
  readSrc("lib/help-topics.ts"),
  /\bslug:\s*"([^"]+)"/g,
);
const COMPETITOR_SLUGS = extractMatches(
  readSrc("lib/alternatives.ts"),
  /\bslug:\s*"([^"]+)"/g,
);
const AUTHOR_SLUGS = extractMatches(
  readSrc("lib/authors.ts"),
  /\bslug:\s*"([^"]+)"/g,
);
// Use-case slugs are dictionary keys.
const USE_CASE_SLUGS = extractMatches(
  readSrc("lib/use-cases.ts"),
  /^\s+"([a-z0-9-]+)":\s*\{/gm,
);
// Legal slugs from lib/legal-docs.ts.
const LEGAL_SLUGS = extractMatches(
  readSrc("lib/legal-docs.ts"),
  /\bslug:\s*"([^"]+)"/g,
);
// Redirect sources from next.config.mjs.
const REDIRECT_SOURCES = extractMatches(
  readSrc("next.config.mjs"),
  /\{\s*source:\s*"([^"]+)"/g,
);

// Top-level static app/<dir>/page.tsx routes.
const APP_TOP_LEVEL = new Set();
for (const entry of fs.readdirSync(APP_ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (entry.name.startsWith("(") || entry.name.startsWith("[")) continue;
  if (fs.existsSync(path.join(APP_ROOT, entry.name, "page.tsx"))) {
    APP_TOP_LEVEL.add(entry.name);
  }
}

assert(
  TOOL_IDS.size >= 80,
  `tool IDs parse: expected >= 80, got ${TOOL_IDS.size}`,
);
assert(
  APP_TOP_LEVEL.size >= 30,
  `app top-level routes: expected >= 30, got ${APP_TOP_LEVEL.size}`,
);

// ---------------------------------------------------------------------------
// Resolver.
// ---------------------------------------------------------------------------

/** Skip patterns: hashes, externals, raw protocols. */
function isSkipped(href) {
  if (!href || href.startsWith("#")) return true;
  if (/^(https?:|mailto:|tel:|sms:|javascript:)/i.test(href)) return true;
  return false;
}

/** Returns null if resolved, else a string explaining the dead link. */
function resolveHref(href) {
  if (isSkipped(href)) return null;
  // Strip query + hash before resolution.
  const clean = href.split("?")[0].split("#")[0];
  if (clean === "") return null; // pure hash href like "#main"
  if (clean === "/") return null; // homepage

  // 2026-05-12 SEV-1 audit fix: static assets in public/ are valid
  // hrefs. Next.js serves /public/<path> at /<path> automatically.
  // E.g. /sample.pdf → public/sample.pdf, /robots.txt → public/robots.txt.
  // Without this branch, the dead-link check false-positives on every
  // download link to a static asset.
  if (/^\/[^/]+\.(pdf|png|jpg|jpeg|gif|svg|webp|ico|txt|xml|json|webmanifest|wasm|woff|woff2)$/i.test(clean)) {
    const publicPath = path.join(ROOT, "public", clean.slice(1));
    if (fs.existsSync(publicPath)) return null;
    return `static asset ${clean} missing at public${clean}`;
  }

  // Redirect source short-circuit — if redirect catches it, the
  // destination resolution is enforced by test-redirect-destinations.
  if (REDIRECT_SOURCES.has(clean)) return null;

  const segments = clean.split("/").filter(Boolean);
  // Single-segment top-level: /pricing, /tools, /about, etc.
  if (segments.length === 1) {
    if (APP_TOP_LEVEL.has(segments[0])) return null;
    return `no app/${segments[0]}/page.tsx and no matching redirect`;
  }
  // Multi-segment dynamic patterns.
  const [head, ...rest] = segments;
  switch (head) {
    case "tool": {
      if (rest.length === 1 && TOOL_IDS.has(rest[0])) return null;
      return `tool id "${rest.join("/")}" not in lib/tools.ts`;
    }
    case "blog": {
      if (rest.length === 1 && BLOG_SLUGS.has(rest[0])) return null;
      return `blog slug "${rest.join("/")}" not in lib/blog-posts.ts`;
    }
    case "help": {
      if (rest.length === 1 && HELP_SLUGS.has(rest[0])) return null;
      return `help slug "${rest.join("/")}" not in lib/help-topics.ts`;
    }
    case "alternatives": {
      if (rest.length === 1 && COMPETITOR_SLUGS.has(rest[0])) return null;
      return `competitor slug "${rest.join("/")}" not in lib/alternatives.ts`;
    }
    case "use-cases": {
      if (rest.length === 0) return null; // /use-cases index
      if (rest.length === 1 && USE_CASE_SLUGS.has(rest[0])) return null;
      return `use-case slug "${rest.join("/")}" not in lib/use-cases.ts`;
    }
    case "about": {
      if (rest[0] === "authors" && rest.length === 2 && AUTHOR_SLUGS.has(rest[1])) return null;
      // /about/<other> falls through to top-level check below
      break;
    }
  }
  // Fallback: walk the file system for an arbitrary deep path —
  // `app/<seg1>/<seg2>/.../page.tsx` — covers nested routes like
  // /tool/[id] which won't match top-level alone.
  let curPath = APP_ROOT;
  for (const seg of segments) {
    const direct = path.join(curPath, seg);
    if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
      curPath = direct;
      continue;
    }
    // Maybe a dynamic segment? Look for [<x>] sibling.
    const dynamics = fs
      .readdirSync(curPath, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith("["));
    if (dynamics.length > 0) {
      // Accept the first dynamic match — over-permissive, but the
      // upstream switch above already handles known dynamic
      // surfaces precisely.
      curPath = path.join(curPath, dynamics[0].name);
      continue;
    }
    return `no matching app/ route segment for "${seg}" under ${path.relative(ROOT, curPath)}`;
  }
  // Accept either page.tsx (UI route) or route.ts/route.tsx/route.js
  // (API handler — Next.js routes any of these as a Request handler).
  // This covers preload links to /api/<x> routes that serve assets.
  if (fs.existsSync(path.join(curPath, "page.tsx"))) return null;
  if (fs.existsSync(path.join(curPath, "route.ts"))) return null;
  if (fs.existsSync(path.join(curPath, "route.tsx"))) return null;
  if (fs.existsSync(path.join(curPath, "route.js"))) return null;
  return `path resolves to ${path.relative(ROOT, curPath)} but no page.tsx or route.ts`;
}

// ---------------------------------------------------------------------------
// Walk every .tsx file under app/ + components/ and pull literal hrefs.
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name.startsWith(".")
      ) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const COMP_DIR = path.join(ROOT, "components");
const tsxFiles = [
  ...walk(APP_ROOT),
  ...(fs.existsSync(COMP_DIR) ? walk(COMP_DIR) : []),
];

// Match `href="..."` or `href='...'` with literal string (not
// `href={...}`). Same regex catches both <Link> and <a>.
const HREF_RE = /\bhref=["']([^"']+)["']/g;

const dead = [];
for (const file of tsxFiles) {
  const text = fs.readFileSync(file, "utf8");
  let m;
  while ((m = HREF_RE.exec(text)) !== null) {
    const href = m[1];
    const reason = resolveHref(href);
    if (reason !== null) {
      // Compute line number.
      const before = text.slice(0, m.index);
      const lineNo = before.split("\n").length;
      dead.push({
        file: path.relative(ROOT, file),
        line: lineNo,
        href,
        reason,
      });
    }
  }
}

// Some components legitimately have href values that look local but
// resolve at runtime (e.g. dynamic data interpolated into a literal,
// although our regex only catches literal strings). Track the known
// pre-existing list and only fail on NEW dead links.
const KNOWN_DEAD_LINKS = new Set([
  // (none currently — list ready for triaged exceptions)
]);
const realDead = dead.filter((d) => !KNOWN_DEAD_LINKS.has(d.href));

assert(
  realDead.length === 0,
  `Found ${realDead.length} dead internal link(s).\n` +
    `Each one is a literal <Link/a href="..."> with a path that doesn't match a known route.\n` +
    `Fix the href OR add the slug to the relevant data file.\n\n` +
    `Locations:\n` +
    realDead
      .slice(0, 30)
      .map(
        (d) =>
          `  ${d.file}:${d.line}\n    href="${d.href}"\n    why: ${d.reason}`,
      )
      .join("\n") +
    (realDead.length > 30 ? `\n  ... and ${realDead.length - 30} more` : ""),
);

// ---------------------------------------------------------------------------
// Self-tests on resolver semantics.
// ---------------------------------------------------------------------------

assert(
  resolveHref("https://example.com") === null,
  "external https URL is skipped",
);
assert(resolveHref("mailto:foo@bar") === null, "mailto: is skipped");
assert(resolveHref("#section") === null, "hash-only href is skipped");
assert(resolveHref("/") === null, "homepage `/` resolves");
assert(
  resolveHref("/tool/merge") === null,
  "/tool/merge resolves (merge is in lib/tools.ts)",
);
assert(
  typeof resolveHref("/tool/this-tool-does-not-exist") === "string",
  "unknown tool id returns a reason string",
);
assert(resolveHref("/pricing") === null, "/pricing resolves (top-level)");
assert(resolveHref("/tools") === null, "/tools resolves (top-level)");

// ---------------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(
  `internal-links: ${passed} passed, ${failed} failed (of ${total})`,
);
if (failed > 0) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
