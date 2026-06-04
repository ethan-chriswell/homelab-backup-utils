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
  getStatus: () => request('/api/status'),
  getConfig: () => request('/api/config'),
  getSettings: () => request('/api/settings'),
  saveSettings: (s) => request('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  }),
  testStorage: (storage) => request('/api/settings/test-storage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storage }),
  }),

  testConnection: (serviceId) => request('/api/settings/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceId }),
  }),
  testConnectionPreview: (url, apiKey, type) => request('/api/settings/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, apiKey, type }),
  }),

  listBackups: () => request('/api/backups'),
  createAllBackups: () => request('/api/backups', { method: 'POST' }),
  createBackup: (serviceId) => request(`/api/backups/${encodeURIComponent(serviceId)}`, { method: 'POST' }),

  downloadBackup(serviceId, id, name) {
    const a = document.createElement('a')
    a.href = `/api/backups/${encodeURIComponent(serviceId)}/${id}/download`
    a.download = name || `backup-${id}.zip`
    a.click()
  },

  deleteBackup: (serviceId, id) =>
    request(`/api/backups/${encodeURIComponent(serviceId)}/${id}`, { method: 'DELETE' }),

  restoreBackup: (serviceId, id) =>
    request(`/api/backups/${encodeURIComponent(serviceId)}/${id}/restore`, { method: 'POST' }),

  uploadBackup(serviceId, file) {
    const form = new FormData()
    form.append('serviceId', serviceId)
    form.append('file', file, file.name)
    return request('/api/backups/upload', { method: 'POST', body: form })
  },

  getStorageBackups: () => request('/api/storage/backups'),

  downloadStorageBackup(name) {
    const a = document.createElement('a')
    a.href = `/api/storage/backups/${encodeURIComponent(name)}/download`
    a.download = name
    a.click()
  },

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
