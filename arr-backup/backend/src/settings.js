import { createSettingsStore as _createSettingsStore } from '../../../common/backend/src/settings.js'

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
  return _createSettingsStore(path, {
    defaults: DEFAULTS,
    seedFromEnv(seeded) {
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
      }
    },
  })
}
