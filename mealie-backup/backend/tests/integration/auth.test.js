import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createTestApp, bootstrapAndGetToken } from '../helpers/create-app.js'

describe('GET /api/auth/status', () => {
  test('returns authenticated:false and bootstrapped:false on fresh install', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/auth/status' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.authenticated, false)
    assert.equal(body.bootstrapped, false)
  })
})

describe('POST /api/auth/bootstrap', () => {
  test('creates credentials and returns a JWT', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { username: 'admin', password: 'securepass1' },
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.equal(body.ok, true)
    assert.equal(body.token.split('.').length, 3)
  })

  test('returns 409 when already bootstrapped', async () => {
    const { app, settingsStore } = await createTestApp()
    await bootstrapAndGetToken(settingsStore)
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { username: 'admin', password: 'anotherpass1' },
    })
    assert.equal(res.statusCode, 409)
  })

  test('rejects passwords shorter than 8 characters', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { username: 'admin', password: 'short' },
    })
    assert.equal(res.statusCode, 400)
  })
})

describe('POST /api/auth/login', () => {
  test('returns JWT with valid credentials', async () => {
    const { app, settingsStore } = await createTestApp()
    await bootstrapAndGetToken(settingsStore, 'validpassword1')
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'validpassword1' },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).ok, true)
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
})

describe('auth guard on protected routes', () => {
  test('returns 401 without Authorization header', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/settings' })
    assert.equal(res.statusCode, 401)
  })

  test('returns 401 with an invalid token', async () => {
    const { app } = await createTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { Authorization: 'Bearer this.is.invalid' },
    })
    assert.equal(res.statusCode, 401)
  })

  test('allows valid token through', async () => {
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
