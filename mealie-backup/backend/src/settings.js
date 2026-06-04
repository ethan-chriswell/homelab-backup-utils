import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { debug } from './debug.js'

export const DEFAULTS = {
  mealie: {
    url: '',
    token: '',
  },
  storage: {
    type: 'none',
    local: { path: '/data/backups' },
    s3: {
      endpoint: '',
      bucket: '',
      region: 'us-east-1',
      prefix: 'mealie/',
      accessKeyId: '',
      secretAccessKey: '',
      forcePathStyle: false,
    },
  },
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
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] ?? {}, source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
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
          mealieUrl: merged.mealie.url,
          mealieTokenSet: Boolean(merged.mealie.token),
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
    if (process.env.MEALIE_URL) {
      seeded.mealie.url = process.env.MEALIE_URL
      debug('settings', `seeded MEALIE_URL=${process.env.MEALIE_URL}`)
    }
    if (process.env.MEALIE_API_TOKEN) {
      seeded.mealie.token = process.env.MEALIE_API_TOKEN
      debug('settings', 'seeded MEALIE_API_TOKEN (value masked)')
    }
    debug('settings', 'seeded defaults', {
      mealieUrl: seeded.mealie.url,
      mealieTokenSet: Boolean(seeded.mealie.token),
    })
    return seeded
  }

  let current = load()

  return {
    get() {
      return current
    },
    save(updates) {
      debug('settings', 'saving settings', {
        mealieUrl: updates.mealie?.url,
        mealieTokenSet: Boolean(updates.mealie?.token),
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
