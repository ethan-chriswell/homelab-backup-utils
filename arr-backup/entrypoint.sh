#!/usr/bin/env sh
set -eu

SERVICE_NAME="${SERVICE_NAME:-arr-service}"

if [ "${RUN_ONCE:-false}" = 'true' ]; then
  exec /usr/local/bin/backup
fi

CRON_SCHEDULE="${CRON_SCHEDULE:-@daily}"
if [ -z "$CRON_SCHEDULE" ]; then
  printf '[%s] ERROR: CRON_SCHEDULE is required\n' "$SERVICE_NAME" >&2
  exit 1
fi

cat >/etc/crontabs/root <<EOF
$CRON_SCHEDULE /usr/local/bin/backup >> /proc/1/fd/1 2>&1
EOF

printf '[%s] starting cron scheduler: %s\n' "$SERVICE_NAME" "$CRON_SCHEDULE"
exec crond -f
