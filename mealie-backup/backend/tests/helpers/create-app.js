import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import helmet from '@fastify/helmet'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { createSettingsStore } from '../../src/settings.js'
import { generateSessionSecret, signJwt, hashPassword } from '../../../../common/backend/src/auth.js'
import { registerAuthRoutes } from '../../../../common/backend/src/authRoutes.js'
import { registerRoutes } from '../../src/routes.js'

export async function createTestApp(settingsOverrides = {}) {
  const settingsPath = join(tmpdir(), `mealie-test-${randomBytes(8).toString('hex')}.json`)
  const settingsStore = createSettingsStore(settingsPath)

  if (Object.keys(settingsOverrides).length > 0) {
    settingsStore.save(settingsOverrides)
  }

  if (!settingsStore.get().auth.sessionSecret) {
    settingsStore.save({ auth: { sessionSecret: generateSessionSecret() } })
  }

  const app = Fastify({ logger: false })

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
  await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } })
  await app.register(rateLimit, { global: false })

  await registerAuthRoutes(app, { settingsStore })
  await registerRoutes(app, { settingsStore })

  await app.ready()

  return { app, settingsStore }
}

export async function bootstrapAndGetToken(settingsStore, password = 'testpassword1') {
  const passwordHash = await hashPassword(password)
  settingsStore.save({ auth: { local: { username: 'admin', passwordHash } } })
  return signJwt({ method: 'local' }, settingsStore.get().auth.sessionSecret)
}
