import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import session from '@fastify/session'
import multipart from '@fastify/multipart'
import staticPlugin from '@fastify/static'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import { existsSync, readFileSync } from 'fs'
import { loadConfig } from '../../../common/backend/src/config.js'
import { createSettingsStore } from './settings.js'
import { generateSessionSecret } from '../../../common/backend/src/auth.js'
import { registerAuthRoutes } from '../../../common/backend/src/authRoutes.js'
import { registerRoutes } from './routes.js'
import { isDebug, debug } from '../../../common/backend/src/debug.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const config = loadConfig()

if (isDebug) {
  console.log('[DEBUG] Debug mode enabled')
  console.log(`[DEBUG] Settings path: ${config.settingsPath}`)
  console.log(`[DEBUG] Port: ${config.port}`)
}

const settingsStore = createSettingsStore(config.settingsPath)

// Auto-generate and persist session secret on first boot
let currentSettings = settingsStore.get()
if (!currentSettings.auth.sessionSecret) {
  const sessionSecret = generateSessionSecret()
  settingsStore.save({ auth: { sessionSecret } })
  currentSettings = settingsStore.get()
  debug('server', 'generated and persisted session secret')
}

const app = Fastify({
  logger: {
    level: isDebug ? 'debug' : 'info',
  },
})

await app.register(cookie)
await app.register(session, {
  secret: currentSettings.auth.sessionSecret,
  cookie: {
    httpOnly: true,
    secure: false, // homelab: typically HTTP behind a reverse proxy
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  saveUninitialized: false,
})

await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } })

debug('server', 'registering auth routes')
await registerAuthRoutes(app, { settingsStore })

debug('server', 'registering API routes')
await registerRoutes(app, { settingsStore })
debug('server', 'API routes registered')

const frontendDist = join(__dirname, '../../frontend/dist')
debug('server', `frontend dist path: ${frontendDist}`)

if (existsSync(frontendDist)) {
  debug('server', 'frontend dist found — mounting static assets and SPA fallback')

  const assetsDir = join(frontendDist, 'assets')
  if (existsSync(assetsDir)) {
    debug('server', `mounting /assets/ → ${assetsDir}`)
    await app.register(staticPlugin, {
      root: assetsDir,
      prefix: '/assets/',
      decorateReply: false,
    })
  }

  const indexHtml = readFileSync(join(frontendDist, 'index.html'))
  debug('server', `index.html loaded (${indexHtml.length} bytes)`)

  app.setNotFoundHandler((req, reply) => {
    debug('server', `not-found handler: ${req.method} ${req.url}`)
    if (req.url.startsWith('/api')) {
      return reply.code(404).send({ error: 'Not found' })
    }
    return reply.type('text/html').send(indexHtml)
  })
} else {
  debug('server', 'frontend dist NOT found — serving API only')
  app.log.warn('Frontend dist not found; serving API only. Run `npm run build` in frontend/ to include the UI.')
}

const address = await app.listen({ port: config.port, host: '0.0.0.0' })
app.log.info(`Server listening on ${address}`)
debug('server', `startup complete — listening on ${address}`)
