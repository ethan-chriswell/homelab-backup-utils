import { test, expect } from '@playwright/test'
import { mockAllRoutes, DEFAULT_SETTINGS } from './helpers.js'

// ARR-E2E-17
test.describe('Settings Modal', () => {
  test('opens when the gear icon is clicked', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('settings-button').click()
    await expect(page.getByTestId('settings-modal')).toBeVisible()
  })

  // ARR-E2E-18
  test('closes when X is clicked', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('settings-button').click()
    await page.getByTestId('settings-close').click()
    await expect(page.getByTestId('settings-modal')).not.toBeVisible()
  })

  // ARR-E2E-19
  test('saving settings shows a success toast and closes the modal', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId('settings-button').click()
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('settings-modal')).not.toBeVisible()
    await expect(page.getByTestId('toast-success')).toBeVisible()
    await expect(page.getByTestId('toast-success')).toContainText('saved')
  })

  test('shows error when save fails', async ({ page }) => {
    mockAllRoutes(page, { settingsSaveError: true })
    await page.goto('/')
    await page.getByTestId('settings-button').click()
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('settings-error')).toBeVisible()
  })

  test('can switch storage type to S3 and see S3 fields', async ({ page }) => {
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

  test('can enable the global schedule and select a preset', async ({ page }) => {
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
    await expect(page.getByTestId('test-result')).toContainText('Connection refused')
  })
})
