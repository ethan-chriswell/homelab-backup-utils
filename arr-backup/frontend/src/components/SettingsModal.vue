<script setup>
import { ref, reactive, watch, computed, nextTick } from 'vue'
import { api } from '../api.js'

const emit = defineEmits(['close', 'saved'])

// ── UI state ──────────────────────────────────────────────────────────────────
const loading = ref(true)
const saving = ref(false)
const loaded = ref(false)
const autoSaveStatus = ref(null) // null | 'saving' | 'saved' | 'error'
let saveTimer = null
const testing = ref(false)
const testResultMap = reactive({}) // serviceId → { ok, error }
const testingStorage = ref(false)
const storageTestResult = ref(null)
const error = ref('')
const changingPassword = ref(false)
const passwordForm = reactive({ current: '', next: '', confirm: '' })
const passwordResult = ref(null)
const changingUsername = ref(false)
const usernameForm = reactive({ current: '', newUsername: '' })
const usernameResult = ref(null)
const currentUsername = ref('admin')
const activeTab = ref('services')

// Inline add/edit service form
const showServiceForm = ref(false)
const editingServiceId = ref(null)
const serviceForm = reactive({
  name: '', type: 'radarr', url: '', apiKey: '',
  retention: { enabled: false, keepLast: 10, keepDays: 0 },
})

// Service form test / advanced state
const serviceFormTesting = ref(false)
const serviceFormTestResult = ref(null)
const serviceFormRetentionMode = ref('off')

const SERVICE_TYPES = ['radarr', 'sonarr', 'prowlarr', 'readarr', 'lidarr', 'whisparr', 'bazarr', 'seerr', 'maintainerr']

const TABS = [
  { id: 'services',   label: 'Services' },
  { id: 'storage',    label: 'Storage' },
  { id: 'automation', label: 'Automation' },
  { id: 'security',   label: 'Security' },
]

// ── Form ──────────────────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Daily 2 am',     cron: '0 2 * * *' },
  { label: 'Daily midnight', cron: '0 0 * * *' },
  { label: 'Weekly',         cron: '0 2 * * 0' },
  { label: 'Monthly',        cron: '0 2 1 * *' },
  { label: 'Custom',         cron: 'custom' },
]

const form = reactive({
  services: [],
  schedules: [],
  storage: {
    type: 'none',
    local: { path: '/data/backups' },
    s3: {
      endpoint: '', bucket: '', region: 'us-east-1', prefix: 'arr/',
      accessKeyId: '', secretAccessKey: '', forcePathStyle: false,
    },
  },
  auth: {
    oidc: { enabled: false, issuer: '', clientId: '', clientSecret: '', redirectUri: '', scopes: 'openid profile email' },
  },
})

// ── Schedule CRUD ─────────────────────────────────────────────────────────────
const showScheduleForm = ref(false)
const scheduleFormPreset = ref('0 2 * * *')
const scheduleFormShowAdvanced = ref(false)
const scheduleFormRetentionMode = ref('off')
const scheduleForm = reactive({
  name: '', serviceId: '', cron: '0 2 * * *',
  retention: { enabled: false, keepLast: 10, keepDays: 0 },
})

const scheduleFormActivePreset = computed(() => {
  const match = PRESETS.find(p => p.cron !== 'custom' && p.cron === scheduleFormPreset.value)
  return match ? match.cron : 'custom'
})

watch(scheduleFormPreset, (val) => {
  if (val !== 'custom') scheduleForm.cron = val
})

function setScheduleRetentionMode(mode) {
  scheduleFormRetentionMode.value = mode
  if (mode === 'off') {
    scheduleForm.retention.enabled = false
    scheduleForm.retention.keepLast = 0
    scheduleForm.retention.keepDays = 0
  } else {
    scheduleForm.retention.enabled = true
    if (mode === 'count') {
      scheduleForm.retention.keepDays = 0
      if (!scheduleForm.retention.keepLast) scheduleForm.retention.keepLast = 10
    } else if (mode === 'age') {
      scheduleForm.retention.keepLast = 0
      if (!scheduleForm.retention.keepDays) scheduleForm.retention.keepDays = 30
    } else {
      if (!scheduleForm.retention.keepLast) scheduleForm.retention.keepLast = 10
      if (!scheduleForm.retention.keepDays) scheduleForm.retention.keepDays = 30
    }
  }
}

