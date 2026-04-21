# .githooks/

Tracked git hooks for this repo. Activate with one command per clone:

```bash
git config core.hooksPath .githooks
```

After that, git runs hooks out of this directory instead of the default
(untracked) `.git/hooks/` directory — so every contributor who runs the
config command picks up the same hooks, and any future hook addition
automatically activates for everyone.

See `docs/DEV_SETUP.md` for the full rationale, bypass flags, and
troubleshooting.

## Hooks in this directory

- `pre-push` — runs `npm test` (the offline 382-assertion gate, ~0.8s)
  before any push. Catches regressions locally, before the push even
  hits GitHub Actions CI. Bypass with `git push --no-verify` or
  `GIT_PRE_PUSH_SKIP_TESTS=1 git push` when shipping a test-expectation
  diff atomically or pushing a docs-only branch.
