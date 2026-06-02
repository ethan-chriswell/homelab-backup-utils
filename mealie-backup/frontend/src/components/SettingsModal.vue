<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { api } from '../api.js'

const emit = defineEmits(['close', 'saved'])

const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const testResult = ref(null) // null | { ok: boolean, error?: string }
const error = ref('')

const PRESETS = [
  { label: 'Daily at 2am', cron: '0 2 * * *' },
  { label: 'Daily at midnight', cron: '0 0 * * *' },
  { label: 'Weekly (Sun 2am)', cron: '0 2 * * 0' },
  { label: 'Monthly (1st 2am)', cron: '0 2 1 * *' },
  { label: 'Custom', cron: 'custom' },
]

const form = reactive({
  mealie: { url: '', token: '' },
  storage: {
    type: 'none',
    local: { path: '/data/backups' },
    s3: { endpoint: '', bucket: '', region: 'us-east-1', prefix: 'mealie/', accessKeyId: '', secretAccessKey: '', forcePathStyle: false },
  },
  schedule: { enabled: false, cron: '0 2 * * *' },
  retention: { enabled: false, keepLast: 10, keepDays: 0 },
})

const schedulePreset = ref('0 2 * * *')

const activePreset = computed(() => {
  const match = PRESETS.find(p => p.cron !== 'custom' && p.cron === schedulePreset.value)
  return match ? match.cron : 'custom'
})

watch(schedulePreset, (val) => {
  if (val !== 'custom') form.schedule.cron = val
})

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
    if (s.retention) Object.assign(form.retention, s.retention)
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
      mealie: { ...form.mealie },
      storage: {
        type: form.storage.type,
        local: { ...form.storage.local },
        s3: { ...form.storage.s3 },
      },
      schedule: { ...form.schedule },
      retention: { ...form.retention },
    })
    emit('saved')
    emit('close')
  } catch (err) {
    error.value = `Failed to save: ${err.message}`
  } finally {
    saving.value = false
  }
}

load()
</script>

