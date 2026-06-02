import { createMealieClient } from './mealie.js'
import { createStorage } from './storage.js'
import { updateSchedule } from './scheduler.js'
import { debug, maskToken } from './debug.js'

function computeToDelete(backups, retention) {
  const { keepLast, keepDays } = retention
  const hasCountRule = keepLast > 0
  const hasAgeRule = keepDays > 0
  if (!hasCountRule && !hasAgeRule) return []
  const cutoff = hasAgeRule ? new Date(Date.now() - keepDays * 86_400_000) : null
  // backups is sorted newest-first; a backup is deleted only if all active rules say delete it
  return backups.filter((backup, index) => {
    const savedByCount = hasCountRule && index < keepLast
    const savedByAge = hasAgeRule && new Date(backup.date) >= cutoff
    return !savedByCount && !savedByAge
  })
}

export async function registerRoutes(app, { settingsStore }) {
  // Auth guard — all /api/* routes except /api/auth/* and /api/config (Docker healthcheck)
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return
    const exempt = req.url === '/api/config' || req.url.startsWith('/api/auth/')
    if (exempt) return
    if (!req.session?.authenticated) {
      debug('routes', `auth guard: blocked ${req.method} ${req.url}`)
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  function getMealie() {
    const { mealie } = settingsStore.get()
    debug('routes', `getMealie: url=${mealie.url} token=${maskToken(mealie.token)}`)
    return createMealieClient(mealie.url, mealie.token)
  }

  function getStorage() {
    const { storage } = settingsStore.get()
    debug('routes', `getStorage: type=${storage.type}`)
    return createStorage({
      storageType: storage.type,
      localPath: storage.local.path,
      s3: storage.s3,
    })
  }

  async function runCleanup() {
    const { retention, storage: storageConfig } = settingsStore.get()
    debug('routes', 'runCleanup: starting')
    if (!retention.enabled) {
      debug('routes', 'runCleanup: retention disabled — skipping')
      return { mealieDeleted: [], storageDeleted: [] }
    }

    debug('routes', `runCleanup: policy keepLast=${retention.keepLast} keepDays=${retention.keepDays}`)

    // Clean Mealie-side backups (always, regardless of secondary storage config)
    const mealie = getMealie()
    const mealieBackups = (await mealie.listBackups())
      .sort((a, b) => new Date(b.date) - new Date(a.date))
    debug('routes', `runCleanup: ${mealieBackups.length} backup(s) in Mealie`)
    const mealieToDelete = computeToDelete(mealieBackups, retention)
    debug('routes', `runCleanup: ${mealieToDelete.length} Mealie backup(s) to delete`)
    for (const backup of mealieToDelete) {
      debug('routes', `runCleanup: deleting from Mealie: ${backup.name}`)
      await mealie.deleteBackup(backup.name)
    }
    const mealieDeleted = mealieToDelete.map(b => b.name)

    // Clean secondary storage backups (if configured)
    let storageDeleted = []
    if (storageConfig.type !== 'none') {
      const storage = getStorage()
      const storageBackups = await storage.list()
      debug('routes', `runCleanup: ${storageBackups.length} backup(s) in secondary storage`)
      const storageToDelete = computeToDelete(storageBackups, retention)
      debug('routes', `runCleanup: ${storageToDelete.length} storage backup(s) to delete`)
      for (const backup of storageToDelete) {
        debug('routes', `runCleanup: deleting from storage: ${backup.name}`)
        await storage.delete(backup.name)
      }
      storageDeleted = storageToDelete.map(b => b.name)
    }

    const totalDeleted = mealieDeleted.length + storageDeleted.length
    if (totalDeleted > 0) {
      app.log.info(`Retention cleanup: removed ${totalDeleted} backup(s) (${mealieDeleted.length} from Mealie, ${storageDeleted.length} from storage)`)
    }
    debug('routes', 'runCleanup: done')
    return { mealieDeleted, storageDeleted }
  }

  async function runBackup() {
    const settings = settingsStore.get()
    debug('routes', 'runBackup: starting')
    debug('routes', `runBackup: mealieUrl=${settings.mealie.url} storageType=${settings.storage.type}`)

    const mealie = getMealie()
    const storage = getStorage()

    await mealie.createBackup()
    debug('routes', 'runBackup: backup created in Mealie')

    if (settings.storage.type !== 'none') {
      debug('routes', 'runBackup: syncing latest backup to secondary storage')
      const backups = await mealie.listBackups()
      if (backups.length > 0) {
        const latest = backups.sort((a, b) => new Date(b.date) - new Date(a.date))[0]
        debug('routes', `runBackup: downloading latest backup: ${latest.name}`)
        const dlRes = await mealie.downloadBackup(latest.name)
        const buf = Buffer.from(await dlRes.arrayBuffer())
        debug('routes', `runBackup: saving ${latest.name} (${buf.length} bytes) to secondary storage`)
        await storage.save(latest.name, buf)
        debug('routes', `runBackup: secondary storage sync complete`)
      } else {
        debug('routes', 'runBackup: no backups found to sync to secondary storage')
      }
    } else {
      debug('routes', 'runBackup: secondary storage disabled, skipping sync')
    }

    app.log.info('Backup completed')
    debug('routes', 'runBackup: done')
  }

  function scheduleWrapper() {
    return async () => {
      debug('routes', 'scheduled backup triggered by cron')
      try {
        await runBackup()
        await runCleanup()
      } catch (err) {
        app.log.error(`Scheduled backup failed: ${err.message}`)
        debug('routes', `scheduled backup error: ${err.message}`)
      }
    }
  }

  // ── Test connection ───────────────────────────────────────────────────────
  app.post('/api/settings/test', async (req, reply) => {
    const current = settingsStore.get()
    const body = req.body ?? {}
    const testUrl = (body.url || current.mealie.url || '').trim()
    const testToken = (!body.token || body.token === '********')
      ? current.mealie.token
      : body.token

    debug('routes', `test connection: url=${testUrl} token=${maskToken(testToken)}`)

    if (!testUrl || !testToken) {
      debug('routes', 'test connection: missing url or token')
      return reply.send({ ok: false, error: 'URL and token are required' })
    }

    try {
      const client = createMealieClient(testUrl, testToken)
      const backups = await client.listBackups()
      debug('routes', `test connection: success — ${backups.length} backup(s) visible`)
      return reply.send({ ok: true })
    } catch (err) {
      debug('routes', `test connection: failed — ${err.message}`)
      return reply.send({ ok: false, error: err.message })
    }
  })

  // ── Settings ─────────────────────────────────────────────────────────────
  app.get('/api/settings', async () => {
    debug('routes', 'GET /api/settings')
    const s = settingsStore.get()
    return {
      ...s,
      mealie: { ...s.mealie, token: s.mealie.token ? '********' : '' },
      storage: {
        ...s.storage,
        s3: { ...s.storage.s3, secretAccessKey: s.storage.s3.secretAccessKey ? '********' : '' },
      },
      // Mask secrets; never expose sessionSecret or passwordHash
      auth: {
        local: { configured: Boolean(s.auth.local.passwordHash) },
        oidc: { ...s.auth.oidc, clientSecret: s.auth.oidc.clientSecret ? '********' : '' },
      },
    }
  })

  app.put('/api/settings', async (req, reply) => {
    debug('routes', 'PUT /api/settings', {
      mealieUrl: req.body?.mealie?.url,
      storageType: req.body?.storage?.type,
      scheduleEnabled: req.body?.schedule?.enabled,
      scheduleCron: req.body?.schedule?.cron,
    })

    const body = req.body
    const current = settingsStore.get()

    const token = body.mealie?.token === '********' ? current.mealie.token : (body.mealie?.token ?? current.mealie.token)
    const secretKey = body.storage?.s3?.secretAccessKey === '********'
      ? current.storage.s3.secretAccessKey
      : (body.storage?.s3?.secretAccessKey ?? current.storage.s3.secretAccessKey)
    const oidcSecret = body.auth?.oidc?.clientSecret === '********'
      ? current.auth.oidc.clientSecret
      : (body.auth?.oidc?.clientSecret ?? current.auth.oidc.clientSecret)

    const merged = {
      mealie: { ...body.mealie, token },
      storage: { ...body.storage, s3: { ...body.storage?.s3, secretAccessKey: secretKey } },
      schedule: body.schedule,
      retention: body.retention,
      // Only allow updating OIDC config; sessionSecret and passwordHash are managed by auth routes
      auth: body.auth ? { oidc: { ...body.auth.oidc, clientSecret: oidcSecret } } : undefined,
    }

    const saved = settingsStore.save(merged)
    debug('routes', 'settings saved — updating scheduler')
    updateSchedule(saved.schedule, scheduleWrapper(), app.log)
    return reply.send({ ok: true })
  })

  // ── Config ────────────────────────────────────────────────────────────────
  app.get('/api/config', async () => {
    const s = settingsStore.get()
    const result = {
      storageType: s.storage.type,
      mealieUrl: s.mealie.url,
      configured: Boolean(s.mealie.url && s.mealie.token),
    }
    debug('routes', 'GET /api/config', result)
    return result
  })

  // ── Backups ───────────────────────────────────────────────────────────────
  app.get('/api/backups', async (req, reply) => {
    debug('routes', 'GET /api/backups')
    try {
      const backups = await getMealie().listBackups()
      debug('routes', `GET /api/backups: returning ${backups.length} backup(s)`)
      return reply.send(backups)
    } catch (err) {
      debug('routes', `GET /api/backups error: ${err.message}`)
      return reply.code(err.status || 502).send({ error: err.message })
    }
  })

  app.post('/api/backups', async (req, reply) => {
    debug('routes', 'POST /api/backups (manual trigger)')
    try {
      await runBackup()
      await runCleanup()
      return reply.code(201).send({ ok: true })
    } catch (err) {
      debug('routes', `POST /api/backups error: ${err.message}`)
      return reply.code(err.status || 502).send({ error: err.message })
    }
  })

  app.get('/api/backups/:name/download', async (req, reply) => {
    const { name } = req.params
    debug('routes', `GET /api/backups/${name}/download`)
    try {
      const dlRes = await getMealie().downloadBackup(name)
      // Buffer the full response before sending — avoids web-stream → node-stream
      // conversion issues that can silently truncate the file
      const buf = Buffer.from(await dlRes.arrayBuffer())
      debug('routes', `download buffered: ${buf.length} bytes`)
      reply.header('Content-Type', 'application/zip')
      reply.header('Content-Disposition', `attachment; filename="${name}"`)
      reply.header('Content-Length', buf.length)
      return reply.send(buf)
    } catch (err) {
      debug('routes', `download error: ${err.message}`)
      return reply.code(err.status || 502).send({ error: err.message })
    }
  })

  app.delete('/api/backups/:name', async (req, reply) => {
    debug('routes', `DELETE /api/backups/${req.params.name}`)
    try {
      await getMealie().deleteBackup(req.params.name)
      debug('routes', `DELETE /api/backups/${req.params.name} ok`)
      return reply.code(204).send()
    } catch (err) {
      debug('routes', `delete error: ${err.message}`)
      return reply.code(err.status || 502).send({ error: err.message })
    }
  })

  app.post('/api/backups/:name/restore', async (req, reply) => {
    debug('routes', `POST /api/backups/${req.params.name}/restore`)
    try {
      return reply.send(await getMealie().restoreBackup(req.params.name))
    } catch (err) {
      debug('routes', `restore error: ${err.message}`)
      return reply.code(err.status || 502).send({ error: err.message })
    }
  })

  app.post('/api/backups/upload', async (req, reply) => {
    debug('routes', 'POST /api/backups/upload')
    try {
      const data = await req.file()
      if (!data) return reply.code(400).send({ error: 'No file uploaded' })
      debug('routes', `upload: filename=${data.filename} mimetype=${data.mimetype}`)
      const chunks = []
      for await (const chunk of data.file) chunks.push(chunk)
      const buffer = Buffer.concat(chunks)
      debug('routes', `upload: buffer size=${buffer.length}`)
      return reply.send(await getMealie().uploadBackup(data.filename, buffer))
    } catch (err) {
      debug('routes', `upload error: ${err.message}`)
      return reply.code(err.status || 502).send({ error: err.message })
    }
  })

  // ── Secondary storage ─────────────────────────────────────────────────────
  app.post('/api/storage/cleanup', async (req, reply) => {
    debug('routes', 'POST /api/storage/cleanup (manual trigger)')
    try {
      const result = await runCleanup()
      return reply.send(result)
    } catch (err) {
      debug('routes', `storage cleanup error: ${err.message}`)
      return reply.code(err.status || 500).send({ error: err.message })
    }
  })

  app.get('/api/storage/backups', async (req, reply) => {
    debug('routes', 'GET /api/storage/backups')
    try {
      const backups = await getStorage().list()
      debug('routes', `GET /api/storage/backups: ${backups.length} backup(s)`)
      return reply.send(backups)
    } catch (err) {
      debug('routes', `storage list error: ${err.message}`)
      return reply.code(500).send({ error: err.message })
    }
  })

  app.get('/api/storage/backups/:name/download', async (req, reply) => {
    debug('routes', `GET /api/storage/backups/${req.params.name}/download`)
    try {
      const stream = await getStorage().getStream(req.params.name)
      reply.header('Content-Type', 'application/zip')
      reply.header('Content-Disposition', `attachment; filename="${req.params.name}"`)
      return reply.send(stream)
    } catch (err) {
      debug('routes', `storage download error: ${err.message}`)
      return reply.code(err.status || 500).send({ error: err.message })
    }
  })

  debug('routes', 'all routes registered')
  updateSchedule(settingsStore.get().schedule, scheduleWrapper(), app.log)
}
