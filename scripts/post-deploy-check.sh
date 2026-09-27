#!/usr/bin/env bash
# Post-deploy health check for the mapper (buoy-fish/monitoring#42).
#
# Passes only when the REAL, NEWLY BUILT mapper is answering:
#   1. GET <base>/api/v1/hexes -> 200, application/json, a non-empty JSON array
#      of [id, id_int, rssi, snr] rows. That body comes from HexController
#      querying Postgres, so an SPA catch-all (200 text/html), an nginx error
#      page, or a mapper that can't reach the DB all fail.
#   2. GET <base>/ -> 200 text/html that references the digested app.js named
#      in priv/static/cache_manifest.json, i.e. the manifest this deploy just
#      built. Phoenix loads the manifest at boot, so a mapper that never
#      restarted (still serving the previous build) fails.
#
# Retries until --timeout (the mapper boots via `nix develop`, which is slow).
#
# Usage:
#   On the box (full check):
#     scripts/post-deploy-check.sh --base-url http://127.0.0.1:4001 \
#       --manifest priv/static/cache_manifest.json
#   From anywhere (public path through Cloudflare + nginx; API only, because
#   the manifest lives on the box):
#     scripts/post-deploy-check.sh --base-url https://map.buoy.fish --skip-version-check
set -uo pipefail

BASE_URL="" MANIFEST="" SKIP_VERSION=0 TIMEOUT=180
INTERVAL="${POST_DEPLOY_CHECK_INTERVAL:-5}"

usage() { echo "usage: $0 --base-url URL (--manifest FILE | --skip-version-check) [--timeout SECS]" >&2; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --base-url) BASE_URL="${2:-}"; shift 2 ;;
    --manifest) MANIFEST="${2:-}"; shift 2 ;;
    --skip-version-check) SKIP_VERSION=1; shift ;;
    --timeout) TIMEOUT="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$BASE_URL" ] || usage
if [ "$SKIP_VERSION" = 0 ] && [ -z "$MANIFEST" ]; then usage; fi
BASE_URL="${BASE_URL%/}"

EXPECTED_JS=""
if [ "$SKIP_VERSION" = 0 ]; then
  if [ ! -r "$MANIFEST" ]; then
    echo "FAILED: cache manifest not readable: $MANIFEST (did phx.digest run?)" >&2; exit 1
  fi
  EXPECTED_JS="$(jq -r '.latest["js/app.js"] // empty' "$MANIFEST")"
  if [ -z "$EXPECTED_JS" ]; then
    echo "FAILED: no js/app.js entry in cache manifest $MANIFEST" >&2; exit 1
  fi
fi

BODY="$(mktemp)"; trap 'rm -f "$BODY"' EXIT
STATUS="" CTYPE=""
fetch() { # fetch URL -> STATUS, CTYPE, body in $BODY
  local w
  w="$(curl -sS --max-time 15 -H 'Cache-Control: no-cache' -o "$BODY" -w '%{http_code} %{content_type}' "$1" 2>/dev/null)"
  STATUS="${w%% *}"; CTYPE="${w#* }"; [ "$CTYPE" = "$w" ] && CTYPE=""
  return 0
}

REASON=""
check_hexes() {
  local url="$BASE_URL/api/v1/hexes"
  fetch "$url"
  [ "$STATUS" = 200 ] || { REASON="$url: HTTP $STATUS (want 200)"; return 1; }
  case "$CTYPE" in application/json*) ;; *) REASON="$url: content-type '$CTYPE' (want application/json; an HTML 200 is a catch-all or an error page, not the API)"; return 1 ;; esac
  jq -e 'type == "array" and length > 0 and (.[0] | type == "array" and length == 4)' "$BODY" >/dev/null 2>&1 \
    || { REASON="$url: body is not a non-empty array of [id, id_int, rssi, snr] rows"; return 1; }
}
check_version() {
  local url="$BASE_URL/"
  fetch "$url"
  [ "$STATUS" = 200 ] || { REASON="$url: HTTP $STATUS (want 200)"; return 1; }
  case "$CTYPE" in text/html*) ;; *) REASON="$url: content-type '$CTYPE' (want text/html)"; return 1 ;; esac
  grep -qF "/$EXPECTED_JS" "$BODY" \
    || { REASON="$url: page does not reference /$EXPECTED_JS from the new cache manifest (old build still running?)"; return 1; }
}

deadline=$(( $(date +%s) + TIMEOUT )); attempt=0
while :; do
  attempt=$((attempt + 1))
  if check_hexes && { [ "$SKIP_VERSION" = 1 ] || check_version; }; then
    echo "✓ post-deploy check passed on attempt $attempt: $BASE_URL/api/v1/hexes is JSON rows${EXPECTED_JS:+; / serves new build $EXPECTED_JS}"
    exit 0
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "FAILED: post-deploy check did not pass within ${TIMEOUT}s ($attempt attempts). Last error: $REASON" >&2
    exit 1
  fi
  echo "  waiting ($attempt): $REASON"
  sleep "$INTERVAL"
done
