<script setup>
import { ref } from 'vue'

const emit = defineEmits(['upload', 'close'])

const file = ref(null)
const dragging = ref(false)
const fileInput = ref(null)

function onDrop(e) {
  dragging.value = false
  const dropped = e.dataTransfer?.files?.[0]
  if (dropped?.name.endsWith('.zip')) file.value = dropped
}

function onFileChange(e) {
  file.value = e.target.files?.[0] || null
}

function submit() {
  if (file.value) emit('upload', file.value)
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <div
    class="fixed inset-0 z-40 flex items-center justify-center p-4"
    data-testid="upload-modal"
    @click.self="emit('close')"
  >
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')"></div>

    <div class="relative w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-semibold text-zinc-100">Upload Backup</h2>
        <button
          class="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          data-testid="modal-close"
          @click="emit('close')"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div
        class="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
        :class="dragging
          ? 'border-cyan-500 bg-cyan-500/5'
          : 'border-zinc-700 hover:border-zinc-600'"
        data-testid="drop-zone"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
        @click="fileInput.click()"
      >
        <svg class="w-10 h-10 mx-auto mb-3 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p class="text-sm text-zinc-400">
          <span class="font-medium text-zinc-200">Click to select</span> or drag &amp; drop
        </p>
        <p class="text-xs text-zinc-600 mt-1">ZIP files only</p>
        <input
          ref="fileInput"
          type="file"
          accept=".zip"
          class="hidden"
          data-testid="file-input"
          @change="onFileChange"
        />
      </div>

      <div v-if="file" class="mt-4 flex items-center gap-3 bg-zinc-800 rounded-lg px-4 py-3" data-testid="selected-file">
        <svg class="w-4 h-4 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4" />
        </svg>
        <div class="min-w-0 flex-1">
          <p class="text-sm text-zinc-200 truncate">{{ file.name }}</p>
          <p class="text-xs text-zinc-500">{{ formatSize(file.size) }}</p>
        </div>
        <button class="text-zinc-500 hover:text-zinc-300" @click="file = null">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="flex gap-3 mt-6">
        <button
          class="flex-1 rounded-xl py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          class="flex-1 rounded-xl py-2.5 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!file"
          data-testid="upload-submit"
          @click="submit"
        >
          Upload &amp; Restore
        </button>
      </div>
    </div>
  </div>
</template>
