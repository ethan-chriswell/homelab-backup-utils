<script setup>
import { computed } from 'vue'

const props = defineProps({
  service:   { type: Object, required: true },
  backups:   { type: Array,  default: () => [] },
  schedules: { type: Array,  default: () => [] }, // schedules targeting this service or all
  status:    { type: Object, default: null },
  loading:   Boolean,
  backing:   Boolean,
})
const emit = defineEmits(['select', 'backup'])

const validBackups = computed(() => props.backups.filter(b => !b.error))
const fetchError   = computed(() => props.backups.find(b => b.error)?.error ?? null)

const latest = computed(() => {
  const sorted = validBackups.value
    .filter(b => b.time || b.date)
    .sort((a, b) => new Date(b.time || b.date) - new Date(a.time || a.date))
  return sorted[0] ?? null
})

const totalBytes = computed(() =>
  validBackups.value.reduce((s, b) => s + (typeof b.size === 'number' ? b.size : 0), 0)
)

function fmtSize(bytes) {
  if (!bytes) return null
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

const activeSchedules = computed(() =>
  props.schedules.filter(s => s.enabled && (!s.serviceId || s.serviceId === props.service.id))
)

function scheduleLabel(cron) {
  return ({ '0 2 * * *': 'Daily 2am', '0 0 * * *': 'Daily midnight', '0 2 * * 0': 'Weekly', '0 2 1 * *': 'Monthly' })[cron] || cron
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
</script>

<template>
  <div
    class="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 flex flex-col gap-4 cursor-pointer hover:border-zinc-700 hover:bg-zinc-800/40 transition-all"
    @click="emit('select', service.id)"
  >
    <!-- Service name + status -->
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0">
        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium capitalize shrink-0" :class="typeBadge(service.type)">
          {{ service.type }}
        </span>
        <p class="text-sm font-semibold text-zinc-100 truncate">{{ service.name }}</p>
      </div>
      <div class="flex items-center gap-1.5 shrink-0 pt-0.5">
        <span class="w-1.5 h-1.5 rounded-full shrink-0"
          :class="status === null ? 'bg-zinc-600' : status.ok ? 'bg-green-400 animate-pulse' : 'bg-red-400'"></span>
        <span class="text-xs"
          :class="status === null ? 'text-zinc-600' : status.ok ? 'text-green-400' : 'text-red-400'">
          {{ status === null ? '—' : status.ok ? 'Online' : 'Offline' }}
        </span>
      </div>
    </div>

    <!-- Backup stats -->
    <div class="flex-1 min-h-[2.5rem]">
      <div v-if="loading" class="space-y-1.5 animate-pulse">
        <div class="h-5 w-20 bg-zinc-800 rounded"></div>
        <div class="h-3.5 w-32 bg-zinc-800 rounded"></div>
      </div>
      <div v-else-if="fetchError">
        <p class="text-xs text-red-400 truncate">{{ fetchError }}</p>
      </div>
      <div v-else>
        <p class="text-sm font-medium text-zinc-200">
          {{ latest ? relTime(latest.time || latest.date) : 'No backups' }}
        </p>
        <p class="text-xs text-zinc-500 mt-0.5">
          {{ validBackups.length }} backup{{ validBackups.length !== 1 ? 's' : '' }}
          <span v-if="fmtSize(totalBytes)"> · {{ fmtSize(totalBytes) }}</span>
        </p>
      </div>
    </div>

    <!-- Footer: schedule + backup button -->
    <div class="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/60">
      <span class="text-xs text-zinc-700 truncate">
        <template v-if="activeSchedules.length === 1">{{ scheduleLabel(activeSchedules[0].cron) }}</template>
        <template v-else-if="activeSchedules.length > 1">{{ activeSchedules.length }} schedules</template>
        <template v-else>No schedule</template>
      </span>
      <button
        class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-violet-600 text-zinc-400 hover:text-white transition-colors disabled:opacity-40 shrink-0"
        :disabled="backing"
        title="Backup this service now"
        @click.stop="emit('backup', service.id)"
      >
        <svg class="w-3 h-3 shrink-0" :class="{ 'animate-spin': backing }" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
        Backup
      </button>
    </div>
  </div>
</template>
