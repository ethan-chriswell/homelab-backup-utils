import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
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
