import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp } from '../helpers/create-app.js'

// MEA-HC-1
describe('GET /health', () => {
  test('returns 200 { ok: true } without authentication', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(JSON.parse(res.body), { ok: true })
  })
})

// MEA-HC-2, MEA-HC-3
describe('GET /api/config', () => {
  test('returns configured:false when url is blank', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/config' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.configured, false)
  })

  test('returns configured:false when token is blank', async () => {
    const { app } = await createTestApp({ mealie: { url: 'http://mealie:9000', token: '' } })
    const res = await app.inject({ method: 'GET', url: '/api/config' })
    assert.equal(JSON.parse(res.body).configured, false)
  })

  test('returns configured:true with mealieUrl and storageType when both are set', async () => {
    const { app } = await createTestApp({
      mealie: { url: 'http://mealie:9000', token: 'mytoken' },
    })
    const res = await app.inject({ method: 'GET', url: '/api/config' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.configured, true)
    assert.equal(body.mealieUrl, 'http://mealie:9000')
    assert.ok('storageType' in body)
  })

  test('requires no authentication', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/config' })
    assert.notEqual(res.statusCode, 401)
  })
})
