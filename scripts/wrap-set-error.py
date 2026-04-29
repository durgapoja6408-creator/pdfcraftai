#!/usr/bin/env python3
"""
M17 (#193, 2026-04-28): wrap raw setError(...) catch sites with
mapPdfOpError() across the 27 tools that don't go through one of
the shared bases (PageEditorTool / PageGridTool / PdfSimpleOpsTool /
PdfSplitTool — those already have it).

Two patterns handled:
  1. setError(err instanceof Error ? err.message : "X")
     → setError(mapPdfOpError(err instanceof Error ? err.message : "X"))
  2. setError(msg)
     → setError(mapPdfOpError(msg))

Adds `import { mapPdfOpError } from "@/lib/pdf/error-messages";`
after the last existing import line if not already present.

Idempotent: running twice is a no-op (skips already-wrapped sites).
"""

import os
import re
import sys

FILES = [
    "components/tools/BloodTestTool.tsx",
    "components/tools/ExtractImagesTool.tsx",
    "components/tools/MindmapPdfTool.tsx",
    "components/tools/OcrPdfTool.tsx",
    "components/tools/PageCountTool.tsx",
    "components/tools/PdfAnnotationsTool.tsx",
    "components/tools/PdfChecklistTool.tsx",
    "components/tools/PdfFontsTool.tsx",
    "components/tools/PdfFormsTool.tsx",
    "components/tools/PdfInspectorTool.tsx",
    "components/tools/PdfLinksTool.tsx",
    "components/tools/PdfMergeTool.tsx",
    "components/tools/PdfNUpTool.tsx",
    "components/tools/PdfOutlineTool.tsx",
    "components/tools/PdfRasterizeTool.tsx",
    "components/tools/PdfResizeTool.tsx",
    "components/tools/PdfRotateTool.tsx",
    "components/tools/PdfSortPagesTool.tsx",
    "components/tools/PdfTextExportTool.tsx",
    "components/tools/PdfUnlockTool.tsx",
    "components/tools/ResumeParserTool.tsx",
    "components/tools/SearchPdfTool.tsx",
    "components/tools/SearchablePdfTool.tsx",
    "components/tools/SemanticSearchPdfTool.tsx",
    "components/tools/StructuredVariantTool.tsx",
    "components/tools/SummarizeVariantTool.tsx",
    "components/tools/TldrPdfTool.tsx",
]

IMPORT_LINE = 'import { mapPdfOpError } from "@/lib/pdf/error-messages";\n'

# Match `setError(EXPR)` where EXPR is either:
#   `err instanceof Error ? err.message : "..."`  (any quotes inside the
#   string, no parens — assumes the string literal doesn't contain ')')
#   `msg`
#
# Skip if EXPR is already wrapped in mapPdfOpError(...).
WRAP_RE = re.compile(
    r'setError\(((?!mapPdfOpError)(?:err instanceof Error \? err\.message : "[^"]*"|msg))\)'
)


def wrap_set_error(src: str) -> tuple[str, int]:
    """Return (new_src, n_replacements)."""
    return WRAP_RE.subn(r"setError(mapPdfOpError(\1))", src)


def add_import(src: str) -> tuple[str, bool]:
    """Add the mapPdfOpError import after the last existing import.
    Returns (new_src, added_bool)."""
    if "mapPdfOpError" in src and "from \"@/lib/pdf/error-messages\"" in src:
        return src, False
    lines = src.split("\n")
    last_import_idx = -1
    for i, line in enumerate(lines):
        if line.startswith("import "):
            last_import_idx = i
    if last_import_idx == -1:
        # No imports at all — shouldn't happen for these files.
        return src, False
    lines.insert(last_import_idx + 1, IMPORT_LINE.rstrip("\n"))
    return "\n".join(lines), True


def main() -> int:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    files_changed = 0
    total_wraps = 0
    for rel in FILES:
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            print(f"SKIP missing: {rel}")
            continue
        with open(path, "r", encoding="utf-8") as f:
            original = f.read()
        wrapped, n = wrap_set_error(original)
        if n == 0:
            # Already wrapped (or no matching catch sites). Skip without
            # adding the import — no need to import unused.
            continue
        with_import, added = add_import(wrapped)
        if with_import == original:
            continue
        with open(path, "w", encoding="utf-8") as f:
            f.write(with_import)
        files_changed += 1
        total_wraps += n
        print(f"  wrapped {n} sites in {rel}{' + import' if added else ''}")
    print(f"\nDone: {files_changed} files changed, {total_wraps} total wraps")
    return 0


if __name__ == "__main__":
    sys.exit(main())
