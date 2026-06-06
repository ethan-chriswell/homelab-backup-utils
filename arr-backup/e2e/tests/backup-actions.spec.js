import { test, expect } from '@playwright/test'
import { mockAllRoutes, SERVICES, BACKUPS } from './helpers.js'

// ARR-E2E-6
test.describe('Backup All', () => {
  test('clicking "Backup All" shows success toast', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('backup-now-button').click()
    await expect(page.getByTestId('toast-success')).toBeVisible()
    await expect(page.getByTestId('toast-success')).toContainText('successfully')
  })

  // ARR-E2E-7
  test('shows error toast when a service fails', async ({ page }) => {
    mockAllRoutes(page, { createAllError: true })
    await page.goto('/')
    await page.getByTestId('backup-now-button').click()
    await expect(page.getByTestId('toast-error')).toBeVisible()
    await expect(page.getByTestId('toast-error')).toContainText('error')
  })
})

// ARR-E2E-8 — per-service backup button
test.describe('Per-service backup', () => {
  test('backup button on a service card triggers backup and shows toast', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId(`service-backup-btn-${SERVICES[0].id}`).click()
    await expect(page.getByTestId('toast-success')).toBeVisible()
  })

  test('error toast when per-service backup fails', async ({ page }) => {
    mockAllRoutes(page, { createServiceError: true })
    await page.goto('/')
    await page.getByTestId(`service-backup-btn-${SERVICES[0].id}`).click()
    await expect(page.getByTestId('toast-error')).toBeVisible()
  })
})

// ARR-E2E-9 — download
test.describe('Download', () => {
  test('download button initiates a file download with correct filename', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    // Navigate into detail view to access individual backup actions
    await page.getByTestId(`service-card-${SERVICES[0].id}`).click()
    await page.getByTestId(`backup-row-${SERVICES[0].id}-${BACKUPS[0].id}`).hover()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId(`download-${SERVICES[0].id}-${BACKUPS[0].id}`).click(),
    ])
    expect(download.suggestedFilename()).toBeTruthy()
  })
})

// ARR-E2E-10 — delete
test.describe('Delete', () => {
  test('deletes backup and removes it from the list', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId(`service-card-${SERVICES[0].id}`).click()
    await page.getByTestId(`backup-row-${SERVICES[0].id}-${BACKUPS[0].id}`).hover()
    await page.getByTestId(`delete-${SERVICES[0].id}-${BACKUPS[0].id}`).click()
    await expect(page.getByTestId('toast-success')).toBeVisible()
    await expect(page.getByTestId(`backup-row-${SERVICES[0].id}-${BACKUPS[0].id}`)).not.toBeVisible()
  })
})

// ARR-E2E-11 — restore
test.describe('Restore', () => {
  test('restore button shows success toast', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId(`service-card-${SERVICES[0].id}`).click()
    await page.getByTestId(`backup-row-${SERVICES[0].id}-${BACKUPS[0].id}`).hover()
    await page.getByTestId(`restore-${SERVICES[0].id}-${BACKUPS[0].id}`).click()
    await expect(page.getByTestId('toast-success')).toBeVisible()
    await expect(page.getByTestId('toast-success')).toContainText('Restore')
  })
})

// ARR-E2E-12 through ARR-E2E-16 — upload modal
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

  test('upload succeeds with a valid zip file and shows success toast', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('upload-button').click()
    await page.getByTestId('file-input').setInputFiles({
      name: 'radarr_restore.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from([0x50, 0x4B, 0x03, 0x04]),
    })
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
      buffer: Buffer.from([0x50, 0x4B, 0x03, 0x04]),
    })
    await page.getByTestId('upload-submit').click()
    await expect(page.getByTestId('toast-error')).toBeVisible()
  })
})
