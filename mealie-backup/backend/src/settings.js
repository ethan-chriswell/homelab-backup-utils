import { createSettingsStore as _createSettingsStore } from '../../../common/backend/src/settings.js'

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

export function createSettingsStore(path) {
  return _createSettingsStore(path, {
    defaults: DEFAULTS,
    seedFromEnv(seeded) {
      if (process.env.MEALIE_URL) seeded.mealie.url = process.env.MEALIE_URL
      if (process.env.MEALIE_API_TOKEN) seeded.mealie.token = process.env.MEALIE_API_TOKEN
    },
  })
}
