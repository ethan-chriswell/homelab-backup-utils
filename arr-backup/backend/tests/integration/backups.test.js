import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { MockAgent, setGlobalDispatcher, Agent } from 'undici'
import { createTestApp, bootstrapAndGetToken } from '../helpers/create-app.js'

// Fake ZIP magic bytes (PK\x03\x04) + padding
const VALID_ZIP = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00])
const INVALID_ZIP = Buffer.from('this is not a zip')

const SERVICE = {
  id: 'svc-radarr',
  name: 'Radarr',
  type: 'radarr',
  url: 'http://radarr.test:7878',
  apiKey: 'testapikey',
}

const FAKE_BACKUPS = [
  { id: 101, name: 'radarr_backup_2026-06-01.zip', time: '2026-06-01T02:00:00Z', size: 3145728, type: 'manual' },
  { id: 102, name: 'radarr_backup_2026-05-31.zip', time: '2026-05-31T02:00:00Z', size: 2621440, type: 'manual' },
]

let mockAgent

before(() => {
  mockAgent = new MockAgent()
  mockAgent.disableNetConnect()
  setGlobalDispatcher(mockAgent)
})

after(() => {
  setGlobalDispatcher(new Agent())
})

// ARR-BAK-1
describe('GET /api/backups', () => {
  test('returns backups from all configured services with serviceId attached', async () => {
    const pool = mockAgent.get('http://radarr.test:7878')
    pool.intercept({ path: '/api/v3/system/backup', method: 'GET' })
      .reply(200, JSON.stringify(FAKE_BACKUPS), { headers: { 'content-type': 'application/json' } })

    const { app, settingsStore } = await createTestApp({ services: [SERVICE] })
    const token = await bootstrapAndGetToken(settingsStore)

    const res = await app.inject({
      method: 'GET',
      url: '/api/backups',
      headers: { Authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.length, 2)
    assert.equal(body[0].serviceId, 'svc-radarr')
    assert.equal(body[0].serviceName, 'Radarr')
    assert.equal(body[0].serviceType, 'radarr')
  })

  // ARR-BAK-2
  test('includes an error entry when a service is unreachable', async () => {
    const pool = mockAgent.get('http://radarr.test:7878')
    pool.intercept({ path: '/api/v3/system/backup', method: 'GET' })
      .replyWithError(new Error('connection refused'))

    const { app, settingsStore } = await createTestApp({ services: [SERVICE] })
    const token = await bootstrapAndGetToken(settingsStore)

    const res = await app.inject({
      method: 'GET',
      url: '/api/backups',
      headers: { Authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.length, 1)
    assert.ok(body[0].error)
    assert.equal(body[0].serviceId, 'svc-radarr')
  })
})

// ARR-BAK-3
describe('POST /api/backups', () => {
  test('triggers backup for all services and returns 201', async () => {
    // createBackup POST
    const pool = mockAgent.get('http://radarr.test:7878')
    pool.intercept({ path: '/api/v3/command', method: 'POST' })
      .reply(201, JSON.stringify({ id: 1 }), { headers: { 'content-type': 'application/json' } })

    const { app, settingsStore } = await createTestApp({ services: [SERVICE] })
    const token = await bootstrapAndGetToken(settingsStore)

    const res = await app.inject({
      method: 'POST',
      url: '/api/backups',
      headers: { Authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 201)
    const body = JSON.parse(res.body)
    assert.ok(Array.isArray(body.results))
    assert.equal(body.results[0].serviceId, 'svc-radarr')
  })
})

// ARR-BAK-4
describe('POST /api/backups/:serviceId', () => {
  test('returns 404 when the serviceId does not exist', async () => {
    const { app, settingsStore } = await createTestApp({ services: [SERVICE] })
    const token = await bootstrapAndGetToken(settingsStore)

    const res = await app.inject({
      method: 'POST',
      url: '/api/backups/nonexistent-id',
      headers: { Authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 404)
  })
})

// ARR-BAK-5, ARR-BAK-6
describe('DELETE /api/backups/:serviceId/:id', () => {
  test('returns 204 on successful deletion', async () => {
    const pool = mockAgent.get('http://radarr.test:7878')
    // listBackups to find the backup name for secondary storage cascade
    pool.intercept({ path: '/api/v3/system/backup', method: 'GET' })
      .reply(200, JSON.stringify(FAKE_BACKUPS), { headers: { 'content-type': 'application/json' } })
    // deleteBackup
    pool.intercept({ path: '/api/v3/system/backup/101', method: 'DELETE' })
      .reply(200, '', { headers: { 'content-type': 'application/json' } })

    const { app, settingsStore } = await createTestApp({ services: [SERVICE] })
    const token = await bootstrapAndGetToken(settingsStore)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/backups/svc-radarr/101',
      headers: { Authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 204)
  })

  test('returns 404 when the serviceId does not exist', async () => {
    const { app, settingsStore } = await createTestApp({ services: [SERVICE] })
    const token = await bootstrapAndGetToken(settingsStore)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/backups/nonexistent/101',
      headers: { Authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 404)
  })
})

// ARR-BAK-7
describe('POST /api/backups/:serviceId/:id/restore', () => {
  test('returns { ok: true } on success', async () => {
    const pool = mockAgent.get('http://radarr.test:7878')
    pool.intercept({ path: '/api/v3/system/backup/restore/101', method: 'POST' })
      .reply(200, JSON.stringify({}), { headers: { 'content-type': 'application/json' } })

    const { app, settingsStore } = await createTestApp({ services: [SERVICE] })
    const token = await bootstrapAndGetToken(settingsStore)

    const res = await app.inject({
      method: 'POST',
      url: '/api/backups/svc-radarr/101/restore',
      headers: { Authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).ok, true)
  })
})

// ARR-BAK-8, ARR-BAK-9, ARR-BAK-10
describe('POST /api/backups/upload', () => {
  async function multipartRequest(app, token, fields) {
    // Build a minimal multipart body manually
    const boundary = '----TestBoundary123'
    const parts = []
    for (const [name, value] of Object.entries(fields)) {
      if (value instanceof Buffer) {
        parts.push(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="test.zip"\r\nContent-Type: application/zip\r\n\r\n`
        )
        // Can't easily concat string + buffer here; return structured info instead
      }
    }
    return null // Signal to use app.inject with FormData approach
  }

  test('returns 400 when no serviceId field is provided', async () => {
    const { app, settingsStore } = await createTestApp({ services: [SERVICE] })
    const token = await bootstrapAndGetToken(settingsStore)

    // Build multipart with only a file, no serviceId
    const boundary = 'TestBoundary'
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="backup.zip"\r\nContent-Type: application/zip\r\n\r\n`),
      VALID_ZIP,
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
  })

  test('returns 400 for a file with a non-.zip extension', async () => {
    const { app, settingsStore } = await createTestApp({ services: [SERVICE] })
    const token = await bootstrapAndGetToken(settingsStore)

    const boundary = 'TestBoundary'
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="serviceId"\r\n\r\nsvc-radarr`),
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="backup.tar.gz"\r\nContent-Type: application/gzip\r\n\r\n`),
      Buffer.from('some content'),
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
    const { app, settingsStore } = await createTestApp({ services: [SERVICE] })
    const token = await bootstrapAndGetToken(settingsStore)

    const boundary = 'TestBoundary'
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="serviceId"\r\n\r\nsvc-radarr`),
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bad.zip"\r\nContent-Type: application/zip\r\n\r\n`),
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
