#!/usr/bin/env python3
"""
M18 (#193, 2026-04-29): mechanical refactor that replaces the inline
<I.File size={16} /> placeholder with <UploadedFilePreview file={file}
maxHeight={80} /> in AI tool upload cards.

The pattern across AI tools is uniform:

    <span style={{ color: "var(--fg-subtle)" }}>
      <I.File size={16} />
    </span>
    <div style={{ flex: 1, overflow: "hidden" }}>
      <div title={file.name}>{file.name}</div>
      ...

The script finds that exact `<span>...<I.File size={16} /></span>`
sequence (immediately followed by the `flex: 1` file-info div) and
swaps in the preview component. Idempotent — skips files already
migrated.
"""

import re
import sys
from pathlib import Path

TOOLS = [
    "components/tools/SummarizePdfTool.tsx",  # already migrated; idempotent
    "components/tools/TranslatePdfTool.tsx",
    "components/tools/ComparePdfTool.tsx",
    "components/tools/OcrPdfTool.tsx",
    "components/tools/RewritePdfTool.tsx",
    "components/tools/RedactPdfTool.tsx",
    "components/tools/TldrPdfTool.tsx",
    "components/tools/MindmapPdfTool.tsx",
    "components/tools/SemanticSearchPdfTool.tsx",
    "components/tools/StructuredVariantTool.tsx",
    "components/tools/SummarizeVariantTool.tsx",
    "components/tools/BloodTestTool.tsx",
    "components/tools/ResumeParserTool.tsx",
    "components/tools/SearchablePdfTool.tsx",
    "components/tools/SignPdfTool.tsx",
    "components/tools/TableExtractTool.tsx",
]

# Match the placeholder span+icon. Lookahead: must be followed by a
# `<div style={{ flex: 1, overflow:` block (the file-info div) so we
# don't accidentally hit other I.File occurrences. Accepts either
# size={16} (the original Summarize-pattern) or size={18} (the
# variant pattern that ships of newer AI tools — Tldr, Mindmap,
# SemanticSearch, Structured/SummarizeVariant, BloodTest, ResumeParser,
# SearchablePdf).
PATTERN = re.compile(
    r"""<span\s+style=\{\{\s*color:\s*"var\(--fg-subtle\)"\s*\}\}>
        \s*
        <I\.File\s+size=\{1[68]\}\s*/>
        \s*
        </span>
        (?=\s*<div\s+style=\{\{\s*flex:\s*1)
    """,
    re.VERBOSE | re.MULTILINE,
)

REPLACEMENT = "<UploadedFilePreview file={file} maxHeight={80} />"


def refactor(src: str) -> tuple[str, bool]:
    """Returns (new_src, changed)."""
    if "UploadedFilePreview" in src and "<UploadedFilePreview" in src:
        # Already migrated.
        return src, False

    new_src, n = PATTERN.subn(REPLACEMENT, src)
    if n == 0:
        return src, False

    # Insert the import after the last existing import.
    last_import_match = list(re.finditer(r"^import .+;$", new_src, re.MULTILINE))
    if last_import_match:
        last = last_import_match[-1]
        insert_at = last.end()
        new_src = (
            new_src[:insert_at]
            + '\nimport { UploadedFilePreview } from "./UploadedFilePreview";'
            + new_src[insert_at:]
        )

    return new_src, True


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    changed = []
    skipped = []
    not_matched = []

    for rel in TOOLS:
        path = root / rel
        if not path.exists():
            print(f"missing: {rel}", file=sys.stderr)
            continue
        src = path.read_text()
        new_src, did = refactor(src)
        if did:
            path.write_text(new_src)
            changed.append(rel)
        elif "<UploadedFilePreview" in src:
            skipped.append(rel)
        else:
            not_matched.append(rel)

    print(f"changed: {len(changed)}")
    for c in changed:
        print(f"  {c}")
    if skipped:
        print(f"already migrated: {len(skipped)}")
        for s in skipped:
            print(f"  {s}")
    if not_matched:
        print(f"pattern not matched: {len(not_matched)}")
        for n in not_matched:
            print(f"  {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
