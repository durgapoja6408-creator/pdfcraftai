#!/usr/bin/env python3
"""
M20 part 2 (#193, 2026-04-29): mechanical refactor that wraps every
FormData-based AI tool fetch in fetchAiWithRetry.

For each file in TOOLS, find:

    const form = new FormData();
    form.append(...);
    form.append(...);
    ...

    const res = await fetch("/api/ai/X", { method: "POST", body: form });

(or the multi-line version of the fetch call), and rewrite to:

    const res = await fetchAiWithRetry("/api/ai/X", {
      bodyFactory: () => {
        const form = new FormData();
        form.append(...);
        ...
        return form;
      },
    });

Also inserts the import after the last `import` line.

Idempotent: if `fetchAiWithRetry` is already imported, skip. If we
can't find a matching pattern, skip with a warning (don't corrupt).
"""

import re
import sys
from pathlib import Path

TOOLS = [
    "components/tools/BloodTestTool.tsx",
    "components/tools/ComparePdfTool.tsx",
    "components/tools/MindmapPdfTool.tsx",
    "components/tools/OcrPdfTool.tsx",
    "components/tools/RedactPdfTool.tsx",
    "components/tools/ResumeParserTool.tsx",
    "components/tools/RewritePdfTool.tsx",
    "components/tools/SearchablePdfTool.tsx",
    "components/tools/SemanticSearchPdfTool.tsx",
    "components/tools/SignPdfTool.tsx",
    "components/tools/StructuredVariantTool.tsx",
    "components/tools/SummarizeVariantTool.tsx",
    "components/tools/TableExtractTool.tsx",
    "components/tools/TldrPdfTool.tsx",
    "components/tools/TranslatePdfTool.tsx",
]

# Pattern: capture FormData construction + fetch call (single OR multi-line).
# Group 1: indentation; group 2: full form-construction block (each line
# starting with form.append); group 3: route id.
# A form.append line — must end with `);` followed by line break. The body
# can contain parens (JSON.stringify(info), query.trim().slice(0,500), etc.)
# so use a non-greedy match across the whole line up to the closing `);`.
_FORM_APPEND_LINE = r"\1[ \t]*form\.append\(.+?\);\s*\n"
# An optional `if (...) { form.append(...); }` line — needed by
# SummarizeVariantTool which has a conditional append inline. We capture
# the whole if-block as one chunk by greedy-matching to the closing brace
# at the same indent.
_FORM_OPT_IF = r"\1[ \t]*if\s*\([^)]+\)\s*\{[\s\S]+?\1[ \t]*\}\s*\n"
# A consumed-form-block consists of one or more append lines OR
# parenthesized blocks (cap by `(?:\)|;)$` on each line).
_FORM_CHUNK = (
    r"(?:" + _FORM_APPEND_LINE
    + r"|" + _FORM_OPT_IF
    + r"|\1[ \t]*const\s+\w+\s*=\s*[^\n]+;\s*\n"  # local helper consts
    + r")"
)
PATTERN = re.compile(
    r"""(?P<indent>[ \t]*)const\s+form\s*=\s*new\s+FormData\(\);\s*\n
        (?P<form_appends>""" + _FORM_CHUNK + r"""+)
        (?:\1\s*\n)*  # optional blank lines
        \1const\s+res\s*=\s*await\s+fetch\(
            \s*"(?P<route>/api/ai/[^"]+)",\s*
            \{\s*
                method:\s*"POST",\s*
                body:\s*form,?\s*
            \}\s*
        \);
    """,
    re.VERBOSE,
)


def refactor(src: str) -> tuple[str, bool]:
    """Returns (new_src, changed)."""
    if "fetchAiWithRetry" in src:
        # Already migrated.
        return src, False

    m = PATTERN.search(src)
    if not m:
        return src, False

    indent = m.group("indent")
    form_appends = m.group("form_appends")
    route = m.group("route")

    # Re-indent the form_appends so they're nested two more levels deep
    # inside the bodyFactory closure.
    inner_indent = indent + "    "
    appends_lines = []
    for line in form_appends.splitlines():
        if line.strip():
            appends_lines.append(inner_indent + line.strip())
        else:
            appends_lines.append("")
    appends_block = "\n".join(appends_lines)

    replacement = (
        f"{indent}const res = await fetchAiWithRetry(\"{route}\", {{\n"
        f"{indent}  // M20 (#193): retry on transient 5xx / network failures.\n"
        f"{indent}  // FormData is single-use; rebuild it on each attempt.\n"
        f"{indent}  bodyFactory: () => {{\n"
        f"{inner_indent}const form = new FormData();\n"
        f"{appends_block}\n"
        f"{inner_indent}return form;\n"
        f"{indent}  }},\n"
        f"{indent}}});"
    )

    new_src = src[: m.start()] + replacement + src[m.end() :]

    # Insert the import after the last existing import.
    last_import_match = list(re.finditer(r"^import .+;$", new_src, re.MULTILINE))
    if last_import_match:
        last = last_import_match[-1]
        insert_at = last.end()
        new_src = (
            new_src[:insert_at]
            + '\nimport { fetchAiWithRetry } from "@/lib/client/fetch-ai-with-retry";'
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
        elif "fetchAiWithRetry" in src:
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
