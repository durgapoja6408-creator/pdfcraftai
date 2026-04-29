# tests/e2e/ — Playwright end-to-end suite

**Phase 1 scaffold (2026-04-29).** Catches user-flow regressions that
static-parse + Node tests can't see — actual behavior on actual browsers
(Chromium, Firefox, WebKit) plus mobile Safari emulation.

## What this suite tests

- **Homepage smoke** — hero renders, tool grid renders, click navigates,
  no console errors
- **Merge** — upload 2 PDFs → click Apply → verify output bytes are a
  valid PDF with correct page count
- **Split** — upload 5-page PDF → click Apply → verify download fires
  with valid bytes
- **Highlight** (visual editor canary) — upload PDF → drag rect on
  canvas → apply → verify output is a valid 1-page PDF with annotation
- **PDF Fonts** (read-only inspector canary) — upload PDF → click
  Inspect → verify table renders, CSV download works with correct headers
- **AI Summarize** (with mocked AI route) — verify the AI flow renders
  a canned response without hitting real LLM APIs

Coverage: one test per shared base (PageEditorTool, PageGridTool,
PdfReadOpsTool, etc.) plus the homepage. Adding a new tool to an
existing base usually doesn't need a new spec — the base is already
exercised by an existing canary.

## First-time setup

```bash
# 1. Install browser binaries (~300MB; one-time)
npx playwright install

# Linux only: install system deps for the browsers
npx playwright install-deps

# 2. Generate fixture PDFs (idempotent; safe to re-run)
node tests/fixtures/generate.mjs
```

## Running

```bash
# Full suite, all 3 browsers + mobile Safari (~5 min)
npm run test:e2e

# Interactive UI mode — recommended for writing/debugging tests
npm run test:e2e:ui

# Single spec
npx playwright test merge

# Single browser
npx playwright test --project=chromium

# Headed (see the browser)
npx playwright test --headed --project=chromium

# Open the HTML report after a run
npx playwright show-report
```

## Debugging a failing test

1. Run with the trace flag: `npx playwright test --trace on`
2. Open the trace: `npx playwright show-trace test-results/.../trace.zip`
3. The trace viewer gives you a timeline + DOM snapshots + network log
   per action. This is dramatically faster than `console.log` debugging.

## Adding a test

1. Pick the right shared base for your tool. If your tool already has
   a canary spec, you usually don't need a new one — extend the existing.
2. Drop a new spec in `tests/e2e/` named `<feature>.spec.ts`.
3. Use the helpers in `utils.ts` — `fixturePath`, `parsePdf`,
   `captureDownload`, `mockAiRoute`, `waitForToolReady`, `uploadFixture`.
4. Add fixtures to `tests/fixtures/generate.mjs` if you need a new PDF
   shape (encrypted, scanned, large, etc.).

## Architecture notes

- **Fixtures are programmatic.** `tests/fixtures/generate.mjs` builds
  PDFs at test-setup time using pdf-lib. No binary files in git.
- **AI routes are mocked.** Tests don't call real OpenAI/Anthropic.
  Use `mockAiRoute(page, op, body)` from `utils.ts`.
- **Browsers run in parallel by project.** The 3 desktop browsers +
  mobile Safari = 4 projects. Each project runs its own browser
  context — tests are isolated.
- **The dev server is auto-booted.** `playwright.config.ts` runs
  `npm run dev` if `localhost:3000` isn't already responding.
  Reuse-existing-server is on locally for fast iteration.
- **Traces saved on retry only.** Saves disk + time on green runs.
- **`acceptDownloads: true`** is the default in Playwright; downloads
  go to a temp directory and are accessible via `download.path()`.

## What this suite does NOT test

These belong to later phases of the test pyramid:

- Pure-function pdf-lib op correctness — Phase 2 (Node tests)
- Accessibility (axe-core) — Phase 3
- Visual regression (Playwright snapshots) — Phase 4
- Bundle size budgets — Phase 5
- Synthetic monitoring of the live site — Phase 6
- Mutation testing — Phase 7

See `docs/SESSION_2026-04-29.md` for the full pyramid plan.

## Known limitations of the Phase 1 scaffold

- **AI Summarize spec auto-skips when signed-out.** Setting up a
  signed-in fixture (auth cookies, a test user) is Phase 2 work.
- **`encrypted.pdf` is a placeholder.** It's not actually encrypted —
  it just has the metadata flag. A real encrypted fixture needs qpdf
  or pikepdf, deferred to Phase 2.
- **Visual editor mouse coords are approximate.** The highlight spec
  picks rect coords inside the canvas's bounding box; if the
  thumbnail render produces unexpectedly small dimensions, the test
  may need coordinate adjustment.
- **No CI yet.** The suite runs locally only. CI integration (GitHub
  Actions, Hostinger? — TBD) is Phase 6.
