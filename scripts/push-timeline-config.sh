#!/bin/bash
# BUOY-FISH Coverage Mapper — Push Timeline config to prod
#
# Idempotently upserts ONLY the `TIMELINE_PROJECT_CONFIG` line from the local
# `.env.development` into prod's server-managed `~/map.buoy.fish/.env`, over SSH.
# Every other line in prod's `.env` (DATABASE_URL, SECRET_KEY_BASE,
# MAPPERS_ADMIN_TOKEN, MAPBOX_ACCESS_TOKEN, ...) is left untouched.
#
# Why this exists: prod's `.env` is gitignored and server-managed, so the
# per-project Timeline dates (the bloom start/speed config) can't ride in with
# the git deploy. This pushes just that one line, then you re-run the deploy so
# the asset build re-inlines it (deploy.yml does `set -a; source .env; set +a`
# then `node build.mjs --deploy`).
#
# The value is the source of truth in committed `.env.development`
# (and `.env.production.example`). Edit it there, commit, then run this.
#
# Transport: the line is base64-encoded locally and decoded on the server, so
# the embedded JSON quotes/braces survive the SSH hop without any shell-quoting
# surprises. A timestamped backup of prod's `.env` is made before any edit.
#
# Usage:
#   ./scripts/push-timeline-config.sh            # confirm, then upsert on prod
#   ./scripts/push-timeline-config.sh --yes      # skip the confirmation prompt
#   ./scripts/push-timeline-config.sh --dry-run  # show what WOULD be pushed
#   ./scripts/push-timeline-config.sh --help
#
# Env overrides:
#   SSH_HOST    prod ssh target           (default: app.buoy.fish)
#   REMOTE_DIR  mapper dir on prod         (default: ~/map.buoy.fish)
#   ENV_FILE    local source env file      (default: .env.development)
#
# Requires: ssh access to prod (`ssh app.buoy.fish`), base64, grep.

set -euo pipefail

SSH_HOST="${SSH_HOST:-app.buoy.fish}"
REMOTE_DIR="${REMOTE_DIR:-~/map.buoy.fish}"
ENV_FILE="${ENV_FILE:-.env.development}"
KEY="TIMELINE_PROJECT_CONFIG"

ASSUME_YES=false
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y)    ASSUME_YES=true ;;
    --dry-run|-n) DRY_RUN=true ;;
    --help|-h)
      sed -n '2,/^set -euo/p' "$0" | sed 's/^# \{0,1\}//; $d'
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

# Run from the repo root regardless of the caller's CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found in repo root ($REPO_ROOT)." >&2
  exit 1
fi

# Extract the exact line (first match wins). Keep it verbatim — the value
# carries JSON with quotes and braces we must not mangle.
LINE="$(grep -m1 "^${KEY}=" "$ENV_FILE" || true)"
if [ -z "$LINE" ]; then
  echo "ERROR: no '${KEY}=' line found in $ENV_FILE." >&2
  exit 1
fi

echo "Source : $ENV_FILE"
echo "Target : ${SSH_HOST}:${REMOTE_DIR}/.env"
echo "Line   : $LINE"
echo

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] Would upsert the line above into prod .env. No changes made."
  exit 0
fi

if [ "$ASSUME_YES" != true ]; then
  printf "Upsert this line into prod .env on %s? [y/N] " "$SSH_HOST"
  read -r reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

# base64-encode locally (BSD base64 on macOS); decode on prod (GNU coreutils).
ENCODED="$(printf '%s' "$LINE" | base64 | tr -d '\n')"

# Heredoc runs on prod. $ENCODED is expanded locally; everything escaped with
# \$ is evaluated remotely. KEY is interpolated locally into the grep patterns.
# SC2087: the UNquoted delimiter is intentional — we want local expansion of
# $ENCODED/${KEY}/${REMOTE_DIR} and remote evaluation of the \$(...) parts.
# shellcheck disable=SC2087
ssh "$SSH_HOST" "bash -s" <<REMOTE
set -euo pipefail
cd ${REMOTE_DIR}

if [ ! -f .env ]; then
  echo "ERROR: prod .env not found in \$(pwd)." >&2
  exit 1
fi

DECODED="\$(printf '%s' "$ENCODED" | base64 --decode)"

# Timestamped backup before touching anything.
BACKUP=".env.bak.\$(date +%Y%m%d-%H%M%S)"
cp .env "\$BACKUP"

BEFORE_LINES="\$(wc -l < .env | tr -d ' ')"

# Remove any existing key line(s), then append the current value exactly once.
grep -v "^${KEY}=" .env > .env.tmp || true
printf '%s\n' "\$DECODED" >> .env.tmp
mv .env.tmp .env

COUNT="\$(grep -c "^${KEY}=" .env || true)"
AFTER_LINES="\$(wc -l < .env | tr -d ' ')"
echo "✓ Upserted ${KEY} (now present \$COUNT time(s))."
echo "  backup: \$BACKUP   (.env lines: \$BEFORE_LINES -> \$AFTER_LINES)"
if [ "\$COUNT" != "1" ]; then
  echo "WARNING: expected exactly 1 ${KEY} line, found \$COUNT." >&2
  exit 1
fi
REMOTE

echo
echo "Done. Next: re-run the deploy so the asset build re-inlines the value, e.g."
echo "  gh run rerun \$(gh run list --repo buoy-fish/mappers --workflow deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId') --repo buoy-fish/mappers"
echo "  (or push any commit to main)."
echo "Verify after deploy:"
echo "  curl -s https://map.buoy.fish/js/app.js | grep -c 2026-05-01   # expect >= 1"
