import { test, expect } from '@playwright/test'

const BACKUPS = [
  { name: 'mealie_2026-06-01_020000.zip', date: '2026-06-01T02:00:00+00:00', size: 2621440 },
  { name: 'mealie_2026-05-31_020000.zip', date: '2026-05-31T02:00:00+00:00', size: 2097152 },
]

const DEFAULT_SETTINGS = {
  mealie: { url: 'http://mealie:9000', token: '********' },
  storage: {
    type: 'none',
    local: { path: '/data/backups' },
    s3: { endpoint: '', bucket: '', region: 'us-east-1', prefix: 'mealie/', accessKeyId: '', secretAccessKey: '', forcePathStyle: false },
  },
  schedule: { enabled: false, cron: '0 2 * * *' },
}

const DEFAULT_CONFIG = { storageType: 'none', mealieUrl: 'http://mealie:9000', configured: true }

function mockAllRoutes(page, overrides = {}) {
  const backups = overrides.backups ?? BACKUPS
  const settings = overrides.settings ?? DEFAULT_SETTINGS
  const config = overrides.config ?? DEFAULT_CONFIG

  page.route('/api/settings', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: settings })
    } else if (route.request().method() === 'PUT') {
      if (overrides.settingsSaveError) {
        await route.fulfill({ status: 500, json: { error: 'Save failed' } })
      } else {
        await route.fulfill({ json: { ok: true } })
      }
    }
  })

  page.route('/api/config', async (route) => {
    await route.fulfill({ json: config })
  })

  page.route('/api/settings/test', async (route) => {
    if (overrides.testConnectionFail) {
      await route.fulfill({ json: { ok: false, error: 'Connection refused' } })
    } else {
      await route.fulfill({ json: { ok: true } })
    }
  })

  page.route('/api/backups', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: backups })
    } else if (route.request().method() === 'POST') {
      if (overrides.createError) {
        await route.fulfill({ status: 502, json: { error: 'Mealie unreachable' } })
      } else {
        await route.fulfill({ status: 201, json: { ok: true } })
      }
    }
  })

  page.route('/api/backups/*/download', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="backup.zip"' },
      body: Buffer.from('PK fake zip content'),
    })
  })

  page.route('/api/backups/*/restore', async (route) => {
    await route.fulfill({ json: { message: 'Restore started' } })
  })

  page.route(/\/api\/backups\/[^/]+$/, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' })
    }
  })

  page.route('/api/backups/upload', async (route) => {
    if (overrides.uploadError) {
      await route.fulfill({ status: 400, json: { error: 'Invalid file' } })
    } else {
      await route.fulfill({ json: { message: 'Uploaded' } })
    }
  })
}

// ── Dashboard ────────────────────────────────────────────────────────────────

test.describe('Dashboard', () => {
  test('shows backup list with names and dates', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await expect(page.getByTestId('backup-list')).toBeVisible()
    await expect(page.getByTestId(`backup-name-${BACKUPS[0].name}`)).toBeVisible()
    await expect(page.getByTestId(`backup-name-${BACKUPS[1].name}`)).toBeVisible()
  })

  test('shows total backup count', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await expect(page.getByTestId('total-count')).toHaveText('2')
  })

  test('shows last backup time in status card', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await expect(page.getByTestId('status-card')).toBeVisible()
    await expect(page.getByTestId('last-backup-time')).toBeVisible()
  })

  test('shows empty state when no backups', async ({ page }) => {
    mockAllRoutes(page, { backups: [] })
    await page.goto('/')
    await expect(page.getByTestId('empty-state')).toBeVisible()
    await expect(page.getByTestId('no-backup-yet')).toBeVisible()
  })

  test('shows setup banner when not configured', async ({ page }) => {
    mockAllRoutes(page, { config: { configured: false, mealieUrl: '', storageType: 'none' } })
    await page.goto('/')
    await expect(page.getByTestId('setup-banner')).toBeVisible()
  })

  test('backup now button is disabled when not configured', async ({ page }) => {
    mockAllRoutes(page, { config: { configured: false, mealieUrl: '', storageType: 'none' } })
    await page.goto('/')
    await expect(page.getByTestId('backup-now-button')).toBeDisabled()
  })
})

// ── Schedule display ─────────────────────────────────────────────────────────

test.describe('Schedule display', () => {
  test('shows schedule label in status card when schedule is enabled', async ({ page }) => {
    mockAllRoutes(page, {
      settings: { ...DEFAULT_SETTINGS, schedule: { enabled: true, cron: '0 2 * * *' } },
    })
    await page.goto('/')
    await expect(page.getByTestId('schedule-display')).toBeVisible()
    await expect(page.getByTestId('schedule-display')).toContainText('Daily at 2am')
  })

  test('does not show schedule display when disabled', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await expect(page.getByTestId('schedule-display')).not.toBeVisible()
  })
})

// ── Backup Now ───────────────────────────────────────────────────────────────

test.describe('Backup Now', () => {
  test('button is visible and triggers backup creation', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('backup-now-button').click()
    await expect(page.getByTestId('toast-success')).toBeVisible()
    await expect(page.getByTestId('toast-success')).toContainText('created')
  })

  test('shows error toast when backup creation fails', async ({ page }) => {
    mockAllRoutes(page, { createError: true })
    await page.goto('/')
    await page.getByTestId('backup-now-button').click()
    await expect(page.getByTestId('toast-error')).toBeVisible()
  })
})

