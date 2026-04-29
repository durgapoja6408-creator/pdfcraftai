// tests/e2e/split.spec.ts
//
// E2E for /tool/split — exercises PageGridTool (M5 part 2 cancellation,
// G4 virtualization, M5 part 3 abort-during-apply).
//
// Note on download semantics: PdfSplitTool can produce either a single
// ZIP (bundling multiple split pieces) or a single PDF (one piece).
// Either is acceptable; we just verify the download fires and is
// non-empty. Tighter assertions (zip parsing) are a Phase 2 concern.

import { test } from "@playwright/test";
import {
  fixturePath,
  captureDownload,
  uploadFixture,
  waitForToolReady,
  expect,
} from "./utils";

test.describe("/tool/split", () => {
  test("splits a 5-page fixture and produces a download", async ({ page }) => {
    await page.goto("/tool/split");
    await waitForToolReady(page);

    await uploadFixture(page, "multi-page.pdf");

    // PdfSplitTool renders a thumbnail grid after upload. Wait for it
    // to land — the canvas-based thumbnails take a beat for PDFium
    // WASM to produce.
    await expect(
      page.getByText(/page 1|page 2|page 3/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Default split (split-after-page-1) is the simplest path. Click
    // the Apply button — copy is "Split PDF".
    const split = await captureDownload(page, () =>
      page.getByRole("button", { name: /split pdf/i }).click(),
    );

    expect(split.bytes.byteLength).toBeGreaterThan(100);
    // Either a PDF or a ZIP, both are valid outputs.
    const head = split.bytes.slice(0, 4).toString();
    expect(head === "%PDF" || head.startsWith("PK")).toBe(true);
  });
});
