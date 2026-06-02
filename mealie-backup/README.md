# mealie-backup-ui

A web UI for managing Mealie backups. Single Docker container: a Node.js/Fastify backend proxies the Mealie API and serves a Vue 3 + Tailwind frontend from the same port.

## Features

- View all backups with name, date, and size
- "Last backup" status card showing how long ago the most recent backup was taken
- Trigger an on-demand backup with one click
- Download any backup as a zip file
- Upload a local zip file to restore it into Mealie
- Optional secondary storage: sync every created backup to a local directory or an S3-compatible bucket
- Toast notifications for all async operations

## Architecture

```
Browser
  └── GET / or /assets/*  ──► Fastify static files (built Vue SPA)
  └── /api/*              ──► Fastify API handlers
                                └── Mealie API (token stays server-side)
                                └── Secondary storage (local or S3, optional)
```

There is **one container**. The Dockerfile uses a multi-stage build to compile the Vue frontend, then copies the output into the Node runtime image alongside the backend. No separate frontend container runs at deployment time.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `MEALIE_URL` | `http://mealie_mealie:9000` | Base URL of your Mealie instance |
| `MEALIE_API_TOKEN` | — | Mealie API token (mutually exclusive with `_FILE`) |
| `MEALIE_API_TOKEN_FILE` | — | Path to a file containing the token (e.g. Docker secret) |
| `STORAGE_TYPE` | `none` | Secondary storage backend: `none`, `local`, or `s3` |
| `LOCAL_STORAGE_PATH` | `/data/backups` | Directory for local backups (only when `STORAGE_TYPE=local`) |
| `S3_ENDPOINT` | — | S3-compatible endpoint URL, e.g. `http://minio:9000` (omit for AWS) |
| `S3_BUCKET` | — | Bucket name |
| `S3_REGION` | `us-east-1` | AWS/S3 region |
| `S3_PREFIX` | `mealie/` | Key prefix for stored backups |
| `S3_ACCESS_KEY_ID` | — | Access key (or use `S3_ACCESS_KEY_ID_FILE`) |
| `S3_SECRET_ACCESS_KEY` | — | Secret key (or use `S3_SECRET_ACCESS_KEY_FILE`) |
| `S3_FORCE_PATH_STYLE` | `false` | Set `true` for MinIO and other self-hosted S3 |

Any variable ending in `_FILE` reads the value from a file — useful for Docker secrets.

## Secrets

The recommended way to pass the Mealie token and S3 credentials is via Docker secrets mounted at `/run/secrets/<name>`, then pointed to with the `_FILE` variants:

```
MEALIE_API_TOKEN_FILE=/run/secrets/mealie_api_token
S3_SECRET_ACCESS_KEY_FILE=/run/secrets/s3_secret_key
```

## Example deployments

### Minimal (no secondary storage)

```yaml
services:
  mealie-backup-ui:
    image: ghcr.io/ethan-chriswell/mealie-backup-ui:latest
    ports:
      - "3000:3000"
    environment:
      MEALIE_URL: http://mealie:9000
      MEALIE_API_TOKEN: your-token-here
```

### With local storage

```yaml
services:
  mealie-backup-ui:
    image: ghcr.io/ethan-chriswell/mealie-backup-ui:latest
    ports:
      - "3000:3000"
    environment:
      MEALIE_URL: http://mealie:9000
      MEALIE_API_TOKEN: your-token-here
      STORAGE_TYPE: local
      LOCAL_STORAGE_PATH: /data/backups
    volumes:
      - mealie_backups:/data/backups

volumes:
  mealie_backups:
```

### With S3-compatible storage (MinIO)

See [docker-compose.example.yml](./docker-compose.example.yml) for a full working example.

## Development

```bash
# Terminal 1 — backend (requires a running Mealie or set MEALIE_URL to a mock)
cd backend && npm install && MEALIE_URL=http://localhost:9000 MEALIE_API_TOKEN=token npm run dev

# Terminal 2 — frontend (proxies /api/* to localhost:3000)
cd frontend && npm install && npm run dev

# E2E tests (frontend dev server must be running, tests mock all API calls)
cd e2e && npm install && npx playwright install chromium && npm test
```

## Building

```bash
docker build -t mealie-backup-ui .
```
