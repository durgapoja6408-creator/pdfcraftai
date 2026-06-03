#!/usr/bin/env bash
#
# scripts/setup-prod-e2e-secrets.sh
#
# 2026-05-12 — one-shot setup of GitHub Actions secrets for the
# prod-E2E suite. Run this ONCE from a maintainer machine. The
# weekly Sunday cron then automatically picks them up and starts
# running Phases 2 + 3b + 4 (full surface).
#
# Prerequisites:
#   - `gh` CLI installed + authenticated (`gh auth status` should
#     show a token with `repo` scope)
#   - You're on a machine you trust to handle the test account
#     password — secrets get pushed to the GitHub repo's secrets store
#
# What this does:
#   - Sets PROD_E2E_TEST_EMAIL + PROD_E2E_TEST_PASSWORD (Phase 2 + 3b + 4)
#   - Sets PROD_E2E_AI_BUDGET_OK=yes (Phase 3b)
#   - Sets PROD_E2E_PAYMENTS_OK=yes (Phase 4)
#
# Notes:
#   - PROD_E2E_RAZORPAY_TEST_KEY is NOT set here. Production already
#     runs `rzp_test_*` keys (verified 2026-05-12), so the live
#     checkout IS test mode. When prod swaps to `rzp_live_*` for real
#     revenue, this script needs revisiting — see
#     `docs/RAZORPAY_LIVE_SWAP.md`.
#
# Verify after running:
#   gh secret list

set -euo pipefail

REPO="${REPO:-globalonlinedeveloper/pdfcraftai}"

# Defaults match the test account documented in
# tests/e2e-prod/README.md. Override via env if rotating credentials.
EMAIL="${PROD_E2E_TEST_EMAIL:-durgapoja6408@gmail.com}"

if [ -z "${PROD_E2E_TEST_PASSWORD:-}" ]; then
  echo "ERROR: PROD_E2E_TEST_PASSWORD must be exported before running this script." >&2
  echo "  example: PROD_E2E_TEST_PASSWORD='...' bash scripts/setup-prod-e2e-secrets.sh" >&2
  exit 1
fi

echo "Setting GitHub Actions secrets for repo: $REPO"
gh secret set PROD_E2E_TEST_EMAIL --repo "$REPO" --body "$EMAIL"
gh secret set PROD_E2E_TEST_PASSWORD --repo "$REPO" --body "$PROD_E2E_TEST_PASSWORD"
gh secret set PROD_E2E_AI_BUDGET_OK --repo "$REPO" --body "yes"
gh secret set PROD_E2E_PAYMENTS_OK --repo "$REPO" --body "yes"

echo
echo "Done. Verify with:"
echo "  gh secret list --repo $REPO"
echo
echo "First weekly run will fire on the next Sunday at 06:00 UTC."
echo "To trigger a manual run NOW:"
echo "  gh workflow run prod-e2e.yml --repo $REPO -f phases=full"
