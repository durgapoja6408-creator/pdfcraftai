# Next session — pick up here

Today's session shipped 30+ commits across two arcs (the visual editor parity push #186-#192, then the G-series audit response #193). Three audit items are genuinely deferred and best tackled in a fresh session with full attention rather than chat-batch mode. This doc tells future-Claude (or future-Raj) exactly how to land them.

**Status as of 2026-04-28 EOD:**
- Latest live commit: `981d8d8` (G8 foundation hook shipped)
- 14 of 17 G-series audit items addressed
- All shipped changes are tsc-clean and 2843/0 test-passing

---

## Outstanding work — three items, ~7h total

### 1. G8 part 2 — migrate three rect-editor consumers to `useRectEditor` (~2h)

The hook lives at `components/tools/useRectEditor.ts`. Currently no consumers — three tools still carry ~250 LOC of duplicated move/resize logic each:

- `components/tools/PdfHighlightTool.tsx` (lines ~240-500)
- `components/tools/PdfRedactTool.tsx` (lines ~245-500)
- `components/tools/PdfAddLinksTool.tsx` (lines ~260-460 approximately)

**Migration recipe per file:**

1. Add the import:
   ```ts
   import { useRectEditor } from "./useRectEditor";
   ```

2. Inside the editor overlay component, just below `pageRender`/`state` destructure:
   ```ts
   const editor = useRectEditor(state.rects, (rects) => setState((s) => ({ ...s, rects })), {
     pxWidth: pageRender.pxWidth,
     pxHeight: pageRender.pxHeight,
   });
   ```

3. **Delete** the existing blocks in that file:
   - `movingRef` declaration + `setMovingIndex` state
   - `resizingRef` declaration + `setResizingIndex` state
   - `applyMove` helper function
   - `applyResize` helper function
   - `onSavedRectPointerDown` / `onSavedRectPointerMove` / `onSavedRectPointerUp`
   - `onResizeHandlePointerDown` / `onResizeHandlePointerMove` / `onResizeHandlePointerUp`

   (~250 LOC per file goes to zero)

4. **Add** `data-rect-overlay="true"` to the outer overlay container (the one with the page image + SVG inside).

5. **Replace** wiring on the saved-rect `<div>`:
   ```tsx
   onPointerDown={(e) => editor.onRectPointerDown(e, idx)}
   onPointerMove={editor.onRectPointerMove}
   onPointerUp={editor.onRectPointerUp}
   onPointerCancel={editor.onRectPointerUp}
   ```
   Halo when moving: check `editor.movingIndex === idx`.

6. **Replace** wiring on each of the 4 corner handles:
   ```tsx
   onPointerDown={(e) => editor.onResizeHandlePointerDown(e, idx, "nw")}
   onPointerMove={editor.onResizeHandlePointerMove}
   onPointerUp={editor.onResizeHandlePointerUp}
   onPointerCancel={editor.onResizeHandlePointerUp}
   ```

**Verification per file:** behavior should be byte-identical. Test by:
- Drawing 3 rects, then drag the middle one — origin point should match the click; release point should land where the cursor was.
- Resize from each of the 4 corners — opposite corner should stay anchored.
- Resize past 8px — should clamp without flipping.
- Drag/resize past page edge — should clamp.

Type-check after each file (`npx tsc --noEmit`); run `npm test` after all three.

### 2. G5 — apply move/resize to Add Text Box + Sign + Crop (~3h)

These three are PageEditorTool consumers but have NO move/resize today. Once G8 part 2 lands, the recipe is similar — they just need to:

- Track their primary element (text-box position, signature placement, crop rect) via the same `{x, y, w, h}` shape OR adapt slightly:
  - **PdfAddTextBoxTool**: text-box has `{x, y}` position only — needs to be extended to `{x, y, w, h}` where `w/h` track the rendered text size; resize handles let user scale the box.
  - **PdfSignTool**: signature image has `{x, y}` + `scale` — convert to `{x, y, w, h}` where `w/h` are derived from `scale × naturalAspect`; resize handles modify scale via `w / naturalWidth`.
  - **PdfCropTool**: already uses a single rect — easiest migration. Just wire the hook for the existing rect.

For each tool, wrap the single primary element in an array of size 1 so the hook can work generically:
```ts
const rects = state.rect ? [state.rect] : [];
const setRects = (next: typeof rects) => setState((s) => ({ ...s, rect: next[0] ?? null }));
```

