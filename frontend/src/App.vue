<template>
  <router-view />
  <span class="global-version">v{{ appVersion }}</span>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { applyTheme, applyThemeFromConfig } from './composables/useTheme'
import { usePluginMessageBridge } from './composables/usePluginMessageBridge'
import {
  invalidateAuthSession,
  useAuthSession,
} from './composables/useAuthSession'
import { setLanguage } from './i18n'
import { removeAllTokens, removeToken, setToken } from './utils/token'

const router = useRouter()
const { fetchSession, hasAdminAccess, isAuthenticated } = useAuthSession()
const appVersion = __APP_VERSION__
let sessionRevision = 0

async function revalidateCurrentRoute(): Promise<void> {
  const expectedRevision = ++sessionRevision

  try {
    await fetchSession(true)
  } catch {
    if (expectedRevision !== sessionRevision) return
    await router.replace({
      name: 'NotAllowed',
      query: { reason: 'session' },
    })
    return
  }

  if (
    expectedRevision === sessionRevision &&
    router.currentRoute.value.name === 'NotAllowed' &&
    hasAdminAccess.value
  ) {
    await router.replace({ name: 'WhiteLabelWorkspace' })
    return
  }

  if (
    expectedRevision === sessionRevision &&
    router.currentRoute.value.meta.requiresAdmin &&
    !hasAdminAccess.value
  ) {
    await router.replace({
      name: 'NotAllowed',
      query: { reason: isAuthenticated.value ? 'role' : 'session' },
    })
  }
}

usePluginMessageBridge({
  onInit: ({ token, config }) => {
    if (token) {
      setToken(token)
    } else {
      removeToken()
    }
    invalidateAuthSession()
    applyThemeFromConfig(config)
    void revalidateCurrentRoute()
  },
  onTokenUpdate: (token) => {
    if (token) {
      setToken(token)
    } else {
      removeToken()
    }
    invalidateAuthSession()
    void revalidateCurrentRoute()
  },
  onThemeChange: applyTheme,
  onLanguageChange: setLanguage,
  onDestroy: () => {
    sessionRevision += 1
    removeAllTokens()
    invalidateAuthSession()
    void router.replace({
      name: 'NotAllowed',
      query: { reason: 'session' },
    })
  },
})
</script>
