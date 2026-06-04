async function request(path, options = {}) {
  const res = await fetch(path, options)
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(data.error || `Request failed: ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  listBackups: () => request('/api/backups'),

  createBackup: () => request('/api/backups', { method: 'POST' }),

  downloadBackup(name) {
    const a = document.createElement('a')
    a.href = `/api/backups/${encodeURIComponent(name)}/download`
    a.download = name
    a.click()
  },

  deleteBackup: (name) => request(`/api/backups/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  restoreBackup: (name) => request(`/api/backups/${encodeURIComponent(name)}/restore`, { method: 'POST' }),

  uploadBackup(file) {
    const form = new FormData()
    form.append('file', file, file.name)
    return request('/api/backups/upload', { method: 'POST', body: form })
  },

  testStorage: (storage) => request('/api/settings/test-storage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storage }),
  }),

  testConnection: (url, token) => request('/api/settings/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, token }),
  }),

  getSettings: () => request('/api/settings'),

  saveSettings: (settings) => request('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  }),

  getConfig: () => request('/api/config'),

  getStatus: () => request('/api/status'),

  runCleanup: () => request('/api/storage/cleanup', { method: 'POST' }),

  auth: {
    status: () => request('/api/auth/status'),

    bootstrap: (username, password) => request('/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),

    login: (username, password) => request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),

    changePassword: (currentPassword, newPassword) => request('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

    changeUsername: (currentPassword, newUsername) => request('/api/auth/change-username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newUsername }),
    }),

    logout: () => request('/api/auth/logout', { method: 'POST' }),
  },
}
