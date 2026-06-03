<script setup>
import { computed } from 'vue'

const props = defineProps({
  backups: { type: Array, default: () => [] },
  loading: Boolean,
  schedule: { type: Object, default: () => ({ enabled: false, cron: '' }) },
})

const latest = computed(() => {
  const valid = props.backups.filter(b => !b.error && (b.time || b.date))
  if (!valid.length) return null
  return valid.slice().sort((a, b) => new Date(b.time || b.date) - new Date(a.time || a.date))[0]
})

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function scheduleLabel(cron) {
  const map = {
    '0 2 * * *': 'Daily at 2am',
    '0 0 * * *': 'Daily at midnight',
    '0 2 * * 0': 'Weekly (Sun 2am)',
    '0 2 1 * *': 'Monthly (1st)',
  }
  return map[cron] || cron
}
</script>

<template>
  <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-6" data-testid="status-card">
    <div class="flex items-center gap-3 mb-4">
      <div class="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
        <svg class="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <span class="text-sm font-medium text-zinc-400">Last Backup</span>
    </div>

    <div v-if="loading" class="animate-pulse">
      <div class="h-7 w-24 bg-zinc-800 rounded mb-2"></div>
      <div class="h-4 w-40 bg-zinc-800 rounded"></div>
    </div>
    <div v-else-if="latest" data-testid="last-backup-time">
      <p class="text-2xl font-semibold text-zinc-100">{{ relativeTime(latest.time || latest.date) }}</p>
      <p class="text-sm text-zinc-500 mt-1">{{ formatDate(latest.time || latest.date) }}</p>
    </div>
    <div v-else data-testid="no-backup-yet">
      <p class="text-2xl font-semibold text-zinc-500">Never</p>
      <p class="text-sm text-zinc-600 mt-1">No backups found</p>
    </div>

    <div v-if="schedule?.enabled" class="mt-4 pt-4 border-t border-zinc-800" data-testid="schedule-display">
      <p class="text-xs text-zinc-500">
        <span class="text-zinc-400">Scheduled:</span> {{ scheduleLabel(schedule.cron) }}
      </p>
    </div>
  </div>
</template>
