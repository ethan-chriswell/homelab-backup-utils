<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from './api.js'
import ServiceCard from './components/ServiceCard.vue'
import BackupList from './components/BackupList.vue'
import UploadModal from './components/UploadModal.vue'
import SettingsModal from './components/SettingsModal.vue'
import LoginPage from './components/LoginPage.vue'
import LogoIcon from './components/LogoIcon.vue'
import Toast from './components/Toast.vue'

// ── Auth state ────────────────────────────────────────────────────────────────
const authLoading = ref(true)
const authenticated = ref(false)
const bootstrapped = ref(false)
const oidcEnabled = ref(false)
const oidcError = ref('')

async function checkAuth() {
  try {
    const status = await api.auth.status()
    authenticated.value = status.authenticated
    bootstrapped.value = status.bootstrapped
    oidcEnabled.value = status.oidcEnabled
  } catch {
    authenticated.value = false
  } finally {
    authLoading.value = false
  }
}

function onAuthenticated() {
  authenticated.value = true
  Promise.all([fetchSchedule(), fetchBackups()])
  startStatusPolling()
}

async function logout() {
  try {
    await api.auth.logout()
  } catch { /* ignore */ }
  clearInterval(statusInterval)
  statusInterval = null
  serviceStatuses.value = []
  authenticated.value = false
  bootstrapped.value = true
  backups.value = []
}

// ── Service status ────────────────────────────────────────────────────────────
const serviceStatuses = ref([]) // [{ id, name, ok }]
let statusInterval = null

async function checkStatus() {
  try {
    const { services } = await api.getStatus()
    serviceStatuses.value = services || []
  } catch {
    serviceStatuses.value = []
  }
}

function startStatusPolling() {
  checkStatus()
  statusInterval = setInterval(checkStatus, 30_000)
}

// ── App state ─────────────────────────────────────────────────────────────────
const backups = ref([])
const loading = ref(true)
const backing = ref(false)           // backing all services
const backingServiceId = ref(null)   // backing a single service
const deleting = ref(null)           // "serviceId:id" key
const uploading = ref(false)
const showUpload = ref(false)
const showSettings = ref(false)
const toast = ref(null)
const services = ref([])
const schedules = ref([])

// ── Drill-down navigation ─────────────────────────────────────────────────────
const selectedService = ref(null)    // null = overview grid, else service object

function selectService(id) {
  selectedService.value = services.value.find(s => s.id === id) ?? null
}

// Backups for the currently selected service (detail view)
const serviceBackups = computed(() =>
  selectedService.value
    ? backups.value.filter(b => b.serviceId === selectedService.value.id)
    : []
)

const serviceValidBackups = computed(() => serviceBackups.value.filter(b => !b.error))

// ── Stats helpers ─────────────────────────────────────────────────────────────
function fmtSize(bs) {
  const bytes = bs.reduce((s, b) => s + (typeof b.size === 'number' ? b.size : 0), 0)
  if (bytes === 0) return '—'
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576)    return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function relTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function latestBackup(bs) {
  return bs.filter(b => b.time || b.date)
    .sort((a, b) => new Date(b.time || b.date) - new Date(a.time || a.date))[0] ?? null
}

const TYPE_COLORS = {
  radarr: 'bg-blue-500/15 text-blue-300', sonarr: 'bg-teal-500/15 text-teal-300',
  prowlarr: 'bg-orange-500/15 text-orange-300', readarr: 'bg-green-500/15 text-green-300',
  lidarr: 'bg-pink-500/15 text-pink-300', whisparr: 'bg-purple-500/15 text-purple-300',
  bazarr: 'bg-yellow-500/15 text-yellow-300', seerr: 'bg-sky-500/15 text-sky-300',
  overseerr: 'bg-sky-500/15 text-sky-300', jellyseerr: 'bg-sky-500/15 text-sky-300', // legacy
  maintainerr: 'bg-indigo-500/15 text-indigo-300',
}
const typeBadge = (t) => TYPE_COLORS[t] || 'bg-zinc-500/15 text-zinc-400'

