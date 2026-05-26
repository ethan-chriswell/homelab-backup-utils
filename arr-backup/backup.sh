#!/usr/bin/env sh
set -eu

SERVICE_NAME="${SERVICE_NAME:-arr-service}"
SERVICE_TYPE="${SERVICE_TYPE:-starr}"
SERVICE_URL="${SERVICE_URL:-}"
SERVICE_API_VERSION="${SERVICE_API_VERSION:-v3}"
SERVICE_API_KEY="${SERVICE_API_KEY:-}"
SERVICE_API_KEY_FILE="${SERVICE_API_KEY_FILE:-/run/secrets/${SERVICE_NAME}_api_key}"
SERVICE_CONFIG_DIR="${SERVICE_CONFIG_DIR:-}"
SERVICE_BACKUP_DIR="${SERVICE_BACKUP_DIR:-}"
STAGING_DIR="${STAGING_DIR:-/staging}"

log() {
  printf '[%s] %s\n' "$SERVICE_NAME" "$1"
}

error() {
  printf '[%s] ERROR: %s\n' "$SERVICE_NAME" "$1" >&2
}

get_api_key() {
  if [ -n "$SERVICE_API_KEY" ]; then
    printf '%s' "$SERVICE_API_KEY"
    return 0
  fi

  if [ -n "$SERVICE_API_KEY_FILE" ] && [ -f "$SERVICE_API_KEY_FILE" ]; then
    cat "$SERVICE_API_KEY_FILE"
    return 0
  fi

  return 1
}

copy_latest_backup() {
  local backup_dir="$1" pattern="$2"
  local latest

  if [ -z "$backup_dir" ]; then
    error "SERVICE_BACKUP_DIR or SERVICE_CONFIG_DIR must be set"
    return 1
  fi

  mkdir -p "$STAGING_DIR/$SERVICE_NAME"
  latest="$(ls -t "$backup_dir"/$pattern 2>/dev/null | head -1 || true)"
  if [ -n "$latest" ]; then
    cp "$latest" "$STAGING_DIR/$SERVICE_NAME/"
    ls -t "$STAGING_DIR/$SERVICE_NAME/"$pattern 2>/dev/null | tail -n +3 | xargs rm -f 2>/dev/null || true
    log "saved latest backup to $STAGING_DIR/$SERVICE_NAME/"
    return 0
  fi

  log "WARNING: no matching files found in $backup_dir"
  return 1
}

backup_starr() {
  local api_key resp job_id status i backup_dir

  if [ -z "$SERVICE_URL" ]; then
    error 'SERVICE_URL is required for starr services'
    return 1
  fi

  if [ -z "$SERVICE_CONFIG_DIR" ]; then
    error 'SERVICE_CONFIG_DIR is required for starr services'
    return 1
  fi

  backup_dir="${SERVICE_BACKUP_DIR:-${SERVICE_CONFIG_DIR%/}/Backups}"
  api_key="$(get_api_key)" || {
    error 'API key is required via SERVICE_API_KEY or SERVICE_API_KEY_FILE'
    return 1
  }

  log 'requesting backup'
  resp="$(curl -sf -X POST \
    -H "X-Api-Key: $api_key" \
    -H 'Content-Type: application/json' \
    -d '{"name":"Backup"}' \
    "$SERVICE_URL/api/$SERVICE_API_VERSION/command")" || {
    error 'API request failed'
    return 1
  }

  job_id="$(printf '%s' "$resp" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)"
  if [ -z "$job_id" ]; then
    error 'failed to parse backup job id'
    return 1
  fi

  i=0
  while [ "$i" -lt 60 ]; do
    status="$(curl -sf -H "X-Api-Key: $api_key" "$SERVICE_URL/api/$SERVICE_API_VERSION/command/$job_id" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
    case "$status" in
      completed)
        break
        ;;
      failed)
        error 'backup job failed'
        return 1
        ;;
    esac

    if [ -z "$status" ]; then
      log 'waiting for backup job status...'
    fi

    sleep 5
    i=$((i + 1))
  done

  if [ "$i" -ge 60 ]; then
    error 'backup job timed out'
    return 1
  fi

  copy_latest_backup "$backup_dir" '*.zip'
}

backup_tautulli() {
  local api_key backup_dir

  if [ -z "$SERVICE_URL" ]; then
    error 'SERVICE_URL is required for tautulli'
    return 1
  fi

  if [ -n "$SERVICE_BACKUP_DIR" ]; then
    backup_dir="$SERVICE_BACKUP_DIR"
  elif [ -n "$SERVICE_CONFIG_DIR" ]; then
    backup_dir="${SERVICE_CONFIG_DIR%/}/backups"
  else
    backup_dir='/arr/tautulli/backups'
  fi

  api_key="$(get_api_key)" || {
    error 'API key is required via SERVICE_API_KEY or SERVICE_API_KEY_FILE'
    return 1
  }

  log 'requesting backup'
  curl -sf "${SERVICE_URL}/api/v2?apikey=${api_key}&cmd=backup_db" > /dev/null || {
    error 'API request failed'
    return 1
  }

  copy_latest_backup "$backup_dir" '*.db'
}

run_backup() {
  case "$SERVICE_TYPE" in
    starr)
      backup_starr
      ;;
    tautulli)
      backup_tautulli
      ;;
    *)
      error "unsupported SERVICE_TYPE: $SERVICE_TYPE"
      return 1
      ;;
  esac
}

if [ -z "$SERVICE_URL" ]; then
  error 'SERVICE_URL is required'
  exit 1
fi

run_backup
