import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { generateSessionSecret, hashPassword, verifyPassword, signJwt, verifyJwt } from '../../src/auth.js'

// AUTH-1, AUTH-2
describe('generateSessionSecret', () => {
  test('returns a 64-char lowercase hex string', () => {
    const s = generateSessionSecret()
    assert.equal(typeof s, 'string')
    assert.equal(s.length, 64)
    assert.match(s, /^[0-9a-f]+$/)
  })

  test('each call returns a unique value', () => {
    const a = generateSessionSecret()
    const b = generateSessionSecret()
    assert.notEqual(a, b)
  })
})

// AUTH-3, AUTH-4, AUTH-5
describe('hashPassword / verifyPassword', () => {
  test('verifyPassword returns true for the correct password', async () => {
    const hash = await hashPassword('correct-horse-battery')
    assert.ok(await verifyPassword('correct-horse-battery', hash))
  })

  test('verifyPassword returns false for the wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery')
    assert.equal(await verifyPassword('wrong-password', hash), false)
  })

  test('hash is not the plaintext password', async () => {
    const hash = await hashPassword('my-secret')
    assert.notEqual(hash, 'my-secret')
  })

  test('hash is a bcrypt string', async () => {
    const hash = await hashPassword('my-secret')
    assert.match(hash, /^\$2[ab]\$/)
  })
})

// AUTH-6 through AUTH-11
describe('signJwt / verifyJwt', () => {
  const SECRET = 'test-secret-key-0123456789abcdef0123456789ab'

  test('round-trips payload claims', () => {
    const token = signJwt({ user: 'alice', method: 'local' }, SECRET)
    const claims = verifyJwt(token, SECRET)
    assert.equal(claims.user, 'alice')
    assert.equal(claims.method, 'local')
  })

  test('token contains iat and exp', () => {
    const before = Math.floor(Date.now() / 1000)
    const token = signJwt({ user: 'alice' }, SECRET)
    const claims = verifyJwt(token, SECRET)
    assert.ok(claims.iat >= before)
    assert.ok(claims.exp > claims.iat)
  })

  test('default expiry is 7 days', () => {
    const token = signJwt({ user: 'alice' }, SECRET)
    const claims = verifyJwt(token, SECRET)
    const sevenDays = 7 * 24 * 3600
    assert.ok(Math.abs((claims.exp - claims.iat) - sevenDays) <= 1)
  })

  test('custom expiry is respected', () => {
    const token = signJwt({ user: 'alice' }, SECRET, 3600)
    const claims = verifyJwt(token, SECRET)
    assert.ok(claims.exp - claims.iat <= 3601)
    assert.ok(claims.exp - claims.iat >= 3599)
  })

  test('wrong secret throws Invalid token signature', () => {
    const token = signJwt({ user: 'alice' }, SECRET)
    assert.throws(
      () => verifyJwt(token, 'different-secret'),
      /Invalid token signature/
    )
  })

  test('expired token throws Token expired', () => {
    const token = signJwt({ user: 'alice' }, SECRET, -1)
    assert.throws(() => verifyJwt(token, SECRET), /Token expired/)
  })

  test('token with wrong segment count throws', () => {
    assert.throws(() => verifyJwt('only.two', SECRET), /Invalid token format/)
    assert.throws(() => verifyJwt('a.b.c.d', SECRET), /Invalid token format/)
  })

  test('empty string token throws', () => {
    assert.throws(() => verifyJwt('', SECRET), /Invalid token format/)
  })

  test('null token throws', () => {
    assert.throws(() => verifyJwt(null, SECRET), /Invalid token format/)
  })
})
