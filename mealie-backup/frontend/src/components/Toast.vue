<script setup>
import { ref } from 'vue'

const toasts = ref([])
let nextId = 0

function add(message, type = 'success') {
  const id = ++nextId
  toasts.value.push({ id, message, type })
  setTimeout(() => remove(id), 4000)
}

function remove(id) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

defineExpose({ add })
</script>

<template>
  <div class="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
    <Transition
      v-for="toast in toasts"
      :key="toast.id"
      name="toast"
    >
      <div
        class="pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 shadow-2xl text-sm font-medium max-w-sm"
        :class="toast.type === 'error'
          ? 'bg-red-900/90 text-red-100 border border-red-700'
          : 'bg-zinc-800 text-zinc-100 border border-zinc-700'"
        :data-testid="`toast-${toast.type}`"
      >
        <span class="mt-0.5 shrink-0">
          <svg v-if="toast.type === 'success'" class="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <svg v-else class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
        <span>{{ toast.message }}</span>
        <button class="ml-auto -mr-1 p-0.5 rounded opacity-60 hover:opacity-100" @click="remove(toast.id)">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-enter-active { transition: all 0.2s ease-out; }
.toast-leave-active { transition: all 0.15s ease-in; }
.toast-enter-from { opacity: 0; transform: translateY(8px); }
.toast-leave-to { opacity: 0; transform: translateY(8px); }
</style>
