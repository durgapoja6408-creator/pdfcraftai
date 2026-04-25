#!/usr/bin/env bash
# Validate every JSON-LD <script> block on representative live pages.
# Pulls each <script type="application/ld+json">...</script> and
# confirms it parses as valid JSON via Python's json module.
set +e
BASE="https://pdfcraftai.com"

PAGES=(
  "/"
  "/merge-pdf"
  "/split-pdf"
  "/translate-pdf"
  "/alternatives/ilovepdf"
  "/alternatives/adobe-acrobat"
  "/use-cases/merge-bank-statements-for-accountant"
  "/use-cases/redline-contract-revisions"
  "/categories/ai"
  "/categories/organize"
  "/blog/how-to-merge-pdfs-without-losing-bookmarks"
  "/blog/redact-pdf-properly"
  "/tool/merge"
  "/pricing"
)

TOTAL_BLOCKS=0
TOTAL_VALID=0
TOTAL_INVALID=0
INVALID_LIST=""

for path in "${PAGES[@]}"; do
  html=$(curl -sL --max-time 30 "$BASE$path" 2>/dev/null)
  # Extract JSON-LD blocks using sed/grep
  blocks=$(echo "$html" | python3 -c "
import sys, re
html = sys.stdin.read()
# Match <script type=\"application/ld+json\">...</script>
pattern = re.compile(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', re.DOTALL)
matches = pattern.findall(html)
for i, m in enumerate(matches):
    print(f'---BLOCK {i}---')
    print(m.strip())
    print(f'---END---')
")

  # Validate each block
  block_count=0
  IFS=$'\n'
  json=""
  in_block=0
  while read -r line; do
    if [ "$line" = "---END---" ]; then
      in_block=0
      block_count=$((block_count+1))
      TOTAL_BLOCKS=$((TOTAL_BLOCKS+1))
      # Validate
      result=$(echo "$json" | python3 -c "import sys, json; json.loads(sys.stdin.read()); print('OK')" 2>&1)
      if [ "$result" = "OK" ]; then
        TOTAL_VALID=$((TOTAL_VALID+1))
      else
        TOTAL_INVALID=$((TOTAL_INVALID+1))
        INVALID_LIST="$INVALID_LIST\n  $path block $((block_count-1)): $result"
      fi
      json=""
    elif [[ "$line" == "---BLOCK"* ]]; then
      in_block=1
      json=""
    elif [ "$in_block" = "1" ]; then
      json="$json$line"
    fi
  done <<< "$blocks"
  echo "$path: $block_count JSON-LD blocks"
  unset IFS
done

echo ""
echo "=== TOTAL ==="
echo "Blocks: $TOTAL_BLOCKS"
echo "Valid:  $TOTAL_VALID"
echo "Invalid: $TOTAL_INVALID"
if [ "$TOTAL_INVALID" -gt 0 ]; then
  echo "Invalid blocks:"
  echo -e "$INVALID_LIST"
fi
