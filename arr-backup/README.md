# arr-backup

A generic single-service backup container for *arr-style services.*

This container is designed to back up exactly one service per container instance.
It supports:
- `SERVICE_TYPE=starr` for Sonarr/Radarr/Prowlarr-style command API backups
- `SERVICE_TYPE=tautulli` for Tautulli database backups

## Behavior

- Runs a backup for one configured service.
- Copies the latest backup file into `STAGING_DIR/$SERVICE_NAME/`.
- Keeps the two most recent backup files for the service in the staging directory.
- Uses cron scheduling instead of a shell sleep loop.

## Build

```sh
cd arr-backup
docker build -t arr-backup .
```

## Required environment variables

- `SERVICE_NAME` - logical name used for logs and staging subdirectory.
- `SERVICE_TYPE` - `starr` or `tautulli`.
- `SERVICE_URL` - base URL for the service.
- `SERVICE_API_KEY` or `SERVICE_API_KEY_FILE` - API key string or path to a file containing the API key.

## Optional environment variables

- `SERVICE_API_VERSION` - REST API version for `starr` services (default: `v3`).
- `SERVICE_CONFIG_DIR` - configuration directory for the service; used to resolve default backup locations.
- `SERVICE_BACKUP_DIR` - explicit backup output directory to copy the latest backup from.
- `STAGING_DIR` - directory where backup artifacts are copied (default: `/staging`).
- `CRON_SCHEDULE` - cron expression for scheduling backups (default: `@daily`).
- `RUN_ONCE` - if `true`, run backup once and exit.

## Example: Sonarr

```yaml
services:
  sonarr-backup:
    image: arr-backup:latest
    environment:
      SERVICE_NAME: sonarr
      SERVICE_TYPE: starr
      SERVICE_URL: http://sonarr:8989
      SERVICE_API_VERSION: v3
      SERVICE_CONFIG_DIR: /arr/sonarr
      CRON_SCHEDULE: '@daily'
    secrets:
      - sonarr_api_key
    volumes:
      - sonarr-staging:/staging
    depends_on:
      - sonarr
```

## Example: Radarr

```yaml
services:
  radarr-backup:
    image: arr-backup:latest
    environment:
      SERVICE_NAME: radarr
      SERVICE_TYPE: starr
      SERVICE_URL: http://radarr:7878
      SERVICE_API_VERSION: v3
      SERVICE_CONFIG_DIR: /arr/radarr
      CRON_SCHEDULE: '0 2 * * *'
    secrets:
      - radarr_api_key
    volumes:
      - radarr-staging:/staging
    depends_on:
      - radarr
```

## Example: Tautulli

```yaml
services:
  tautulli-backup:
    image: arr-backup:latest
    environment:
      SERVICE_NAME: tautulli
      SERVICE_TYPE: tautulli
      SERVICE_URL: http://tautulli:8181
      SERVICE_CONFIG_DIR: /arr/tautulli
      CRON_SCHEDULE: '@daily'
    secrets:
      - tautulli_api_key
    volumes:
      - tautulli-staging:/staging
    depends_on:
      - tautulli
```

## Notes

- `SERVICE_API_KEY_FILE` defaults to `/run/secrets/${SERVICE_NAME}_api_key`.
- If `SERVICE_BACKUP_DIR` is set, it takes precedence over the default backup directory.
- For `starr` services, default backup location is `$SERVICE_CONFIG_DIR/Backups`.
- For `tautulli`, default backup location is `$SERVICE_CONFIG_DIR/backups`.
- `RUN_ONCE=true` is useful for ad hoc or one-shot backup jobs.
- With cron enabled, backup logs are written to container stdout.
