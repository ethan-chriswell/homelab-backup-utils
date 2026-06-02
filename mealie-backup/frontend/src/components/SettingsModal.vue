<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { api } from '../api.js'

const emit = defineEmits(['close', 'saved'])

// ── UI state ──────────────────────────────────────────────────────────────────
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const testResult = ref(null)
const error = ref('')
const changingPassword = ref(false)
const passwordForm = reactive({ current: '', next: '', confirm: '' })
const passwordResult = ref(null)
const activeTab = ref('connection')

const TABS = [
  { id: 'connection', label: 'Connection' },
  { id: 'storage',    label: 'Storage' },
  { id: 'automation', label: 'Automation' },
  { id: 'security',   label: 'Security' },
]

// ── Form ──────────────────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Daily 2 am',  cron: '0 2 * * *' },
  { label: 'Daily midnight', cron: '0 0 * * *' },
  { label: 'Weekly',      cron: '0 2 * * 0' },
  { label: 'Monthly',     cron: '0 2 1 * *' },
  { label: 'Custom',      cron: 'custom' },
]

const form = reactive({
  mealie: { url: '', token: '' },
  storage: {
    type: 'none',
    local: { path: '/data/backups' },
    s3: {
      endpoint: '', bucket: '', region: 'us-east-1', prefix: 'mealie/',
      accessKeyId: '', secretAccessKey: '', forcePathStyle: false,
    },
  },
  schedule:  { enabled: false, cron: '0 2 * * *' },
  retention: { enabled: false, keepLast: 10, keepDays: 0 },
  auth: {
    oidc: { enabled: false, issuer: '', clientId: '', clientSecret: '', redirectUri: '', scopes: 'openid profile email' },
  },
})

const schedulePreset = ref('0 2 * * *')

const activePreset = computed(() => {
  const match = PRESETS.find(p => p.cron !== 'custom' && p.cron === schedulePreset.value)
  return match ? match.cron : 'custom'
})

watch(schedulePreset, (val) => {
  if (val !== 'custom') form.schedule.cron = val
})

// ── Retention mode ────────────────────────────────────────────────────────────
// 'off' | 'count' | 'age' | 'both'
const retentionMode = ref('off')

function deriveRetentionMode() {
  const { enabled, keepLast, keepDays } = form.retention
  if (!enabled) return 'off'
  if (keepLast > 0 && keepDays > 0) return 'both'
  if (keepDays > 0) return 'age'
  if (keepLast > 0) return 'count'
  return 'off'
}

function setRetentionMode(mode) {
  retentionMode.value = mode
  if (mode === 'off') {
    form.retention.enabled = false
    form.retention.keepLast = 0
    form.retention.keepDays = 0
  } else {
    form.retention.enabled = true
    if (mode === 'count') {
      form.retention.keepDays = 0
      if (!form.retention.keepLast) form.retention.keepLast = 10
    } else if (mode === 'age') {
      form.retention.keepLast = 0
      if (!form.retention.keepDays) form.retention.keepDays = 30
    } else {
      if (!form.retention.keepLast) form.retention.keepLast = 10
      if (!form.retention.keepDays) form.retention.keepDays = 30
    }
  }
}

// ── API ───────────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  try {
    const s = await api.getSettings()
    Object.assign(form.mealie, s.mealie)
    Object.assign(form.storage.local, s.storage.local)
    Object.assign(form.storage.s3, s.storage.s3)
    form.storage.type = s.storage.type
    form.schedule.enabled = s.schedule.enabled
    form.schedule.cron = s.schedule.cron
    const preset = PRESETS.find(p => p.cron !== 'custom' && p.cron === s.schedule.cron)
    schedulePreset.value = preset ? preset.cron : 'custom'
    if (s.retention) {
      Object.assign(form.retention, s.retention)
      retentionMode.value = deriveRetentionMode()
    }
    if (s.auth?.oidc)  Object.assign(form.auth.oidc, s.auth.oidc)
  } catch (err) {
    error.value = `Failed to load settings: ${err.message}`
  } finally {
    loading.value = false
  }
}

