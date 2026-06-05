import { debug, maskToken } from '../../../common/backend/src/debug.js'

export function createMealieClient(baseUrl, token) {
  function authHeaders() {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }
  }

  async function request(path, options = {}) {
    const url = `${baseUrl}${path}`
    const method = options.method || 'GET'
    debug('mealie', `→ ${method} ${url}`, {
      token: maskToken(token),
      headers: options.headers ?? '(none)',
      body: options.body ?? '(none)',
    })

    const res = await fetch(url, {
      ...options,
      headers: { ...authHeaders(), ...options.headers },
    })

    debug('mealie', `← ${method} ${url} → ${res.status} ${res.statusText}`, {
      contentType: res.headers.get('content-type'),
    })

    if (!res.ok) {
      const contentType = res.headers.get('content-type') || ''
      const body = await res.text().catch(() => '')

      if (contentType.includes('text/html')) {
        debug('mealie', `error: got HTML response for ${method} ${path} — likely wrong path or insufficient permissions`)
        const hint = res.status === 404
          ? 'API endpoint not found — check the Mealie URL and ensure the token belongs to an admin account'
          : `Mealie returned HTML (status ${res.status}) — check URL and admin token`
        throw Object.assign(new Error(hint), { status: res.status })
      }

      debug('mealie', `error body: ${body}`)
      let message
      try {
        const json = JSON.parse(body)
        message = json.detail || json.message || body
      } catch {
        message = body || res.statusText
      }
      throw Object.assign(new Error(`Mealie ${res.status}: ${message}`), { status: res.status })
    }
    return res
  }

  return {
    async listBackups() {
      debug('mealie', 'listBackups()')
      const res = await request('/api/admin/backups')
      const data = await res.json()
      debug('mealie', 'listBackups raw response', data)
      // API returns { imports: [...], templates: [...] }
      const backups = Array.isArray(data) ? data : (data.imports ?? [])
      debug('mealie', `listBackups parsed ${backups.length} backup(s)`, backups.map(b => b.name))
      return backups
    },

    async createBackup() {
      debug('mealie', 'createBackup()')
      const res = await request('/api/admin/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const data = await res.json().catch(() => ({}))
      debug('mealie', 'createBackup response', data)
      return data
    },

    // Returns the file stream via the two-step fileToken flow:
    // 1. GET /api/admin/backups/{name}  → { fileToken }
    // 2. GET /api/utils/download?token={fileToken} → binary stream
    async downloadBackup(name) {
      debug('mealie', `downloadBackup(${name}) — fetching fileToken`)
      const tokenRes = await request(`/api/admin/backups/${encodeURIComponent(name)}`)
      const { fileToken } = await tokenRes.json()
      debug('mealie', `downloadBackup(${name}) — fileToken obtained, downloading`)
      if (!fileToken) throw new Error('Mealie did not return a fileToken for download')
      return request(`/api/utils/download?token=${encodeURIComponent(fileToken)}`)
    },

    async deleteBackup(name) {
      debug('mealie', `deleteBackup(${name})`)
      await request(`/api/admin/backups/${encodeURIComponent(name)}`, { method: 'DELETE' })
      debug('mealie', `deleteBackup(${name}) ok`)
    },

    async restoreBackup(name) {
      debug('mealie', `restoreBackup(${name})`)
      const res = await request(`/api/admin/backups/${encodeURIComponent(name)}/restore`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      debug('mealie', `restoreBackup(${name}) response`, data)
      return data
    },

    async uploadBackup(filename, buffer) {
      debug('mealie', `uploadBackup(${filename}) size=${buffer.length}`)
      const form = new FormData()
      // Mealie expects the field name "archive"
      form.append('archive', new Blob([buffer]), filename)
      const res = await fetch(`${baseUrl}/api/admin/backups/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      })
      debug('mealie', `uploadBackup ← ${res.status} ${res.statusText}`)
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        debug('mealie', `uploadBackup error body: ${body}`)
        throw Object.assign(new Error(`Mealie ${res.status}: ${body}`), { status: res.status })
      }
      const data = await res.json().catch(() => ({}))
      debug('mealie', 'uploadBackup response', data)
      return data
    },
  }
}
