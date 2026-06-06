// Shared test data and mock setup for arr-backup E2E tests

export const SERVICES = [
  { id: 'svc-radarr', name: 'Radarr', type: 'radarr', url: 'http://radarr:7878', apiKey: '********' },
  { id: 'svc-sonarr', name: 'Sonarr', type: 'sonarr', url: 'http://sonarr:8989', apiKey: '********' },
]

export const BACKUPS = [
  {
    id: 101,
    name: 'radarr_backup_2026-06-01_020000.zip',
    time: '2026-06-01T02:00:00Z',
    size: 3145728,
    serviceId: 'svc-radarr',
    serviceName: 'Radarr',
    serviceType: 'radarr',
  },
  {
    id: 102,
    name: 'radarr_backup_2026-05-31_020000.zip',
    time: '2026-05-31T02:00:00Z',
    size: 2621440,
    serviceId: 'svc-radarr',
    serviceName: 'Radarr',
    serviceType: 'radarr',
  },
  {
    id: 201,
    name: 'sonarr_backup_2026-06-01_020000.zip',
    time: '2026-06-01T02:00:00Z',
    size: 4194304,
    serviceId: 'svc-sonarr',
    serviceName: 'Sonarr',
    serviceType: 'sonarr',
  },
]

export const DEFAULT_SETTINGS = {
  services: SERVICES,
  schedules: [],
  storage: {
    type: 'none',
    local: { path: '/data/backups' },
    s3: {
      endpoint: '',
      bucket: '',
      region: 'us-east-1',
      prefix: 'arr/',
      accessKeyId: '',
      secretAccessKey: '********',
      forcePathStyle: false,
    },
  },
  schedule: { enabled: false, cron: '0 2 * * *' },
  retention: { enabled: false, keepLast: 10, keepDays: 0 },
  auth: { local: { configured: true }, oidc: { clientSecret: '' } },
}

export const DEFAULT_STATUS = {
  services: SERVICES.map((s) => ({ id: s.id, name: s.name, ok: true })),
}

export const DEFAULT_CONFIG = { configured: true }

/**
 * Mount standard API mocks. All overrides are merged; pass { backups: [] } for empty state, etc.
 */
export function mockAllRoutes(page, overrides = {}) {
  const backups = overrides.backups ?? BACKUPS
  const settings = overrides.settings ?? DEFAULT_SETTINGS
  const config = overrides.config ?? DEFAULT_CONFIG
  const status = overrides.status ?? DEFAULT_STATUS

  page.route('/api/auth/status', async (route) => {
    await route.fulfill({ json: { authenticated: true, bootstrapped: true, oidcEnabled: false } })
  })

  page.route('/api/config', async (route) => {
    await route.fulfill({ json: config })
  })

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

  page.route('/api/status', async (route) => {
    await route.fulfill({ json: status })
  })

  page.route('/api/backups', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: backups })
    } else if (route.request().method() === 'POST') {
      if (overrides.createAllError) {
        await route.fulfill({
          status: 200,
          json: { results: [{ serviceId: 'svc-radarr', ok: false, error: 'unreachable' }] },
        })
      } else {
        await route.fulfill({
          status: 201,
          json: { results: SERVICES.map((s) => ({ serviceId: s.id, ok: true })) },
        })
      }
    }
  })

  page.route(/\/api\/backups\/[^/]+$/, async (route) => {
    if (route.request().method() === 'POST') {
      if (overrides.createServiceError) {
        await route.fulfill({ status: 502, json: { error: 'Service unreachable' } })
      } else {
        await route.fulfill({ status: 201, json: { ok: true } })
      }
    }
  })

  page.route('/api/backups/*/*/download', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="backup.zip"',
      },
      body: Buffer.from('PK fake zip'),
    })
  })

  page.route('/api/backups/*/*/restore', async (route) => {
    await route.fulfill({ json: { ok: true } })
  })

  page.route(/\/api\/backups\/[^/]+\/[^/]+$/, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' })
    }
  })

  page.route('/api/backups/upload', async (route) => {
    if (overrides.uploadError) {
      await route.fulfill({ status: 400, json: { error: 'Invalid file' } })
    } else {
      await route.fulfill({ json: { ok: true } })
    }
  })

  page.route('/api/settings/test', async (route) => {
    if (overrides.testConnectionFail) {
      await route.fulfill({ json: { ok: false, error: 'Connection refused' } })
    } else {
      await route.fulfill({ json: { ok: true } })
    }
  })
}