async function testConnection() {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await api.testConnection(form.mealie.url, form.mealie.token)
  } catch (err) {
    testResult.value = { ok: false, error: err.message }
  } finally {
    testing.value = false
  }
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    await api.saveSettings({
      mealie:    { ...form.mealie },
      storage:   { type: form.storage.type, local: { ...form.storage.local }, s3: { ...form.storage.s3 } },
      schedule:  { ...form.schedule },
      retention: { ...form.retention },
      auth:      { oidc: { ...form.auth.oidc } },
    })
    emit('saved')
    emit('close')
  } catch (err) {
    error.value = `Failed to save: ${err.message}`
  } finally {
    saving.value = false
  }
}

async function changePassword() {
  passwordResult.value = null
  if (!passwordForm.current || !passwordForm.next) {
    passwordResult.value = { ok: false, error: 'All fields are required' }
    return
  }
  if (passwordForm.next !== passwordForm.confirm) {
    passwordResult.value = { ok: false, error: 'New passwords do not match' }
    return
  }
  changingPassword.value = true
  try {
    await api.auth.changePassword(passwordForm.current, passwordForm.next)
    Object.assign(passwordForm, { current: '', next: '', confirm: '' })
    passwordResult.value = { ok: true }
  } catch (err) {
    passwordResult.value = { ok: false, error: err.message }
  } finally {
    changingPassword.value = false
  }
}

load()
</script>

