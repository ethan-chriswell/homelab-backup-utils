# mealie-backup-ui

A web UI for managing Mealie backups. Single Docker container: a Node.js/Fastify backend proxies the Mealie API and serves a Vue 3 + Tailwind frontend from the same port.

## Features

- View all backups with name, date, and size
- "Last backup" status card showing how long ago the most recent backup was taken
- Trigger an on-demand backup with one click
- Download any backup as a zip file
- Delete any backup
- Restore any backup directly from Mealie
- Upload a local zip file to restore it into Mealie
- Optional secondary storage: sync every created backup to a local directory or an S3-compatible bucket
- Download backups directly from secondary storage
- Automated backup schedule (cron, configured in Settings)
- Retention policy: keep the N most recent backups and/or backups from the last N days
- Toast notifications for all async operations

## Architecture

```text
Browser
  └── GET / or /assets/*  ──► Fastify static files (built Vue SPA)
  └── /api/*              ──► Fastify API handlers
                                └── Mealie API (token stays server-side)
                                └── Secondary storage (local or S3, optional)
```

There is **one container**. The Dockerfile uses a multi-stage build to compile the Vue frontend, then copies the output into the Node runtime image alongside the backend. No separate frontend container runs at deployment time.

## Authentication

On first launch you are prompted to create an admin password (bootstrap). After that, all pages require a valid session. Sessions expire after 7 days.

**OIDC / SSO** is optional and configured via Settings → Auth. Supply your provider's issuer URL, client ID, client secret, and redirect URI. When enabled, a "Sign in with..." button appears on the login page alongside the local password form.

To change the admin password, log in and open Settings → Auth.

## Configuration

All settings — Mealie connection, secondary storage, schedule, retention, and OIDC — are managed through the in-app **Settings** panel and persisted to `SETTINGS_PATH`. Two environment variables seed the initial Mealie connection on first boot (before any settings file exists):

| Variable | Description |
| --- | --- |
| `MEALIE_URL` | Pre-seeds the Mealie base URL on first boot |
| `MEALIE_API_TOKEN` | Pre-seeds the Mealie API token on first boot |

These values are only applied once, when no settings file exists yet. Once you save settings through the UI the file takes precedence.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on |
| `SETTINGS_PATH` | `/data/settings.json` | Path where settings are persisted across restarts |
| `DEBUG` | `false` | Enable verbose debug logging |
| `MEALIE_URL` | `http://mealie_mealie:9000` | Pre-seeds the Mealie URL on first boot (see above) |
| `MEALIE_API_TOKEN` | — | Pre-seeds the Mealie API token on first boot (see above) |

## Scheduling & retention

Configure in Settings → Schedule and Settings → Retention.

**Schedule** — enable the cron toggle and supply a cron expression (default: `0 2 * * *`, daily at 02:00). The schedule is applied immediately when saved and survives container restarts via the settings file.

**Retention** — two independent limits, both optional:

- **Keep last N** — deletes the oldest backups when the count exceeds N
- **Keep last N days** — deletes backups older than N days

Retention applies to both Mealie and secondary storage. It runs automatically after every backup (scheduled or manual) and can also be triggered manually.

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
    volumes:
      - mealie_backup_data:/data

volumes:
  mealie_backup_data:
```

### With secondary storage (local or S3)

Storage is configured through the Settings UI after deployment — no extra environment variables are needed. See [docker-compose.example.yml](./docker-compose.yml) for a full annotated example.

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
