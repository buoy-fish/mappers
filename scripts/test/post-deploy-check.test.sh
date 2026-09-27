#!/usr/bin/env bash
# Tests for scripts/post-deploy-check.sh, with curl replaced by a fixture stub.
# Run: bash scripts/test/post-deploy-check.test.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
CHECK="$HERE/../post-deploy-check.sh"
STUB_BIN="$(mktemp -d)"; cp "$HERE/stub-curl" "$STUB_BIN/curl"; chmod +x "$STUB_BIN/curl"
export POST_DEPLOY_CHECK_INTERVAL=0
pass=0 fail=0

HEXES_OK='[["8928308280fffff",617733123,-97,7.5],["8928308280bffff",617733124,-110,-2.0]]'
DIGEST='js/app-244467f38b518243e825cdc2dbb9c9d7.js'
PAGE_NEW="<html><head><script src=\"/$DIGEST?vsn=d\"></script></head></html>"
PAGE_OLD='<html><head><script src="/js/app-0000000000000000000000000000beef.js?vsn=d"></script></head></html>'

setup() {
  export CURL_STUB_DIR; CURL_STUB_DIR="$(mktemp -d)"
  MANIFEST="$CURL_STUB_DIR/cache_manifest.json"
  printf '{"latest":{"js/app.js":"%s","css/app.css":"css/app-x.css"}}' "$DIGEST" > "$MANIFEST"
}
serve() { # serve <key> <status> <ctype> <body> [ready_after]
  mkdir -p "$CURL_STUB_DIR/$1"
  printf '%s' "$2" > "$CURL_STUB_DIR/$1/status"
  printf '%s' "$3" > "$CURL_STUB_DIR/$1/ctype"
  printf '%s' "$4" > "$CURL_STUB_DIR/$1/body"
  [ -n "${5:-}" ] && printf '%s' "$5" > "$CURL_STUB_DIR/$1/ready_after"
  return 0
}
run_check() { OUT="$(PATH="$STUB_BIN:$PATH" bash "$CHECK" --base-url http://127.0.0.1:4001 "$@" 2>&1)"; RC=$?; }
expect() { # expect <name> <want_rc: 0|nonzero> [output-substring]
  local ok=1
  if [ "$2" = 0 ]; then [ "$RC" -eq 0 ] || ok=0; else [ "$RC" -ne 0 ] || ok=0; fi
  if [ -n "${3:-}" ] && ! grep -qF -- "$3" <<<"$OUT"; then ok=0; fi
  if [ $ok = 1 ]; then pass=$((pass+1)); echo "ok   - $1"
  else fail=$((fail+1)); echo "FAIL - $1 (rc=$RC)"; while IFS= read -r l; do echo "       $l"; done <<<"$OUT"; fi
}

setup; serve api_v1_hexes 200 'application/json; charset=utf-8' "$HEXES_OK"; serve root 200 'text/html; charset=utf-8' "$PAGE_NEW"
run_check --manifest "$MANIFEST" --timeout 5
expect "healthy service with new build passes" 0 "post-deploy check passed"

setup; serve api_v1_hexes 200 'text/html; charset=utf-8' '<!DOCTYPE html><html>catch-all</html>'; serve root 200 text/html "$PAGE_NEW"
run_check --manifest "$MANIFEST" --timeout 1
expect "SPA/HTML 200 on the API route fails" 1 "content-type"

setup; serve api_v1_hexes 200 application/json '[]'; serve root 200 text/html "$PAGE_NEW"
run_check --manifest "$MANIFEST" --timeout 1
expect "empty hex list fails" 1 "non-empty array"

setup; serve api_v1_hexes 500 application/json '{"errors":{"detail":"Internal Server Error"}}'; serve root 200 text/html "$PAGE_NEW"
run_check --manifest "$MANIFEST" --timeout 1
expect "500 from the API fails" 1 "HTTP 500"

setup; serve api_v1_hexes 200 application/json "$HEXES_OK"; serve root 200 text/html "$PAGE_OLD"
run_check --manifest "$MANIFEST" --timeout 1
expect "old build still being served fails" 1 "$DIGEST"

setup; serve api_v1_hexes 200 application/json "$HEXES_OK" 2; serve root 200 text/html "$PAGE_NEW"
run_check --manifest "$MANIFEST" --timeout 30
expect "service that comes up after retries passes" 0 "post-deploy check passed"

setup
run_check --manifest "$MANIFEST" --timeout 1
expect "service that never comes up fails with a clear message" 1 "FAILED"

setup; serve api_v1_hexes 200 application/json "$HEXES_OK"
run_check --skip-version-check --timeout 1
expect "--skip-version-check checks the API only" 0 "post-deploy check passed"

setup; serve api_v1_hexes 200 application/json "$HEXES_OK"; serve root 200 text/html "$PAGE_NEW"
run_check --manifest "$CURL_STUB_DIR/missing.json" --timeout 1
expect "missing manifest is an error, not a silent skip" 1 "manifest"

setup; serve api_v1_hexes 200 application/json "$HEXES_OK"
run_check --timeout 1
expect "must choose --manifest or --skip-version-check" 1 "usage"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
