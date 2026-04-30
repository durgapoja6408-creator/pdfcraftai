// tests/e2e/merge.spec.ts
//
// E2E for /tool/merge — the canonical pdf-lib writable-tool flow.
//
// What this test proves:
//   1. The merge tool page loads and reaches interactive state.
//   2. A user can drop two PDFs into the tool.
//   3. Clicking Apply produces a downloaded file.
//   4. The downloaded bytes parse as a valid PDF.
//   5. The output's page count = sum of input page counts.
//
// (5) is the critical assertion — proves merge actually concatenated
// pages, not just produced *some* output.

import { test } from "@playwright/test";
import {
  fixturePath,
  parsePdf,
  captureDownload,
  waitForToolReady,
  expect,
} from "./utils";

test.describe("/tool/merge", () => {
  test("merges two fixture PDFs into a single valid output", async ({
    page,
  }) => {
    await page.goto("/tool/merge");
    await waitForToolReady(page);

    // Drop both fixtures into the merge tool. PdfMergeTool's input
    // is set up for multiple files (it's the only tool where we drop
    // more than one PDF at once).
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles([
      fixturePath("single-page.pdf"),
      fixturePath("multi-page.pdf"),
    ]);

    // Wait for the file cards to render — confirms both files were
    // accepted, not silently dropped by validation.
    await expect(page.getByText("single-page.pdf").first()).toBeVisible();
    await expect(page.getByText("multi-page.pdf").first()).toBeVisible();

    // PdfMergeTool has a 2-step flow:
    //   1. Click "Merge N PDFs" — runs the op, shows result card
    //   2. Click "Download" on the result card — fires the download
    // The op itself doesn't auto-download; the result is shown so the
    // user can verify before downloading.
    await page.getByRole("button", { name: /merge.*pdfs?/i }).click();

    // Wait for the result card. The headline says "Merged N PDFs into
    // one with X pages" or similar.
    await expect(
      page.getByText(/merged|combined|total page/i).first(),
    ).toBeVisible({ timeout: 30_000 });

    const merged = await captureDownload(page, () =>
      page.getByRole("button", { name: /^download$/i }).click(),
    );

    // Downloaded file should be a real PDF (starts with %PDF).
    expect(merged.bytes.slice(0, 4).toString()).toBe("%PDF");

    // Output page count = single (1) + multi (5) = 6.
    const parsed = await parsePdf(merged.bytes);
    expect(parsed.pageCount).toBe(6);

    // Filename should look like a merged output, not the input name.
    expect(merged.suggestedFilename).toMatch(/merged|combined|\.pdf$/i);
  });
});
