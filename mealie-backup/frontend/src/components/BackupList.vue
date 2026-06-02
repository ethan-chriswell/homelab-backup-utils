<script setup>
defineProps({
  backups: { type: Array, default: () => [] },
  loading: Boolean,
  deleting: { type: String, default: null },
})
const emit = defineEmits(['download', 'delete', 'restore'])

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatSize(size) {
  // Mealie returns size as a pre-formatted string e.g. "1.84 MB"
  return size || '—'
}
</script>

<template>
  <div class="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden" data-testid="backup-list">
    <div class="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-zinc-300">Backups</h2>
      <span class="text-xs text-zinc-600">{{ backups.length }} total</span>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="divide-y divide-zinc-800">
      <div v-for="i in 3" :key="i" class="px-6 py-4 animate-pulse flex items-center gap-4">
        <div class="flex-1">
          <div class="h-4 w-56 bg-zinc-800 rounded mb-2"></div>
          <div class="h-3 w-32 bg-zinc-800 rounded"></div>
        </div>
        <div class="h-4 w-12 bg-zinc-800 rounded"></div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!backups.length" class="px-6 py-16 text-center" data-testid="empty-state">
      <svg class="w-10 h-10 mx-auto mb-3 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
      <p class="text-sm text-zinc-500">No backups yet</p>
      <p class="text-xs text-zinc-700 mt-1">Click "Backup Now" to create your first backup</p>
    </div>

    <!-- Backup rows -->
    <div v-else class="divide-y divide-zinc-800/60">
      <div
        v-for="backup in backups"
        :key="backup.name"
        class="px-6 py-4 flex items-center gap-4 hover:bg-zinc-800/40 transition-colors"
        :data-testid="`backup-row-${backup.name}`"
      >
        <div class="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
          <svg class="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-zinc-200 truncate" :data-testid="`backup-name-${backup.name}`">{{ backup.name }}</p>
          <p class="text-xs text-zinc-500 mt-0.5">{{ formatDate(backup.date) }}</p>
        </div>

        <span class="text-xs text-zinc-600 font-mono shrink-0 hidden sm:block">{{ formatSize(backup.size) }}</span>

        <div class="flex items-center gap-0.5 shrink-0">
          <button
            class="p-1.5 rounded-lg text-zinc-600 hover:text-cyan-400 hover:bg-zinc-800 transition-colors"
            title="Download"
            :data-testid="`download-${backup.name}`"
            @click="emit('download', backup.name)"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </button>
          <button
            class="p-1.5 rounded-lg text-zinc-600 hover:text-amber-400 hover:bg-zinc-800 transition-colors"
            title="Restore"
            :data-testid="`restore-${backup.name}`"
            @click="emit('restore', backup.name)"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
          <button
            class="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors disabled:opacity-40"
            title="Delete"
            :disabled="deleting === backup.name"
            :data-testid="`delete-${backup.name}`"
            @click="emit('delete', backup.name)"
          >
            <svg v-if="deleting === backup.name" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
