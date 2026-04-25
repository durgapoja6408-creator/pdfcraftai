#!/usr/bin/env bash
# Internal link audit: pull every page from the sitemap, extract all
# href="/..." links, dedupe, then check that every one returns 200.
# This catches dead internal links that the sitemap-only sweep can't —
# e.g. a related-tools card pointing to a tool ID that doesn't exist,
# or a footer link to /careers when the page got deleted.
set +e
BASE="https://pdfcraftai.com"

echo "=== Pulling sitemap and extracting internal hrefs from each page ==="
URLS=$(curl -s --max-time 30 "$BASE/sitemap.xml" | grep -oE "<loc>[^<]+</loc>" | sed 's|<loc>||;s|</loc>||')
TOTAL=$(echo "$URLS" | wc -l)
echo "Crawling $TOTAL pages for internal links..."

> /tmp/all-links.txt

# Crawl each page and extract internal links (max 5 parallel)
echo "$URLS" | xargs -n 1 -P 5 -I{} sh -c '
  curl -sL --max-time 20 "{}" 2>/dev/null | \
    grep -oE "href=\"/[^\"]*\"" | \
    sed -E "s/href=\"//;s/\"\$//" | \
    grep -v "^/_next" | \
    grep -v "^//" | \
    sort -u
' >> /tmp/all-links.txt

# Dedupe across all pages
sort -u /tmp/all-links.txt > /tmp/unique-links.txt
LINK_COUNT=$(wc -l < /tmp/unique-links.txt)
echo "Found $LINK_COUNT unique internal links"
echo ""

# Check each for 200, flag failures
echo "Checking each link..."
> /tmp/link-fails.txt
cat /tmp/unique-links.txt | xargs -n 1 -P 5 -I{} sh -c '
  url="'"$BASE"'{}"
  result=$(curl -sL --max-time 20 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
  if [ "$result" != "200" ]; then
    echo "$result {}"
  fi
' > /tmp/link-fails.txt

if [ -s /tmp/link-fails.txt ]; then
  echo "=== Internal link failures ==="
  cat /tmp/link-fails.txt
else
  echo "=== ALL INTERNAL LINKS OK ==="
fi
echo ""
echo "Total checked: $LINK_COUNT"
echo "Failures: $(wc -l < /tmp/link-fails.txt)"
