import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { debug } from './debug.js'

export const DEFAULTS = {
  services: [],
  storage: {
    type: 'none',
    local: { path: '/data/backups' },
    s3: {
      endpoint: '',
      bucket: '',
      region: 'us-east-1',
      prefix: 'arr/',
      accessKeyId: '',
      secretAccessKey: '',
      forcePathStyle: false,
    },
  },
  schedules: [],
  schedule: {
    enabled: false,
    cron: '0 2 * * *',
  },
  retention: {
    enabled: false,
    keepLast: 10,
    keepDays: 0,
  },
  auth: {
    sessionSecret: '',
    local: {
      username: 'admin',
      passwordHash: '',
    },
    oidc: {
      enabled: false,
      issuer: '',
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      scopes: 'openid profile email',
    },
  },
}

function deepMerge(target, source) {
  const result = { ...target }
  for (const key of Object.keys(source ?? {})) {
    // services is an array — replace entirely, never deep-merge
    if (key === 'services') {
      result[key] = source[key]
    } else if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] ?? {}, source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

function inferTypeFromUrl(url) {
  const lower = (url || '').toLowerCase()
  if (lower.includes('sonarr')) return 'sonarr'
  if (lower.includes('radarr')) return 'radarr'
  if (lower.includes('prowlarr')) return 'prowlarr'
  if (lower.includes('readarr')) return 'readarr'
  if (lower.includes('lidarr')) return 'lidarr'
  if (lower.includes('whisparr')) return 'whisparr'
  if (lower.includes('bazarr')) return 'bazarr'
  if (lower.includes('jellyseerr') || lower.includes('overseerr') || lower.includes('seerr')) return 'seerr'
  if (lower.includes('maintainerr')) return 'maintainerr'
  return 'radarr'
}

export function createSettingsStore(path) {
  debug('settings', `settings file path: ${path}`)

  function load() {
    if (existsSync(path)) {
      debug('settings', `loading settings from ${path}`)
      try {
        const raw = JSON.parse(readFileSync(path, 'utf8'))
        const merged = deepMerge(DEFAULTS, raw)
        debug('settings', 'loaded settings', {
          servicesCount: merged.services.length,
          storageType: merged.storage.type,
          scheduleEnabled: merged.schedule.enabled,
          scheduleCron: merged.schedule.cron,
        })
        return merged
      } catch (err) {
        debug('settings', `failed to parse settings file: ${err.message} — using defaults`)
        return structuredClone(DEFAULTS)
      }
    }

    debug('settings', 'no settings file found — seeding from env vars')
    const seeded = structuredClone(DEFAULTS)

    // Seed a single service from env vars only on first boot (empty services array)
    if (process.env.ARR_SERVICE_URL && process.env.ARR_SERVICE_API_KEY) {
      const url = process.env.ARR_SERVICE_URL
      const apiKey = process.env.ARR_SERVICE_API_KEY
      const type = inferTypeFromUrl(url)
      seeded.services = [{
        id: crypto.randomUUID(),
        name: 'My Service',
        type,
        url,
        apiKey,
      }]
      debug('settings', `seeded service from env: url=${url} type=${type}`)
    }

    debug('settings', 'seeded defaults', { servicesCount: seeded.services.length })
    return seeded
  }

  let current = load()

  return {
    get() {
      return current
    },
    save(updates) {
      debug('settings', 'saving settings', {
        servicesCount: updates.services?.length,
        storageType: updates.storage?.type,
        scheduleEnabled: updates.schedule?.enabled,
        scheduleCron: updates.schedule?.cron,
      })
      current = deepMerge(current, updates)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify(current, null, 2))
      debug('settings', `settings written to ${path}`)
      return current
    },
  }
}
