#!/usr/bin/env sh
set -eu

SERVICE_NAME="${SERVICE_NAME:-sqlite-backup}"
STAGING_DIR="${STAGING_DIR:-/staging}"

log() {
  printf '[%s] %s\n' "$SERVICE_NAME" "$1"
}

error() {
  printf '[%s] ERROR: %s\n' "$SERVICE_NAME" "$1" >&2
}

# SQLite online backup — safe against concurrent writes.
safe_backup() {
  local name="$1" src="$2" dst_dir="$3"

  if [ -f "$src" ]; then
    mkdir -p "$dst_dir"
    if sqlite3 "$src" ".backup $dst_dir/$(basename "$src")"; then
      log "$name backup complete"
    else
      error "$name backup failed"
    fi
  else
    log "$name skipped: $src not found"
  fi
}

log 'starting sqlite backup run'
safe_backup bazarr        /src/bazarr/db/bazarr.db               "$STAGING_DIR/bazarr"
safe_backup uptime-kuma   /src/uptime-kuma/kuma.db               "$STAGING_DIR/uptime-kuma"
safe_backup homebox       /src/homebox/homebox.db                 "$STAGING_DIR/homebox"
safe_backup homeassistant /src/homeassistant/home-assistant_v2.db "$STAGING_DIR/homeassistant"
log 'sqlite backup run complete'