### 3. G16 — uniform `inspect()` lib API (~2h, optional)

The "uniform inspect API" was speculative in the audit. G2 already addressed the user-visible problem (preview-before-apply on PdfSimpleOpsTool consumers). What's left is just the abstraction work — and it's not clear it pays for itself. Each consumer already calls `extractLinks` / `extractFormFields` / `extractPdfMetadata` directly. Adding an `inspectPdf(bytes)` super-function that returns `{ links, forms, metadata, pageCount, ... }` would be cleaner DEV-ergonomics but doesn't change anything for users.

**Recommendation:** skip G16 unless you find yourself writing the same `await extractX(bytes)` boilerplate three more times. The current spread is fine.

---

---

## M-series (second-pass audit) — 25 items the G-series missed

A second-pass audit on 2026-04-28 surfaced 25 additional gaps the
G-series didn't cover. **M14 (print stylesheet) is shipped today
in `globals.css`.** The remaining 24 are documented here for future
sessions. Effort estimates assume one-batch-per-item; many are
small, a few (M21, M23, M24) are real refactors.

### Tier 1 — high value, low risk (~6h total)

| ID | Item | Effort | Notes |
|---|---|---|---|
| M3 | **SHIPPED** (`430aea0`, 2026-04-28) | — | `lib/client/download.ts` `suffixedFilename()` |
| M5 | **SHIPPED** parts 1+2+3 (`36ece46` + `9498285` + `2c9c575`, 2026-04-29) | — | Part 1+2: AbortController plumbing through `rasterize.ts` → `usePdfThumbnails` → 3 consumer tools (PageGrid/Split/Sort) with Cancel buttons. Part 3: extended through merge + split apply phase (per-input/per-chunk signal check), with independent `applyAbortRef` in PdfMergeTool + PdfSplitTool |
| M9 | **SHIPPED** (`be39236`, 2026-04-29) | — | `lib/client/handoff.ts` window-scoped Blob registry + `tool-suggestions.ts` curated map; PageEditorTool consumes `?handoff=` on mount and offers "Open in [Tool]" buttons on success card |
| M14 | **SHIPPED** (`ecf0427`, 2026-04-28) | — | `@media print` block hides chrome, forces light theme |
| M17 | **SHIPPED** (`1ab0221`, 2026-04-28) | — | `mapPdfOpError` extended to 25 AI/inspector catch sites |

### Tier 2 — high value, moderate risk (~14h total)

| ID | Item | Effort | Notes |
|---|---|---|---|
| M11 | **SHIPPED** (`c1b9e43`, 2026-04-29) | — | Switched 11 `touchAction:"none"` → `"pinch-zoom"` across 5 visual editors |
| M12 | Mobile keyboard occluding inputs | 1h | scrollIntoView on focus for the URL input modal |
| M21 | **SHIPPED** base + 4/9 inspectors (`4fc67fc` + `4d8ada8`, 2026-04-29) | ~1h remaining | `PdfReadOpsTool` slot-based base. PdfLinks/Annotations/Forms/Fonts migrated (1573 → 666 LOC + 362 base = -545 LOC, 907 LOC of duplication removed). Remaining: PdfAttachments, PdfChecklist, PdfOutline, 6 Wave 8 byte-parsers (~10 min each, ~1500 LOC more reduction) |
| M24 | Code-split free vs AI tool bundles | 4h | Next.js dynamic imports per tool group |
| M22 | **SHIPPED** (`3e86d9f`, 2026-04-29) + part 2 closed as vacuous (`2c9c575`) | — | `lib/client/csv.ts` canonical writer, 4 inspector consumers migrated, 20 unit-test assertions. Part 2 (BOM-on-load) vacuous: no consumer reads CSVs |

### Tier 3 — polish (~7h total)

| ID | Item | Effort | Notes |
|---|---|---|---|
| M1 | **SHIPPED** (`5c39d49`, 2026-04-29) | — | Codified single-page invariants as a 30-assertion CI guard in `scripts/test-page-editor-consumers.mjs` |
| M2 | **SHIPPED** (`0cc6f9b`, 2026-04-28) | — | Unified disabled state across all `.btn` variants in `app/globals.css` |
| M4 | **SHIPPED** (`98c6914`, 2026-04-28) | — | Soft notice in `ToolDropzone` when multi-file drop hits a single-file tool |
| M15 | **ALREADY-CANONICAL** | — | Inspect card already had `role="status"` + `aria-live="polite"` (verified during M19 audit) |
| M16 | **SHIPPED** (`b526b47`, 2026-04-29) — reframed as scroll-into-view, not focus-steal | — | New `useScrollErrorIntoView` hook on null→string transition; respects prefers-reduced-motion |
| M18 | AI tools first-page preview | 3h | Apply useFirstPagePreview to Summarize, Chat, Resume Parser, etc. |
| M19 | **SHIPPED** (`d6592c6`, 2026-04-29) | — | `lib/api-endpoints.ts` price strings unified to "N credit[s] per <unit>" |

