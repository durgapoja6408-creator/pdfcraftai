"use client";

// components/tools/PdfDeletePagesTool.tsx
//
// Tier 2 (2026-04-27): Delete Pages.
//
// Inverse of Extract — selected pages are REMOVED from the output.
// Selection style = destructive (red border + dimmed thumbnail) so the
// user reads the marked pages as "going away" rather than "highlighted
// for keeping."
//
// Bound: maxSelected = total - 1 so the user can't delete every page
// (which would leave an empty output PDF). The op also enforces this
// defensively.

import { PageGridTool } from "./PageGridTool";
import { ToolHowItWorks } from "./ToolHowItWorks";

export function PdfDeletePagesTool() {
  return (
    <PageGridTool
      toolId="delete-pages"
      toolGroup="Organize"
      dropPrompt="Drop a PDF to delete pages from"
      howItWorks={
        <ToolHowItWorks
          steps={[
            {
              title: "Drop in your PDF",
              body: "Up to 100 MB. PDFium renders thumbnails locally in your browser so you can see every page before deciding.",
            },
            {
              title: "Click the pages you want gone",
              body: "Marked pages get a red border + dimmed preview so it's obvious what's being removed. You can re-click to undo, and the tool prevents you from emptying the document.",
            },
            {
              title: "Save the trimmed PDF",
              body: "We rebuild the PDF with the remaining pages — original page numbers shift down, but everything else (annotations, links, forms) stays intact.",
            },
          ]}
          privacyNote="Your PDF never leaves your browser. The deletion happens client-side with pdf-lib — nothing is uploaded or persisted."
        />
      }
      helperWhenEmpty="Click thumbnails to mark pages for removal."
      helperWhenSelected={(count, total) =>
        `${count} of ${total} pages marked for removal`
      }
      selectedBadgeLabel="Remove"
      actionLabel={(count) =>
        `Remove ${count} page${count === 1 ? "" : "s"} & save`
      }
      emptyActionLabel="Pick pages to remove"
      busyLabel="Removing pages…"
      successCta="Delete from another PDF"
      successDescription={(r) =>
        `Removed ${r.selectedCount} page${r.selectedCount === 1 ? "" : "s"} — ${r.resultPageCount} page${r.resultPageCount === 1 ? "" : "s"} remaining`
      }
      selectionStyle="destructive"
      // Floor of 1; ceiling of (total - 1) so the user can't make the
      // PDF empty. The op throws on this case as a safety net too.
      maxSelected={(total) => Math.max(0, total - 1)}
      errorCode="delete_failed"
      apply={async (bytes, indices, file) => {
        const { deletePages } = await import("@/lib/pdf/ops/page-selection");
        const r = await deletePages(bytes, indices);
        const baseName = file.name.replace(/\.pdf$/i, "");
        return {
          outputBytes: r.bytes,
          outputFileName: `${baseName || "document"}-trimmed.pdf`,
          resultPageCount: r.pageCount,
          selectedCount: indices.length,
        };
      }}
    />
  );
}
