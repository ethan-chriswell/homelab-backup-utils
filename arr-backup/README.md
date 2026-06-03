# arr-backup

A web UI for managing backups of the *arr media stack (Radarr, Sonarr, Prowlarr, Readarr, Lidarr, Whisparr). Single Docker container: a Node.js/Fastify backend proxies the Servarr backup API and serves a Vue 3 + Tailwind frontend from the same port.

## Features

- Manage multiple arr instances from a single UI
- View all backups across all services, with service type badges and color coding
- "Last backup" status card showing the most recent backup across all services
- Per-service status pills in the header (green/red connection indicators)
- Service filter tab strip to focus on one app at a time
- Trigger backups for all services at once or for a single service
- Download any backup as a zip file
- Delete any backup
- Restore any backup directly in the arr app (service restarts automatically)
- Upload a local zip file to restore it into any configured service
- Optional secondary storage: sync every created backup to a local directory or an S3-compatible bucket, organized as `type/name/backup.zip`
- Download backups directly from secondary storage
- Automated backup schedule (cron, configured in Settings)
- Retention policy: keep the N most recent backups and/or backups from the last N days, applied independently per service
- Toast notifications for all async operations

## Architecture

```text
Browser
  └── GET / or /assets/*  ──► Fastify static files (built Vue SPA)
  └── /api/*              ──► Fastify API handlers
                                └── Servarr API (apiKey stays server-side)
                                └── Secondary storage (local or S3, optional)
```

There is **one container**. The Dockerfile uses a multi-stage build to compile the Vue frontend, then copies the output into the Node runtime image alongside the backend. No separate frontend container runs at deployment time.

## Authentication

On first launch you are prompted to create an admin password (bootstrap). After that, all pages require a valid session. Sessions expire after 7 days.

**OIDC / SSO** is optional and configured via Settings → Security. Supply your provider's issuer URL, client ID, client secret, and redirect URI. When enabled, a "Sign in with SSO" button appears on the login page.

## Configuration

All settings — services, secondary storage, schedule, retention, and OIDC — are managed through the in-app **Settings** panel and persisted to `SETTINGS_PATH`. Two environment variables seed the initial connection on first boot:

| Variable | Description |
| --- | --- |
| `ARR_SERVICE_URL` | Pre-seeds a single service URL on first boot |
| `ARR_SERVICE_API_KEY` | Pre-seeds the API key for that service on first boot |

The service type is inferred from the URL (e.g. a URL containing "sonarr" → `sonarr`). These values are only applied once, when no settings file exists yet.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on |
| `SETTINGS_PATH` | `/data/settings.json` | Path where settings are persisted across restarts |
| `DEBUG` | `false` | Enable verbose debug logging |
| `ARR_SERVICE_URL` | — | Pre-seeds a single service URL on first boot |
| `ARR_SERVICE_API_KEY` | — | Pre-seeds the API key on first boot |

## Supported apps

All Servarr v3 apps are supported via the shared `/api/v3/` API:

| App | Default port |
| --- | --- |
| Radarr | 7878 |
| Sonarr | 8989 |
| Prowlarr | 9696 |
| Readarr | 8787 |
| Lidarr | 8686 |
| Whisparr | 6969 |

## Scheduling & retention

Configure in Settings → Automation.

**Schedule** — enable the cron toggle and supply a cron expression (default: `0 2 * * *`, daily at 02:00). When a scheduled backup runs it backs up **all** configured services in parallel.

**Retention** — two independent limits, both optional:

- **Keep last N** — deletes the oldest backups per service when the count exceeds N
- **Keep last N days** — deletes backups older than N days per service

Retention applies to both the arr app and secondary storage. It runs automatically after every backup (scheduled or manual) and can also be triggered manually.

## Example deployments

### Minimal (no secondary storage)

```yaml
services:
  arr-backup:
    image: ghcr.io/ethan-chriswell/arr-backup:latest
    ports:
      - "3000:3000"
    environment:
      ARR_SERVICE_URL: http://radarr:7878
      ARR_SERVICE_API_KEY: your-api-key-here
    volumes:
      - arr_backup_data:/data

volumes:
  arr_backup_data:
```

### Full stack with multiple services

Add additional services via the Settings UI after initial deployment. Secondary storage (local dir or S3/MinIO) is also configured through Settings.

See [docker-compose.example.yml](./docker-compose.example.yml) for an annotated single-service example.

## Development

```bash
# Terminal 1 — backend
cd backend && npm install && ARR_SERVICE_URL=http://localhost:7878 ARR_SERVICE_API_KEY=your-key npm run dev

# Terminal 2 — frontend (proxies /api/* to localhost:3000)
cd frontend && npm install && npm run dev
```

## Building

```bash
docker build -t arr-backup .
```
