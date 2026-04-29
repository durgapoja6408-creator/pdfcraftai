// tests/e2e/utils.ts
//
// Shared helpers for the Phase 1 Playwright suite (2026-04-29).
//
// These wrap the patterns every spec uses. Keeping them here means
// each test file can stay focused on the actual user flow without
// re-implementing fixture loading, AI mocking, or download capture.

import { expect, type Page, type Download } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";

const FIXTURES_DIR = resolve(process.cwd(), "tests/fixtures");

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to a fixture PDF. Throws a clear error
 * (with regenerate instruction) if the file is missing — common case
 * when someone clones the repo and forgets `node tests/fixtures/generate.mjs`.
 */
export function fixturePath(name: string): string {
  const path = resolve(FIXTURES_DIR, name);
  if (!existsSync(path)) {
    throw new Error(
      `Fixture not found: ${path}\n\n` +
        `Generate fixtures first:\n` +
        `  node tests/fixtures/generate.mjs\n`,
    );
  }
  return path;
}

// ---------------------------------------------------------------------------
// PDF parsing — for asserting tool output is structurally valid
// ---------------------------------------------------------------------------

/**
 * Parses PDF bytes back through pdf-lib and returns structural facts
 * (page count, title, dimensions). Used to assert tool outputs are
 * (a) actually valid PDFs (not corrupt bytes) and (b) have the
 * expected shape.
 */
export async function parsePdf(bytes: Uint8Array | Buffer) {
  const buf = bytes instanceof Buffer ? new Uint8Array(bytes) : bytes;
  const pdf = await PDFDocument.load(buf, {
    ignoreEncryption: true,
  });
  const pages = pdf.getPages();
  return {
    pageCount: pdf.getPageCount(),
    title: pdf.getTitle() ?? null,
    firstPageSize: pages[0]
      ? { width: pages[0].getWidth(), height: pages[0].getHeight() }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Download capture — every writable tool ends with a download. This
// wraps the click + waitForEvent pattern so specs read naturally.
// ---------------------------------------------------------------------------

/**
 * Performs an action that triggers a download, waits for the download
 * to complete, and returns its bytes. Throws (with a useful message)
 * if no download fires within the action timeout.
 */
export async function captureDownload(
  page: Page,
  action: () => Promise<unknown>,
): Promise<{ download: Download; bytes: Buffer; suggestedFilename: string }> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    action(),
  ]);
  const path = await download.path();
  if (!path) {
    throw new Error(
      "Download had no path — check Playwright config has " +
        "`acceptDownloads: true` (default is true).",
    );
  }
  const bytes = readFileSync(path);
  return {
    download,
    bytes,
    suggestedFilename: download.suggestedFilename(),
  };
}

// ---------------------------------------------------------------------------
// AI route mocking — keeps tests hermetic (no real OpenAI/Anthropic)
// ---------------------------------------------------------------------------

/**
 * Registers a route handler that intercepts /api/ai/{op} calls and
 * returns a canned 200 JSON response. Useful for tests that need to
 * verify "the AI tool renders the response correctly" without paying
 * for real AI calls or being subject to rate limits.
 *
 * Call BEFORE navigating to the page (Playwright route handlers must
 * be registered before the request fires).
 *
 * Example:
 *   await mockAiRoute(page, "summarize", {
 *     summary: "This is a test summary.",
 *     bulletPoints: ["First point", "Second point"],
 *   });
 *   await page.goto("/tool/ai-summarize");
 */
export async function mockAiRoute(
  page: Page,
  op: string,
  body: unknown,
  status = 200,
): Promise<void> {
  await page.route(`**/api/ai/${op}*`, async (route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

// ---------------------------------------------------------------------------
// Wait helpers — PDFium WASM load + thumbnail rendering are async, so
// tests must wait for the canvas to be ready before interacting.
// ---------------------------------------------------------------------------

/**
 * Waits for the tool's main file dropzone to appear. This is the
 * universal "tool page is interactive" signal — every tool runner
 * mounts <ToolDropzone /> as the first interactive element.
 */
export async function waitForToolReady(page: Page): Promise<void> {
  // ToolDropzone renders text like "Drop a PDF" — match generously.
  await expect(page.getByText(/drop.*pdf|drag.*pdf/i).first()).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Uploads a fixture PDF to the tool's file input. Handles both visible
 * file inputs and ToolDropzone's hidden-by-default <input type="file">.
 */
export async function uploadFixture(
  page: Page,
  fixtureName: string,
): Promise<void> {
  const path = fixturePath(fixtureName);
  // ToolDropzone uses a hidden file input that's bound to the click
  // handler. setInputFiles() works regardless of CSS visibility, but
  // we need to find the right input — use the first input[type="file"]
  // on the page, which is reliably the dropzone's.
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(path);
}

// ---------------------------------------------------------------------------
// Sanity asserts — re-export for spec readability
// ---------------------------------------------------------------------------

export { expect };
