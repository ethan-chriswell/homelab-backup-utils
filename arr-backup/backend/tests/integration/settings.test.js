import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp, bootstrapAndGetToken } from '../helpers/create-app.js'

const BASE_SERVICE = {
  id: 'svc-1',
  name: 'Radarr',
  type: 'radarr',
  url: 'http://radarr.test:7878',
  apiKey: 'actual-api-key',
}

// ARR-SET-1
describe('GET /api/settings', () => {
  test('masks apiKey with ********', async () => {
    const { app, settingsStore } = await createTestApp({ services: [BASE_SERVICE] })
    const token = await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.services[0].apiKey, '********')
    assert.notEqual(body.services[0].apiKey, 'actual-api-key')
  })

  test('masks s3 secretAccessKey with ********', async () => {
    const { app, settingsStore } = await createTestApp({
      storage: {
        type: 's3',
        local: { path: '/data/backups' },
        s3: {
          endpoint: '',
          bucket: 'my-bucket',
          region: 'us-east-1',
          prefix: 'arr/',
          accessKeyId: 'AKID',
          secretAccessKey: 'actual-secret',
          forcePathStyle: false,
        },
      },
    })
    const token = await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = JSON.parse(res.body)
    assert.equal(body.storage.s3.secretAccessKey, '********')
  })

  test('does not expose sessionSecret or passwordHash', async () => {
    const { app, settingsStore } = await createTestApp()
    const token = await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = JSON.parse(res.body)
    assert.ok(!body.auth?.sessionSecret)
    assert.ok(!body.auth?.local?.passwordHash)
  })
})

// ARR-SET-2
describe('PUT /api/settings', () => {
  test('persists new settings and returns { ok: true }', async () => {
    const { app, settingsStore } = await createTestApp()
    const token = await bootstrapAndGetToken(settingsStore)

    const newSettings = {
      services: [{ ...BASE_SERVICE, apiKey: 'new-key' }],
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
          secretAccessKey: '',
          forcePathStyle: false,
        },
      },
      schedule: { enabled: false, cron: '0 2 * * *' },
      retention: { enabled: false, keepLast: 10, keepDays: 0 },
    }

    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      payload: newSettings,
    })
    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).ok, true)

    // Verify the service was stored with the new key
    assert.equal(settingsStore.get().services[0].apiKey, 'new-key')
  })

  // ARR-SET-3 — sentinel preserves secret
  test('preserves existing apiKey when sentinel "********" is sent', async () => {
    const { app, settingsStore } = await createTestApp({ services: [BASE_SERVICE] })
    const token = await bootstrapAndGetToken(settingsStore)

    const withSentinel = {
      services: [{ ...BASE_SERVICE, apiKey: '********' }],
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
          secretAccessKey: '',
          forcePathStyle: false,
        },
      },
      schedule: { enabled: false, cron: '0 2 * * *' },
      retention: { enabled: false, keepLast: 10, keepDays: 0 },
    }

    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      payload: withSentinel,
    })

    assert.equal(settingsStore.get().services[0].apiKey, 'actual-api-key')
  })
})

// ARR-SET-4
describe('POST /api/settings/test-storage', () => {
  test('returns { ok: true } for storage type "none"', async () => {
    const { app, settingsStore } = await createTestApp()
    const token = await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/test-storage',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      payload: { storage: { type: 'none' } },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).ok, true)
  })

  test('returns { ok: false } for a local path not under /data/', async () => {
    const { app, settingsStore } = await createTestApp()
    const token = await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/test-storage',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      payload: { storage: { type: 'local', local: { path: '/tmp/bad-path' } } },
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.ok, false)
    assert.ok(body.error)
  })
})
