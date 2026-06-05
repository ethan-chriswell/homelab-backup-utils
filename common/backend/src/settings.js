import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { debug } from './debug.js'

export function deepMerge(target, source) {
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

// createSettingsStore(path, { defaults, seedFromEnv? })
// defaults      — service-specific DEFAULTS object
// seedFromEnv   — optional fn(seeded) to populate fields from env vars on first boot
export function createSettingsStore(path, { defaults, seedFromEnv } = {}) {
  debug('settings', `settings file path: ${path}`)

  function load() {
    if (existsSync(path)) {
      debug('settings', `loading settings from ${path}`)
      try {
        const raw = JSON.parse(readFileSync(path, 'utf8'))
        return deepMerge(defaults, raw)
      } catch (err) {
        debug('settings', `failed to parse settings file: ${err.message} — using defaults`)
        return structuredClone(defaults)
      }
    }

    debug('settings', 'no settings file found — seeding from env vars')
    const seeded = structuredClone(defaults)
    seedFromEnv?.(seeded)
    return seeded
  }

  let current = load()

  return {
    get() { return current },
    save(updates) {
      current = deepMerge(current, updates)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify(current, null, 2))
      debug('settings', `settings written to ${path}`)
      return current
    },
  }
}
