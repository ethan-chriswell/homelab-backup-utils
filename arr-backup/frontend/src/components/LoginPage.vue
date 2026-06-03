<script setup>
import { ref } from 'vue'
import { api } from '../api.js'
import LogoIcon from './LogoIcon.vue'

const props = defineProps({
  bootstrapped: Boolean,
  oidcEnabled: Boolean,
  error: { type: String, default: '' },
})

const emit = defineEmits(['authenticated'])

const password = ref('')
const confirm = ref('')
const errorMsg = ref(props.error)
const loading = ref(false)

async function submit() {
  errorMsg.value = ''
  if (!password.value) {
    errorMsg.value = 'Password is required'
    return
  }
  if (!props.bootstrapped && password.value !== confirm.value) {
    errorMsg.value = 'Passwords do not match'
    return
  }
  loading.value = true
  try {
    if (!props.bootstrapped) {
      await api.auth.bootstrap(password.value)
    } else {
      await api.auth.login(password.value)
    }
    emit('authenticated')
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    loading.value = false
  }
}

function loginWithOidc() {
  window.location.href = '/api/auth/oidc/login'
}
</script>

<template>
  <div class="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
    <div class="w-full max-w-sm">
      <!-- Logo -->
      <div class="text-center mb-8">
        <LogoIcon :size="52" class="mx-auto" />
        <h1 class="text-lg font-semibold text-zinc-100 mt-4">Arr Backup</h1>
        <p class="text-sm text-zinc-500 mt-1">
          {{ bootstrapped ? 'Sign in to continue' : 'Create your admin password to get started' }}
        </p>
      </div>

      <!-- Card -->
      <div class="rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-6 space-y-4">
        <h2 class="text-sm font-semibold text-zinc-300">
          {{ bootstrapped ? 'Sign in' : 'Set up admin password' }}
        </h2>

        <div class="space-y-3">
          <div>
            <label class="block text-sm text-zinc-400 mb-1.5">Password</label>
            <input
              v-model="password"
              type="password"
              placeholder="Enter password"
              class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
              data-testid="login-password"
              @keydown.enter="submit"
            />
          </div>

          <div v-if="!bootstrapped">
            <label class="block text-sm text-zinc-400 mb-1.5">Confirm Password</label>
            <input
              v-model="confirm"
              type="password"
              placeholder="Confirm password"
              class="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
              data-testid="login-confirm"
              @keydown.enter="submit"
            />
            <p class="text-xs text-zinc-600 mt-1">Minimum 8 characters</p>
          </div>
        </div>

        <!-- Error -->
        <div v-if="errorMsg" class="rounded-lg bg-red-900/30 border border-red-800/50 px-3 py-2">
          <p class="text-sm text-red-300" data-testid="login-error">{{ errorMsg }}</p>
        </div>

        <!-- Submit -->
        <button
          class="w-full rounded-xl py-2.5 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
          :disabled="loading"
          data-testid="login-submit"
          @click="submit"
        >
          {{ loading ? 'Please wait…' : (bootstrapped ? 'Sign in' : 'Create password & sign in') }}
        </button>

        <!-- OIDC divider + button -->
        <template v-if="oidcEnabled">
          <div class="flex items-center gap-3">
            <div class="flex-1 h-px bg-zinc-800"></div>
            <span class="text-xs text-zinc-600">or</span>
            <div class="flex-1 h-px bg-zinc-800"></div>
          </div>

          <button
            class="w-full rounded-xl py-2.5 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 border border-zinc-700 transition-colors"
            data-testid="oidc-login-button"
            @click="loginWithOidc"
          >
            Sign in with SSO
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