function openAddSchedule() {
  Object.assign(scheduleForm, {
    name: '', serviceId: '', cron: '0 2 * * *',
    retention: { enabled: false, keepLast: 10, keepDays: 0 },
  })
  scheduleFormPreset.value = '0 2 * * *'
  scheduleFormShowAdvanced.value = false
  scheduleFormRetentionMode.value = 'off'
  showScheduleForm.value = true
}

function saveScheduleForm() {
  if (!scheduleForm.cron.trim()) return
  form.schedules.push({
    id: crypto.randomUUID(),
    name: scheduleForm.name.trim() || scheduleForm.cron,
    enabled: true,
    cron: scheduleForm.cron.trim(),
    serviceId: scheduleForm.serviceId || null,
    retention: scheduleForm.retention.enabled ? { ...scheduleForm.retention } : null,
  })
  showScheduleForm.value = false
}

function removeSchedule(id) {
  form.schedules = form.schedules.filter(s => s.id !== id)
}

function scheduledServiceName(serviceId) {
  return form.services.find(s => s.id === serviceId)?.name || 'Unknown service'
}

// ── Service CRUD ──────────────────────────────────────────────────────────────
function deriveServiceRetentionMode(retention) {
  if (!retention?.enabled) return 'off'
  if (retention.keepLast > 0 && retention.keepDays > 0) return 'both'
  if (retention.keepDays > 0) return 'age'
  if (retention.keepLast > 0) return 'count'
  return 'off'
}

function setServiceRetentionMode(mode) {
  serviceFormRetentionMode.value = mode
  if (mode === 'off') {
    serviceForm.retention.enabled = false
    serviceForm.retention.keepLast = 0
    serviceForm.retention.keepDays = 0
  } else {
    serviceForm.retention.enabled = true
    if (mode === 'count') {
      serviceForm.retention.keepDays = 0
      if (!serviceForm.retention.keepLast) serviceForm.retention.keepLast = 10
    } else if (mode === 'age') {
      serviceForm.retention.keepLast = 0
      if (!serviceForm.retention.keepDays) serviceForm.retention.keepDays = 30
    } else {
      if (!serviceForm.retention.keepLast) serviceForm.retention.keepLast = 10
      if (!serviceForm.retention.keepDays) serviceForm.retention.keepDays = 30
    }
  }
}

async function testServiceForm() {
  serviceFormTesting.value = true
  serviceFormTestResult.value = null
  try {
    serviceFormTestResult.value = await api.testConnectionPreview(serviceForm.url, serviceForm.apiKey, serviceForm.type)
  } catch (err) {
    serviceFormTestResult.value = { ok: false, error: err.message }
  } finally {
    serviceFormTesting.value = false
  }
}

function openAddService() {
  editingServiceId.value = null
  Object.assign(serviceForm, {
    name: '', type: 'radarr', url: '', apiKey: '',
    retention: { enabled: false, keepLast: 10, keepDays: 0 },
  })
  serviceFormRetentionMode.value = 'off'
  serviceFormTestResult.value = null
  showServiceForm.value = true
}

function openEditService(svc) {
  editingServiceId.value = svc.id
  Object.assign(serviceForm, {
    name: svc.name, type: svc.type, url: svc.url, apiKey: svc.apiKey,
    retention: { ...(svc.retention || { enabled: false, keepLast: 10, keepDays: 0 }) },
  })
  serviceFormRetentionMode.value = deriveServiceRetentionMode(svc.retention)
  serviceFormTestResult.value = null
  showServiceForm.value = true
}

function cancelServiceForm() {
  showServiceForm.value = false
  editingServiceId.value = null
}

function saveServiceForm() {
  if (!serviceForm.name.trim() || !serviceForm.url.trim()) return
  const svcData = {
    name: serviceForm.name,
    type: serviceForm.type,
    url: serviceForm.url,
    apiKey: serviceForm.apiKey,
    retention: { ...serviceForm.retention },
  }
  if (editingServiceId.value) {
    const idx = form.services.findIndex(s => s.id === editingServiceId.value)
    if (idx !== -1) form.services[idx] = { ...form.services[idx], ...svcData }
  } else {
    form.services.push({ id: crypto.randomUUID(), ...svcData })
  }
  showServiceForm.value = false
  editingServiceId.value = null
}

