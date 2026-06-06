import { debug } from './debug.js'
import { hashPassword, verifyPassword, getOidcClient, generators, signJwt, verifyJwt } from './auth.js'

// Temporary server-side store for OIDC state/nonce during the OAuth redirect flow.
// Entries are short-lived (seconds) and pruned after 10 minutes.
const oidcFlows = new Map()

function pruneOidcFlows() {
  const cutoff = Date.now() - 10 * 60 * 1000
  for (const [state, flow] of oidcFlows) {
    if (flow.createdAt < cutoff) oidcFlows.delete(state)
  }
}

function bearerToken(req) {
  const h = req.headers.authorization
  return h?.startsWith('Bearer ') ? h.slice(7) : null
}

export async function registerAuthRoutes(app, { settingsStore }) {
  function secret() {
    return settingsStore.get().auth.sessionSecret
  }

  // GET /api/auth/status — public; verifies token if present
  app.get('/api/auth/status', async (req) => {
    const { auth } = settingsStore.get()
    const bootstrapped = Boolean(auth.local.passwordHash)
    const oidcEnabled = Boolean(auth.oidc.enabled && auth.oidc.issuer && auth.oidc.clientId)
    let authenticated = false
    let username = null
    const token = bearerToken(req)
    if (token) {
      try {
        verifyJwt(token, auth.sessionSecret)
        authenticated = true
        username = auth.local.username || 'admin'
      } catch { /* expired or invalid */ }
    }
    debug('auth', `status: authenticated=${authenticated} bootstrapped=${bootstrapped} oidcEnabled=${oidcEnabled}`)
    return { authenticated, bootstrapped, oidcEnabled, username }
  })

  // POST /api/auth/bootstrap — set admin credentials; only works before any password is set
  app.post('/api/auth/bootstrap', { config: { rateLimit: { max: 5, timeWindow: 60 * 1000 } } }, async (req, reply) => {
    const { auth } = settingsStore.get()
    if (auth.local.passwordHash) {
      debug('auth', 'bootstrap rejected — already bootstrapped')
      return reply.code(409).send({ error: 'Already set up' })
    }
    const { username, password } = req.body ?? {}
    const trimmedUsername = (username || '').trim()
    if (!trimmedUsername) return reply.code(400).send({ error: 'Username is required' })
    if (!password || password.length < 8) return reply.code(400).send({ error: 'Password must be at least 8 characters' })
    const passwordHash = await hashPassword(password)
    settingsStore.save({ auth: { local: { username: trimmedUsername, passwordHash } } })
    const token = signJwt({ method: 'local' }, secret())
    debug('auth', `bootstrap complete — username="${trimmedUsername}"`)
    return reply.send({ ok: true, token })
  })

  // POST /api/auth/login
  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: 60 * 1000 } } }, async (req, reply) => {
    const { auth } = settingsStore.get()
    if (!auth.local.passwordHash) return reply.code(403).send({ error: 'App not set up yet' })
    const { username, password } = req.body ?? {}
    if (!password) return reply.code(400).send({ error: 'Password required' })
    const storedUsername = auth.local.username
    if (storedUsername && username?.trim().toLowerCase() !== storedUsername.toLowerCase()) {
      debug('auth', 'login failed — wrong username')
      return reply.code(401).send({ error: 'Incorrect username or password' })
    }
    const ok = await verifyPassword(password, auth.local.passwordHash)
    if (!ok) {
      debug('auth', 'login failed — wrong password')
      return reply.code(401).send({ error: 'Incorrect username or password' })
    }
    const token = signJwt({ method: 'local' }, secret())
    debug('auth', `local login successful — username="${storedUsername}"`)
    return reply.send({ ok: true, token })
  })

  // POST /api/auth/change-password — requires valid token (exempt from preHandler, so we check manually)
  app.post('/api/auth/change-password', { config: { rateLimit: { max: 5, timeWindow: 60 * 1000 } } }, async (req, reply) => {
    const token = bearerToken(req)
    if (!token) return reply.code(401).send({ error: 'Unauthorized' })
    try { verifyJwt(token, secret()) } catch { return reply.code(401).send({ error: 'Unauthorized' }) }
    const { auth } = settingsStore.get()
    const { currentPassword, newPassword } = req.body ?? {}
    if (!currentPassword || !newPassword) return reply.code(400).send({ error: 'currentPassword and newPassword are required' })
    if (newPassword.length < 8) return reply.code(400).send({ error: 'New password must be at least 8 characters' })
    const ok = await verifyPassword(currentPassword, auth.local.passwordHash)
    if (!ok) return reply.code(401).send({ error: 'Current password is incorrect' })
    const passwordHash = await hashPassword(newPassword)
    settingsStore.save({ auth: { local: { passwordHash } } })
    debug('auth', 'password changed successfully')
    return reply.send({ ok: true })
  })

  // POST /api/auth/change-username — requires valid token
  app.post('/api/auth/change-username', async (req, reply) => {
    const token = bearerToken(req)
    if (!token) return reply.code(401).send({ error: 'Unauthorized' })
    try { verifyJwt(token, secret()) } catch { return reply.code(401).send({ error: 'Unauthorized' }) }
    const { auth } = settingsStore.get()
    const { currentPassword, newUsername } = req.body ?? {}
    if (!currentPassword || !newUsername?.trim()) return reply.code(400).send({ error: 'currentPassword and newUsername are required' })
    const ok = await verifyPassword(currentPassword, auth.local.passwordHash)
    if (!ok) return reply.code(401).send({ error: 'Current password is incorrect' })
    settingsStore.save({ auth: { local: { username: newUsername.trim() } } })
    debug('auth', `username changed to "${newUsername.trim()}"`)
    return reply.send({ ok: true })
  })

  // GET /api/auth/oidc/login — redirect browser to OIDC provider
  app.get('/api/auth/oidc/login', async (req, reply) => {
    const { auth } = settingsStore.get()
    if (!auth.oidc.enabled || !auth.oidc.issuer || !auth.oidc.clientId) {
      return reply.code(404).send({ error: 'OIDC not configured' })
    }
    try {
      pruneOidcFlows()
      const client = await getOidcClient(auth.oidc)
      const state = generators.state()
      const nonce = generators.nonce()
      oidcFlows.set(state, { nonce, createdAt: Date.now() })
      const url = client.authorizationUrl({
        scope: auth.oidc.scopes || 'openid profile email',
        state,
        nonce,
      })
      debug('auth', 'OIDC: redirecting to provider')
      return reply.redirect(url)
    } catch (err) {
      debug('auth', `OIDC login error: ${err.message}`)
      return reply.redirect(`/?auth_error=${encodeURIComponent(`OIDC configuration error: ${err.message}`)}`)
    }
  })

  // GET /api/auth/oidc/callback — OIDC provider redirects here; issues JWT and redirects to /?token=
  app.get('/api/auth/oidc/callback', async (req, reply) => {
    const { auth } = settingsStore.get()
    if (!auth.oidc.enabled) return reply.code(404).send({ error: 'OIDC not enabled' })
    try {
      const client = await getOidcClient(auth.oidc)
      const params = client.callbackParams(req.raw)
      const flow = oidcFlows.get(params.state)
      if (!flow) {
        debug('auth', 'OIDC callback: state not found (expired or invalid)')
        return reply.redirect(`/?auth_error=${encodeURIComponent('OIDC state mismatch — please try again')}`)
      }
      oidcFlows.delete(params.state)
      await client.callback(auth.oidc.redirectUri, params, {
        state: params.state,
        nonce: flow.nonce,
      })
      const token = signJwt({ method: 'oidc' }, secret())
      debug('auth', 'OIDC callback successful — issuing JWT')
      return reply.redirect(`/?token=${encodeURIComponent(token)}`)
    } catch (err) {
      debug('auth', `OIDC callback error: ${err.message}`)
      return reply.redirect(`/?auth_error=${encodeURIComponent(err.message)}`)
    }
  })

  // POST /api/auth/logout — JWTs are stateless; client discards the token
  app.post('/api/auth/logout', async (req, reply) => {
    debug('auth', 'logout acknowledged')
    return reply.send({ ok: true })
  })
}
