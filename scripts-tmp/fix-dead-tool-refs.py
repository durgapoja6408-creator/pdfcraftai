#!/usr/bin/env python3
"""Replace dead tool references in lib/seo-pages.ts and
components/tools/SummarizeVariantTool.tsx.

The dead refs come from the Sprint B / India-tools reversals — the
tools were removed from lib/tools.ts but a few `related: [...]` arrays
and relatedHref values in SummarizeVariantTool still pointed at them.

Mapping (dead → live, picked by closest functional analog):
  ai-medical-bill   → ai-blood-test   (both are medical-doc analyzers)
  ai-prescription   → ai-blood-test   (medical-doc category)
  ai-bank-statement → ai-table        (financial-table analyzer)
  ai-itr-form16     → ai-salary-slip  (closest financial-doc remaining)
  ai-expense-report → ai-table        (financial table)
  ai-balance-sheet  → ai-table        (financial table)

Skip the comment-only reference in useToolTracking.ts — it's
documentation, not a real link.
"""
import re
from pathlib import Path

ROOT = Path("/sessions/gifted-funny-franklin/pdfcraftai-work")

MAPPING = {
    "ai-medical-bill": "ai-blood-test",
    "ai-prescription": "ai-blood-test",
    "ai-bank-statement": "ai-table",
    "ai-itr-form16": "ai-salary-slip",
    "ai-expense-report": "ai-table",
    "ai-balance-sheet": "ai-table",
}

# Files to edit (skip comment-only useToolTracking.ts)
TARGETS = [
    "lib/seo-pages.ts",
    "components/tools/SummarizeVariantTool.tsx",
]

# Replacement labels for SummarizeVariantTool relatedHref labels
LABEL_MAPPING = {
    "ITR / Form 16 Analyzer": "Salary Slip Analyzer",
    "Medical Bill Analyzer": "Blood Test Analyzer",
    "Bank Statement Parser": "AI Table Extract",
}

total_changes = 0
for filepath in TARGETS:
    p = ROOT / filepath
    if not p.exists():
        print(f"SKIP missing: {filepath}")
        continue
    text = p.read_text()
    orig = text
    file_changes = 0
    # Replace tool IDs (in /tool/<id> URLs and in "<id>" strings)
    for dead, alive in MAPPING.items():
        # Match the dead slug as a quoted string token
        pattern = re.compile(r'"' + re.escape(dead) + r'"')
        new_text, n = pattern.subn(f'"{alive}"', text)
        if n > 0:
            text = new_text
            file_changes += n
        # Match in /tool/<dead> URLs
        url_pattern = re.compile(r'/tool/' + re.escape(dead) + r'(?=[\\\"\']|$)')
        new_text, n = url_pattern.subn(f'/tool/{alive}', text)
        if n > 0:
            text = new_text
            file_changes += n

    # Replace human-readable labels in SummarizeVariantTool.tsx
    if filepath.endswith("SummarizeVariantTool.tsx"):
        for old_label, new_label in LABEL_MAPPING.items():
            new_text = text.replace(f'label: "{old_label}"', f'label: "{new_label}"')
            if new_text != text:
                file_changes += text.count(f'label: "{old_label}"')
                text = new_text

    if file_changes > 0:
        p.write_text(text)
        print(f"  {filepath}: {file_changes} replacements")
        total_changes += file_changes
    else:
        print(f"  {filepath}: 0 replacements")

print(f"\nTotal: {total_changes} replacements")
