import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp, bootstrapAndGetToken } from '../helpers/create-app.js'

// MEA-SET-1
describe('GET /api/settings', () => {
  test('masks Mealie token with ********', async () => {
    const { app, settingsStore } = await createTestApp({
      mealie: { url: 'http://mealie:9000', token: 'actual-secret-token' },
    })
    const token = await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.mealie.token, '********')
    assert.notEqual(body.mealie.token, 'actual-secret-token')
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
          prefix: 'mealie/',
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

// MEA-SET-2
describe('PUT /api/settings', () => {
  test('persists settings and returns { ok: true }', async () => {
    const { app, settingsStore } = await createTestApp()
    const token = await bootstrapAndGetToken(settingsStore)

    const payload = {
      mealie: { url: 'http://new-mealie:9000', token: 'newtoken' },
      storage: {
        type: 'none',
        local: { path: '/data/backups' },
        s3: {
          endpoint: '',
          bucket: '',
          region: 'us-east-1',
          prefix: 'mealie/',
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
      payload,
    })

    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).ok, true)
    assert.equal(settingsStore.get().mealie.url, 'http://new-mealie:9000')
  })

  // MEA-SET-3 — sentinel preserves token
  test('preserves existing token when sentinel "********" is sent', async () => {
    const { app, settingsStore } = await createTestApp({
      mealie: { url: 'http://mealie:9000', token: 'original-token' },
    })
    const token = await bootstrapAndGetToken(settingsStore)

    const payload = {
      mealie: { url: 'http://mealie:9000', token: '********' },
      storage: {
        type: 'none',
        local: { path: '/data/backups' },
        s3: { endpoint: '', bucket: '', region: 'us-east-1', prefix: 'mealie/', accessKeyId: '', secretAccessKey: '', forcePathStyle: false },
      },
      schedule: { enabled: false, cron: '0 2 * * *' },
      retention: { enabled: false, keepLast: 10, keepDays: 0 },
    }

    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      payload,
    })

    assert.equal(settingsStore.get().mealie.token, 'original-token')
  })
})
