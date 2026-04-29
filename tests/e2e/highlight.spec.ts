// tests/e2e/highlight.spec.ts
//
// E2E for /tool/highlight-pdf — the canonical visual editor flow on
// PageEditorTool. Exercises drag-rectangle creation, save-then-apply,
// and pdf-lib annotation injection.
//
// This test is explicitly the canary for visual-editor regressions —
// if drag-to-create breaks (#164, #186, #187), this is what catches it.

import { test } from "@playwright/test";
import {
  captureDownload,
  parsePdf,
  uploadFixture,
  waitForToolReady,
  expect,
} from "./utils";

test.describe("/tool/highlight-pdf", () => {
  test("draws a highlight rect and applies it to the output PDF", async ({
    page,
  }) => {
    await page.goto("/tool/highlight-pdf");
    await waitForToolReady(page);

    await uploadFixture(page, "single-page.pdf");

    // PageEditorTool renders a canvas overlay on the page-1 thumbnail.
    // Wait for the canvas to be present — PDFium WASM cold-load can
    // take a beat on a fresh tab.
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // Drag a rectangle in the canvas. Coords are CSS pixels relative
    // to the canvas top-left. We pick a small rect well inside the
    // page so we don't have to worry about exact thumbnail dimensions.
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas had no bounding box");
    const x1 = box.x + 60;
    const y1 = box.y + 80;
    const x2 = box.x + 200;
    const y2 = box.y + 140;

    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 8 });
    await page.mouse.up();

    // PdfHighlightTool shows a per-rect chip with delete affordance
    // (#174) once a rect is committed. That's our "rect was created"
    // signal. The label includes "highlight" or a count — match
    // generously.
    await expect(
      page.getByText(/1 highlight|1 rect|saved/i).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Apply. Copy is "Apply highlights" or similar.
    const out = await captureDownload(page, () =>
      page
        .getByRole("button", { name: /apply|highlight/i })
        .last()
        .click(),
    );

    expect(out.bytes.slice(0, 4).toString()).toBe("%PDF");
    // Output should still have 1 page (highlight doesn't add pages).
    const parsed = await parsePdf(out.bytes);
    expect(parsed.pageCount).toBe(1);
  });
});