// ── Data fetching ─────────────────────────────────────────────────────────────
async function fetchBackups() {
  try {
    backups.value = await api.listBackups()
  } catch (err) {
    toast.value?.add(`Failed to load backups: ${err.message}`, 'error')
  } finally {
    loading.value = false
  }
}

async function fetchSchedule() {
  try {
    const s = await api.getSettings()
    services.value = s.services || []
    schedules.value = s.schedules || []
  } catch {
    // non-critical
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function triggerAllBackups() {
  backing.value = true
  try {
    const result = await api.createAllBackups()
    const failed = (result.results || []).filter(r => !r.ok)
    if (failed.length) {
      toast.value?.add(`Backup completed with ${failed.length} error(s)`, 'error')
    } else {
      toast.value?.add('All backups created successfully')
    }
    await fetchBackups()
  } catch (err) {
    toast.value?.add(`Backup failed: ${err.message}`, 'error')
  } finally {
    backing.value = false
  }
}

async function triggerServiceBackup(serviceId) {
  backingServiceId.value = serviceId
  try {
    await api.createBackup(serviceId)
    toast.value?.add('Backup created')
    await fetchBackups()
  } catch (err) {
    toast.value?.add(`Backup failed: ${err.message}`, 'error')
  } finally {
    backingServiceId.value = null
  }
}

function downloadBackup(serviceId, id, name) {
  api.downloadBackup(serviceId, id, name)
}

async function deleteBackup(serviceId, id) {
  const key = `${serviceId}:${id}`
  deleting.value = key
  try {
    await api.deleteBackup(serviceId, id)
    backups.value = backups.value.filter(b => !(b.serviceId === serviceId && b.id === id))
    toast.value?.add('Backup deleted')
  } catch (err) {
    toast.value?.add(`Delete failed: ${err.message}`, 'error')
  } finally {
    deleting.value = null
  }
}

async function restoreBackup(serviceId, id) {
  try {
    await api.restoreBackup(serviceId, id)
    toast.value?.add(`Restore initiated — service will restart`)
  } catch (err) {
    toast.value?.add(`Restore failed: ${err.message}`, 'error')
  }
}

async function handleUpload(serviceId, file) {
  showUpload.value = false
  uploading.value = true
  try {
    await api.uploadBackup(serviceId, file)
    toast.value?.add('Backup uploaded and restore initiated')
    await fetchBackups()
  } catch (err) {
    toast.value?.add(`Upload failed: ${err.message}`, 'error')
  } finally {
    uploading.value = false
  }
}

async function onSettingsSaved() {
  toast.value?.add('Settings saved')
  await Promise.all([fetchSchedule(), fetchBackups()])
  if (selectedService.value) {
    selectedService.value = services.value.find(s => s.id === selectedService.value.id) ?? null
  }
  checkStatus()
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onUnmounted(() => {
  clearInterval(statusInterval)
})

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  if (params.has('auth_error')) {
    oidcError.value = params.get('auth_error')
    window.history.replaceState({}, '', '/')
  }

  await checkAuth()
  if (authenticated.value) {
    await Promise.all([fetchSchedule(), fetchBackups()])
    startStatusPolling()
  }
})
</script>

<template>
  <!-- Auth loading -->
  <div v-if="authLoading" class="min-h-screen bg-zinc-950 flex items-center justify-center">
    <svg class="w-6 h-6 animate-spin text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  </div>

  <!-- Login / bootstrap page -->
  <LoginPage
    v-else-if="!authenticated"
    :bootstrapped="bootstrapped"
    :oidc-enabled="oidcEnabled"
    :error="oidcError"
    @authenticated="onAuthenticated"
  />

  <!-- Main app -->
  <div v-else class="min-h-screen bg-zinc-950">
    <!-- Top accent bar -->
    <div class="h-0.5 bg-gradient-to-r from-violet-600 via-violet-400 to-purple-400"></div>

    <!-- Header -->
    <header class="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3 flex-wrap">
        <LogoIcon :size="34" />
        <h1 class="text-base font-semibold text-zinc-100 leading-none">Arr Backup</h1>

      </div>

      <div class="flex items-center gap-2">
        <!-- Settings -->
        <button
          class="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Settings"
          data-testid="settings-button"
          @click="showSettings = true"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <button
          class="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors"
          data-testid="upload-button"
          @click="showUpload = true"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          Upload
        </button>

        <button
          class="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="backing || !services.length"
          data-testid="backup-now-button"
          @click="triggerAllBackups"
        >
          <svg
            class="w-4 h-4"
            :class="{ 'animate-spin': backing }"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
          >
            <path v-if="backing" stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            <path v-else stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          {{ backing ? 'Creating…' : 'Backup All' }}
        </button>

        <!-- Logout -->
        <button
          class="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
          title="Sign out"
          data-testid="logout-button"
          @click="logout"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Main content -->
    <main class="max-w-5xl mx-auto px-6 py-8">

      <!-- ── Overview: service grid ── -->
      <template v-if="!selectedService">

        <!-- Empty: no services configured -->
        <div v-if="!loading && !services.length" class="rounded-2xl bg-zinc-900 border border-zinc-800 px-6 py-16 text-center">
          <svg class="w-10 h-10 mx-auto mb-3 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
          </svg>
          <p class="text-sm text-zinc-500">No services configured yet.</p>
          <p class="text-xs text-zinc-600 mt-1">
            <button class="text-violet-400 hover:text-violet-300 underline hover:no-underline" @click="showSettings = true">Open Settings</button>
            to add your arr apps.
          </p>
        </div>

        <!-- Service cards grid -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <!-- Skeletons while loading and service list not yet available -->
          <template v-if="loading && !services.length">
            <div v-for="i in 3" :key="i" class="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-4 animate-pulse">
              <div class="flex items-center gap-2">
                <div class="h-5 w-14 bg-zinc-800 rounded"></div>
                <div class="h-5 w-24 bg-zinc-800 rounded"></div>
              </div>
              <div class="space-y-1.5">
                <div class="h-5 w-20 bg-zinc-800 rounded"></div>
                <div class="h-3.5 w-32 bg-zinc-800 rounded"></div>
              </div>
              <div class="h-px bg-zinc-800"></div>
              <div class="flex justify-between items-center">
                <div class="h-3.5 w-20 bg-zinc-800 rounded"></div>
                <div class="h-7 w-16 bg-zinc-800 rounded-lg"></div>
              </div>
            </div>
          </template>

          <ServiceCard
            v-for="svc in services"
            :key="svc.id"
            :service="svc"
            :backups="backups.filter(b => b.serviceId === svc.id)"
            :schedules="schedules"
            :status="serviceStatuses.find(s => s.id === svc.id) ?? null"
            :loading="loading"
            :backing="backingServiceId === svc.id"
            @select="selectService"
            @backup="triggerServiceBackup"
          />
        </div>
      </template>

      <!-- ── Detail: single service ── -->
      <template v-else>

        <!-- Sub-header -->
        <div class="flex items-center gap-3 mb-6 flex-wrap">
          <!-- Back button -->
          <button
            class="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            @click="selectedService = null"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Services
          </button>

          <span class="text-zinc-700">/</span>

          <!-- Service identity -->
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium capitalize shrink-0" :class="typeBadge(selectedService.type)">
              {{ selectedService.type }}
            </span>
            <h2 class="text-base font-semibold text-zinc-100 truncate">{{ selectedService.name }}</h2>
            <!-- status -->
            <div class="flex items-center gap-1 shrink-0">
              <span class="w-1.5 h-1.5 rounded-full"
                :class="serviceStatuses.find(s => s.id === selectedService.id)?.ok ? 'bg-green-400 animate-pulse' : 'bg-red-400'"></span>
              <span class="text-xs hidden sm:block"
                :class="serviceStatuses.find(s => s.id === selectedService.id)?.ok ? 'text-green-400' : 'text-red-400'">
                {{ serviceStatuses.find(s => s.id === selectedService.id)?.ok ? 'Online' : 'Offline' }}
              </span>
            </div>
          </div>

          <!-- Detail actions -->
          <div class="flex items-center gap-2 ml-auto">
            <button
              class="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors"
              @click="showUpload = true"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Upload
            </button>
            <button
              class="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="backingServiceId === selectedService.id"
              @click="triggerServiceBackup(selectedService.id)"
            >
              <svg class="w-4 h-4" :class="{ 'animate-spin': backingServiceId === selectedService.id }" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              {{ backingServiceId === selectedService.id ? 'Creating…' : 'Backup Now' }}
            </button>
          </div>
        </div>

        <!-- Stat strip -->
        <div class="grid grid-cols-3 gap-4 mb-6">
          <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
            <p class="text-xs font-medium text-zinc-500 mb-2">Last Backup</p>
            <div v-if="loading" class="h-6 w-20 bg-zinc-800 rounded animate-pulse"></div>
            <template v-else>
              <p class="text-lg font-semibold text-zinc-100">
                {{ latestBackup(serviceValidBackups) ? relTime(latestBackup(serviceValidBackups).time || latestBackup(serviceValidBackups).date) : '—' }}
              </p>
            </template>
          </div>
          <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
            <p class="text-xs font-medium text-zinc-500 mb-2">Backups</p>
            <div v-if="loading" class="h-6 w-10 bg-zinc-800 rounded animate-pulse"></div>
            <p v-else class="text-lg font-semibold text-zinc-100">{{ serviceValidBackups.length }}</p>
          </div>
          <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
            <p class="text-xs font-medium text-zinc-500 mb-2">Total Size</p>
            <div v-if="loading" class="h-6 w-16 bg-zinc-800 rounded animate-pulse"></div>
            <p v-else class="text-lg font-semibold text-zinc-100">{{ fmtSize(serviceValidBackups) }}</p>
          </div>
        </div>

        <!-- Schedule/retention info bar (if configured per-service) -->
        <div v-if="selectedService.schedule?.enabled || selectedService.retention?.enabled" class="flex items-center gap-4 mb-4 px-1 flex-wrap">
          <div v-if="selectedService.schedule?.enabled" class="flex items-center gap-1.5 text-xs text-zinc-500">
            <svg class="w-3.5 h-3.5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {{ selectedService.schedule.cron }}
          </div>
          <div v-if="selectedService.retention?.enabled" class="flex items-center gap-1.5 text-xs text-zinc-500">
            <svg class="w-3.5 h-3.5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Keep
            <template v-if="selectedService.retention.keepLast > 0">last {{ selectedService.retention.keepLast }}</template>
            <template v-if="selectedService.retention.keepLast > 0 && selectedService.retention.keepDays > 0"> / </template>
            <template v-if="selectedService.retention.keepDays > 0">{{ selectedService.retention.keepDays }} days</template>
          </div>
        </div>

        <BackupList
          :backups="serviceBackups"
          :loading="loading"
          :deleting="deleting"
          :detail="true"
          @download="downloadBackup"
          @delete="deleteBackup"
          @restore="restoreBackup"
        />
      </template>

    </main>

    <UploadModal
      v-if="showUpload"
      :services="services"
      @upload="handleUpload"
      @close="showUpload = false"
    />
    <SettingsModal v-if="showSettings" @saved="onSettingsSaved" @close="showSettings = false" />
    <Toast ref="toast" />
  </div>
</template>
