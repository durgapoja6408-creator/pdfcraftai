#!/usr/bin/env bash
# dev-bootstrap.sh — get a fresh Cowork session productive fast.
#
# WHY: the Cowork sandbox is ephemeral — its scratch (working clone,
# node_modules, /tmp, Playwright browsers) is wiped between sessions.
# The durable state is GitHub (source of truth) + the mounted folder's
# .claude/ (secrets + SSH key). This script rebuilds the sandbox working
# copy from GitHub and installs everything needed to build/test/deploy.
#
# USAGE (from a fresh session):
#   bash <mounted-folder>/scripts/dev-bootstrap.sh
#   # optional: pass a target dir as $1 (default: ~/pdfwork on /sessions)
#
# NOTE: `npm ci` can exceed the Cowork bash 45s per-call limit. If you're
# the agent driving this via the bash tool, run npm ci detached + poll
# (see CLAUDE.md §5), or run this whole script in one shell where the
# 45s cap doesn't apply.
set -uo pipefail

REPO="globalonlinedeveloper/pdfcraftai"
WORK="${1:-$HOME/pdfwork}"

# Locate the mounted project folder (where .claude/secrets.env lives).
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MNT="$(cd "$SELF_DIR/.." && pwd)"
SECRETS="$MNT/.claude/secrets.env"
[ -f "$SECRETS" ] || SECRETS="$(ls /sessions/*/mnt/*/.claude/secrets.env 2>/dev/null | head -1)"
[ -f "${SECRETS:-}" ] && source "$SECRETS" || echo "WARN: secrets.env not found — clone will be anonymous (public repo); push will need GITHUB_PAT"
PAT="${GITHUB_PAT:-}"
URL="https://github.com/${REPO}.git"
[ -n "$PAT" ] && URL="https://${PAT}@github.com/${REPO}.git"

echo "==> working clone: $WORK   repo: $REPO"
git config --global --add safe.directory "$WORK" 2>/dev/null || true
if [ -d "$WORK/.git" ]; then
  git -C "$WORK" remote set-url origin "$URL"
  git -C "$WORK" fetch -q origin main && git -C "$WORK" reset -q --hard origin/main
else
  rm -rf "$WORK"; git clone -q "$URL" "$WORK"
fi
git -C "$WORK" config user.email "noreply@anthropic.com"
git -C "$WORK" config user.name  "Claude (cowork)"
git -C "$WORK" config core.fileMode false

cd "$WORK"
echo "==> npm ci (may take a few minutes)"
npm ci --no-audit --no-fund
echo "==> prebuild assets (pdfjs worker + pdfium wasm)"
node scripts/copy-pdfjs-worker.mjs && node scripts/copy-pdfium-wasm.mjs
echo "==> generate test fixtures"
node tests/fixtures/generate.mjs
echo "==> typecheck"
node node_modules/typescript/bin/tsc --noEmit && echo "   tsc clean"

echo ""
echo "READY ✓  clone=$WORK  HEAD=$(git rev-parse --short HEAD)"
echo "Edit in the mounted folder (file tools), then 'rsync -a --exclude=.git --exclude=node_modules <mount>/ $WORK/' to build/test/push."
echo "Run tests:  node scripts/run-all-tests.mjs"
