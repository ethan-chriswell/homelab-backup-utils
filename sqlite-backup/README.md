# sqlite-backup

A container for safely backing up SQLite databases from mounted service data directories.

## Build

```sh
cd sqlite-backup
docker build -t sqlite-backup .
```

## Required environment variables

- `STAGING_DIR` - destination directory for copied backups (default: `/staging`).

## Optional environment variables

- `CRON_SCHEDULE` - cron expression for scheduling backups (default: `@daily`).
- `RUN_ONCE` - if `true`, run backup once and exit.

## Behavior

- Uses `sqlite3 .backup` to create a safe, consistent copy of each configured database.
- Copies backups to separate staging subdirectories:
  - `/staging/bazarr`
  - `/staging/uptime-kuma`
  - `/staging/homebox`
  - `/staging/homeassistant`
- Retains only the latest copy in the staging subdirectory.
- Runs on a configurable cron schedule via `CRON_SCHEDULE`.

## Configured databases

- `bazarr` from `/src/bazarr/db/bazarr.db`
- `uptime-kuma` from `/src/uptime-kuma/kuma.db`
- `homebox` from `/src/homebox/homebox.db`
- `homeassistant` from `/src/homeassistant/home-assistant_v2.db`

## Example

```yaml
services:
  sqlite-backup:
    image: sqlite-backup:latest
    volumes:
      - sqlite-staging:/staging
      - bazarr-db:/src/bazarr/db
      - uptime-kuma-db:/src/uptime-kuma
      - homebox-db:/src/homebox
      - homeassistant-db:/src/homeassistant
```

## Notes

- This container is designed for mounted service database files.
- If your service data layout differs, update the paths in `sqlite-backup/backup.sh`.
