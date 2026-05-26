#!/usr/bin/env sh
set -eu

SERVICE_NAME="${SERVICE_NAME:-mealie}"
STAGING_DIR="${STAGING_DIR:-/staging}"
MEALIE_DATA_DIR="${MEALIE_DATA_DIR:-/mealie-data}"

log() {
  printf '[%s] %s\n' "$SERVICE_NAME" "$1"
}

error() {
  printf '[%s] ERROR: %s\n' "$SERVICE_NAME" "$1" >&2
}

api_token="$(cat /run/secrets/mealie_api_token)"

log 'requesting backup'
if ! curl -sf -X POST \
  -H "Authorization: Bearer $api_token" \
  -H "Content-Type: application/json" \
  "${MEALIE_URL}/api/backups" > /dev/null; then
  error 'API call failed'
  exit 1
fi

sleep 15

mkdir -p "$STAGING_DIR/mealie"
latest="$(ls -t "$MEALIE_DATA_DIR/backups/"*.zip 2>/dev/null | head -1 || true)"
if [ -n "$latest" ]; then
  cp "$latest" "$STAGING_DIR/mealie/"
  ls -t "$STAGING_DIR/mealie/"*.zip 2>/dev/null | tail -n +3 | xargs rm -f 2>/dev/null || true
  log "saved to $STAGING_DIR/mealie/"
else
  error "no backup zip found in $MEALIE_DATA_DIR/backups/"
fi
