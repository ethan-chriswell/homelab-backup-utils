import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp, bootstrapAndGetToken } from '../helpers/create-app.js'

// ARR-AUTH-1
describe('GET /api/auth/status', () => {
  test('returns authenticated:false and bootstrapped:false on a fresh install', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/auth/status' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.authenticated, false)
    assert.equal(body.bootstrapped, false)
  })

  test('returns bootstrapped:true after credentials are set', async () => {
    const { app, settingsStore } = await createTestApp()
    await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({ method: 'GET', url: '/api/auth/status' })
    const body = JSON.parse(res.body)
    assert.equal(body.bootstrapped, true)
  })
})

// ARR-AUTH-2
describe('POST /api/auth/bootstrap', () => {
  test('creates admin credentials and returns a JWT token', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { username: 'admin', password: 'securepass1' },
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.ok, true)
    assert.ok(typeof body.token === 'string')
    assert.ok(body.token.split('.').length === 3) // valid JWT
  })

  // ARR-AUTH-3
  test('returns 409 when credentials are already set', async () => {
    const { app, settingsStore } = await createTestApp()
    await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { username: 'admin', password: 'anotherpass1' },
    })
    assert.equal(res.statusCode, 409)
  })

  // ARR-AUTH-4
  test('rejects passwords shorter than 8 characters', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { username: 'admin', password: 'short' },
    })
    assert.equal(res.statusCode, 400)
  })

  test('rejects missing username', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { password: 'validpassword1' },
    })
    assert.equal(res.statusCode, 400)
  })
})

// ARR-AUTH-5, ARR-AUTH-6
describe('POST /api/auth/login', () => {
  test('returns a JWT with valid credentials', async () => {
    const { app, settingsStore } = await createTestApp()
    await bootstrapAndGetToken(settingsStore, 'validpassword1')
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'validpassword1' },
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.ok, true)
    assert.ok(typeof body.token === 'string')
  })

  test('returns 401 with wrong password', async () => {
    const { app, settingsStore } = await createTestApp()
    await bootstrapAndGetToken(settingsStore, 'validpassword1')
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'wrongpassword' },
    })
    assert.equal(res.statusCode, 401)
  })

  test('returns 401 with wrong username', async () => {
    const { app, settingsStore } = await createTestApp()
    await bootstrapAndGetToken(settingsStore, 'validpassword1')
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'notadmin', password: 'validpassword1' },
    })
    assert.equal(res.statusCode, 401)
  })
})

// ARR-AUTH-7, ARR-AUTH-8
describe('auth guard on protected routes', () => {
  test('returns 401 when no Authorization header is provided', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/settings' })
    assert.equal(res.statusCode, 401)
  })

  test('returns 401 when an invalid token is provided', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { Authorization: 'Bearer this.is.notvalid' },
    })
    assert.equal(res.statusCode, 401)
  })

  test('returns 401 when Authorization header lacks Bearer prefix', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    })
    assert.equal(res.statusCode, 401)
  })

  test('allows requests with a valid token through', async () => {
    const { app, settingsStore } = await createTestApp()
    const token = await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.notEqual(res.statusCode, 401)
  })
})
