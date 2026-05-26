# homelab-backup-utils

This repository contains small containerized backup utilities for homelab services.
Each folder builds its own Docker image and contains a service-specific backup script.

## Containers

### `arr-backup`

A generic single-service backup container for *arr-style services*. It supports:
- `SERVICE_TYPE=starr` (Sonarr/Radarr/Prowlarr command API backups)
- `SERVICE_TYPE=tautulli` (Tautulli database backups)

Docs: `arr-backup/README.md`

### `mealie-backup`

Triggers a Mealie backup using the Mealie API, then copies the latest `.zip` file to staging.

Docs: `mealie-backup/README.md`

### `sqlite-backup`

Safely copies SQLite database backups from configured mounted database files.

Docs: `sqlite-backup/README.md`

## Build all containers

```sh
cd arr-backup && docker build -t arr-backup .
cd ../mealie-backup && docker build -t mealie-api-backup .
cd ../sqlite-backup && docker build -t sqlite-backup .
```

## Usage

Each container is intended to run one backup job per service or dataset.
Use volume mounts for the target service data and the staging output directory.

### Recommended pattern

- `arr-backup`: one container per Arr service
- `mealie-backup`: one container for Mealie
- `sqlite-backup`: one container for local SQLite database backups

## Notes

- All containers now use `CRON_SCHEDULE` for configurable scheduling.
- For one-shot execution, use `RUN_ONCE=true` in each container.
- This repo includes Renovate config at `.github/renovate.json` to keep Docker base images up to date.

## Renovate

This repository includes:
- `.github/renovate.json` for Renovate configuration
- `.github/workflows/renovate.yml` to run Renovate on a schedule and on demand

Enable the GitHub Renovate app for this repository, or run the workflow manually from the Actions tab.