function removeService(id) {
  form.services = form.services.filter(s => s.id !== id)
}

// ── API ───────────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  try {
    const [s, status] = await Promise.all([api.getSettings(), api.auth.status()])
    form.services = s.services || []
    form.schedules = s.schedules || []
    Object.assign(form.storage.local, s.storage.local)
    Object.assign(form.storage.s3, s.storage.s3)
    form.storage.type = s.storage.type
    if (s.auth?.oidc) Object.assign(form.auth.oidc, s.auth.oidc)
    currentUsername.value = status.username || 'admin'
  } catch (err) {
    error.value = `Failed to load settings: ${err.message}`
  } finally {
    loading.value = false
    await nextTick()
    loaded.value = true
  }
}

watch(form, () => {
  if (!loaded.value) return
  clearTimeout(saveTimer)
  autoSaveStatus.value = null
  saveTimer = setTimeout(save, 800)
}, { deep: true })

async function testStorage() {
  testingStorage.value = true
  storageTestResult.value = null
  try {
    storageTestResult.value = await api.testStorage({
      type: form.storage.type,
      local: { ...form.storage.local },
      s3: { ...form.storage.s3 },
    })
  } catch (err) {
    storageTestResult.value = { ok: false, error: err.message }
  } finally {
    testingStorage.value = false
  }
}

async function testConnection(serviceId) {
  testing.value = serviceId
  testResultMap[serviceId] = null
  try {
    testResultMap[serviceId] = await api.testConnection(serviceId)
  } catch (err) {
    testResultMap[serviceId] = { ok: false, error: err.message }
  } finally {
    testing.value = false
  }
}

