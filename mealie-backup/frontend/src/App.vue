<script setup>
import { ref, onMounted } from 'vue'
import { api } from './api.js'
import StatusCard from './components/StatusCard.vue'
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
  Promise.all([fetchConfig(), fetchSchedule(), fetchBackups()])
}

async function logout() {
  try {
    await api.auth.logout()
  } catch { /* ignore */ }
  authenticated.value = false
  bootstrapped.value = true
  backups.value = []
}

// ── App state ─────────────────────────────────────────────────────────────────
const backups = ref([])
const loading = ref(true)
const backing = ref(false)
const deleting = ref(null)
const uploading = ref(false)
const showUpload = ref(false)
const showSettings = ref(false)
const configured = ref(true)
const schedule = ref({ enabled: false, cron: '' })
const toast = ref(null)

async function fetchBackups() {
  try {
    backups.value = await api.listBackups()
  } catch (err) {
    toast.value?.add(`Failed to load backups: ${err.message}`, 'error')
  } finally {
    loading.value = false
  }
}

async function fetchConfig() {
  try {
    const cfg = await api.getConfig()
    configured.value = cfg.configured
  } catch {
    configured.value = false
  }
}

async function fetchSchedule() {
  try {
    const s = await api.getSettings()
    schedule.value = s.schedule
  } catch {
    // non-critical
  }
}

async function triggerBackup() {
  backing.value = true
  try {
    await api.createBackup()
    toast.value?.add('Backup created successfully')
    await fetchBackups()
  } catch (err) {
    toast.value?.add(`Backup failed: ${err.message}`, 'error')
  } finally {
    backing.value = false
  }
}

function downloadBackup(name) {
  api.downloadBackup(name)
}

async function deleteBackup(name) {
  deleting.value = name
  try {
    await api.deleteBackup(name)
    backups.value = backups.value.filter(b => b.name !== name)
    toast.value?.add('Backup deleted')
  } catch (err) {
    toast.value?.add(`Delete failed: ${err.message}`, 'error')
  } finally {
    deleting.value = null
  }
}

async function restoreBackup(name) {
  try {
    await api.restoreBackup(name)
    toast.value?.add(`Restore from ${name} started`)
  } catch (err) {
    toast.value?.add(`Restore failed: ${err.message}`, 'error')
  }
}

async function handleUpload(file) {
  showUpload.value = false
  uploading.value = true
  try {
    await api.uploadBackup(file)
    toast.value?.add('Backup uploaded successfully')
    await fetchBackups()
  } catch (err) {
    toast.value?.add(`Upload failed: ${err.message}`, 'error')
  } finally {
    uploading.value = false
  }
}

async function onSettingsSaved() {
  toast.value?.add('Settings saved')
  await Promise.all([fetchConfig(), fetchSchedule(), fetchBackups()])
}

function parseSizeBytes(size) {
  if (!size) return 0
  const n = parseFloat(size)
  if (isNaN(n)) return 0
  const s = size.toUpperCase()
  if (s.includes('GB')) return n * 1024 * 1024 * 1024
  if (s.includes('MB')) return n * 1024 * 1024
  if (s.includes('KB') || s.includes('KB')) return n * 1024
  return n
}

function totalSize(backups) {
  const bytes = backups.reduce((sum, b) => sum + parseSizeBytes(b.size), 0)
  if (bytes === 0) return '—'
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

onMounted(async () => {
  // Check for OIDC error passed back via URL query param
  const params = new URLSearchParams(window.location.search)
  if (params.has('auth_error')) {
    oidcError.value = params.get('auth_error')
    window.history.replaceState({}, '', '/')
  }

  await checkAuth()
  if (authenticated.value) {
    await Promise.all([fetchConfig(), fetchSchedule(), fetchBackups()])
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
    <!-- Header -->
    <header class="border-b border-zinc-900 px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <LogoIcon :size="34" />
        <div>
          <h1 class="text-base font-semibold text-zinc-100 leading-none">Mealie Backup</h1>
          <p class="text-xs text-zinc-600 mt-0.5">Backup manager</p>
        </div>
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
          class="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="backing || !configured"
          data-testid="backup-now-button"
          @click="triggerBackup"
        >
          <svg
            class="w-4 h-4"
            :class="{ 'animate-spin': backing }"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
          >
            <path v-if="backing" stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            <path v-else stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
          {{ backing ? 'Creating…' : 'Backup Now' }}
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

    <!-- Setup banner -->
    <div
      v-if="!configured"
      class="mx-6 mt-4 rounded-xl bg-amber-900/30 border border-amber-800/50 px-4 py-3 flex items-center gap-3"
      data-testid="setup-banner"
    >
      <svg class="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <p class="text-sm text-amber-300">
        Mealie connection not configured.
        <button class="underline hover:no-underline" @click="showSettings = true">Open Settings</button>
        to get started.
      </p>
    </div>

    <!-- Main content -->
    <main class="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatusCard :backups="backups" :loading="loading" :schedule="schedule" />

        <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <svg class="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25-2.25M12 15.375v-8.25" />
              </svg>
            </div>
            <span class="text-sm font-medium text-zinc-400">Total Backups</span>
          </div>
          <p class="text-2xl font-semibold text-zinc-100" data-testid="total-count">{{ loading ? '—' : backups.length }}</p>
        </div>

        <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <svg class="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            </div>
            <span class="text-sm font-medium text-zinc-400">Total Size</span>
          </div>
          <p class="text-2xl font-semibold text-zinc-100" data-testid="total-size">
            <span v-if="loading">—</span>
            <span v-else-if="backups.length">{{ totalSize(backups) }}</span>
            <span v-else>0 MB</span>
          </p>
        </div>
      </div>

      <BackupList
        :backups="backups"
        :loading="loading"
        :deleting="deleting"
        @download="downloadBackup"
        @delete="deleteBackup"
        @restore="restoreBackup"
      />
    </main>

    <UploadModal v-if="showUpload" @upload="handleUpload" @close="showUpload = false" />
    <SettingsModal v-if="showSettings" @saved="onSettingsSaved" @close="showSettings = false" />
    <Toast ref="toast" />
  </div>
</template>
