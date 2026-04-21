#!/usr/bin/env node
/**
 * test-dev-hooks.mjs — pins the invariants of the tracked .githooks/
 * pre-push hook and the DEV_SETUP.md install instructions so a future
 * refactor can't silently break the hook's contract.
 *
 * Why pin this?
 *   The pre-push hook catches test regressions BEFORE they hit GitHub
 *   Actions CI. If its contract drifts — hook renamed, `npm test`
 *   invocation broken, executable bit stripped, install instructions
 *   miswritten — the local gate silently disappears and everyone
 *   discovers the regression only after it lands on main and triggers
 *   an auto-deploy to Hostinger. Pinning the invariants here means
 *   `npm test` itself fails loudly the moment the hook's guarantees
 *   stop holding.
 *
 * What's pinned:
 *   1. `.githooks/pre-push` exists and is executable.
 *   2. The hook's she-bang line names a POSIX-shell interpreter so it
 *      actually runs on macOS + Linux (the two operating systems this
 *      repo's contributors are known to use).
 *   3. The hook invokes `npm test` — the canonical test entrypoint.
 *      If somebody rewires the hook to call a specific harness, the
 *      gate becomes incomplete (a new harness added later wouldn't be
 *      covered) and we want a failure here to flag the drift.
 *   4. The hook documents at least ONE bypass path (either
 *      `--no-verify` or the GIT_PRE_PUSH_SKIP_TESTS env var) — silent
 *      hooks get blamed for "git hanging" and contributors reach for
 *      `rm .git/hooks/pre-push` instead of the documented escape.
 *   5. `.githooks/README.md` exists and references the one-command
 *      install (`git config core.hooksPath .githooks`).
 *   6. `docs/DEV_SETUP.md` exists, references the one-command install,
 *      and documents how to bypass the hook — the two things a new
 *      contributor needs within 30 seconds of their first push failing.
 *
 * Assertions: 8.
 */

import { readFileSync, statSync, accessSync, constants as fsConstants } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

let pass = 0;
let fail = 0;

function assert(label, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  \u2022 ${label} ... PASS`);
  } else {
    fail++;
    console.log(`  \u2022 ${label} ... FAIL \u2014 ${detail ?? ""}`);
  }
}

console.log("== dev-hooks tests ==");

const hookPath = resolve(repoRoot, ".githooks/pre-push");
const hookReadmePath = resolve(repoRoot, ".githooks/README.md");
const devSetupPath = resolve(repoRoot, "docs/DEV_SETUP.md");

// 1. Hook exists
let hookStat = null;
try {
  hookStat = statSync(hookPath);
  assert(".githooks/pre-push exists", true);
} catch (err) {
  assert(".githooks/pre-push exists", false, err.message);
}

// 2. Hook is executable (at least user-executable — Windows users who
//    do `chmod +x` via git might have different perm bits, but every
//    POSIX system stores the x-bit in the same place)
if (hookStat) {
  const userExec = Boolean(hookStat.mode & 0o100);
  assert(
    ".githooks/pre-push is executable (user x-bit)",
    userExec,
    `mode=${(hookStat.mode & 0o777).toString(8)}`,
  );
} else {
  assert(".githooks/pre-push is executable (user x-bit)", false, "hook missing");
}

const hookContent = hookStat ? readFileSync(hookPath, "utf8") : "";

// 3. Hook uses a POSIX-shell interpreter (bash or sh)
{
  const firstLine = hookContent.split("\n")[0] ?? "";
  const okShell = /^#!\/(usr\/)?(bin\/)?(env\s+)?(bash|sh)\b/.test(firstLine);
  assert(
    ".githooks/pre-push shebang names bash or sh",
    okShell,
    `first line: ${JSON.stringify(firstLine)}`,
  );
}

// 4. Hook invokes `npm test`
{
  const callsNpmTest = /\bnpm\s+test\b/.test(hookContent);
  assert(
    ".githooks/pre-push invokes 'npm test'",
    callsNpmTest,
    "expected /\\bnpm\\s+test\\b/ in hook body",
  );
}

// 5. Hook documents at least one bypass (--no-verify or the env var)
{
  const mentionsNoVerify = /--no-verify/.test(hookContent);
  const mentionsEnvVar = /GIT_PRE_PUSH_SKIP_TESTS/.test(hookContent);
  assert(
    ".githooks/pre-push documents --no-verify or GIT_PRE_PUSH_SKIP_TESTS bypass",
    mentionsNoVerify || mentionsEnvVar,
    "expected at least one documented bypass path",
  );
}

// 6. .githooks/README.md exists and references the install command
{
  try {
    const readme = readFileSync(hookReadmePath, "utf8");
    const hasInstall = /core\.hooksPath\s+\.githooks/.test(readme);
    assert(
      ".githooks/README.md references 'git config core.hooksPath .githooks'",
      hasInstall,
      "expected the one-command install in the readme",
    );
  } catch (err) {
    assert(".githooks/README.md references 'git config core.hooksPath .githooks'", false, err.message);
  }
}

// 7. docs/DEV_SETUP.md exists and references install command
// 8. ...and documents the bypass
{
  let devSetup = "";
  try {
    devSetup = readFileSync(devSetupPath, "utf8");
    const hasInstall = /core\.hooksPath\s+\.githooks/.test(devSetup);
    assert(
      "docs/DEV_SETUP.md references 'git config core.hooksPath .githooks'",
      hasInstall,
      "expected the one-command install in DEV_SETUP.md",
    );
    const hasBypass = /--no-verify/.test(devSetup) || /GIT_PRE_PUSH_SKIP_TESTS/.test(devSetup);
    assert(
      "docs/DEV_SETUP.md documents the hook bypass",
      hasBypass,
      "expected --no-verify or GIT_PRE_PUSH_SKIP_TESTS mention",
    );
  } catch (err) {
    assert(
      "docs/DEV_SETUP.md references 'git config core.hooksPath .githooks'",
      false,
      err.message,
    );
    assert("docs/DEV_SETUP.md documents the hook bypass", false, "DEV_SETUP.md missing");
  }
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
