#!/usr/bin/env bash
# QA phase 2: tool runners, SEO landings, alternatives, use cases, categories.
set +e
BASE="https://pdfcraftai.com"
RESULTS=/tmp/qa-results-p2.txt
FAIL=/tmp/qa-failures-p2.txt
> "$RESULTS"
> "$FAIL"

check() {
  local path="$1"
  local label="$2"
  local result code size
  result=$(curl -sL -o /dev/null -w "%{http_code} %{size_download}" "$BASE$path" 2>/dev/null)
  code=$(echo "$result" | awk '{print $1}')
  size=$(echo "$result" | awk '{print $2}')
  echo "$code $size $path  [$label]" >> "$RESULTS"
  if [ "$code" != "200" ] || [ "$size" -lt 5000 ]; then
    echo "FAIL $code ${size}B $path  [$label]" >> "$FAIL"
  fi
}

# Get all slugs from sitemap
SITEMAP=$(curl -s "$BASE/sitemap.xml" 2>/dev/null)

echo "=== Tool runner pages (/tool/*) ==="
echo "$SITEMAP" | grep -oE "<loc>[^<]+/tool/[^<]+</loc>" | sed 's|<loc>||;s|</loc>||;s|'"$BASE"'||' | head -100 | while read path; do
  check "$path" "tool"
done

echo "=== Alternative pages ==="
for slug in ilovepdf smallpdf adobe-acrobat pdf24 sejda; do
  check "/alternatives/$slug" "alt"
done

echo "=== Use-case pages ==="
for slug in merge-bank-statements-for-accountant combine-receipts-for-expense-report thesis-combine-and-format redline-contract-revisions translate-handbook-to-multiple-languages ocr-old-archive redact-pdf-before-sharing extract-tables-from-financial-report compress-pdf-for-email-attachment convert-research-papers-to-study-notes; do
  check "/use-cases/$slug" "use-case"
done

echo "=== Category pages ==="
for slug in organize convert edit optimize security ai; do
  check "/categories/$slug" "category"
done

echo "=== SEO landings (subset of head terms) ==="
for path in /merge-pdf /split-pdf /compress-pdf /pdf-to-word /translate-pdf /word-to-pdf /pdf-to-jpg /jpg-to-pdf /pdf-to-excel /edit-pdf /sign-pdf-free /chat-with-pdf /summarize-pdf /ai-pdf-ocr /make-pdf-searchable /redact-pdf-free /add-text-to-pdf /highlight-pdf /resize-pdf /compare-pdfs /ai-content-detector /pdf-to-html /pdf-to-text /repair-pdf /flatten-pdf /text-to-pdf /markdown-to-pdf; do
  check "$path" "seo"
done

echo "=== Blog posts (new + existing) ==="
for slug in how-to-merge-pdfs-without-losing-bookmarks compress-pdf-for-email-the-5mb-problem pdf-to-word-when-it-works ocr-scanned-pdf-make-searchable split-pdf-by-range-size-bookmark translate-pdf-without-breaking-layout chat-with-pdf-prompts-that-work redact-pdf-properly sign-pdfs-free-typed-drawn-uploaded extract-tables-from-financial-pdfs edit-pdf-in-browser-without-acrobat compare-two-contract-versions-without-word page-numbers-watermarks-headers-30-seconds convert-images-to-pdf-the-right-way summarize-200-page-report-plain-english scanned-pdfs-need-ocr-first combine-bank-statements-for-accountant compress-vs-optimize-what-each-changes fill-out-non-fillable-pdf-form 7-pdf-mistakes-that-cost-businesses-time ai-redact-v2 byok-guide pdf-security-2026 legal-ai-workflows launching-api summarize-technique; do
  check "/blog/$slug" "blog"
done

echo "DONE. Failures:"
cat "$FAIL"
echo "Total checked: $(wc -l < "$RESULTS")"
