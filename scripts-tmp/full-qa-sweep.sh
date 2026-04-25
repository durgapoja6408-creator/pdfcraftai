#!/usr/bin/env bash
# Full QA sweep: check every URL on the live site for HTTP 200 status
# and minimum content length. Records all failures so we can fix them.
#
# Categories:
#   1. Static pages (home, tools, pricing, etc.)
#   2. Tool runner pages (/tool/[id]) — 95 tools
#   3. SEO landing pages (/merge-pdf, etc.) — 95 landings
#   4. Blog posts (/blog/[slug]) — 28 posts
#   5. Help articles (/help/[slug])
#   6. Legal pages (/privacy, /terms, etc.)
#   7. Alternative pages — 5 + index
#   8. Use-case pages — 10 + index
#   9. Category pages — 6 + index
#  10. Special endpoints (/sitemap.xml, /robots.txt, /api/health)

set +e
BASE="https://pdfcraftai.com"
RESULTS=/tmp/qa-results.txt
FAIL=/tmp/qa-failures.txt

> "$RESULTS"
> "$FAIL"

check() {
  local path="$1"
  local label="$2"
  local url="$BASE$path"
  local result
  # -L follows redirects, -o /dev/null discards body, -w prints status+size
  result=$(curl -sL -o /dev/null -w "%{http_code} %{size_download}" "$url" 2>/dev/null)
  local code=$(echo "$result" | awk '{print $1}')
  local size=$(echo "$result" | awk '{print $2}')
  echo "$code $size $path  [$label]" >> "$RESULTS"
  # Failure conditions: non-200 status, or content < 1 KB (probably an error page)
  if [ "$code" != "200" ] || [ "$size" -lt 1000 ]; then
    echo "FAIL $code ${size}B $path  [$label]" >> "$FAIL"
  fi
}

echo "=== 1. Static pages ==="
for path in / /tools /pricing /api /blog /help /about /contact /agent /macros /bulk /changelog /careers /status /alternatives /use-cases /categories /launch-notify; do
  check "$path" "static"
done

echo "=== 2. Special endpoints ==="
for path in /sitemap.xml /robots.txt /api/health /og.png /icon.svg /favicon.ico; do
  check "$path" "endpoint"
done

echo "=== 3. Legal pages ==="
for path in /privacy /terms /security /dpa /gdpr /cancellation-policy /refund-policy /shipping-policy; do
  check "$path" "legal"
done

echo "Phase 1 done; failures so far:"
cat "$FAIL"
