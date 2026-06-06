import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { MockAgent, setGlobalDispatcher, Agent } from 'undici'
import { createTestApp, bootstrapAndGetToken } from '../helpers/create-app.js'

const VALID_ZIP = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00])
const INVALID_ZIP = Buffer.from('this is not a zip file at all')

const MEALIE_CONFIG = { mealie: { url: 'http://mealie.test:9000', token: 'secrettoken' } }

// Mealie API returns { imports: [...] } for listBackups
const FAKE_BACKUP_LIST = {
  imports: [
    { name: 'mealie_2026-06-01.zip', date: '2026-06-01T02:00:00+00:00', size: 2621440 },
    { name: 'mealie_2026-05-31.zip', date: '2026-05-31T02:00:00+00:00', size: 2097152 },
  ],
}

let mockAgent

before(() => {
  mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)
})

after(() => {
  setGlobalDispatcher(new Agent())
})

// MEA-ST-1, MEA-ST-2, MEA-ST-3
describe('GET /api/status', () => {
  test('returns "unconfigured" when url/token are blank', async () => {
    const { app, settingsStore } = await createTestApp()
    const token = await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).mealie, 'unconfigured')
  })

  test('returns "ok" when Mealie responds successfully', async () => {
    const pool = mockAgent.get('http://mealie.test:9000')
    pool.intercept({ path: '/api/admin/backups', method: 'GET' })
      .reply(200, JSON.stringify(FAKE_BACKUP_LIST), {
        headers: { 'content-type': 'application/json' },
      })

    const { app, settingsStore } = await createTestApp(MEALIE_CONFIG)
    const token = await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(JSON.parse(res.body).mealie, 'ok')
  })

  test('returns "error" when Mealie is unreachable', async () => {
    const pool = mockAgent.get('http://mealie.test:9000')
    pool.intercept({ path: '/api/admin/backups', method: 'GET' })
      .replyWithError(new Error('connection refused'))

    const { app, settingsStore } = await createTestApp(MEALIE_CONFIG)
    const token = await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(JSON.parse(res.body).mealie, 'error')
  })
})

// MEA-BAK-1
describe('GET /api/backups', () => {
  test('returns the backup list from Mealie', async () => {
    const pool = mockAgent.get('http://mealie.test:9000')
    pool.intercept({ path: '/api/admin/backups', method: 'GET' })
      .reply(200, JSON.stringify(FAKE_BACKUP_LIST), {
        headers: { 'content-type': 'application/json' },
      })

    const { app, settingsStore } = await createTestApp(MEALIE_CONFIG)
    const token = await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'GET',
      url: '/api/backups',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.ok(Array.isArray(body))
    assert.equal(body.length, 2)
  })
})

// MEA-BAK-2
describe('POST /api/backups', () => {
  test('triggers a backup and returns 201', async () => {
    const pool = mockAgent.get('http://mealie.test:9000')
    pool.intercept({ path: '/api/admin/backups', method: 'POST' })
      .reply(200, JSON.stringify({}), { headers: { 'content-type': 'application/json' } })
    // runCleanup also calls listBackups; reply with empty list so cleanup is a no-op
    pool.intercept({ path: '/api/admin/backups', method: 'GET' })
      .reply(200, JSON.stringify({ imports: [] }), { headers: { 'content-type': 'application/json' } })

    const { app, settingsStore } = await createTestApp(MEALIE_CONFIG)
    const token = await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'POST',
      url: '/api/backups',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.statusCode, 201)
    assert.equal(JSON.parse(res.body).ok, true)
  })
})

// MEA-BAK-3
describe('DELETE /api/backups/:name', () => {
  test('returns 204 on successful deletion', async () => {
    const pool = mockAgent.get('http://mealie.test:9000')
    pool.intercept({ path: '/api/admin/backups/mealie_2026-06-01.zip', method: 'DELETE' })
      .reply(200, '', {})

    const { app, settingsStore } = await createTestApp(MEALIE_CONFIG)
    const token = await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/backups/mealie_2026-06-01.zip',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.statusCode, 204)
  })
})

// MEA-BAK-4
describe('GET /api/backups/:name/download', () => {
  test('returns the file with Content-Type: application/zip', async () => {
    const pool = mockAgent.get('http://mealie.test:9000')
    // Step 1: get fileToken
    pool.intercept({ path: '/api/admin/backups/mealie_2026-06-01.zip', method: 'GET' })
      .reply(200, JSON.stringify({ fileToken: 'tok123' }), {
        headers: { 'content-type': 'application/json' },
      })
    // Step 2: download via fileToken
    pool.intercept({ path: '/api/utils/download?token=tok123', method: 'GET' })
      .reply(200, VALID_ZIP, { headers: { 'content-type': 'application/zip' } })

    const { app, settingsStore } = await createTestApp(MEALIE_CONFIG)
    const token = await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'GET',
      url: '/api/backups/mealie_2026-06-01.zip/download',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['content-type'], 'application/zip')
  })
})

// MEA-BAK-5, MEA-BAK-6
describe('POST /api/backups/upload', () => {
  test('returns 400 for a non-.zip filename', async () => {
    const { app, settingsStore } = await createTestApp(MEALIE_CONFIG)
    const token = await bootstrapAndGetToken(settingsStore)

    const boundary = 'TestBoundary'
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="backup.tar.gz"\r\nContent-Type: application/gzip\r\n\r\n`),
      Buffer.from('content'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])

    const res = await app.inject({
      method: 'POST',
      url: '/api/backups/upload',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    })
    assert.equal(res.statusCode, 400)
    assert.match(JSON.parse(res.body).error, /ZIP/)
  })

  test('returns 400 for a .zip file with invalid magic bytes', async () => {
    const { app, settingsStore } = await createTestApp(MEALIE_CONFIG)
    const token = await bootstrapAndGetToken(settingsStore)

    const boundary = 'TestBoundary'
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bad.zip"\r\nContent-Type: application/zip\r\n\r\n`),
      INVALID_ZIP,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])

    const res = await app.inject({
      method: 'POST',
      url: '/api/backups/upload',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    })
    assert.equal(res.statusCode, 400)
    assert.match(JSON.parse(res.body).error, /ZIP/)
  })
})