<template>
  <div
    class="fixed inset-0 z-40 flex items-center justify-center p-4"
    data-testid="settings-modal"
  >
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')"></div>

    <!-- Modal shell: fixed two-panel layout -->
    <div class="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col" style="max-height: min(680px, 90vh)">

      <!-- ── Header ─────────────────────────────────────────────────────────── -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-none">
        <div>
          <h2 class="text-base font-semibold text-zinc-100">Settings</h2>
          <p class="text-xs text-zinc-600 mt-0.5">{{ TABS.find(t => t.id === activeTab)?.label }}</p>
        </div>
        <button
          class="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          data-testid="settings-close"
          @click="emit('close')"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- ── Loading ────────────────────────────────────────────────────────── -->
      <div v-if="loading" class="flex-1 flex items-center justify-center">
        <svg class="w-6 h-6 animate-spin text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      </div>

      <!-- ── Body: sidebar + content ────────────────────────────────────────── -->
      <div v-else class="flex flex-1 overflow-hidden">

        <!-- Sidebar nav -->
        <nav class="w-40 flex-none border-r border-zinc-800 p-2 space-y-0.5 overflow-y-auto">
          <!-- Connection -->
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors"
            :class="activeTab === 'connection' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'"
            data-testid="tab-connection"
            @click="activeTab = 'connection'"
          >
            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            Connection
          </button>

          <!-- Storage -->
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors"
            :class="activeTab === 'storage' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'"
            data-testid="tab-storage"
            @click="activeTab = 'storage'"
          >
            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
            Storage
          </button>

          <!-- Automation -->
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors"
            :class="activeTab === 'automation' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'"
            data-testid="tab-automation"
            @click="activeTab = 'automation'"
          >
            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Automation
          </button>

          <!-- Security -->
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors"
            :class="activeTab === 'security' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'"
            data-testid="tab-security"
            @click="activeTab = 'security'"
          >
            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            Security
          </button>
        </nav>

        <!-- Content panels -->
        <div class="flex-1 overflow-y-auto">

          <!-- ── Connection ─────────────────────────────────────────────────── -->
          <div v-if="activeTab === 'connection'" class="p-6 space-y-5">
            <div class="space-y-4">
              <div>
                <label class="block text-sm text-zinc-300 mb-1.5">Mealie URL</label>
                <input
                  v-model="form.mealie.url"
                  type="url"
                  placeholder="http://mealie:9000"
                  class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                  data-testid="settings-mealie-url"
                />
              </div>

              <div>
                <label class="block text-sm text-zinc-300 mb-1.5">API Token</label>
                <input
                  v-model="form.mealie.token"
                  type="password"
                  placeholder="Leave blank to keep existing token"
                  class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                  data-testid="settings-mealie-token"
                />
              </div>
            </div>

            <div class="pt-1 border-t border-zinc-800 flex items-center gap-3">
              <button
                class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors disabled:opacity-50"
                :disabled="testing || !form.mealie.url"
                data-testid="test-connection-button"
                @click="testConnection"
              >
                <svg
                  class="w-3.5 h-3.5"
                  :class="{ 'animate-spin': testing }"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {{ testing ? 'Testing…' : 'Test Connection' }}
              </button>

              <span
                v-if="testResult"
                class="flex items-center gap-1.5 text-sm"
                :class="testResult.ok ? 'text-cyan-400' : 'text-red-400'"
                data-testid="test-result"
              >
                <svg v-if="testResult.ok" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <svg v-else class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                {{ testResult.ok ? 'Connected' : testResult.error }}
              </span>
            </div>
          </div>

          <!-- ── Storage ────────────────────────────────────────────────────── -->
          <div v-if="activeTab === 'storage'" class="p-6 space-y-5">
            <!-- Type picker -->
            <div>
              <p class="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Storage backend</p>
              <div class="flex rounded-lg overflow-hidden border border-zinc-700">
                <button
                  v-for="opt in ['none', 'local', 's3']"
                  :key="opt"
                  class="flex-1 py-2 text-sm font-medium capitalize transition-colors"
                  :class="form.storage.type === opt ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'"
                  :data-testid="`storage-type-${opt}`"
                  @click="form.storage.type = opt"
                >{{ opt === 'none' ? 'None' : opt === 'local' ? 'Local disk' : 'S3 / MinIO' }}</button>
              </div>
            </div>

            <!-- None -->
            <div v-if="form.storage.type === 'none'" class="rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-4 py-3">
              <p class="text-sm text-zinc-500">Backups are kept only inside Mealie. Enable local or S3 storage to maintain an external copy.</p>
            </div>

            <!-- Local -->
            <div v-if="form.storage.type === 'local'" class="space-y-3">
              <div>
                <label class="block text-sm text-zinc-300 mb-1.5">Directory path</label>
                <input
                  v-model="form.storage.local.path"
                  type="text"
                  placeholder="/data/backups"
                  class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                  data-testid="settings-local-path"
                />
              </div>
            </div>

            <!-- S3 -->
            <div v-if="form.storage.type === 's3'" class="space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <div class="col-span-2">
                  <label class="block text-sm text-zinc-300 mb-1.5">Endpoint <span class="text-zinc-600">(blank for AWS)</span></label>
                  <input
                    v-model="form.storage.s3.endpoint"
                    type="text"
                    placeholder="http://minio:9000"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    data-testid="settings-s3-endpoint"
                  />
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Bucket</label>
                  <input v-model="form.storage.s3.bucket" type="text" placeholder="backups"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    data-testid="settings-s3-bucket" />
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Region</label>
                  <input v-model="form.storage.s3.region" type="text" placeholder="us-east-1"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    data-testid="settings-s3-region" />
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Prefix</label>
                  <input v-model="form.storage.s3.prefix" type="text" placeholder="mealie/"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    data-testid="settings-s3-prefix" />
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Access Key ID</label>
                  <input v-model="form.storage.s3.accessKeyId" type="text"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    data-testid="settings-s3-access-key" />
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Secret Access Key</label>
                  <input v-model="form.storage.s3.secretAccessKey" type="password"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    data-testid="settings-s3-secret" />
                </div>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="form.storage.s3.forcePathStyle" type="checkbox"
                  class="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-cyan-500 focus:ring-0"
                  data-testid="settings-s3-path-style" />
                <span class="text-sm text-zinc-300">Force path-style <span class="text-zinc-600">(required for MinIO)</span></span>
              </label>
            </div>
          </div>

          <!-- ── Automation ──────────────────────────────────────────────────── -->
          <div v-if="activeTab === 'automation'" class="p-6 space-y-6">

            <!-- Schedule -->
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-zinc-200">Backup schedule</p>
                  <p class="text-xs text-zinc-600 mt-0.5">Automatically create a backup on a cron schedule</p>
                </div>
                <button
                  class="relative w-10 h-5 rounded-full transition-colors shrink-0"
                  :class="form.schedule.enabled ? 'bg-cyan-600' : 'bg-zinc-700'"
                  data-testid="schedule-toggle"
                  @click="form.schedule.enabled = !form.schedule.enabled"
                >
                  <span
                    class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                    :class="form.schedule.enabled ? 'translate-x-5' : 'translate-x-0'"
                  ></span>
                </button>
              </div>

              <div v-if="form.schedule.enabled" class="space-y-3 pl-0">
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="p in PRESETS"
                    :key="p.cron"
                    class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                    :class="activePreset === p.cron ? 'bg-cyan-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'"
                    :data-testid="`schedule-preset-${p.cron}`"
                    @click="schedulePreset = p.cron"
                  >{{ p.label }}</button>
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Cron expression</label>
                  <input
                    v-model="form.schedule.cron"
                    type="text"
                    placeholder="0 2 * * *"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    data-testid="settings-cron-input"
                    @input="schedulePreset = 'custom'"
                  />
                  <p class="text-xs text-zinc-600 mt-1">minute · hour · day · month · weekday</p>
                </div>
              </div>
            </div>

            <div class="border-t border-zinc-800"></div>

            <!-- Retention -->
            <div class="space-y-4">
              <div>
                <p class="text-sm font-medium text-zinc-200">Retention policy</p>
                <p class="text-xs text-zinc-600 mt-0.5">Automatically remove old backups after each run</p>
              </div>

              <!-- Mode selector -->
              <div class="flex rounded-lg overflow-hidden border border-zinc-700" data-testid="retention-mode-selector">
                <button
                  v-for="mode in ['off', 'count', 'age', 'both']"
                  :key="mode"
                  class="flex-1 py-2 text-xs font-medium transition-colors"
                  :class="retentionMode === mode ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'"
                  :data-testid="`retention-mode-${mode}`"
                  @click="setRetentionMode(mode)"
                >{{ { off: 'Off', count: 'Last N', age: 'N days', both: 'Both' }[mode] }}</button>
              </div>

              <!-- Off -->
              <div v-if="retentionMode === 'off'" class="rounded-lg bg-zinc-800/50 border border-zinc-700/50 px-4 py-3">
                <p class="text-sm text-zinc-500">Backups accumulate indefinitely. No automatic cleanup.</p>
              </div>

              <!-- Count -->
              <div v-else-if="retentionMode === 'count'" class="space-y-2">
                <div class="flex items-center gap-3">
                  <label class="text-sm text-zinc-400 shrink-0">Keep the last</label>
                  <input
                    v-model.number="form.retention.keepLast"
                    type="number"
                    min="1"
                    class="w-20 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500 transition-colors"
                    data-testid="retention-keep-last"
                  />
                  <span class="text-sm text-zinc-400">backups</span>
                </div>
                <p class="text-xs text-zinc-600">Older backups are deleted after each run.</p>
              </div>

              <!-- Age -->
              <div v-else-if="retentionMode === 'age'" class="space-y-2">
                <div class="flex items-center gap-3">
                  <label class="text-sm text-zinc-400 shrink-0">Keep backups from the last</label>
                  <input
                    v-model.number="form.retention.keepDays"
                    type="number"
                    min="1"
                    class="w-20 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500 transition-colors"
                    data-testid="retention-keep-days"
                  />
                  <span class="text-sm text-zinc-400">days</span>
                </div>
                <p class="text-xs text-zinc-600">Backups older than this are deleted after each run.</p>
              </div>

              <!-- Both -->
              <div v-else class="space-y-3">
                <div class="space-y-2">
                  <div class="flex items-center gap-3">
                    <label class="text-sm text-zinc-400 w-36 shrink-0">Keep the last</label>
                    <input
                      v-model.number="form.retention.keepLast"
                      type="number"
                      min="1"
                      class="w-20 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500 transition-colors"
                      data-testid="retention-keep-last"
                    />
                    <span class="text-sm text-zinc-400">backups</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <label class="text-sm text-zinc-400 w-36 shrink-0">…or the last</label>
                    <input
                      v-model.number="form.retention.keepDays"
                      type="number"
                      min="1"
                      class="w-20 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500 transition-colors"
                      data-testid="retention-keep-days"
                    />
                    <span class="text-sm text-zinc-400">days</span>
                  </div>
                </div>
                <p class="text-xs text-zinc-600">A backup is kept if either rule protects it.</p>
              </div>
            </div>
          </div>

          <!-- ── Security ────────────────────────────────────────────────────── -->
          <div v-if="activeTab === 'security'" class="p-6 space-y-6">

            <!-- OIDC -->
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-zinc-200">SSO / OIDC</p>
                  <p class="text-xs text-zinc-600 mt-0.5">Allow sign-in via an external identity provider</p>
                </div>
                <button
                  class="relative w-10 h-5 rounded-full transition-colors shrink-0"
                  :class="form.auth.oidc.enabled ? 'bg-cyan-600' : 'bg-zinc-700'"
                  data-testid="oidc-toggle"
                  @click="form.auth.oidc.enabled = !form.auth.oidc.enabled"
                >
                  <span
                    class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                    :class="form.auth.oidc.enabled ? 'translate-x-5' : 'translate-x-0'"
                  ></span>
                </button>
              </div>

              <div v-if="form.auth.oidc.enabled" class="space-y-3">
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Issuer URL</label>
                  <input
                    v-model="form.auth.oidc.issuer"
                    type="url"
                    placeholder="https://accounts.google.com"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    data-testid="oidc-issuer"
                  />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-sm text-zinc-300 mb-1.5">Client ID</label>
                    <input v-model="form.auth.oidc.clientId" type="text"
                      class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                      data-testid="oidc-client-id" />
                  </div>
                  <div>
                    <label class="block text-sm text-zinc-300 mb-1.5">Client Secret</label>
                    <input v-model="form.auth.oidc.clientSecret" type="password"
                      placeholder="Leave blank to keep existing"
                      class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                      data-testid="oidc-client-secret" />
                  </div>
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Redirect URI</label>
                  <input v-model="form.auth.oidc.redirectUri" type="url"
                    placeholder="https://your-domain/api/auth/oidc/callback"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    data-testid="oidc-redirect-uri" />
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Scopes</label>
                  <input v-model="form.auth.oidc.scopes" type="text"
                    placeholder="openid profile email"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    data-testid="oidc-scopes" />
                </div>
              </div>
            </div>

            <template v-if="!form.auth.oidc.enabled">
            <div class="border-t border-zinc-800"></div>

            <!-- Change password -->
            <div class="space-y-4">
              <div>
                <p class="text-sm font-medium text-zinc-200">Change password</p>
                <p class="text-xs text-zinc-600 mt-0.5">Takes effect immediately — separate from Save Settings</p>
              </div>

              <div class="space-y-3">
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Current password</label>
                  <input
                    v-model="passwordForm.current"
                    type="password"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                    data-testid="change-password-current"
                  />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-sm text-zinc-300 mb-1.5">New password</label>
                    <input v-model="passwordForm.next" type="password"
                      class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                      data-testid="change-password-new" />
                  </div>
                  <div>
                    <label class="block text-sm text-zinc-300 mb-1.5">Confirm new</label>
                    <input v-model="passwordForm.confirm" type="password"
                      class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
                      data-testid="change-password-confirm" />
                  </div>
                </div>

                <div class="flex items-center justify-between">
                  <span
                    v-if="passwordResult"
                    class="flex items-center gap-1.5 text-sm"
                    :class="passwordResult.ok ? 'text-cyan-400' : 'text-red-400'"
                  >
                    <svg v-if="passwordResult.ok" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {{ passwordResult.ok ? 'Password updated' : passwordResult.error }}
                  </span>
                  <span v-else></span>

                  <button
                    class="rounded-lg px-4 py-2 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors disabled:opacity-50"
                    :disabled="changingPassword"
                    data-testid="change-password-submit"
                    @click="changePassword"
                  >{{ changingPassword ? 'Updating…' : 'Update Password' }}</button>
                </div>
              </div>
            </div>
            </template>
          </div>

        </div><!-- end content panels -->
      </div><!-- end body -->

      <!-- ── Error ──────────────────────────────────────────────────────────── -->
      <div v-if="error" class="flex-none px-5 py-3 bg-red-900/30 border-t border-red-800">
        <p class="text-sm text-red-300" data-testid="settings-error">{{ error }}</p>
      </div>

      <!-- ── Footer ─────────────────────────────────────────────────────────── -->
      <div class="flex-none px-5 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">
        <button
          class="rounded-xl px-5 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors"
          @click="emit('close')"
        >Cancel</button>
        <button
          class="rounded-xl px-5 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50"
          :disabled="saving"
          data-testid="settings-save"
          @click="save"
        >{{ saving ? 'Saving…' : 'Save Settings' }}</button>
      </div>

    </div><!-- end modal shell -->
  </div>
</template>
