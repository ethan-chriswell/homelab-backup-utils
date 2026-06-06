# Homelab Backup Utils — Test Requirements

These requirements define testable behaviour for both applications. Each requirement maps to at least one automated test at unit, integration, or E2E level.

---

## Common Backend (shared by both apps)

### Authentication (`common/backend/src/auth.js`)

| ID | Requirement |
|----|-------------|
| AUTH-1 | `generateSessionSecret()` returns a 64-character lowercase hex string |
| AUTH-2 | Each call to `generateSessionSecret()` returns a unique value |
| AUTH-3 | `hashPassword()` returns a bcrypt hash that is not the plaintext password |
| AUTH-4 | `verifyPassword()` returns `true` for the correct password |
| AUTH-5 | `verifyPassword()` returns `false` for a wrong password |
| AUTH-6 | `signJwt()` + `verifyJwt()` round-trips the payload claims |
| AUTH-7 | Verified token contains `iat` and `exp` claims |
| AUTH-8 | Default JWT expiry is 7 days |
| AUTH-9 | `verifyJwt()` throws `"Invalid token signature"` when signed with a different secret |
| AUTH-10 | `verifyJwt()` throws `"Token expired"` for an expired token |
| AUTH-11 | `verifyJwt()` throws for malformed tokens (wrong segment count, empty string, null) |

### Settings (`common/backend/src/settings.js`)

| ID | Requirement |
|----|-------------|
| SET-1 | `deepMerge()` merges flat objects, with source values overriding target |
| SET-2 | `deepMerge()` recursively merges nested objects |
| SET-3 | `deepMerge()` replaces arrays rather than merging them |
| SET-4 | `deepMerge()` does not mutate the target object |
| SET-5 | `createSettingsStore()` returns defaults when no settings file exists |
| SET-6 | `save()` persists settings to disk as valid JSON |
| SET-7 | `save()` deep-merges the update into current settings |
| SET-8 | A second `createSettingsStore()` on the same path loads persisted values |
| SET-9 | Falls back to defaults gracefully if the settings file is corrupt JSON |
| SET-10 | `seedFromEnv` callback is called on first boot when no file exists |

### Storage (`common/backend/src/storage.js`)

