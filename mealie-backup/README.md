# mealie-backup

A lightweight Mealie backup container that triggers a Mealie backup via API and copies the latest zip to staging.

## Build

```sh
cd mealie-backup
docker build -t mealie-api-backup .
```

## Required environment variables

- `MEALIE_URL` - full base URL for the Mealie service.
- `MEALIE_DATA_DIR` - path to the Mealie data directory inside the container.
- `MEALIE_API_TOKEN` - provided via `/run/secrets/mealie_api_token`.

## Optional environment variables

- `STAGING_DIR` - destination directory for copied backups (default: `/staging`).
- `CRON_SCHEDULE` - cron expression for scheduling backups (default: `@daily`).
- `RUN_ONCE` - if `true`, run backup once and exit.

## Behavior

- Sends a `POST` to `${MEALIE_URL}/api/backups`.
- Waits 15 seconds for Mealie to generate the backup.
- Copies the newest `.zip` from `${MEALIE_DATA_DIR}/backups/` into `${STAGING_DIR}/mealie/`.
- Keeps only the two newest files in the staging folder.
- Runs on a configurable cron schedule via `CRON_SCHEDULE`.

## Example

```yaml
services:
  mealie-backup:
    image: mealie-api-backup:latest
    environment:
      MEALIE_URL: http://mealie:9000
      MEALIE_DATA_DIR: /mealie-data
    secrets:
      - mealie_api_token
    volumes:
      - mealie-staging:/staging
    depends_on:
      - mealie
```

## Notes

- The container now uses configurable cron scheduling via `CRON_SCHEDULE`.
- Use `RUN_ONCE=true` for a one-shot backup run.
