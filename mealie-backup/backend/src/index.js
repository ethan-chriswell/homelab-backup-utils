import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import staticPlugin from '@fastify/static'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import { existsSync, readFileSync } from 'fs'
import { loadConfig } from './config.js'
import { createSettingsStore } from './settings.js'
import { registerRoutes } from './routes.js'
import { isDebug, debug } from './debug.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const config = loadConfig()

if (isDebug) {
  console.log('[DEBUG] Debug mode enabled')
  console.log(`[DEBUG] Settings path: ${config.settingsPath}`)
  console.log(`[DEBUG] Port: ${config.port}`)
}

const settingsStore = createSettingsStore(config.settingsPath)

const app = Fastify({
  logger: {
    level: isDebug ? 'debug' : 'info',
  },
})

await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } })

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
