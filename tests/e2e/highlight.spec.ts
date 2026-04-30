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
    // Wait for both the canvas AND the page-1 thumbnail itself to
    // settle. PDFium WASM cold-load + first-render can take 5+ sec
    // on a fresh tab, longer on slow networks against prod.
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    // Give the canvas a beat to actually render the thumbnail before
    // we try to draw on top of it. Without this, the click + drag
    // can land before the thumbnail's drawn and the editor doesn't
    // register the rect.
    await page.waitForTimeout(1500);

    // Drag a rectangle in the canvas. Coords are CSS pixels relative
    // to the canvas top-left. We pick a generous rect well inside
    // the page so we don't have to worry about exact thumbnail
    // dimensions or hit a too-small-to-commit threshold.
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas had no bounding box");
    const x1 = box.x + box.width * 0.2;
    const y1 = box.y + box.height * 0.2;
    const x2 = box.x + box.width * 0.6;
    const y2 = box.y + box.height * 0.4;

    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 12 });
    await page.mouse.up();

    // PageEditorTool has a 2-step flow (same as PdfMergeTool/PdfSplitTool):
    //   1. Apply button — runs the op, shows result card
    //   2. Download button on the result card — fires the download
    // Apply button label is dynamic: "Apply 1 highlight",
    // "Apply N highlights", "Apply N highlights on M pages".
    const applyBtn = page.getByRole("button", { name: /^apply\s+\d+\s+highlight/i });
    await expect(applyBtn).toBeVisible({ timeout: 5_000 });
    await applyBtn.click();

    // Wait for the result card's Download button.
    const downloadBtn = page.getByRole("button", { name: /^download$/i });
    await expect(downloadBtn).toBeVisible({ timeout: 30_000 });

    const out = await captureDownload(page, () => downloadBtn.click());

    expect(out.bytes.slice(0, 4).toString()).toBe("%PDF");
    // Output should still have 1 page (highlight doesn't add pages).
    const parsed = await parsePdf(out.bytes);
    expect(parsed.pageCount).toBe(1);
  });
});
