import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp } from '../helpers/create-app.js'

// ARR-HC-1, ARR-HC-2, ARR-HC-3, ARR-HC-4

describe('GET /health', () => {
  test('returns 200 { ok: true } without authentication', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(JSON.parse(res.body), { ok: true })
  })
})

describe('GET /api/config', () => {
  test('returns { configured: false } when no services are defined', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/config' })
    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).configured, false)
  })

  test('returns { configured: true } when at least one service is defined', async () => {
    const { app } = await createTestApp({
      services: [
        { id: 'svc-1', name: 'Radarr', type: 'radarr', url: 'http://radarr.test:7878', apiKey: 'key' },
      ],
    })
    const res = await app.inject({ method: 'GET', url: '/api/config' })
    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).configured, true)
  })

  test('requires no authentication', async () => {
    const { app } = await createTestApp()
    // No Authorization header — must still respond
    const res = await app.inject({ method: 'GET', url: '/api/config' })
    assert.notEqual(res.statusCode, 401)
  })
})
