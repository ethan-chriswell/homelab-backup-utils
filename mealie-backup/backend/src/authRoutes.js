import { debug } from './debug.js'
import { hashPassword, verifyPassword, getOidcClient, generators } from './auth.js'

export async function registerAuthRoutes(app, { settingsStore }) {
  // GET /api/auth/status — public, used by frontend to decide what to show
  app.get('/api/auth/status', async (req) => {
    const { auth } = settingsStore.get()
    const bootstrapped = Boolean(auth.local.passwordHash)
    const authenticated = Boolean(req.session?.authenticated)
    const oidcEnabled = Boolean(auth.oidc.enabled && auth.oidc.issuer && auth.oidc.clientId)
    debug('auth', `status: authenticated=${authenticated} bootstrapped=${bootstrapped} oidcEnabled=${oidcEnabled}`)
    return { authenticated, bootstrapped, oidcEnabled }
  })

  // POST /api/auth/bootstrap — set admin password; only works before any password is configured
  app.post('/api/auth/bootstrap', async (req, reply) => {
    const { auth } = settingsStore.get()
    if (auth.local.passwordHash) {
      debug('auth', 'bootstrap rejected — already bootstrapped')
      return reply.code(409).send({ error: 'Already set up' })
    }
    const { password } = req.body ?? {}
    if (!password || password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' })
    }
    const passwordHash = await hashPassword(password)
    settingsStore.save({ auth: { local: { passwordHash } } })
    req.session.authenticated = true
    req.session.method = 'local'
    debug('auth', 'bootstrap complete — admin password set and session created')
    return reply.send({ ok: true })
  })

  // POST /api/auth/login — local password login
  app.post('/api/auth/login', async (req, reply) => {
    const { auth } = settingsStore.get()
    if (!auth.local.passwordHash) {
      return reply.code(403).send({ error: 'App not set up yet' })
    }
    const { password } = req.body ?? {}
    if (!password) return reply.code(400).send({ error: 'Password required' })
    const ok = await verifyPassword(password, auth.local.passwordHash)
    if (!ok) {
      debug('auth', 'login failed — wrong password')
      return reply.code(401).send({ error: 'Incorrect password' })
    }
    req.session.authenticated = true
    req.session.method = 'local'
    debug('auth', 'local login successful')
    return reply.send({ ok: true })
  })

  // POST /api/auth/change-password — requires active session
  app.post('/api/auth/change-password', async (req, reply) => {
    if (!req.session?.authenticated) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
    const { auth } = settingsStore.get()
    const { currentPassword, newPassword } = req.body ?? {}
    if (!currentPassword || !newPassword) {
      return reply.code(400).send({ error: 'currentPassword and newPassword are required' })
    }
    if (newPassword.length < 8) {
      return reply.code(400).send({ error: 'New password must be at least 8 characters' })
    }
    const ok = await verifyPassword(currentPassword, auth.local.passwordHash)
    if (!ok) {
      return reply.code(401).send({ error: 'Current password is incorrect' })
    }
    const passwordHash = await hashPassword(newPassword)
    settingsStore.save({ auth: { local: { passwordHash } } })
    debug('auth', 'password changed successfully')
    return reply.send({ ok: true })
  })

  // GET /api/auth/oidc/login — redirect browser to OIDC provider
  app.get('/api/auth/oidc/login', async (req, reply) => {
    const { auth } = settingsStore.get()
    if (!auth.oidc.enabled || !auth.oidc.issuer || !auth.oidc.clientId) {
      return reply.code(404).send({ error: 'OIDC not configured' })
    }
    try {
      const client = await getOidcClient(auth.oidc)
      const state = generators.state()
      const nonce = generators.nonce()
      req.session.oidcState = state
      req.session.oidcNonce = nonce
      const url = client.authorizationUrl({
        scope: auth.oidc.scopes || 'openid profile email',
        state,
        nonce,
      })
      debug('auth', `OIDC: redirecting to provider`)
      return reply.redirect(url)
    } catch (err) {
      debug('auth', `OIDC login error: ${err.message}`)
      return reply.redirect(`/?auth_error=${encodeURIComponent(`OIDC configuration error: ${err.message}`)}`)
    }
  })

  // GET /api/auth/oidc/callback — OIDC provider redirects here after authentication
  app.get('/api/auth/oidc/callback', async (req, reply) => {
    const { auth } = settingsStore.get()
    if (!auth.oidc.enabled) {
      return reply.code(404).send({ error: 'OIDC not enabled' })
    }
    try {
      const client = await getOidcClient(auth.oidc)
      const params = client.callbackParams(req.raw)
      await client.callback(auth.oidc.redirectUri, params, {
        state: req.session.oidcState,
        nonce: req.session.oidcNonce,
      })
      delete req.session.oidcState
      delete req.session.oidcNonce
      req.session.authenticated = true
      req.session.method = 'oidc'
      debug('auth', 'OIDC callback successful — session created')
      return reply.redirect('/')
    } catch (err) {
      debug('auth', `OIDC callback error: ${err.message}`)
      return reply.redirect(`/?auth_error=${encodeURIComponent(err.message)}`)
    }
  })

  // POST /api/auth/logout
  app.post('/api/auth/logout', async (req, reply) => {
    await req.session.destroy()
    debug('auth', 'session destroyed')
    return reply.send({ ok: true })
  })
}