| ID | Requirement |
|----|-------------|
| STO-1 | Local storage `type` is `"local"` |
| STO-2 | `save()` + `list()` round-trips a file (name, size, date, source) |
| STO-3 | `list()` only returns `.zip` files; ignores other extensions |
| STO-4 | `list()` returns entries sorted newest-first by modification time |
| STO-5 | `getStream()` returns a readable stream whose data matches what was saved |
| STO-6 | `getStream()` throws with `status: 404` for a missing file |
| STO-7 | `delete()` removes the file so it no longer appears in `list()` |
| STO-8 | `delete()` is a no-op (no error) when the file does not exist |
| STO-9 | Filenames containing `/` or `\` are rejected with `"Invalid filename"` |
| STO-10 | Null storage `type` is `"none"` |
| STO-11 | Null storage `save()` is a no-op |
| STO-12 | Null storage `list()` returns an empty array |
| STO-13 | Null storage `getStream()` throws with `status: 404` |

---

## Arr-Backup

### Retention logic (`arr-backup/backend/src/routes.js :: computeToDelete`)

| ID | Requirement |
|----|-------------|
| ARR-RET-1 | When both rules are disabled/zero, nothing is returned for deletion |
| ARR-RET-2 | `keepLast=N` keeps the N newest backups; older ones are marked for deletion |
| ARR-RET-3 | `keepDays=D` keeps backups within D days; older ones are marked for deletion |
| ARR-RET-4 | When both rules are active a backup is kept if **either** rule would save it |
| ARR-RET-5 | `keepLast=0, keepDays>0` — age rule applies alone |
| ARR-RET-6 | When only the age rule is active, a backup with no date field is marked for deletion (age rule cannot save what it cannot date); a count rule can still save it |

### API — Health & Config

| ID | Requirement |
|----|-------------|
| ARR-HC-1 | `GET /health` returns `{ ok: true }` with status 200 (no auth required) |
| ARR-HC-2 | `GET /api/config` returns `{ configured: false }` when no services are defined |
| ARR-HC-3 | `GET /api/config` returns `{ configured: true }` when at least one service is defined |
| ARR-HC-4 | `GET /api/config` requires no authentication |

### API — Authentication

| ID | Requirement |
|----|-------------|
| ARR-AUTH-1 | `GET /api/auth/status` returns `{ authenticated: false, bootstrapped: false }` on fresh install |
| ARR-AUTH-2 | `POST /api/auth/bootstrap` creates admin credentials and returns a JWT token |
| ARR-AUTH-3 | `POST /api/auth/bootstrap` returns 409 if credentials are already set |
| ARR-AUTH-4 | `POST /api/auth/bootstrap` rejects passwords shorter than 8 characters |
| ARR-AUTH-5 | `POST /api/auth/login` returns a JWT token with valid credentials |
| ARR-AUTH-6 | `POST /api/auth/login` returns 401 with wrong credentials |
| ARR-AUTH-7 | Any protected `/api/*` route returns 401 when no token is provided |
| ARR-AUTH-8 | Any protected `/api/*` route returns 401 when the token is invalid |

### API — Settings

| ID | Requirement |
|----|-------------|
| ARR-SET-1 | `GET /api/settings` returns masked secrets (`"********"`) for apiKey and s3 secretAccessKey |
| ARR-SET-2 | `PUT /api/settings` persists new settings and returns `{ ok: true }` |
| ARR-SET-3 | `PUT /api/settings` preserves existing secrets when the sentinel `"********"` is sent |
| ARR-SET-4 | `POST /api/settings/test-storage` with `type: "none"` returns `{ ok: true }` |

### API — Backups

| ID | Requirement |
|----|-------------|
| ARR-BAK-1 | `GET /api/backups` returns backups from all configured services with `serviceId` attached |
| ARR-BAK-2 | `GET /api/backups` includes an error entry for any service that fails to respond |
| ARR-BAK-3 | `POST /api/backups` triggers backup creation for all services and returns status 201 |
| ARR-BAK-4 | `POST /api/backups/:serviceId` returns 404 when the service does not exist |
| ARR-BAK-5 | `DELETE /api/backups/:serviceId/:id` returns 204 on success |
| ARR-BAK-6 | `DELETE /api/backups/:serviceId/:id` returns 404 when the serviceId does not exist |
| ARR-BAK-7 | `POST /api/backups/:serviceId/:id/restore` returns `{ ok: true }` |
| ARR-BAK-8 | `POST /api/backups/upload` rejects non-ZIP filenames (400) |
| ARR-BAK-9 | `POST /api/backups/upload` rejects files that lack a valid ZIP magic number (400) |
| ARR-BAK-10 | `POST /api/backups/upload` returns 400 when no `serviceId` field is provided |

---

## Mealie-Backup

### Retention logic (`mealie-backup/backend/src/routes.js :: computeToDelete`)

Same logic as ARR-RET-1 through ARR-RET-5 (identical function, different field names).

| ID | Requirement |
|----|-------------|
| MEA-RET-1 | When both rules are disabled/zero, nothing is returned for deletion |
| MEA-RET-2 | `keepLast=N` keeps the N newest backups |
| MEA-RET-3 | `keepDays=D` keeps backups within D days |
| MEA-RET-4 | Either rule saving a backup prevents its deletion |

### API — Health & Config

| ID | Requirement |
|----|-------------|
| MEA-HC-1 | `GET /health` returns `{ ok: true }` with status 200 |
| MEA-HC-2 | `GET /api/config` returns `{ configured: false }` when url or token is blank |
| MEA-HC-3 | `GET /api/config` returns `{ configured: true, mealieUrl, storageType }` when configured |

### API — Authentication

Same requirements as ARR-AUTH-1 through ARR-AUTH-8 (shared `authRoutes.js`).

### API — Status

| ID | Requirement |
|----|-------------|
| MEA-ST-1 | `GET /api/status` returns `{ mealie: "unconfigured" }` when url or token is blank |
| MEA-ST-2 | `GET /api/status` returns `{ mealie: "ok" }` when Mealie responds successfully |
| MEA-ST-3 | `GET /api/status` returns `{ mealie: "error" }` when Mealie is unreachable |

### API — Settings

| ID | Requirement |
|----|-------------|
| MEA-SET-1 | `GET /api/settings` masks the Mealie token and s3 secretAccessKey |
| MEA-SET-2 | `PUT /api/settings` persists settings and returns `{ ok: true }` |
| MEA-SET-3 | `PUT /api/settings` preserves the token when the sentinel `"********"` is sent |

### API — Backups

| ID | Requirement |
|----|-------------|
| MEA-BAK-1 | `GET /api/backups` returns the list from Mealie |
| MEA-BAK-2 | `POST /api/backups` triggers a backup and returns 201 |
| MEA-BAK-3 | `DELETE /api/backups/:name` returns 204 on success |
| MEA-BAK-4 | `GET /api/backups/:name/download` returns the file with `Content-Type: application/zip` |
| MEA-BAK-5 | `POST /api/backups/upload` rejects non-ZIP filenames (400) |
| MEA-BAK-6 | `POST /api/backups/upload` rejects files with invalid ZIP magic bytes (400) |

---

## E2E — Arr-Backup Frontend

### Dashboard / Overview

| ID | Requirement |
|----|-------------|
| ARR-E2E-1 | Service cards are rendered for each configured service |
| ARR-E2E-2 | Service cards show backup count and last backup time |
| ARR-E2E-3 | Empty state is shown when no services are configured |
| ARR-E2E-4 | "Backup All" button is disabled when no services are configured |
| ARR-E2E-5 | Clicking a service card navigates to the detail view |

### Backup Actions

| ID | Requirement |
|----|-------------|
| ARR-E2E-6 | "Backup All" triggers backup for all services and shows success toast |
| ARR-E2E-7 | "Backup All" shows error toast when any service fails |
| ARR-E2E-8 | Per-service backup button on a card triggers backup and shows toast |
| ARR-E2E-9 | Download button initiates a file download |
| ARR-E2E-10 | Delete button removes the backup row from the list and shows toast |
| ARR-E2E-11 | Restore button shows a success toast |

### Upload Modal

| ID | Requirement |
|----|-------------|
| ARR-E2E-12 | Upload modal opens when the Upload button is clicked |
| ARR-E2E-13 | Upload modal closes when X is clicked |
| ARR-E2E-14 | Submit button is disabled until a file is selected |
| ARR-E2E-15 | Successful upload shows a success toast and closes the modal |
| ARR-E2E-16 | Failed upload shows an error toast |

### Settings Modal

| ID | Requirement |
|----|-------------|
| ARR-E2E-17 | Settings modal opens when the gear icon is clicked |
| ARR-E2E-18 | Settings modal closes when X is clicked |
| ARR-E2E-19 | Saving settings shows a success toast and closes the modal |

---

## E2E — Mealie-Backup Frontend

Covered by the existing `mealie-backup/e2e/tests/backup.spec.js` test suite.
