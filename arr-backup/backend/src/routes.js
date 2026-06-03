import { createClient } from './arr.js'
import { createStorage } from './storage.js'
import { updateSchedules } from './scheduler.js'
import { debug } from './debug.js'

function computeToDelete(backups, retention) {
  const { keepLast, keepDays } = retention
  const hasCountRule = keepLast > 0
  const hasAgeRule = keepDays > 0
  if (!hasCountRule && !hasAgeRule) return []
  const cutoff = hasAgeRule ? new Date(Date.now() - keepDays * 86_400_000) : null
  // backups sorted newest-first; a backup is deleted only if ALL active rules say delete it
  return backups.filter((backup, index) => {
    const savedByCount = hasCountRule && index < keepLast
    const dateStr = backup.time || backup.date
    const savedByAge = hasAgeRule && dateStr && new Date(dateStr) >= cutoff
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

  function getServices() {
    return settingsStore.get().services || []
  }

  function getService(serviceId) {
    const service = getServices().find(s => s.id === serviceId)
    if (!service) throw Object.assign(new Error(`Service not found: ${serviceId}`), { status: 404 })
    return service
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

  // Storage prefix is organized by type/name/
  function storagePrefix(service) {
    return `${service.type}/${service.name}/`
  }

  async function runCleanupForService(service) {
    const settings = settingsStore.get()
    const retention = service.retention ?? settings.retention
    const storageConfig = settings.storage
    debug('routes', `runCleanupForService: ${service.name} (${service.id})`)
    if (!retention.enabled) {
      debug('routes', 'runCleanup: retention disabled — skipping')
      return { arrDeleted: [], storageDeleted: [] }
    }

    const client = createClient(service.type, service.url, service.apiKey)
    const arrBackups = (await client.listBackups())
      .sort((a, b) => new Date(b.time) - new Date(a.time))

    debug('routes', `runCleanup: ${arrBackups.length} backup(s) in service ${service.name}`)
    const arrToDelete = computeToDelete(arrBackups, retention)
    debug('routes', `runCleanup: ${arrToDelete.length} backup(s) to delete from ${service.name}`)
    for (const backup of arrToDelete) {
      debug('routes', `runCleanup: deleting from ${service.name}: id=${backup.id}`)
      await client.deleteBackup(backup.id)
    }
    const arrDeleted = arrToDelete.map(b => b.id)

    let storageDeleted = []
    if (storageConfig.type !== 'none') {
      // Storage uses per-service prefix
      const prefix = storagePrefix(service)
      const storage = createStorage({
        storageType: storageConfig.type,
        localPath: `${storageConfig.local.path}/${prefix}`,
        s3: { ...storageConfig.s3, prefix: `${storageConfig.s3.prefix}${prefix}` },
      })
      const storageBackups = await storage.list()
      debug('routes', `runCleanup: ${storageBackups.length} backup(s) in secondary storage for ${service.name}`)
      const storageToDelete = computeToDelete(storageBackups, retention)
      for (const backup of storageToDelete) {
        await storage.delete(backup.name)
      }
      storageDeleted = storageToDelete.map(b => b.name)
    }

    return { arrDeleted, storageDeleted }
  }

  async function runCleanup() {
    const services = getServices()
    const results = {}
    for (const service of services) {
      try {
        results[service.id] = await runCleanupForService(service)
      } catch (err) {
        debug('routes', `runCleanup: error for ${service.name}: ${err.message}`)
        results[service.id] = { error: err.message }
      }
    }
    return results
  }

  async function runBackupForService(service) {
    const { storage: storageConfig } = settingsStore.get()
    debug('routes', `runBackupForService: ${service.name}`)

    const client = createClient(service.type, service.url, service.apiKey)
    await client.createBackup()
    debug('routes', `runBackupForService: backup triggered for ${service.name}`)

    if (storageConfig.type !== 'none') {
      // Wait briefly for the backup to appear (arr runs async)
      await new Promise(r => setTimeout(r, 3000))
      const backups = await client.listBackups()
      if (backups.length > 0) {
        const latest = backups.sort((a, b) => new Date(b.time) - new Date(a.time))[0]
        debug('routes', `runBackupForService: syncing ${latest.name} to secondary storage`)
        const dlRes = await client.downloadBackup(latest.id)
        const buf = Buffer.from(await dlRes.arrayBuffer())
        const prefix = storagePrefix(service)
        const storage = createStorage({
          storageType: storageConfig.type,
          localPath: `${storageConfig.local.path}/${prefix}`,
          s3: { ...storageConfig.s3, prefix: `${storageConfig.s3.prefix}${prefix}` },
        })
        await storage.save(latest.name, buf)
        debug('routes', `runBackupForService: storage sync complete for ${service.name}`)
      }
    }

    app.log.info(`Backup completed for service: ${service.name}`)
    return { ok: true }
  }

  async function runAllBackups() {
    const services = getServices()
    const results = await Promise.allSettled(services.map(s => runBackupForService(s)))
    const mapped = services.map((s, i) => ({
      serviceId: s.id,
      ok: results[i].status === 'fulfilled',
      error: results[i].status === 'rejected' ? results[i].reason?.message : undefined,
    }))
    return mapped
  }

  function scheduleWrapper() {
    return async () => {
      debug('routes', 'scheduled backup triggered by cron')
      try {
        await runAllBackups()
        await runCleanup()
      } catch (err) {
        app.log.error(`Scheduled backup failed: ${err.message}`)
        debug('routes', `scheduled backup error: ${err.message}`)
      }
    }
  }

  function serviceScheduleWrapper() {
    return (serviceId) => {
      const service = getServices().find(s => s.id === serviceId)
      if (!service) {
        debug('routes', `scheduled service ${serviceId} not found — skipping`)
        return
      }
      debug('routes', `per-service scheduled backup triggered for ${service.name}`)
      runBackupForService(service)
        .then(() => runCleanupForService(service))
        .catch(err => app.log.error(`Scheduled backup failed for ${service.name}: ${err.message}`))
    }
  }

  function applySchedules(settings) {
    updateSchedules(
      { global: settings.schedule, services: settings.services },
      { onGlobal: scheduleWrapper(), onService: serviceScheduleWrapper() },
      app.log
    )
  }

  // ── Config ────────────────────────────────────────────────────────────────
  app.get('/api/config', async () => {
    const s = settingsStore.get()
    const result = { configured: s.services.length > 0 }
    debug('routes', 'GET /api/config', result)
    return result
  })

  // ── Status ────────────────────────────────────────────────────────────────
  app.get('/api/status', async (req, reply) => {
    const services = getServices()
    const results = await Promise.allSettled(
      services.map(async (s) => {
        try {
          await createClient(s.type, s.url, s.apiKey).ping()
          return { id: s.id, name: s.name, ok: true }
        } catch {
          return { id: s.id, name: s.name, ok: false }
        }
      })
    )
    return reply.send({
      services: results.map(r => r.value || { id: '', name: '', ok: false }),
    })
  })

  // ── Settings ─────────────────────────────────────────────────────────────
  app.get('/api/settings', async () => {
    debug('routes', 'GET /api/settings')
    const s = settingsStore.get()
    return {
      ...s,
      services: s.services.map(svc => ({ ...svc, apiKey: svc.apiKey ? '********' : '' })),
      storage: {
        ...s.storage,
        s3: { ...s.storage.s3, secretAccessKey: s.storage.s3.secretAccessKey ? '********' : '' },
      },
      auth: {
        local: { configured: Boolean(s.auth.local.passwordHash) },
        oidc: { ...s.auth.oidc, clientSecret: s.auth.oidc.clientSecret ? '********' : '' },
      },
    }
  })

  app.put('/api/settings', async (req, reply) => {
    debug('routes', 'PUT /api/settings', {
      servicesCount: req.body?.services?.length,
      storageType: req.body?.storage?.type,
      scheduleEnabled: req.body?.schedule?.enabled,
    })

    const body = req.body
    const current = settingsStore.get()

    // Unmask service apiKeys — '********' sentinel means keep existing
    const services = (body.services || []).map(svc => {
      if (svc.apiKey === '********') {
        const existing = current.services.find(s => s.id === svc.id)
        return { ...svc, apiKey: existing?.apiKey || '' }
      }
      return svc
    })

    const secretKey = body.storage?.s3?.secretAccessKey === '********'
      ? current.storage.s3.secretAccessKey
      : (body.storage?.s3?.secretAccessKey ?? current.storage.s3.secretAccessKey)
    const oidcSecret = body.auth?.oidc?.clientSecret === '********'
      ? current.auth.oidc.clientSecret
      : (body.auth?.oidc?.clientSecret ?? current.auth.oidc.clientSecret)

    const merged = {
      services,
      storage: { ...body.storage, s3: { ...body.storage?.s3, secretAccessKey: secretKey } },
      schedule: body.schedule,
      retention: body.retention,
      auth: body.auth ? { oidc: { ...body.auth.oidc, clientSecret: oidcSecret } } : undefined,
    }

    const saved = settingsStore.save(merged)
    debug('routes', 'settings saved — updating scheduler')
    applySchedules(saved)
    return reply.send({ ok: true })
  })

  // ── Test connection ───────────────────────────────────────────────────────
  app.post('/api/settings/test', async (req, reply) => {
    const { serviceId, url: directUrl, apiKey: directApiKey } = req.body ?? {}

    let url, apiKey, label
    if (serviceId) {
      const service = settingsStore.get().services.find(s => s.id === serviceId)
      if (!service) return reply.send({ ok: false, error: 'Service not found' })
      url = service.url
      apiKey = service.apiKey
      label = service.name
    } else if (directUrl) {
      url = directUrl
      apiKey = directApiKey || ''
      label = directUrl
    } else {
      return reply.send({ ok: false, error: 'serviceId or url is required' })
    }

    debug('routes', `test connection: ${label} url=${url}`)
    try {
      await createArrClient(url, apiKey).ping()
      debug('routes', `test connection: success for ${label}`)
      return reply.send({ ok: true })
    } catch (err) {
      debug('routes', `test connection: failed for ${label} — ${err.message}`)
      return reply.send({ ok: false, error: err.message })
    }
  })

  // ── Backups: list all ─────────────────────────────────────────────────────
  app.get('/api/backups', async (req, reply) => {
    debug('routes', 'GET /api/backups')
    const services = getServices()
    const results = await Promise.allSettled(
      services.map(async (s) => {
        const backups = await createClient(s.type, s.url, s.apiKey).listBackups()
        return backups.map(b => ({
          ...b,
          serviceId: s.id,
          serviceName: s.name,
          serviceType: s.type,
        }))
      })
    )

    const all = []
    results.forEach((r, i) => {
      const s = services[i]
      if (r.status === 'fulfilled') {
        all.push(...r.value)
      } else {
        all.push({
          serviceId: s.id,
          serviceName: s.name,
          serviceType: s.type,
          error: r.reason?.message || 'Unknown error',
        })
      }
    })

    return reply.send(all)
  })

  // ── Backups: backup ALL services ──────────────────────────────────────────
  app.post('/api/backups', async (req, reply) => {
    debug('routes', 'POST /api/backups (backup all)')
    try {
      const results = await runAllBackups()
      await runCleanup()
      return reply.code(201).send({ results })
    } catch (err) {
      debug('routes', `POST /api/backups error: ${err.message}`)
      return reply.code(err.status || 502).send({ error: err.message })
    }
  })

  // ── Backups: upload+restore (static path — must be before :serviceId param route) ──
  app.post('/api/backups/upload', async (req, reply) => {
    debug('routes', 'POST /api/backups/upload')
    try {
      const parts = req.parts()
      let serviceId = null
      let fileData = null

      for await (const part of parts) {
        if (part.fieldname === 'serviceId' && !part.file) {
          serviceId = part.value
        } else if (part.file) {
          const chunks = []
          for await (const chunk of part.file) chunks.push(chunk)
          fileData = { filename: part.filename, buffer: Buffer.concat(chunks) }
        }
      }

      if (!serviceId) return reply.code(400).send({ error: 'serviceId field is required' })
      if (!fileData) return reply.code(400).send({ error: 'No file uploaded' })

      const service = getService(serviceId)
      debug('routes', `upload: serviceId=${serviceId} filename=${fileData.filename} size=${fileData.buffer.length}`)
      await createClient(service.type, service.url, service.apiKey).uploadBackup(fileData.filename, fileData.buffer)
      return reply.send({ ok: true })
    } catch (err) {
      debug('routes', `upload error: ${err.message}`)
      return reply.code(err.status || 502).send({ error: err.message })
    }
  })

  // ── Backups: backup ONE service ───────────────────────────────────────────
  app.post('/api/backups/:serviceId', async (req, reply) => {
    const { serviceId } = req.params
    debug('routes', `POST /api/backups/${serviceId}`)
    try {
      const service = getService(serviceId)
      await runBackupForService(service)
      await runCleanupForService(service)
      return reply.code(201).send({ ok: true })
    } catch (err) {
      debug('routes', `POST /api/backups/${serviceId} error: ${err.message}`)
      return reply.code(err.status || 502).send({ error: err.message })
    }
  })

  // ── Backups: download ─────────────────────────────────────────────────────
  app.get('/api/backups/:serviceId/:id/download', async (req, reply) => {
    const { serviceId, id } = req.params
    debug('routes', `GET /api/backups/${serviceId}/${id}/download`)
    try {
      const service = getService(serviceId)
      const client = createClient(service.type, service.url, service.apiKey)
      const dlRes = await client.downloadBackup(id)
      const buf = Buffer.from(await dlRes.arrayBuffer())
      debug('routes', `download buffered: ${buf.length} bytes`)
      reply.header('Content-Type', 'application/zip')
      reply.header('Content-Disposition', `attachment; filename="backup-${id}.zip"`)
      reply.header('Content-Length', buf.length)
      return reply.send(buf)
    } catch (err) {
      debug('routes', `download error: ${err.message}`)
      return reply.code(err.status || 502).send({ error: err.message })
    }
  })

  // ── Backups: delete ───────────────────────────────────────────────────────
  app.delete('/api/backups/:serviceId/:id', async (req, reply) => {
    const { serviceId, id } = req.params
    debug('routes', `DELETE /api/backups/${serviceId}/${id}`)
    try {
      const service = getService(serviceId)
      await createClient(service.type, service.url, service.apiKey).deleteBackup(id)
      return reply.code(204).send()
    } catch (err) {
      debug('routes', `delete error: ${err.message}`)
      return reply.code(err.status || 502).send({ error: err.message })
    }
  })

  // ── Backups: restore ──────────────────────────────────────────────────────
  app.post('/api/backups/:serviceId/:id/restore', async (req, reply) => {
    const { serviceId, id } = req.params
    debug('routes', `POST /api/backups/${serviceId}/${id}/restore`)
    try {
      const service = getService(serviceId)
      await createClient(service.type, service.url, service.apiKey).restoreBackup(id)
      return reply.send({ ok: true })
    } catch (err) {
      debug('routes', `restore error: ${err.message}`)
      return reply.code(err.status || 502).send({ error: err.message })
    }
  })

  // ── Secondary storage ─────────────────────────────────────────────────────
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

  debug('routes', 'all routes registered')
  applySchedules(settingsStore.get())
}