async function save() {
  saving.value = true
  autoSaveStatus.value = 'saving'
  error.value = ''
  try {
    await api.saveSettings({
      services:  form.services,
      schedules: form.schedules,
      storage:   { type: form.storage.type, local: { ...form.storage.local }, s3: { ...form.storage.s3 } },
      schedule:  { enabled: false, cron: '0 2 * * *' },
      retention: { enabled: false, keepLast: 0, keepDays: 0 },
      auth:      { oidc: { ...form.auth.oidc } },
    })
    emit('saved')
    autoSaveStatus.value = 'saved'
    setTimeout(() => { if (autoSaveStatus.value === 'saved') autoSaveStatus.value = null }, 2000)
  } catch (err) {
    error.value = `Failed to save: ${err.message}`
    autoSaveStatus.value = 'error'
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

async function changeUsername() {
  usernameResult.value = null
  if (!usernameForm.current || !usernameForm.newUsername.trim()) {
    usernameResult.value = { ok: false, error: 'All fields are required' }
    return
  }
  changingUsername.value = true
  try {
    await api.auth.changeUsername(usernameForm.current, usernameForm.newUsername.trim())
    currentUsername.value = usernameForm.newUsername.trim()
    Object.assign(usernameForm, { current: '', newUsername: '' })
    usernameResult.value = { ok: true }
  } catch (err) {
    usernameResult.value = { ok: false, error: err.message }
  } finally {
    changingUsername.value = false
  }
}

// Type badge colors (matching BackupList)
const TYPE_COLORS = {
  radarr:      'bg-blue-500/15 text-blue-300',
  sonarr:      'bg-teal-500/15 text-teal-300',
  prowlarr:    'bg-orange-500/15 text-orange-300',
  readarr:     'bg-green-500/15 text-green-300',
  lidarr:      'bg-pink-500/15 text-pink-300',
  whisparr:    'bg-purple-500/15 text-purple-300',
  bazarr:      'bg-yellow-500/15 text-yellow-300',
  seerr:       'bg-sky-500/15 text-sky-300',
  overseerr:   'bg-sky-500/15 text-sky-300',   // legacy
  jellyseerr:  'bg-sky-500/15 text-sky-300',   // legacy
  maintainerr: 'bg-indigo-500/15 text-indigo-300',
}

function typeBadge(type) {
  return TYPE_COLORS[type] || 'bg-zinc-500/15 text-zinc-400'
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
          <!-- Services -->
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors"
            :class="activeTab === 'services' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'"
            data-testid="tab-services"
            @click="activeTab = 'services'"
          >
            <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
            </svg>
            Services
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

          <!-- ── Services ───────────────────────────────────────────────────── -->
          <div v-if="activeTab === 'services'" class="p-6 space-y-4">

            <!-- Service list -->
            <div v-if="form.services.length" class="space-y-2">
              <div
                v-for="svc in form.services"
                :key="svc.id"
                class="flex items-center gap-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50 px-4 py-3"
              >
                <span
                  class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium capitalize shrink-0"
                  :class="typeBadge(svc.type)"
                >{{ svc.type }}</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-zinc-200 truncate">{{ svc.name }}</p>
                  <p class="text-xs text-zinc-500 truncate">{{ svc.url }}</p>
                  <div v-if="svc.retention?.enabled" class="mt-0.5">
                    <span class="text-xs text-zinc-600">
                      {{ svc.retention.keepLast > 0 && svc.retention.keepDays > 0 ? `keep ${svc.retention.keepLast} / ${svc.retention.keepDays}d` : svc.retention.keepLast > 0 ? `keep last ${svc.retention.keepLast}` : `keep ${svc.retention.keepDays}d` }}
                    </span>
                  </div>
                </div>

                <!-- Test result badge -->
                <span
                  v-if="testResultMap[svc.id]"
                  class="text-xs shrink-0"
                  :class="testResultMap[svc.id].ok ? 'text-violet-400' : 'text-red-400'"
                >
                  {{ testResultMap[svc.id].ok ? 'OK' : 'Error' }}
                </span>

                <!-- Action buttons -->
                <button
                  class="p-1.5 rounded-lg text-zinc-500 hover:text-violet-400 hover:bg-zinc-700 transition-colors shrink-0 disabled:opacity-40"
                  :disabled="testing === svc.id"
                  title="Test connection"
                  @click="testConnection(svc.id)"
                >
                  <svg
                    class="w-3.5 h-3.5"
                    :class="{ 'animate-spin': testing === svc.id }"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
                <button
                  class="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors shrink-0"
                  title="Edit service"
                  @click="openEditService(svc)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
                <button
                  class="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition-colors shrink-0"
                  title="Delete service"
                  @click="removeService(svc.id)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Empty services state -->
            <div v-else-if="!showServiceForm" class="rounded-xl bg-zinc-800/30 border border-zinc-700/30 px-4 py-6 text-center">
              <p class="text-sm text-zinc-500">No services configured yet.</p>
              <p class="text-xs text-zinc-600 mt-1">Add a Radarr, Sonarr, or other Servarr app below.</p>
            </div>

            <!-- Add service inline form -->
            <div v-if="showServiceForm" class="rounded-xl bg-zinc-800/50 border border-zinc-700/50 p-4 space-y-3">
              <p class="text-sm font-medium text-zinc-200">{{ editingServiceId ? 'Edit Service' : 'Add Service' }}</p>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-zinc-400 mb-1">Name</label>
                  <input
                    v-model="serviceForm.name"
                    type="text"
                    placeholder="My Radarr"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                    data-testid="service-form-name"
                  />
                </div>
                <div>
                  <label class="block text-xs text-zinc-400 mb-1">Type</label>
                  <select
                    v-model="serviceForm.type"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors capitalize"
                    data-testid="service-form-type"
                  >
                    <option v-for="t in SERVICE_TYPES" :key="t" :value="t" class="capitalize">{{ t.charAt(0).toUpperCase() + t.slice(1) }}</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-xs text-zinc-400 mb-1">URL</label>
                <input
                  v-model="serviceForm.url"
                  type="url"
                  placeholder="http://radarr:7878"
                  class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                  data-testid="service-form-url"
                />
              </div>

              <div>
                <label class="block text-xs text-zinc-400 mb-1">API Key</label>
                <input
                  v-model="serviceForm.apiKey"
                  type="password"
                  placeholder="Leave blank to keep existing"
                  class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                  data-testid="service-form-apikey"
                />
              </div>

              <!-- Retention -->
              <div class="border-t border-zinc-700/50 pt-3 space-y-2">
                <label class="block text-xs text-zinc-400">Retention</label>
                <div class="flex rounded-lg overflow-hidden border border-zinc-700">
                  <button
                    v-for="mode in ['off', 'count', 'age', 'both']"
                    :key="mode"
                    type="button"
                    class="flex-1 py-1.5 text-xs font-medium transition-colors"
                    :class="serviceFormRetentionMode === mode ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'"
                    @click="setServiceRetentionMode(mode)"
                  >{{ { off: 'Off', count: 'Last N', age: 'N days', both: 'Both' }[mode] }}</button>
                </div>
                <div v-if="serviceFormRetentionMode === 'count'" class="flex items-center gap-2">
                  <span class="text-xs text-zinc-400">Keep last</span>
                  <input v-model.number="serviceForm.retention.keepLast" type="number" min="1"
                    class="w-16 rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors" />
                  <span class="text-xs text-zinc-400">backups</span>
                </div>
                <div v-else-if="serviceFormRetentionMode === 'age'" class="flex items-center gap-2">
                  <span class="text-xs text-zinc-400">Keep last</span>
                  <input v-model.number="serviceForm.retention.keepDays" type="number" min="1"
                    class="w-16 rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors" />
                  <span class="text-xs text-zinc-400">days</span>
                </div>
                <div v-else-if="serviceFormRetentionMode === 'both'" class="space-y-1.5">
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-zinc-400 w-20 shrink-0">Keep last</span>
                    <input v-model.number="serviceForm.retention.keepLast" type="number" min="1"
                      class="w-16 rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors" />
                    <span class="text-xs text-zinc-400">backups</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-zinc-400 w-20 shrink-0">…or last</span>
                    <input v-model.number="serviceForm.retention.keepDays" type="number" min="1"
                      class="w-16 rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors" />
                    <span class="text-xs text-zinc-400">days</span>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  class="rounded-lg py-2 px-3 text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                  @click="cancelServiceForm"
                >Cancel</button>

                <!-- Test button + inline result -->
                <button
                  type="button"
                  class="flex items-center gap-1.5 rounded-lg py-2 px-3 text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors disabled:opacity-40"
                  :disabled="!serviceForm.url.trim() || serviceFormTesting"
                  data-testid="service-form-test"
                  @click="testServiceForm"
                >
                  <svg
                    class="w-3.5 h-3.5 shrink-0"
                    :class="{ 'animate-spin': serviceFormTesting }"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Test
                </button>
                <span
                  v-if="serviceFormTestResult"
                  class="flex items-center gap-1 text-xs shrink-0"
                  :class="serviceFormTestResult.ok ? 'text-green-400' : 'text-red-400'"
                >
                  <svg v-if="serviceFormTestResult.ok" class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <svg v-else class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {{ serviceFormTestResult.ok ? 'Connected' : (serviceFormTestResult.error || 'Failed') }}
                </span>

                <button
                  type="button"
                  class="ml-auto rounded-lg py-2 px-4 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-40"
                  :disabled="!serviceForm.name.trim() || !serviceForm.url.trim()"
                  data-testid="service-form-save"
                  @click="saveServiceForm"
                >{{ editingServiceId ? 'Update' : 'Add' }}</button>
              </div>
            </div>

            <!-- Add Service button -->
            <button
              v-if="!showServiceForm"
              class="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 transition-colors"
              data-testid="add-service-button"
              @click="openAddService"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Service
            </button>
          </div>

          <!-- ── Storage ────────────────────────────────────────────────────── -->
          <div v-if="activeTab === 'storage'" class="p-6 space-y-5">
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
              <p class="text-sm text-zinc-500">Backups are kept only inside each arr app. Enable local or S3 storage to maintain an external copy.</p>
            </div>

            <!-- Local -->
            <div v-if="form.storage.type === 'local'" class="space-y-3">
              <div>
                <label class="block text-sm text-zinc-300 mb-1.5">Directory path</label>
                <input
                  v-model="form.storage.local.path"
                  type="text"
                  placeholder="/data/backups"
                  class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                  data-testid="settings-local-path"
                />
                <p class="text-xs text-zinc-600 mt-1">Backups are organized as <code class="text-zinc-500">path/type/name/backup.zip</code></p>
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
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                    data-testid="settings-s3-endpoint"
                  />
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Bucket</label>
                  <input v-model="form.storage.s3.bucket" type="text" placeholder="backups"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                    data-testid="settings-s3-bucket" />
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Region</label>
                  <input v-model="form.storage.s3.region" type="text" placeholder="us-east-1"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                    data-testid="settings-s3-region" />
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Prefix</label>
                  <input v-model="form.storage.s3.prefix" type="text" placeholder="arr/"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                    data-testid="settings-s3-prefix" />
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Access Key ID</label>
                  <input v-model="form.storage.s3.accessKeyId" type="text"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                    data-testid="settings-s3-access-key" />
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Secret Access Key</label>
                  <input v-model="form.storage.s3.secretAccessKey" type="password"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                    data-testid="settings-s3-secret" />
                </div>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="form.storage.s3.forcePathStyle" type="checkbox"
                  class="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-violet-500 focus:ring-0"
                  data-testid="settings-s3-path-style" />
                <span class="text-sm text-zinc-300">Force path-style <span class="text-zinc-600">(required for MinIO)</span></span>
              </label>
            </div>

            <!-- Storage test -->
            <div v-if="form.storage.type !== 'none'" class="pt-1 border-t border-zinc-800 flex items-center gap-3">
              <button
                class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors disabled:opacity-50"
                :disabled="testingStorage"
                @click="testStorage"
              >
                <svg class="w-3.5 h-3.5" :class="{ 'animate-spin': testingStorage }" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {{ testingStorage ? 'Testing…' : 'Test Storage' }}
              </button>
              <span
                v-if="storageTestResult"
                class="flex items-center gap-1.5 text-sm"
                :class="storageTestResult.ok ? 'text-violet-400' : 'text-red-400'"
              >
                <svg v-if="storageTestResult.ok" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <svg v-else class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                {{ storageTestResult.ok ? 'Connected' : (storageTestResult.error || 'Failed') }}
              </span>
            </div>
          </div>

          <!-- ── Automation ──────────────────────────────────────────────────── -->
          <div v-if="activeTab === 'automation'" class="p-6 space-y-4">
            <p class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Schedules</p>

            <!-- Schedule list -->
            <div v-if="form.schedules.length" class="space-y-2">
              <div
                v-for="sched in form.schedules"
                :key="sched.id"
                class="flex items-center gap-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50 px-4 py-3"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-zinc-200 truncate">{{ sched.name }}</p>
                  <p class="text-xs text-zinc-500 mt-0.5 font-mono">
                    {{ sched.serviceId ? scheduledServiceName(sched.serviceId) : 'All services' }}
                    <span class="text-zinc-700 mx-1">·</span>
                    {{ sched.cron }}
                  </p>
                </div>
                <!-- Enable toggle -->
                <button
                  class="relative w-8 h-4 rounded-full transition-colors shrink-0"
                  :class="sched.enabled ? 'bg-violet-600' : 'bg-zinc-700'"
                  @click="sched.enabled = !sched.enabled"
                >
                  <span class="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform" :class="sched.enabled ? 'translate-x-4' : 'translate-x-0'"></span>
                </button>
                <!-- Delete -->
                <button
                  class="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-700 transition-colors shrink-0"
                  title="Remove schedule"
                  @click="removeSchedule(sched.id)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Empty state -->
            <div v-else-if="!showScheduleForm" class="rounded-xl bg-zinc-800/30 border border-zinc-700/30 px-4 py-6 text-center">
              <p class="text-sm text-zinc-500">No schedules yet.</p>
              <p class="text-xs text-zinc-600 mt-1">Add a schedule to automatically back up services.</p>
            </div>

            <!-- Add schedule inline form -->
            <div v-if="showScheduleForm" class="rounded-xl bg-zinc-800/50 border border-zinc-700/50 p-4 space-y-3">
              <p class="text-sm font-medium text-zinc-200">New Schedule</p>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-zinc-400 mb-1">Name</label>
                  <input
                    v-model="scheduleForm.name"
                    type="text"
                    placeholder="Daily backup"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                </div>
                <div>
                  <label class="block text-xs text-zinc-400 mb-1">Target</label>
                  <select
                    v-model="scheduleForm.serviceId"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors"
                  >
                    <option value="">All services</option>
                    <option v-for="svc in form.services" :key="svc.id" :value="svc.id">{{ svc.name }}</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-xs text-zinc-400 mb-1">Schedule</label>
                <div class="flex flex-wrap gap-1.5 mb-2">
                  <button
                    v-for="p in PRESETS"
                    :key="p.cron"
                    type="button"
                    class="rounded px-2 py-1 text-xs font-medium transition-colors"
                    :class="scheduleFormActivePreset === p.cron ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'"
                    @click="scheduleFormPreset = p.cron"
                  >{{ p.label }}</button>
                </div>
                <input
                  v-model="scheduleForm.cron"
                  type="text"
                  placeholder="0 2 * * *"
                  class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                  @input="scheduleFormPreset = 'custom'"
                />
                <p class="text-xs text-zinc-600 mt-1">minute · hour · day · month · weekday</p>
              </div>

              <!-- Advanced settings -->
              <div class="border-t border-zinc-700/50 pt-3">
                <button
                  type="button"
                  class="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  @click="scheduleFormShowAdvanced = !scheduleFormShowAdvanced"
                >
                  <svg class="w-3 h-3 transition-transform shrink-0" :class="scheduleFormShowAdvanced ? 'rotate-90' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  Advanced settings
                </button>

                <div v-if="scheduleFormShowAdvanced" class="mt-3 space-y-2">
                  <div>
                    <label class="block text-xs text-zinc-400 mb-0.5">Retention</label>
                    <p class="text-xs text-zinc-600 mb-2">Overrides per-service retention for backups triggered by this schedule.</p>
                  </div>
                  <div class="flex rounded-lg overflow-hidden border border-zinc-700">
                    <button
                      v-for="mode in ['off', 'count', 'age', 'both']"
                      :key="mode"
                      type="button"
                      class="flex-1 py-1.5 text-xs font-medium transition-colors"
                      :class="scheduleFormRetentionMode === mode ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'"
                      @click="setScheduleRetentionMode(mode)"
                    >{{ { off: 'Off', count: 'Last N', age: 'N days', both: 'Both' }[mode] }}</button>
                  </div>
                  <div v-if="scheduleFormRetentionMode === 'count'" class="flex items-center gap-2">
                    <span class="text-xs text-zinc-400">Keep last</span>
                    <input v-model.number="scheduleForm.retention.keepLast" type="number" min="1"
                      class="w-16 rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors" />
                    <span class="text-xs text-zinc-400">backups</span>
                  </div>
                  <div v-else-if="scheduleFormRetentionMode === 'age'" class="flex items-center gap-2">
                    <span class="text-xs text-zinc-400">Keep last</span>
                    <input v-model.number="scheduleForm.retention.keepDays" type="number" min="1"
                      class="w-16 rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors" />
                    <span class="text-xs text-zinc-400">days</span>
                  </div>
                  <div v-else-if="scheduleFormRetentionMode === 'both'" class="space-y-1.5">
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-zinc-400 w-20 shrink-0">Keep last</span>
                      <input v-model.number="scheduleForm.retention.keepLast" type="number" min="1"
                        class="w-16 rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors" />
                      <span class="text-xs text-zinc-400">backups</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-zinc-400 w-20 shrink-0">…or last</span>
                      <input v-model.number="scheduleForm.retention.keepDays" type="number" min="1"
                        class="w-16 rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors" />
                      <span class="text-xs text-zinc-400">days</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex gap-2 pt-1">
                <button
                  type="button"
                  class="flex-1 rounded-lg py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                  @click="showScheduleForm = false"
                >Cancel</button>
                <button
                  type="button"
                  class="flex-1 rounded-lg py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-40"
                  :disabled="!scheduleForm.cron.trim()"
                  @click="saveScheduleForm"
                >Add</button>
              </div>
            </div>

            <!-- Add Schedule button -->
            <button
              v-if="!showScheduleForm"
              class="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 transition-colors"
              @click="openAddSchedule"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Schedule
            </button>
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
                  :class="form.auth.oidc.enabled ? 'bg-violet-600' : 'bg-zinc-700'"
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
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                    data-testid="oidc-issuer"
                  />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-sm text-zinc-300 mb-1.5">Client ID</label>
                    <input v-model="form.auth.oidc.clientId" type="text"
                      class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                      data-testid="oidc-client-id" />
                  </div>
                  <div>
                    <label class="block text-sm text-zinc-300 mb-1.5">Client Secret</label>
                    <input v-model="form.auth.oidc.clientSecret" type="password"
                      placeholder="Leave blank to keep existing"
                      class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                      data-testid="oidc-client-secret" />
                  </div>
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Redirect URI</label>
                  <input v-model="form.auth.oidc.redirectUri" type="url"
                    placeholder="https://your-domain/api/auth/oidc/callback"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                    data-testid="oidc-redirect-uri" />
                </div>
                <div>
                  <label class="block text-sm text-zinc-300 mb-1.5">Scopes</label>
                  <input v-model="form.auth.oidc.scopes" type="text"
                    placeholder="openid profile email"
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                    data-testid="oidc-scopes" />
                </div>
              </div>
            </div>

            <template v-if="!form.auth.oidc.enabled">
            <div class="border-t border-zinc-800"></div>

            <!-- Change username -->
            <div class="space-y-4">
              <div>
                <p class="text-sm font-medium text-zinc-200">Change username</p>
                <p class="text-xs text-zinc-600 mt-0.5">
                  Currently signed in as <span class="text-zinc-400 font-mono">{{ currentUsername }}</span>
                </p>
              </div>

              <div class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-sm text-zinc-300 mb-1.5">New username</label>
                    <input
                      v-model="usernameForm.newUsername"
                      type="text"
                      class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label class="block text-sm text-zinc-300 mb-1.5">Current password</label>
                    <input
                      v-model="usernameForm.current"
                      type="password"
                      placeholder="Confirm with password"
                      class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                    />
                  </div>
                </div>

                <div class="flex items-center justify-between">
                  <span
                    v-if="usernameResult"
                    class="flex items-center gap-1.5 text-sm"
                    :class="usernameResult.ok ? 'text-violet-400' : 'text-red-400'"
                  >
                    <svg v-if="usernameResult.ok" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {{ usernameResult.ok ? 'Username updated' : usernameResult.error }}
                  </span>
                  <span v-else></span>

                  <button
                    class="rounded-lg px-4 py-2 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors disabled:opacity-50"
                    :disabled="changingUsername"
                    @click="changeUsername"
                  >{{ changingUsername ? 'Updating…' : 'Update Username' }}</button>
                </div>
              </div>
            </div>

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
                    class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                    data-testid="change-password-current"
                  />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-sm text-zinc-300 mb-1.5">New password</label>
                    <input v-model="passwordForm.next" type="password"
                      class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                      data-testid="change-password-new" />
                  </div>
                  <div>
                    <label class="block text-sm text-zinc-300 mb-1.5">Confirm new</label>
                    <input v-model="passwordForm.confirm" type="password"
                      class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                      data-testid="change-password-confirm" />
                  </div>
                </div>

                <div class="flex items-center justify-between">
                  <span
                    v-if="passwordResult"
                    class="flex items-center gap-1.5 text-sm"
                    :class="passwordResult.ok ? 'text-violet-400' : 'text-red-400'"
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
      <div class="flex-none px-5 py-4 border-t border-zinc-800 flex items-center justify-between">
        <span class="flex items-center gap-1.5 text-xs">
          <template v-if="autoSaveStatus === 'saving'">
            <svg class="w-3.5 h-3.5 animate-spin text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span class="text-zinc-500">Saving…</span>
          </template>
          <template v-else-if="autoSaveStatus === 'saved'">
            <svg class="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span class="text-violet-400">Saved</span>
          </template>
        </span>
        <button
          class="rounded-xl px-5 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors"
          @click="emit('close')"
        >Close</button>
      </div>

    </div><!-- end modal shell -->
  </div>
</template>
