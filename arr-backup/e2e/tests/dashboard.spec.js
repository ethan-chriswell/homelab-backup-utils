import { test, expect } from '@playwright/test'
import { mockAllRoutes, SERVICES, BACKUPS } from './helpers.js'

// ARR-E2E-1, ARR-E2E-2
test.describe('Service grid overview', () => {
  test('renders a card for each configured service', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    for (const svc of SERVICES) {
      await expect(page.getByTestId(`service-card-${svc.id}`)).toBeVisible()
    }
  })

  test('service cards show the service name', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await expect(page.getByTestId(`service-card-${SERVICES[0].id}`)).toContainText('Radarr')
    await expect(page.getByTestId(`service-card-${SERVICES[1].id}`)).toContainText('Sonarr')
  })

  test('service cards display backup count', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    // Radarr has 2 backups — card should mention "2 backups"
    await expect(page.getByTestId(`service-card-${SERVICES[0].id}`)).toContainText('2 backups')
  })

  // ARR-E2E-3
  test('shows empty state when no services are configured', async ({ page }) => {
    mockAllRoutes(page, {
      config: { configured: false },
      settings: { ...{}, services: [], schedules: [], storage: { type: 'none', local: { path: '/data/backups' }, s3: { endpoint: '', bucket: '', region: 'us-east-1', prefix: 'arr/', accessKeyId: '', secretAccessKey: '', forcePathStyle: false } }, schedule: { enabled: false, cron: '0 2 * * *' }, retention: { enabled: false, keepLast: 10, keepDays: 0 }, auth: { local: { configured: false }, oidc: { clientSecret: '' } } },
      backups: [],
      status: { services: [] },
    })
    await page.goto('/')
    await expect(page.getByText('No services configured yet')).toBeVisible()
  })

  // ARR-E2E-4
  test('Backup All button is disabled when no services are configured', async ({ page }) => {
    mockAllRoutes(page, {
      config: { configured: false },
      settings: { services: [], schedules: [], storage: { type: 'none', local: { path: '/data/backups' }, s3: { endpoint: '', bucket: '', region: 'us-east-1', prefix: 'arr/', accessKeyId: '', secretAccessKey: '', forcePathStyle: false } }, schedule: { enabled: false, cron: '0 2 * * *' }, retention: { enabled: false, keepLast: 10, keepDays: 0 }, auth: { local: { configured: false }, oidc: { clientSecret: '' } } },
      backups: [],
      status: { services: [] },
    })
    await page.goto('/')
    await expect(page.getByTestId('backup-now-button')).toBeDisabled()
  })

  // ARR-E2E-5
  test('clicking a service card navigates to the detail view', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId(`service-card-${SERVICES[0].id}`).click()
    // Detail view shows "Services /" breadcrumb and the backup list
    await expect(page.getByRole('button', { name: 'Services' })).toBeVisible()
    await expect(page.getByTestId('backup-list')).toBeVisible()
  })
})

// ── Backup list in detail view ─────────────────────────────────────────────────
test.describe('Detail view — backup list', () => {
  test('shows backups for the selected service', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId(`service-card-${SERVICES[0].id}`).click()
    await expect(page.getByTestId(`backup-row-${SERVICES[0].id}-${BACKUPS[0].id}`)).toBeVisible()
    await expect(page.getByTestId(`backup-row-${SERVICES[0].id}-${BACKUPS[1].id}`)).toBeVisible()
  })

  test('shows empty state when service has no backups', async ({ page }) => {
    mockAllRoutes(page, { backups: [] })
    await page.goto('/')
    await page.getByTestId(`service-card-${SERVICES[0].id}`).click()
    await expect(page.getByTestId('empty-state')).toBeVisible()
  })

  test('back button returns to overview grid', async ({ page }) => {
    mockAllRoutes(page)
    await page.goto('/')
    await page.getByTestId(`service-card-${SERVICES[0].id}`).click()
    await page.getByRole('button', { name: 'Services' }).click()
    await expect(page.getByTestId(`service-card-${SERVICES[0].id}`)).toBeVisible()
  })
})