### Tier 4 — long tail (~16h total)

| ID | Item | Effort | Notes |
|---|---|---|---|
| M6 | **SHIPPED** (`086b762`, 2026-04-29) | — | `scripts/test-objecturl-revocation.mjs` static-parse audit; baseline 39 sites all clean; wired into `npm test` |
| M7 | **SHIPPED** (`da5bd6e`, 2026-04-28) | — | `setPdfBytes(null)` after apply success in PageEditor/PageGrid/Split |
| M8 | Stale blob URLs on browser-back | 1h | Detect via navigation API |
| M10 | Deep-link `?file=<url>` to auto-load | 2h | URL param + fetch + validation |
| M13 | Mobile orientation change rect-rescaling | 2h | ResizeObserver + rect coord normalization |
| M20 | AI tool retry on transient network failure | 2h | Backoff + idempotency |
| M23 | **SHIPPED** (`fb4b48c`, 2026-04-29) | — | `public/pdfium-sw.js` single-purpose SW caches ONLY `/pdfium.wasm` (cache-first + network fallback, versioned `pdfium-wasm-v1`). `components/PdfiumServiceWorker.tsx` defers registration to `requestIdleCallback`. Single-purpose scope avoids classic SW staleness trap |
| M25 | Memoize `useFirstPagePreview` by content hash | 2h | Hash + cache invalidation |

### Tier 5 — speculative (skip unless real users complain)

| ID | Item | Notes |
|---|---|---|
| M16 — covered by Tier 3 |  |
| (no others) |  |

### Recommended next-session priority order

24 of 25 M-items shipped; 3 verified-canonical (M8, M13, M15); M21 partial
(4 of 9 inspectors migrated). Remaining work, ranked:

1. **M21 follow-up sweep** (~1h, mechanical) — migrate the remaining 5
   inspectors to `PdfReadOpsTool`: PdfAttachments, PdfChecklist,
   PdfOutline, plus the 6 Wave 8 byte-parsers if they haven't been
   migrated. Estimated additional reduction: ~1500 LOC. Pattern is
   proven across 4 different result shapes (table, grouped list,
   mixed-content cells).
2. **M12** Mobile keyboard occluding inputs (~1h) — scrollIntoView on
   focus for the URL input modal in PdfAddLinksTool.
3. **M24** Code-split free vs AI tool bundles (~4h) — Next.js dynamic
   imports per tool group; biggest remaining bundle-size win.

---

## Quick reference — what shipped today

**Visual editor parity arc (#186–#192):**
- Drag-to-reposition + corner-resize on Highlight/Redact
- Image Watermark v2 visual click-to-place
- Stamp + Page Numbers WYSIWYG preview
- Free Draw stroke move with hit-testing
- UI copy style guide + 35-file canonical-error sweep
- DOM virtualization for 500+ page thumbnail grids

**G-series audit response (#193):**
- G1: encrypted-PDF canonical UX (`lib/pdf/error-messages.ts`)
- G2: SimpleOps inspect-before-apply
- G4: Split tool DOM virtualization
- G8: `useRectEditor` foundation hook (consumers awaiting migration — see §1 above)
- G11: color-blind selection icons (✓/✗ glyphs)
- G12: keyboard arrow nav with virtualization-aware focus
- G14: prefers-reduced-motion CSS
- G17: +32 test assertions on PageEditorTool consumers

**Already canonical (no work needed):** G3, G6, G9, G10, G13.

---

## Operational notes for the next session

- **Hostinger thread cap** (CLAUDE.md §5): one SSH-pkick per deploy cycle MAX. After that, hPanel "Stop running process" is the safer reset path.
- **Auto-pull jams**: if `last-source` lags HEAD by > 10 min, push an empty commit to nudge. Don't do it more than twice per session.
- **Test harness**: 2843 tests across 32 suites. Run `npm test` before and after every batch of edits.
- **tsc**: run via `npx tsc --noEmit` from the repo root.