<template>
  <div
    class="fixed inset-0 z-40 flex items-start justify-center p-4 pt-16 overflow-y-auto"
    data-testid="settings-modal"
    @click.self="emit('close')"
  >
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')"></div>

    <div class="relative w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl mb-8">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h2 class="text-base font-semibold text-zinc-100">Settings</h2>
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

      <div v-if="loading" class="px-6 py-12 text-center">
        <svg class="w-6 h-6 animate-spin mx-auto text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      </div>

      <div v-else class="divide-y divide-zinc-800">
        <!-- Mealie Connection -->
        <section class="px-6 py-5 space-y-4">
          <h3 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Mealie Connection</h3>
          <div>
            <label class="block text-sm text-zinc-300 mb-1.5">Mealie URL</label>
            <input
              v-model="form.mealie.url"
              type="url"
              placeholder="http://mealie:9000"
              class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
              data-testid="settings-mealie-url"
            />
          </div>
          <div>
            <label class="block text-sm text-zinc-300 mb-1.5">API Token</label>
            <input
              v-model="form.mealie.token"
              type="password"
              placeholder="Enter token (leave unchanged to keep existing)"
              class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
              data-testid="settings-mealie-token"
            />
          </div>

          <div class="flex items-center gap-3">
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
              :class="testResult.ok ? 'text-green-400' : 'text-red-400'"
              data-testid="test-result"
            >
              <svg v-if="testResult.ok" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              {{ testResult.ok ? 'Connected' : testResult.error }}
            </span>
          </div>
        </section>

        <!-- Storage -->
        <section class="px-6 py-5 space-y-4">
          <h3 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Secondary Storage</h3>
          <div class="flex rounded-lg overflow-hidden border border-zinc-700">
            <button
              v-for="opt in ['none', 'local', 's3']"
              :key="opt"
              class="flex-1 py-2 text-sm font-medium capitalize transition-colors"
              :class="form.storage.type === opt
                ? 'bg-zinc-700 text-zinc-100'
                : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'"
              :data-testid="`storage-type-${opt}`"
              @click="form.storage.type = opt"
            >{{ opt }}</button>
          </div>

          <div v-if="form.storage.type === 'local'" class="space-y-3">
            <div>
              <label class="block text-sm text-zinc-300 mb-1.5">Local Path</label>
              <input
                v-model="form.storage.local.path"
                type="text"
                placeholder="/data/backups"
                class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
                data-testid="settings-local-path"
              />
            </div>
          </div>

          <div v-if="form.storage.type === 's3'" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm text-zinc-300 mb-1.5">Endpoint</label>
                <input v-model="form.storage.s3.endpoint" type="text" placeholder="http://minio:9000 (blank for AWS)"
                  class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
                  data-testid="settings-s3-endpoint" />
              </div>
              <div>
                <label class="block text-sm text-zinc-300 mb-1.5">Bucket</label>
                <input v-model="form.storage.s3.bucket" type="text" placeholder="backups"
                  class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
                  data-testid="settings-s3-bucket" />
              </div>
              <div>
                <label class="block text-sm text-zinc-300 mb-1.5">Region</label>
                <input v-model="form.storage.s3.region" type="text" placeholder="us-east-1"
                  class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
                  data-testid="settings-s3-region" />
              </div>
              <div>
                <label class="block text-sm text-zinc-300 mb-1.5">Prefix</label>
                <input v-model="form.storage.s3.prefix" type="text" placeholder="mealie/"
                  class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
                  data-testid="settings-s3-prefix" />
              </div>
            </div>
            <div>
              <label class="block text-sm text-zinc-300 mb-1.5">Access Key ID</label>
              <input v-model="form.storage.s3.accessKeyId" type="text"
                class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
                data-testid="settings-s3-access-key" />
            </div>
            <div>
              <label class="block text-sm text-zinc-300 mb-1.5">Secret Access Key</label>
              <input v-model="form.storage.s3.secretAccessKey" type="password"
                class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
                data-testid="settings-s3-secret" />
            </div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="form.storage.s3.forcePathStyle" type="checkbox"
                class="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-green-500 focus:ring-0"
                data-testid="settings-s3-path-style" />
              <span class="text-sm text-zinc-300">Force path-style (required for MinIO)</span>
            </label>
          </div>
        </section>

        <!-- Schedule -->
        <section class="px-6 py-5 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Scheduled Backups</h3>
            <button
              class="relative w-10 h-5 rounded-full transition-colors"
              :class="form.schedule.enabled ? 'bg-green-600' : 'bg-zinc-700'"
              data-testid="schedule-toggle"
              @click="form.schedule.enabled = !form.schedule.enabled"
            >
              <span
                class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                :class="form.schedule.enabled ? 'translate-x-5' : 'translate-x-0'"
              ></span>
            </button>
          </div>

          <div v-if="form.schedule.enabled" class="space-y-3">
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                v-for="p in PRESETS"
                :key="p.cron"
                class="rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                :class="activePreset === p.cron
                  ? 'bg-green-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'"
                :data-testid="`schedule-preset-${p.cron}`"
                @click="schedulePreset = p.cron"
              >{{ p.label }}</button>
            </div>
            <div>
              <label class="block text-sm text-zinc-300 mb-1.5">Cron Expression</label>
              <input
                v-model="form.schedule.cron"
                type="text"
                placeholder="0 2 * * *"
                class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
                data-testid="settings-cron-input"
                @input="schedulePreset = 'custom'"
              />
              <p class="text-xs text-zinc-600 mt-1">minute hour day month weekday</p>
            </div>
          </div>
        </section>

        <!-- Retention Policy -->
        <section class="px-6 py-5 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Retention Policy</h3>
            <button
              class="relative w-10 h-5 rounded-full transition-colors"
              :class="form.retention.enabled ? 'bg-green-600' : 'bg-zinc-700'"
              data-testid="retention-toggle"
              @click="form.retention.enabled = !form.retention.enabled"
            >
              <span
                class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                :class="form.retention.enabled ? 'translate-x-5' : 'translate-x-0'"
              ></span>
            </button>
          </div>

          <div v-if="form.retention.enabled" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm text-zinc-300 mb-1.5">Keep last N backups</label>
                <input
                  v-model.number="form.retention.keepLast"
                  type="number"
                  min="0"
                  placeholder="10"
                  class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
                  data-testid="retention-keep-last"
                />
              </div>
              <div>
                <label class="block text-sm text-zinc-300 mb-1.5">Keep backups for N days</label>
                <input
                  v-model.number="form.retention.keepDays"
                  type="number"
                  min="0"
                  placeholder="0"
                  class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-green-500 transition-colors"
                  data-testid="retention-keep-days"
                />
              </div>
            </div>
            <p class="text-xs text-zinc-600">
              A backup is kept if either condition is met. Set a value to 0 to disable that rule.
              Applies to secondary storage only. Cleanup runs automatically after each backup.
            </p>
          </div>
        </section>

        <!-- Error -->
        <div v-if="error" class="px-6 py-3 bg-red-900/30 border-t border-red-800">
          <p class="text-sm text-red-300" data-testid="settings-error">{{ error }}</p>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 flex gap-3">
          <button
            class="flex-1 rounded-xl py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors"
            @click="emit('close')"
          >Cancel</button>
          <button
            class="flex-1 rounded-xl py-2.5 text-sm font-medium bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-50"
            :disabled="saving"
            data-testid="settings-save"
            @click="save"
          >{{ saving ? 'Saving…' : 'Save Settings' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
