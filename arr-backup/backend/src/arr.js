import { debug } from './debug.js'

const ARR_TYPES = new Set(['radarr', 'sonarr', 'prowlarr', 'readarr', 'lidarr', 'whisparr'])

// ── Standard *arr client (v3 API) ─────────────────────────────────────────────

export function createArrClient(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/$/, '')
  const headers = { 'X-Api-Key': apiKey, 'Accept': 'application/json' }

  async function req(path, options = {}) {
    const url = `${base}${path}`
    const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
    if (!res.ok) throw Object.assign(new Error(`${res.status} ${res.statusText}`), { status: res.status })
    return res
  }

  return {
    async listBackups() {
      debug('arr', `listBackups: ${base}`)
      const res = await req('/api/v3/system/backup')
      return res.json()
    },
    async createBackup() {
      debug('arr', `createBackup: ${base}`)
      await req('/api/v3/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Backup' }),
      })
    },
    async downloadBackup(id) {
      debug('arr', `downloadBackup: ${base} id=${id}`)
      return req(`/api/v3/system/backup/${id}`)
    },
    async deleteBackup(id) {
      debug('arr', `deleteBackup: ${base} id=${id}`)
      await req(`/api/v3/system/backup/${id}`, { method: 'DELETE' })
    },
    async restoreBackup(id) {
      debug('arr', `restoreBackup: ${base} id=${id}`)
      await req(`/api/v3/system/backup/restore/${id}`, { method: 'POST' })
    },
    async uploadBackup(filename, buffer) {
      debug('arr', `uploadBackup: ${base} filename=${filename} size=${buffer.length}`)
      const form = new FormData()
      form.append('restore', new Blob([buffer], { type: 'application/zip' }), filename)
      return req('/api/v3/system/backup/restore/upload', { method: 'POST', body: form })
    },
    async ping() {
      debug('arr', `ping: ${base}`)
      const res = await req('/api/v3/system/status')
      return res.json()
    },
  }
}

// ── Bazarr client ─────────────────────────────────────────────────────────────
// Bazarr uses /api/ (not /api/v3/) and returns backups as { data: [...] }
// with filename-based IDs instead of numeric IDs.

export function createBazarrClient(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/$/, '')
  const headers = { 'X-Api-Key': apiKey, 'Accept': 'application/json' }

  async function req(path, options = {}) {
    const url = `${base}${path}`
    const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
    if (!res.ok) throw Object.assign(new Error(`${res.status} ${res.statusText}`), { status: res.status })
    return res
  }

  function normalizeBackup(b) {
    return {
      id: b.filename,
      name: b.filename,
      size: b.size ?? 0,
      time: b.date ? new Date(b.date.replace(' ', 'T')).toISOString() : null,
      type: b.type,
    }
  }

  return {
    async listBackups() {
      debug('bazarr', `listBackups: ${base}`)
      const res = await req('/api/system/backup')
      const body = await res.json()
      return (body.data || []).map(normalizeBackup)
    },
    async createBackup() {
      debug('bazarr', `createBackup: ${base}`)
      await req('/api/system/backup', { method: 'POST' })
    },
    async downloadBackup(id) {
      debug('bazarr', `downloadBackup: ${base} filename=${id}`)
      return req(`/api/system/backup/${encodeURIComponent(id)}`)
    },
    async deleteBackup(id) {
      debug('bazarr', `deleteBackup: ${base} filename=${id}`)
      await req(`/api/system/backup/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    restoreBackup() {
      throw Object.assign(new Error('Restore is not supported for Bazarr'), { status: 501 })
    },
    uploadBackup() {
      throw Object.assign(new Error('Upload restore is not supported for Bazarr'), { status: 501 })
    },
    async ping() {
      debug('bazarr', `ping: ${base}`)
      const res = await req('/api/system/status')
      return res.json()
    },
  }
}

// ── Overseerr / Jellyseerr client ─────────────────────────────────────────────
// Neither service has a backup API. Ping only; backup operations return empty/error.

export function createSeerrClient(baseUrl, apiKey) {
  const base = baseUrl.replace(/\/$/, '')
  const headers = { 'X-Api-Key': apiKey, 'Accept': 'application/json' }

  async function req(path, options = {}) {
    const url = `${base}${path}`
    const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
    if (!res.ok) throw Object.assign(new Error(`${res.status} ${res.statusText}`), { status: res.status })
    return res
  }

  const notSupported = () => {
    throw Object.assign(new Error('Backup is not supported for this service type'), { status: 501 })
  }

  return {
    async listBackups() { return [] },
    createBackup: notSupported,
    downloadBackup: notSupported,
    deleteBackup: notSupported,
    restoreBackup: notSupported,
    uploadBackup: notSupported,
    async ping() {
      debug('seerr', `ping: ${base}`)
      const res = await req('/api/v1/status')
      return res.json()
    },
  }
}

// ── Maintainerr client ────────────────────────────────────────────────────────
// No backup API, no authentication required. Ping only.

export function createMaintainerrClient(baseUrl) {
  const base = baseUrl.replace(/\/$/, '')

  async function req(path, options = {}) {
    const url = `${base}${path}`
    const res = await fetch(url, { ...options, headers: { Accept: 'application/json', ...options.headers } })
    if (!res.ok) throw Object.assign(new Error(`${res.status} ${res.statusText}`), { status: res.status })
    return res
  }

  const notSupported = () => {
    throw Object.assign(new Error('Backup is not supported for Maintainerr'), { status: 501 })
  }

  return {
    async listBackups() { return [] },
    createBackup: notSupported,
    downloadBackup: notSupported,
    deleteBackup: notSupported,
    restoreBackup: notSupported,
    uploadBackup: notSupported,
    async ping() {
      debug('maintainerr', `ping: ${base}`)
      // Maintainerr exposes Swagger at /api/swagger; /api responds with 200 on any running instance
      const res = await req('/api')
      return res
    },
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createClient(type, url, apiKey) {
  if (type === 'bazarr') return createBazarrClient(url, apiKey)
  if (type === 'seerr' || type === 'overseerr' || type === 'jellyseerr') return createSeerrClient(url, apiKey)
  if (type === 'maintainerr') return createMaintainerrClient(url)
  return createArrClient(url, apiKey)
}
