import bcrypt from 'bcryptjs'
import { randomBytes, createHmac, timingSafeEqual } from 'crypto'
import { Issuer, generators } from 'openid-client'
import { debug } from './debug.js'

export { generators }

export function generateSessionSecret() {
  return randomBytes(32).toString('hex')
}

export async function hashPassword(password) {
  debug('auth', 'hashing password')
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}

export function signJwt(payload, secret, expiresInSeconds = 7 * 24 * 3600) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds })).toString('base64url')
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

export function verifyJwt(token, secret) {
  const parts = (token || '').split('.')
  if (parts.length !== 3) throw new Error('Invalid token format')
  const [header, body, sig] = parts
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  const sigBuf = Buffer.from(sig, 'base64url')
  const expBuf = Buffer.from(expected, 'base64url')
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid token signature')
  }
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString())
  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired')
  }
  return claims
}

let _oidcClient = null
let _oidcClientKey = null

export async function getOidcClient(oidc) {
  // Cache key includes all fields that affect the client — recreate if any change
  const key = `${oidc.issuer}|${oidc.clientId}|${oidc.clientSecret}|${oidc.redirectUri}`
  if (_oidcClient && _oidcClientKey === key) {
    debug('auth', 'reusing cached OIDC client')
    return _oidcClient
  }
  debug('auth', `discovering OIDC issuer: ${oidc.issuer}`)
  const issuer = await Issuer.discover(oidc.issuer)
  _oidcClient = new issuer.Client({
    client_id: oidc.clientId,
    client_secret: oidc.clientSecret,
    redirect_uris: [oidc.redirectUri],
    response_types: ['code'],
  })
  _oidcClientKey = key
  debug('auth', 'OIDC client ready')
  return _oidcClient
}