// ── Download ─────────────────────────────────────────────────────────────────

test.describe('Download', () => {
  test('download button initiates file download', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId(`backup-row-${BACKUPS[0].name}`).hover()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId(`download-${BACKUPS[0].name}`).click(),
    ])
    expect(download.suggestedFilename()).toBe(BACKUPS[0].name)
  })
})

// ── Delete ───────────────────────────────────────────────────────────────────

test.describe('Delete', () => {
  test('deletes backup and removes it from list', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId(`backup-row-${BACKUPS[0].name}`).hover()
    await page.getByTestId(`delete-${BACKUPS[0].name}`).click()
    await expect(page.getByTestId('toast-success')).toBeVisible()
    await expect(page.getByTestId(`backup-name-${BACKUPS[0].name}`)).not.toBeVisible()
  })
})

// ── Upload Modal ─────────────────────────────────────────────────────────────

test.describe('Upload Modal', () => {
  test('opens when Upload button is clicked', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('upload-button').click()
    await expect(page.getByTestId('upload-modal')).toBeVisible()
  })

  test('closes when X is clicked', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('upload-button').click()
    await page.getByTestId('modal-close').click()
    await expect(page.getByTestId('upload-modal')).not.toBeVisible()
  })

  test('submit is disabled with no file selected', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('upload-button').click()
    await expect(page.getByTestId('upload-submit')).toBeDisabled()
  })

  test('upload succeeds and shows success toast', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('upload-button').click()
    await page.getByTestId('file-input').setInputFiles({
      name: 'mealie_restore.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('PK fake zip'),
    })
    await expect(page.getByTestId('selected-file')).toBeVisible()
    await expect(page.getByTestId('upload-submit')).not.toBeDisabled()
    await page.getByTestId('upload-submit').click()
    await expect(page.getByTestId('toast-success')).toBeVisible()
    await expect(page.getByTestId('upload-modal')).not.toBeVisible()
  })

  test('upload failure shows error toast', async ({ page }) => {
    mockAllRoutes(page, { uploadError: true })
    await page.goto('/')
    await page.getByTestId('upload-button').click()
    await page.getByTestId('file-input').setInputFiles({
      name: 'bad.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('bad'),
    })
    await page.getByTestId('upload-submit').click()
    await expect(page.getByTestId('toast-error')).toBeVisible()
  })
})

// ── Settings Modal ───────────────────────────────────────────────────────────

test.describe('Settings Modal', () => {
  test('opens when gear icon is clicked', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('settings-button').click()
    await expect(page.getByTestId('settings-modal')).toBeVisible()
  })

  test('closes when X is clicked', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('settings-button').click()
    await page.getByTestId('settings-close').click()
    await expect(page.getByTestId('settings-modal')).not.toBeVisible()
  })

  test('loads and displays existing settings', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('settings-button').click()
    await expect(page.getByTestId('settings-mealie-url')).toHaveValue('http://mealie:9000')
  })

  test('can switch storage type to s3 and see s3 fields', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('settings-button').click()
    await page.getByTestId('storage-type-s3').click()
    await expect(page.getByTestId('settings-s3-bucket')).toBeVisible()
    await expect(page.getByTestId('settings-s3-endpoint')).toBeVisible()
  })

  test('can switch storage type to local and see path field', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('settings-button').click()
    await page.getByTestId('storage-type-local').click()
    await expect(page.getByTestId('settings-local-path')).toBeVisible()
  })

  test('saves settings and shows toast', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('settings-button').click()
    await page.getByTestId('settings-mealie-url').fill('http://new-mealie:9000')
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('settings-modal')).not.toBeVisible()
    await expect(page.getByTestId('toast-success')).toBeVisible()
  })

  test('shows error when save fails', async ({ page }) => {
    mockAllRoutes(page, { settingsSaveError: true })
    await page.goto('/')
    await page.getByTestId('settings-button').click()
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('settings-error')).toBeVisible()
  })

  test('can enable schedule and select a preset', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('settings-button').click()
    await page.getByTestId('schedule-toggle').click()
    await expect(page.getByTestId('settings-cron-input')).toBeVisible()
    await page.getByTestId('schedule-preset-0 2 * * 0').click()
    await expect(page.getByTestId('settings-cron-input')).toHaveValue('0 2 * * 0')
  })

  test('test connection button shows success result', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('settings-button').click()
    await page.getByTestId('test-connection-button').click()
    await expect(page.getByTestId('test-result')).toBeVisible()
    await expect(page.getByTestId('test-result')).toContainText('Connected')
  })

  test('test connection button shows error on failure', async ({ page }) => {
    mockAllRoutes(page, { testConnectionFail: true })
    await page.goto('/')
    await page.getByTestId('settings-button').click()
    await page.getByTestId('test-connection-button').click()
    await expect(page.getByTestId('test-result')).toBeVisible()
    await expect(page.getByTestId('test-result')).toContainText('Connection refused')
  })

  test('setup banner links to settings modal', async ({ page }) => {
    mockAllRoutes(page, { config: { configured: false, mealieUrl: '', storageType: 'none' } })
    await page.goto('/')
    await page.getByTestId('setup-banner').getByRole('button', { name: 'Open Settings' }).click()
    await expect(page.getByTestId('settings-modal')).toBeVisible()
  })
})
