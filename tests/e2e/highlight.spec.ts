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

    // Dismiss the cookie banner if it's covering the editor surface.
    // A bottom-positioned banner can intercept pointerdown events on
    // the lower half of the page and silently swallow drags. Picking
    // "Essential only" leaves the page in a no-3rd-party state, which
    // is what the tests want anyway (no GA4/Clarity beacons firing).
    const essentialBtn = page.getByRole("button", { name: /^essential only$/i });
    if (await essentialBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await essentialBtn.click();
    }

    await uploadFixture(page, "single-page.pdf");

    // PageEditorTool renders an <img alt="Page 1 preview"> wrapped in
    // a div with pointer-event handlers — the parent div is the actual
    // draw surface (the img has pointerEvents: "none"). We wait for
    // the img (proves PDFium has decoded the first page) then use the
    // wrapper div for the drag. PDFium WASM cold-load + first-render
    // can take 5+ sec on a fresh tab, longer on slow networks.
    const preview = page.getByRole("img", { name: /page 1 preview/i });
    await expect(preview).toBeVisible({ timeout: 30_000 });
    // The draw surface is the img's parent (it carries the
    // onPointerDown/Move/Up handlers — see PdfHighlightTool.tsx ~510).
    const drawSurface = preview.locator("..");
    // Scroll the draw surface into view — on prod against a fresh tab,
    // the editor renders well below the fold (file card + color picker
    // + opacity slider + helper text push it down ~700px). Playwright
    // mouse events fire at viewport-relative coords, so a drag at
    // y > viewport.height silently does nothing. scrollIntoView lifts
    // the surface to the top of the viewport before we measure.
    await drawSurface.scrollIntoViewIfNeeded();
    // Give the editor a beat to wire up the pointer handlers and
    // settle the layout before we try to draw on top of it.
    await page.waitForTimeout(1500);

    // Drag a rectangle on the draw surface. Coords are CSS pixels
    // relative to the surface top-left. We pick a generous rect well
    // inside the page so we don't have to worry about exact thumbnail
    // dimensions or hit a too-small-to-commit threshold (rects
    // smaller than 8×8 px are filtered as stray clicks — see
    // PdfHighlightTool.tsx isMovable gate).
    //
    // Constrain to the visible viewport — the surface is ~1000px tall
    // on a 720px-viewport; if we try to drag beyond the fold,
    // pointermove events stop firing (mouse leaves viewport).
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    const box = await drawSurface.boundingBox();
    if (!box) throw new Error("draw surface had no bounding box");
    const surfaceBottom = Math.min(box.y + box.height, viewport.height - 20);
    const visibleH = surfaceBottom - box.y;
    const x1 = box.x + box.width * 0.25;
    const y1 = box.y + visibleH * 0.2;
    const x2 = box.x + box.width * 0.55;
    const y2 = box.y + visibleH * 0.6;

    // Hover first so the pointer is inside the draw surface (without
    // this, mouse.move can race with React event registration on a
    // freshly-mounted overlay).
    await drawSurface.hover({ position: { x: x1 - box.x, y: y1 - box.y } });
    await page.mouse.down();
    // Multi-step move to give React time to fire pointermove handlers
    // and grow the rect — a single jump might commit a 0×0 rect that
    // gets filtered by the >= 8px gate.
    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.mouse.move(
        x1 + (x2 - x1) * t,
        y1 + (y2 - y1) * t,
      );
    }
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
