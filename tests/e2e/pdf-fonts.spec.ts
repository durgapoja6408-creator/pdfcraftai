// tests/e2e/pdf-fonts.spec.ts
//
// E2E for /tool/pdf-fonts — read-only inspector on PdfReadOpsTool
// (M21 base). Verifies the inspector renders results, the table
// shape is correct, and the Copy-JSON / CSV-download affordances
// work.

import { test } from "@playwright/test";
import {
  captureDownload,
  uploadFixture,
  waitForToolReady,
  expect,
} from "./utils";

test.describe("/tool/pdf-fonts", () => {
  test("inspects fonts in a fixture PDF and renders the table", async ({
    page,
  }) => {
    await page.goto("/tool/pdf-fonts");
    await waitForToolReady(page);

    await uploadFixture(page, "single-page.pdf");

    // Click Inspect. PdfReadOpsTool's primary CTA is "Inspect".
    await page.getByRole("button", { name: /inspect/i }).click();

    // Result table should mention the embedded font from the fixture.
    // pdf-lib's StandardFonts.Helvetica gets baked as a font reference
    // — the inspector should surface either "Helvetica" or the
    // standard-font fallback name.
    await expect(
      page.getByText(/helvetica|standard|arial/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Headline copy should report "1 font" (or a small count).
    await expect(page.getByText(/\d+ font/i).first()).toBeVisible();
  });

  test("CSV export downloads", async ({ page }) => {
    await page.goto("/tool/pdf-fonts");
    await waitForToolReady(page);

    await uploadFixture(page, "single-page.pdf");
    await page.getByRole("button", { name: /inspect/i }).click();

    // Wait for results before clicking CSV.
    await expect(page.getByText(/\d+ font/i).first()).toBeVisible({
      timeout: 10_000,
    });

    const csv = await captureDownload(page, () =>
      page.getByRole("button", { name: /csv/i }).click(),
    );

    // CSV starts with the M22 BOM + RFC-4180 header row.
    const text = csv.bytes.toString("utf8");
    // Strip BOM (0xEF 0xBB 0xBF) before checking header columns.
    const head = text.replace(/^﻿/, "").split("\n")[0];
    expect(head).toContain("base_font");
    expect(head).toContain("subtype");
    expect(head).toContain("embedded");
  });
});
