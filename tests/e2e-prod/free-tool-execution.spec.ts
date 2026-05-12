// tests/e2e-prod/free-tool-execution.spec.ts
//
// 2026-05-12 — Phase 3 (free-tool subset): verify free PDF tools
// accept a real PDF upload without errors against production.
//
// Why this scope (vs full "drop → run → verify output"):
//   Each free tool has DIFFERENT post-upload UI — Merge shows a
//   queue, Split shows a range input, PDF Inspector shows a
//   read-only stat panel, Compress runs server-side, Page Numbers
//   has a config panel before the run button. Asserting on
//   per-tool success-state UI would either be brittle (specific
//   button labels change) or require per-tool maintenance every
//   time a tool gets a UI refresh.
//
//   So Phase 3a tests the FLOOR: the page mounts, the file input
//   accepts a real PDF, and the dropzone transitions out of the
//   empty state. That catches the high-value regressions
//   (toolrunner mount fail, file rejection bug, dropzone broken)
//   without coupling to button-label churn.
//
//   Phase 3b (separate spec — ai-tool-execution.spec.ts) tests
//   the full happy-path because AI tools have a uniform UI (drop,
//   click run, wait for text output).
//
// Safety: all tested tools run CLIENT-SIDE. No bandwidth cost,
// no orphan files on prod, no DB writes.

import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

const SAMPLE_PDF = resolve(process.cwd(), "public", "sample.pdf");

// Tools that take a single PDF input. These are all PDFium- or
// pdf-lib-backed client-side tools.
const SINGLE_INPUT_TOOLS = [
  "page-count",
  "pdf-inspector",
  "pdf-to-text",
  "pdf-to-jpg",
  "pdf-to-png",
  "pdf-to-markdown",
  "split",
  "page-numbers",
  "remove-metadata",
  "pdf-search",
  "extract-images",
  "rotate",
];

// Tools that accept multiple PDFs (merge-family).
const MULTI_INPUT_TOOLS = ["merge"];

async function fileAcceptedSignals(page: import("@playwright/test").Page) {
  // After a successful upload, ANY of these signals indicates the
  // dropzone exited the empty state + the tool received the file.
  // Race them in parallel — first to resolve wins.
  return Promise.race([
    page
      .getByRole("button", { name: /download/i })
      .first()
      .waitFor({ state: "visible", timeout: 25_000 })
      .then(() => "download")
      .catch(() => null),
    // Tool-specific result text (page count, word count, "Output:")
    page
      .locator("text=/\\b\\d+\\s*pages?\\b/i")
      .first()
      .waitFor({ state: "visible", timeout: 25_000 })
      .then(() => "page-count-shown")
      .catch(() => null),
    // Filename appears in queue/file-card UI
    page
      .locator("text=/sample\\.pdf/i")
      .first()
      .waitFor({ state: "visible", timeout: 25_000 })
      .then(() => "filename-shown")
      .catch(() => null),
    // Configure-and-run UI mounted — broad label net
    page
      .getByRole("button", {
        name: /^(run|apply|convert|extract|split|rotate|compress|generate|process|build|merge|stamp|add)/i,
      })
      .first()
      .waitFor({ state: "visible", timeout: 25_000 })
      .then(() => "run-button")
      .catch(() => null),
  ]);
}

test.describe("free tool execution — accepts PDF upload", () => {
  for (const id of SINGLE_INPUT_TOOLS) {
    test(`${id}: page mounts + accepts sample.pdf`, async ({ page }) => {
      const resp = await page.goto(`/tool/${id}`);
      // Tool pages return 200; some 308-redirect to SEO landings,
      // both are fine for the page-mount check.
      expect(resp?.status() ?? 0).toBeLessThan(400);

      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.waitFor({ state: "attached", timeout: 15_000 });
      await fileInput.setInputFiles(SAMPLE_PDF);

      const signal = await fileAcceptedSignals(page);
      expect(signal).not.toBeNull();
    });
  }

  for (const id of MULTI_INPUT_TOOLS) {
    test(`${id}: page mounts + accepts two sample PDFs`, async ({ page }) => {
      const resp = await page.goto(`/tool/${id}`);
      expect(resp?.status() ?? 0).toBeLessThan(400);

      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.waitFor({ state: "attached", timeout: 15_000 });
      await fileInput.setInputFiles([SAMPLE_PDF, SAMPLE_PDF]);

      const signal = await fileAcceptedSignals(page);
      expect(signal).not.toBeNull();
    });
  }
});
